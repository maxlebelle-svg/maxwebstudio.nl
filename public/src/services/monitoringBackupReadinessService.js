const MONITORING_EVENTS = Object.freeze([
  { event: "application_error", severity: "high", owner: "developer", action: "Issue vastleggen, impact beoordelen en fixpad bepalen." },
  { event: "write_failure", severity: "high", owner: "developer", action: "Write gate/resultaat controleren en fallbackstatus vastleggen." },
  { event: "rls_denied", severity: "critical", owner: "release_approver", action: "Customer isolation controleren en productie NO-GO houden." },
  { event: "fallback_activated", severity: "medium", owner: "support", action: "Gebruiker informeren indien nodig en bronstatus controleren." },
  { event: "release_failure", severity: "critical", owner: "production_operator", action: "Release stoppen, rollback readiness openen en evidence vastleggen." },
  { event: "storage_failure", severity: "high", owner: "support", action: "Bestandsactie blokkeren en signed URL/storage policy controleren." },
  { event: "ai_failure", severity: "medium", owner: "developer", action: "AI-output blokkeren, fallback tonen en geen automatische actie uitvoeren." },
]);

const ALERTING_RULES = Object.freeze([
  {
    condition: "customer isolation failure",
    severity: "critical",
    notify: ["release_approver", "production_operator"],
    automaticNoGo: true,
  },
  {
    condition: "RLS/security denial regression",
    severity: "critical",
    notify: ["developer", "release_approver"],
    automaticNoGo: true,
  },
  {
    condition: "production write failure",
    severity: "high",
    notify: ["developer", "support"],
    automaticNoGo: true,
  },
  {
    condition: "backup/restore evidence missing",
    severity: "high",
    notify: ["admin", "release_approver"],
    automaticNoGo: true,
  },
  {
    condition: "AI provider failure",
    severity: "medium",
    notify: ["developer"],
    automaticNoGo: false,
  },
]);

const BACKUP_STRATEGY = Object.freeze([
  {
    target: "Supabase database",
    frequency: "daily after production launch",
    retention: "30 days minimum",
    restoreTest: "monthly and before major schema release",
  },
  {
    target: "Supabase Storage",
    frequency: "daily after production launch",
    retention: "30 days minimum",
    restoreTest: "monthly sample restore",
  },
  {
    target: "config/evidence",
    frequency: "per release",
    retention: "git history + release archive",
    restoreTest: "checklist review per release",
  },
  {
    target: "local/demo export",
    frequency: "before migration/write sprint",
    retention: "manual archive",
    restoreTest: "import smoke test before production migration",
  },
]);

const RESTORE_PROCEDURES = Object.freeze([
  {
    scope: "staging_restore",
    steps: [
      "stop test execution",
      "record failing step",
      "restore/reset staging database or storage sample",
      "rerun customer isolation checks",
      "update TEST_RESULTS and release blockers",
    ],
  },
  {
    scope: "production_restore",
    steps: [
      "freeze new deployments",
      "confirm rollback approval",
      "restore database/storage from verified backup",
      "verify customer isolation and critical flows",
      "record incident and post-restore evidence",
    ],
  },
]);

const MAX_AI_MONITORING_EXPLANATIONS = Object.freeze([
  ["Storing uitleggen", "Max mag uitleggen dat een actie tijdelijk niet beschikbaar is en welke veilige route volgt."],
  ["Rollback uitleggen", "Max mag uitleggen dat herstel menselijke goedkeuring vereist."],
  ["Backupstatus uitleggen", "Max mag vertellen of bewijs ontbreekt, maar geen restore starten."],
  ["AI-fout uitleggen", "Max mag een fallback tonen en nooit namens zichzelf opnieuw risicovolle acties uitvoeren."],
]);

export function getMonitoringBackupReadiness() {
  const criticalRules = ALERTING_RULES.filter((rule) => rule.automaticNoGo);
  return {
    status: "FOUNDATION_READY",
    sprint: "3D",
    monitoringProvider: "not_connected",
    externalAlerts: "not_connected",
    productionMonitoring: "blocked",
    backupAutomation: "not_built",
    restoreAutomation: "not_built",
    events: [...MONITORING_EVENTS],
    alertingRules: [...ALERTING_RULES],
    backupStrategy: [...BACKUP_STRATEGY],
    restoreProcedures: [...RESTORE_PROCEDURES],
    maxAiExplanations: [...MAX_AI_MONITORING_EXPLANATIONS],
    automaticNoGoRules: criticalRules.map((rule) => rule.condition),
    blockers: [
      "Geen externe monitoringdienst gekoppeld.",
      "Backup/restore evidence nog niet production-ready.",
      "Storage restore nog niet getest.",
      "Production alert routing nog niet ingericht.",
      "Max AI mag nog geen herstelacties uitvoeren.",
    ],
  };
}

export function getMonitoringEvents() {
  return [...MONITORING_EVENTS];
}

export function getBackupStrategy() {
  return [...BACKUP_STRATEGY];
}

export function getRestoreProcedures() {
  return [...RESTORE_PROCEDURES];
}
