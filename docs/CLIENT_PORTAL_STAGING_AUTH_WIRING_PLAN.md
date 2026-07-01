# Klantportaal v1.2 - Staging Auth Wiring Plan

Status: `PLAN ONLY / GEEN AUTH ACTIVATIE / GEEN SQL / GEEN KLANTDATA`

Dit document beschrijft hoe Supabase Auth straks gecontroleerd in staging/test wordt getest voor het klantportaal. Het is geen uitvoeringslog en activeert niets in productie.

## Doel

Bewijzen dat de canonical klantportaalroute veilig kan werken met echte Supabase Auth:

```text
public/login.html
  -> Supabase Auth staging session
  -> profiles
  -> customers
  -> public/klantportaal.html
  -> canonical read/write-gated services
```

De test mag uitsluitend op het staging/testproject plaatsvinden.

## Benodigde env vars

### Browserveilig

Deze waarden mogen via `/.netlify/functions/client-auth-config` beschikbaar komen voor de browser:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Eisen:

- alleen staging/testwaarden gebruiken;
- nooit productieproject gebruiken;
- nooit service role key naar de browser sturen;
- geen waarden in Git of documentatie opnemen.

### Server-side only

Deze waarden blijven uitsluitend server-side:

- `SUPABASE_SERVICE_ROLE_KEY`
- eventuele admin/release tokens

Gebruik:

- testaccounts eventueel voorbereiden via Supabase dashboard/CLI;
- server-side validatie of testseeding alleen na aparte expliciete approval;
- nooit in frontend, localStorage of console tonen.

### Omgevingslabels

Staging moet herkenbaar zijn via veilige labels zoals:

- `APP_ENV=test`
- `APP_ENVIRONMENT=test`
- provider mode alleen `supabase-read` of `supabase-write-test` wanneer expliciet getest wordt

Productie-indicatoren zijn een blocker.

## Waar configuratie veilig staat

Toegestaan:

- Netlify deploy context voor staging/test;
- lokale `.env.local` voor development, mits door `.gitignore` uitgesloten;
- Supabase project settings voor het testproject;
- password manager of beveiligde secret store.

Niet toegestaan:

- commits;
- docs met echte waarden;
- screenshots met keys;
- browser localStorage met service role key;
- frontend JavaScript met hardcoded secrets.

## Lokale testvoorwaarde

`public/login.html` kan `.env.local` niet zelf lezen. De browser ziet alleen wat via een veilige runtime-config of serverless endpoint wordt aangeboden.

Voor lokale stagingtests moet daarom een van deze routes actief zijn:

1. Netlify Dev of een vergelijkbare lokale server die `/.netlify/functions/client-auth-config` met `.env.local` laadt.
2. Een veilige runtime-config voor development die alleen `SUPABASE_URL` en `SUPABASE_ANON_KEY` injecteert.

Een gewone statische server of `file://` is niet genoeg om `.env.local` naar de loginpagina door te geven.

Belangrijk:

- `SUPABASE_SERVICE_ROLE_KEY` mag nooit via runtime-config of frontend beschikbaar worden.
- Als `client-auth-config` lokaal niet bereikbaar is, blijft de loginpagina terecht in veilige fallback.
- Zelfs bij aanwezige publieke config blijft echte login verborgen zolang `authLive=false`.

## Testaccounts

Maak minimaal deze stagingaccounts:

| Account | Rol | Doel |
| --- | --- | --- |
| Customer A | `customer` | eigen klantportaaldata lezen |
| Customer B | `customer` | isolatie tegenover Customer A bewijzen |
| Admin | `admin` | interne toegang valideren |
| Support | `support` | beperkte interne inzage valideren |
| No-profile user | geen profile | blokkade testen |

Per customer-account moet bestaan:

- Auth-user in Supabase Auth;
- `profiles.auth_user_id = auth.users.id`;
- gekoppelde `customers.profile_id` en/of `customers.auth_user_id`;
- minimaal één eigen project/website/testrecord;
- geen echte klantdata.

Demoaccounts blijven gescheiden van staging Auth-accounts.

## Login/logout flow

Te valideren in staging:

