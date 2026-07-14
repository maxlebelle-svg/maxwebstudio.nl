# Contractmatrix accountmail, leadopvolging en attributie — 14 juli 2026

Deze matrix is vóór implementatie opgesteld. Hij beschrijft het canonieke doelcontract en voorkomt parallelle status- en attributiemodellen.

## Accountmail

| Relatie | Identiteit | Profielrol | Portal | Handmatige acties | Canonieke serverroute |
| --- | --- | --- | --- | --- | --- |
| Lead met goedgekeurde demo | Eén Auth-user per genormaliseerd e-mailadres; bestaande identiteit hergebruiken | `demo_user` tenzij dezelfde identiteit al legitiem `customer` is | Beperkte lead-previewportal | Demo-uitnodiging, accountuitnodiging, opnieuw versturen, nieuwe activatielink | `admin-lead-demo-invitation` |
| Lead zonder bruikbare demo | Geen lege of kapotte portalidentiteit maken | Geen wijziging | Niet beschikbaar | Actie zichtbaar, maar server meldt dat eerst een demo moet worden gekoppeld en goedgekeurd | `admin-lead-demo-invitation` fail-closed |
| Klant zonder account | Eén Auth-user; customerprofile upserten | `customer` | Klantportaal | Account uitnodigen, welkomstmail | `admin-customer-welcome-email` |
| Klant met uitnodiging | Bestaande Auth-user/profile hergebruiken | `customer` | Klantportaal | Opnieuw uitnodigen, nieuwe activatielink | `admin-customer-welcome-email` |
| Klant met actief account | Bestaande Auth-user/profile hergebruiken | `customer` | Klantportaal | Nieuwe inlog-/herstellink of welkomstmail; geen misleidende accountcreatiecopy | `admin-customer-welcome-email` / `client-password-reset` |

De browser levert uitsluitend `relationshipType`, `relationshipId`, actie en een unieke actie-ID. E-mail, rol en accountstatus worden server-side opgelost.

## Leadstatus versus contactuitkomst

| Begrip | Canoniek veld | Betekenis |
| --- | --- | --- |
| Lifecycle | `lead_status` | Brede commerciële fase (`new`, `interesting`, `follow_up`, `won`, `lost`, enzovoort) |
| Operationele contactuitkomst | bestaand `last_call_outcome` | Laatste bel-/contactresultaat; geen tweede lifecycle |
| Volgende actie | bestaand `next_action_type` + `next_action_at` | Concrete opvolging |
| Actor/tijd | `last_contacted_by`, `last_contacted_at`, timeline | Wie het contact vastlegde en wanneer |

De vier operationele groepen gebruiken dus bestaande velden:

| Groep | `last_call_outcome` | `lead_status` | Verplichte opvolging |
| --- | --- | --- | --- |
| Geïnteresseerd | `interested` | `interesting` | Optioneel |
| Niet geïnteresseerd | `not_interested` | `lost` | Reden optioneel; blijft zichtbaar via Alle leads |
| Voicemail | `voicemail_left` | `follow_up` | Nieuwe opvolgdatum direct aangeboden |
| Terugbelafspraak | `callback_requested` | `follow_up` | `next_action_at` verplicht |

## Attributie

| Begrip | Canoniek veld | Contract |
| --- | --- | --- |
| Technisch bronsysteem | bestaand `external_source` | Exact systeem of formulier, bijvoorbeeld `homepage-contact-form` of `admin` |
| Externe deduplicatiesleutel | bestaand `external_source_id` | Technische bron-ID; niet gebruiken als commercieel kanaal |
| Commercieel acquisitiekanaal | nieuw `acquisition_channel` | Eén van `website`, `email`, `outbound_sales`, `referral`, `phone`, `social`, `partner`, `manual`, `import`, `other` |
| Ingebracht door | nieuw `sourced_by_user_id` | Expliciete interne gebruiker; NULL blijft Onbekend |
| Record aangemaakt door | bestaand `created_by` | Auditactor van creatie; blijft historisch onveranderd |
| Eigenaar | bestaand `owner_id` | Commerciële eindverantwoordelijke |
| Toegewezen aan | bestaand `assigned_user_id` (legacy `assigned_to` tijdelijk lezen) | Medewerker die de actuele opvolging uitvoert |
| Sale gesloten door | nieuw `closed_by_user_id` | Alleen expliciet zetten bij `win`; niet afleiden uit eigenaar of creator |
| Verkoopdatum | bestaand `won_at` | Tijdstip van expliciete succesvolle sale |

