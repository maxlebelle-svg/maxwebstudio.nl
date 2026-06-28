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

De echte live provider komt pas in een latere fase.

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
- Zet de provider pas live om na succesvolle migratiecheck en back-up.

## 7. Volgende fases

- Fase 11.5/11.6: echte Supabase reads/writes per module.
- Auth live koppelen aan Supabase Auth.
- Eerste module gecontroleerd migreren.
- Back-up en rollbackprocedure testen.
