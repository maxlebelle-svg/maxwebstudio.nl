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
]);

const BLOCKING_ISSUES = Object.freeze([
  { id: "backup-missing", label: "Geen backup bevestigd", severity: "high" },
  { id: "rls-review-missing", label: "Geen RLS review/testapproval", severity: "high" },
  { id: "testlog-missing", label: "Geen RLS/Supabase testlog", severity: "high" },
  { id: "auth-test-missing", label: "Geen Auth testresultaat", severity: "high" },
  { id: "customer-isolation-missing", label: "Geen klantisolatie-test", severity: "critical" },
  { id: "rollback-not-approved", label: "Rollbackplan nog niet expliciet goedgekeurd", severity: "high" },
  { id: "legacy-tables-active", label: "Legacy customer_* tabellen nog actief in live-flow", severity: "high" },
  { id: "legacy-risk", label: "Legacy customer_* scripts mogen niet blind uitgevoerd worden", severity: "medium" },
  { id: "env-vars-unverified", label: "Environment variables nog niet productie-gecontroleerd", severity: "high" },
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
    ],
  };
}

export function getBlockingIssues() {
  return [...BLOCKING_ISSUES];
}

export function getWarnings() {
  return [...WARNINGS];
}

export function getGoNoGo() {
  const blockers = getBlockingIssues();
  return {
    decision: blockers.length ? "NO-GO" : "GO",
    blockers,
    reason: blockers.length
      ? "Production deployment blijft geblokkeerd tot alle handmatige bewijzen en testresultaten aanwezig zijn."
      : "Alle blockers zijn opgelost.",
  };
}

export function getDeploymentReadiness() {
  const checklist = getDeploymentChecklist();
  const goNoGo = getGoNoGo();
  return {
    generatedAt: new Date().toISOString(),
    status: goNoGo.decision,
    checklist,
    blockers: goNoGo.blockers,
    warnings: getWarnings(),
    goNoGo,
  };
}

export const deploymentReadinessService = {
  getDeploymentReadiness,
  getDeploymentChecklist,
  getBlockingIssues,
  getWarnings,
  getGoNoGo,
};
