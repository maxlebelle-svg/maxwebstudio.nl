# F0-d — Existing Environment Reconciliation Plan

Geen van onderstaande categorieën is in F0-d als SQL geïmplementeerd.

| Categorie | Runtime | Target | Preflight | Compatibiliteit/rollback | Afzonderlijk |
|---|---|---|---|---|---|
| Definer search paths | 9 onveilig | vaste pg_catalog search path | function bodies/signatures en tenantcalls vergelijken | ALTER terug naar bewezen config; functionele RLS-tests | ja, security-1 |
| Function ACL | 14 PUBLIC EXECUTE | nul uitzonderingen | werkelijke callers/rollen inventariseren | grants per signature herstellen | ja, security-2 |
| Policyrollen | 69 PUBLIC, waarvan 63 in baseline scope | expliciet authenticated/service roles | USING/WITH CHECK semantiek en APIrollen testen | oude rolset per policy herstellen | ja, security-3 |
| Tabelgrants | authenticated 23, service_role 32 | least privilege 19/28 | endpoint-to-privilege matrix | expliciete grants herstellen | ja, security-4 |
| Fileconstraint | NOT VALID, lege runtime-evidence | validated | aantallen null/dual relationships en locks | constraint validatie niet eenvoudig terugrollen; eventueel opnieuw NOT VALID | ja, data-integriteit |
| Storage bucket | private 8 MiB, bewezen MIME-set | gelijk | metadata exact vergelijken; geen objectread | configuratievelden terugzetten | apart Storage |
| Preview portal state | runtime mist zes constraints/acht indexen | baseline target state | volledige kolom- en dependencycheck | append-only drops/adds per object | apart schema |
| Leads unique domain | runtime heeft alleen non-unique index | geen unieke domeindwang | duplicaten en businessbetekenis onderzoeken | exact-definition indexherstel | apart deduplicatie |
| Missing functions | drie bodies alleen remote | betrouwbaar origineel vereist | bytes/checksum/source | geen wijziging zonder origineel | lineage, geen reconciliation |
| Excluded legacy/uncertain | vier tabellen en twee functies buiten baseline | expliciet productbesluit | code/runtimeafhankelijkheid | per object | niet combineren |

Security, schema, data-integriteit, Storage en lineage worden nooit samengevoegd in één mega-migration. Iedere latere migration vereist eigen preflight, impactanalyse, compensatie en stagingbewijs.
