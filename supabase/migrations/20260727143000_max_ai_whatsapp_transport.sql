-- WhatsApp Cloud API transport for Max AI conversations.
begin;

create or replace function public.mws_ingest_whatsapp_message_v1(
  p_phone_number_id text,
  p_waba_id text,
  p_provider_message_id text,
  p_contact_wa_id text,
  p_display_name text,
  p_content_type text,
  p_body text,
  p_provider_created_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_external_thread_id text;
  v_normalized_phone text;
  v_conversation_id uuid;
  v_channel_id uuid;
  v_message_id uuid;
  v_lead_id uuid;
  v_lead_count integer;
begin
  if nullif(btrim(p_phone_number_id), '') is null
     or nullif(btrim(p_provider_message_id), '') is null
     or nullif(btrim(p_contact_wa_id), '') is null then
    raise exception using errcode = '22023', message = 'WhatsApp transport identifiers are required.';
  end if;
  if char_length(p_phone_number_id) > 120 or char_length(p_provider_message_id) > 255 or char_length(p_contact_wa_id) > 120 then
    raise exception using errcode = '22023', message = 'WhatsApp transport identifier is too long.';
  end if;
  if p_content_type not in ('text','image','document','audio','video','location','interactive','system') then
    raise exception using errcode = '22023', message = 'WhatsApp content type is unsupported.';
  end if;
  if p_body is null or char_length(p_body) not between 1 and 16000 then
    raise exception using errcode = '22023', message = 'WhatsApp message body is invalid.';
  end if;
  if pg_catalog.octet_length(pg_catalog.convert_to(coalesce(p_metadata, '{}'::jsonb)::text, 'UTF8')) > 65536 then
    raise exception using errcode = '22023', message = 'WhatsApp message metadata is too large.';
  end if;

  v_external_thread_id := btrim(p_phone_number_id) || ':' || btrim(p_contact_wa_id);
  v_normalized_phone := public.mws_normalize_phone('+' || regexp_replace(p_contact_wa_id, '[^0-9]', '', 'g'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_external_thread_id));

  select id, conversation_id into v_channel_id, v_conversation_id
  from public.conversation_channels
  where channel = 'whatsapp' and external_thread_id = v_external_thread_id
  for update;

  if v_channel_id is null then
    select count(*)::integer, (array_agg(id order by id))[1]
      into v_lead_count, v_lead_id
    from public.leads
    where public.mws_normalize_phone(phone) = v_normalized_phone
      and archived_at is null;

    if v_lead_count <> 1 then v_lead_id := null; end if;

    if v_lead_id is not null then
      select id into v_conversation_id
      from public.conversations
      where lead_id = v_lead_id and status not in ('closed','spam')
      order by last_message_at desc nulls last, created_at desc
      limit 1
      for update;
    end if;

    if v_conversation_id is null then
      insert into public.conversations(
        lead_id, title, status, bot_mode, active_channel, environment,
        last_message_at, metadata, created_at, updated_at
      ) values (
        v_lead_id, left(coalesce(nullif(btrim(p_display_name), ''), v_normalized_phone), 200),
        'new', 'shadow', 'whatsapp', 'production', coalesce(p_provider_created_at, v_now),
        pg_catalog.jsonb_build_object('source', 'whatsapp-cloud-api'), v_now, v_now
      ) returning id into v_conversation_id;

      insert into public.conversation_events(conversation_id, event_type, actor_type, source, payload, created_at)
      values (v_conversation_id, 'conversation_created', 'prospect', 'whatsapp', '{}'::jsonb, v_now);
    end if;

    insert into public.conversation_channels(
      conversation_id, channel, status, external_thread_id, external_contact_id,
      display_name, normalized_phone, opt_in_status, opt_in_source, opted_in_at,
      metadata, created_at, updated_at
    ) values (
      v_conversation_id, 'whatsapp', 'active', v_external_thread_id, btrim(p_contact_wa_id),
      nullif(btrim(p_display_name), ''), v_normalized_phone, 'granted', 'customer_initiated_message',
      coalesce(p_provider_created_at, v_now),
      pg_catalog.jsonb_build_object('phoneNumberId', btrim(p_phone_number_id), 'wabaId', nullif(btrim(p_waba_id), '')),
      v_now, v_now
    ) returning id into v_channel_id;

    insert into public.conversation_events(conversation_id, event_type, actor_type, source, payload, created_at)
    values (v_conversation_id, 'channel_linked', 'provider', 'whatsapp', pg_catalog.jsonb_build_object('channel', 'whatsapp'), v_now);
  end if;

  select id into v_message_id
  from public.conversation_messages
  where provider_message_id = btrim(p_provider_message_id);
  if v_message_id is not null then
    return pg_catalog.jsonb_build_object('status','resolved','duplicate',true,'conversationId',v_conversation_id,'messageId',v_message_id);
  end if;

  insert into public.conversation_messages(
    conversation_id, channel_id, channel, direction, sender_type,
    provider_message_id, content_type, body, delivery_status,
    ai_generated, approval_status, metadata, provider_created_at, created_at, updated_at
  ) values (
    v_conversation_id, v_channel_id, 'whatsapp', 'inbound', 'prospect',
    btrim(p_provider_message_id), p_content_type, p_body, 'received',
    false, 'not_required', coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_provider_created_at, v_now), v_now, v_now
  ) returning id into v_message_id;

  update public.conversations
  set active_channel = 'whatsapp', status = case when bot_mode = 'paused' then 'waiting_for_staff' else 'open' end,
      last_message_at = coalesce(p_provider_created_at, v_now), updated_at = v_now
  where id = v_conversation_id;

  insert into public.conversation_events(conversation_id, event_type, actor_type, source, payload, created_at)
  values (v_conversation_id, 'message_received', 'prospect', 'whatsapp', pg_catalog.jsonb_build_object('messageId', v_message_id), v_now);

  return pg_catalog.jsonb_build_object('status','resolved','duplicate',false,'conversationId',v_conversation_id,'channelId',v_channel_id,'messageId',v_message_id);
