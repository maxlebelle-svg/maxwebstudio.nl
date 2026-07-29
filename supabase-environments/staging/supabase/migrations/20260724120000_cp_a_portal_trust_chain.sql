-- CP-A: immutable customer decisions and their bounded audit trail.
-- Forward-only. Existing preview and quote records remain untouched.

create table public.website_preview_approvals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  website_id uuid references public.websites(id) on delete restrict,
  preview_version_id uuid not null references public.website_preview_versions(id) on delete restrict,
  preview_version_number integer not null check (preview_version_number > 0),
  preview_checksum text not null check (preview_checksum ~ '^[0-9a-f]{64}$'),
  approved_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  approved_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default clock_timestamp(),
  approval_status text not null default 'active' check (approval_status in ('active', 'superseded', 'revoked')),
  approval_statement_version text not null,
  approval_statement_snapshot text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  superseded_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint website_preview_approvals_version_once unique (customer_id, preview_version_id),
  constraint website_preview_approvals_request_once unique (customer_id, idempotency_key),
  constraint website_preview_approvals_lifecycle_check check (
    (approval_status = 'active' and superseded_at is null and revoked_at is null)
    or (approval_status = 'superseded' and superseded_at is not null and revoked_at is null)
    or (approval_status = 'revoked' and revoked_at is not null)
  )
);

create unique index website_preview_approvals_one_active_project
  on public.website_preview_approvals(customer_id, project_id)
  where approval_status = 'active';
create index website_preview_approvals_customer_created
  on public.website_preview_approvals(customer_id, created_at desc);

create table public.quote_acceptances (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  accepted_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  accepted_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  quote_version integer not null check (quote_version > 0),
  quote_checksum text not null check (quote_checksum ~ '^[0-9a-f]{64}$'),
  subtotal numeric(12,2) not null,
  vat numeric(12,2) not null,
  total numeric(12,2) not null,
  currency text not null default 'EUR' check (currency = 'EUR'),
  accepted_at timestamptz not null default clock_timestamp(),
  acceptance_statement_version text not null,
  acceptance_statement_snapshot text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  quote_snapshot jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint quote_acceptances_quote_once unique (quote_id),
  constraint quote_acceptances_request_once unique (customer_id, idempotency_key)
);

create index quote_acceptances_customer_created
  on public.quote_acceptances(customer_id, created_at desc);

create table public.customer_portal_trust_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('website_preview_approved', 'quote_accepted')),
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  entity_type text not null check (entity_type in ('website_preview_version', 'quote')),
  entity_id uuid not null,
  entity_version integer not null check (entity_version > 0),
  entity_checksum text not null check (entity_checksum ~ '^[0-9a-f]{64}$'),
  result text not null default 'accepted' check (result = 'accepted'),
  idempotency_key text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  constraint customer_portal_trust_events_once unique (event_type, entity_type, entity_id)
);

create index customer_portal_trust_events_customer_created
  on public.customer_portal_trust_events(customer_id, created_at desc);

alter table public.quotes
  add column quote_version integer not null default 1 check (quote_version > 0);

create function public.cp_a_immutable_decision_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'customer decision records are append-only' using errcode = '55000';
  end if;
  if tg_table_name = 'website_preview_approvals'
     and (to_jsonb(new) - array['approval_status','superseded_at','revoked_at'])
         is distinct from (to_jsonb(old) - array['approval_status','superseded_at','revoked_at']) then
    raise exception 'website preview approval identity is immutable' using errcode = '55000';
  end if;
  if tg_table_name <> 'website_preview_approvals' then
    raise exception 'customer decision records are immutable' using errcode = '55000';
  end if;
  return new;
end;
$function$;

create trigger website_preview_approvals_immutable
before update or delete on public.website_preview_approvals
for each row execute function public.cp_a_immutable_decision_guard();
create trigger quote_acceptances_immutable
before update or delete on public.quote_acceptances
for each row execute function public.cp_a_immutable_decision_guard();
create trigger customer_portal_trust_events_immutable
before update or delete on public.customer_portal_trust_events
for each row execute function public.cp_a_immutable_decision_guard();

