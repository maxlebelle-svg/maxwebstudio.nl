-- DCA-0B/C: staging parity and token-safe invitation foundation.
-- Forward-only, idempotent and data preserving. This migration sends nothing.

begin;

create extension if not exists pgcrypto;

do $bootstrap$
begin
  if pg_catalog.to_regprocedure('extensions.digest(text,text)') is not null
     and pg_catalog.to_regprocedure('extensions.gen_random_bytes(integer)') is not null then
    execute $create$
      create or replace function public.dca_0_sha256(input_value text)
      returns text language sql immutable strict set search_path = pg_catalog
      as 'select pg_catalog.encode(extensions.digest(input_value, ''sha256''), ''hex'')'
    $create$;
    execute $create$
      create or replace function public.dca_0_random_token()
      returns text language sql volatile set search_path = pg_catalog
      as 'select pg_catalog.encode(extensions.gen_random_bytes(32), ''hex'')'
    $create$;
  elsif pg_catalog.to_regprocedure('public.digest(text,text)') is not null
     and pg_catalog.to_regprocedure('public.gen_random_bytes(integer)') is not null then
    execute $create$
      create or replace function public.dca_0_sha256(input_value text)
      returns text language sql immutable strict set search_path = pg_catalog
      as 'select pg_catalog.encode(public.digest(input_value, ''sha256''), ''hex'')'
    $create$;
    execute $create$
      create or replace function public.dca_0_random_token()
      returns text language sql volatile set search_path = pg_catalog
      as 'select pg_catalog.encode(public.gen_random_bytes(32), ''hex'')'
    $create$;
  else
    raise exception using errcode = '55000', message = 'DCA-0 requires pgcrypto digest and random bytes.';
  end if;
end
$bootstrap$;

create table if not exists public.public_preview_publications (
  id uuid primary key default gen_random_uuid(),
  relationship_type text not null,
  relationship_id uuid not null,
  public_slug text not null,
  preview_version_id uuid not null references public.website_preview_versions(id) on delete restrict,
  enabled boolean not null default true,
  published_at timestamptz not null default now(),
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  constraint public_preview_publications_relationship_type_check
    check (relationship_type in ('lead', 'customer')),
  constraint public_preview_publications_revocation_check
    check (enabled = false or revoked_at is null),
  constraint public_preview_publications_slug_format_check check (
    char_length(public_slug) between 3 and 64
    and public_slug = lower(public_slug)
    and public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and public_slug <> all (array[
      'admin','api','assets','auth','account','billing','blog','contact','dashboard','demo','docs',
      'favicon','functions','help','home','images','index','klant','klanten','login','logout','mail',
      'manifest','max','preview','privacy','public','robots','sales','settings','sitemap','static',
      'status','support','terms','uploads','www'
    ]::text[])
  )
);

create unique index if not exists public_preview_publications_active_relationship_unique_idx
  on public.public_preview_publications (relationship_type, relationship_id)
  where enabled = true;
create index if not exists public_preview_publications_preview_version_idx
  on public.public_preview_publications (preview_version_id);
create index if not exists public_preview_publications_relationship_idx
  on public.public_preview_publications (relationship_type, relationship_id, updated_at desc);
create unique index if not exists public_preview_publications_slug_unique_idx
  on public.public_preview_publications (lower(public_slug));

alter table public.public_preview_publications enable row level security;
alter table public.public_preview_publications force row level security;
revoke all on table public.public_preview_publications from public, anon, authenticated;
grant all on table public.public_preview_publications to service_role;

