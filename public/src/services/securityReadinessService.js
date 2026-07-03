export const CANONICAL_RLS_TABLES = Object.freeze([
  "profiles",
  "customers",
  "websites",
  "projects",
  "quotes",
  "quote_lines",
  "invoices",
  "invoice_lines",
  "subscriptions",
  "files",
  "change_requests",
  "settings",
  "demo_emails",
  "activity_logs",
  "import_logs",
]);

export const RLS_READINESS_STATUS = Object.freeze({
  MATRIX: "gereed",
  CLAIMS: "gereed",
  SQL_DRAFT: "voorbereid",
  RISK_AUDIT: "gereed",
  LIVE_EXECUTION: "geblokkeerd tot review",
  ROUTE_GUARDS: "soft actief",
  DATABASE_SECURITY: "voorbereid, nog niet live",
});

const roleCoverage = Object.freeze([
  { role: "super_admin", status: "volledig beheer", boundary: "alleen productieadmin" },
  { role: "admin", status: "beheer canonical platform", boundary: "geen service role in frontend" },
  { role: "sales_partner", status: "salesdata beperkt", boundary: "geen Developer Tools of betaalmutaties" },
  { role: "support", status: "support read/update beperkt", boundary: "geen migratie of mark-paid acties" },
  { role: "developer", status: "technical read/tools", boundary: "geen payment write actions" },
  { role: "customer", status: "eigen data", boundary: "customer_id/auth ownership verplicht" },
  { role: "demo_user", status: "demo-data", boundary: "is_demo/environment demo verplicht" },
  { role: "anonymous", status: "geen klantdata", boundary: "alleen publieke pagina's" },
]);

const knownRisks = Object.freeze([
  { id: "customer-cross-access", level: "hoog", title: "Klant A ziet data van klant B", mitigation: "RLS owner policies per customer_id uitvoeren." },
  { id: "demo-production-mix", level: "hoog", title: "Demo-user ziet productiedata", mitigation: "Demo policies op is_demo/environment afdwingen." },
  { id: "anonymous-portal", level: "hoog", title: "Anonymous opent klantportaal via losse link", mitigation: "Hard route guard + RLS ownership." },
  { id: "developer-payment-write", level: "hoog", title: "Developer voert betaalmutatie uit", mitigation: "Permissions en RLS mutaties beperken." },
  { id: "support-payment-write", level: "hoog", title: "Support voert betaalmutatie uit", mitigation: "Server-side guards + RLS check policies." },
  { id: "sales-dev-tools", level: "middel", title: "Sales ziet Developer Tools", mitigation: "Route guard en nav filtering hard maken." },
  { id: "public-payment-links", level: "hoog", title: "Open offerte/betaallinks lekken data", mitigation: "Authenticated of tokenized toegang ontwerpen." },
  { id: "internal-notes-leak", level: "hoog", title: "Interne notities zichtbaar voor klanten", mitigation: "Sanitized views/service payloads behouden." },
  { id: "activity-log-sensitive", level: "middel", title: "Activity/import logs bevatten gevoelige info", mitigation: "Alleen admin/developer read-only." },
  { id: "legacy-customer-tables", level: "hoog", title: "Legacy customer_* tabellen opnieuw gebruikt", mitigation: "Nieuwe RLS uitsluitend canonical ontwerpen." },
]);

const rlsTestDocuments = Object.freeze([
  { key: "testEnvironment", label: "Testomgeving plan", file: "docs/SUPABASE_TEST_ENVIRONMENT.md", status: "aanwezig" },
  { key: "dryRunPlan", label: "Dry-run plan", file: "docs/RLS_DRY_RUN_PLAN.md", status: "aanwezig" },
  { key: "testScenarios", label: "Testscenario's", file: "docs/RLS_TEST_SCENARIOS.md", status: "aanwezig" },
  { key: "testDataPlan", label: "Testdata plan", file: "docs/RLS_TEST_DATA_PLAN.md", status: "aanwezig" },
  { key: "expectedAccessMatrix", label: "Expected access matrix", file: "docs/RLS_EXPECTED_ACCESS_MATRIX.md", status: "aanwezig" },
  { key: "preflightChecklist", label: "Preflight checklist", file: "docs/RLS_PREFLIGHT_CHECKLIST.md", status: "aanwezig" },
  { key: "testLogTemplate", label: "Testlog template", file: "docs/RLS_TEST_LOG_TEMPLATE.md", status: "aanwezig" },
]);

const rlsScenarioCoverage = Object.freeze([
  { scenario: "admin full access", role: "admin", covered: true, needsSupabaseTest: true },
  { scenario: "sales partner limited access", role: "sales_partner", covered: true, needsSupabaseTest: true },
  { scenario: "support no payment writes", role: "support", covered: true, needsSupabaseTest: true },
  { scenario: "developer no customer payment writes", role: "developer", covered: true, needsSupabaseTest: true },
  { scenario: "customer A/B isolation", role: "customer", covered: true, needsSupabaseTest: true },
  { scenario: "demo isolation", role: "demo_user", covered: true, needsSupabaseTest: true },
  { scenario: "anonymous blocked", role: "anonymous", covered: true, needsSupabaseTest: true },
  { scenario: "customer portal mismatch", role: "customer", covered: true, needsSupabaseTest: true },
]);

