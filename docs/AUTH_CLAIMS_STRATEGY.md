# Auth Claims Strategy

Status: gereed als strategie, nog niet live hardgemaakt.

## Doel

De productieomgeving moet rollen en klanttoegang eenduidig kunnen bepalen zonder service role key in de browser. De browser gebruikt alleen Supabase Auth + anon key. De database dwingt toegang af met RLS.

## Minimale databronnen

`profiles` blijft de brug tussen Supabase Auth en het Max Webstudio-platform.

Benodigde velden:

- `profiles.auth_user_id`: verwijzing naar `auth.users.id`.
- `profiles.role`: `super_admin`, `admin`, `sales`, `developer`, `support`, `customer`, `demo_user`.
- `profiles.status`: alleen `active` mag productieacties uitvoeren.
- `profiles.environment`: `production`, `demo` of `test`.
- `profiles.is_demo`: extra demo-indicator.
- `customers.auth_user_id`: directe klantkoppeling voor klantportaaltoegang.
- `customers.profile_id`: fallback-koppeling naar `profiles`.
- `customers.environment` en `customers.is_demo`: scheiding demo/productie.
- `change_requests.auth_user_id`: directe koppeling voor wijzigingsverzoeken vanuit ingelogde klanten.

## RLS helperstrategie

De draft gebruikt databasefuncties in plaats van losse policy-logica per tabel:

- `current_profile_id()`: haalt het actieve profile op bij `auth.uid()`.
- `current_app_role()`: leest de rol uit `profiles.role`.
- `has_app_role(text[])`: controleert of de huidige rol in een toegestane lijst staat.
- `is_admin_role()`: `super_admin` of `admin`.
- `current_customer_id()`: haalt de customer op via `customers.auth_user_id` of `customers.profile_id`.
- `owns_customer(uuid)`: controleert of de huidige gebruiker eigenaar is van een klant.
- `is_demo_context()`: controleert of de huidige gebruiker demo is.

## Geen custom JWT-claims als eerste stap

Voor de eerste productiehardening gebruiken we tabelgebaseerde checks via `profiles`. Custom JWT-claims kunnen later nuttig zijn voor performance, maar vergroten nu het risico op stale roles.

Toekomstige JWT-claims mogen pas na review:

- `app_role`
- `profile_id`
- `customer_id`
- `environment`

Wanneer claims later worden toegevoegd, moet de database nog steeds veilig blijven als claims ontbreken of oud zijn.

## Rolgrenzen

- `customer`: uitsluitend eigen data via ownership.
- `customer` bij wijzigingsverzoeken: uitsluitend records waar `change_requests.auth_user_id = auth.uid()`.
- `demo_user`: uitsluitend demo-data.
- `sales`: salesdata en beperkte factuurinzage, geen developer tooling.
- `support`: klantondersteuning, geen betalingen/migraties.
- `developer`: technische tooling en validatie, geen payment write actions.
- `admin` en `super_admin`: beheer via RLS en server-side functies.

## Route guard relatie

Frontend route guards geven snelle UX-feedback, maar zijn geen beveiligingsgrens. RLS moet altijd de echte databasegrens zijn.

Status:

- Frontend route guards: soft actief.
- Hard route guards: voorbereid.
- RLS live execution: geblokkeerd tot review.
