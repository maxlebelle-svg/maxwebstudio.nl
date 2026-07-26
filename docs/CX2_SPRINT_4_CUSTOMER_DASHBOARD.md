# CX2 Sprint 4 — Customer Dashboard

## Basis en scope

Deze sprint is gebouwd vanaf productiecommit `dcd830ebb230e2034894ab14caf741ca72070eea`. De wijziging vervangt uitsluitend de dashboardpresentatie van het bestaande klantportaal. Auth, routes, RLS, ownership, repositories, Netlify Functions en databaseschema's zijn niet gewijzigd.

## Inventarisatie van het oude dashboard

Het bestaande dashboard bevatte alle vereiste gegevens, maar verdeelde de eerste klantvraag over vier samenvattingstegels, een losse volgende-stapkaart, een groot websiteblok, financiële en feedbackblokken en vier zijkaarten. Daardoor stond dezelfde context op meerdere plaatsen en was de prioriteit minder duidelijk. Voortgang werd vóór de canonieke journey-read bovendien lokaal geschat uit statussen.

## Nieuw dashboard-viewmodel

`public/src/cx2-dashboard-viewmodel.mjs` vertaalt uitsluitend reeds geladen klantdata naar presentatietoestanden. Het model bevat:

- persoonlijke begroeting en klantcontext;
- expliciete projectnaam, fase en voortgang;
- exact zeven modules: Website, Feedback, Berichten, Bestanden, Facturen, Domein en Zakelijke e-mail;
- per module een beschikbare, aandacht-, lege of later-status;
- uitsluitend bestaande portaalroutes.

Een percentage wordt alleen getoond wanneer `project.progress` werkelijk aanwezig en numeriek is. Daarna blijft de bestaande read-only journey-endpoint de canonieke bron voor voortgang, fasen en de volgende klantactie. Bij ontbrekende data toont de interface `Nog niet beschikbaar` in plaats van een schatting.

## UX-hiërarchie

1. Persoonlijke begroeting en klantcontext.
2. Actuele voortgang naast precies één volgende stap.
3. Zeven compacte modulekaarten met eerlijke beschikbaarheid.
4. Recente, werkelijk aanwezige activiteiten.

Dit volgt de goedgekeurde CX2-mockup: donkere premium shell, sterk voortgangsblok, compacte modules, duidelijke blauwe hoofdactie en één doorlopende portaalervaring.

## Responsive en toegankelijkheid

- Desktop: vaste zijbalk, vier modulekolommen en voortgang naast volgende stap.
- Tablet: horizontale navigatie, drie modulekolommen en gestapelde hoofdkaarten.
- Mobiel: één kolom, horizontaal scrolbare navigatie en geen documentoverflow bij 390 px.
- Semantische headings, landmarks en `aria-live` voor bijgewerkte dashboarddata.
- Echte `progressbar`-semantiek alleen wanneer een betrouwbaar percentage beschikbaar is.
- Projectfasen hebben afzonderlijke toegankelijke statuslabels.
- `prefers-reduced-motion` schakelt loadinganimatie en hoververplaatsing uit.

## Visueel bewijs

- `docs/evidence/cx2-sprint-4-dashboard/desktop-1440.png`
- `docs/evidence/cx2-sprint-4-dashboard/tablet-1024.png`
- `docs/evidence/cx2-sprint-4-dashboard/mobile-390.png`

De screenshots gebruiken uitsluitend de lokale visual-reviewfixture in `tests/fixtures/cx2-dashboard-visual.html`; er is niets gedeployed en er is geen productie- of klantdata gebruikt.

## Security en ownership

De bestaande `requireCustomerAccess`, Supabase-sessionhydratie, customer-profilecontext, website/projectcontext en read-only journeyprogress blijven de enige runtimebronnen. Het viewmodel doet geen netwerkcalls en kent geen Supabase-, token-, auth- of service-rolecontract. Er zijn geen backendbestanden, migraties of policies gewijzigd.

## Bekende beperkingen

- Zakelijke e-mail blijft eerlijk `Volgt later` zolang de bestaande data geen status bevat.
- AI Telefoniste en Social Studio zijn bewust niet opgenomen.
- Feedbackopslag, digitaal akkoord, betaling, projectstart, domeinprovisioning en e-mailprovisioning blijven buiten deze sprint.
- De visual-reviewfixture bewijst layout en responsiviteit; productiecertificering hoort pas bij een afzonderlijke goedgekeurde deployfase.
