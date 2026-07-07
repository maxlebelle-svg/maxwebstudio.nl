# Delivery Payment Lock Workflow

Status: `PROPOSAL READY / AWAITING GO`
Laatste update: 2026-07-07.

## Doel

Deze workflow voorkomt dat een klant of medewerker definitieve opleverbestanden kan downloaden voordat het afgesproken betaalmoment is afgerond.

De kern:

- dag 1: na het belcontact is het e-mailadres al bekend; klant krijgt direct accountactivatie voor het klantportaal;
- dag 3: preview staat klaar, klant geeft akkoord op de richting en betaalt de aanbetaling;
- dag 5: oplevering staat klaar, klant betaalt het restant of bij no-cure-no-pay het volledige bedrag;
- pas na bevestigde Mollie-betaling worden definitieve documenten, overdracht en downloadlinks vrijgegeven.

## Statusflow

| Moment | Projectstatus | Betaalstatus | Documentstatus | Klantactie |
| --- | --- | --- | --- | --- |
| Dag 1 | `project_started` | `not_due` | `locked` | Account activeren en klantportaal openen |
| Dag 1 na activatie | `portal_active` | `not_due` | `locked` | Projectstatus volgen |
| Dag 2 | `concept_in_progress` | `not_due` | `locked` | Status bekijken, geen verplichte actie |
| Dag 3 | `preview_ready` | `deposit_pending` | `preview_only` | Inloggen, preview bekijken en akkoord geven |
| Dag 3 na betaling | `preview_approved` | `deposit_paid` | `preview_only` | Feedback of bevestiging |
| Dag 4 | `finalizing` | `deposit_paid` | `preview_only` | Laatste feedback |
| Dag 5 | `delivery_ready` | `final_payment_pending` | `locked` | Restbetaling of volledige betaling voldoen |
| Dag 5 na betaling | `delivered` | `paid` | `unlocked` | Definitieve bestanden downloaden |
| Afwijzing dag 3 | `preview_rejected` | `not_due` | `locked` | Geen betaling nodig volgens no-cure-no-pay afspraak |

## Betaalregels

### Standaard met aanbetaling

- Dag 3: klant betaalt aanbetaling na akkoord op preview.
- Dag 5: klant betaalt restant voor definitieve overdracht.
- Definitieve bestanden blijven geblokkeerd tot het restant `paid` is.

### No-cure-no-pay

- Dag 3: klant hoeft nog niet te betalen, tenzij we kiezen voor een commitment-aanbetaling na preview.
- Dag 5: klant betaalt het volledige bedrag voordat documenten en overdracht worden vrijgegeven.
- Bij afwijzing op dag 3 wordt het project gesloten als `preview_rejected` en blijven definitieve bestanden intern.

### Aanbevolen commerciële variant

Mijn advies is om dag 3 als akkoord- en aanbetalingsmoment te gebruiken:

- klant heeft dan al een bijna volledige website gezien;
- Max Webstudio loopt minder risico;
- klant voelt nog steeds controle, omdat betaling pas na tastbare preview komt;
- dag 5 blijft beschermd door de restbetaling-lock.

## Exacte Mailingflow

### Mail 1 - Dag 1: klantportaal activeren

Onderwerp: `Je Max Webstudio klantportaal staat klaar`

Knop: `Klantportaal activeren`

Tekst:

```text
Hoi [voornaam],

Leuk dat we elkaar hebben gesproken. We hebben je project alvast klaargezet in je Max Webstudio klantportaal.

Via de knop hieronder maak je je eigen wachtwoord aan. Daarna kun je vanaf dag 1 je projectstatus volgen.

De komende dagen werken we volgens deze planning:

Dag 3: je preview staat klaar.
Dag 5: de definitieve oplevering staat klaar na afronding van akkoord en betaling.

Met vriendelijke groet,
Max Webstudio
```

Actie in systeem:

- klantprofiel en projectdossier aanmaken of klaarzetten op basis van het bekende e-mailadres;
- accountactivatie versturen naar `/account-activeren.html?mode=onboarding&projectId=[project_id]&customerId=[customer_id]`;
- project naar `project_started`;
- documenten op `locked`;
- e-mail event `day1_received`.

### Mail 1B - Dag 1: account geactiveerd

Onderwerp: `Je klantportaal is actief`

Knop: `Open klantportaal`

Tekst:

