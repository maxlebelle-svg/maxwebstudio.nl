-- Max AI Conversation Foundation V1.
-- Shared, channel-neutral conversation storage for website chat and WhatsApp.
-- Forward-only, additive and fail-closed: public clients never write directly.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.leads') is null
     or pg_catalog.to_regclass('public.customers') is null then
    raise exception using errcode = '55000',
      message = 'Max AI conversations require profiles, leads and customers.';
  end if;

  if pg_catalog.to_regprocedure('public.has_app_role(text[])') is null then
    raise exception using errcode = '55000',
      message = 'Max AI conversations require public.has_app_role(text[]).';
  end if;
end
$preflight$;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  title text,
  status text not null default 'new',
  bot_mode text not null default 'shadow',
  active_channel text not null default 'web',
  priority text not null default 'normal',
  summary text,
  next_action text,
  last_message_at timestamptz,
  human_takeover_at timestamptz,
  resolved_at timestamptz,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint conversations_status_check check (
    status in ('new','open','waiting_for_prospect','waiting_for_staff','resolved','closed','spam')
  ),
  constraint conversations_bot_mode_check check (
    bot_mode in ('shadow','assisted','autopilot','paused')
  ),
  constraint conversations_active_channel_check check (
    active_channel in ('web','whatsapp')
  ),
  constraint conversations_priority_check check (
    priority in ('low','normal','high','urgent')
  ),
  constraint conversations_environment_check check (
    environment in ('production','staging','test','demo')
  ),
  constraint conversations_title_length_check check (
    title is null or char_length(title) <= 200
  ),
  constraint conversations_summary_length_check check (
    summary is null or char_length(summary) <= 8000
  )
);

create table public.conversation_channels (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel text not null,
  status text not null default 'active',
  external_thread_id text not null,
  external_contact_id text,
  display_name text,
  normalized_phone text,
  handoff_token_hash text,
  handoff_expires_at timestamptz,
  opt_in_status text not null default 'unknown',
  opt_in_source text,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint conversation_channels_channel_check check (
    channel in ('web','whatsapp')
  ),
  constraint conversation_channels_status_check check (
    status in ('pending','active','paused','closed')
  ),
  constraint conversation_channels_external_thread_check check (
    char_length(btrim(external_thread_id)) between 1 and 255
  ),
  constraint conversation_channels_opt_in_status_check check (
    opt_in_status in ('unknown','granted','revoked')
  ),
  constraint conversation_channels_opt_in_timeline_check check (
    (opt_in_status <> 'granted' or opted_in_at is not null)
    and (opt_in_status <> 'revoked' or opted_out_at is not null)
  ),
  constraint conversation_channels_handoff_check check (
    (handoff_token_hash is null and handoff_expires_at is null)
    or (handoff_token_hash is not null and handoff_expires_at is not null)
  ),
  unique (channel, external_thread_id)
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel_id uuid references public.conversation_channels(id) on delete set null,
  channel text not null,
  direction text not null,
  sender_type text not null,
  sender_auth_user_id uuid references auth.users(id) on delete set null,
  provider_message_id text,
  content_type text not null default 'text',
  body text,
  delivery_status text not null default 'received',
  ai_generated boolean not null default false,
  ai_model text,
  prompt_version text,
  confidence numeric(5,4),
  approval_status text not null default 'not_required',
  approved_by_auth_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  failure_code text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  provider_created_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint conversation_messages_channel_check check (
    channel in ('web','whatsapp','internal')
  ),
  constraint conversation_messages_direction_check check (
    direction in ('inbound','outbound','internal')
  ),
  constraint conversation_messages_sender_type_check check (
    sender_type in ('prospect','staff','bot','system')
  ),
  constraint conversation_messages_content_type_check check (
    content_type in ('text','image','document','audio','video','location','interactive','template','system')
  ),
  constraint conversation_messages_delivery_status_check check (
    delivery_status in ('received','queued','sent','delivered','read','failed')
  ),
  constraint conversation_messages_approval_status_check check (
    approval_status in ('not_required','pending','approved','rejected')
  ),
  constraint conversation_messages_body_check check (
    (body is not null and char_length(body) between 1 and 16000)
    or content_type in ('image','document','audio','video','location','interactive','system')
  ),
  constraint conversation_messages_staff_sender_check check (
    sender_type <> 'staff' or sender_auth_user_id is not null
  ),
  constraint conversation_messages_ai_sender_check check (
    sender_type <> 'bot' or ai_generated
  ),
  constraint conversation_messages_confidence_check check (
    confidence is null or confidence between 0 and 1
  ),
  constraint conversation_messages_approval_timeline_check check (
    (approval_status not in ('approved','rejected'))
    or (approved_by_auth_user_id is not null and approved_at is not null)
  )
);

create unique index conversation_messages_provider_message_id_idx
  on public.conversation_messages(provider_message_id)
  where provider_message_id is not null and provider_message_id <> '';

create table public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'system',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint conversation_events_event_type_check check (
    event_type in (
      'conversation_created','channel_linked','message_received','message_queued',
      'message_sent','message_delivered','message_read','message_failed',
      'assigned','unassigned','bot_mode_changed','human_takeover',
      'bot_resumed','handoff_created','handoff_completed','opt_in_changed',
      'summary_updated','resolved','reopened'
    )
  ),
  constraint conversation_events_actor_type_check check (
    actor_type in ('prospect','staff','bot','system','provider')
  ),
  constraint conversation_events_source_check check (
    source in ('web','whatsapp','admin','bot','system','provider')
  ),
  constraint conversation_events_staff_actor_check check (
    actor_type <> 'staff' or actor_auth_user_id is not null
  ),
  constraint conversation_events_payload_size_check check (
    octet_length(convert_to(payload::text, 'utf8')) <= 65536
  )
);

