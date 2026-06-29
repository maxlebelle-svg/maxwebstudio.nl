# Auth & Profiles Foundation

Status: Fase 22 voorbereiding.  
Doel: echte Supabase Auth en gebruikersprofielen voorbereiden zonder live-writes, SQL-uitvoering of productiegegevens.

## Doelarchitectuur

Supabase Auth blijft de identity provider. De tabel `profiles` is de brug tussen `auth.users`, rollen en interne autorisatie.

Belangrijkste koppelingen:

- `profiles.auth_user_id -> auth.users.id`
- `customers.profile_id -> profiles.id`
- `customers.auth_user_id -> auth.users.id`

Productie-autorisatie mag niet alleen op e-mailadres vertrouwen. E-mail blijft handig voor matching/migratie, maar eigenaarschap moet via `auth_user_id`, `profile_id` en `customer_id` worden afgedwongen.

## Rollen

| Rol | Doel | Productiegrens |
|---|---|---|
| `super_admin` | Volledig platform- en releasebeheer | Alleen voor eigenaar/noodbeheer |
| `admin` | Dagelijks CRM-, klant-, project-, offerte-, factuur- en abonnementsbeheer | Geen service role in frontend |
| `sales` | Leads, klanten, offertes en opvolging | Geen Developer Tools of betaalmutaties |
| `support` | Klant-, project-, website- en factuurinzage voor ondersteuning | Geen migratie, settings of betaalstatus-mutaties |
| `developer` | Developer Mode, validatie, releasechecks en technische readiness | Geen klantbetaling-write of klantcommunicatie zonder adminreview |
| `customer` | Eigen klantportaaldata | Alleen eigen `customers`/ownership records |
| `demo_user` | Demo-klantreis en salesdemo | Alleen demo/local data |

## Pagina-Toegang

| Pagina | Toegang straks | Opmerking |
|---|---|---|
| `/login.html` | Publiek | Redirect na login op basis van `profile.role` |
| `/admin-dashboard.html` | `super_admin`, `admin`, `developer`, `sales`, `support` | Module-acties blijven permissie-afhankelijk |
| `/klantportaal.html` | `customer`, optioneel `admin`/`super_admin` voor support | Altijd customer ownership + RLS |
| `/admin-dashboard.html#leadfinder` | `super_admin`, `admin`, `sales` | Salesdata blijft intern |
| `/admin-dashboard.html#instellingen` | `super_admin`, `admin`, `developer` | Developer Mode en releasechecks |

Open demo/offerte/betaalroutes blijven demo/local totdat tokenized of authenticated production access expliciet is ontworpen.

## Huidige Implementatie

Voorbereid:

- `public/src/services/authService.js`
- `public/src/services/authProfileService.js`
- `public/src/services/authReadinessService.js`
- `public/src/config/roles.js`
- `public/src/config/permissions.js`
- `public/src/config/protectedRoutes.js`
- `public/login.html`
- Developer Mode Auth/Profile readiness kaart

Wat nu werkt:

- Demo-login blijft actief.
- Accountaanvragen kunnen lokaal naar profile-concepts worden voorbereid.
- Profile/customer linking is lokaal voorbereid.
- Role definitions en permissiematrix bestaan centraal.
- Protected route registry bestaat als soft/readinesslaag.
- Supabase Auth provider is voorbereid, maar niet live als productiegrens.

## Production Readiness Blockers

Voordat echte Auth live mag:

1. Supabase testgebruikers aanmaken.
2. `profiles.auth_user_id` mapping valideren.
3. `customers.auth_user_id` en `customers.profile_id` ownership valideren.
4. Customer A/B isolation opnieuw bewijzen.
5. RLS policies voor `profiles` en `customers` recursievrij testen.
6. Hard route guards pas activeren na geslaagde Auth/RLS test.
7. Admin/sales/support permissies testen op module- en actieniveau.
8. Demo-user isolatie testen zodat productiegegevens nooit zichtbaar zijn.

## Niet Live

- Geen Supabase SQL uitgevoerd.
- Geen productiegegevens gewijzigd.
- Geen echte Auth-user writes uitgevoerd.
- Geen service role in frontend.
- Geen hard route guard standaard aangezet.
- Geen RLS live geactiveerd.

## Volgende Stap

Na review van deze foundation:

1. Supabase testomgeving opnieuw gebruiken.
2. Auth testusers aanmaken.
3. Profiles koppelen aan Auth users.
4. Customer ownership en route guards testen.
5. Pas daarna een aparte fase voor production Auth activation plannen.

