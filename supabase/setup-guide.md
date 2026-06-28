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

De echte write/live provider komt pas in een latere fase.

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

## 4.3 RLS errors oplossen

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
- Laat writes geblokkeerd tot Fase 11.9 expliciet write-mode activeert.
- Zet de provider pas live om na succesvolle migratiecheck en back-up.

## 7. Volgende fases

- Fase 11.8: read-only connectiechecks.
- Fase 11.9: gecontroleerde customer write-mode.
- Auth live koppelen aan Supabase Auth.
- Eerste module gecontroleerd migreren.
- Back-up en rollbackprocedure testen.