create index conversations_assigned_user_status_idx
  on public.conversations(assigned_user_id, status, last_message_at desc);
create index conversations_lead_id_idx on public.conversations(lead_id) where lead_id is not null;
create index conversations_customer_id_idx on public.conversations(customer_id) where customer_id is not null;
create index conversations_last_message_idx on public.conversations(last_message_at desc nulls last);
create index conversation_channels_conversation_idx on public.conversation_channels(conversation_id, channel);
create index conversation_channels_phone_idx on public.conversation_channels(normalized_phone) where normalized_phone is not null;
create index conversation_messages_conversation_created_idx on public.conversation_messages(conversation_id, created_at);
create index conversation_messages_pending_review_idx on public.conversation_messages(conversation_id, created_at)
  where approval_status = 'pending';
create index conversation_events_conversation_created_idx on public.conversation_events(conversation_id, created_at);

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_conversation_channels_updated_at on public.conversation_channels;
create trigger set_conversation_channels_updated_at
before update on public.conversation_channels
for each row execute function public.set_updated_at();

drop trigger if exists set_conversation_messages_updated_at on public.conversation_messages;
create trigger set_conversation_messages_updated_at
before update on public.conversation_messages
for each row execute function public.set_updated_at();

create or replace function public.guard_conversation_message_content()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'Conversation messages cannot be deleted directly.';
  end if;

  if new.conversation_id is distinct from old.conversation_id
     or new.channel_id is distinct from old.channel_id
     or new.channel is distinct from old.channel
     or new.direction is distinct from old.direction
     or new.sender_type is distinct from old.sender_type
     or new.sender_auth_user_id is distinct from old.sender_auth_user_id
     or new.provider_message_id is distinct from old.provider_message_id
     or new.content_type is distinct from old.content_type
     or new.body is distinct from old.body
     or new.ai_generated is distinct from old.ai_generated
     or new.ai_model is distinct from old.ai_model
     or new.prompt_version is distinct from old.prompt_version
     or new.confidence is distinct from old.confidence
     or new.metadata is distinct from old.metadata
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = '55000',
      message = 'Conversation message content is immutable after insertion.';
  end if;
  return new;
end
$function$;

drop trigger if exists guard_conversation_message_content on public.conversation_messages;
create trigger guard_conversation_message_content
before update or delete on public.conversation_messages
for each row execute function public.guard_conversation_message_content();

create or replace function public.guard_conversation_event_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception using errcode = '55000',
    message = 'Conversation events are append-only.';
end
$function$;

drop trigger if exists guard_conversation_event_append_only on public.conversation_events;
create trigger guard_conversation_event_append_only
before update or delete on public.conversation_events
for each row execute function public.guard_conversation_event_append_only();

create or replace function public.can_read_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.conversations c
    where c.id = target_conversation_id
      and (
        public.has_app_role(array['super_admin','admin','sales_manager'])
        or (
          public.has_app_role(array['sales_partner','designer','developer','support'])
          and c.assigned_user_id = auth.uid()
        )
      )
  )
$function$;

alter table public.conversations enable row level security;
alter table public.conversation_channels enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_events enable row level security;

create policy conversations_staff_select
on public.conversations for select to authenticated
using (public.can_read_conversation(id));

create policy conversation_channels_staff_select
on public.conversation_channels for select to authenticated
using (public.can_read_conversation(conversation_id));

create policy conversation_messages_staff_select
on public.conversation_messages for select to authenticated
using (public.can_read_conversation(conversation_id));

create policy conversation_events_staff_select
on public.conversation_events for select to authenticated
using (public.can_read_conversation(conversation_id));

revoke all on table public.conversations from public, anon, authenticated, service_role;
revoke all on table public.conversation_channels from public, anon, authenticated, service_role;
revoke all on table public.conversation_messages from public, anon, authenticated, service_role;
revoke all on table public.conversation_events from public, anon, authenticated, service_role;
grant select on table public.conversations to authenticated;
grant select on table public.conversation_channels to authenticated;
grant select on table public.conversation_messages to authenticated;
grant select on table public.conversation_events to authenticated;
grant select, insert, update on table public.conversations to service_role;
grant select, insert, update on table public.conversation_channels to service_role;
grant select, insert, update on table public.conversation_messages to service_role;
grant select, insert on table public.conversation_events to service_role;

revoke all on function public.can_read_conversation(uuid) from public, anon;
grant execute on function public.can_read_conversation(uuid) to authenticated, service_role;
revoke all on function public.guard_conversation_message_content() from public, anon, authenticated, service_role;
revoke all on function public.guard_conversation_event_append_only() from public, anon, authenticated, service_role;

comment on table public.conversations is 'One prospect/customer conversation shared across website chat and WhatsApp.';
comment on table public.conversation_channels is 'External channel identities and consent state linked to a conversation.';
comment on table public.conversation_messages is 'Immutable conversation content with mutable delivery and approval state.';
comment on table public.conversation_events is 'Append-only operational audit trail for conversation lifecycle changes.';
comment on column public.conversation_channels.handoff_token_hash is 'Hash only; plaintext website-to-WhatsApp handoff tokens must never be stored.';

commit;
