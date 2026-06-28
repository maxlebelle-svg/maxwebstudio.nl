# Supabase Setup Guide - Max Webstudio

Fase 11.4 bereidt de echte Supabase-koppeling veilig voor. Dit is nog geen live switch. De demo-omgeving en alle bestaande modules blijven standaard op `localStorage` draaien.

## 1. Supabase project aanmaken

1. Maak een nieuw Supabase project aan.
2. Noteer alleen de publieke waarden:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_PROJECT_ID`
3. Gebruik de service role key nooit in frontendcode.

## 2. SQL uitvoeren

Voer in een testomgeving deze bestanden in volgorde uit:

1. `supabase/schema.sql`
2. `supabase/rls-policies.sql`
3. optioneel: `supabase/seed-demo.sql`

Controleer na iedere stap of er geen errors zijn.

## 3. Environment variables

Gebruik `.env.example` of `.env.local.example` als invullijst:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_PROJECT_ID=
APP_ENV=demo
DATA_PROVIDER=localStorage
```

Voor Netlify komen deze waarden in de Netlify environment settings, niet in de repository.

## 4. Provider mode

Beschikbare modes:

- `localStorage`: standaard actief, veilig voor demo en sales.
- `supabase-prepared`: toont voorbereiding/status, maar voert nog geen live reads/writes uit.
- `supabase-readonly`: voert alleen veilige connectie- en select-checks uit. Writes blijven geblokkeerd.
- `supabase-write-test`: staat alleen testcustomer create/update/delete toe. Geen bulkacties en geen echte klantmigratie.
- `supabase-migration`: staat alleen gecontroleerde customer inserts toe via Developer Mode live migratie. Geen deletes, geen andere tabellen en geen provider switch.

De standaard blijft `localStorage`. Ook na een customer migratie blijft de app lokaal draaien totdat de provider later bewust wordt omgezet.

## 4.1 Frontend runtime config

Browsercode kan Netlify environment variables niet automatisch lezen zonder build/runtime injectie. Maak de publieke Supabase waarden daarom veilig beschikbaar via runtime config, bijvoorbeeld:

```html
<script>
  window.__MAXWEBSTUDIO_SUPABASE_CONFIG__ = {
    SUPABASE_URL: "https://PROJECT.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key",
    SUPABASE_PROJECT_ID: "PROJECT"
  };
</script>
```

Gebruik hier uitsluitend de publieke anon key. De service role key hoort nooit in HTML, JavaScript, localStorage of een publieke bundle.

Als er geen bundler is, kan de read-only test een aanwezige browserclient gebruiken via `window.supabase.createClient` of een expliciet ingestelde `window.__MAXWEBSTUDIO_SUPABASE_MODULE_URL__`. Zonder client crasht de app niet; Developer Mode toont dan dat de client ontbreekt.

## 4.2 Read-only test

Gebruik in Admin Dashboard -> Developer Mode:

1. Zet provider mode op `supabase-readonly`.
2. Klik `Test Supabase verbinding`.
3. Klik `Check customers table`.
4. Klik eventueel `Lees eerste 10 customers`.

Deze checks doen alleen `select`/`count` op de tabel `customers`. Er worden geen records aangemaakt, aangepast of verwijderd.

## 4.3 Customer write-test

Fase 11.9 voegt een gecontroleerde write-test toe voor de tabel `customers`.

De write-test:

- gebruikt provider mode `supabase-write-test`
- werkt alleen in Developer Mode
- vereist een succesvolle read-only connectiecheck
- vereist een succesvolle customers table check
- vraagt dubbele bevestiging in de UI
- schrijft uitsluitend een herkenbaar testrecord

Het testrecord is herkenbaar aan:

- `company_name = Supabase Write Test Klant`
- `name = Supabase Test`
- `email = supabase-write-test@maxwebstudio.nl`
- `status = test`
- `is_demo = true`
- `environment = test`
- `metadata.createdBy = supabase-write-test`
- `metadata.safeToDelete = true`

RLS moet voor deze test alleen toestaan wat nodig is voor dit testrecord. Gebruik nooit de service role key in de frontend. Als `delete` niet lukt, verwijder het testrecord handmatig in Supabase en controleer daarna de RLS policy voor testrecords.

De write-test bewijst alleen dat een veilige individuele create/update/delete technisch mogelijk is. Echte klantmigratie gebruikt daarna een aparte gecontroleerde migratiemodus.

## 4.4 Gecontroleerde customer migratie

Fase 12.0 maakt de eerste live CRM customer migratie naar Supabase `customers` mogelijk onder strikte voorwaarden.

De knop `Start live migratie naar Supabase` wordt alleen actief als:

- Developer Mode aan staat
- provider mode `supabase-write-test` of `supabase-migration` is
- Supabase URL en anon key aanwezig zijn
- Supabase client geladen is
- read-only connectietest succesvol is
- `customers` table bereikbaar is
- write-test succesvol is binnen huidige sessie
- pre-migration backup gemaakt is binnen huidige sessie
- dry-run uitgevoerd is binnen huidige sessie
- write preview bekeken is binnen huidige sessie
- er minimaal 1 klant klaarstaat
- gebruiker dubbele bevestiging geeft

Migratiegedrag:

- alleen tabel `customers`
- batchgewijs, standaard batch size 10
- standaard demo-klanten uitsluiten en productieklanten meenemen
- standaard duplicaten overslaan
- standaard stoppen bij fout
- remote duplicate-check op id/external id indien beschikbaar, e-mail en bedrijf + telefoon
- lokale klantrecords blijven bestaan en krijgen migratievelden zoals `supabaseCustomerId`, `migratedToSupabaseAt`, `migrationStatus`, `migrationBatchId` en `lastMigrationProvider`
- provider switch gebeurt niet automatisch

Rollback is handmatig: gebruik de pre-migration backup om lokale data te herstellen en verwijder test/migratierecords in Supabase handmatig indien nodig. Er is bewust geen bulk-delete gebouwd.

## 4.5 RLS errors oplossen

Als de read-only test een RLS- of permission-error toont:

- Controleer of de tabel `customers` bestaat.
- Controleer of de anon role met RLS minimaal veilige read-policy heeft voor de testcontext.
- Controleer of Supabase Auth/session nodig is voor de policy.
- Test eerst in Supabase SQL editor of policies logisch zijn.
- Zet geen service role key in de frontend om RLS te omzeilen.

## 5. Demo/localStorage blijft werken

Zolang `DATA_PROVIDER=localStorage` of de dashboardsetting op localStorage staat:

- demo-login blijft lokaal
- demo-klantreis blijft lokaal
- demo e-mails blijven lokaal
- import/export blijft lokaal
- CRM/offertes/facturen/abonnementen blijven lokaal

## 6. Veiligheidswaarschuwingen

- Commit nooit `.env` of `.env.local`.
- Zet nooit `SUPABASE_SERVICE_ROLE_KEY` in browsercode.
- Test RLS eerst met losse testgebruikers.
- Laat algemene writes geblokkeerd tot een latere fase expliciet migratie-write-mode activeert.
- Gebruik write-test alleen voor `Supabase Write Test Klant`.
- Gebruik `supabase-migration` alleen voor gecontroleerde customer migratie.
- Zet de provider pas live om na succesvolle migratiecheck en back-up.

## 7. Volgende fases

- Fase 11.8: read-only connectiechecks.
- Fase 11.9: gecontroleerde customer write-test mode.
- Fase 12.0: expliciete vrijgave van veilige customer migratie.
- Auth live koppelen aan Supabase Auth.
- Eerste module gecontroleerd migreren.
- Back-up en rollbackprocedure testen.
