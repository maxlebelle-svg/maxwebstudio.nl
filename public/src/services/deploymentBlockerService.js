import { STORAGE_KEYS } from "../config/storageKeys.js";

export const DEPLOYMENT_BLOCKER_STATUSES = Object.freeze({
  PENDING: "pending",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  NOT_APPLICABLE: "not_applicable",
});

export const DEPLOYMENT_BLOCKER_EVIDENCE_SCHEMA = Object.freeze({
  backup_confirmed: [
    "backupName",
    "backupDate",
    "backupLocation",
    "verifiedBy",
    "notes",
  ],
  rls_review_approved: [
    "reviewer",
    "reviewDate",
    "reviewedDocs",
    "findings",
    "approvalNotes",
  ],
  rls_test_log_completed: [
    "testLogReference",
    "testDate",
    "passCount",
    "failCount",
    "blockedCount",
    "summary",
  ],
  auth_test_completed: [
    "testDate",
    "rolesTested",
    "loginFlowResult",
    "profileMappingResult",
    "issues",
  ],
  customer_isolation_test_completed: [
    "testDate",
    "customerAScenario",
    "customerBScenario",
    "demoScenario",
    "anonymousScenario",
    "resultSummary",
  ],
  rollback_plan_approved: [
    "approver",
    "approvalDate",
    "rollbackPlanVersion",
    "rollbackNotes",
  ],
  legacy_customer_tables_mitigated: [
    "mitigationDecision",
    "reviewedFiles",
    "riskAcceptedBy",
    "mitigationNotes",
  ],
  env_vars_verified: [
    "environmentName",
    "verifiedBy",
    "verificationDate",
    "checkedVariables",
    "missingVariables",
    "notes",
  ],
});

export const DEPLOYMENT_BLOCKER_DEFINITIONS = Object.freeze([
  {
    id: "backup_confirmed",
    title: "Backup bevestigd",
    description: "Bewijs dat er een pre-deployment backup is gemaakt.",
    requiredEvidence: "Backup bestandsnaam, datum en locatie/notitie.",
    approver: "Eigenaar of technisch verantwoordelijke.",
  },
  {
    id: "rls_review_approved",
    title: "RLS review goedgekeurd",
    description: "De RLS draft is inhoudelijk gereviewd voordat deze in test of productie wordt uitgevoerd.",
    requiredEvidence: "Reviewer, datum en opmerkingen.",
    approver: "Technisch verantwoordelijke.",
  },
  {
    id: "rls_test_log_completed",
    title: "RLS/Supabase testlog ingevuld",
    description: "De RLS dry-run is uitgevoerd in een testproject en gelogd.",
    requiredEvidence: "Verwijzing naar ingevuld testlog en pass/fail samenvatting.",
    approver: "Tester plus eigenaar.",
  },
  {
    id: "auth_test_completed",
    title: "Auth testresultaat aanwezig",
    description: "Login, profiles, role mapping en route guards zijn getest.",
    requiredEvidence: "Testdatum, rollen getest en bekende issues.",
    approver: "Technisch verantwoordelijke.",
  },
  {
    id: "customer_isolation_test_completed",
    title: "Klantisolatie getest",
    description: "Customer A/B, demo-user en anonymous isolatie zijn bewezen.",
    requiredEvidence: "Testdatum en scenarioresultaat.",
    approver: "Eigenaar of technisch verantwoordelijke.",
  },
  {
    id: "rollback_plan_approved",
    title: "Rollbackplan goedgekeurd",
    description: "Rollbackprocedure is expliciet gelezen en goedgekeurd.",
    requiredEvidence: "Approved by, datum en opmerkingen.",
    approver: "Eigenaar.",
  },
  {
    id: "legacy_customer_tables_mitigated",
    title: "Legacy customer_* risico afgehandeld",
    description: "Legacy customer_* live-flow risico is gecontroleerd en gemitigeerd.",
    requiredEvidence: "Verwijzing naar legacy mapping/consolidated plan en gekozen mitigatie.",
    approver: "Technisch verantwoordelijke.",
  },
  {
    id: "env_vars_verified",
    title: "Environment variables gecontroleerd",
    description: "Productie environment variables zijn gecontroleerd zonder secrets vast te leggen.",
    requiredEvidence: "Checklist zonder waarden, datum en omgeving.",
    approver: "Eigenaar of technisch verantwoordelijke.",
  },
]);

