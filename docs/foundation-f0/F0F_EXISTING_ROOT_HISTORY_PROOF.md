# Foundation F0-f — Existing Root History Proof

Status: **PASS FOR MIGRATION DISCOVERY/HISTORY POC**

Een afzonderlijke lokale catalogfixture bevatte een minimale `public.leads`-vorm die de echte, ongewijzigde migration `20260710160200_central_lead_lifecycle_deduplication.sql` kan verwerken. De CLI voerde die werkelijke bytes uit en registreerde één genuine historical row met 21 statements. Er zijn geen historymarkers gesynthetiseerd.

Na toevoeging van dezelfde common fixture:

- de historische row bleef byte-/veldmatig aanwezig;
- alleen `20260721000100` werd toegevoegd met 3 statements;
- baselinehistoryrows: 0;
- markerrecords: 1;
- tweede run was clean en history bleef twee rows.

De CLI-labeltekst zei voor deze expliciete `--db-url` “remote database”, maar de database rapporteerde `inet_server_addr() = 127.0.0.1/32`; er was geen remote host, link, token of authenticatie. Dit scenario bewijst discovery/historygedrag, niet volledige runtime-schema-equivalentie.
