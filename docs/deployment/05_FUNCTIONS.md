# 05 Functions

Doel: Netlify Functions controleren voordat productie live gaat.

Controleer:

- environment variables aanwezig
- JSON responses op alle error paths
- geen secrets in frontend
- `ADMIN_TOKEN` waar adminacties nodig zijn
- Resend/Mollie/Supabase alleen server-side

Belangrijke functies:

- lead/request e-mailfunctions
- admin billing/offerte/CRM functions
- Mollie functions
- signed URL downloadfunctions

Rollback:

- vorige Git commit redeployen
- Netlify deploy rollback gebruiken
