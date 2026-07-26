-- Partner Onboarding V1 / B3: versioned training content.
-- Staging-integrated migration version: 20260726202000.
-- Published versions are immutable; existing onboarding assignments remain stable.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.partner_onboardings') is null
     or pg_catalog.to_regclass('public.partner_onboarding_steps') is null then
    raise exception using errcode = '55000', message = 'Partner B3 requires the B2 onboarding foundation.';
  end if;
end
$preflight$;

create table public.partner_training_versions (
  id uuid primary key default gen_random_uuid(),
  version_code text not null unique check (version_code ~ '^partner_training_[a-z]{2}_v[0-9]+$'),
  locale text not null default 'nl-NL',
  title text not null,
  introduction text not null,
  status text not null check (status in ('draft','published','retired')),
  legal_review_status text not null default 'not_legal_content' check (
    legal_review_status in ('not_legal_content','review_required','reviewed')
  ),
  effective_from timestamptz,
  effective_until timestamptz,
  published_at timestamptz,
  published_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint partner_training_version_publish_check check (
    status <> 'published' or (published_at is not null and effective_from is not null)
  )
);

create table public.partner_training_modules (
  id uuid primary key default gen_random_uuid(),
  training_version_id uuid not null references public.partner_training_versions(id) on delete restrict,
  step_key text not null,
  display_order smallint not null check (display_order between 1 and 100),
  title text not null,
  summary text not null,
  content jsonb not null check (
    jsonb_typeof(content) = 'object' and jsonb_typeof(content -> 'sections') = 'array'
  ),
  acknowledgement_text text not null,
  estimated_minutes smallint not null default 5 check (estimated_minutes between 1 and 120),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (training_version_id, step_key),
  unique (training_version_id, display_order)
);

create function public.partner_published_training_immutable_guard()
returns trigger language plpgsql set search_path = pg_catalog, public
as $function$
declare
  version_status text;
begin
  if tg_table_name = 'partner_training_versions' then
    if old.status = 'published' then
      raise exception using errcode = '55000', message = 'Published partner training versions are immutable.';
    end if;
  else
    select status into version_status from public.partner_training_versions where id = old.training_version_id;
    if version_status = 'published' then
      raise exception using errcode = '55000', message = 'Modules in published partner training versions are immutable.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

create trigger partner_training_versions_immutable
before update or delete on public.partner_training_versions
for each row execute function public.partner_published_training_immutable_guard();
create trigger partner_training_modules_immutable
before update or delete on public.partner_training_modules
for each row execute function public.partner_published_training_immutable_guard();

with version as (
  insert into public.partner_training_versions (
    version_code, locale, title, introduction, status, legal_review_status,
    effective_from, published_at
  ) values (
    'partner_training_nl_v1', 'nl-NL',
    'Max Webstudio Partnertraining',
    'Leer onze visie, zorgvuldige werkwijze en regels voor professioneel en verantwoord klantcontact kennen.',
    'published', 'not_legal_content', clock_timestamp(), clock_timestamp()
  ) returning id
)
insert into public.partner_training_modules (
  training_version_id, step_key, display_order, title, summary, content,
  acknowledgement_text, estimated_minutes
)
select version.id, module.step_key, module.display_order, module.title, module.summary,
  module.content, module.acknowledgement_text, module.estimated_minutes
