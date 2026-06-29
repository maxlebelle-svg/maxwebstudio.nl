# Staging Reset Plan

Status: uitvoeringsplan. Nog geen reset uitgevoerd.

## Doel

De Supabase staging/testdatabase terugbrengen naar een schone canonical basis, zodat Fase 28 opnieuw vanaf `001_schema_tables.sql` kan worden uitgevoerd zonder schema-drift patches of compatibiliteitsuitzonderingen.

Deze reset is bedoeld voor het gelinkte test/staging project `maxwebstudio-test`. Productie mag niet geraakt worden.

## Aanleiding

Tijdens Fase 28 is `001_schema_tables.sql` geslaagd, maar `002_indexes.sql` geblokkeerd op:

```text
ERROR 42703: column "lead_score" does not exist
```

De oorzaak is schema drift: de stagingdatabase bevat al een oudere `public.leads` tabel zonder `lead_score`. Omdat de schema draft `create table if not exists` gebruikt, wordt een bestaande afwijkende tabel niet automatisch gecorrigeerd.

## Besluit

Er wordt bewust niet gekozen voor een schema-drift patch.

Redenen:

- Staging moet de canonical architectuur valideren, niet bestaande afwijkingen accommoderen.
- Drift patches kunnen uitzonderingen introduceren die later niet bij productie passen.
- RLS/customer-isolation tests op een driftende database geven onbetrouwbare evidence.
- Een schone stagingbasis is de beste simulatie voor een gecontroleerde productie-uitrol.

## Data-impact

Een volledige staging reset verwijdert of overschrijft alle huidige data in het testproject, waaronder mogelijk:

- oude testklanten;
- testprofiles en auth-koppelingen;
- testwebsites;
- testprojecten;
- testoffertes/facturen;
- testleads;
- demo seed data;
- handmatig ingevoerde RLS/Auth testdata;
- eventuele storage testobjecten, afhankelijk van de gekozen resetroute.

Er mag geen echte klantdata in staging staan. Als dat toch wordt ontdekt, moet de reset direct worden gepauzeerd en moet de data-eigenaar beoordelen of export/verwijdering nodig is.

## Export Vooraf

Voor deze stagingomgeving is export niet bedoeld als productierollback, maar wel nuttig als evidence.

Aanbevolen vooraf vastleggen:

- lijst van bestaande public tabellen;
- kolommen van driftgevoelige tabellen zoals `public.leads`;
- Supabase projectnaam/ref zonder secrets;
- screenshots of queryoutput van de driftfout;
- huidige release decision en blockerstatus.

Optioneel exporteren als er waardevolle testdata is:

- schema-only dump;
- data-only dump van testrecords;
- Storage objectlijst zonder signed URLs of secrets.

Niet exporteren naar Git:

- service role keys;
- database connection strings;
- volledige auth tokens;
- persoonlijke klantdata;
- signed URLs.

## Veilige Resetroute

Voorkeursroute:

1. Bevestig in Supabase Dashboard dat het project `maxwebstudio-test` is.
2. Bevestig dat project ref overeenkomt met de test `SUPABASE_URL`.
3. Bevestig `APP_ENV=test` en `APP_ENVIRONMENT=test`.
4. Maak indien gewenst een staging backup/snapshot of export.
5. Reset de stagingdatabase via Supabase Dashboard of een expliciet goedgekeurde CLI-route.
6. Controleer direct na reset dat de public schema leeg of Supabase-standaard is.
7. Voer Fase 28 opnieuw uit vanaf `001_schema_tables.sql`.

Fallbackroute:

1. Maak een nieuw apart Supabase testproject of testbranch.
2. Link de CLI opnieuw naar dat testproject.
3. Controleer opnieuw projectnaam/ref tegen `.env.local`.
4. Herhaal Fase 28 vanaf `001_schema_tables.sql`.

## Herstartvolgorde Na Reset

Na reset of nieuwe testbranch:

1. `001_schema_tables.sql`
2. `002_indexes.sql`
3. `003_rls_enablement.sql`
4. `004_rls_policies.sql`
5. `005_audit_logging_foundation.sql`
6. `006_seed_demo_data_optional.sql` alleen als test/demo seed expliciet gewenst is.

Stop direct bij de eerste kritieke fout.

## Validatie Na Reset

Controleer minimaal:

- canonical tabellen bestaan;
- oude `customer_*` tabellen zijn niet opnieuw aangemaakt;
- `public.leads` bevat `lead_score`;
- indexes uit `002_indexes.sql` bestaan;
- RLS staat aan na stap 3;
- policies bestaan na stap 4;
- geen RLS-recursie;
- Customer A/B isolation;
- demo user isolation;
- audit logs lekken geen secrets.

## Relatie Met Rollbackplan

Deze reset valt onder `docs/deployment/ROLLBACK_PLAN.md`, sectie `Staging/test rollback`.

Voor staging is rollback primair:

- resetten naar schoon;
- snapshot herstellen;
- nieuwe testbranch/testproject gebruiken;
- migration drafts in Git corrigeren voordat opnieuw wordt uitgevoerd.

Er wordt geen rollback SQL geschreven voor deze stap.

## Approval Voor Uitvoering

Voor reset moet expliciet bevestigd zijn:

- reset raakt uitsluitend staging/test;
- productieproject is niet gelinkt;
- er staat geen echte klantdata in staging;
- export/evidence is voldoende;
- eigenaar accepteert dat testdata verloren gaat;
- Fase 28 wordt na reset vanaf stap 1 herhaald.

## Status

Huidige status: `READY_FOR_MANUAL_APPROVAL`.

De reset is nog niet uitgevoerd. Fase 28 blijft `NO-GO / BLOCKED` totdat staging schoon is en alle migration drafts plus RLS/customer-isolation tests slagen.
