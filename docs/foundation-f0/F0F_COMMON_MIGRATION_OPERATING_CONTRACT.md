# Foundation F0-f — Common Migration Operating Contract

Status: **PROPOSED / NOT YET RELEASED**

Iedere toekomstige common migration:

1. heeft één immutable source in `supabase-common/migrations/`;
2. wordt deterministisch en zonder stille overschrijving gematerialiseerd;
3. heeft in beide execution views identieke naam, versie, grootte, SHA-256 en bytes;
4. krijgt een checksummanifest en mag na toepassing nooit wijzigen;
5. doorloopt bootstraprebuild, existing-line compatibility, security-invariant en schemafingerprinttests;
6. gebruikt expliciete rootmodus; nooit rootwissel tijdens een run;
7. verbiedt history repair en synthetische markers;
8. vereist stagingvalidatie vóór productie;
9. documenteert rollback of een expliciete compensatiestrategie;
10. wordt door CI geblokkeerd bij drift, ontbrekende kopie, pre-cutoverversie, duplicate versie, symlink of hidden tempfile.

De current historical source en bootstrapbaseline blijven immutable. Productmaterialisatie vereist nog een afzonderlijk ontwerp- en implementatiebesluit.
