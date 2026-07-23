\set ON_ERROR_STOP on
begin read only;
do $$ begin
  if to_regclass('public.p0_staging_smoke_nonces') is not null
    or to_regprocedure('public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)') is not null
  then raise exception using errcode='55000', message='Staging-only smoke nonce objects remain.'; end if;
end $$;
rollback;
