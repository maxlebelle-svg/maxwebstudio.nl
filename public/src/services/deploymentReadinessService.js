import { getBlockingIssues as getDeploymentBlockerIssues, getDeploymentBlockers, getDeploymentGoNoGoStatus, getResolvedBlockers } from "./deploymentBlockerService.js";

const DEPLOYMENT_AREAS = Object.freeze([
  { key: "schema", label: "Schema", status: "Ready", reason: "Canonical schema is gedocumenteerd." },
  { key: "profiles", label: "Profiles", status: "Ready", reason: "Profile foundation is voorbereid." },
  { key: "customers", label: "Customers", status: "Ready", reason: "Customer repositories en migratieflow zijn voorbereid." },
  { key: "websites", label: "Websites", status: "Ready", reason: "Website module heeft Supabase-read/write voorbereiding." },
  { key: "projects", label: "Projects", status: "Ready", reason: "Project module heeft Supabase-read/write voorbereiding." },
  { key: "quotes", label: "Quotes", status: "Ready", reason: "Quote migratie/readiness is voorbereid." },
  { key: "invoices", label: "Invoices", status: "Ready", reason: "Invoice migratie/readiness is voorbereid." },
  { key: "subscriptions", label: "Subscriptions", status: "Ready", reason: "Subscription migratie/readiness is voorbereid." },
  { key: "auth", label: "Auth", status: "Pending", reason: "Echte Supabase Auth live flow moet nog getest worden." },
  { key: "rls", label: "RLS", status: "Blocked", reason: "RLS review en testlog ontbreken nog." },
  { key: "storage", label: "Storage", status: "Pending", reason: "Private buckets moeten in testomgeving worden gecontroleerd." },
  { key: "functions", label: "Functions", status: "Pending", reason: "Serverless endpoints moeten met productie-env worden getest." },
  { key: "resend", label: "Resend", status: "Pending", reason: "Domein/from-address en templates moeten live getest worden." },
  { key: "mollie", label: "Mollie", status: "Pending", reason: "Testmodus, webhooks en statusupdates moeten pass zijn." },
  { key: "monitoring", label: "Monitoring", status: "Pending", reason: "Alerts en logs moeten ingericht zijn." },
]);

const DEPLOYMENT_DOCUMENTS = Object.freeze([
  "docs/deployment/README.md",
  "docs/deployment/01_SCHEMA.md",
  "docs/deployment/02_AUTH.md",
  "docs/deployment/03_RLS.md",
  "docs/deployment/04_STORAGE.md",
  "docs/deployment/05_FUNCTIONS.md",
  "docs/deployment/06_MOLLIE.md",
  "docs/deployment/07_RESEND.md",
  "docs/deployment/08_POST_DEPLOY_CHECKS.md",
  "docs/deployment/09_ROLLBACK.md",
  "docs/deployment/SQL_BUNDLE.md",
  "docs/deployment/PRODUCTION_CHECKLIST.md",
  "docs/deployment/ROLLBACK_PLAN.md",
  "docs/deployment/DEPLOYMENT_BLOCKERS.md",
  "docs/deployment/ENVIRONMENT_VARIABLES_CHECKLIST.md",
  "docs/deployment/AUTH_TEST_CHECKLIST.md",
  "docs/deployment/CUSTOMER_ISOLATION_CHECKLIST.md",
  "docs/deployment/TEST_EXECUTION_PLAN.md",
  "docs/deployment/TEST_RESULTS.md",
]);

const DEPLOYMENT_BUNDLE_REQUIREMENTS = Object.freeze([
  {
    key: "deployment_docs",
    label: "Deployment docs",
    files: [
      "docs/deployment/README.md",
      "docs/deployment/01_SCHEMA.md",
      "docs/deployment/02_AUTH.md",
      "docs/deployment/03_RLS.md",
      "docs/deployment/04_STORAGE.md",
      "docs/deployment/05_FUNCTIONS.md",
      "docs/deployment/06_MOLLIE.md",
      "docs/deployment/07_RESEND.md",
      "docs/deployment/08_POST_DEPLOY_CHECKS.md",
      "docs/deployment/09_ROLLBACK.md",
      "docs/deployment/TEST_EXECUTION_PLAN.md",
      "docs/deployment/TEST_RESULTS.md",
    ],
  },
  {
    key: "canonical_schema",
    label: "Canonical schema",
    files: ["supabase/schema.sql"],
  },
  {
    key: "patch_plan",
    label: "Patch plan",
    files: ["docs/SUPABASE_PATCH_PLAN.md"],
  },
  {
    key: "rollback_plan",
    label: "Rollbackplan",
    files: ["docs/deployment/ROLLBACK_PLAN.md"],
  },
  {
    key: "auth_docs",
    label: "Auth docs",
    files: ["docs/AUTH.md", "docs/deployment/02_AUTH.md", "docs/deployment/AUTH_TEST_CHECKLIST.md"],
  },
  {
    key: "rls_docs",
    label: "RLS docs",
    files: ["docs/RLS_POLICY_MATRIX.md", "docs/RLS_DRY_RUN_PLAN.md", "docs/deployment/03_RLS.md"],
  },
  {
    key: "deployment_checklist",
    label: "Deployment checklist",
    files: ["docs/deployment/PRODUCTION_CHECKLIST.md"],
  },
]);

