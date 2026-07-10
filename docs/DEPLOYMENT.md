# Deployment

Dit document beschrijft hoe de website gepubliceerd wordt.

Status op 2026-07-10: deployment is Netlify-gebaseerd, maar een live deploybewijs blijft pas definitief na controle in Netlify/GitHub. Deze repository bevat de deployconfiguratie en lokale/static checks; live status moet in Netlify worden bevestigd.

## Hosting

De website draait op Netlify.

Configuratie staat in `netlify.toml`:

- publish directory: `/public`
- functions directory: `/functions`
- API redirect: `/api/:splat` naar `/.netlify/functions/:splat`
- adminpagina's krijgen `Cache-Control: no-store`

## Live Bron

`/public` is de live bron voor Netlify.

Belangrijk:

- wijzigingen in root-HTML/CSS/JS worden niet automatisch live als Netlify alleen `/public` publiceert
- root-bestanden kunnen duplicaten of oudere kopieën zijn
- live frontend-wijzigingen moeten primair in `/public`

## Publicatieproces

Standaard proces:

1. Wijzigingen lokaal controleren.
2. Bestanden reviewen in GitHub Desktop.
3. Commit maken.
4. Pushen naar GitHub.
5. Netlify publiceert na push naar GitHub.
6. Live website controleren.

Codex mag committen als daarom is gevraagd. Publiceren naar productie blijft afhankelijk van push/deploy en live controle.

## Environment Variables

Belangrijke variabelen:

- `MOLLIE_MODE`
- `MOLLIE_TEST_API_KEY`
- `MOLLIE_API_KEY`
- `BASE_URL`
- `EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_EMAIL`
- `ADMIN_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOW_LEGACY_CREATE_PAYMENT`

Geen environment variables in de repository plaatsen.

## Functions

Functions staan in `/functions`.

Belangrijke endpoints:

- `/.netlify/functions/commercial-order`
- `/.netlify/functions/mollie-webhook`
- `/.netlify/functions/submit-onboarding`
- `/.netlify/functions/admin-intakes`

`/.netlify/functions/create-payment` is legacy. In productie hoort deze route standaard 410 terug te geven, tenzij `ALLOW_LEGACY_CREATE_PAYMENT=true` expliciet tijdelijk is gezet voor een gecontroleerde overgang.

## Deploybewijs

Repositorybewijs:

- `netlify.toml` publiceert uit `/public`.
- `netlify.toml` gebruikt `/functions` als Netlify Functions directory.
- `netlify.toml` heeft een generieke `/api/:splat` redirect.
- `netlify.toml` zet admin HTML op `no-store`.

Live bewijs dat nog buiten deze repo gecontroleerd moet worden:

1. GitHub laatste commit hash vergelijken met Netlify deploy commit.
2. Netlify deploy status moet `Published` zijn.
3. Live URL openen en controleren dat homepage, adminlogin, klantlogin en belangrijke assets laden.
4. `/.netlify/functions/platform-health` of `/api/platform-health` controleren als beschikbare smokecheck.
5. Een adminpagina openen zonder sessie en bevestigen dat er geen bruikbare admincontext zichtbaar blijft.

## Controle Na Deploy

Controleer:

- homepage laadt
- CSS laadt
- afbeeldingen laden
- pakketlinks werken
- betaalpagina werkt
- nieuwe opdrachtflow maakt server-side Mollie checkout aan
- legacy betaalroute geeft live 410 zonder tijdelijke override
- bedanktpagina werkt
- onboardingpagina werkt
- intake-submit werkt
- e-mail wordt verstuurd indien Resend actief is
- mobiel gedrag is acceptabel

## Rollback

Rollback verloopt bij voorkeur via Netlify deploy history of GitHub Desktop/Git na expliciete beslissing.

Geen rollback uitvoeren zonder akkoord.
