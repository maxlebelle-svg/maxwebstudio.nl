do $postcheck$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'public.quotes','public.quote_lines','public.invoices','public.invoice_lines','public.subscriptions',
    'public.website_preview_approvals','public.quote_acceptances','public.customer_portal_trust_events'
  ] loop
    if to_regclass(relation_name) is null then
      raise exception 'missing reconstructed relation: %', relation_name;
    end if;
  end loop;

  if (select count(*) from public.customer_invoices) <> 3
     or (select sum(amount) from public.customer_invoices) <> 2140.49 then
    raise exception 'legacy production-like invoices changed';
  end if;

  if (select count(*) from public.invoices) <> 0
     or (select count(*) from public.subscriptions) <> 0 then
    raise exception 'canonical finance prerequisite performed an unapproved data backfill';
  end if;

  if (select count(*) from public.website_preview_versions where package_checksum is null) <> 2 then
    raise exception 'legacy preview identities were guessed or rewritten';
  end if;

  if has_table_privilege('anon','public.invoices','select')
     or has_table_privilege('authenticated','public.invoices','insert')
     or has_table_privilege('authenticated','public.subscriptions','update') then
    raise exception 'canonical finance ACL contract is unsafe';
  end if;

  if not has_table_privilege('authenticated','public.invoices','select')
     or not has_table_privilege('authenticated','public.subscriptions','select') then
    raise exception 'canonical customer read grants are missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.invoices'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass) then
    raise exception 'canonical finance RLS is disabled';
  end if;
end;
$postcheck$;
