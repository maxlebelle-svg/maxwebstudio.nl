# Contributing

Dit document beschrijft hoe wijzigingen aan Max Webstudio worden voorbereid, uitgevoerd en gecontroleerd. Gebruik `docs/AI_CONTEXT.md` als eerste contextdocument en dit document als praktische workflow.

## Werkvolgorde

Voordat je code schrijft:

1. Inventariseer bestaande bestanden, routes, services en componenten.
2. Leg kort uit welke onderdelen je wilt aanpassen.
3. Controleer of bestaande functionaliteit uitgebreid kan worden.
4. Pas daarna de code aan.
5. Controleer of bestaande flows niet worden doorbroken.
6. Rapporteer na afloop welke bestanden zijn gewijzigd en welke controles zijn uitgevoerd.

## Quality Checklist

Na iedere wijziging controleer je minimaal:

- Geen duplicate code toegevoegd.
- Geen duplicate routes.
- Geen duplicate services.
- Geen duplicate CSS componenten.
- Geen console errors.
- Responsive op mobiel.
- Responsive op desktop.
- Toegankelijkheid behouden.
- SEO niet verslechterd.
- Bestaande functionaliteit blijft werken.
- Geen technische platformdetails zichtbaar richting klanten.
- Geen Netlify-, GitHub-, debug- of stacktrace-informatie zichtbaar richting klanten.
- Geen API keys of secrets in frontendcode.
- Betaalbedragen blijven server-side leidend.

## Code-afspraken

- Maak kleine, gerichte wijzigingen.
- Gebruik bestaande patronen.
- Installeer geen libraries tenzij dat expliciet gevraagd wordt.
- Geen grote refactors zonder toestemming.
- Verwijder niets zonder expliciete opdracht.
- `/public` is leidend voor live frontend-wijzigingen.
- Root-bestanden zoals `index.html`, `styles.css` en `script.js` kunnen duplicaten of oudere versies zijn.
- Gebruik vanilla JavaScript tenzij anders goedgekeurd.
- Gebruik bestaande CSS variables en componentpatronen.
- Gebruik veilige DOM-opbouw bij formulierdata.
- Houd betaalbedragen en gevoelige acties server-side.
- Zet nooit API keys of secrets in frontendcode.

## Rapportage Na Werk

Rapporteer na iedere wijziging:

- samenvatting;
- gewijzigde bestanden;
- impact;
- uitgevoerde controles;
- resterende risico's of aandachtspunten.
