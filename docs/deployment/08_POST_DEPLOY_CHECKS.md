# 08 Post Deploy Checks

Controleer na deployment:

- admin-dashboard opent
- klantportaal opent met juiste klant
- Customer A/B isolatie werkt
- demo-user ziet geen productie
- anonymous ziet geen klantdata
- offertes zichtbaar
- facturen zichtbaar
- abonnementen zichtbaar
- storage downloads via signed URL werken
- Resend testmail werkt
- Mollie testbetaling/webhook werkt
- logs tonen geen secrets
- route guards geven geen onverwachte blokkades

Monitoring:

- Netlify function errors
- Supabase logs
- browser console
- mail delivery logs
- Mollie webhook logs