end
$function$;

create or replace function public.mws_apply_whatsapp_status_v1(
  p_provider_message_id text,
  p_status text,
  p_status_at timestamptz,
  p_failure_code text default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_message public.conversation_messages%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_status text := lower(btrim(p_status));
  v_event_type text;
begin
  if v_status not in ('sent','delivered','read','failed') then
    return pg_catalog.jsonb_build_object('status','ignored','reason','unsupported_status');
  end if;
  select * into v_message from public.conversation_messages
  where provider_message_id = btrim(p_provider_message_id)
  for update;
  if v_message.id is null then
    return pg_catalog.jsonb_build_object('status','ignored','reason','message_not_found');
  end if;

  if v_status = 'sent' and v_message.delivery_status in ('delivered','read')
     or v_status = 'delivered' and v_message.delivery_status = 'read' then
    return pg_catalog.jsonb_build_object('status','resolved','stale',true,'messageId',v_message.id);
  end if;

  update public.conversation_messages
  set delivery_status = v_status,
      sent_at = case when v_status = 'sent' then coalesce(sent_at, p_status_at, v_now) else sent_at end,
      delivered_at = case when v_status = 'delivered' then coalesce(delivered_at, p_status_at, v_now) else delivered_at end,
      read_at = case when v_status = 'read' then coalesce(read_at, p_status_at, v_now) else read_at end,
      failure_code = case when v_status = 'failed' then left(p_failure_code, 255) else failure_code end,
      failure_reason = case when v_status = 'failed' then left(p_failure_reason, 2000) else failure_reason end,
      updated_at = v_now
  where id = v_message.id;

  v_event_type := case v_status
    when 'sent' then 'message_sent'
    when 'delivered' then 'message_delivered'
    when 'read' then 'message_read'
    else 'message_failed'
  end;
  insert into public.conversation_events(conversation_id, event_type, actor_type, source, payload, created_at)
  values (v_message.conversation_id, v_event_type, 'provider', 'provider', pg_catalog.jsonb_build_object('messageId', v_message.id), v_now);
  return pg_catalog.jsonb_build_object('status','resolved','stale',false,'conversationId',v_message.conversation_id,'messageId',v_message.id);
end
$function$;

create unique index if not exists conversation_messages_whatsapp_client_id_idx
  on public.conversation_messages((metadata ->> 'clientMessageId'))
  where channel = 'whatsapp' and direction = 'outbound' and metadata ? 'clientMessageId';

create or replace function public.mws_queue_whatsapp_text_v1(
  p_conversation_id uuid,
  p_channel_id uuid,
  p_client_message_id uuid,
  p_body text,
  p_sender_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_message_id uuid;
begin
  if p_body is null or char_length(btrim(p_body)) not between 1 and 4096 then
    raise exception using errcode = '22023', message = 'WhatsApp text body is invalid.';
  end if;
  if not exists (
    select 1 from public.conversation_channels
    where id = p_channel_id and conversation_id = p_conversation_id and channel = 'whatsapp' and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'WHATSAPP_CHANNEL_NOT_FOUND';
  end if;
  insert into public.conversation_messages(
    conversation_id, channel_id, channel, direction, sender_type, sender_auth_user_id,
    content_type, body, delivery_status, ai_generated, approval_status, metadata
  ) values (
    p_conversation_id, p_channel_id, 'whatsapp', 'outbound', 'staff', p_sender_auth_user_id,
    'text', btrim(p_body), 'queued', false, 'not_required',
    pg_catalog.jsonb_build_object('clientMessageId', p_client_message_id)
  ) on conflict ((metadata ->> 'clientMessageId'))
    where channel = 'whatsapp' and direction = 'outbound' and metadata ? 'clientMessageId'
    do nothing
  returning id into v_message_id;
  if v_message_id is null then
    select id into v_message_id from public.conversation_messages
    where channel = 'whatsapp' and direction = 'outbound'
      and metadata ->> 'clientMessageId' = p_client_message_id::text;
  end if;
  return pg_catalog.jsonb_build_object('status','resolved','messageId',v_message_id);
end
$function$;

create or replace function public.mws_finalize_whatsapp_text_v1(
  p_message_id uuid,
  p_provider_message_id text,
  p_sent boolean,
  p_failure_code text default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_message public.conversation_messages%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select * into v_message from public.conversation_messages where id = p_message_id for update;
  if v_message.id is null or v_message.channel <> 'whatsapp' or v_message.direction <> 'outbound' then
    raise exception using errcode = 'P0001', message = 'WHATSAPP_MESSAGE_NOT_FOUND';
  end if;
  update public.conversation_messages
  set provider_message_id = case when p_sent then btrim(p_provider_message_id) else provider_message_id end,
      delivery_status = case when p_sent then 'queued' else 'failed' end,
      failure_code = case when p_sent then null else left(p_failure_code,255) end,
      failure_reason = case when p_sent then null else left(p_failure_reason,2000) end,
      updated_at = v_now
  where id = p_message_id;
  update public.conversations set last_message_at = v_now, status = 'waiting_for_prospect', updated_at = v_now
  where id = v_message.conversation_id and p_sent;
  insert into public.conversation_events(conversation_id,event_type,actor_type,actor_auth_user_id,source,payload,created_at)
  values (v_message.conversation_id,case when p_sent then 'message_queued' else 'message_failed' end,'staff',v_message.sender_auth_user_id,'admin',pg_catalog.jsonb_build_object('messageId',p_message_id),v_now);
  return pg_catalog.jsonb_build_object('status','resolved','messageId',p_message_id,'sent',p_sent);
end
$function$;

create or replace function public.guard_conversation_message_content()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'Conversation messages cannot be deleted directly.';
  end if;
  if new.conversation_id is distinct from old.conversation_id
     or new.channel_id is distinct from old.channel_id
     or new.channel is distinct from old.channel
     or new.direction is distinct from old.direction
     or new.sender_type is distinct from old.sender_type
     or new.sender_auth_user_id is distinct from old.sender_auth_user_id
     or (new.provider_message_id is distinct from old.provider_message_id and old.provider_message_id is not null)
     or new.content_type is distinct from old.content_type
     or new.body is distinct from old.body
     or new.ai_generated is distinct from old.ai_generated
     or new.ai_model is distinct from old.ai_model
     or new.prompt_version is distinct from old.prompt_version
     or new.confidence is distinct from old.confidence
     or new.metadata is distinct from old.metadata
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = '55000', message = 'Conversation message content is immutable after insertion.';
  end if;
  return new;
end
$function$;

revoke all on function public.mws_ingest_whatsapp_message_v1(text,text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.mws_apply_whatsapp_status_v1(text,text,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.mws_queue_whatsapp_text_v1(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.mws_finalize_whatsapp_text_v1(uuid,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.mws_ingest_whatsapp_message_v1(text,text,text,text,text,text,text,timestamptz,jsonb) to service_role;
grant execute on function public.mws_apply_whatsapp_status_v1(text,text,timestamptz,text,text) to service_role;
grant execute on function public.mws_queue_whatsapp_text_v1(uuid,uuid,uuid,text,uuid) to service_role;
grant execute on function public.mws_finalize_whatsapp_text_v1(uuid,text,boolean,text,text) to service_role;

commit;