create table if not exists public.lead_demo_invitations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  demo_journey_id uuid not null references public.demo_journeys(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  normalized_email text not null,
  status text not null default 'planned',
  invitation_count integer not null default 1,
  last_action_key uuid not null,
  last_outbox_id uuid null,
  planned_at timestamptz not null default now(),
  sent_at timestamptz null,
  activated_at timestamptz null,
  opened_at timestamptz null,
  last_error_code text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  preview_version_id uuid null references public.website_preview_versions(id) on delete restrict,
  idempotency_key text null,
  dca_phase text not null default 'invitation_planned',
  constraint lead_demo_invitations_email_normalized check (
    normalized_email = lower(btrim(normalized_email))
    and normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint lead_demo_invitations_invitation_count_check check (invitation_count > 0),
  constraint lead_demo_invitations_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint lead_demo_invitations_auth_unique unique (auth_user_id),
  constraint lead_demo_invitations_email_unique unique (normalized_email),
  constraint lead_demo_invitations_lead_unique unique (lead_id),
  constraint lead_demo_invitations_profile_unique unique (profile_id)
);

alter table public.lead_demo_invitations
  add column if not exists preview_version_id uuid null,
  add column if not exists idempotency_key text null,
  add column if not exists dca_phase text not null default 'invitation_planned';

do $migration$
begin
  if pg_catalog.to_regclass('public.automation_outbox') is not null and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_demo_invitations'::regclass
      and conname = 'lead_demo_invitations_last_outbox_id_fkey'
  ) then
    alter table public.lead_demo_invitations
      add constraint lead_demo_invitations_last_outbox_id_fkey
      foreign key (last_outbox_id) references public.automation_outbox(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_demo_invitations'::regclass
      and conname = 'lead_demo_invitations_preview_version_id_fkey'
  ) then
    alter table public.lead_demo_invitations
      add constraint lead_demo_invitations_preview_version_id_fkey
      foreign key (preview_version_id) references public.website_preview_versions(id) on delete restrict;
  end if;
end
$migration$;

update public.lead_demo_invitations invitation
set preview_version_id = (
  select version_row.id
  from public.website_preview_versions version_row
  where version_row.demo_journey_id = invitation.demo_journey_id
  order by version_row.is_active desc, version_row.version desc, version_row.created_at desc
  limit 1
)
where invitation.preview_version_id is null;

do $migration$
begin
  if exists (select 1 from public.lead_demo_invitations where preview_version_id is null) then
    raise exception using errcode = '55000',
      message = 'DCA-0 cannot bind an existing invitation to a preview version.';
  end if;
end
$migration$;

update public.lead_demo_invitations
set idempotency_key = public.dca_0_sha256(
  lead_id::text || chr(10) || demo_journey_id::text || chr(10)
  || preview_version_id::text || chr(10) || normalized_email
)
where idempotency_key is null;

alter table public.lead_demo_invitations
  alter column preview_version_id set not null,
  alter column idempotency_key set not null;

alter table public.lead_demo_invitations
  drop constraint if exists lead_demo_invitations_status_check;
alter table public.lead_demo_invitations
  add constraint lead_demo_invitations_status_check
  check (status in ('planned','sent','activated','link_expired','send_failed','revoked'));

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_demo_invitations'::regclass
      and conname = 'lead_demo_invitations_idempotency_key_check'
  ) then
    alter table public.lead_demo_invitations
      add constraint lead_demo_invitations_idempotency_key_check
      check (idempotency_key ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_demo_invitations'::regclass
      and conname = 'lead_demo_invitations_dca_phase_check'
  ) then
    alter table public.lead_demo_invitations
      add constraint lead_demo_invitations_dca_phase_check
      check (dca_phase in ('invitation_planned','link_active','link_opened','account_activated','revoked','expired'));
  end if;
end
$migration$;

create unique index if not exists lead_demo_invitations_idempotency_unique
  on public.lead_demo_invitations (idempotency_key);
create index if not exists lead_demo_invitations_journey_idx
  on public.lead_demo_invitations (demo_journey_id, updated_at desc);
create index if not exists lead_demo_invitations_preview_idx
  on public.lead_demo_invitations (preview_version_id, updated_at desc);

alter table public.lead_demo_invitations enable row level security;
drop policy if exists lead_demo_invitations_service_role_all on public.lead_demo_invitations;
create policy lead_demo_invitations_service_role_all
  on public.lead_demo_invitations
  for all to service_role
  using (true) with check (true);
