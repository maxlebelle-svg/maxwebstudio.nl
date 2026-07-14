# Outlook/Hotmail deliverability-audit — 14 juli 2026

## Besluit

De code en publieke DNS-basis zijn geschikt voor een gecontroleerde vervolgtest, maar inboxplaatsing kan nog niet worden bewezen zonder de volledige headers van de daadwerkelijk in Hotmail ontvangen e-mail. Resend `delivered` bewijst aflevering aan Microsoft, niet plaatsing in Postvak IN.

De wijzigingen in deze audit zijn beperkt tot centrale afzendergovernance, multipart-validatie, veilige logging, een compactere lead-demo-uitnodiging en regressietests. DNS, Resend, Netlify en productie zijn niet gewijzigd.

## Publieke DNS-waarneming

Uitgelezen op 14 juli 2026:

| Controle | Waarneming | Beoordeling |
| --- | --- | --- |
| Apex SPF | `v=spf1 include:spf.protection.outlook.com include:_spf.google.com -all` | Geldig voor Microsoft 365/Google; Resend hoeft hier niet in als de envelope sender de aparte Return-Path-subdomain gebruikt. |
| Resend Return-Path SPF | `send.maxwebstudio.nl: v=spf1 include:amazonses.com ~all` | Aanwezig. |
| Resend Return-Path MX | `send.maxwebstudio.nl -> feedback-smtp.eu-west-1.amazonses.com` | Aanwezig. |
| DKIM | `resend._domainkey.maxwebstudio.nl` public key aanwezig | Aanwezig; daadwerkelijke `dkim=pass` moet uit ontvangen header blijken. |
| DMARC | `v=DMARC1; p=reject;` | Strikt en syntactisch bruikbaar; daadwerkelijke alignment moet uit ontvangen header blijken. Geen `rua`-rapportage zichtbaar. |
| Custom tracking | Geen CNAME op `links.maxwebstudio.nl` of `email.maxwebstudio.nl` | Past bij tracking uit/niet geconfigureerd, maar alleen Resend Dashboard kan de actuele instelling bewijzen. |

Verwachte relaxed alignment voor de huidige opzet: header From `maxwebstudio.nl`, DKIM `d=maxwebstudio.nl`, envelope/Return-Path `send.maxwebstudio.nl`. De subdomain is onder relaxed DMARC aligned met het organisatiedomein. Een ontvangen header blijft het doorslaggevende bewijs.

## Verzendaudit

Alle productie-e-mail loopt via `functions/services/resendMailService.js`; er is geen tweede directe Resend HTTP-route gevonden. De centrale policy dwingt nu af:

- `From: Max Webstudio <info@maxwebstudio.nl>`;
- `Reply-To: info@maxwebstudio.nl`;
- in productie `RESEND_DOMAIN_VERIFIED=true`, anders geen providercall;
- zowel HTML als plain text, anders geen providercall;
- veilige logging van afzender-/Reply-To-domein, multipart-status, linkdomeinen en de gedeclareerde trackingverwachting;
- provider message ID blijft na acceptatie in `email_logs.provider_message_id` opgeslagen;
- een browserpayload kan From of Reply-To niet overschrijven.

De Return-Path wordt niet door applicatiecode gezet en blijft terecht eigendom van de geverifieerde Resend-domainconfiguratie.

