\set ON_ERROR_STOP on
begin read only;
do $$ begin
  if to_regclass('public.lead_intake_abuse_requests') is null
    or to_regprocedure('public.mws_check_lead_intake_abuse_v1(text,text,text,text,text)') is null
    or to_regprocedure('public.mws_cleanup_lead_intake_abuse_v1(integer)') is null
  then raise exception using errcode='55000', message='Abuse-control recovery postcondition failed.'; end if;
end $$;
rollback;