revoke all on table public.lead_demo_invitations from public, anon, authenticated;
grant all on table public.lead_demo_invitations to service_role;

create table if not exists public.client_activation_links (
  id uuid primary key default gen_random_uuid(),
  lead_demo_invitation_id uuid not null references public.lead_demo_invitations(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  customer_id uuid null references public.customers(id) on delete restrict,
  project_id uuid null references public.projects(id) on delete restrict,
  preview_publication_id uuid not null references public.public_preview_publications(id) on delete restrict,
  preview_version_id uuid not null references public.website_preview_versions(id) on delete restrict,
  quote_id uuid null references public.quotes(id) on delete restrict,
  intended_email text not null,
  token_hash text not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  opened_at timestamptz null,
  activated_at timestamptz null,
  revoked_at timestamptz null,
  idempotency_key text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_activation_links_email_normalized check (
    intended_email = lower(btrim(intended_email))
    and intended_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint client_activation_links_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint client_activation_links_idempotency_key_check check (idempotency_key ~ '^[0-9a-f]{64}$'),
  constraint client_activation_links_status_check check (
    status in ('active','opened','activated','expired','revoked','rotated')
  ),
  constraint client_activation_links_expiry_check check (expires_at > created_at),
  constraint client_activation_links_terminal_time_check check (
    (status not in ('revoked','rotated') or revoked_at is not null)
    and (status <> 'activated' or activated_at is not null)
    and (status <> 'opened' or opened_at is not null)
  ),
  constraint client_activation_links_binding_unique unique (
    id, lead_demo_invitation_id, preview_publication_id, preview_version_id
  ),
  constraint client_activation_links_token_hash_unique unique (token_hash)
);

create unique index if not exists client_activation_links_one_live_token
  on public.client_activation_links (lead_demo_invitation_id)
  where status in ('active','opened');
create index if not exists client_activation_links_invitation_idx
  on public.client_activation_links (lead_demo_invitation_id, created_at desc);
create index if not exists client_activation_links_expiry_idx
  on public.client_activation_links (expires_at)
  where status in ('active','opened');
create index if not exists client_activation_links_binding_idx
  on public.client_activation_links (preview_publication_id, preview_version_id);
create unique index if not exists client_activation_links_idempotency_unique
  on public.client_activation_links (idempotency_key);

alter table public.client_activation_links enable row level security;
alter table public.client_activation_links force row level security;
drop policy if exists client_activation_links_service_role_all on public.client_activation_links;
create policy client_activation_links_service_role_all
  on public.client_activation_links
  for all to service_role
  using (true) with check (true);
revoke all on table public.client_activation_links from public, anon, authenticated;
grant all on table public.client_activation_links to service_role;

-- Staging fixture setup uses the same server role as the DCA RPC. Browser roles
-- receive no extra privileges on these existing DCA source tables.
grant select, insert, update, delete on table
  public.profiles,
  public.customers,
  public.leads,
  public.projects,
  public.demo_journeys,
  public.website_build_jobs,
  public.website_preview_versions
to service_role;

create or replace function public.dca_0_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$function$;

drop trigger if exists dca_0_touch_updated_at on public.lead_demo_invitations;
create trigger dca_0_touch_updated_at
before update on public.lead_demo_invitations
for each row execute function public.dca_0_touch_updated_at();

drop trigger if exists dca_0_touch_updated_at on public.public_preview_publications;
create trigger dca_0_touch_updated_at
before update on public.public_preview_publications
for each row execute function public.dca_0_touch_updated_at();

drop trigger if exists dca_0_touch_updated_at on public.client_activation_links;
create trigger dca_0_touch_updated_at
before update on public.client_activation_links
for each row execute function public.dca_0_touch_updated_at();

create or replace function public.dca_0_assert_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  jwt_role text;
begin
  if session_user = 'postgres' then
    return;
  end if;
  jwt_role := nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    exception when others then
      jwt_role := null;
    end;
  end if;
  if jwt_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'DCA activation RPC requires service_role.';
  end if;
end
$function$;

create or replace function public.dca_0_create_activation_link(
  input_lead_id uuid,
  input_demo_journey_id uuid,
  input_preview_version_id uuid,
  input_preview_publication_id uuid,
  input_auth_user_id uuid,
  input_profile_id uuid,
  input_recipient_email text,
  input_created_by text,
  input_expires_at timestamptz default (pg_catalog.clock_timestamp() + interval '72 hours'),
  input_rotate boolean default false
)
returns table (
  invitation_id uuid,
  activation_link_id uuid,
  activation_token text,
  activation_path text,
  invitation_created boolean,
  token_created boolean,
  previous_token_rotated boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  normalized_email text := pg_catalog.lower(pg_catalog.btrim(input_recipient_email));
  expected_key text;
  raw_token text;
  token_digest text;
  lead_record public.leads%rowtype;
  journey_record public.demo_journeys%rowtype;
  preview_record public.website_preview_versions%rowtype;
  publication_record public.public_preview_publications%rowtype;
  profile_record public.profiles%rowtype;
  customer_record public.customers%rowtype;
  invitation_record public.lead_demo_invitations%rowtype;
  link_record public.client_activation_links%rowtype;
  did_create_invitation boolean := false;
  did_create_token boolean := false;
  did_rotate boolean := false;
begin
  perform public.dca_0_assert_service_role();
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(pg_catalog.btrim(input_created_by), '') is null
     or input_expires_at <= pg_catalog.clock_timestamp()
     or input_expires_at > pg_catalog.clock_timestamp() + interval '30 days' then
    raise exception using errcode = '22023', message = 'DCA activation input is invalid.';
  end if;

  select * into lead_record from public.leads where id = input_lead_id for share;
  if not found then raise exception using errcode = 'P0002', message = 'DCA lead not found.'; end if;
  select * into journey_record from public.demo_journeys where id = input_demo_journey_id for share;
  if not found or journey_record.lead_id is distinct from lead_record.id then
    raise exception using errcode = '23514', message = 'DCA journey is not bound to the lead.';
  end if;
  select * into preview_record from public.website_preview_versions where id = input_preview_version_id for share;
  if not found or preview_record.demo_journey_id is distinct from journey_record.id then
    raise exception using errcode = '23514', message = 'DCA preview is not bound to the journey.';
  end if;
  select * into publication_record from public.public_preview_publications
  where id = input_preview_publication_id for share;
  if not found or not publication_record.enabled or publication_record.revoked_at is not null
     or publication_record.preview_version_id is distinct from preview_record.id then
    raise exception using errcode = '23514', message = 'DCA publication is inactive or has a different preview.';
  end if;
  if publication_record.relationship_type = 'lead'
     and publication_record.relationship_id is distinct from lead_record.id then
    raise exception using errcode = '23514', message = 'DCA lead publication ownership mismatch.';
  elsif publication_record.relationship_type = 'customer'
     and publication_record.relationship_id is distinct from lead_record.converted_customer_id then
    raise exception using errcode = '23514', message = 'DCA customer publication ownership mismatch.';
  end if;

  select * into profile_record from public.profiles where id = input_profile_id for share;
  if not found or profile_record.auth_user_id is distinct from input_auth_user_id
     or pg_catalog.lower(pg_catalog.btrim(coalesce(profile_record.email, ''))) is distinct from normalized_email then
    raise exception using errcode = '23514', message = 'DCA profile identity mismatch.';
  end if;

  if lead_record.converted_customer_id is not null then
    select * into customer_record from public.customers where id = lead_record.converted_customer_id for share;
    if not found or customer_record.auth_user_id is distinct from input_auth_user_id
       or customer_record.profile_id is distinct from input_profile_id
       or (preview_record.customer_id is not null and preview_record.customer_id is distinct from customer_record.id)
       or (preview_record.project_id is not null and not exists (
         select 1 from public.projects project
         where project.id = preview_record.project_id and project.customer_id = customer_record.id
       )) then
      raise exception using errcode = '23514', message = 'DCA converted customer ownership mismatch.';
    end if;
  elsif coalesce(profile_record.role, '') <> 'demo_user'
     or preview_record.customer_id is not null then
    raise exception using errcode = '23514', message = 'DCA provisional invitation requires an isolated demo_user.';
  end if;

  expected_key := public.dca_0_sha256(
    lead_record.id::text || pg_catalog.chr(10) || journey_record.id::text || pg_catalog.chr(10)
    || preview_record.id::text || pg_catalog.chr(10) || normalized_email
  );

  insert into public.lead_demo_invitations (
    lead_id, demo_journey_id, preview_version_id, auth_user_id, profile_id,
    normalized_email, status, invitation_count, last_action_key,
    idempotency_key, dca_phase, metadata
  ) values (
    lead_record.id, journey_record.id, preview_record.id, input_auth_user_id, input_profile_id,
    normalized_email, 'planned', 1, gen_random_uuid(), expected_key,
    'invitation_planned', jsonb_build_object('contract', 'DCA_0_TOKEN_SAFE_V1')
  ) on conflict (idempotency_key) do nothing
  returning * into invitation_record;

  if invitation_record.id is null then
    select * into invitation_record
    from public.lead_demo_invitations
    where idempotency_key = expected_key
    for update;
  else
    did_create_invitation := true;
  end if;

  if invitation_record.lead_id is distinct from lead_record.id
     or invitation_record.demo_journey_id is distinct from journey_record.id
     or invitation_record.preview_version_id is distinct from preview_record.id
     or invitation_record.auth_user_id is distinct from input_auth_user_id
     or invitation_record.profile_id is distinct from input_profile_id
     or invitation_record.normalized_email is distinct from normalized_email then
    raise exception using errcode = '23514', message = 'DCA idempotency collision.';
  end if;
  if invitation_record.status = 'activated' then
    raise exception using errcode = '55000', message = 'An activated DCA invitation cannot issue another token.';
  end if;

  select * into link_record
  from public.client_activation_links
  where lead_demo_invitation_id = invitation_record.id
    and status in ('active','opened')
  for update;

  if link_record.id is not null and not input_rotate then
    update public.lead_demo_invitations
    set invitation_count = invitation_count + 1, last_action_key = gen_random_uuid()
    where id = invitation_record.id;
    return query select invitation_record.id, link_record.id, null::text, null::text,
      did_create_invitation, false, false;
    return;
  end if;

  if link_record.id is not null then
    update public.client_activation_links
    set status = 'rotated', revoked_at = pg_catalog.clock_timestamp()
    where id = link_record.id and status in ('active','opened');
    did_rotate := found;
  end if;

  raw_token := public.dca_0_random_token();
  token_digest := public.dca_0_sha256(raw_token);
  insert into public.client_activation_links (
    lead_demo_invitation_id, lead_id, customer_id, project_id,
    preview_publication_id, preview_version_id, intended_email,
    token_hash, status, expires_at, idempotency_key, created_by
  ) values (
    invitation_record.id, lead_record.id, lead_record.converted_customer_id, preview_record.project_id,
    publication_record.id, preview_record.id, normalized_email,
    token_digest, 'active', input_expires_at,
    public.dca_0_sha256(expected_key || pg_catalog.chr(10) || token_digest),
    pg_catalog.btrim(input_created_by)
  ) returning * into link_record;
  did_create_token := true;

  update public.lead_demo_invitations
  set invitation_count = case when did_create_invitation then invitation_count else invitation_count + 1 end,
      status = 'planned', dca_phase = 'link_active', last_action_key = gen_random_uuid(),
      last_error_code = null
  where id = invitation_record.id;

  return query select invitation_record.id, link_record.id, raw_token,
    '/start/' || raw_token, did_create_invitation, did_create_token, did_rotate;
end
$function$;

create or replace function public.dca_0_open_activation_link(
  input_activation_token text,
  input_recipient_email text
)
returns table (
  activation_link_id uuid,
  invitation_id uuid,
  lead_id uuid,
  customer_id uuid,
  project_id uuid,
  preview_publication_id uuid,
  preview_version_id uuid,
  account_activation_allowed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  token_digest text;
  normalized_email text := pg_catalog.lower(pg_catalog.btrim(input_recipient_email));
  link_record public.client_activation_links%rowtype;
begin
  perform public.dca_0_assert_service_role();
  if input_activation_token !~ '^[0-9a-f]{64}$'
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Activation link is invalid.';
  end if;
  token_digest := public.dca_0_sha256(input_activation_token);
  select * into link_record from public.client_activation_links
  where token_hash = token_digest for update;
  if not found or link_record.intended_email is distinct from normalized_email then
    raise exception using errcode = 'P0002', message = 'Activation link is invalid.';
  end if;
  if link_record.status in ('revoked','rotated','activated','expired') then
    raise exception using errcode = '55000', message = 'Activation link is no longer active.';
  end if;
  if link_record.expires_at <= pg_catalog.clock_timestamp() then
    update public.client_activation_links
    set status = 'expired'
    where id = link_record.id;
    update public.lead_demo_invitations
    set status = 'link_expired', dca_phase = 'expired'
    where id = link_record.lead_demo_invitation_id;
    return;
  end if;
  if not exists (
    select 1
    from public.public_preview_publications publication
    join public.website_preview_versions preview on preview.id = publication.preview_version_id
    where publication.id = link_record.preview_publication_id
      and publication.enabled and publication.revoked_at is null
      and preview.id = link_record.preview_version_id
      and (
        (publication.relationship_type = 'lead' and publication.relationship_id = link_record.lead_id)
        or (publication.relationship_type = 'customer' and publication.relationship_id = link_record.customer_id)
      )
  ) then
    raise exception using errcode = '55000', message = 'Activation binding is no longer valid.';
  end if;
  update public.client_activation_links
  set status = 'opened', opened_at = coalesce(opened_at, pg_catalog.clock_timestamp())
  where id = link_record.id
  returning * into link_record;
  update public.lead_demo_invitations
  set opened_at = coalesce(opened_at, pg_catalog.clock_timestamp()), dca_phase = 'link_opened'
  where id = link_record.lead_demo_invitation_id;
  return query select link_record.id, link_record.lead_demo_invitation_id, link_record.lead_id,
    link_record.customer_id, link_record.project_id, link_record.preview_publication_id,
    link_record.preview_version_id, (link_record.customer_id is not null);
end
$function$;

create or replace function public.dca_0_complete_activation(
  input_activation_token text,
  input_recipient_email text,
  input_auth_user_id uuid
)
returns table (activation_link_id uuid, invitation_id uuid, customer_id uuid, activated boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  token_digest text;
  normalized_email text := pg_catalog.lower(pg_catalog.btrim(input_recipient_email));
  link_record public.client_activation_links%rowtype;
  invitation_record public.lead_demo_invitations%rowtype;
begin
  perform public.dca_0_assert_service_role();
  if input_activation_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Activation link is invalid.';
  end if;
  token_digest := public.dca_0_sha256(input_activation_token);
  select * into link_record from public.client_activation_links where token_hash = token_digest for update;
  if not found or link_record.intended_email is distinct from normalized_email
     or link_record.status not in ('active','opened')
     or link_record.expires_at <= pg_catalog.clock_timestamp()
     or link_record.customer_id is null then
    raise exception using errcode = '55000', message = 'Activation cannot be completed.';
  end if;
  if not exists (
    select 1
    from public.public_preview_publications publication
    where publication.id = link_record.preview_publication_id
      and publication.preview_version_id = link_record.preview_version_id
      and publication.enabled and publication.revoked_at is null
      and (
        (publication.relationship_type = 'lead' and publication.relationship_id = link_record.lead_id)
        or (publication.relationship_type = 'customer' and publication.relationship_id = link_record.customer_id)
      )
  ) then
    raise exception using errcode = '55000', message = 'Activation binding is no longer valid.';
  end if;
  select * into invitation_record from public.lead_demo_invitations
  where id = link_record.lead_demo_invitation_id for update;
  if invitation_record.auth_user_id is distinct from input_auth_user_id
     or not exists (
       select 1 from public.customers customer
       where customer.id = link_record.customer_id
         and customer.auth_user_id = input_auth_user_id
         and customer.profile_id = invitation_record.profile_id
     )
     or not exists (
       select 1 from public.leads lead
       where lead.id = link_record.lead_id
         and lead.converted_customer_id = link_record.customer_id
     ) then
    raise exception using errcode = '23514', message = 'Activation account ownership mismatch.';
  end if;
  update public.client_activation_links
  set status = 'activated', activated_at = pg_catalog.clock_timestamp()
  where id = link_record.id;
  update public.lead_demo_invitations
  set status = 'activated', activated_at = pg_catalog.clock_timestamp(), dca_phase = 'account_activated'
  where id = invitation_record.id;
  return query select link_record.id, invitation_record.id, link_record.customer_id, true;
end
$function$;

create or replace function public.dca_0_revoke_activation_link(
  input_activation_link_id uuid,
  input_reason text default 'DCA_0_MANUAL_REVOCATION'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  invitation_id uuid;
begin
  perform public.dca_0_assert_service_role();
  if nullif(pg_catalog.btrim(input_reason), '') is null then
    raise exception using errcode = '22023', message = 'Revocation reason is required.';
  end if;
  update public.client_activation_links
  set status = 'revoked', revoked_at = pg_catalog.clock_timestamp()
  where id = input_activation_link_id and status in ('active','opened')
  returning lead_demo_invitation_id into invitation_id;
  if invitation_id is null then return false; end if;
  update public.lead_demo_invitations
  set status = 'revoked', dca_phase = 'revoked', last_error_code = left(pg_catalog.btrim(input_reason), 120)
  where id = invitation_id;
  return true;
end
$function$;

-- The legacy planner permanently stores a private preview URL and message snapshots.
-- Disable that path until DCA-1 supplies transient provider delivery around this foundation.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.plan_demo_invitation(uuid,uuid,text,integer,text,text,text,text,text,text,text,text,uuid)'
  ) is not null then
    execute 'revoke all on function public.plan_demo_invitation(uuid,uuid,text,integer,text,text,text,text,text,text,text,text,uuid) from public, anon, authenticated, service_role';
  end if;
end
$migration$;

revoke all on function public.dca_0_touch_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.dca_0_sha256(text) from public, anon, authenticated, service_role;
revoke all on function public.dca_0_random_token() from public, anon, authenticated, service_role;
revoke all on function public.dca_0_assert_service_role() from public, anon, authenticated;
grant execute on function public.dca_0_assert_service_role() to service_role;
revoke all on function public.dca_0_create_activation_link(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,boolean)
  from public, anon, authenticated;
grant execute on function public.dca_0_create_activation_link(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,boolean)
  to service_role;
revoke all on function public.dca_0_open_activation_link(text,text) from public, anon, authenticated;
grant execute on function public.dca_0_open_activation_link(text,text) to service_role;
revoke all on function public.dca_0_complete_activation(text,text,uuid) from public, anon, authenticated;
grant execute on function public.dca_0_complete_activation(text,text,uuid) to service_role;
revoke all on function public.dca_0_revoke_activation_link(uuid,text) from public, anon, authenticated;
grant execute on function public.dca_0_revoke_activation_link(uuid,text) to service_role;

commit;
