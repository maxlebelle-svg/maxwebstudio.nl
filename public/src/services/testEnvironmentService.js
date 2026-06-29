import { getActiveProviderStatus } from "./providerStatusService.js";
import { getDeploymentBundleValidation, getDeploymentChecklist } from "./deploymentReadinessService.js";
import { getDeploymentBlockers, getDeploymentGoNoGoStatus } from "./deploymentBlockerService.js";

const READY = "READY";
const NOT_READY = "NOT READY";
const BLOCKED = "BLOCKED";
const PENDING = "PENDING";

const SQL_EXECUTION_ORDER = Object.freeze([
  { key: "schema", label: "Schema", dependency: "Canonical schema uit supabase/schema.sql." },
  { key: "patches", label: "Patches", dependency: "Canonical patches en veilige ALTER-stappen na schema." },
  { key: "auth", label: "Auth", dependency: "Auth/profile foundation na basis-tabellen." },
  { key: "profiles", label: "Profiles", dependency: "Profiles koppelen aan Auth en customers." },
  { key: "testdata", label: "Testdata", dependency: "Alleen testomgeving, na schema en profiles." },
  { key: "rls", label: "RLS", dependency: "Pas na testdata en role/profile-validatie." },
  { key: "storage", label: "Storage", dependency: "Private buckets na RLS-review." },
  { key: "functions", label: "Functions", dependency: "Serverless endpoints na env-var controle." },
  { key: "mollie", label: "Mollie", dependency: "Na functions en webhook-URL controle." },
  { key: "resend", label: "Resend", dependency: "Na domain/from-address controle." },
]);

const PRODUCTION_VALIDATION_AREAS = Object.freeze([
  { key: "deploymentBundle", label: "Deployment Bundle", source: "bundle" },
  { key: "canonicalSchema", label: "Canonical Schema", source: "schema" },
  { key: "security", label: "Security", source: "blockers" },
  { key: "auth", label: "Auth", source: "auth_test_completed" },
  { key: "storage", label: "Storage", source: "manual" },
  { key: "functions", label: "Functions", source: "manual" },
  { key: "mollie", label: "Mollie", source: "manual" },
  { key: "resend", label: "Resend", source: "manual" },
  { key: "clientPortal", label: "Client Portal", source: "customer_isolation_test_completed" },
  { key: "monitoring", label: "Monitoring", source: "manual" },
]);

function isApproved(blocker) {
  return ["approved", "not_applicable"].includes(blocker?.status);
}

function blockerById(id) {
  return getDeploymentBlockers().find((blocker) => blocker.id === id);
}

function hasEvidence(blocker) {
  return Boolean(blocker?.evidence || blocker?.notes || blocker?.approvedBy);
}

function mapBlockerToReadiness(blockerId) {
  const blocker = blockerById(blockerId);
  const approved = isApproved(blocker);
  return {
    id: blockerId,
    title: blocker?.title || blockerId,
    status: approved ? READY : NOT_READY,
    blockerStatus: blocker?.status || "pending",
    hasEvidence: hasEvidence(blocker),
    reason: approved
      ? "Blocker is approved of not_applicable."
      : "Blocker heeft nog geen approved/not_applicable status.",
  };
}

