import { STORAGE_KEYS } from "../config/storageKeys.js";

export const DEPLOYMENT_BLOCKER_STATUSES = Object.freeze({
  PENDING: "pending",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  NOT_APPLICABLE: "not_applicable",
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

function storedBlockersById() {
  const stored = readJson(STORAGE_KEYS.deploymentBlockers, {});
  if (Array.isArray(stored)) {
    return Object.fromEntries(stored.map((item) => [item.id, item]));
  }
  return stored && typeof stored === "object" ? stored : {};
}

function normalizeBlocker(definition, stored = {}) {
  const status = sanitizeStatus(stored.status);
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    requiredEvidence: definition.requiredEvidence,
    approver: definition.approver,
    status,
    evidence: sanitizeText(stored.evidence),
    approvedBy: sanitizeText(stored.approvedBy),
    approvedAt: stored.approvedAt || "",
    updatedAt: stored.updatedAt || "",
    notes: sanitizeText(stored.notes),
  };
}

function persistBlocker(blocker) {
  const stored = storedBlockersById();
  stored[blocker.id] = blocker;
  writeJson(STORAGE_KEYS.deploymentBlockers, stored);
  return blocker;
}

export function getDeploymentBlockers() {
  const stored = storedBlockersById();
  return DEPLOYMENT_BLOCKER_DEFINITIONS.map((definition) => normalizeBlocker(definition, stored[definition.id]));
}

export function getBlockerStatus(blockerId) {
  const blocker = getDeploymentBlockers().find((item) => item.id === blockerId);
  return blocker?.status || DEPLOYMENT_BLOCKER_STATUSES.PENDING;
}

export function updateBlockerStatus(blockerId, status, evidence = {}) {
  const definition = DEPLOYMENT_BLOCKER_DEFINITIONS.find((item) => item.id === blockerId);
  if (!definition) throw new Error(`Onbekende deployment blocker: ${blockerId}`);
  const current = getDeploymentBlockers().find((item) => item.id === blockerId) || normalizeBlocker(definition);
  const nextStatus = sanitizeStatus(status);
  const next = {
    ...current,
    status: nextStatus,
    evidence: evidence.evidence !== undefined ? sanitizeText(evidence.evidence) : current.evidence,
    notes: evidence.notes !== undefined ? sanitizeText(evidence.notes) : current.notes,
    approvedBy: evidence.approvedBy !== undefined ? sanitizeText(evidence.approvedBy) : current.approvedBy,
    approvedAt: [DEPLOYMENT_BLOCKER_STATUSES.APPROVED, DEPLOYMENT_BLOCKER_STATUSES.NOT_APPLICABLE].includes(nextStatus)
      ? evidence.approvedAt || current.approvedAt || nowIso()
      : "",
    updatedAt: nowIso(),
  };
  return persistBlocker(next);
}

export function resetBlockerStatus(blockerId) {
  const definition = DEPLOYMENT_BLOCKER_DEFINITIONS.find((item) => item.id === blockerId);
  if (!definition) throw new Error(`Onbekende deployment blocker: ${blockerId}`);
  const stored = storedBlockersById();
  delete stored[blockerId];
  writeJson(STORAGE_KEYS.deploymentBlockers, stored);
  return normalizeBlocker(definition);
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
  }));
}

export function getDeploymentGoNoGoStatus() {
  const blockers = getDeploymentBlockers();
  const counts = blockers.reduce((summary, blocker) => {
    summary[blocker.status] = (summary[blocker.status] || 0) + 1;
    return summary;
  }, {});
  const pending = getPendingBlockers();
  return {
    decision: pending.length ? "NO-GO" : "GO",
    total: blockers.length,
    pending: counts.pending || 0,
    inReview: counts.in_review || 0,
    approved: counts.approved || 0,
    rejected: counts.rejected || 0,
    notApplicable: counts.not_applicable || 0,
    blockers: pending,
    reason: pending.length
      ? "Deployment blijft geblokkeerd totdat alle blockers approved of not_applicable zijn."
      : "Alle deployment blockers zijn approved of not_applicable.",
  };
}

export const deploymentBlockerService = {
  getDeploymentBlockers,
  getBlockerStatus,
  updateBlockerStatus,
  resetBlockerStatus,
  getDeploymentGoNoGoStatus,
  getBlockingIssues,
  getResolvedBlockers,
  getPendingBlockers,
};
