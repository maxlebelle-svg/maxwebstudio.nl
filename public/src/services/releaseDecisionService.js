import { getDeploymentReadiness, getGoNoGo, getWarnings } from "./deploymentReadinessService.js";
import { getDeploymentBlockers, getDeploymentGoNoGoStatus } from "./deploymentBlockerService.js";
import { getTestEnvironmentStatus, getEnvironmentSummary } from "./testEnvironmentService.js";

function safeDate() {
  return new Date().toISOString();
}

function summarizeBlocker(blocker) {
  return {
    id: blocker.id,
    title: blocker.title,
    status: blocker.status,
    requiredEvidenceFields: blocker.evidenceFields,
    missingEvidence: blocker.missingEvidence,
    hasRequiredEvidence: blocker.hasRequiredEvidence,
    evidenceSummary: blocker.evidence || "",
    evidenceDetails: blocker.evidenceDetails,
    approvedBy: blocker.approvedBy || "",
    approvedAt: blocker.approvedAt || "",
    statusChangedAt: blocker.statusChangedAt || "",
    statusChangedBy: blocker.statusChangedBy || "",
    evidenceUpdatedAt: blocker.evidenceUpdatedAt || "",
    evidenceUpdatedBy: blocker.evidenceUpdatedBy || "",
    notes: blocker.notes || "",
    reason: blocker.reason || "",
    approvalHistory: blocker.approvalHistory || [],
  };
}

export function getGoNoGoReasons() {
  const status = getDeploymentGoNoGoStatus();
  const blockers = getDeploymentBlockers();
  const missingEvidence = blockers
    .filter((blocker) => blocker.missingEvidence.length)
    .map((blocker) => `${blocker.title}: ${blocker.missingEvidence.join(", ")}`);
  const rejected = blockers
    .filter((blocker) => blocker.status === "rejected")
    .map((blocker) => blocker.title);
  const inReview = blockers
    .filter((blocker) => blocker.status === "in_review")
    .map((blocker) => blocker.title);
  const pending = blockers
    .filter((blocker) => blocker.status === "pending")
    .map((blocker) => blocker.title);
  return {
    decision: status.decision,
    primaryReason: status.reason,
    missingEvidence,
    rejected,
    inReview,
    pending,
    nextActions: status.nextActions || [],
  };
}

export function getApprovalCoverage() {
  const blockers = getDeploymentBlockers();
  const approved = blockers.filter((blocker) => ["approved", "not_applicable"].includes(blocker.status));
  const withEvidence = blockers.filter((blocker) => blocker.hasRequiredEvidence);
  return {
    total: blockers.length,
    approvedOrNotApplicable: approved.length,
    evidenceComplete: withEvidence.length,
    percentage: blockers.length ? Math.round((approved.length / blockers.length) * 100) : 0,
    evidencePercentage: blockers.length ? Math.round((withEvidence.length / blockers.length) * 100) : 0,
  };
}

export function generateReleaseDecisionSummary() {
  const readiness = getDeploymentReadiness();
  const testEnvironment = getTestEnvironmentStatus();
  const productionValidation = getEnvironmentSummary();
  const goNoGo = getGoNoGo();
  const blockers = getDeploymentBlockers().map(summarizeBlocker);
  const reasons = getGoNoGoReasons();
  return {
    project: "Max Webstudio",
    generatedAt: safeDate(),
    decision: goNoGo.decision,
    readinessStatus: readiness.status,
    testEnvironmentStatus: testEnvironment.status,
    approvalCoverage: getApprovalCoverage(),
    goNoGoReasons: reasons,
    blockers,
    productionValidation: productionValidation.areas,
    warnings: getWarnings(),
    nextActions: reasons.nextActions,
    references: {
      testExecutionPlan: "docs/deployment/TEST_EXECUTION_PLAN.md",
      testResults: "docs/deployment/TEST_RESULTS.md",
      productionChecklist: "docs/deployment/PRODUCTION_CHECKLIST.md",
      rollbackPlan: "docs/deployment/ROLLBACK_PLAN.md",
    },
  };
}

export function exportReleaseDecisionJson() {
  return JSON.stringify(generateReleaseDecisionSummary(), null, 2);
}

export function getReleaseDecisionMarkdown() {
  const summary = generateReleaseDecisionSummary();
  const lines = [
    "# Release Decision Summary",
    "",
    `Project: ${summary.project}`,
    `Generated at: ${summary.generatedAt}`,
    `Decision: ${summary.decision}`,
    `Readiness: ${summary.readinessStatus}`,
    `Test environment: ${summary.testEnvironmentStatus}`,
    "",
    "## Approval Coverage",
    "",
    `- Approved/not applicable: ${summary.approvalCoverage.approvedOrNotApplicable}/${summary.approvalCoverage.total}`,
    `- Evidence complete: ${summary.approvalCoverage.evidenceComplete}/${summary.approvalCoverage.total}`,
    "",
    "## GO/NO-GO Reasons",
    "",
    `- ${summary.goNoGoReasons.primaryReason}`,
    ...summary.goNoGoReasons.missingEvidence.map((item) => `- Missing evidence: ${item}`),
    ...summary.goNoGoReasons.rejected.map((item) => `- Rejected: ${item}`),
    ...summary.goNoGoReasons.inReview.map((item) => `- In review: ${item}`),
    ...summary.goNoGoReasons.pending.map((item) => `- Pending: ${item}`),
    "",
    "## Blockers",
    "",
    ...summary.blockers.map((blocker) => `- ${blocker.title}: ${blocker.status}${blocker.missingEvidence.length ? `, missing ${blocker.missingEvidence.join(", ")}` : ""}`),
    "",
    "## Next Actions",
    "",
    ...(summary.nextActions.length ? summary.nextActions.map((item) => `- ${item.title}: ${item.action}`) : ["- Geen open acties."]),
  ];
  return lines.join("\n");
}

export const releaseDecisionService = {
  generateReleaseDecisionSummary,
  exportReleaseDecisionJson,
  getReleaseDecisionMarkdown,
  getGoNoGoReasons,
  getApprovalCoverage,
};