export function getSecurityHardeningChecklist() {
  return [
    { item: "RLS policy matrix", status: RLS_READINESS_STATUS.MATRIX, file: "docs/RLS_POLICY_MATRIX.md" },
    { item: "Auth claims strategy", status: RLS_READINESS_STATUS.CLAIMS, file: "docs/AUTH_CLAIMS_STRATEGY.md" },
    { item: "Canonical SQL draft", status: RLS_READINESS_STATUS.SQL_DRAFT, file: "docs/supabase-rls-canonical-draft.sql" },
    { item: "Security risk audit", status: RLS_READINESS_STATUS.RISK_AUDIT, file: "docs/SECURITY_RISK_AUDIT.md" },
    { item: "RLS live execution", status: RLS_READINESS_STATUS.LIVE_EXECUTION, file: "Supabase SQL Editor na review" },
    { item: "Frontend route guards", status: RLS_READINESS_STATUS.ROUTE_GUARDS, file: "public/src/services/routeGuardService.js" },
    { item: "Database-level security", status: RLS_READINESS_STATUS.DATABASE_SECURITY, file: "Nog niet live" },
  ];
}

export function getRlsCoverageSummary() {
  return {
    canonicalTables: CANONICAL_RLS_TABLES.map((table) => ({
      table,
      planned: true,
      live: false,
      legacy: false,
    })),
    legacyTablesExcluded: ["customer_websites", "customer_invoices", "customer_subscriptions"],
    roleCoverage,
    liveExecution: false,
    sqlExecuted: false,
    status: RLS_READINESS_STATUS.DATABASE_SECURITY,
  };
}

export function getKnownSecurityRisks() {
  return [...knownRisks];
}

export function getRlsTestEnvironmentReadiness() {
  return {
    status: "voorbereid",
    liveRlsActive: false,
    productionExecutionAllowed: false,
    documents: [...rlsTestDocuments],
    requiredEnvironmentVariables: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY server-side only", "ADMIN_TOKEN server-side/admin only"],
    message: "Testomgevingplan is voorbereid. Productie-RLS blijft geblokkeerd tot handmatige testresultaten.",
  };
}

export function getRlsDryRunPlanStatus() {
  return {
    status: "voorbereid",
    steps: [
      "Supabase testproject gebruiken",
      "Canonical schema uitvoeren",
      "Synthetische testdata toevoegen",
      "Testprofiles/Auth-users aanmaken",
      "RLS draft in test uitvoeren na review",
      "Alle rolscenario's testen",
      "Resultaten loggen",
      "Pas daarna productieplan voorbereiden",
    ],
    sqlExecuted: false,
    productionTouched: false,
  };
}

export function getRlsTestScenarioCoverage() {
  return {
    status: "gedocumenteerd",
    scenarioCount: rlsScenarioCoverage.length,
    coveredCount: rlsScenarioCoverage.filter((scenario) => scenario.covered).length,
    scenarios: [...rlsScenarioCoverage],
    note: "Frontend-tests zijn simulaties; echte pass/fail vereist Supabase Auth + RLS in testproject.",
  };
}

export function getRlsPreflightChecklistStatus() {
  return {
    status: "no-go",
    completed: false,
    requiredBeforeGo: [
      "canonical schema bevestigd",
      "testproject aangemaakt",
      "RLS draft reviewed",
      "testdata aangemaakt",
      "alle scenario's getest",
      "A/B isolatie geslaagd",
      "demo/productie isolatie geslaagd",
      "anonymous block geslaagd",
      "rollbackplan klaar",
      "backup klaar",
      "execution window gepland",
    ],
    openItems: 11,
  };
}

export function getRlsGoNoGoSummary() {
  const readiness = getRlsTestEnvironmentReadiness();
  const dryRun = getRlsDryRunPlanStatus();
  const scenarios = getRlsTestScenarioCoverage();
  const preflight = getRlsPreflightChecklistStatus();
  return {
    decision: "No-Go",
    reason: "RLS is voorbereid, maar handmatige Supabase testresultaten en preflight-afvinking ontbreken nog.",
    liveRlsActive: false,
    productionExecutionAllowed: false,
    readiness,
    dryRun,
    scenarios,
    preflight,
  };
}

export function runSecurityReadinessSelfTest() {
  const checklist = getSecurityHardeningChecklist();
  const coverage = getRlsCoverageSummary();
  const risks = getKnownSecurityRisks();
  const goNoGo = getRlsGoNoGoSummary();
  return {
    testedAt: new Date().toISOString(),
    ok: checklist.every((entry) => entry.status !== "ontbreekt") && coverage.canonicalTables.every((entry) => entry.planned),
    liveSafe: false,
    status: "voorbereid, niet live",
    checklist,
    coverage,
    highRiskCount: risks.filter((risk) => risk.level === "hoog").length,
    riskCount: risks.length,
    goNoGo,
    message: "Security readiness is voorbereid. RLS is nog niet live uitgevoerd en Go/No-Go blijft No-Go.",
  };
}

export function getSecurityReadinessSummary() {
  const selfTest = runSecurityReadinessSelfTest();
  return {
    ...selfTest,
    statuses: RLS_READINESS_STATUS,
  };
}

export const securityReadinessService = {
  getSecurityHardeningChecklist,
  getRlsCoverageSummary,
  getKnownSecurityRisks,
  getRlsTestEnvironmentReadiness,
  getRlsDryRunPlanStatus,
  getRlsTestScenarioCoverage,
  getRlsPreflightChecklistStatus,
  getRlsGoNoGoSummary,
  runSecurityReadinessSelfTest,
  getSecurityReadinessSummary,
};
