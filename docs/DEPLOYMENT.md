# Deployment

Dit document beschrijft hoe de website gepubliceerd wordt.

## Hosting

De website draait op Netlify.

Configuratie staat in `netlify.toml`:

- publish directory: `/public`
- functions directory: `/functions`

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
3. Commit maken in GitHub Desktop.
4. Pushen naar GitHub.
5. Netlify publiceert na push naar GitHub.
6. Live website controleren.

Codex mag nooit automatisch publiceren zonder akkoord.

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

Geen environment variables in de repository plaatsen.

## Functions

Functions staan in `/functions`.

Belangrijke endpoints:

- `/.netlify/functions/create-payment`
- `/.netlify/functions/mollie-webhook`
- `/.netlify/functions/submit-onboarding`
- `/.netlify/functions/admin-intakes`

## Controle Na Deploy

Controleer:

- homepage laadt
- CSS laadt
- afbeeldingen laden
- pakketlinks werken
- betaalpagina werkt
- Mollie checkout start
- bedanktpagina werkt
- onboardingpagina werkt
- intake-submit werkt
- e-mail wordt verstuurd indien Resend actief is
- mobiel gedrag is acceptabel

## Rollback

Rollback verloopt bij voorkeur via Netlify deploy history of GitHub Desktop/Git na expliciete beslissing.

Geen rollback uitvoeren zonder akkoord.