| Route(s) | Doel | HTML + text | Idempotentie | Linkprofiel / opmerking |
| --- | --- | --- | --- | --- |
| `send-lead` | interne leadmelding + leadbevestiging | Ja | Ja, stabiele request-ID | Bevestiging heeft website- en WhatsApp-links; emoji uit onderwerp verwijderd. |
| `admin-lead-demo-invitation` | lead-demo activatie | Ja | Ja, outbox + provider key | Eén klikbare CTA; noodzakelijke Supabase auth-link, first-party logo. |
| journey mail worker | journey-events | Ja | Ja, outbox + provider key | URL-policy/allowlist per mailcommand. |
| `admin-mail-studio-send` | handmatige lead-/klantmail | Ja, nu verplicht | Optionele browserkey | Veel footerlinks in bestaande algemene studio-template; server bepaalt ontvanger en mailidentiteit. |
| `admin-email-logs` retry | herverzending bestaande log | Centraal verplicht | Geen nieuwe key | Oude onvolledige logs falen veilig in plaats van enkelvoudig MIME te verzenden. |
| customer onboarding + admin onboarding/welcome | onboarding/activatie | Ja | Nee | Supabase action-link en support-mailto. |
| `admin-invite-user`, `client-password-reset` | accountactivatie/reset | Ja | Nee | Supabase action-link; functioneel noodzakelijk maar domein wijkt af van From. |
| invoice, subscription retry, Mollie webhook | betaling/facturatie | Ja | Nee op providerlaag | Factuur-/betaal-/portal-URL's; webhook/business state beperkt dubbele afhandeling gedeeltelijk. |
| website package + Website Factory | project-/website-updates | Ja | Nee | Klantportaal of live URL; dynamische live URL verdient blijvende allowlistcontrole. |
| submit onboarding/change request | admin- en klantbevestiging | Ja | Nee | Beperkte links, voornamelijk contact/website. |
| demo journey | demo-/upsellmail | Ja | Nee | Tekst-naar-HTML of voorstel-CTA; geen aparte providerkey. |

Idempotentie is sterk bij de nieuwe lead-demo- en journey-outboxflows en bij publieke leadbevestigingen. De overige transactionele routes hebben nog geen universele provider-idempotentie. Dat is een bestaand verbeterpunt, maar niet breed aangepast tijdens deze deliverability-recovery.

## Lead-demo-template

De gecorrigeerde template:

- onderwerp: `Lisanne, je website-demo voor Advies Post staat klaar`;
- normaliseert volledig lowercase namen conservatief voor weergave;
- bevat één primaire klikbare CTA;
- bevat equivalente HTML en plain text;
- bevat geen emoji, URL-shortener, localhost- of Netlify-previewlink;
- blijft kleiner dan 12 KB;
- gebruikt geen trackingpixel vanuit de applicatiecode;
- houdt de Supabase action-link, omdat deze de bestaande eenmalige veilige accountactivatie uitvoert. Een first-party custom auth-domain kan dit signaal later verbeteren, maar is geen veilige code-only wijziging.

De verborgen preheader is standaard previewtekst en bevat dezelfde inhoudelijke boodschap; er is geen misleidende verborgen tekst gevonden.

## Zo haal je de volledige Hotmail-header op

Outlook.com / Outlook op het web:

1. Open de betreffende mail in de map Ongewenste e-mail.
2. Kies bovenaan `…` (Meer acties).
3. Kies `Weergeven` > `Berichtdetails weergeven`.
4. Selecteer en kopieer de volledige inhoud, vanaf de eerste tot en met de laatste headerregel.
5. Bewaar die als platte tekst; verwijder alleen de lokale ontvanger als dat privacy-technisch nodig is. Laat `Authentication-Results`, `Received`, `Return-Path`, `From`, `DKIM-Signature`, alle `X-Microsoft-*`-regels en `Message-ID` intact.

Zoek vervolgens minimaal naar:

- `spf=pass` plus `smtp.mailfrom=send.maxwebstudio.nl`;
- `dkim=pass` plus `header.d=maxwebstudio.nl`;
- `dmarc=pass` plus `header.from=maxwebstudio.nl`;
- `Return-Path` onder `send.maxwebstudio.nl`;
- `X-MS-Exchange-Organization-SCL` of `SCL` (hogere positieve waarden wijzen op sterkere spamclassificatie; de precieze betekenis hangt af van Microsoft-product/context);
- `BCL`, `X-Microsoft-Antispam`, `X-Forefront-Antispam-Report` en de ontvangende IP-adressen;
- onverwachte herschreven link- of trackingdomeinen.

De lokale helper `emailHeaderDiagnostics.analyzeReceivedHeaders(raw)` kan SPF/DKIM/DMARC, SCL en relaxed alignment uit een gekopieerde header samenvatten. Deel geen API-key, auth-token of volledige privé-inhoud.

## Microsoft en Resend

Microsoft geeft aan dat reputatie, IP, domein, authenticatie, lijstkwaliteit, klachten en inhoud samen de Outlook-filtering bepalen. Voor deze lage transactionele volumes zijn consequente afzenderidentiteit, uitsluitend verwachte ontvangers, minimale klachten en geleidelijke stabiele verzending belangrijker dan volume opvoeren.

