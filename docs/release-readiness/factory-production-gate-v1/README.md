# Factory Production Gate v1

Status: lokaal gehardend en functioneel getest; niet gemigreerd, niet gedeployed en niet geactiveerd.

## Doel

Deze kandidaat maakt Factory-livegang fail-closed. Een percentage is uitsluitend informatief. De database weigert iedere directe overgang naar `live`; alleen de beveiligde autorisatiefunctie kan die overgang uitvoeren na een verse server-side preflight.

## Bewijsmodel

- `factory_gate_checks` bewaart uitsluitend append-only resultaten van benoemde server-side leveranciers.
- De openbare adminactie `report_check` is verwijderd en wordt expliciet geweigerd.
- Callers kunnen geen status, bron, fingerprint, bewijs of vervaldatum kiezen.
- Iedere preflight voert alle leveranciers opnieuw uit en schrijft een nieuwe append-only meetreeks.
- `not_configured`, `missing`, `failed` en `expired` blijven blokkerend.
- `factory_gate_events` is append-only voor controles, preflights, blokkades, uitzonderingen en liveautorisaties.
- `factory_gate_overrides` vereist een actieve superadmin en verandert nooit een controle in PASS.
- `factory_customer_approvals` is een canonieke, onveranderlijke klantgoedkeuring die alleen de aan het dossier gekoppelde klant kan vastleggen.

## Vijftien Food-controles

| Controle | Vertrouwde leverancier | Lokaal mogelijke uitkomst |
| --- | --- | --- |
| Restauranttenant | Food Demo Bundle RPC | PASS wanneer de bevroren, dossiergebonden demobundle bestaat |
| Menu en openingstijden | Food runtime catalog | NOT_CONFIGURED tot een canonieke runtimecatalogus bestaat |
| Manageraccount en tenantisolatie | Food access context | MISSING zolang `selfServiceAccountProven` niet door de runtime is bewezen |
| Bestelroute | Food Demo Bundle RPC | PASS na server-gecontroleerde bereikbaarheid |
| Dashboardweergave | Food Demo Bundle RPC | PASS na server-gecontroleerde bereikbaarheid |
| Mobiele controle | Allowlisted storefrontprobe | PASS na geldige HTTPS-respons en mobiele viewport |
| Domeinkoppeling | Domein Center | NOT_CONFIGURED/MISSING zonder canoniek klantrecord |
| DNS | Domein Center | NOT_CONFIGURED/MISSING zonder geverifieerd bronrecord |
| SSL | Domein Center | NOT_CONFIGURED/MISSING zonder actief bronrecord |
| Zakelijke e-mail | Domein Center | NOT_CONFIGURED/MISSING zonder expliciet behoudbewijs |
| Mollie | Commerce | NOT_CONFIGURED tot Factory-gebonden providerbewijs bestaat |
| Juridische set | Juridisch register | NOT_CONFIGURED tot Factory-gebonden productieregistratie bestaat |
| Interne goedkeuring | Superadminattestatie | MISSING tot een onveranderlijke attestatie bestaat |
| Klantgoedkeuring | Factory customer approval registry | MISSING tot de gekoppelde klant canoniek heeft goedgekeurd |
| Omgevingsmodus | Factory-context + Food Demo Bundle | PASS voor aantoonbare bevroren demomodus |

## Lokale databasecertificering

`scripts/factory-production-gate-local-validation.zsh` start een tijdelijke, Unix-socket-only PostgreSQL-cluster en bewijst zowel de RPC-laag als directe SQL-pogingen. De fixture dekt directe liveblokkade, ontbrekend en verlopen bewijs, wijziging na preflight, admin/developer/superadminrollen, uitzonderingen, append-only bewijs/audit, tenantgrenzen en caller-supplied bewijs.

## Stagingbranchpoort

De beoogde releasebranch is `codex/factory-hub-staging-certification`. `scripts/factory-production-gate-branch-preflight.mjs` faalt zolang de daadwerkelijk waargenomen Netlify-branch daar niet exact mee overeenkomt. Deze lokale release wijzigt de Netlify-configuratie niet.

## Grenzen

Silverado blijft uitsluitend de bevroren pilotreferentie. Deze kandidaat wijzigt geen Silverado-tenant, account, data, code, deployment of configuratie. De SQL blijft buiten de algemene migratiemap totdat de autoritatieve stagingroot haar als enige pending kandidaat classificeert. Productie vereist altijd een afzonderlijke release.
