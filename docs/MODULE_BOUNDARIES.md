# Module Boundaries

Dit document beschrijft welke module waarvoor verantwoordelijk is. Nieuwe features moeten binnen deze grenzen blijven, tenzij Max expliciet akkoord geeft op een architectuurwijziging.

## Public Website

Verantwoordelijk voor:

- marketing
- SEO
- portfolio/demo showcase
- pricing
- contact/lead capture
- publieke juridische pagina's

Niet verantwoordelijk voor:

- adminacties
- klantdata beheren
- directe service-role toegang
- AI-generatie
- live betalingen zonder server-side endpoint

## Admin CRM

Verantwoordelijk voor:

- klanten
- websites
- projecten
- bestandenmetadata
- offertes
- facturen
- abonnementen
- release/developer mode
- AI Website Wizard intake

Productierichting:

- UI mag local/demo blijven zolang provider mode dat aangeeft.
- Supabase wordt leidend via repositories/providers.
- Admin-mutaties met gevoelige rechten moeten server-side of via goedgekeurde Supabase/RLS-route lopen.

## Klantportaal

Verantwoordelijk voor klantveilige inzage in:

- eigen klantgegevens
- eigen websites
- eigen projecten
- eigen offertes
- eigen facturen
- eigen abonnementen
- eigen bestanden/downloads

Niet tonen:

- interne notities
- interne classificaties
- admin statusvelden die niet klantveilig zijn
- service role data
- data van andere klanten

Productierichting:

- Supabase Auth + RLS wordt verplicht voor live klantdata.
- Demo/local blijft alleen verkoop- en testmodus.

## Facturatie En Mollie

Verantwoordelijk voor:

- factuurdata
- factuurregels
- betaalstatussen
- abonnementen
- Mollie payment/subscription IDs
- webhook sync

Niet te vroeg:

- live iDEAL
- automatische incasso
- dubbele betaalverzoeken
- live webhooks zonder testbewijs

Eerst testmodus, daarna production approval.

## Bestanden En Storage

Verantwoordelijk voor:

- bestandsmetadata
- klant/project/website koppelingen
- private storage paths
- signed downloads

Productierichting:

- Supabase Storage private buckets.
- Klantdownloads alleen via Auth/RLS of veilige server-side controle.
- Geen publieke storage browse.

## Demo Sites

Verantwoordelijk voor:

- verkoopvoorbeelden per branche
- demo portfolio registry
- zelfstandige statische demo-sites
- CTA naar aanvraag

Niet verantwoordelijk voor:

- echte klantdata
- database
- AI calls
- CRM mutaties

## AI Website Wizard

Verantwoordelijk voor:

- intake workflow
- gestructureerde briefing
- lokale draft-state
- toekomstige AI readiness

Niet verantwoordelijk voor:

- automatische productie-publicatie
- OpenAI calls zonder aparte fase
- logo/content generatie zonder approval
- CRM writes zonder provider-afspraak

## Release En Deployment

Verantwoordelijk voor:

- readiness
- blockers
- evidence
- release decision
- rollbackplan
- deployment checklist

Deze module voert zelf geen productie-deployment uit. Publicatie blijft handmatig via GitHub/Netlify na akkoord.

