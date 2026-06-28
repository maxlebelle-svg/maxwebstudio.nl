import { getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { getSupabaseClientStatus } from "../providers/supabaseClient.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { logActivity } from "./activityLogService.js";

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix = "write-test") {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function isDeveloperModeEnabled() {
  const settings = readJson(STORAGE_KEYS.settings, {});
  return Boolean(settings?.developerMode);
}

function lastReadOnlyTest() {
  return readJson(STORAGE_KEYS.lastSupabaseReadOnlyTest, null);
}

function logMigrationStep(step, status, payload = {}) {
  const entry = {
    id: createId(`customer-write-test-${step}`),
    type: `customer_write_test_${step}`,
    createdAt: nowIso(),
    step,
    status,
    table: "customers",
    testCustomerId: payload.testCustomerId || "",
    error: payload.error || "",
  };
  writeArray(STORAGE_KEYS.migrationLog, [entry, ...readArray(STORAGE_KEYS.migrationLog)].slice(0, 80));
  return entry;
}

function writeLatestResult(result) {
  writeJson(STORAGE_KEYS.lastSupabaseWriteTest, result);
  return result;
}

export function createSafeTestCustomer() {
  const createdAt = nowIso();
  return {
    id: createId("supabase-write-test-customer"),
    name: "Supabase Test",
    company_name: "Supabase Write Test Klant",
    email: "supabase-write-test@maxwebstudio.nl",
    phone: "0600000000",
    status: "test",
    is_demo: true,
    environment: "test",
    metadata: {
      createdBy: "supabase-write-test",
      safeToDelete: true,
    },
    created_at: createdAt,
    updated_at: createdAt,
  };
}

export function getWriteTestReadiness() {
  const supabase = getSupabaseClientStatus();
  const readOnly = lastReadOnlyTest();
  const providerMode = getCurrentProviderType();
  const missing = [];
  if (!supabase.hasUrl) missing.push("Supabase URL ontbreekt.");
  if (!supabase.hasAnonKey) missing.push("Supabase anon key ontbreekt.");
  if (!supabase.clientPackageAvailable) missing.push("Supabase client is niet geladen.");
  if (!readOnly?.success && !readOnly?.connected) missing.push("Read-only connection test is niet succesvol.");
  const customersReady = readOnly?.customersTableAccessible === true
    || (readOnly?.tableName === "customers" && readOnly?.success === true);
  if (!customersReady) missing.push("Customers table is niet read-only bevestigd.");
  if (providerMode !== PROVIDERS.SUPABASE_WRITE_TEST) missing.push("Provider mode is niet supabase-write-test.");
  if (!isDeveloperModeEnabled()) missing.push("Developer Mode staat niet aan.");
  return {
    allowed: missing.length === 0,
    missing,
    providerMode,
    developerMode: isDeveloperModeEnabled(),
    supabase,
    readOnly,
    latestResult: getLatestWriteTestResults(1)[0] || null,
  };
}

export async function createTestCustomer() {
  const readiness = getWriteTestReadiness();
  if (!readiness.allowed) throw new Error(`Write-test geblokkeerd: ${readiness.missing.join(" ")}`);
  const record = createSafeTestCustomer();
  logMigrationStep("started", "started", { testCustomerId: record.id });
  logActivity("developer_tools", "customers", "customer_write_test_started", { testCustomerId: record.id });
  try {
    const result = await supabaseProvider.create("customers", record);
    logMigrationStep("create", "success", { testCustomerId: result.data?.id || record.id });
    logActivity("developer_tools", "customers", "customer_write_test_create", { testCustomerId: result.data?.id || record.id });
    return writeLatestResult({
      id: createId("write-test-result"),
      status: "created",
      step: "create",
      testCustomerId: result.data?.id || record.id,
      createdAt: nowIso(),
      steps: [{ step: "create", status: "success" }],
      error: "",
    });
  } catch (error) {
    logMigrationStep("create", "failed", { testCustomerId: record.id, error: error.message });
    logActivity("developer_tools", "customers", "customer_write_test_failed", { step: "create", error: error.message });
    throw error;
  }
}

export async function updateTestCustomer(testCustomerId) {
  const readiness = getWriteTestReadiness();
  if (!readiness.allowed) throw new Error(`Write-test geblokkeerd: ${readiness.missing.join(" ")}`);
  const id = testCustomerId || readJson(STORAGE_KEYS.lastSupabaseWriteTest, {})?.testCustomerId;
  if (!id) throw new Error("Geen testCustomerId beschikbaar om te updaten.");
  const updatedAt = nowIso();
  try {
    const result = await supabaseProvider.update("customers", id, {
      status: "test_updated",
      updated_at: updatedAt,
      metadata: {
        updatedBy: "supabase-write-test",
        lastWriteTestUpdateAt: updatedAt,
      },
    });
    logMigrationStep("update", "success", { testCustomerId: id });
    logActivity("developer_tools", "customers", "customer_write_test_update", { testCustomerId: id });
    const latest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, {});
    return writeLatestResult({
      ...latest,
      status: "updated",
      step: "update",
      testCustomerId: id,
      updatedAt,
      steps: [...(latest.steps || []), { step: "update", status: "success" }],
      data: result.data,
      error: "",
    });
  } catch (error) {
    logMigrationStep("update", "failed", { testCustomerId: id, error: error.message });
    logActivity("developer_tools", "customers", "customer_write_test_failed", { step: "update", testCustomerId: id, error: error.message });
    throw error;
  }
}

