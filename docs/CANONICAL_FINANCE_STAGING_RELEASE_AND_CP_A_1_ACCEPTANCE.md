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
| Customer B en isolatie | eerdere live 4/4 blijft geldig; post-approval UI-login niet opnieuw uitgevoerd |
| Adminconsistentie | database/readmodel PASS; post-approval admin-UI-login niet opnieuw uitgevoerd |
| Customer A passwordrotatie | ja, server-side; geen waarde opgeslagen of getoond |
| Productie | niet gewijzigd |

Er is geen migratie toegepast, geen stagingdatabase-schema gewijzigd, geen e-mail of magic link verstuurd en geen betaling of providercall gestart. Customer A en B hebben ieder één eigen previewrecord zonder ID-overlap; alleen A heeft de nieuwe actieve approval.

De release en kernacceptatie zijn groen. De afsluitstatus blijft geblokkeerd totdat de eigenaar met de reeds buiten de repository bewaarde Customer B- en admincredentials de twee expliciet gevraagde post-approval UI-logins beschikbaar maakt. Accounts of wachtwoorden voor B/admin zijn niet gewijzigd om die controle te forceren.

BLOCKED_CP_A_STAGING_ACCEPTANCE
