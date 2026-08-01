-- P0 repair: allow the server-only Composer reader to load immutable offer evidence.
-- Writes remain exclusively available through the existing bounded SECURITY DEFINER RPCs.

begin;

do $preflight$
declare
  required_table text;
begin
  foreach required_table in array array[
    'commercial_offers',
    'commercial_offer_versions',
    'commercial_offer_lines',
    'commercial_offer_document_bindings',
    'commercial_offer_events'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception using
        errcode = '55000',
        message = format('Composer read repair requires public.%I', required_table);
    end if;
  end loop;

  if to_regprocedure('public.commercial_register_catalog_version_v1(uuid,uuid,text,text,text,jsonb)') is null
     or to_regprocedure('public.commercial_create_offer_version_v1(uuid,uuid,text,uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,text,text)') is null
     or to_regprocedure('public.commercial_transition_offer_version_v1(uuid,uuid,uuid,text,text,text)') is null then
    raise exception using
      errcode = '55000',
      message = 'Composer read repair requires the certified commercial write RPCs';
  end if;
end
$preflight$;

revoke all privileges on table
  public.commercial_offers,
  public.commercial_offer_versions,
  public.commercial_offer_lines,
  public.commercial_offer_document_bindings,
  public.commercial_offer_events
from service_role;

grant select on table
  public.commercial_offers,
  public.commercial_offer_versions,
  public.commercial_offer_lines,
  public.commercial_offer_document_bindings,
  public.commercial_offer_events
to service_role;

commit;