SNDS is IP-gebaseerd en vereist autorisatie voor IP's waarvoor de aanvrager verantwoordelijk is. Bij een gedeeld Resend-IP ligt praktische SNDS/JMRP-toegang en IP-reputatiesturing bij Resend; Max Webstudio kan dit pas rechtstreeks gebruiken bij een eigen/dedicated IP met aantoonbare controle. Open daarom niet op basis van één spamplaatsing meteen een Microsoft-supportcase. Verzamel eerst de header, Resend message ID en meerdere gecontroleerde resultaten.

Resend adviseert voor gevoelige transactionele activatiemails tijdelijk click- en open tracking uit te zetten, plain text mee te sturen, een klein bericht te gebruiken en linkdomeinen zo veel mogelijk met het verzenddomein te laten overeenkomen. De applicatie verstuurt zelf geen trackingopties; de actuele domeininstelling moet handmatig in Resend worden bevestigd.

## Gerangschikte oorzakenhypothese

1. **Microsoft-reputatie van domein en/of gedeeld Resend-IP** — waarschijnlijk als SPF/DKIM/DMARC in de ontvangen header allemaal slagen maar SCL hoog blijft.
2. **Link-/tracking-signalen** — met name een herschreven trackinglink of de noodzakelijke `*.supabase.co` activatie-URL die niet overeenkomt met het From-domein.
3. **Eerdere inconsistente mailidentiteit/templatecomplexiteit** — routes konden een kale of route-eigen From en browsergestuurde Reply-To gebruiken; dit is centraal gecorrigeerd.
4. **Authenticatie/alignment in het daadwerkelijke bericht** — publieke DNS ziet er correct uit, maar blijft onbewezen tot de ontvangen header is gecontroleerd.
5. **Inhoudssignalen** — minder waarschijnlijk na compactere, persoonlijke, niet-marketingachtige template zonder emoji en met één CTA.

## Handmatige verificatiechecklist (geen echte mail tijdens deze audit)

- [ ] Zet in productie uitsluitend na akkoord: `FROM_EMAIL=Max Webstudio <info@maxwebstudio.nl>`.
- [ ] Bevestig `REPLY_TO_EMAIL=info@maxwebstudio.nl` en dat deze mailbox wordt bewaakt.
- [ ] Bevestig in Resend Domain dat `maxwebstudio.nl` verified is; zet daarna pas `RESEND_DOMAIN_VERIFIED=true` in de runtime.
- [ ] Controleer in Resend Domain dat click tracking en open tracking tijdelijk uit staan; documenteer dit met datum/screenshot.
- [ ] Voer één expliciet geautoriseerde test uit naar één Hotmail-adres en noteer tijd, template, ontvanger en Resend message ID.
- [ ] Controleer inbox én spam en wijzig tijdens deze ene test geen andere variabelen.
- [ ] Exporteer de volledige header volgens bovenstaande stappen.
- [ ] Controleer SPF, DKIM, DMARC, header From, Return-Path, alignment, SCL/BCL, ontvangend IP en linkherschrijving.
- [ ] Vergelijk dezelfde minimale template desgewenst met één Outlook.com en één Microsoft 365-mailbox; blijf op laag volume.
- [ ] Markeer de mail alleen als `Geen ongewenste e-mail` wanneer de ontvanger deze werkelijk verwachtte.
- [ ] Escaleer met Resend message ID + volledige headers naar Resend als authenticatie slaagt maar gedeeld-IPsignalen verdacht zijn.
- [ ] Gebruik Microsoft Sender Support pas na reproduceerbare resultaten; SNDS alleen wanneer het verzend-IP werkelijk onder eigen beheer staat.

## Acceptatie na een latere gecontroleerde test

- SPF, DKIM en DMARC zijn alle drie `pass`.
- DKIM `d=`, envelope/Return-Path en header From zijn relaxed aligned met `maxwebstudio.nl`.
- Geen onverwachte tracking- of redirectdomeinen.
- Resend provider message ID is veilig in de maillog opgeslagen.
- Hotmail plaatst de minimale uitnodiging in inbox, of de header levert een concrete Microsoft-/reputatiesignalering op voor gerichte escalatie.
