# Max AI copilot activeren

De copilot maakt alleen interne antwoordconcepten. Een medewerker moet een concept eerst kiezen, kan de tekst aanpassen en verzendt daarna zelf. De copilot roept WhatsApp nooit rechtstreeks aan.

Naast deze assistentmodus bestaat een afzonderlijke WhatsApp-autopilot. Die mag alleen door een beheerder of sales manager per gesprek worden ingeschakeld. In die modus reageert Max wel zelfstandig, met verplichte overdracht bij gevoelige onderwerpen of twijfel.

## Eenmalige activatie

1. Voer voor alleen de copilot de Supabase-migraties uit tot en met `20260727163000_max_ai_copilot.sql`. Voer voor automatische WhatsApp-antwoorden ook `20260727173000_max_ai_whatsapp_autopilot.sql` uit.
2. Maak in het OpenAI Platform een projectsleutel met een eigen bestedingslimiet.
3. Voeg in Netlify de geheime omgevingsvariabele `OPENAI_API_KEY` toe.
4. Voeg `OPENAI_MODEL=gpt-5.6-sol` toe. Dit kan later zonder codewijziging naar een goedkoper getest model worden veranderd.
5. Deploy de website en functies opnieuw.

## Veilige praktijktest

1. Open `/admin-gesprekken` met een medewerkeraccount.
2. Open een prospect die aan die medewerker is toegewezen.
3. Klik op **Max AI voorstel**.
4. Controleer dat het voorstel als intern concept verschijnt en niets is verzonden.
5. Klik op **Gebruik concept**, pas de tekst aan en controleer dat alleen het invoerveld is gevuld.
6. Klik pas daarna handmatig op **Versturen**.
7. Controleer met een tweede medewerker dat die geen gesprekken of concepten van de eerste medewerker kan openen.

## Kostenbeheersing

- AI draait alleen na een klik van een medewerker.
- Per aanvraag worden maximaal 24 berichten en 12.000 tekens gesprekscontext gebruikt.
- De uitvoer is begrensd op 500 tokens en gebruikt lage redeneerinspanning.
- De API-aanvraag gebruikt `store: false`.
- Stel daarnaast altijd een maandelijkse projectlimiet in het OpenAI Platform in.
