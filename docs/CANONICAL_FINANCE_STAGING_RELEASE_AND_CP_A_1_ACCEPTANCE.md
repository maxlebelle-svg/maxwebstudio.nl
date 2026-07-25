# Canonical finance staging release and CP-A.1 acceptance

## Huidige bewezen staat

De canonical-financerelease `cd3c87fb3bf9aaa9530216dc841b1ff5486caf38` staat op staging. De quality-repairmigratie `20260724130000` is daar één keer toegepast. Finance 19/19, login, sessieherstel, dashboard, klantkoppeling, previewrendering, responsive weergave en sandboxing waren groen.

CP-A.1 stopte veilig vóór de approvalrequest doordat `client-preview-render` geen `package_checksum` en `created_at` selecteerde. Er is bij die stop geen approvalrecord of trust-event aangemaakt en geen betaling of providercall gestart.

## Gerichte vervolgfix

De branch `release/preview-approval-version-identity-fix` vanaf `cd3c87fb3bf9aaa9530216dc841b1ff5486caf38` herstelt uitsluitend dit responsecontract. Zie `docs/PREVIEW_APPROVAL_VERSION_IDENTITY_FIX.md` voor het contract- en testbewijs.

## Acceptatiestatus

| Onderdeel | Status |
| --- | --- |
| Canonical finance | PASS 19/19 |
| Preview identity lokaal | PASS 14/14 |
| Stagingrelease | PASS, `3169b504a9d9ef57b93e4a475c499b474e825ae1` ready |
| Customer A live approval | PASS 1/1 |
| Approval/trust-event | PASS 1/1 en 1/1, identity en actor gelijk |
| Refresh, sessieherstel, retry en dubbelklik | PASS 4/4 |
| Customer B live approval | PASS 1/1 |
| Customer B sessieherstel | PASS 1/1 |
| Cross-customer isolatie | PASS 4/4; directe A-preview-ID veilig geweigerd voor B |
| Adminlogin en klantenoverzicht | PASS; A en B afzonderlijk zichtbaar met juiste testidentiteit en actieve portalstatus |
| Admin approvalconsistentie | PASS via database/readmodel; preview-ID, versienummer, checksum en actor gelijk |
| Customer A passwordrotatie | ja, server-side; geen waarde opgeslagen of getoond |
| Productie | niet gewijzigd |

Er is geen migratie toegepast, geen stagingdatabase-schema gewijzigd, geen e-mail of magic link verstuurd en geen betaling of providercall gestart. Customer A en B hebben ieder één eigen previewrecord zonder ID-overlap, exact één actieve approval en exact één bijbehorend trust-event. Customer B kon uitsluitend de eigen klant-, project-, preview- en offertedata zien. De directe poging om de preview-ID van Customer A te openen werd veilig geweigerd.

De adminlogin is interactief bevestigd. Het klantenoverzicht toont beide CP-A-testklanten afzonderlijk en met de juiste testidentiteit. De generieke CRM-projectwerkruimte gebruikt een oudere databron en toont de CP-A-fixtureprojecten niet; dat is geen fout in de CP-A approval- of trust-eventketen en verandert de rechtstreeks bevestigde readmodelconsistentie niet.

PASS_CP_A_STAGING_ACCEPTANCE_READY_FOR_PRODUCTION_RELEASE_REVIEW