export async function deleteTestCustomer(testCustomerId) {
  const readiness = getWriteTestReadiness();
  if (!readiness.allowed) throw new Error(`Write-test geblokkeerd: ${readiness.missing.join(" ")}`);
  const id = testCustomerId || readJson(STORAGE_KEYS.lastSupabaseWriteTest, {})?.testCustomerId;
  if (!id) throw new Error("Geen testCustomerId beschikbaar om te verwijderen.");
  try {
    const result = await supabaseProvider.delete("customers", id);
    logMigrationStep("delete", "success", { testCustomerId: id });
    logActivity("developer_tools", "customers", "customer_write_test_delete", { testCustomerId: id });
    const latest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, {});
    return writeLatestResult({
      ...latest,
      status: "deleted",
      step: "delete",
      testCustomerId: id,
      deletedAt: nowIso(),
      steps: [...(latest.steps || []), { step: "delete", status: "success" }],
      data: result.data,
      error: "",
    });
  } catch (error) {
    logMigrationStep("delete", "failed", { testCustomerId: id, error: error.message });
    logActivity("developer_tools", "customers", "customer_write_test_failed", { step: "delete", testCustomerId: id, error: error.message });
    throw error;
  }
}

export async function runFullCustomerWriteTest() {
  const runId = createId("full-customer-write-test");
  const steps = [];
  try {
    logMigrationStep("started", "started", { testCustomerId: runId });
    logActivity("developer_tools", "customers", "customer_write_test_started", { runId });
    const created = await createTestCustomer();
    steps.push({ step: "create", status: "success", testCustomerId: created.testCustomerId });
    const updated = await updateTestCustomer(created.testCustomerId);
    steps.push({ step: "update", status: "success", testCustomerId: updated.testCustomerId });
    const deleted = await deleteTestCustomer(created.testCustomerId);
    steps.push({ step: "delete", status: "success", testCustomerId: deleted.testCustomerId });
    const result = writeLatestResult({
      id: runId,
      type: "customer_write_test_full",
      status: "completed",
      testCustomerId: created.testCustomerId,
      createdAt: nowIso(),
      completedAt: nowIso(),
      steps,
      error: "",
    });
    logMigrationStep("completed", "success", { testCustomerId: created.testCustomerId });
    logActivity("developer_tools", "customers", "customer_write_test_completed", { runId, testCustomerId: created.testCustomerId });
    return result;
  } catch (error) {
    const result = writeLatestResult({
      id: runId,
      type: "customer_write_test_full",
      status: "failed",
      createdAt: nowIso(),
      completedAt: nowIso(),
      steps,
      error: error.message,
    });
    logMigrationStep("failed", "failed", { testCustomerId: runId, error: error.message });
    logActivity("developer_tools", "customers", "customer_write_test_failed", { runId, error: error.message });
    throw Object.assign(error, { result });
  }
}

export function getLatestWriteTestResults(limit = 5) {
  const latest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, null);
  const logs = readArray(STORAGE_KEYS.migrationLog).filter((entry) => String(entry.type || "").startsWith("customer_write_test"));
  return [latest, ...logs].filter(Boolean).slice(0, limit);
}
