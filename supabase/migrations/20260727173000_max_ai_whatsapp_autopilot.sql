-- Controlled WhatsApp autopilot with idempotent AI replies and human handoff.
begin;

create unique index if not exists conversation_messages_autopilot_inbound_idx
  on public.conversation_messages((metadata ->> 'autopilotInboundMessageId'))
  where channel='whatsapp' and direction='outbound' and ai_generated and metadata ? 'autopilotInboundMessageId';

create or replace function public.mws_queue_whatsapp_ai_text_v1(
  p_conversation_id uuid,
  p_inbound_message_id uuid,
  p_body text,
  p_ai_model text,
  p_prompt_version text,
  p_confidence numeric,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_inbound public.conversation_messages%rowtype;
  v_channel public.conversation_channels%rowtype;
  v_message_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_conversation_id is null or p_inbound_message_id is null
     or char_length(btrim(coalesce(p_body,''))) not between 1 and 4096
     or char_length(btrim(coalesce(p_ai_model,''))) not between 1 and 100
     or char_length(btrim(coalesce(p_prompt_version,''))) not between 1 and 120
     or p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception using errcode='22023', message='Autopilot reply is invalid.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_conversation_id::text));
  select * into v_conversation from public.conversations where id=p_conversation_id for update;
  select * into v_inbound from public.conversation_messages
    where id=p_inbound_message_id and conversation_id=p_conversation_id and channel='whatsapp' and direction='inbound';
  select * into v_channel from public.conversation_channels
    where conversation_id=p_conversation_id and channel='whatsapp' and status='active' limit 1;
  if v_conversation.id is null or v_inbound.id is null or v_channel.id is null then
    raise exception using errcode='P0001', message='AUTOPILOT_CONTEXT_NOT_FOUND';
  end if;
  select id into v_message_id from public.conversation_messages
    where metadata ->> 'autopilotInboundMessageId'=p_inbound_message_id::text limit 1;
  if v_message_id is not null then
    return pg_catalog.jsonb_build_object('queued',false,'duplicate',true,'reason','duplicate','messageId',v_message_id);
  end if;
  if v_conversation.bot_mode <> 'autopilot' then
    return pg_catalog.jsonb_build_object('queued',false,'duplicate',false,'reason','mode');
  end if;
  if exists (select 1 from public.conversation_messages where conversation_id=p_conversation_id and direction='inbound' and created_at>v_inbound.created_at)
     or exists (select 1 from public.conversation_messages where conversation_id=p_conversation_id and direction='outbound' and created_at>v_inbound.created_at) then
    return pg_catalog.jsonb_build_object('queued',false,'duplicate',false,'reason','stale');
  end if;

  insert into public.conversation_messages(
    conversation_id,channel_id,channel,direction,sender_type,content_type,body,delivery_status,
    ai_generated,ai_model,prompt_version,confidence,approval_status,metadata,created_at,updated_at
  ) values (
    p_conversation_id,v_channel.id,'whatsapp','outbound','bot','text',btrim(p_body),'queued',
    true,btrim(p_ai_model),btrim(p_prompt_version),p_confidence,'not_required',
    coalesce(p_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object('autopilotInboundMessageId',p_inbound_message_id),v_now,v_now
  ) returning id into v_message_id;
  return pg_catalog.jsonb_build_object(
    'queued',true,'duplicate',false,'messageId',v_message_id,
    'phoneNumberId',v_channel.metadata->>'phoneNumberId',
    'recipient',coalesce(v_channel.external_contact_id,v_channel.normalized_phone)
  );
end
$function$;

create or replace function public.mws_handoff_ai_autopilot_v1(
  p_conversation_id uuid,
  p_inbound_message_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if not exists(select 1 from public.conversation_messages where id=p_inbound_message_id and conversation_id=p_conversation_id and direction='inbound') then
    raise exception using errcode='P0001', message='AUTOPILOT_CONTEXT_NOT_FOUND';
  end if;
  update public.conversations set bot_mode='paused',status='waiting_for_staff',human_takeover_at=v_now,updated_at=v_now where id=p_conversation_id;
  insert into public.conversation_events(conversation_id,event_type,actor_type,source,payload,created_at)
  values(p_conversation_id,'human_takeover','bot','bot',pg_catalog.jsonb_build_object('inboundMessageId',p_inbound_message_id,'reason',left(coalesce(p_reason,'unknown'),120)),v_now);
  return pg_catalog.jsonb_build_object('status','resolved','conversationId',p_conversation_id,'botMode','paused');
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
declare v_message public.conversation_messages%rowtype;v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  select * into v_message from public.conversation_messages where id=p_message_id for update;
  if v_message.id is null or v_message.channel<>'whatsapp' or v_message.direction<>'outbound' then raise exception using errcode='P0001',message='WHATSAPP_MESSAGE_NOT_FOUND'; end if;
  update public.conversation_messages set provider_message_id=case when p_sent then btrim(p_provider_message_id) else provider_message_id end,delivery_status=case when p_sent then 'queued' else 'failed' end,failure_code=case when p_sent then null else left(p_failure_code,255) end,failure_reason=case when p_sent then null else left(p_failure_reason,2000) end,updated_at=v_now where id=p_message_id;
  update public.conversations set last_message_at=v_now,status='waiting_for_prospect',updated_at=v_now where id=v_message.conversation_id and p_sent;
  insert into public.conversation_events(conversation_id,event_type,actor_type,actor_auth_user_id,source,payload,created_at)
  values(v_message.conversation_id,case when p_sent then 'message_queued' else 'message_failed' end,case when v_message.sender_type='bot' then 'bot' else 'staff' end,case when v_message.sender_type='bot' then null else v_message.sender_auth_user_id end,case when v_message.sender_type='bot' then 'bot' else 'admin' end,pg_catalog.jsonb_build_object('messageId',p_message_id),v_now);
  return pg_catalog.jsonb_build_object('status','resolved','messageId',p_message_id,'sent',p_sent);
end
$function$;

create or replace function public.mws_manage_conversation_v1(
  p_conversation_id uuid,p_action text,p_actor_auth_user_id uuid,p_assigned_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare v_action text:=lower(btrim(p_action));v_conversation public.conversations%rowtype;v_now timestamptz:=pg_catalog.clock_timestamp();v_event_type text;
begin
  if p_conversation_id is null or p_actor_auth_user_id is null then raise exception using errcode='22023',message='Conversation and actor are required.'; end if;
  if v_action not in ('assign','unassign','resolve','reopen','pause_bot','resume_bot','enable_autopilot') then raise exception using errcode='22023',message='Conversation action is invalid.'; end if;
  select * into v_conversation from public.conversations where id=p_conversation_id for update;if v_conversation.id is null then raise exception using errcode='P0001',message='CONVERSATION_NOT_FOUND';end if;
  if v_action='assign' then if p_assigned_user_id is null then raise exception using errcode='22023',message='Assignee is required.';end if;update public.conversations set assigned_user_id=p_assigned_user_id,status=case when status='new' then 'open' else status end,updated_at=v_now where id=p_conversation_id;v_event_type:='assigned';
  elsif v_action='unassign' then update public.conversations set assigned_user_id=null,updated_at=v_now where id=p_conversation_id;v_event_type:='unassigned';
  elsif v_action='resolve' then update public.conversations set status='resolved',resolved_at=v_now,bot_mode='paused',updated_at=v_now where id=p_conversation_id;v_event_type:='resolved';
  elsif v_action='reopen' then update public.conversations set status='open',resolved_at=null,updated_at=v_now where id=p_conversation_id;v_event_type:='reopened';
  elsif v_action='pause_bot' then update public.conversations set bot_mode='paused',human_takeover_at=coalesce(human_takeover_at,v_now),status='waiting_for_staff',updated_at=v_now where id=p_conversation_id;v_event_type:='human_takeover';
  elsif v_action='enable_autopilot' then update public.conversations set bot_mode='autopilot',human_takeover_at=null,status='open',updated_at=v_now where id=p_conversation_id;v_event_type:='bot_resumed';
  else update public.conversations set bot_mode='assisted',human_takeover_at=null,status='open',updated_at=v_now where id=p_conversation_id;v_event_type:='bot_resumed';end if;
  insert into public.conversation_events(conversation_id,event_type,actor_type,actor_auth_user_id,source,payload,created_at)
  values(p_conversation_id,v_event_type,'staff',p_actor_auth_user_id,'admin',case when v_action='assign' then pg_catalog.jsonb_build_object('assignedUserId',p_assigned_user_id) else pg_catalog.jsonb_build_object('mode',case when v_action='enable_autopilot' then 'autopilot' when v_action='resume_bot' then 'assisted' when v_action='pause_bot' then 'paused' else null end) end,v_now);
  return pg_catalog.jsonb_build_object('status','resolved','conversationId',p_conversation_id,'action',v_action);
end
$function$;

revoke all on function public.mws_queue_whatsapp_ai_text_v1(uuid,uuid,text,text,text,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.mws_queue_whatsapp_ai_text_v1(uuid,uuid,text,text,text,numeric,jsonb) to service_role;
revoke all on function public.mws_handoff_ai_autopilot_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mws_handoff_ai_autopilot_v1(uuid,uuid,text) to service_role;

commit;
