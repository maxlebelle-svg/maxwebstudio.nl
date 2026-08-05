-- Persist global proposal discounts without treating pre-discount line totals as the payable total.
-- The immutable lines remain catalogue-priced; the version snapshot records and validates the discount.

begin;

do $preflight$
begin
  if to_regprocedure('public.commercial_create_offer_version_v1(uuid,uuid,text,uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,text,text)') is null then
    raise exception using
      errcode = '55000',
      message = 'Discount persistence repair requires commercial_create_offer_version_v1';
  end if;
end
$preflight$;

create or replace function public.commercial_create_offer_version_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_relationship_type text,
  input_relationship_id uuid,
  input_offer_id uuid,
  input_title text,
  input_demo_journey_id uuid,
  input_factory_project_id uuid,
  input_snapshot jsonb,
  input_lines jsonb,
  input_documents jsonb,
  input_change_reason text,
  input_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text;
declare offer_record public.commercial_offers%rowtype;
declare previous_version public.commercial_offer_versions%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare catalog_record public.commercial_catalog_versions%rowtype;
declare next_version integer;
declare line_record jsonb;
declare document_record jsonb;
declare expected_one_time_before_discount bigint;
declare expected_discount_percentage integer;
declare expected_discount bigint;
declare expected_one_time bigint;
declare expected_recurring bigint;
declare expected_one_time_vat bigint;
declare expected_recurring_vat bigint;
declare expected_due_now bigint;
declare has_custom boolean;
declare duplicate_event public.commercial_offer_events%rowtype;
begin
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,input_relationship_type,input_relationship_id);
  if char_length(input_idempotency_key) not between 16 and 160
     or char_length(btrim(input_title)) not between 2 and 180
     or jsonb_typeof(input_snapshot) <> 'object'
     or jsonb_typeof(input_lines) <> 'array'
     or jsonb_array_length(input_lines) < 1
     or jsonb_array_length(input_lines) > 120
     or jsonb_typeof(coalesce(input_documents,'[]'::jsonb)) <> 'array' then
    raise exception using errcode='22023', message='Invalid commercial offer version payload.';
  end if;
  if input_snapshot->>'checksum' !~ '^[a-f0-9]{64}$'
     or input_snapshot->>'currency' is distinct from 'EUR'
     or (input_snapshot->>'vatRate')::integer <> 21
     or input_snapshot->'lines' is distinct from input_lines then
    raise exception using errcode='22023', message='Invalid immutable offer snapshot.';
  end if;

  select * into catalog_record from public.commercial_catalog_versions
  where catalog_key = input_snapshot->>'catalogKey'
    and version = input_snapshot->>'catalogVersion'
    and checksum_sha256 = input_snapshot->>'catalogChecksum';
  if not found then raise exception using errcode='23514', message='Catalog version is not registered.'; end if;

  select coalesce(sum(case when line->>'bindingState'='binding' and line->>'componentType'='one_time' then (line->>'subtotalExVatCents')::bigint else 0 end),0),
         coalesce(sum(case when line->>'bindingState'='binding' and line->>'componentType'='recurring' then (line->>'subtotalExVatCents')::bigint else 0 end),0),
         coalesce(sum(case when line->>'bindingState'='binding' and line->>'componentType'='recurring' then (line->>'vatCents')::bigint else 0 end),0),
         bool_or(line->>'priceClassification'='custom')
  into expected_one_time_before_discount, expected_recurring, expected_recurring_vat, has_custom
  from jsonb_array_elements(input_lines) line;

  expected_discount_percentage := coalesce((input_snapshot->>'discountPercentage')::integer, 0);
  if expected_discount_percentage not in (0,10,15,20,25,50,75) then
    raise exception using errcode='23514', message='Offer discount percentage is not allowed.';
  end if;
  expected_discount := round(expected_one_time_before_discount::numeric * expected_discount_percentage / 100)::bigint;
  expected_one_time := expected_one_time_before_discount - expected_discount;
  expected_one_time_vat := round(expected_one_time::numeric * 21 / 100)::bigint;

  if expected_one_time_before_discount is distinct from coalesce((input_snapshot->>'oneTimeBeforeDiscountExVatCents')::bigint,(input_snapshot->>'oneTimeExVatCents')::bigint)
     or expected_discount is distinct from coalesce((input_snapshot->>'discountExVatCents')::bigint,0)
     or expected_one_time is distinct from (input_snapshot->>'oneTimeExVatCents')::bigint
     or expected_recurring is distinct from (input_snapshot->>'recurringExVatCents')::bigint
     or expected_one_time_vat is distinct from (input_snapshot->>'oneTimeVatCents')::bigint
     or expected_recurring_vat is distinct from (input_snapshot->>'recurringVatCents')::bigint then
    raise exception using errcode='23514', message='Offer totals do not match immutable lines and discount.';
  end if;

  if input_snapshot->>'paymentChoice' not in ('none','full','fixed_deposit') then
    raise exception using errcode='23514', message='Offer payment choice is invalid.';
  end if;
  expected_due_now := case input_snapshot->>'paymentChoice'
    when 'full' then expected_one_time
    when 'fixed_deposit' then least(coalesce((input_snapshot->>'fixedDepositExVatCents')::bigint,0),expected_one_time)
    else 0
  end;
  if (input_snapshot->>'oneTimeInclVatCents')::bigint <> expected_one_time + expected_one_time_vat
     or (input_snapshot->>'recurringInclVatCents')::bigint <> expected_recurring + expected_recurring_vat
     or (input_snapshot->>'dueNowExVatCents')::bigint <> expected_due_now
     or (input_snapshot->>'dueNowVatCents')::bigint <> round(expected_due_now::numeric * 21 / 100)::bigint
     or (input_snapshot->>'dueNowInclVatCents')::bigint <> expected_due_now + (input_snapshot->>'dueNowVatCents')::bigint
     or (input_snapshot->>'remainingExVatCents')::bigint <> greatest(0, expected_one_time - expected_due_now) then
    raise exception using errcode='23514', message='Offer payment totals are inconsistent.';
  end if;
  if coalesce(has_custom,false) and actor_role <> 'super_admin' then
    raise exception using errcode='42501', message='Custom prices require super_admin authorization.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(input_lines) line
    where line->>'priceClassification'='custom'
      and line->>'customPriceAuthorizedBy' is distinct from input_actor_profile_id::text
  ) then
    raise exception using errcode='42501', message='Custom price authorization identity mismatch.';
  end if;

  if input_offer_id is null then
    select * into offer_record from public.commercial_offers where creation_idempotency_key=input_idempotency_key;
    if found then
      if offer_record.relationship_type<>input_relationship_type or offer_record.relationship_id<>input_relationship_id then
        raise exception using errcode='42501', message='Offer idempotency scope mismatch.';
      end if;
      select * into version_record from public.commercial_offer_versions where id=offer_record.current_version_id;
      return jsonb_build_object('offerId',offer_record.id,'offerVersionId',version_record.id,'versionNumber',version_record.version_number,'status',version_record.status,'snapshotChecksum',version_record.snapshot_checksum_sha256,'duplicate',true);
    end if;
  else
    select * into duplicate_event from public.commercial_offer_events where offer_id=input_offer_id and idempotency_key=input_idempotency_key || ':version';
    if found then
      select * into version_record from public.commercial_offer_versions where id=duplicate_event.offer_version_id;
      return jsonb_build_object('offerId',input_offer_id,'offerVersionId',version_record.id,'versionNumber',version_record.version_number,'status',version_record.status,'snapshotChecksum',version_record.snapshot_checksum_sha256,'duplicate',true);
    end if;
  end if;

  if input_offer_id is null then
    insert into public.commercial_offers(
      relationship_type,relationship_id,lead_id,customer_id,demo_journey_id,factory_project_id,
      title,creation_idempotency_key,created_by_profile_id,created_by_auth_user_id
    ) values(
      input_relationship_type,input_relationship_id,
      case when input_relationship_type='lead' then input_relationship_id end,
      case when input_relationship_type='customer' then input_relationship_id end,
      input_demo_journey_id,input_factory_project_id,input_title,input_idempotency_key,input_actor_profile_id,input_actor_auth_user_id
    ) returning * into offer_record;
    insert into public.commercial_offer_events(offer_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,new_status,idempotency_key,safe_metadata)
    values(offer_record.id,'offer.created',input_actor_profile_id,input_actor_auth_user_id,actor_role,'draft',input_idempotency_key || ':offer','{}');
  else
    select * into offer_record from public.commercial_offers where id=input_offer_id for update;
    if not found or offer_record.relationship_type<>input_relationship_type or offer_record.relationship_id<>input_relationship_id then
      raise exception using errcode='42501', message='Offer relationship mismatch.';
    end if;
  end if;

  select * into previous_version from public.commercial_offer_versions where id=offer_record.current_version_id for update;
  if found and previous_version.status not in ('revoked','superseded','expired','declined','failed','accepted') then
    update public.commercial_offer_versions set status='superseded',superseded_at=clock_timestamp(),lifecycle_reason='Vervangen door een nieuwe inhoudelijke versie.',updated_at=clock_timestamp() where id=previous_version.id;
    insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
    values(offer_record.id,previous_version.id,'offer.superseded',input_actor_profile_id,input_actor_auth_user_id,actor_role,'Vervangen door een nieuwe inhoudelijke versie.',previous_version.status,'superseded',input_idempotency_key || ':supersede','{}');
  end if;

  select coalesce(max(version_number),0)+1 into next_version from public.commercial_offer_versions where offer_id=offer_record.id;
  insert into public.commercial_offer_versions(
    offer_id,version_number,catalog_version_id,catalog_key,catalog_version,catalog_checksum_sha256,snapshot_checksum_sha256,snapshot,
    payment_choice,one_time_ex_vat_cents,one_time_vat_cents,one_time_incl_vat_cents,
    recurring_ex_vat_cents,recurring_vat_cents,recurring_incl_vat_cents,
    fixed_deposit_ex_vat_cents,due_now_ex_vat_cents,due_now_vat_cents,due_now_incl_vat_cents,
    remaining_ex_vat_cents,has_non_binding_lines,internal_change_reason,created_by_profile_id,created_by_auth_user_id
  ) values(
    offer_record.id,next_version,catalog_record.id,input_snapshot->>'catalogKey',input_snapshot->>'catalogVersion',input_snapshot->>'catalogChecksum',input_snapshot->>'checksum',input_snapshot,
    input_snapshot->>'paymentChoice',(input_snapshot->>'oneTimeExVatCents')::bigint,(input_snapshot->>'oneTimeVatCents')::bigint,(input_snapshot->>'oneTimeInclVatCents')::bigint,
    (input_snapshot->>'recurringExVatCents')::bigint,(input_snapshot->>'recurringVatCents')::bigint,(input_snapshot->>'recurringInclVatCents')::bigint,
    (input_snapshot->>'fixedDepositExVatCents')::bigint,(input_snapshot->>'dueNowExVatCents')::bigint,(input_snapshot->>'dueNowVatCents')::bigint,(input_snapshot->>'dueNowInclVatCents')::bigint,
    (input_snapshot->>'remainingExVatCents')::bigint,coalesce((input_snapshot->>'hasNonBindingLines')::boolean,false),nullif(btrim(input_change_reason),''),input_actor_profile_id,input_actor_auth_user_id
  ) returning * into version_record;

  for line_record in select value from jsonb_array_elements(input_lines) loop
    insert into public.commercial_offer_lines(
      offer_version_id,product_id,product_code,product_name,product_description,component_code,component_type,billing_interval,quantity,
      price_classification,binding_state,original_catalog_unit_ex_vat_cents,unit_ex_vat_cents,subtotal_ex_vat_cents,vat_rate_basis_points,
      vat_cents,total_incl_vat_cents,custom_price_reason,custom_price_authorized_by_profile_id,position
    ) values(
      version_record.id,line_record->>'productId',line_record->>'productCode',line_record->>'productName',coalesce(line_record->>'productDescription',''),
      line_record->>'componentCode',line_record->>'componentType',nullif(line_record->>'billingInterval',''),(line_record->>'quantity')::integer,
      line_record->>'priceClassification',line_record->>'bindingState',(line_record->>'originalCatalogUnitExVatCents')::bigint,
      (line_record->>'unitExVatCents')::bigint,(line_record->>'subtotalExVatCents')::bigint,round((line_record->>'vatRate')::numeric*100)::integer,
      (line_record->>'vatCents')::bigint,(line_record->>'totalInclVatCents')::bigint,nullif(line_record->>'customPriceReason',''),
      nullif(line_record->>'customPriceAuthorizedBy','')::uuid,(line_record->>'position')::integer
    );
  end loop;

  for document_record in select value from jsonb_array_elements(coalesce(input_documents,'[]'::jsonb)) loop
    insert into public.commercial_offer_document_bindings(
      offer_version_id,document_type,version_code,template_code,checksum_sha256,storage_bucket,storage_path,source_url,required,metadata
    ) values(
      version_record.id,document_record->>'documentType',document_record->>'versionCode',nullif(document_record->>'templateCode',''),document_record->>'checksumSha256',
      nullif(document_record->>'storageBucket',''),nullif(document_record->>'storagePath',''),nullif(document_record->>'sourceUrl',''),
      coalesce((document_record->>'required')::boolean,true),coalesce(document_record->'metadata','{}'::jsonb)
    );
  end loop;

  update public.commercial_offers set current_version_id=version_record.id,status='draft',updated_at=clock_timestamp() where id=offer_record.id;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.version_created',input_actor_profile_id,input_actor_auth_user_id,actor_role,nullif(btrim(input_change_reason),''),'draft',input_idempotency_key || ':version',jsonb_build_object('versionNumber',next_version,'catalogVersion',version_record.catalog_version));
  if previous_version.id is not null then
    insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
    values(offer_record.id,version_record.id,'offer.changed',input_actor_profile_id,input_actor_auth_user_id,actor_role,nullif(btrim(input_change_reason),''),previous_version.status,'draft',input_idempotency_key || ':changed',jsonb_build_object('previousVersionNumber',previous_version.version_number,'newVersionNumber',next_version));
  end if;
  if coalesce(has_custom,false) then
    insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,new_status,idempotency_key,safe_metadata)
    values(offer_record.id,version_record.id,'offer.custom_price_authorized',input_actor_profile_id,input_actor_auth_user_id,actor_role,nullif(btrim(input_change_reason),''),'draft',input_idempotency_key || ':custom-price',jsonb_build_object('customLineCount',(select count(*) from jsonb_array_elements(input_lines) l where l->>'priceClassification'='custom')));
  end if;
  return jsonb_build_object('offerId',offer_record.id,'offerVersionId',version_record.id,'versionNumber',next_version,'status','draft','snapshotChecksum',version_record.snapshot_checksum_sha256);
end
$function$;

revoke all on function public.commercial_create_offer_version_v1(uuid,uuid,text,uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.commercial_create_offer_version_v1(uuid,uuid,text,uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,text,text) to service_role;

commit;
