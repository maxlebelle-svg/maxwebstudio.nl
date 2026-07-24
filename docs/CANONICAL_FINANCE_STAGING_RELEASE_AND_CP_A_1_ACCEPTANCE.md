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
| Customer A live approval | wacht op stagingrelease |
| Customer B en isolatie | wacht op groene Customer A-approval |
| Adminconsistentie | wacht op groene Customer A-approval |
| Customer A passwordrotatie | wacht tot browseracceptatie is afgerond |
| Productie | niet gewijzigd |

Dit document wordt na de stagingdeploy en browseracceptatie bijgewerkt met de definitieve release-SHA en live resultaten.

BLOCKED_CP_A_STAGING_ACCEPTANCE
