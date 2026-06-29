import {
  DEPLOYMENT_BLOCKER_STATUSES,
  getBlockingIssues,
  getDeploymentBlockers,
  getDeploymentGoNoGoStatus,
} from "./deploymentBlockerService.js";

const MIGRATION_DRAFTS = Object.freeze([
  {
    file: "supabase/migration-drafts/001_schema_tables.sql",
    label: "Schema/tables",
    purpose: "Canonical platformtabellen voorbereiden.",
  },
  {
    file: "supabase/migration-drafts/002_indexes.sql",
    label: "Indexes",
    purpose: "Performance- en relationele indexes voorbereiden.",
  },
  {
    file: "supabase/migration-drafts/003_rls_enablement.sql",
    label: "RLS enablement",
    purpose: "Row Level Security activeren per tabel.",
  },
  {
    file: "supabase/migration-drafts/004_rls_policies.sql",
    label: "RLS policies",
    purpose: "Rol- en klantisolatie policies voorbereiden.",
  },
  {
    file: "supabase/migration-drafts/005_audit_logging_foundation.sql",
    label: "Audit logging foundation",
    purpose: "Audit logging basis voorbereiden.",
  },
  {
    file: "supabase/migration-drafts/006_seed_demo_data_optional.sql",
    label: "Optionele demo seed",
    purpose: "Alleen test/demo seed data, niet productie.",
  },
]);

const STAGING_DOCUMENTS = Object.freeze([
  {
    id: "migration_drafts_readme",
    label: "Migration drafts index",
    file: "supabase/migration-drafts/README.md",
    status: "ready",
  },
  {
    id: "sql_bundle",
    label: "SQL bundle overzicht",
    file: "docs/deployment/SQL_BUNDLE.md",
    status: "ready",
  },
  {
    id: "staging_plan",
    label: "Staging execution plan",
    file: "docs/SUPABASE_STAGING_EXECUTION_PLAN.md",
    status: "ready",
  },
  {
    id: "staging_checklist",
    label: "Staging checklist",
    file: "docs/deployment/STAGING_EXECUTION_CHECKLIST.md",
    status: "ready",
  },
  {
    id: "rollback_plan",
    label: "Rollbackplan",
    file: "docs/deployment/ROLLBACK_PLAN.md",
    status: "ready",
  },
  {
    id: "test_results",
    label: "Testresultatenregister",
    file: "docs/deployment/TEST_RESULTS.md",
    status: "pending_evidence",
  },
]);

const REQUIRED_APPROVAL_BLOCKERS = Object.freeze([
  "backup_confirmed",
  "rls_review_approved",
  "rls_test_log_completed",
  "auth_test_completed",
  "customer_isolation_test_completed",
  "rollback_plan_approved",
  "env_vars_verified",
]);

function isApproved(blocker) {
  return [
    DEPLOYMENT_BLOCKER_STATUSES.APPROVED,
    DEPLOYMENT_BLOCKER_STATUSES.NOT_APPLICABLE,
  ].includes(blocker.status);
}

function blockerSummary(blocker) {
  return {
    id: blocker.id,
    title: blocker.title,
    status: blocker.status,
    hasRequiredEvidence: blocker.hasRequiredEvidence,
    missingEvidence: blocker.missingEvidence || [],
    nextAction: blocker.missingEvidence?.length
      ? `Evidence aanvullen: ${blocker.missingEvidence.join(", ")}`
      : "Reviewen en approval/not_applicable vastleggen.",
  };
}

export function getStagingReadinessChecklist() {
  return [
    {
      label: "Migration drafts",
      status: "ready",
      detail: `${MIGRATION_DRAFTS.length} draftbestanden geregistreerd.`,
    },
    {
      label: "Staging checklist",
      status: "ready",
      detail: "Preflight, SQL-stappen, rollen, isolatie en evidence zijn vastgelegd.",
    },
    {
      label: "Rollbackplan",
      status: "ready",
      detail: "Rollbackprocedure is gedocumenteerd, approval blijft handmatig.",
    },
    {
      label: "Testresultaten",
      status: "pending_evidence",
      detail: "Fase 25/26 voert geen SQL uit; echte staging evidence ontbreekt nog.",
    },
    {
      label: "Productiewijzigingen",
      status: "not_started",
      detail: "Geen SQL, Supabase CLI of productieactie uitgevoerd.",
    },
  ];
}

export function getStagingExecutionReadiness() {
  const blockers = getDeploymentBlockers();
  const goNoGo = getDeploymentGoNoGoStatus();
  const blockingIssues = getBlockingIssues();
  const approvalBlockers = blockers.filter((blocker) => REQUIRED_APPROVAL_BLOCKERS.includes(blocker.id));
  const approvedApprovals = approvalBlockers.filter(isApproved);
  const missingApprovals = approvalBlockers.filter((blocker) => !isApproved(blocker)).map(blockerSummary);
  const pendingEvidence = blockers.filter((blocker) => !blocker.hasRequiredEvidence).map(blockerSummary);
  const checklist = getStagingReadinessChecklist();
  const testResults = STAGING_DOCUMENTS.find((document) => document.id === "test_results");
  const noGoReasons = [
    ...missingApprovals.map((item) => `${item.title}: ${item.nextAction}`),
    ...(pendingEvidence.length ? ["Niet alle deployment blockers hebben verplichte evidence."] : []),
    "Echte Supabase staging execution is nog niet uitgevoerd in deze fase.",
  ];

  return {
    generatedAt: new Date().toISOString(),
    status: goNoGo.decision === "GO" && !pendingEvidence.length ? "ready" : "blocked",
    decision: goNoGo.decision === "GO" && !pendingEvidence.length ? "GO" : "NO-GO",
    migrationDrafts: {
      status: "ready",
      count: MIGRATION_DRAFTS.length,
      files: [...MIGRATION_DRAFTS],
    },
    documents: [...STAGING_DOCUMENTS],
    checklist,
    approvals: {
      requiredCount: approvalBlockers.length,
      approvedCount: approvedApprovals.length,
      missing: missingApprovals,
    },
    blockers: blockingIssues,
    pendingEvidence,
    testResults: {
      status: testResults?.status || "pending_evidence",
      file: testResults?.file || "docs/deployment/TEST_RESULTS.md",
      note: "Resultatenbestand is voorbereid; echte staging execution evidence moet nog worden ingevuld.",
    },
    safety: {
      sqlExecuted: false,
      supabaseCliRun: false,
      productionTouched: false,
      externalServicesCalled: false,
    },
    noGoReasons: goNoGo.decision === "GO" && !pendingEvidence.length ? [] : noGoReasons,
    nextActions: goNoGo.nextActions?.length
      ? goNoGo.nextActions
      : [
        {
          id: "staging_execution",
          title: "Supabase staging execution uitvoeren",
          action: "Voer de drafts alleen na expliciete approval uit in een test/staging project.",
        },
      ],
  };
}

export function getStagingGoNoGo() {
  const readiness = getStagingExecutionReadiness();
  return {
    decision: readiness.decision,
    status: readiness.status,
    reasons: readiness.noGoReasons,
    generatedAt: readiness.generatedAt,
  };
}

export const stagingReadinessService = {
  getStagingReadinessChecklist,
  getStagingExecutionReadiness,
  getStagingGoNoGo,
};