function nowIso() {
  return new Date().toISOString();
}

function readJson(key, fallback = null) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function sanitizeStatus(status = "") {
  return Object.values(DEPLOYMENT_BLOCKER_STATUSES).includes(status)
    ? status
    : DEPLOYMENT_BLOCKER_STATUSES.PENDING;
}

function sanitizeText(value = "") {
  return String(value || "").trim().slice(0, 2000);
}

function sanitizeEvidenceDetails(blockerId, details = {}) {
  const schema = DEPLOYMENT_BLOCKER_EVIDENCE_SCHEMA[blockerId] || [];
  return schema.reduce((clean, field) => {
    clean[field] = sanitizeText(details?.[field]);
    return clean;
  }, {});
}

function missingEvidenceFields(blockerId, details = {}) {
  return (DEPLOYMENT_BLOCKER_EVIDENCE_SCHEMA[blockerId] || []).filter((field) => !sanitizeText(details[field]));
}

function storedBlockersById() {
  const stored = readJson(STORAGE_KEYS.deploymentBlockers, {});
  if (Array.isArray(stored)) {
    return Object.fromEntries(stored.map((item) => [item.id, item]));
  }
  return stored && typeof stored === "object" ? stored : {};
}

function normalizeHistory(history = []) {
  return Array.isArray(history)
    ? history.slice(-50).map((entry) => ({
      fromStatus: sanitizeStatus(entry.fromStatus),
      toStatus: sanitizeStatus(entry.toStatus),
      by: sanitizeText(entry.by),
      at: entry.at || "",
      reason: sanitizeText(entry.reason),
      evidenceSnapshot: entry.evidenceSnapshot && typeof entry.evidenceSnapshot === "object" ? entry.evidenceSnapshot : {},
    }))
    : [];
}

function normalizeBlocker(definition, stored = {}) {
  const status = sanitizeStatus(stored.status);
  const evidenceDetails = sanitizeEvidenceDetails(definition.id, stored.evidenceDetails || stored.details || {});
  const createdAt = stored.createdAt || nowIso();
  const missingEvidence = missingEvidenceFields(definition.id, evidenceDetails);
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    requiredEvidence: definition.requiredEvidence,
    evidenceFields: [...(DEPLOYMENT_BLOCKER_EVIDENCE_SCHEMA[definition.id] || [])],
    approver: definition.approver,
    status,
    evidence: sanitizeText(stored.evidence),
    evidenceDetails,
    missingEvidence,
    hasRequiredEvidence: missingEvidence.length === 0,
    approvedBy: sanitizeText(stored.approvedBy),
    approvedAt: stored.approvedAt || "",
    createdAt,
    updatedAt: stored.updatedAt || createdAt,
    statusChangedAt: stored.statusChangedAt || "",
    statusChangedBy: sanitizeText(stored.statusChangedBy),
    evidenceUpdatedAt: stored.evidenceUpdatedAt || "",
    evidenceUpdatedBy: sanitizeText(stored.evidenceUpdatedBy),
    notes: sanitizeText(stored.notes),
    reason: sanitizeText(stored.reason),
    approvalHistory: normalizeHistory(stored.approvalHistory),
  };
}

function persistBlocker(blocker) {
  const stored = storedBlockersById();
  stored[blocker.id] = blocker;
  writeJson(STORAGE_KEYS.deploymentBlockers, stored);
  return blocker;
}

function getDefinition(blockerId) {
  const definition = DEPLOYMENT_BLOCKER_DEFINITIONS.find((item) => item.id === blockerId);
  if (!definition) throw new Error(`Onbekende deployment blocker: ${blockerId}`);
  return definition;
}

