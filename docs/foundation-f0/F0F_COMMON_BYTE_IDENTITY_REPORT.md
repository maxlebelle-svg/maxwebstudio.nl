# Foundation F0-f — Common Byte Identity Report

Status: **PASS**

PoC-fixture:

- filename: `20260721000100_dual_root_poc_marker.sql`;
- size: 209 bytes;
- SHA-256: `411baf7efc80678960336ab1d73eadbe921ad08dd901cd937560fddb5cf9f9b5`;
- canonical, bootstrapoutput en existingoutput: volledige bytes gelijk.

De validator controleert versie, naam, grootte, SHA-256, bytes, aanwezigheid, extra commonfiles, duplicate versions, pre-cutover versions, symlinks en verborgen/tempfiles.

Een opzettelijke tijdelijke drift werd hard geblokkeerd met exitstatus 1. De Supabase CLI zelf meldde bij dezelfde reeds toegepaste versie echter “up to date” en detecteerde de gewijzigde statements niet. Dit bewijst dat de externe validator een verplichte pre-run gate is. Daarna werd de fixture uit de canonieke bytes hersteld en valideerde het manifest opnieuw groen.
