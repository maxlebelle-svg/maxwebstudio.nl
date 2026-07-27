-- Audited staff actions for the shared conversation inbox.
begin;

create or replace function public.mws_manage_conversation_v1(
  p_conversation_id uuid,
  p_action text,
  p_actor_auth_user_id uuid,
  p_assigned_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_action text := lower(btrim(p_action));
  v_conversation public.conversations%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_event_type text;
begin
  if p_conversation_id is null or p_actor_auth_user_id is null then
    raise exception using errcode = '22023', message = 'Conversation and actor are required.';
  end if;
  if v_action not in ('assign','unassign','resolve','reopen','pause_bot','resume_bot') then
    raise exception using errcode = '22023', message = 'Conversation action is invalid.';
  end if;
  select * into v_conversation from public.conversations where id = p_conversation_id for update;
  if v_conversation.id is null then
    raise exception using errcode = 'P0001', message = 'CONVERSATION_NOT_FOUND';
  end if;

  if v_action = 'assign' then
    if p_assigned_user_id is null then raise exception using errcode = '22023', message = 'Assignee is required.'; end if;
    update public.conversations set assigned_user_id=p_assigned_user_id,status=case when status='new' then 'open' else status end,updated_at=v_now where id=p_conversation_id;
    v_event_type := 'assigned';
  elsif v_action = 'unassign' then
    update public.conversations set assigned_user_id=null,updated_at=v_now where id=p_conversation_id;
    v_event_type := 'unassigned';
  elsif v_action = 'resolve' then
    update public.conversations set status='resolved',resolved_at=v_now,bot_mode='paused',updated_at=v_now where id=p_conversation_id;
    v_event_type := 'resolved';
  elsif v_action = 'reopen' then
    update public.conversations set status='open',resolved_at=null,updated_at=v_now where id=p_conversation_id;
    v_event_type := 'reopened';
  elsif v_action = 'pause_bot' then
    update public.conversations set bot_mode='paused',human_takeover_at=coalesce(human_takeover_at,v_now),status='waiting_for_staff',updated_at=v_now where id=p_conversation_id;
    v_event_type := 'human_takeover';
  else
    update public.conversations set bot_mode='assisted',human_takeover_at=null,status='open',updated_at=v_now where id=p_conversation_id;
    v_event_type := 'bot_resumed';
  end if;

  insert into public.conversation_events(conversation_id,event_type,actor_type,actor_auth_user_id,source,payload,created_at)
  values (p_conversation_id,v_event_type,'staff',p_actor_auth_user_id,'admin',
    case when v_action='assign' then pg_catalog.jsonb_build_object('assignedUserId',p_assigned_user_id) else '{}'::jsonb end,v_now);
  return pg_catalog.jsonb_build_object('status','resolved','conversationId',p_conversation_id,'action',v_action);
end
$function$;

revoke all on function public.mws_manage_conversation_v1(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.mws_manage_conversation_v1(uuid,text,uuid,uuid) to service_role;

commit;
