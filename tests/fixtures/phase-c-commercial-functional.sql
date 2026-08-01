\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
insert into public.profiles(id,auth_user_id,role,status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','super_admin','active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','sales','active');
insert into public.leads(id,assigned_user_id,metadata) values
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','{}'),
  ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','{}');
insert into public.demo_journeys(id,lead_id) values
  ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333'),
  ('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444');
insert into public.factory_projects(id,relationship_type,relationship_id) values
  ('77777777-7777-4777-8777-777777777777','lead','33333333-3333-4333-8333-333333333333'),
  ('88888888-8888-4888-8888-888888888888','lead','44444444-4444-4444-8444-444444444444');

select public.commercial_register_catalog_version_v1(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'maxwebstudio-commercial','test-v1',repeat('a',64),
  '{"catalogKey":"maxwebstudio-commercial","version":"test-v1"}'::jsonb
);

do $certification$
declare first_result jsonb;
declare second_result jsonb;
declare first_version uuid;
declare second_version uuid;
declare v_offer_id uuid;
declare first_snapshot jsonb := '{
  "catalogKey":"maxwebstudio-commercial","catalogVersion":"test-v1","catalogChecksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "currency":"EUR","vatRate":21,"paymentChoice":"fixed_deposit","oneTimeExVatCents":99500,"oneTimeVatCents":20895,"oneTimeInclVatCents":120395,
  "recurringExVatCents":0,"recurringVatCents":0,"recurringInclVatCents":0,"fixedDepositExVatCents":30000,"dueNowExVatCents":30000,
  "dueNowVatCents":6300,"dueNowInclVatCents":36300,"remainingExVatCents":69500,"hasNonBindingLines":false,
  "lines":[{"productId":"business_website","productCode":"WEB-BUSINESS","productName":"Business Website","productDescription":"Test",
  "componentCode":"sale","componentType":"one_time","billingInterval":null,"quantity":1,"priceClassification":"fixed","bindingState":"binding",
  "originalCatalogUnitExVatCents":99500,"unitExVatCents":99500,"subtotalExVatCents":99500,"vatRate":21,"vatCents":20895,
  "totalInclVatCents":120395,"customPriceReason":null,"customPriceAuthorizedBy":null,"position":0}],
  "checksum":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","customPriceEvents":[]}'::jsonb;
declare second_snapshot jsonb;
begin
  first_result := public.commercial_create_offer_version_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','lead','33333333-3333-4333-8333-333333333333',null,
    'Lokaal gecertificeerd voorstel','55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-777777777777',
    first_snapshot,first_snapshot->'lines',
    '[{"documentType":"quote","versionCode":"offer-view-2026-07","templateCode":"offer-view-v1","checksumSha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","storageBucket":"commercial-templates","storagePath":"offer-view-v1/offer-view-2026-07","sourceUrl":null,"required":true,"metadata":{}}]'::jsonb,
    'Eerste lokale certificeringsversie','phase-c:db:first:0001'
  );
  first_version := (first_result->>'offerVersionId')::uuid;
  v_offer_id := (first_result->>'offerId')::uuid;
  if first_result->>'status' <> 'draft' then raise exception 'first version was not draft'; end if;

  second_snapshot := jsonb_set(jsonb_set(jsonb_set(first_snapshot,'{checksum}','"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"'),'{lines,0,productDescription}','"Test met afgebakende wijziging"'),'{lines}',jsonb_set(first_snapshot->'lines','{0,productDescription}','"Test met afgebakende wijziging"'));
  second_result := public.commercial_create_offer_version_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','lead','33333333-3333-4333-8333-333333333333',v_offer_id,
    'Lokaal gecertificeerd voorstel','55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-777777777777',
    second_snapshot,second_snapshot->'lines','[]'::jsonb,'Omschrijving gecontroleerd gewijzigd','phase-c:db:second:0002'
  );
  second_version := (second_result->>'offerVersionId')::uuid;
  if (select status from public.commercial_offer_versions where id=first_version) <> 'superseded' then raise exception 'old version was not superseded'; end if;
  if (select count(*) from public.commercial_offer_versions where commercial_offer_versions.offer_id=v_offer_id) <> 2 then raise exception 'immutable version count mismatch'; end if;
  if (select count(*) from public.commercial_offer_events where commercial_offer_events.offer_id=v_offer_id) < 5 then raise exception 'append-only audit evidence missing'; end if;

  perform public.commercial_transition_offer_version_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',second_version,'ready_for_review',null,'phase-c:db:ready:0003'
  );
  if (select status from public.commercial_offer_versions where id=second_version) <> 'ready_for_review' then raise exception 'ready transition failed'; end if;

  begin
    update public.commercial_offer_versions set snapshot='{}'::jsonb where id=second_version;
    raise exception 'immutable content update unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.commercial_offer_events where commercial_offer_events.offer_id=v_offer_id;
    raise exception 'audit deletion unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.commercial_create_offer_version_v1(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','lead','33333333-3333-4333-8333-333333333333',null,
      'Verboden voorstel',null,null,first_snapshot,first_snapshot->'lines','[]'::jsonb,null,'phase-c:db:tenant:0004'
    );
    raise exception 'cross-relationship write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$certification$;

select jsonb_build_object(
  'catalog_versions',(select count(*) from public.commercial_catalog_versions),
  'offers',(select count(*) from public.commercial_offers),
  'versions',(select count(*) from public.commercial_offer_versions),
  'lines',(select count(*) from public.commercial_offer_lines),
  'events',(select count(*) from public.commercial_offer_events),
  'ready_versions',(select count(*) from public.commercial_offer_versions where status='ready_for_review'),
  'superseded_versions',(select count(*) from public.commercial_offer_versions where status='superseded')
) as phase_c_local_database_certification;