create function public.cp_a_quote_checksum(input_quote_id uuid)
returns text
language sql
stable
set search_path = pg_catalog, public
as $function$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'quoteId', q.id,
    'customerId', q.customer_id,
    'websiteId', q.website_id,
    'projectId', q.project_id,
    'quoteNumber', q.quote_number,
    'version', q.quote_version,
    'title', q.title,
    'type', q.type,
    'quoteDate', q.quote_date,
    'validUntil', q.valid_until,
    'subtotal', q.subtotal,
    'vat', q.vat,
    'total', q.total,
    'proposal', q.proposal,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'description', l.description,
        'quantity', l.quantity,
        'unitPrice', l.unit_price,
        'vatRate', l.vat_rate,
        'lineTotal', l.line_total,
        'position', l.position
      ) order by l.position, l.id)
      from public.quote_lines l
      where l.quote_id = q.id and l.deleted_at is null
    ), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from public.quotes q
  where q.id = input_quote_id;
$function$;

create function public.cp_a_bump_quote_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if exists (select 1 from public.quote_acceptances a where a.quote_id = old.id) then
    if (old.status = 'accepted' and (
      new.status is distinct from old.status
      or new.accepted_at is distinct from old.accepted_at
      or new.metadata->>'trustAcceptanceId' is distinct from old.metadata->>'trustAcceptanceId'
    )) or (old.status <> 'accepted' and (
      new.status <> 'accepted' or new.accepted_at is null
    )) then
      raise exception 'accepted quote status is immutable' using errcode = '55000';
    end if;
  end if;
  if exists (select 1 from public.quote_acceptances a where a.quote_id = old.id) and (
    new.customer_id is distinct from old.customer_id
    or new.website_id is distinct from old.website_id
    or new.project_id is distinct from old.project_id
    or new.quote_number is distinct from old.quote_number
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.quote_date is distinct from old.quote_date
    or new.valid_until is distinct from old.valid_until
    or new.subtotal is distinct from old.subtotal
    or new.vat is distinct from old.vat
    or new.total is distinct from old.total
    or new.proposal is distinct from old.proposal
  ) then
    raise exception 'accepted quote content is immutable' using errcode = '55000';
  end if;
  if new.quote_version is distinct from old.quote_version
     and new.quote_version <> old.quote_version + 1 then
    raise exception 'quote version is managed by the database' using errcode = '55000';
  end if;
  if new.customer_id is distinct from old.customer_id
     or new.website_id is distinct from old.website_id
     or new.project_id is distinct from old.project_id
     or new.quote_number is distinct from old.quote_number
     or new.type is distinct from old.type
     or new.title is distinct from old.title
     or new.quote_date is distinct from old.quote_date
     or new.valid_until is distinct from old.valid_until
     or new.subtotal is distinct from old.subtotal
     or new.vat is distinct from old.vat
     or new.total is distinct from old.total
     or new.proposal is distinct from old.proposal then
    if new.quote_version = old.quote_version then
      new.quote_version := old.quote_version + 1;
    end if;
  end if;
  return new;
end;
$function$;

create trigger quotes_cp_a_version_guard
before update on public.quotes
for each row execute function public.cp_a_bump_quote_version();

create function public.cp_a_guard_quote_line()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  old_quote_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old.quote_id else null end;
  new_quote_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new.quote_id else null end;
begin
  if exists (
    select 1 from public.quote_acceptances a
    where a.quote_id = old_quote_id or a.quote_id = new_quote_id
  ) then
    raise exception 'accepted quote lines are immutable' using errcode = '55000';
  end if;
  update public.quotes
  set quote_version = quote_version + 1
  where id = new_quote_id or (old_quote_id is distinct from new_quote_id and id = old_quote_id);
  return null;
end;
$function$;

create trigger quote_lines_cp_a_version_guard
after insert or update or delete on public.quote_lines
for each row execute function public.cp_a_guard_quote_line();

