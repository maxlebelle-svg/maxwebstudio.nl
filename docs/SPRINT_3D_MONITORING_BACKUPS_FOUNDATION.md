# Sprint 3D - Monitoring & Backups Foundation

Status: `FOUNDATION READY / GEEN EXTERNE MONITORING / GEEN PRODUCTIE`

Datum: 2026-06-30

## Doel

Sprint 3D legt de monitoring-, alerting-, backup- en restorebasis vast voordat Max Webstudio richting Max AI Experience en productie-openstelling gaat.

Deze fase koppelt geen externe monitoringdienst en voert geen backups of restores uit. De output is een model, readiness-service en Developer Mode-status.

## Monitoringmodel

| Event | Ernst | Eigenaar | Actie |
| --- | --- | --- | --- |
| application_error | high | developer | issue vastleggen, impact beoordelen, fixpad bepalen |
| write_failure | high | developer | write gate/resultaat controleren en fallbackstatus vastleggen |
| rls_denied | critical | release approver | customer isolation controleren en productie NO-GO houden |
| fallback_activated | medium | support | gebruiker informeren indien nodig en bronstatus controleren |
| release_failure | critical | production operator | release stoppen, rollback readiness openen en evidence vastleggen |
| storage_failure | high | support | bestandsactie blokkeren en signed URL/storage policy controleren |
| ai_failure | medium | developer | AI-output blokkeren, fallback tonen en geen automatische actie uitvoeren |

## Alertingstrategie

Productie blijft automatisch `NO-GO` bij:

- customer isolation failure;
- RLS/security denial regressie;
- production write failure;
- ontbrekende backup/restore evidence.

Alerting MVP:

- Developer Mode toont readiness, blockers en GO/NO-GO context.
- Release evidence registreert failures.
- Externe monitoring komt pas in een aparte implementatiefase.

Later:

- externe error monitoring;
- uptime checks;
- alert routing naar support/developer/release approver;
- AI adapter failure alerts.

## Backupstrategie

| Doel | Frequentie | Retentie | Restore-test |
| --- | --- | --- | --- |
| Supabase database | dagelijks na production launch | minimaal 30 dagen | maandelijks en voor grote schema-release |
| Supabase Storage | dagelijks na production launch | minimaal 30 dagen | maandelijkse sample restore |
| config/evidence | per release | git history + release archive | checklist review per release |
| local/demo export | voor migratie/write sprint | handmatig archief | import smoke test voor productie-migratie |

## Restoreprocedure

### Staging restore

1. Stop test execution.
2. Leg de failing stap vast.
3. Restore/reset staging database of storage sample.
4. Herhaal customer isolation checks.
5. Werk `TEST_RESULTS` en blockers bij.

### Production restore

1. Freeze nieuwe deployments.
2. Bevestig rollback approval.
3. Restore database/storage vanuit verified backup.
4. Controleer customer isolation en kritieke flows.
5. Leg incident en post-restore evidence vast.

## Relatie Met Rollback

Rollback is het besluit en proces om terug te gaan.

Restore is de technische herstelactie op database/storage/config.

Een productie-restore mag alleen na rollback approval of expliciet incidentbesluit.

## Developer Mode

Toegevoegd:

- `public/src/services/monitoringBackupReadinessService.js`
- Developer Mode-kaart `Monitoring & Backups Foundation`

Developer Mode toont:

- monitoringstatus;
- aantal events;
- automatische NO-GO regels;
- backup targets;
- restoreprocedures;
- open blockers.

## Max AI Uitlegregels

Max AI mag later:

- uitleggen waarom iets tijdelijk niet beschikbaar is;
- uitleggen waarom productie NO-GO blijft;
- uitleggen welke veilige vervolgstap nodig is;
- een supportbericht of incident-samenvatting voorbereiden.

Max AI mag nooit zelfstandig:

- rollback starten;
- restore uitvoeren;
- monitoringregels wijzigen;
- productie-alerts uitschakelen;
- incidenten sluiten zonder menselijke review.

## Bewust Niet Gedaan

- Geen externe monitoringdienst gekoppeld.
- Geen productie gewijzigd.
- Geen SQL uitgevoerd.
- Geen backup of restore uitgevoerd.
- Geen nieuwe writes toegevoegd.
- Geen OpenAI/Mollie/Resend gekoppeld.
- Geen Storage-implementatie gebouwd.

## Volgende Stap

Aanbevolen vervolg:

1. Sprint 3 Review uitvoeren.
2. Vaststellen of Trust Infrastructure voldoende is voor Max AI Experience.
3. Production write-mode blijft dicht tot aparte release approval.
