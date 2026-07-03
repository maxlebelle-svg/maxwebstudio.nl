# RC1 Exit Checklist

Status: `RC1 FROZEN / SALES VALIDATION REQUIRED`

Doel:

RC1 is functioneel bevroren. Max Webstudio en Max CRM zijn goed genoeg om echte klanten te bedienen, maar RC1 wordt pas volledig vrijgegeven wanneer de laatste handmatige klantreis, salesvalidatie en eigenaar-GO groen zijn.

## Releaseprincipe

RC1 draait vanaf nu om verkopen, valideren en alleen noodzakelijke polish. Niet uitbreiden.

Bedrijfsregel:

> Software is nooit het einddoel. Het einddoel is een bedrijf dat zonder chaos kan groeien.

Toegestaan:

- bugfixes;
- UX-polish;
- responsive fixes;
- performanceverbeteringen;
- betere empty states;
- betere loading states;
- betere foutmeldingen;
- consistentie met het Max CRM Design System.

Niet toegestaan binnen RC1:

- nieuwe platformmodules;
- nieuwe grote modules;
- bulk scraping;
- automatische cold outreach;
- AI Sales Coach;
- automatische offertegeneratie;
- extra workflowcomplexiteit zonder expliciete RC2/RC3/RC4-goedkeuring.

Alleen toegestaan na freeze:

- blockers die verkoop of klantgebruik verhinderen;
- bewezen conversiefrictie uit echte ondernemersfeedback;
- stabiliteitsproblemen;
- kleine copy/UX-correcties die direct helpen bij aanvragen of vertrouwen.

## Sales Validation Gate

- [ ] 25 bedrijven gebeld op dag 1.
- [ ] Feedback van echte ondernemers vastgelegd.
- [ ] Alleen bewezen frictiepunten aangepast.
- [ ] Nog eens 25 bedrijven gebeld na eerste feedbackronde.
- [ ] Minimaal 10 onbekende ondernemers hebben de homepage 2 minuten bekeken.
- [ ] Vijf vragen beantwoord: wat verkoopt dit bedrijf, zou je een gratis preview aanvragen, wat gaf vertrouwen, wat miste je, wat houdt je tegen.
- [ ] Eerste verkoop-KPI staat centraal: 10 betalende klanten.

## Productprincipes

- Nieuwe functies worden alleen toegevoegd als ze een bestaande workflow aantoonbaar versterken.
- Geen AI toevoegen als objectieve data hetzelfde probleem eerst betrouwbaarder kan oplossen.
- Elke nieuwe module moet passen binnen het Max CRM Design System.
- Alles wat een verkoper ziet moet actiegericht zijn.

Voorbeelden:

- Niet alleen: `Meta description ontbreekt`.
- Wel: `Gebruik online vindbaarheid als opening in je gesprek`.
- Niet alleen: `Leadscore 64`.
- Wel: `Goede verkoopkans - focus op SEO en vertrouwen`.

## Core Platform

- [ ] Publieke website laadt zonder console-breaking errors.
- [ ] Klantportaal toont geen demo-data zonder geldige sessie.
- [ ] Admin-dashboard vereist geldige admin-login.
- [ ] Admin-token/noodfallback is niet zichtbaar in normale workflow.
- [ ] Geen service-role of secrets zichtbaar in de frontend.
- [ ] Developer Mode staat uit voor normale gebruikers.
- [ ] Technische meldingen zijn verborgen achter Developer Mode.

## Max CRM UI Consistency

- [ ] Premium dark theme is overal behouden.
- [ ] Geen witte vlakken behalve externe embeds zoals Google Maps.
- [ ] Primaire acties zijn blauw.
- [ ] Secundaire acties zijn licht/neutraal.
- [ ] Gevaaracties zijn rood.
- [ ] Positieve statusbadges zijn groen.
- [ ] Waarschuwingen zijn geel/oranje.
- [ ] Cards, knoppen, badges, formulieren en tabellen volgen `docs/design/MAX_CRM_DESIGN_SYSTEM.md`.
- [ ] Detailpanelen rekken niet onnodig door.
- [ ] Tabellen/lijsten zijn compact en scanbaar.

## Sales Workspace RC1

- [ ] Google Maps Lead Finder laadt zonder JavaScript-errors.
- [ ] Google Places API-key staat niet in git.
- [ ] Zoekopdracht `jumbo almere` geeft echte resultaten en markers.
- [ ] Zoekopdracht `bouwbedrijf bodegraven` geeft relevante resultaten.
- [ ] Zoekopdracht `Quantumbouw Bodegraven` werkt wanneer Google het bedrijf vindt.
- [ ] Marker click toont bedrijfsdetails links.
- [ ] `Gegevens overnemen` vult het leadformulier correct.
- [ ] Bestaande ingevulde velden worden niet overschreven zonder bevestiging.
- [ ] Geen fake/demo leads zichtbaar in normale productie.
- [ ] Google Maps fouten tonen een nette melding.
- [ ] Developer Mode toont optioneel query/status/result count, zonder secrets.

## Website Scan MVP

- [ ] Scan start alleen na klik op `Website analyseren`.
- [ ] Scan gebruikt geen AI.
- [ ] Scan gebruikt geen bulk scraping.
- [ ] Scan crasht niet bij onbereikbare websites.
- [ ] Onbereikbare websites tonen een begrijpelijke foutmelding.
- [ ] Geen JavaScript-stacktrace zichtbaar in normale modus.
- [ ] Scanresultaat toont duidelijke checks.
- [ ] Leadscore is zichtbaar en begrijpelijk.
- [ ] Scanresultaat blijft binnen premium dark theme.

## Customer And Admin Flows

- [ ] Nieuwe klantflow schrijft niet naar localStorage wanneer productie-Supabase beschikbaar is.
- [ ] Klantrecords worden server-side veilig aangemaakt.
- [ ] Welkomstmail wordt alleen verstuurd als de admin dit bewust aanvinkt.
- [ ] Resend-key blijft server-side.
- [ ] Factuur- en offerteflows tonen nette lege staten als er geen data is.
- [ ] Mollie blijft test/voorbereid tenzij live betalingen expliciet zijn vrijgegeven.

## Responsive And Usability

- [ ] Dashboard is bruikbaar op desktop.
- [ ] Sales Workspace is bruikbaar op desktop.
- [ ] Klantportaal is bruikbaar op mobiel.
- [ ] Geen horizontale overflow op normale laptopbreedtes.
- [ ] Geen vastzittende scrollgebieden.
- [ ] Belangrijke acties blijven bereikbaar zonder extreme scroll.

## Performance And Stability

- [ ] Geen console-breaking errors in normale workflow.
- [ ] Falen van Google Maps blokkeert de rest van Max CRM niet.
- [ ] Falen van Website Scan blokkeert de rest van Max CRM niet.
- [ ] Loading states blijven begrijpelijk.
- [ ] Grote externe calls hebben timeout/fallback.
- [ ] Dashboard blijft bruikbaar als een module tijdelijk geen data kan laden.

## RC1 Exit Decision

RC1 mag pas `RELEASED` worden wanneer:

- alle kritieke items groen zijn;
- resterende open punten expliciet als `known limitation` zijn vastgelegd;
- er geen zichtbare demo-data in normale productie staat;
- er geen technische fouten zichtbaar zijn buiten Developer Mode;
- salesvalidatie geen kritieke conversieblokkades meer toont;
- de eigenaar handmatig GO geeft.