`won_by` blijft tijdelijk leescompatibel, maar nieuwe code schrijft dezelfde expliciete actor ook naar `closed_by_user_id`. Historische NULL-waarden worden niet automatisch ingevuld.

## Conversie en rapportage

- De originele bron, sourcer en creator blijven op de lead staan.
- Een succesvolle sale legt expliciet `closed_by_user_id` en `won_at` vast.
- Een klant- of orderrecord krijgt alleen overgenomen attributie wanneer de conversieroute die waarden aantoonbaar en atomair kan bewaren.
- De huidige lokale lead-naar-klantwizard is geen betrouwbare productionele commerciële transactie en wordt in deze fase niet gebruikt om historische attributie te verzinnen.
- Rapportages tonen `Onbekend` wanneer kanaal, sourcer of closer ontbreekt.
- Medewerkeromzet mag pas op `closed_by_user_id` worden gebaseerd zodra omzetrecords betrouwbaar aan de betreffende lead/conversie zijn gekoppeld.

## Compatibiliteit

- Geen bestaande migratie wordt gewijzigd.
- Nieuwe kolommen zijn eerst nullable en additief.
- Applicatiecode leest nieuwe kolommen met metadata/legacy fallbacks, maar schrijft geen verzonnen fallbackwaarden.
- `owner_id`, `assigned_user_id` en `assigned_to` worden niet samengevoegd via destructieve backfill.
- De bestaande `last_call_outcome`-kolom wordt hergebruikt; er komt geen parallel `contact_outcome`-veld.

## Migratieplan — nog niet uitvoeren

De forward-only migratie is `supabase/migrations/20260714190000_lead_source_sales_attribution.sql`. Voor productie is afzonderlijke goedkeuring nodig.

Preflight vóór uitvoering:

1. Bevestig dat `public.leads` en `public.customers` bestaan en maak een schema-/databaseback-up.
2. Bevestig dat de lifecyclemigraties tot en met `20260710170500_sales_assignment_calling_follow_up_pipeline.sql` zijn toegepast.
3. Controleer dat bestaande RLS-policies en grants ongewijzigd kunnen blijven; deze migratie wijzigt ze niet.
4. Controleer dat er geen gelijknamige kolommen met een afwijkend type of afwijkende foreign key bestaan.
5. Voer de migratie in een stagingkopie uit en controleer nulverlies, bestaande aantallen en insert/update van een testlead.
6. Pas daarna apart goedkeuren voor productie; applicatiecode niet gebruiken als impliciete toestemming om te migreren.

Rollbackstrategie: de applicatie blijft leescompatibel via metadata en bestaande velden. Bij problemen eerst de nieuwe writes uitschakelen/terugdraaien; kolommen niet automatisch droppen omdat inmiddels vastgelegde attributie dan verloren kan gaan. Een eventuele destructieve rollback vereist daarom een aparte, handmatig beoordeelde migratie en export van de nieuwe kolomwaarden.

## Rapportagegrens

Kanaal-, sourcer- en closer-aantallen zijn betrouwbaar zodra de velden expliciet zijn vastgelegd. Omzet per medewerker wordt nog niet getoond: er is in deze wijziging geen bewezen, atomische koppeling tussen een gewonnen lead en een omzetrecord. Ontbrekende historische attributie blijft zichtbaar als `Onbekend` en wordt niet aan Max of de huidige eigenaar toegeschreven.
