# Foundation F0-d — Design Review Report

Status: **BOOTSTRAP DESIGN COMPLETE / IMPLEMENTATION APPROVAL REQUIRED**

Exact één bootstrapmodel is aanbevolen: model C, met een aparte bootstrapdirectory/configuratie, één echte bootstraprecord en een common lijn vanaf kandidaat `20260721000000`. Cutoverstatus is `blocked` door de twee ontbrekende originele migrations, de volledige kolom-evidencegate, de unieke leadindex, CLI-historyproof en het nog niet geïmplementeerde Supabase-compatibiliteitsprofiel.

De 11 lokaal bewezen historische migrationchecksums en baselinechecksum `6c8b9a8137850edadb6fe976938d44e16a5eecadc740481a65423bf72251ff11` zijn behouden. Geen historische version marker, repair of reconciliation-SQL is gemaakt.

Voor bestaande omgevingen zijn security, grants, policies, filevalidatie, Storage, preview-schema en deduplicatie als afzonderlijke reconciliationcategorieën ontworpen. `leads_unique_normalized_domain_idx` is expliciet niet-authoritative; de non-unique index blijft target. De kolomvergelijking heeft definitieve status `blocked_missing_evidence`, omdat runtime datatype/default/nullability/generation/collation niet volledig lokaal is opgeslagen.

Het lokale compatibilityprofiel voegt in een volgende fase minimaal een NOLOGIN-ownerrol `postgres`, APIrollen, lege auth/storage placeholders en extensions.pgcrypto toe. De twee bestaande assetmigraties blijven release-blocked vanwege oude versies en worden niet hernummerd.

Er is uitsluitend lokale documentatie en statische analyse uitgevoerd. De mislukte lokale Supabase CLI-helpinspectie wijzigde geen repositorybestand en leverde geen migration/historyactie op. Geen remote query/write, SQL-wijziging, commit, push of deploy is uitgevoerd.
