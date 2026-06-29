# Environment Variables Checklist

Status: invullen zonder waarden of secrets.

| Naam | Doel | Waar instellen | Gecontroleerd |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Supabase project URL | Netlify env / lokale testenv |  |
| `SUPABASE_ANON_KEY` | Browser-safe Supabase anon key voor RLS | Netlify env / lokale testenv |  |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin/service acties | Netlify env, nooit frontend |  |
| `ADMIN_TOKEN` | Admin function authorisatie | Netlify env |  |
| `RESEND_API_KEY` | E-mails via Resend | Netlify env |  |
| `FROM_EMAIL` | Afzender e-mail | Netlify env |  |
| `ADMIN_EMAIL` | Interne notificaties | Netlify env |  |
| `LEAD_TO_EMAIL` | Leadontvanger | Netlify env |  |
| `LEAD_FROM_EMAIL` | Lead-afzender | Netlify env |  |
| `MOLLIE_API_KEY` | Mollie API server-side | Netlify env |  |
| `MOLLIE_WEBHOOK_SECRET` | Webhookvalidatie indien gebruikt | Netlify env |  |
| `SITE_URL` | Redirects/webhooks absolute URL | Netlify env |  |
| `APP_ENVIRONMENT` | `test` of `production` | Netlify env |  |
| `DATA_PROVIDER_MODE` | local/supabase/hybrid mode | Netlify env of app settings |  |
| `CLIENT_PORTAL_REDIRECT_URL` | Auth redirect klantportaal | Supabase/Auth settings |  |
| `ADMIN_REDIRECT_URL` | Auth redirect admin | Supabase/Auth settings |  |

## Regels

- Noteer alleen namen en status, nooit waarden.
- Service role key mag nooit in frontend of docs terechtkomen.
- Productie en test gebruiken aparte waarden.
- Controleer ook Supabase Auth redirect URLs.
