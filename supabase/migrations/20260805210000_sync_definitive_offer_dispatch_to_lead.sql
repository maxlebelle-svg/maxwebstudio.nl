-- Put a lead in the automatic "Voorstel verstuurd" view only after the
-- definitive proposal email has been confirmed as sent by the mail provider.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.leads') is null
     or pg_catalog.to_regclass('public.commercial_offers') is null
     or pg_catalog.to_regclass('public.commercial_offer_mail_dispatches') is null then
    raise exception using errcode='55000', message='Proposal-to-lead lifecycle prerequisites are missing.';
  end if;
end
$preflight$;

create or replace function public.commercial_sync_definitive_dispatch_to_lead_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  offer_relationship_type text;
  offer_relationship_id uuid;
begin
  if new.dispatch_kind <> 'definitive'
     or new.status <> 'sent'
     or old.status = 'sent' then
    return new;
  end if;

  select relationship_type, relationship_id
    into offer_relationship_type, offer_relationship_id
  from public.commercial_offers
  where id = new.offer_id;

  if offer_relationship_type is distinct from 'lead' or offer_relationship_id is null then
    return new;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'pipeline_stage'
  ) then
    execute $update_with_pipeline$
      update public.leads as lead
      set lead_status = $1,
          pipeline_stage = $2,
          metadata = jsonb_set(
            jsonb_set(coalesce(metadata, '{}'::jsonb), '{leadStatus}', to_jsonb($1::text), true),
            '{pipelineStage}', to_jsonb($2::text), true
          ),
          updated_at = clock_timestamp()
      where id = $3
        and lead_status not in ('won', 'lost', 'customer')
        and nullif(to_jsonb(lead) ->> 'archived_at', '') is null
    $update_with_pipeline$
    using 'proposal_sent', 'awaiting_feedback', offer_relationship_id;
  else
    update public.leads as lead
    set lead_status = 'proposal_sent',
        metadata = jsonb_set(
          jsonb_set(coalesce(metadata, '{}'::jsonb), '{leadStatus}', to_jsonb('proposal_sent'::text), true),
          '{pipelineStage}', to_jsonb('awaiting_feedback'::text), true
        ),
        updated_at = clock_timestamp()
    where id = offer_relationship_id
      and lead_status not in ('won', 'lost', 'customer')
      and nullif(to_jsonb(lead) ->> 'archived_at', '') is null;
  end if;

  return new;
end
$function$;

alter function public.commercial_sync_definitive_dispatch_to_lead_v1() owner to postgres;
revoke all on function public.commercial_sync_definitive_dispatch_to_lead_v1() from public, anon, authenticated, service_role;

drop trigger if exists commercial_sync_definitive_dispatch_to_lead_v1
  on public.commercial_offer_mail_dispatches;

create trigger commercial_sync_definitive_dispatch_to_lead_v1
after update of status on public.commercial_offer_mail_dispatches
for each row
execute function public.commercial_sync_definitive_dispatch_to_lead_v1();

comment on function public.commercial_sync_definitive_dispatch_to_lead_v1() is
  'Moves a non-terminal lead to proposal_sent after a provider-confirmed definitive proposal dispatch.';

commit;