function validateStatusChange(current, nextStatus, payload = {}) {
  const missing = missingEvidenceFields(current.id, payload.evidenceDetails || current.evidenceDetails);
  const reason = sanitizeText(payload.reason || payload.notes || current.reason);
  const actor = sanitizeText(payload.by || payload.approvedBy || payload.statusChangedBy);
  if (nextStatus === DEPLOYMENT_BLOCKER_STATUSES.APPROVED && missing.length) {
    throw new Error(`Approve geblokkeerd. Ontbrekende evidence: ${missing.join(", ")}.`);
  }
  if (nextStatus === DEPLOYMENT_BLOCKER_STATUSES.APPROVED && !actor) {
    throw new Error("Approve vereist een reviewer/approver.");
  }
  if ([DEPLOYMENT_BLOCKER_STATUSES.REJECTED, DEPLOYMENT_BLOCKER_STATUSES.NOT_APPLICABLE].includes(nextStatus) && !reason) {
    throw new Error(`${nextStatus} vereist een reden of notitie.`);
  }
}

export function getDeploymentBlockers() {
  const stored = storedBlockersById();
  return DEPLOYMENT_BLOCKER_DEFINITIONS.map((definition) => normalizeBlocker(definition, stored[definition.id]));
}

export function getBlockerStatus(blockerId) {
  const blocker = getDeploymentBlockers().find((item) => item.id === blockerId);
  return blocker?.status || DEPLOYMENT_BLOCKER_STATUSES.PENDING;
}

export function getBlockerEvidenceSchema(blockerId) {
  return [...(DEPLOYMENT_BLOCKER_EVIDENCE_SCHEMA[blockerId] || [])];
}

export function validateBlockerEvidence(blockerId, evidenceDetails = {}) {
  const missing = missingEvidenceFields(blockerId, sanitizeEvidenceDetails(blockerId, evidenceDetails));
  return {
    valid: missing.length === 0,
    missing,
  };
}

export function updateBlockerEvidence(blockerId, evidence = {}) {
  const definition = getDefinition(blockerId);
  const current = getDeploymentBlockers().find((item) => item.id === blockerId) || normalizeBlocker(definition);
  const evidenceDetails = sanitizeEvidenceDetails(blockerId, {
    ...current.evidenceDetails,
    ...(evidence.evidenceDetails || {}),
  });
  const next = normalizeBlocker(definition, {
    ...current,
    evidence: evidence.evidence !== undefined ? evidence.evidence : current.evidence,
    evidenceDetails,
    notes: evidence.notes !== undefined ? evidence.notes : current.notes,
    reason: evidence.reason !== undefined ? evidence.reason : current.reason,
    evidenceUpdatedAt: nowIso(),
    evidenceUpdatedBy: evidence.by || evidence.evidenceUpdatedBy || current.evidenceUpdatedBy,
    updatedAt: nowIso(),
  });
  return persistBlocker(next);
}

export function updateBlockerStatus(blockerId, status, evidence = {}) {
  const definition = getDefinition(blockerId);
  const current = getDeploymentBlockers().find((item) => item.id === blockerId) || normalizeBlocker(definition);
  const nextStatus = sanitizeStatus(status);
  const evidenceDetails = sanitizeEvidenceDetails(blockerId, {
    ...current.evidenceDetails,
    ...(evidence.evidenceDetails || {}),
  });
  const actor = sanitizeText(evidence.by || evidence.approvedBy || evidence.statusChangedBy || "");
  const reason = sanitizeText(evidence.reason || evidence.notes || current.reason);
  validateStatusChange(current, nextStatus, { ...evidence, evidenceDetails, reason });
  const changedAt = nowIso();
  const historyEntry = {
    fromStatus: current.status,
    toStatus: nextStatus,
    by: actor,
    at: changedAt,
    reason,
    evidenceSnapshot: evidenceDetails,
  };
  const next = normalizeBlocker(definition, {
    ...current,
    status: nextStatus,
    evidence: evidence.evidence !== undefined ? evidence.evidence : current.evidence,
    evidenceDetails,
    notes: evidence.notes !== undefined ? evidence.notes : current.notes,
    reason,
    approvedBy: [DEPLOYMENT_BLOCKER_STATUSES.APPROVED, DEPLOYMENT_BLOCKER_STATUSES.NOT_APPLICABLE].includes(nextStatus)
      ? actor || current.approvedBy
      : "",
    approvedAt: [DEPLOYMENT_BLOCKER_STATUSES.APPROVED, DEPLOYMENT_BLOCKER_STATUSES.NOT_APPLICABLE].includes(nextStatus)
      ? evidence.approvedAt || current.approvedAt || changedAt
      : "",
    updatedAt: changedAt,
    statusChangedAt: changedAt,
    statusChangedBy: actor,
    approvalHistory: [...current.approvalHistory, historyEntry],
  });
  return persistBlocker(next);
}

