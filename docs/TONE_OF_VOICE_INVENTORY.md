# Platformbrede tone-of-voice-inventarisatie

Baseline: 4 augustus 2026, vóór de V1-aanpassingen.

## Scanresultaat

De eerste statische scan vond 222 zichtbare of mogelijk zichtbare voorkomens van `u`, `uw` of `uwe` in 43 bestanden binnen `public/` en `functions/`.

| Cluster | Belangrijkste bestanden | Bevinding |
| --- | --- | --- |
| Automatische e-mails | `functions/demo-journey.js`, `functions/journey/mail/templateRenderer.js`, `functions/services/leadDemoInvitationTemplate.js` | Onderwerpen, HTML en platte tekst wisselden tussen je- en u-vorm. |
| Klantportaal en projectstatus | `functions/journey/clientReadService.js`, `public/src/ui/clientJourneyProgress.js`, `functions/client-journey-progress.js` | Statussen, lege statussen, contactblokken en foutmeldingen gebruikten vooral de u-vorm. |
| Preview en feedback | `public/lead-preview.html`, `functions/lead-preview-portal.js`, `functions/client-preview-versions.js` | Koppen, placeholders, succesmeldingen en sessiefouten waren formeel. |
| Offertecommunicatie | `functions/services/commercialOfferMailService.js`, `functions/commercial-offer-interest.js` | De niet-bindende interessebevestiging week af van de rest van de offerteflow. |
| Factory-demo-inhoud | `functions/_website-factory-core.js`, `functions/website-factory/vm-tegelwerken-demo.js`, industrieprofielen en configuratie-JSON | CTA's, formulieren en gegenereerde demonstratieteksten gebruikten een mix van aanspreekvormen. |
| Journey-services | `functions/journey/*/service.js`, `functions/mollie-webhook.js`, `functions/website-factory.js` | Fallbacklabels en vervolgstappen gaven formele tekst door aan klantmails. |
| Beheeromgeving | `functions/admin-*.js`, `public/admin-*.html`, `public/admin/ui/*.js` | Medewerkersteksten; geen klantcommunicatie en daarom niet onderdeel van de automatische je-vormcontrole. |

## Juridische en technische controle

- De algemene voorwaarden, privacyverklaring en hosting- en onderhoudsvoorwaarden bevatten geen directe u-vorm die voor deze wijziging herschreven moet worden.
- Gedefinieerde juridische partijen en contractvoorwaarden blijven inhoudelijk ongewijzigd.
- API-namen, databasevelden, logging, technische comments, foutcodes en bestaande audit-/idempotencylogica vallen buiten de tekstwijziging.
- De Signhost-integratie blijft de enige route voor de bindende digitale ondertekening.

## Gecontroleerde aanpassingsscope

V1 past klantzichtbare koppen, alinea's, CTA's, placeholders, formulierfeedback, notificaties, projectstatussen en e-mailteksten aan. Beheerdersteksten blijven staan tenzij ze rechtstreeks als klanttekst worden hergebruikt.

## Bewust niet aangepast

- Juridische clausules en vastgelegde contractinhoud: inhoudelijke wijziging valt buiten deze tone-of-voice-opdracht.
- Medewerkerportalen en interne beheerfouten: geen klantzichtbare communicatie.
- Testnamen, technische fixtures, logs en comments: expliciet uitgesloten, behalve wanneer een fixture zichtbare klantcopy valideert.
- Tekst die door een klant of medewerker zelf is ingevoerd: de applicatie mag aangeleverde inhoud niet stilzwijgend herschrijven.
