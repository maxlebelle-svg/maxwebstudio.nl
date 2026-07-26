# Foundation F0-f — Common Migration Source of Truth

Status: **DESIGN CHOSEN / NO PRODUCT COMMON MIGRATION**

Gekozen strategie: één canonieke directory `supabase-common/migrations/`, met gecontroleerde materialisatie naar bootstrap- en existing execution roots. Handmatige kopieën zijn afgewezen wegens drift. De historische root als canonieke commonbron is afgewezen omdat baseline/historische bytes en common ownership dan vermengen. Een volledig build-only model is niet gekozen omdat de persistent baseline auditbaarder is.

Contract voor toekomstige materialisatie:

1. canonieke file eerst valideren: naam, unieke versie, versie vanaf cutover, normaal bestand, geen symlink/tempfile;
2. doel mag niet bestaan tenzij de bytes al exact gelijk zijn; geen stille overschrijving;
3. bestandsgrootte, SHA-256 en volledige bytes moeten in beide outputs gelijk zijn;
4. manifest registreert source, twee outputs, grootte en SHA-256;
5. validator blokkeert ontbrekende, extra of afwijkende commonfiles.

F0-f bevat geen materialisatierunner voor productgebruik en `supabase-common/migrations/` bevat geen SQL. De PoC-fixture bestond alleen in een disposable canonieke map.