export function resetBlockerStatus(blockerId, options = {}) {
  const definition = getDefinition(blockerId);
  const current = getDeploymentBlockers().find((item) => item.id === blockerId) || normalizeBlocker(definition);
  const reason = sanitizeText(options.reason);
  if (!reason) throw new Error("Reset vereist een reden.");
  const resetAt = nowIso();
  const next = normalizeBlocker(definition, {
    approvalHistory: [
      ...current.approvalHistory,
      {
        fromStatus: current.status,
        toStatus: DEPLOYMENT_BLOCKER_STATUSES.PENDING,
        by: sanitizeText(options.by),
        at: resetAt,
        reason,
        evidenceSnapshot: current.evidenceDetails,
      },
    ],
    createdAt: current.createdAt,
    updatedAt: resetAt,
    statusChangedAt: resetAt,
    statusChangedBy: sanitizeText(options.by),
  });
  return persistBlocker(next);
}

export function getResolvedBlockers() {
  return getDeploymentBlockers().filter((blocker) => [DEPLOYMENT_BLOCKER_STATUSES.APPROVED, DEPLOYMENT_BLOCKER_STATUSES.NOT_APPLICABLE].includes(blocker.status));
}

export function getPendingBlockers() {
  return getDeploymentBlockers().filter((blocker) => ![DEPLOYMENT_BLOCKER_STATUSES.APPROVED, DEPLOYMENT_BLOCKER_STATUSES.NOT_APPLICABLE].includes(blocker.status));
}

export function getBlockingIssues() {
  return getPendingBlockers().map((blocker) => ({
    id: blocker.id,
    label: blocker.title,
    severity: blocker.status === DEPLOYMENT_BLOCKER_STATUSES.REJECTED ? "critical" : "high",
    status: blocker.status,
    reason: blocker.description,
    missingEvidence: blocker.missingEvidence,
  }));
}

export function getDeploymentGoNoGoStatus() {
  const blockers = getDeploymentBlockers();
  const counts = blockers.reduce((summary, blocker) => {
    summary[blocker.status] = (summary[blocker.status] || 0) + 1;
    return summary;
  }, {});
  const pending = getPendingBlockers();
  const rejected = blockers.filter((blocker) => blocker.status === DEPLOYMENT_BLOCKER_STATUSES.REJECTED);
  const missingEvidence = blockers.filter((blocker) => !blocker.hasRequiredEvidence);
  return {
    decision: pending.length ? "NO-GO" : "GO",
    total: blockers.length,
    pending: counts.pending || 0,
    inReview: counts.in_review || 0,
    approved: counts.approved || 0,
    rejected: counts.rejected || 0,
    notApplicable: counts.not_applicable || 0,
    blockers: pending,
    rejectedBlockers: rejected,
    missingEvidence,
    reason: pending.length
      ? "Deployment blijft geblokkeerd totdat alle blockers approved of not_applicable zijn en verplichte evidence is vastgelegd."
      : "Alle deployment blockers zijn approved of not_applicable.",
    nextActions: pending.map((blocker) => ({
      id: blocker.id,
      title: blocker.title,
      action: blocker.missingEvidence.length
        ? `Vul evidence aan: ${blocker.missingEvidence.join(", ")}`
        : "Laat blocker reviewen en approve/not_applicable markeren.",
    })),
  };
}

export const deploymentBlockerService = {
  getDeploymentBlockers,
  getBlockerStatus,
  getBlockerEvidenceSchema,
  validateBlockerEvidence,
  updateBlockerEvidence,
  updateBlockerStatus,
  resetBlockerStatus,
  getDeploymentGoNoGoStatus,
  getBlockingIssues,
  getResolvedBlockers,
  getPendingBlockers,
};