1. Open `/login.html`.
2. Controleer dat staging Supabase config veilig beschikbaar is.
3. Log in als Customer A.
4. Controleer redirect naar `/klantportaal.html`.
5. Controleer dat sessie -> profile -> customer mapping klopt.
6. Controleer dat Customer A alleen eigen data ziet.
7. Log uit.
8. Controleer dat `/klantportaal.html` zonder sessie terugvalt naar login of veilige blokkade.
9. Herhaal voor Customer B.

Acceptatie:

- geen technische errors zichtbaar voor normale gebruiker;
- geen customerId uit query nodig in productiepad;
- geen data zichtbaar zonder sessie;
- logout verwijdert sessie en portaltoegang.

## Password reset flow

Te valideren in staging:

1. Open `/login.html`.
2. Vraag reset aan met Customer A e-mailadres.
3. Controleer dat Supabase staging resetmail wordt verstuurd.
4. Controleer dat resetlink naar veilige staging/site URL verwijst.
5. Stel nieuw wachtwoord in.
6. Log opnieuw in.

Acceptatie:

- reset werkt alleen voor stagingaccount;
- geen productie-e-mailtemplates of productie-URL's;
- foutmelding blijft klantvriendelijk;
- geen technische keys of providerdetails zichtbaar.

## RLS en security checklist

Minimale checks:

- anonymous ziet geen klantportaaldata;
- no-profile user ziet geen klantportaaldata;
- Customer A ziet geen Customer B data;
- Customer B ziet geen Customer A data;
- query-param spoofing van `customerId` wordt genegeerd of geblokkeerd;
- klant kan geen `customer_id`, ownership, role of profile wijzigen;
- klant kan geen projectstatus, factuur, abonnement of betaalstatus wijzigen;
- `change_requests` create-only werkt alleen voor eigen klantcontext wanneer write gate expliciet aan staat;
- `client_portal_messages` create-only werkt alleen voor eigen klantcontext wanneer write gate expliciet aan staat;
- Developer Mode is niet zichtbaar voor customer;
- technische auth-status is alleen zichtbaar in Developer Mode;
- service role key is nooit in browser/network payload zichtbaar.

## Pagina's achter login

Pas na staging approval:

- `/klantportaal.html` wordt hard protected voor echte klanten;
- klantdata wordt alleen via sessie ownership geladen;
- demo/query toegang blijft alleen development/demo;
- login redirect stuurt customers naar `/klantportaal.html`.

Publiek blijven:

- `/login.html`;
- accountaanvraag;
- publieke website;
- demo-sites;
- privacy/cookiebeleid/contactpagina's.

## Rollback

Als staging Auth faalt:

1. Zet Auth readiness terug naar prepared/not active.
2. Verberg echte login opnieuw voor normale bezoekers.
3. Toon opnieuw `Klantportaal wordt momenteel afgerond`.
4. Houd demo-login alleen in Developer Mode.
5. Laat `klantportaal.html` alleen demo/local gebruiken.
6. Leg blocker vast in `TEST_RESULTS.md` en release governance.

Geen database rollback uitvoeren zonder aparte databaseprocedure.

## Evidence

Leg bij uitvoering vast:

- datum/tijd;
- gebruikte omgeving: staging/test;
- testaccounts zonder echte persoonsgegevens;
- login/logout resultaat;
- password reset resultaat;
- Customer A/B isolation resultaat;
- anonymous/no-profile resultaat;
- query spoofing resultaat;
- RLS outcome;
- open blockers.

Aanbevolen bestanden:

- `docs/deployment/TEST_RESULTS.md`
- `docs/deployment/DEPLOYMENT_BLOCKERS.md`
- `docs/PROJECT_STATE.md`

## GO/NO-GO

Staging Auth krijgt pas `GO` wanneer:

- staging env vars aanwezig en veilig zijn;
- login/logout werkt;
- password reset werkt of bewust als aparte blocker is vastgelegd;
- Customer A/B isolation bewezen is;
- anonymous/no-profile geblokkeerd zijn;
- query spoofing geblokkeerd is;
- geen production indicators aanwezig zijn;
- rollbackpad getest of minimaal procedureel bevestigd is.

Productie blijft `NO-GO` totdat release governance expliciet goedkeurt.

## Bewust niet uitgevoerd

- Geen Supabase Auth activatie.
- Geen SQL.
- Geen RLS-wijzigingen.
- Geen echte klantdata.
- Geen productieconfiguratie.
- Geen database writes.
- Geen runtime feature change.
