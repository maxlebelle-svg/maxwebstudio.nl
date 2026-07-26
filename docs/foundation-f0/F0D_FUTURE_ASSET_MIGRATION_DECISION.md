# F0-d — Future Asset Migration Decision

Status: **RELEASE_BLOCKED / NOT COMMON IN CURRENT IDENTITY**

`20260719120000_media_asset_foundation` en `20260719150000_asset_ingest_operation_foundation` liggen chronologisch vóór de remote historyversies `20260720160000` en `20260720200000`. Zij zijn niet remote toegepast en kunnen daarom niet veilig als post-cutover common migrations worden behandeld of alsnog in een bestaande remote history worden ingevoegd.

Beide blijven `future_not_deployed`, buiten de bootstrapbaseline en buiten de bestaande-environment reconciliation. Zij vertrouwen expliciet op rol `postgres`; de ingestmigration gebruikt ook `extensions.digest` en is afhankelijk van `media_assets`. Security is service-role-only met expliciete revokes/grants en RLS, maar moet opnieuw worden gecontroleerd tegen het F0-d-contract en het lokale platformprofiel.

Aanbevolen positie: na inhoudelijke releasegoedkeuring opnieuw authoren als nieuwe append-only common migrations met versies vanaf het goedgekeurde cutoverpoint. De huidige bestanden worden niet hernummerd of gewijzigd; hun checksums blijven historisch lokaal bewijs. Eerst moeten beide in volgorde slagen op bestaande-runtime- en bootstrapfingerprints met de compatibiliteitsrollen.