```text
Hoi [voornaam],

Je klantportaal is actief.

Vanaf nu kun je hier je projectstatus volgen. Zodra de preview klaarstaat, verschijnt die in hetzelfde dossier en sturen we je ook een aparte mail.

Met vriendelijke groet,
Max Webstudio
```

Actie in systeem:

- klantstatus naar `portal_active`;
- project blijft `project_started`;
- e-mail event `portal_activated`.

### Mail 2 - Dag 2: concept in opbouw

Onderwerp: `Je website is in opbouw`

Knop: `Bekijk projectstatus`

Tekst:

```text
Hallo [voornaam],

We zijn bezig met de eerste volledige versie van je website. Vandaag werken we aan structuur, uitstraling, teksten en conversie.

Je hoeft nu niets te doen. Je kunt de status volgen in je klantportaal. Zodra de preview klaarstaat, krijg je van ons een aparte mail.

Met vriendelijke groet,
Max Webstudio
```

Actie in systeem:

- project naar `concept_in_progress`;
- e-mail event `day2_concept`.

### Mail 3 - Dag 3: preview klaar + akkoord + aanbetaling

Onderwerp: `Je preview staat klaar`

Knop: `Bekijk preview en geef akkoord`

Tekst:

```text
Hallo [voornaam],

Je preview staat klaar in je klantportaal. Dit is de eerste volledige richting van je website.

Ben je tevreden met de richting? Geef dan akkoord. Daarna vragen we de aanbetaling, zodat we de definitieve afwerking, domeinvoorbereiding en oplevering kunnen afronden.

Als je nog feedback hebt, kun je die direct bij de preview doorgeven.

Met vriendelijke groet,
Max Webstudio
```

Actie in systeem:

- project naar `preview_ready`;
- previewbestanden tonen als `preview_only`;
- previewknop leidt naar `/preview.html?projectId=[id]&token=[preview_token]`;
- akkoord en feedback blijven binnen het klantportaal/previewdossier;
- na akkoord wordt betaalverzoek `deposit` aangemaakt;
- Mollie webhook zet `deposit_paid` zodra betaling bevestigd is.

### Mail 4 - Dag 3: aanbetaling ontvangen

Onderwerp: `Aanbetaling ontvangen, we ronden je website af`

Knop: `Bekijk projectstatus`

Tekst:

```text
Hallo [voornaam],

Bedankt, we hebben je aanbetaling ontvangen.

We gaan nu verder met de definitieve afwerking richting oplevering. Denk aan de laatste controles, technische voorbereiding en domein/livegang-stappen.

Met vriendelijke groet,
Max Webstudio
```

Actie in systeem:

- project naar `preview_approved`;
- betaalstatus naar `deposit_paid`;
- e-mail event `deposit_paid_confirmation`.

### Mail 5 - Dag 4: laatste afwerking

Onderwerp: `We leggen de laatste hand aan je website`

Knop: `Bekijk projectstatus`

Tekst:

```text
Hallo [voornaam],

We werken vandaag aan de laatste afwerking van je website.

Als er nog kleine punten uit de preview zijn doorgegeven, nemen we die mee. Morgen zetten we de oplevering voor je klaar.

Met vriendelijke groet,
Max Webstudio
```

Actie in systeem:

- project naar `finalizing`;
- documenten blijven `preview_only` of `locked`;
- e-mail event `day4_feedback_refinement`.

### Mail 6 - Dag 5: oplevering klaar + restbetaling

Onderwerp: `Je website staat klaar voor oplevering`

Knop: `Akkoord geven en afronden`

Tekst:

```text
Hallo [voornaam],

Je website staat klaar voor definitieve oplevering.

Via de knop hieronder geef je akkoord op de oplevering. Daarna betaal je het openstaande bedrag. Zodra de betaling is bevestigd, worden de definitieve documenten, overdracht en downloadlinks automatisch vrijgegeven in je klantportaal.

Met vriendelijke groet,
Max Webstudio
```

Actie in systeem:

- project naar `delivery_ready`;
- betaalstatus naar `final_payment_pending`;
- akkoordknop leidt naar `/oplevering-akkoord.html?projectId=[id]&step=delivery`;
- betalingstype is `remaining` bij aanbetaling of `full` bij no-cure-no-pay;
- documenten blijven `locked`.

### Mail 7 - Dag 5: betaling ontvangen + documenten vrijgegeven

Onderwerp: `Betaling ontvangen, je oplevering staat klaar`

Knop: `Open je oplevering`

Tekst:

