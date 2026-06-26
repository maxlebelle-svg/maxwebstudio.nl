# Client Portal

Dit document beschrijft de richting voor een toekomstig klantportaal. Er is momenteel nog geen volledig klantportaal gebouwd.

## Huidige Bouwstenen

- `/public/wijziging-doorgeven.html`: pagina waarmee bestaande klanten wijzigingsverzoeken kunnen doorgeven.
- `/public/bedankt-wijziging.html`: statische bedankpagina na een wijzigingsverzoek.
- `/public/admin-dashboard.html`: Admin Dashboard v1 als statische backoffice-preview met placeholder-data.

Admin Dashboard v1 bevat nog geen login, backend, echte klantdata of externe koppelingen. De pagina is bedoeld als visuele en structurele basis voor latere integraties met Mollie, Resend, Netlify Forms/Functions, klantendatabase, domeinen, hosting, AI wijzigingsvoorstellen en analytics.

Wijzigingsverzoeken worden nu via `/.netlify/functions/submit-change-request` verwerkt en per e-mail naar Max Web Studio gestuurd. De function valideert verplichte velden, ondersteunt een honeypot en maakt een eerste interne classificatie: waarschijnlijk binnen onderhoud, waarschijnlijk offerte nodig of handmatig beoordelen.

Bestandsuploads zijn voorbereid in de frontend, maar echte uploadopslag is nog niet aangesloten. In deze fase worden alleen bestandsnamen meegestuurd. Latere opties zijn Netlify Forms, Netlify Blobs, Supabase Storage of externe bestandsopslag.

## Doel

Een klantportaal moet Max Web Studio schaalbaar maken door klanten, betalingen, intake, projectstatus en onderhoud op een centrale plek te beheren.

## Mogelijke Functionaliteiten

Voor klanten:

- projectstatus bekijken
- intake aanvullen
- bestanden uploaden
- facturen en betalingen bekijken
- supportverzoeken indienen
- onderhoudspakket bekijken
- wijzigingsverzoeken indienen

Voor Max:

- klantoverzicht
- projectoverzicht
- betaalstatus
- intakegegevens
- upsells en offerte-uitbreidingen
- taken en deadlines
- onderhoudsplanning
- supportbeheer

## Mogelijke Fases

### Fase 1 - Admin Overzicht

- betaalrecords tonen
- intakes tonen
- status handmatig beheren
- eenvoudige beveiliging

### Fase 2 - Klant Login

- klant kan eigen project bekijken
- intake en bestanden beheren
- basisnotificaties

### Fase 3 - Automatisering

- automatisch project aanmaken na betaling
- automatische reminders
- restbetaling genereren
- onderhoudsabonnement activeren

## Technische Keuzes

Nog niet gekozen.

Mogelijke opties:

- Supabase
- Netlify Blobs plus eenvoudige auth
- custom Node backend
- externe CRM/tooling

Geen portaal bouwen zonder aparte technische planning en akkoord.

## Security Eisen

Een klantportaal vereist:

- veilige authenticatie
- autorisatie per klant
- duurzame opslag
- audit trail
- bescherming van uploads
- rate limiting
- duidelijke privacy-afspraken

## Relatie Met Huidige Site

Huidige aanknopingspunten:

- Mollie payment ID
- onboarding intake
- admin-intakes endpoint
- Resend e-mailbevestiging
- onderhoudspakketten

Deze moeten eerst betrouwbaarder gekoppeld worden voordat een klantportaal logisch is.