const WARNINGS = Object.freeze([
  "Deployment bundle is documentatie/readiness; voert niets uit.",
  "RLS blijft No-Go totdat testomgevingresultaten zijn vastgelegd.",
  "Mollie, Resend en Storage moeten na Auth/RLS apart live getest worden.",
  "Gebruik canonical tabellen; legacy customer_* blijft historische context.",
]);

export function getDeploymentChecklist() {
  return {
    status: "prepared",
    documents: [...DEPLOYMENT_DOCUMENTS],
    areas: [...DEPLOYMENT_AREAS],
    requiredManualChecks: [
      "Backup gemaakt",
      "Git schoon",
      "Schema uitgevoerd in test",
      "RLS getest",
      "Auth getest",
      "Customer A/B isolatie pass",
      "Demo isolatie pass",
      "Mollie test pass",
      "Resend test pass",
      "Storage test pass",
      "Rollbackplan goedgekeurd",
      "Deployment blockers approved/not_applicable",
      "Environment variables checklist ingevuld zonder secrets",
      "Auth test checklist ingevuld",
      "Customer isolation checklist ingevuld",
    ],
  };
}

export function getDeploymentBundleValidation() {
  const requirements = DEPLOYMENT_BUNDLE_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    status: "Ready",
    reason: "Opgenomen in de deployment bundle index. Bestandscontrole gebeurt via repository checks, niet via runtime.",
  }));
  return {
    status: "Ready",
    requirements,
    documents: [...DEPLOYMENT_DOCUMENTS],
    note: "Deze validator voert niets uit en leest geen secrets. Hij bewaakt alleen de vastgelegde deploymentstructuur.",
  };
}

export function getBlockingIssues() {
  return getDeploymentBlockerIssues();
}

export function getWarnings() {
  return [...WARNINGS];
}

export function getGoNoGo() {
  const blockerStatus = getDeploymentGoNoGoStatus();
  const blockers = getBlockingIssues();
  return {
    decision: blockerStatus.decision,
    blockers,
    summary: blockerStatus,
    reason: blockerStatus.reason,
    missingEvidence: blockerStatus.missingEvidence || [],
    rejectedBlockers: blockerStatus.rejectedBlockers || [],
    nextActions: blockerStatus.nextActions || [],
  };
}

export function getDeploymentReadiness() {
  const checklist = getDeploymentChecklist();
  const goNoGo = getGoNoGo();
  const blockerStatus = getDeploymentGoNoGoStatus();
  return {
    generatedAt: new Date().toISOString(),
    status: goNoGo.decision,
    checklist,
    blockers: goNoGo.blockers,
    blockerStatus,
    blockerEvidence: getBlockerEvidenceSummary(),
    warnings: getWarnings(),
    goNoGo,
  };
}

export function getBlockerEvidenceSummary() {
  return {
    blockers: getDeploymentBlockers().map((blocker) => ({
      id: blocker.id,
      title: blocker.title,
      status: blocker.status,
      hasEvidence: Boolean(blocker.evidence),
      hasNotes: Boolean(blocker.notes),
      approvedBy: blocker.approvedBy || "",
      approvedAt: blocker.approvedAt || "",
      updatedAt: blocker.updatedAt || "",
      statusChangedAt: blocker.statusChangedAt || "",
      statusChangedBy: blocker.statusChangedBy || "",
      evidenceUpdatedAt: blocker.evidenceUpdatedAt || "",
      evidenceUpdatedBy: blocker.evidenceUpdatedBy || "",
      missingEvidence: blocker.missingEvidence || [],
      evidenceDetails: blocker.evidenceDetails || {},
      approvalHistory: blocker.approvalHistory || [],
      evidenceSummary: blocker.evidence ? blocker.evidence.slice(0, 180) : "",
      notesSummary: blocker.notes ? blocker.notes.slice(0, 180) : "",
    })),
    resolvedCount: getResolvedBlockers().length,
    pendingCount: getDeploymentBlockerIssues().length,
  };
}

export const deploymentReadinessService = {
  getDeploymentReadiness,
  getDeploymentChecklist,
  getBlockingIssues,
  getWarnings,
  getGoNoGo,
  getBlockerEvidenceSummary,
  getDeploymentBundleValidation,
};