from version
cross join lateral (values
  ('welcome', 1, 'Welkom bij Max Webstudio',
   'Dit programma bereidt je voor op een zelfstandige, transparante samenwerking.',
   jsonb_build_object('sections', jsonb_build_array(
     jsonb_build_object('heading','Jouw route','paragraphs',jsonb_build_array('Je leest zeven trainingshoofdstukken, accepteert de actuele voorwaarden, maakt een kennistoets en rondt de vereiste documenten af. Je voortgang wordt veilig opgeslagen.'),'bullets',jsonb_build_array('Je account geeft tijdens onboarding nog geen toegang tot commerciële functies.','Je kunt later verdergaan waar je bent gebleven.','Vragen of onduidelijkheden bespreek je met je toegewezen manager.')),
     jsonb_build_object('heading','De samenwerking','paragraphs',jsonb_build_array('Je werkt als zelfstandig salespartner en helpt ondernemers de juiste digitale oplossing te vinden. Zorgvuldigheid en klantbelang gaan voor een snelle verkoop.'),'bullets',jsonb_build_array())
   )),
   'Ik heb de uitleg over het programma en de vervolgstappen gelezen en begrepen.', 4),
  ('vision', 2, 'Samen bouwen aan digitale groei',
   'Onze visie, missie en kernwaarden vormen de basis van ieder klantcontact.',
   jsonb_build_object('sections', jsonb_build_array(
     jsonb_build_object('heading','Visie','paragraphs',jsonb_build_array('Max Webstudio helpt ondernemers professioneel online groeien zonder dat zij voor iedere dienst met een andere leverancier hoeven te werken. Websites en webshops vormen het vertrekpunt voor een geïntegreerd platform met hosting, domeinen, zakelijke e-mail, branding, SEO, content, advertenties, telefonie, automatisering, CRM, klantportalen en online betalingen.','We willen geen losse website verkopen, maar een langdurige groeipartner zijn die techniek, verkoop, marketing, automatisering en service samenbrengt.'),'bullets',jsonb_build_array()),
     jsonb_build_object('heading','Missie','paragraphs',jsonb_build_array('Professionele digitale dienstverlening bereikbaar maken voor iedere ondernemer. We laten bij demo’s eerst concreet zien wat mogelijk is, zodat een ondernemer beslist op basis van zichtbare waarde.'),'bullets',jsonb_build_array()),
     jsonb_build_object('heading','Kernwaarden','paragraphs',jsonb_build_array(),'bullets',jsonb_build_array('Eerst waarde leveren.','Eerlijk en transparant communiceren.','Afspraak is afspraak.','Klantbelang boven snelle verkoop.','Geen misleidende of ongeoorloofde verkooptechnieken.','Relevante klantinformatie correct vastleggen.','Continu verbeteren en bouwen aan langdurige relaties.'))
   )),
   'Ik heb de visie, missie en kernwaarden gelezen en begrepen.', 7),
  ('working_principles', 3, 'Werkwijze en verwachtingen',
   'Werk zelfstandig binnen heldere kaders en gebruik alleen goedgekeurde proposities.',
   jsonb_build_object('sections', jsonb_build_array(
     jsonb_build_object('heading','Zelfstandig en verantwoordelijk','paragraphs',jsonb_build_array('Je organiseert je werkzaamheden zelfstandig en bent verantwoordelijk voor een professionele uitvoering. Er is geen bevoegdheid om Max Webstudio juridisch te binden.'),'bullets',jsonb_build_array('Gebruik alleen actuele, goedgekeurde prijzen en proposities.','Beloof geen korting, resultaat, functionaliteit of levertijd zonder bevoegdheid.','Leg belangrijke afspraken objectief vast.','Meld fouten, klachten en risico’s tijdig.')),
     jsonb_build_object('heading','Salesethiek','paragraphs',jsonb_build_array('Druk, misleiding, ongeoorloofde claims en het verbergen van relevante voorwaarden passen niet bij Max Webstudio.'),'bullets',jsonb_build_array('Onderzoek eerst de werkelijke behoefte.','Geef ruimte voor vragen en een weloverwogen beslissing.','Respecteer een afwijzing en contactvoorkeuren.'))
   )),
   'Ik begrijp de werkwijze, grenzen en verwachtingen voor zelfstandige salespartners.', 7),
  ('lead_and_task_registration', 4, 'Leads, agenda, taken en notities',
   'Goede registratie maakt opvolging betrouwbaar, overdraagbaar en controleerbaar.',
   jsonb_build_object('sections', jsonb_build_array(
     jsonb_build_object('heading','Een geldige lead','paragraphs',jsonb_build_array('Gebruik uitsluitend zakelijke en rechtmatige bronnen, controleer op duplicaten en leg de herkomst vast.'),'bullets',jsonb_build_array('Bedrijfsnaam, contactgegevens en website waar beschikbaar.','Vestigingsplaats, branche, bron en reden van relevantie.','Verantwoordelijke partner, contactstatus en opvolgdatum.')),
     jsonb_build_object('heading','Na ieder contact','paragraphs',jsonb_build_array('Werk de status direct bij zodat een collega het dossier zonder aannames kan overnemen.'),'bullets',jsonb_build_array('Maak een korte, objectieve notitie.','Leg een concrete volgende actie en eigenaar vast.','Plan een datum als opvolging nodig is.','Zet afspraken correct in de agenda.')),
     jsonb_build_object('heading','Demo, offerte en betaling','paragraphs',jsonb_build_array('Deel alleen de officiële previewlink en gebruik uitsluitend offertes en betaallinks uit het systeem.'),'bullets',jsonb_build_array('Wijzig bedragen niet buiten het systeem.','Accepteer nooit betaling op een privérekening.','Laat definitieve acceptatie via de officiële klantflow verlopen.'))
   )),
   'Ik weet welke lead-, taak-, agenda- en contactgegevens ik tijdig moet registreren.', 9),
  ('privacy_confidentiality', 5, 'Privacy, AVG en vertrouwelijkheid',
   'Verwerk alleen noodzakelijke gegevens en behandel klant- en bedrijfsinformatie vertrouwelijk.',
   jsonb_build_object('sections', jsonb_build_array(
     jsonb_build_object('heading','Dataminimalisatie','paragraphs',jsonb_build_array('Leg alleen zakelijke en voor het verkoopproces noodzakelijke informatie vast. Vrije notities zijn geen plek voor bijzondere of irrelevante persoonsgegevens.'),'bullets',jsonb_build_array('Gebruik de officiële systemen en accounts.','Deel gegevens alleen met bevoegde personen.','Exporteer of kopieer geen bestanden zonder zakelijke noodzaak.','Meld een mogelijk datalek of verkeerd geadresseerd bericht direct.')),
     jsonb_build_object('heading','Veilig werken','paragraphs',jsonb_build_array('Bescherm apparaten en sessies met sterke toegang en laat klantgegevens niet onbeheerd zichtbaar achter.'),'bullets',jsonb_build_array('Gebruik geen gedeelde wachtwoorden.','Controleer ontvangers en bijlagen vóór verzending.','Bewaar klantdata niet structureel op privéapparaten.'))
   )),
   'Ik begrijp mijn verantwoordelijkheid voor privacy, informatiebeveiliging en vertrouwelijkheid.', 8),
  ('responsible_customer_contact', 6, 'Verantwoord klantcontact',
   'Benader ondernemers relevant, respectvol en via passende zakelijke kanalen.',
   jsonb_build_object('sections', jsonb_build_array(
     jsonb_build_object('heading','Professionele benadering','paragraphs',jsonb_build_array('Telefonie, zakelijke e-mail, LinkedIn, WhatsApp of een afspraak kunnen passend zijn wanneer het kanaal en contact rechtmatig en redelijk zijn.'),'bullets',jsonb_build_array('Maak direct duidelijk wie je bent en waarom je contact opneemt.','Gebruik geen misleidende identiteit of schaarste.','Respecteer bezwaren, uitschrijvingen en het verzoek niet meer te bellen.','Noteer relevante contactvoorkeuren.')),
     jsonb_build_object('heading','Klantbelang','paragraphs',jsonb_build_array('Adviseer alleen wat bij de situatie past en wees eerlijk over beperkingen, planning en vervolgonderzoek.'),'bullets',jsonb_build_array('Stel open vragen.','Vat de behoefte samen.','Scheid feiten van verwachtingen.','Escalatieer inhoudelijke onzekerheid naar een bevoegde collega.'))
   )),
   'Ik zal ondernemers zorgvuldig, transparant en met respect voor hun voorkeuren benaderen.', 8),
  ('sales_process_call_script', 7, 'Salesproces en belstructuur',
   'Een vaste structuur helpt om behoefte, waarde en vervolgafspraken eerlijk te bespreken.',
   jsonb_build_object('sections', jsonb_build_array(
     jsonb_build_object('heading','Voorbereiding','paragraphs',jsonb_build_array('Controleer de organisatie, website, bron en eerdere contactmomenten voordat je belt.'),'bullets',jsonb_build_array('Formuleer een relevante aanleiding.','Controleer de actuele propositie en prijsinformatie.','Bepaal welk concreet vervolg passend kan zijn.')),
     jsonb_build_object('heading','Gespreksstructuur','paragraphs',jsonb_build_array('Gebruik het script als professionele leidraad, niet als drukmiddel.'),'bullets',jsonb_build_array('Introductie en toestemming om kort toe te lichten.','Open vragen over doelen, huidige situatie en knelpunten.','Samenvatting en passende waardepropositie.','Eerlijke behandeling van vragen en bezwaren.','Concrete vervolgactie met eigenaar en datum.')),
     jsonb_build_object('heading','Afronding','paragraphs',jsonb_build_array('Registreer uitkomst, afspraken en vervolgstap direct. Een toezegging die niet is vastgelegd, is niet overdraagbaar.'),'bullets',jsonb_build_array())
   )),
   'Ik begrijp het salesproces en gebruik de gespreksstructuur zonder ongeoorloofde druk of toezeggingen.', 9)
) as module(step_key, display_order, title, summary, content, acknowledgement_text, estimated_minutes);

