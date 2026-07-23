\set ON_ERROR_STOP on
begin read only;
do $$ begin
  if (select count(*) from pg_catalog.pg_policy where polrelid='public.leads'::regclass)<>6
    or exists (select 1 from pg_catalog.pg_policy where polrelid='public.leads'::regclass and polname like 'leads_sales_manager_%' and polcmd in ('*','a','d'))
    or not exists (select 1 from pg_catalog.pg_policy where polrelid='public.leads'::regclass and polname='leads_sales_manager_select' and polcmd='r')
    or not exists (select 1 from pg_catalog.pg_policy where polrelid='public.leads'::regclass and polname='leads_sales_manager_update' and polcmd='w' and polqual is not distinct from polwithcheck)
  then raise exception using errcode='55000', message='Final leads policy postcondition failed.'; end if;
end $$;
rollback;