```text
Hallo [voornaam],

Bedankt, we hebben de betaling ontvangen.

Je definitieve oplevering staat nu klaar in je klantportaal. Daar vind je de afgesproken documenten, overdracht en relevante links.

Met vriendelijke groet,
Max Webstudio
```

Actie in systeem:

- project naar `delivered`;
- betaalstatus naar `paid`;
- documentstatus naar `unlocked`;
- tijdelijke signed downloadlinks beschikbaar maken;
- e-mail event `delivery_unlocked`.

## Bescherming

Definitieve bestanden worden niet in e-mails meegestuurd en krijgen geen publieke URL.

Benodigde regels:

- bestanden staan in private Supabase Storage;
- `files.storage_path` bevat alleen het objectpad, nooit een publieke link;
- klantdownload loopt via een server-side function;
- function controleert klantlogin, projecteigenaarschap en `delivery_lock_status = unlocked`;
- downloadlink is tijdelijk geldig;
- medewerkers zonder adminrol zien voor betaling geen definitieve downloadknop;
- alle unlocks worden gelogd.

Previewbescherming:

- previewlink mag zichtbaar zijn, maar zonder definitieve overdrachtsbestanden;
- eventueel watermerk of read-only staging;
- geen ZIP, bronbestanden, exportdocumenten of credential-documenten voor betaling.

## Technische Haalbaarheid

Wat al aanwezig is:

- Mollie betaling aanmaken voor facturen via `functions/admin-mollie-payment.js`;
- Mollie webhook die betaalstatussen verwerkt via `functions/mollie-webhook.js`;
- Resend e-mailbasis via `functions/email.js`;
- private factuurdownload met auth-check via `functions/invoice-download.js`;
- klantportaal met project, preview, facturen en bestanden als bestaande modules;
- concept client e-mailflow in `supabase/migration-drafts/021_structured_intake_approval_email_flow.sql`.

Wat nog nodig is voor deze flow:

- canonical betaalvelden op `public.invoices` blijven leidend maken, niet opnieuw bouwen op `customer_invoices`;
- projectvelden voor `payment_flow_type`, `deposit_invoice_id`, `final_invoice_id`, `delivery_lock_status`;
- nieuwe e-mailtypes voor `portal_activated`, `deposit_paid_confirmation` en `delivery_unlocked`;
- server-side dag-1 invite/provisioning die klant, project en auth-user op basis van e-mailadres koppelt;
- server-side akkoordfunctie die nooit direct documenten vrijgeeft;
- server-side downloadfunctie voor opleverbestanden met betaal-lock;
- webhook-uitbreiding: wanneer de gekoppelde eindfactuur betaald is, project/documenten automatisch unlocken;
- admin UI-knoppen: `Dag 3 preview versturen`, `Dag 5 oplevering klaarzetten`, `Unlock-status bekijken`.

## Go/No-Go Beslissing

Voor implementatie moeten we kiezen:

1. `Aanbetaling dag 3 verplicht na preview` of `no-cure-no-pay volledig op dag 5`.
2. Exact aanbetalingspercentage of vast bedrag.
3. Of klanten dag 3 ook feedback mogen geven zonder direct akkoord.
4. Welke documenten onder de lock vallen: overdracht, factuur-PDF, handleiding, accountgegevens, bronbestanden.
5. Of gewone medewerkers definitieve bestanden mogen zien voor betaling, of alleen admin/eigenaar.

Mijn aanbevolen keuze:

- dag 3 akkoord + aanbetaling;
- dag 5 restbetaling + automatische unlock;
- medewerkers zien preview en projectdata, maar geen definitieve overdracht voor betaling tenzij admin.

## Klantactivatie

Omdat het e-mailadres na het eerste belcontact al bekend is, begint klantactivatie op dag 1.

De dag-1 mail gebruikt als voorkeursroute:

`/account-activeren.html?mode=onboarding&projectId=[project_id]&customerId=[customer_id]`

Na activatie stuurt de pagina de klant door naar:

`/klantportaal.html`

De dag-3 previewmail gebruikt daarna:

`/account-activeren.html?mode=preview&projectId=[project_id]&token=[preview_token]`

Als de klant al geactiveerd is, hoeft hij niet opnieuw een wachtwoord aan te maken. Dan kan de knop direct naar:

`/preview.html?projectId=[project_id]&token=[preview_token]&from=activation`

Vanaf dag 1 is de klantomgeving actief en kan dezelfde klant later via `/login.html` en `/klantportaal.html` verder.