create function public.record_website_preview_approval(
  input_preview_version_id uuid,
  input_customer_id uuid,
  input_auth_user_id uuid,
  input_expected_checksum text,
  input_idempotency_key text,
  input_statement_version text,
  input_statement_snapshot text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  preview_record public.website_preview_versions%rowtype;
  customer_record public.customers%rowtype;
  approval_record public.website_preview_approvals%rowtype;
begin
  if input_statement_version <> 'website_preview_approval_nl_v1'
     or nullif(btrim(input_statement_snapshot), '') is null
     or char_length(input_statement_snapshot) > 2000
     or char_length(input_idempotency_key) not between 16 and 160 then
    raise exception 'invalid approval contract' using errcode = '22023';
  end if;

  select * into customer_record from public.customers where id = input_customer_id for share;
  if not found or customer_record.profile_id is null
     or not (customer_record.auth_user_id = input_auth_user_id or exists (
       select 1 from public.profiles p
       where p.id = customer_record.profile_id and p.auth_user_id = input_auth_user_id and p.status = 'active'
     )) then
    raise exception 'customer authorization mismatch' using errcode = '42501';
  end if;

  select * into preview_record
  from public.website_preview_versions
  where id = input_preview_version_id
  for update;
  if not found or preview_record.customer_id is distinct from input_customer_id
     or preview_record.project_id is null
     or preview_record.published_to_portal is distinct from true
     or preview_record.is_active is distinct from true
     or preview_record.allow_approval is distinct from true
     or preview_record.status not in ('ready_for_review', 'feedback_received', 'approved')
     or preview_record.package_checksum !~ '^[0-9a-f]{64}$'
     or preview_record.generated_package is null then
    raise exception 'preview version is not approvable' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.projects p
    where p.id = preview_record.project_id and p.customer_id = input_customer_id and p.archived_at is null
  ) or (preview_record.website_id is not null and not exists (
    select 1 from public.websites w where w.id = preview_record.website_id and w.customer_id = input_customer_id and w.archived_at is null
  )) then
    raise exception 'preview relationship mismatch' using errcode = '23514';
  end if;
  if preview_record.package_checksum is distinct from lower(input_expected_checksum) then
    raise exception 'preview checksum conflict' using errcode = '40001';
  end if;

  select * into approval_record
  from public.website_preview_approvals
  where customer_id = input_customer_id and preview_version_id = input_preview_version_id;
  if found then
    return jsonb_build_object('duplicate', true, 'approval', to_jsonb(approval_record));
  end if;

  update public.website_preview_approvals
  set approval_status = 'superseded', superseded_at = clock_timestamp()
  where customer_id = input_customer_id
    and project_id = preview_record.project_id
    and approval_status = 'active';

  insert into public.website_preview_approvals (
    customer_id, project_id, website_id, preview_version_id, preview_version_number,
    preview_checksum, approved_by_profile_id, approved_by_auth_user_id,
    approval_statement_version, approval_statement_snapshot, idempotency_key
  ) values (
    input_customer_id, preview_record.project_id, preview_record.website_id,
    preview_record.id, preview_record.version, preview_record.package_checksum,
    customer_record.profile_id, input_auth_user_id,
    input_statement_version, input_statement_snapshot, input_idempotency_key
  ) returning * into approval_record;

  insert into public.customer_portal_trust_events (
    event_type, customer_id, project_id, actor_profile_id, actor_auth_user_id,
    entity_type, entity_id, entity_version, entity_checksum, idempotency_key, safe_metadata
  ) values (
    'website_preview_approved', input_customer_id, preview_record.project_id,
    customer_record.profile_id, input_auth_user_id, 'website_preview_version',
    preview_record.id, preview_record.version, preview_record.package_checksum,
    input_idempotency_key, jsonb_build_object('websiteId', preview_record.website_id)
  );

  return jsonb_build_object('duplicate', false, 'approval', to_jsonb(approval_record));
end;
$function$;