alter table public.partner_training_versions enable row level security;
alter table public.partner_training_modules enable row level security;

create policy partner_training_versions_assigned_read on public.partner_training_versions
for select to authenticated using (
  status = 'published' and exists (
    select 1 from public.partner_onboardings po
    join public.partner_profiles pp on pp.id = po.partner_profile_id
    join public.profiles p on p.id = pp.profile_id
    where po.training_program_version = version_code
      and (p.auth_user_id = auth.uid() or public.has_app_role(array['super_admin','admin'])
        or (pp.assigned_manager_profile_id = public.current_profile_id() and public.has_app_role(array['sales_manager'])))
  )
);
create policy partner_training_modules_assigned_read on public.partner_training_modules
for select to authenticated using (
  exists (select 1 from public.partner_training_versions ptv
    where ptv.id = training_version_id and ptv.status = 'published'
      and exists (select 1 from public.partner_onboardings po
        join public.partner_profiles pp on pp.id = po.partner_profile_id
        join public.profiles p on p.id = pp.profile_id
        where po.training_program_version = ptv.version_code
          and (p.auth_user_id = auth.uid() or public.has_app_role(array['super_admin','admin'])
            or (pp.assigned_manager_profile_id = public.current_profile_id() and public.has_app_role(array['sales_manager'])))))
);

revoke all on public.partner_training_versions, public.partner_training_modules from public, anon, authenticated;
grant select on public.partner_training_versions, public.partner_training_modules to authenticated;
grant select, insert, update on public.partner_training_versions, public.partner_training_modules to service_role;
revoke all on function public.partner_published_training_immutable_guard() from public, anon, authenticated;
grant execute on function public.partner_published_training_immutable_guard() to service_role;

commit;
