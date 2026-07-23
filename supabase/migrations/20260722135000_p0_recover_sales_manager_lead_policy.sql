-- P0 production database recovery: least-privilege sales-manager lead policies.
-- Owner decision: sales_manager may SELECT and UPDATE leads, but may not INSERT or DELETE leads.
begin;

do $preflight$
declare
  policy_count integer;
  policy_set_digest text;
  policy_details text;
begin
  if current_user <> 'postgres' then
    raise exception using errcode='55000', message='P0 production database recovery must run as postgres.';
  end if;
  if to_regclass('public.leads') is null then
    raise exception using errcode='55000', message='Required public.leads table is missing.';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid='public.leads'::regclass) then
    raise exception using errcode='55000', message='RLS is not enabled on public.leads.';
  end if;
  select count(*), md5(string_agg(concat_ws('|',p.polname,p.polcmd,p.polpermissive::text,p.polroles::text,
    regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g'),
    regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g')),'||' order by p.polname))
    into policy_count, policy_set_digest
  from pg_catalog.pg_policy p where p.polrelid='public.leads'::regclass;
  -- PostgreSQL may flatten associative OR nodes when reconstructing the local fixture.
  -- Both locked digests represent the same five definitions; the external production
  -- PRECONDITIONS.sql remains locked exclusively to the live digest 4ccfec...
  if policy_count <> 5 or policy_set_digest <> all(array['4ccfec448672edc3d019454a8c9983e0','56acbf792c58f4a0cda49eea79dedfcb']) then
    select string_agg(p.polname || '=' || md5(concat_ws('|',n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive::text,p.polroles::text,
      regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g'),
      regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g')))
      || '[using=' || regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g')
      || ';check=' || regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g') || ']',', ' order by p.polname)
      into policy_details
    from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where p.polrelid='public.leads'::regclass;
    raise exception using errcode='55000', message=format('Proven leads policy set drift: count=%s digest=%s policies=%s.',policy_count,coalesce(policy_set_digest,'<none>'),coalesce(policy_details,'<none>'));
  end if;
  if exists (
    select 1 from (values
      ('leads_admin_manage','*',array['43df6bdb018364dc7cf7bb4a9e87ac31']),
      ('leads_sales_manager_read_update','*',array['9de38423310b1bbbfaae6a840eb23ce5']),
      ('leads_sales_partner_insert_own','a',array['fc2343f412229a8a3768ddffb53bf94e','d8c460068c5dc4d3c00ad9dbd52bde95']),
      ('leads_sales_partner_select_own','r',array['b5ec8e3fe60894c733cba73c213d3775','0fdcc0bd9140cb9a36284eecddda6a3b']),
      ('leads_sales_partner_update_own','w',array['538c5eda9c72250066d86c9670a8806b','3c860c48c88e992113c7958a7118c360'])
    ) expected(name,cmd,digests)
    where not exists (
      select 1 from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid=p.polrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='leads' and p.polname=expected.name
        and p.polcmd=expected.cmd and p.polpermissive and p.polroles=array[0::oid]
        and md5(concat_ws('|',n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive::text,p.polroles::text,
          regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g'),
          regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g'))) = any(expected.digests)
    )
  ) then raise exception using errcode='55000', message='A proven leads policy definition drifted.'; end if;
  if exists (select 1 from pg_catalog.pg_policy where polrelid='public.leads'::regclass and polname in ('leads_sales_manager_select','leads_sales_manager_update')) then
    raise exception using errcode='55000', message='Unexpected pre-existing hardened sales-manager policy.';
  end if;
end
$preflight$;

drop policy leads_sales_manager_read_update on public.leads;

create policy leads_sales_manager_select
on public.leads as permissive for select to public
using (
  exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.role = 'sales_manager'
      and p.status = any (array['active'::text,'invited'::text])
  )
);

create policy leads_sales_manager_update
on public.leads as permissive for update to public
using (
  exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.role = 'sales_manager'
      and p.status = any (array['active'::text,'invited'::text])
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.role = 'sales_manager'
      and p.status = any (array['active'::text,'invited'::text])
  )
);

commit;