create function public.record_quote_acceptance(
  input_quote_id uuid,
  input_customer_id uuid,
  input_auth_user_id uuid,
  input_expected_version integer,
  input_expected_checksum text,
  input_idempotency_key text,
  input_statement_version text,
  input_statement_snapshot text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  quote_record public.quotes%rowtype;
  customer_record public.customers%rowtype;
  acceptance_record public.quote_acceptances%rowtype;
  current_checksum text;
  current_snapshot jsonb;
begin
  if input_statement_version <> 'quote_acceptance_nl_v1'
     or nullif(btrim(input_statement_snapshot), '') is null
     or char_length(input_statement_snapshot) > 2000
     or char_length(input_idempotency_key) not between 16 and 160 then
    raise exception 'invalid quote acceptance contract' using errcode = '22023';
  end if;

  select * into customer_record from public.customers where id = input_customer_id for share;
  if not found or customer_record.profile_id is null
     or not (customer_record.auth_user_id = input_auth_user_id or exists (
       select 1 from public.profiles p
       where p.id = customer_record.profile_id and p.auth_user_id = input_auth_user_id and p.status = 'active'
     )) then
    raise exception 'customer authorization mismatch' using errcode = '42501';
  end if;

  select * into quote_record from public.quotes where id = input_quote_id for update;
  if not found or quote_record.customer_id is distinct from input_customer_id then
    raise exception 'quote is not accessible' using errcode = '42501';
  end if;

  current_checksum := public.cp_a_quote_checksum(quote_record.id);
  if quote_record.quote_version is distinct from input_expected_version
     or current_checksum is distinct from lower(input_expected_checksum) then
    raise exception 'quote version conflict' using errcode = '40001';
  end if;

  select * into acceptance_record from public.quote_acceptances where quote_id = quote_record.id;
  if found then
    return jsonb_build_object('duplicate', true, 'acceptance', to_jsonb(acceptance_record));
  end if;

  if quote_record.status <> 'sent'
     or quote_record.valid_until is null or quote_record.valid_until < current_date
     or quote_record.archived_at is not null or quote_record.deleted_at is not null
     or coalesce(
       quote_record.metadata->>'replacedByQuoteId', quote_record.metadata->>'supersededByQuoteId',
       quote_record.metadata->>'replaced_by_quote_id', quote_record.metadata->>'superseded_by_quote_id', ''
     ) <> '' then
    raise exception 'quote is not acceptable' using errcode = '23514';
  end if;
  if quote_record.project_id is not null and not exists (
    select 1 from public.projects p where p.id = quote_record.project_id and p.customer_id = input_customer_id and p.archived_at is null
  ) then
    raise exception 'quote project relationship mismatch' using errcode = '23514';
  end if;

  current_snapshot := jsonb_build_object(
    'quoteId', quote_record.id, 'quoteNumber', quote_record.quote_number,
    'version', quote_record.quote_version, 'checksum', current_checksum,
    'subtotal', quote_record.subtotal, 'vat', quote_record.vat,
    'total', quote_record.total, 'currency', 'EUR',
    'validUntil', quote_record.valid_until
  );
  insert into public.quote_acceptances (
    quote_id, customer_id, project_id, accepted_by_profile_id, accepted_by_auth_user_id,
    quote_version, quote_checksum, subtotal, vat, total, currency,
    acceptance_statement_version, acceptance_statement_snapshot,
    idempotency_key, quote_snapshot
  ) values (
    quote_record.id, input_customer_id, quote_record.project_id,
    customer_record.profile_id, input_auth_user_id, quote_record.quote_version,
    current_checksum, quote_record.subtotal, quote_record.vat, quote_record.total, 'EUR',
    input_statement_version, input_statement_snapshot, input_idempotency_key, current_snapshot
  ) returning * into acceptance_record;

  update public.quotes
  set status = 'accepted', accepted_at = acceptance_record.accepted_at,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('trustAcceptanceId', acceptance_record.id),
      updated_at = clock_timestamp()
  where id = quote_record.id;

  insert into public.customer_portal_trust_events (
    event_type, customer_id, project_id, actor_profile_id, actor_auth_user_id,
    entity_type, entity_id, entity_version, entity_checksum, idempotency_key, safe_metadata
  ) values (
    'quote_accepted', input_customer_id, quote_record.project_id,
    customer_record.profile_id, input_auth_user_id, 'quote', quote_record.id,
    quote_record.quote_version, current_checksum, input_idempotency_key,
    jsonb_build_object('quoteNumber', quote_record.quote_number, 'currency', 'EUR')
  );

  return jsonb_build_object('duplicate', false, 'acceptance', to_jsonb(acceptance_record));
end;
$function$;

alter table public.website_preview_approvals enable row level security;
alter table public.quote_acceptances enable row level security;
alter table public.customer_portal_trust_events enable row level security;

create policy website_preview_approvals_owner_read
  on public.website_preview_approvals for select to authenticated
  using (public.owns_customer(customer_id));
create policy quote_acceptances_owner_read
  on public.quote_acceptances for select to authenticated
  using (public.owns_customer(customer_id));
create policy customer_portal_trust_events_owner_read
  on public.customer_portal_trust_events for select to authenticated
  using (public.owns_customer(customer_id));

revoke all on public.website_preview_approvals from anon, authenticated;
revoke all on public.quote_acceptances from anon, authenticated;
revoke all on public.customer_portal_trust_events from anon, authenticated;
grant select on public.website_preview_approvals to authenticated;
grant select on public.quote_acceptances to authenticated;
grant select on public.customer_portal_trust_events to authenticated;

revoke all on function public.cp_a_quote_checksum(uuid) from public, anon, authenticated;
revoke all on function public.record_website_preview_approval(uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.record_quote_acceptance(uuid,uuid,uuid,integer,text,text,text,text) from public, anon, authenticated;
grant execute on function public.cp_a_quote_checksum(uuid) to service_role;
grant execute on function public.record_website_preview_approval(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.record_quote_acceptance(uuid,uuid,uuid,integer,text,text,text,text) to service_role;

grant select on public.website_preview_approvals to service_role;
grant select on public.quote_acceptances to service_role;
grant select on public.customer_portal_trust_events to service_role;