export function validateEnvironmentVariables() {
  const providerStatus = getActiveProviderStatus();
  const envBlocker = mapBlockerToReadiness("env_vars_verified");
  const checks = [
    { key: "SUPABASE_URL", label: "Supabase URL", present: providerStatus.supabaseUrlPresent, scope: "browser-safe" },
    { key: "SUPABASE_ANON_KEY", label: "Supabase anon key", present: providerStatus.supabaseAnonKeyPresent, scope: "browser-safe" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role key", present: envBlocker.status === READY, scope: "server-only checklist" },
    { key: "RESEND_API_KEY", label: "Resend API key", present: envBlocker.status === READY, scope: "server-only checklist" },
    { key: "MOLLIE_API_KEY", label: "Mollie API key", present: envBlocker.status === READY, scope: "server-only checklist" },
  ];
  const ready = checks.filter((check) => check.scope === "browser-safe").every((check) => check.present) && envBlocker.status === READY;
  return {
    status: ready ? READY : NOT_READY,
    checks,
    blocker: envBlocker,
    reason: ready
      ? "Browser-safe Supabase env vars zijn aanwezig en server-side env checklist is approved."
      : "Environment variables zijn nog niet volledig bevestigd via checklist.",
  };
}

export function validateSupabaseProject() {
  const providerStatus = getActiveProviderStatus();
  const ready = Boolean(providerStatus.supabaseConfigured && providerStatus.supabaseProjectIdPresent);
  return {
    status: ready ? READY : NOT_READY,
    environment: providerStatus.environment,
    providerMode: providerStatus.providerMode,
    supabaseConfigured: providerStatus.supabaseConfigured,
    projectIdPresent: providerStatus.supabaseProjectIdPresent,
    readOnlyEnabled: providerStatus.readOnlyEnabled,
    liveDatabaseActive: false,
    reason: ready
      ? "Supabase testprojectconfiguratie is herkenbaar. Live database blijft uit."
      : "Supabase testprojectconfiguratie is nog niet volledig herkenbaar.",
  };
}

export function validateCanonicalSchemaPresence() {
  const rlsBlocker = mapBlockerToReadiness("rls_test_log_completed");
  return {
    status: rlsBlocker.status === READY ? READY : NOT_READY,
    plannedSchema: "supabase/schema.sql",
    canonicalTables: ["customers", "websites", "projects", "quotes", "invoices", "subscriptions", "profiles"],
    verifiedInTestEnvironment: rlsBlocker.status === READY,
    blocker: rlsBlocker,
    reason: rlsBlocker.status === READY
      ? "Canonical schema is via testlog gevalideerd."
      : "Canonical schema is gedocumenteerd, maar nog niet bewezen in een testomgeving.",
  };
}

export function validateDeploymentBundle() {
  const bundle = getDeploymentBundleValidation();
  return {
    status: bundle.status === "Ready" ? READY : NOT_READY,
    requirements: bundle.requirements,
    documents: bundle.documents,
    reason: bundle.note,
  };
}

export function validateDeploymentOrder() {
  return {
    status: READY,
    order: SQL_EXECUTION_ORDER.map((step, index) => ({
      ...step,
      position: index + 1,
      status: READY,
    })),
    reason: "De volgorde is logisch vastgelegd. Deze validator voert geen SQL uit.",
  };
}

export function getEnvironmentSummary() {
  const bundle = validateDeploymentBundle();
  const schema = validateCanonicalSchemaPresence();
  const auth = mapBlockerToReadiness("auth_test_completed");
  const isolation = mapBlockerToReadiness("customer_isolation_test_completed");
  const blockers = getDeploymentGoNoGoStatus();
  return {
    generatedAt: new Date().toISOString(),
    areas: PRODUCTION_VALIDATION_AREAS.map((area) => {
      if (area.source === "bundle") return { ...area, status: bundle.status === READY ? "Ready" : "Blocked", reason: bundle.reason };
      if (area.source === "schema") return { ...area, status: schema.status === READY ? "Ready" : "Blocked", reason: schema.reason };
      if (area.source === "auth_test_completed") return { ...area, status: auth.status === READY ? "Ready" : "Blocked", reason: auth.reason };
      if (area.source === "customer_isolation_test_completed") return { ...area, status: isolation.status === READY ? "Ready" : "Blocked", reason: isolation.reason };
      if (area.source === "blockers") return { ...area, status: blockers.decision === "GO" ? "Ready" : "Blocked", reason: blockers.reason };
      return { ...area, status: "Pending", reason: "Nog handmatig te testen in de Supabase testomgeving." };
    }),
    blockers,
  };
}

export function getTestEnvironmentStatus() {
  const environment = validateSupabaseProject();
  const envVars = validateEnvironmentVariables();
  const schema = validateCanonicalSchemaPresence();
  const bundle = validateDeploymentBundle();
  const order = validateDeploymentOrder();
  const rollback = mapBlockerToReadiness("rollback_plan_approved");
  const goNoGo = getDeploymentGoNoGoStatus();
  const checklist = getDeploymentChecklist();
  const ready = [environment, envVars, schema, bundle, order, rollback].every((item) => item.status === READY)
    && goNoGo.decision === "GO";
  return {
    generatedAt: new Date().toISOString(),
    status: ready ? READY : NOT_READY,
    environment,
    environmentVariables: envVars,
    canonicalSchema: schema,
    deploymentBundle: bundle,
    deploymentOrder: order,
    rollback,
    goNoGo: {
      status: goNoGo.decision === "GO" ? READY : BLOCKED,
      decision: goNoGo.decision,
      reason: goNoGo.reason,
      blockers: goNoGo.blockers,
    },
    checklist,
    blockerReadiness: getDeploymentBlockers().map((blocker) => ({
      id: blocker.id,
      title: blocker.title,
      status: isApproved(blocker) ? READY : NOT_READY,
      blockerStatus: blocker.status,
      hasEvidence: hasEvidence(blocker),
      evidenceSummary: blocker.evidence ? blocker.evidence.slice(0, 160) : "",
      notesSummary: blocker.notes ? blocker.notes.slice(0, 160) : "",
    })),
  };
}

export const testEnvironmentService = {
  getTestEnvironmentStatus,
  validateEnvironmentVariables,
  validateSupabaseProject,
  validateCanonicalSchemaPresence,
  validateDeploymentBundle,
  validateDeploymentOrder,
  getEnvironmentSummary,
};
