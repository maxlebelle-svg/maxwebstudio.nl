# F0-d — Missing Lineage Recovery Plan

Doelbestanden: `20260720160000_lead_event_foundation.sql` en `20260720200000_transactional_lead_intake_rpc.sql`.

## Zoekvolgorde

1. reeds beschikbare originele Git-branches/reflogs in deze clone;
2. andere geautoriseerde lokale clone;
3. oorspronkelijke Codex-werkmap of worktree;
4. CI build-/deploymentartifact;
5. deploymentbundle;
6. geautoriseerde database-/filesystembackup;
7. auditlog dat aantoonbaar volledige bytes plus cryptografische checksum bevat.

F0-d heeft alleen de huidige lokale refs onderzocht; buiten deze bronnen is niet gezocht.

## Bewijsvereisten

Een bestand geldt pas als origineel hersteld wanneer bron/provenance, exacte bestandsnaam, volledige bytes, bestandsgrootte, SHA-256, verkrijgingstijd, chain of custody en vergelijking met een onafhankelijke artifact/historyreferentie zijn vastgelegd. Objectnamen, signatures, runtime-definities of semantisch equivalente nieuwe SQL zijn onvoldoende.

Bij meerdere kandidaten moeten alle hashes gelijk zijn of het verschil formeel worden onderzocht. Een hersteld bestand wordt eerst read-only gearchiveerd en lokaal in een disposable historische rebuild getest; remote history wordt niet gerepareerd.

## Als bytes definitief ontbreken

De officiële historische lineage blijft permanent `incomplete/unverifiable`. Er wordt nooit nieuwe SQL onder dezelfde historische identiteit gemaakt. Bootstrap kan alleen als nieuwe, expliciete genesislijn worden goedgekeurd; bestaande omgevingen behouden hun feitelijke remote history, en het cutovermanifest vermeldt de blijvende bewijsleemte. Het cutoverpoint blijft geblokkeerd totdat governance dit risico expliciet accepteert.
