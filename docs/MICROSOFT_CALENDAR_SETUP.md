# Microsoft agenda koppeling

De sales agenda kan Outlook/Microsoft Calendar gebruiken als centrale agenda, terwijl Max CRM de eigen agenda-interface blijft tonen.

## Netlify omgevingsvariabelen

Zet deze variabelen in Netlify voordat live synchronisatie actief wordt:

- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_DEFAULT_CALENDAR_USER` optioneel, bijvoorbeeld `sales@maxwebstudio.nl`

Zonder deze variabelen blijft de sales agenda lokaal werken en toont het portaal dat Outlook nog niet gekoppeld is.

## Microsoft app rechten

De Microsoft app moet via Microsoft Graph agenda-events kunnen lezen en aanmaken voor de betreffende medewerkers. Gebruik application permissions wanneer Max CRM namens medewerkers afspraken in hun werkagenda moet zetten.

Minimale intentie:

- Agenda-afspraken lezen voor de weekagenda.
- Agenda-afspraken aanmaken vanuit een lead of handmatige agenda-click.
- Max CRM metadata meesturen, zoals lead ID en bron.

Na het toevoegen van rechten moet admin consent worden gegeven in Microsoft Entra.
