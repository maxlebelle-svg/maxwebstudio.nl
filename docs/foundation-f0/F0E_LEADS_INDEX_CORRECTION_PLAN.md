# Foundation F0-e — Leads Index Correction Plan

Status: **PLAN ONLY / NO SQL**

Target blijft de niet-unieke partiële index `leads_normalized_domain_idx`. `leads_unique_normalized_domain_idx` is niet de authoritative target state.

Een toekomstige append-only reconciliationmigration mag pas worden ontworpen nadat een read-only datapreflight bewijst hoeveel dubbele niet-lege `normalized_domain`-waarden bestaan en catalog evidence de exacte huidige indexdefinities bevestigt. Daarna moet de migration de ongewenste unieke index alleen onder expliciete preconditions verwijderen en de volledige verwachte niet-unieke definitie verifiëren. Bij onverwachte definitie, duplicates, ontbrekende lineage of lockrisico stopt de uitvoering.

Er is in F0-e geen correctie-SQL geschreven, geen index gewijzigd en geen migration identity gereserveerd.
