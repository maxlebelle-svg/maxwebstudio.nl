-- Human-approved Max AI suggestions for the shared conversation inbox.
begin;

alter table public.conversation_events
  drop constraint conversation_events_event_type_check;
alter table public.conversation_events
  add constraint conversation_events_event_type_check check (
    event_type in (
      'conversation_created','channel_linked','message_received','message_queued',
      'message_sent','message_delivered','message_read','message_failed',
      'assigned','unassigned','bot_mode_changed','human_takeover',
      'bot_resumed','handoff_created','handoff_completed','opt_in_changed',
      'summary_updated','resolved','reopened','ai_suggestion_created',
      'ai_suggestion_approved','ai_suggestion_rejected'
    )
  );

create or replace function public.mws_create_ai_suggestion_v1(
  p_conversation_id uuid,
  p_actor_auth_user_id uuid,
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
  v_message public.conversation_messages%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_conversation_id is null or p_actor_auth_user_id is null then
    raise exception using errcode = '22023', message = 'Conversation and actor are required.';
  end if;
  if not exists (select 1 from public.conversations where id = p_conversation_id) then
    raise exception using errcode = 'P0001', message = 'CONVERSATION_NOT_FOUND';
  end if;
  if char_length(btrim(coalesce(p_body,''))) not between 1 and 4096
     or char_length(btrim(coalesce(p_ai_model,''))) not between 1 and 100
     or char_length(btrim(coalesce(p_prompt_version,''))) not between 1 and 100
     or p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception using errcode = '22023', message = 'Suggestion payload is invalid.';
  end if;

  insert into public.conversation_messages(
    conversation_id,channel,direction,sender_type,content_type,body,delivery_status,
    ai_generated,ai_model,prompt_version,confidence,approval_status,metadata,created_at,updated_at
  ) values (
    p_conversation_id,'internal','internal','bot','text',btrim(p_body),'received',
    true,btrim(p_ai_model),btrim(p_prompt_version),p_confidence,'pending',coalesce(p_metadata,'{}'::jsonb),v_now,v_now
  ) returning * into v_message;

  insert into public.conversation_events(conversation_id,event_type,actor_type,actor_auth_user_id,source,payload,created_at)
  values (p_conversation_id,'ai_suggestion_created','staff',p_actor_auth_user_id,'bot',
    pg_catalog.jsonb_build_object('messageId',v_message.id,'model',v_message.ai_model,'promptVersion',v_message.prompt_version),v_now);

  return pg_catalog.jsonb_build_object(
    'id',v_message.id,'conversationId',v_message.conversation_id,'body',v_message.body,
    'approvalStatus',v_message.approval_status,'confidence',v_message.confidence,
    'aiModel',v_message.ai_model,'createdAt',v_message.created_at
  );
end
$function$;

create or replace function public.mws_review_ai_suggestion_v1(
  p_message_id uuid,
  p_actor_auth_user_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_message public.conversation_messages%rowtype;
  v_decision text := lower(btrim(p_decision));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_message_id is null or p_actor_auth_user_id is null or v_decision not in ('approved','rejected') then
    raise exception using errcode = '22023', message = 'Suggestion review is invalid.';
  end if;
  select * into v_message from public.conversation_messages where id=p_message_id for update;
  if v_message.id is null or v_message.channel <> 'internal' or not v_message.ai_generated then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_NOT_FOUND';
  end if;
  if v_message.approval_status <> 'pending' then
    raise exception using errcode = '55000', message = 'AI_SUGGESTION_ALREADY_REVIEWED';
  end if;

  update public.conversation_messages
  set approval_status=v_decision,approved_by_auth_user_id=p_actor_auth_user_id,approved_at=v_now,updated_at=v_now
  where id=p_message_id returning * into v_message;

  insert into public.conversation_events(conversation_id,event_type,actor_type,actor_auth_user_id,source,payload,created_at)
  values (v_message.conversation_id,'ai_suggestion_'||v_decision,'staff',p_actor_auth_user_id,'admin',
    pg_catalog.jsonb_build_object('messageId',v_message.id),v_now);

  return pg_catalog.jsonb_build_object(
    'id',v_message.id,'conversationId',v_message.conversation_id,'body',v_message.body,
    'approvalStatus',v_message.approval_status,'confidence',v_message.confidence,
    'aiModel',v_message.ai_model,'createdAt',v_message.created_at
  );
end
$function$;

revoke all on function public.mws_create_ai_suggestion_v1(uuid,uuid,text,text,text,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.mws_create_ai_suggestion_v1(uuid,uuid,text,text,text,numeric,jsonb) to service_role;
revoke all on function public.mws_review_ai_suggestion_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mws_review_ai_suggestion_v1(uuid,uuid,text) to service_role;

commit;
