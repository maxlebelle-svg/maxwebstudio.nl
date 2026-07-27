# Max AI WhatsApp-activering

Status: de transportcode is gereed; de registratiecode voor het 085-nummer is nog niet ontvangen.

## Wat al gebouwd is

- Meta-webhookverificatie via `WHATSAPP_VERIFY_TOKEN`.
- Ondertekeningscontrole van ieder POST-event via `WHATSAPP_APP_SECRET` en `x-hub-signature-256`.
- Inkomende tekst, afbeeldingen, documenten, audio, video, locaties en interactieve antwoorden.
- Idempotente opslag van berichten en afleverstatussen.
- Koppeling aan een bestaande lead wanneer exact één telefoonnummer overeenkomt.
- Handmatig verzenden door bevoegde medewerkers binnen de 24-uurs servicetermijn.
- Eigen prospects voor medewerkers; totaaloverzicht voor beheerders en sales managers.
- Een beheerder kan per gesprek kiezen tussen **assistent**, **automatisch** en **gepauzeerd**.
- In automatische modus antwoordt Max zelfstandig op normale vragen binnen het actieve WhatsApp-servicevenster.
- Max draagt automatisch over aan een medewerker bij klachten, privacygevoelige informatie, een expliciet verzoek om een mens of onvoldoende zekerheid.
- Vrije tekst buiten de 24-uurs servicetermijn wordt geweigerd totdat templates zijn gebouwd.

## Benodigde Netlify-variabelen

Alle waarden blijven uitsluitend server-side:

- `WHATSAPP_VERIFY_TOKEN`: zelfgekozen lang willekeurig verificatietoken voor de webhook.
- `WHATSAPP_APP_SECRET`: App Secret van de Meta-app.
- `WHATSAPP_ACCESS_TOKEN`: permanent system-user access token met WhatsApp messaging-rechten.
- `WHATSAPP_PHONE_NUMBER_ID`: Meta Phone Number ID; dit is niet het zichtbare 085-nummer.
- `WHATSAPP_GRAPH_API_VERSION`: de op dat moment actieve Graph API-versie, bijvoorbeeld in de vorm `v25.0`.
- `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY`: bestaande serverconfiguratie.

## Callback

Gebruik na deployment deze callback-URL in Meta:

`https://maxwebstudio.nl/api/whatsapp-webhook`

Abonneer de WhatsApp Business Account op het veld `messages`.

## Activatievolgorde zodra de registratiecode binnen is

1. Voer de Max AI-databasemigraties in volgorde uit tot en met `20260727173000_max_ai_whatsapp_autopilot.sql`.
2. Deploy de Netlify Functions en websitecode.
3. Plaats de WhatsApp-variabelen uitsluitend in de Netlify serveromgeving.
4. Verifieer de callback-URL met het zelfgekozen `WHATSAPP_VERIFY_TOKEN`.
5. Registreer het 085-nummer in Meta met de ontvangen WhatsApp-registratiecode.
6. Controleer dat het Meta Phone Number ID gelijk is aan `WHATSAPP_PHONE_NUMBER_ID`.
7. Stuur vanaf een privé-WhatsApp een testbericht naar het 085-nummer.
8. Controleer dat één gesprek en één inkomend bericht zijn aangemaakt.
9. Wijs het gesprek toe aan een medewerker en verstuur binnen 24 uur een handmatig antwoord.
10. Laat een beheerder **Automatisch inschakelen** kiezen en stuur daarna een normale testvraag.
11. Controleer dat Max zonder akkoord antwoordt en dat de statussen `sent`, `delivered` en `read` worden verwerkt.
12. Stuur daarna “ik wil een medewerker spreken” en controleer dat Max het gesprek overdraagt in plaats van inhoudelijk verder te antwoorden.

## Werkwijze voor het team

- Medewerkers zien alleen gesprekken die aan henzelf zijn toegewezen.
- Beheerders en sales managers zien alle gesprekken, kunnen gesprekken toewijzen en mogen automatische modus inschakelen.
- Een medewerker kan op ieder moment zelf antwoorden of Max pauzeren voor een gesprek dat aan die medewerker is toegewezen.
- Iedere reactie bewaart wie hem heeft verstuurd: prospect, medewerker of Max AI.
- Nieuwe gesprekken starten bewust niet automatisch. Een beheerder zet automatische modus per gesprek aan nadat de eerste live proef is goedgekeurd.

## Bewuste grens van deze fase

Deze fase verstuurt alleen vrije tekst binnen 24 uur nadat de prospect zelf een WhatsApp-bericht heeft gestuurd. Voor proactief versturen van een demo of opvolging buiten dat venster bouwen we daarna goedgekeurde WhatsApp-templates en de demo-verzendflow.

## Officiële referenties

- Meta WhatsApp Business Platform Postman-collectie: https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ba8d099d-007e-4b52-b9f2-3cf3c60e4fbc
- Meta webhook payload-reference: https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference
- Meta webhook signaturevalidatievoorbeeld: https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads
