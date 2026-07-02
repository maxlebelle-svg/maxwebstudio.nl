# Sprint 3B - Admin Sales Pipeline Blueprint

Status: `BLUEPRINT / NO LIVE AUTOMATION`

## Doel

Sprint 3B ontwerpt hoe het adminportaal de volledige commerciële flow ondersteunt:

```text
Nieuwe lead
-> Bellen
-> Notities
-> Offerte
-> Verkocht
-> Klant-aanmaak wizard
-> Klant actief
```

Het doel is niet om een zwaar CRM te bouwen, maar om Max Webstudio een duidelijke verkoopmotor te geven. Een lead moet zonder handwerk kunnen doorgroeien naar een actieve klant met klantportaal.

## Productprincipe

De sales pipeline moet voelen als een rustige actielijst, niet als een spreadsheet.

Elke lead moet direct antwoord geven op:

- wie is deze ondernemer?
- wat wil hij laten bouwen?
- wat is de volgende actie?
- wanneer moet Max Webstudio opvolgen?
- is deze lead klaar om klant te worden?

## Scope MVP

Het adminportaal moet uiteindelijk kunnen:

- nieuwe lead aanmaken;
- leadstatus bijhouden;
- belmoment loggen;
- notities toevoegen;
- follow-up datum zetten;
- offerte voorbereiden;
- offerte versturen of markeren als klaar voor verzending;
- lead markeren als verkocht;
- klant-aanmaak wizard starten met ingevulde leadgegevens;
- klant/profiel/customer/website/project aanmaken;
- klantportaal activeren;
- klantstatus tonen als `actief`.

## Buiten Scope

Nog niet bouwen in Sprint 3B:

- VoIP;
- Mollie;
- Resend live verzending;
- volledige CRM-suite;
- Leadfinder-automatisering;
- AI-verkoopassistent;
- Sales Portal;
- offerte-PDF generatie;
- brede finance-tabellen;
- nieuwe productie-SQL zonder aparte migration approval.

## Pipeline Statussen

| Status | Betekenis | Primaire actie |
| --- | --- | --- |
| `new` | Nieuwe lead binnengekomen | Lead beoordelen |
| `contact_planned` | Belmoment of opvolging gepland | Bellen/loggen |
| `contacted` | Contact gehad | Notitie + volgende stap |
| `qualified` | Past bij Max Webstudio | Offerte voorbereiden |
| `quote_ready` | Offerte klaar voor verzending | Offerte controleren |
| `quote_sent` | Offerte verzonden | Follow-up plannen |
| `won` | Lead verkocht | Klant aanmaken |
| `lost` | Niet doorgegaan | Reden vastleggen |
| `customer_active` | Klantportaal actief | Overdracht naar delivery |

## Minimale Leadvelden

| Veld | Doel |
| --- | --- |
| `name` | Contactpersoon |
| `company` | Bedrijfsnaam |
| `email` | Contact en latere Auth-uitnodiging |
| `phone` | Bellen/WhatsApp |
| `website_or_domain` | Bestaande of gewenste website |
| `package_interest` | Basis/Plus/Pro of onbekend |
| `source` | Website, referral, Leadfinder, social, handmatig |
| `status` | Pipelinefase |
| `notes` | Interne context |
| `last_contact_at` | Laatste contactmoment |
| `follow_up_at` | Volgende actie |
| `quote_status` | Geen, concept, klaar, verzonden, akkoord |
| `converted_customer_id` | Koppeling na klant-aanmaak |

## Admin UX Flow

### 1. Lead Aanmaken

Doel: snel een ondernemer vastleggen zonder CRM-ruis.

Velden:

- naam;
- bedrijf;
- e-mail;
- telefoon;
- interessepakket;
- website/domein;
- korte notitie;
- follow-up datum.

CTA:

- `Lead opslaan`

### 2. Lead Detail

Doel: direct zien wat de volgende commerciële stap is.

Toont:

- leadstatus;
- contactgegevens;
- interessepakket;
- laatste notitie;
- follow-up datum;
- offerteblok;
- conversieblok.

Primaire CTA's:

- `Belmoment loggen`;
- `Offerte voorbereiden`;
- `Markeer als verkocht`.

### 3. Bellen En Notities

Doel: verkoopgesprekken vastleggen zonder zwaar CRM.

MVP:

- knop `Belmoment loggen`;
- datum/tijd automatisch;
- korte notitie;
- uitkomst: geen antwoord, gesproken, terugbellen, offerte sturen, niet passend.

### 4. Offerte Voorbereiden

Doel: de lead naar een voorstel brengen.

MVP:

- pakket;
- prijsindicatie;
- korte omschrijving;
- status `concept` of `klaar`;
- nog geen PDF;
- nog geen live verzending.

### 5. Verkocht

Doel: zonder dubbel invoeren door naar klantprovisioning.

Wanneer een lead `won` wordt:

- admin ziet CTA `Klant aanmaken`;
- wizard wordt geopend met voorgeselecteerde leadgegevens;
- admin vult ontbrekende gegevens aan;
- bestaande server-side customer onboarding wordt gebruikt;
- na succes wordt de lead gekoppeld aan de nieuwe customer;
- status wordt `customer_active`.

## Koppeling Met Bestaande Klant-Aanmaak Wizard

Sprint 3A heeft bewezen dat de admin wizard live een klant kan klaarzetten.

Sprint 3B gebruikt die wizard als eindpunt van sales:

```text
Lead verkocht
-> open customer onboarding wizard
-> prefill naam/bedrijf/e-mail/telefoon/pakket/domein
-> server-side provisioning
-> klantportaal klaar
-> lead status customer_active
```

Belangrijk:

- service-role blijft uitsluitend server-side;
- frontend mag geen service-role, setup-link of secrets opslaan;
- Resend blijft uit tot aparte approval;
- Mollie blijft uit tot aparte approval.

## Databron MVP

Voor de eerste UX-flow mag de pipeline nog local/demo of bestaande admin-data gebruiken zolang:

- duidelijk is dat productie-automatisering nog niet volledig live is;
- geen echte klantdata zonder expliciete actie wordt gemigreerd;
- lead -> customer conversie alleen via de bestaande server-side onboarding loopt.

Voor productie is later een aparte migration nodig voor:

- `leads`;
- `lead_notes` of veilige notitievelden;
- quote/concept-offertevelden;
- conversiekoppeling naar `customers`.

## Veiligheid

Verplicht:

- admin-token of adminsessie vereist;
- geen service-role in frontend;
- geen echte mail zonder Resend approval;
- geen betaling zonder Mollie approval;
- geen automatische klantactivatie zonder zichtbare adminactie;
- geen productie-SQL zonder migration review.

## Acceptatiecriteria

Sprint 3B is klaar wanneer:

- salesflow in het adminportaal productmatig is vastgelegd;
- minimale leadstatussen en acties zijn gedefinieerd;
- duidelijk is hoe `Lead verkocht` de bestaande klant-aanmaak wizard start;
- buiten-scope onderdelen expliciet geblokkeerd blijven;
- roadmap en projectstatus de sales-pipeline als volgende commerciële motor tonen.

## Aanbevolen Implementatievolgorde

1. `Sprint 3B.1 - Lead Pipeline UI MVP`
   - leadlijst, statuslabels, detailpaneel, follow-up datum.
   - Status: `IMPLEMENTED / LOCAL-DEMO PIPELINE / WIZARD PREFILL`
2. `Sprint 3B.2 - Lead Notes & Call Log MVP`
   - belnotities en eenvoudige opvolging.
3. `Sprint 3B.3 - Quote Preparation Placeholder`
   - offerteconcept zonder live verzending/PDF.
4. `Sprint 3B.4 - Convert Lead To Customer Wizard`
   - prefill van bestaande customer onboarding wizard.
5. `Sprint 3B Review`
   - lead -> klant actief flow controleren.
