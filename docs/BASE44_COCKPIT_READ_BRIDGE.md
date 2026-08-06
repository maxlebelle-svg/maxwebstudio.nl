# Base44 Cockpit: veilige alleen-lezen koppeling

## Doel van fase 1

De Max Webstudio Cockpit leest actuele operationele gegevens uit de bestaande
Max Webstudio-databron. In deze fase kan Base44 niets wijzigen, verwijderen,
versturen, uploaden of publiceren.

De gegevens blijven in Supabase. Base44 gebruikt de resultaten alleen voor de
actuele schermweergave en maakt geen tweede CRM-database.

## Beveiligingsgrens

- Endpoint: `GET https://maxwebstudio.nl/.netlify/functions/cockpit-read`
- Alleen server-naar-server; rechtstreekse browseraanroepen worden geweigerd.
- Authenticatie: `Authorization: Bearer <COCKPIT_READ_TOKEN>`.
- `COCKPIT_READ_TOKEN` is een aparte willekeurige sleutel van minimaal 32 tekens.
- De sleutel staat alleen in Netlify en in de beveiligde secrets van Base44.
- De afzonderlijke `SUPABASE_COCKPIT_SECRET_KEY` verlaat Netlify nooit.
- De response bevat alleen geschoonde Cockpit-velden en geen interne notities of metadata.
- Bij een lead kan uitsluitend de intrekbare openbare demo-URL worden meegegeven wanneer
  `public_preview_publications` voor die lead actief is. Interne preview-URL's, tokens,
  versiegegevens en niet-gepubliceerde demo's blijven server-side.
- Demo-records worden uitgefilterd en responses worden niet gecachet.

## Volgorde voor ingebruikname

1. Maak in Supabase een nieuwe secret API key met de naam `maxwebstudio-cockpit`.
   Laat de bestaande legacy service-role key voorlopig actief totdat alle overige
   serverfuncties afzonderlijk naar het nieuwe sleutelmodel zijn gemigreerd.
2. Voeg de nieuwe sleutel in Netlify toe als `SUPABASE_COCKPIT_SECRET_KEY`. Deze
   sleutel komt niet in Base44 terecht.
3. Genereer lokaal een nieuwe willekeurige waarde voor `COCKPIT_READ_TOKEN`. Deel
   deze niet in chat, broncode, screenshots of frontendcode.
4. Voeg `COCKPIT_READ_TOKEN` toe aan de production environment van Netlify.
5. Deploy de Max Webstudio-site met `functions/cockpit-read.js`.
6. Voeg exact dezelfde waarde toe aan Base44 als beveiligde app-secret met de naam
   `COCKPIT_READ_TOKEN`.
7. Laat Base44 een backendfunctie maken die het endpoint aanroept. De frontend mag
   het token nooit ontvangen en mag het endpoint niet rechtstreeks aanroepen.
8. Test eerst alleen de aantallen en lijsten. Vergelijk enkele records met het
   bestaande adminportaal voordat demo-data in de Cockpit wordt vervangen.

## Opdracht voor Base44 na deployment

> Maak een server-side functie `loadCockpitData`. Deze functie doet uitsluitend een
> GET-verzoek naar `https://maxwebstudio.nl/.netlify/functions/cockpit-read` met de
> app-secret `COCKPIT_READ_TOKEN` als Bearer-token. Geef alleen de JSON-response door
> aan de ingelogde eigenaar van deze private app. Zet het token nooit in frontendcode,
> logs of foutmeldingen. Sla de ontvangen productiegegevens niet op in Base44 en
> voeg geen POST-, PATCH- of DELETE-acties toe. Als `partial` waar is, toon dan een
> rustige melding dat een deel van de gegevens tijdelijk niet beschikbaar is.

## Demo openen vanuit een lead

Een lead met een actieve publicatie bevat `demoAvailable: true` en een `demoUrl` op
`https://preview.maxwebstudio.nl/...`. Toon daarvoor op de leaddetailpagina de knop
`Demo bekijken` en open de URL in een nieuw tabblad met `noopener,noreferrer`. Toon
geen knop wanneer `demoAvailable` niet waar is. Bouw nooit zelf een preview-URL op en
gebruik niet het gewone `websiteUrl`-veld als demo.

## Fase 2: pas na acceptatie van fase 1

Schrijfacties krijgen later losse, kleine endpoints per handeling, bijvoorbeeld
`actie afronden` of `leadnotitie toevoegen`. Elke actie krijgt server-side validatie,
een bevestigingsscherm, logging en zo nodig idempotentie. E-mail versturen,
bestanden opslaan en websites publiceren vallen uitdrukkelijk niet onder fase 1.
