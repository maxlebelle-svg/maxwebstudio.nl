#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://maxwebstudio.nl";
const DEFAULT_TABLES = [
  "profiles",
  "customers",
  "websites",
  "projects",
  "leads",
  "customer_invoices",
  "customer_subscriptions",
  "customer_timeline_events",
];

const ENV_GROUPS = {
  general: ["P0_BASE_URL", "P0_TEST_RUN_ID", "P0_ENABLE_MUTATIONS", "P0_SUPABASE_URL", "P0_SUPABASE_ANON_KEY"],
  "rls-ab": ["P0_CUSTOMER_A_JWT", "P0_CUSTOMER_B_JWT", "P0_CUSTOMER_A_ID", "P0_CUSTOMER_B_ID", "P0_RLS_TABLES_JSON", "P0_RLS_READ_CASES_JSON", "P0_RLS_WRITE_CASES_JSON"],
  storage: ["P0_STORAGE_BUCKET", "P0_STORAGE_A_PATH", "P0_STORAGE_B_PATH"],
  "commercial-order": ["P0_ADMIN_JWT", "P0_TEST_CUSTOMER_EMAIL", "P0_COMMERCIAL_ORDER_PAYLOAD_JSON"],
  sales: ["P0_SALES_A_JWT", "P0_SALES_B_JWT", "P0_SALES_CASES_JSON"],
};

const RUNNABLE_GROUPS = {
  "rls-ab": ["P0_CUSTOMER_A_JWT", "P0_CUSTOMER_B_JWT"],
  storage: ["P0_CUSTOMER_A_JWT", "P0_CUSTOMER_B_JWT", "P0_STORAGE_BUCKET", "P0_STORAGE_A_PATH"],
  "commercial-order": ["P0_ADMIN_JWT"],
  sales: ["P0_SALES_A_JWT", "P0_SALES_B_JWT", "P0_SALES_CASES_JSON"],
};

const state = {
  checks: [],
  startedAt: new Date().toISOString(),
  runId: env("P0_TEST_RUN_ID") || `p0-${new Date().toISOString().replace(/[:.]/g, "-")}`,
};

const mode = process.argv[2] || "all";

main().catch((error) => {
  addCheck("harness", "fatal", "fail", error.message);
  finish(1);
});

async function main() {
  if (["help", "--help", "-h"].includes(mode)) {
    printHelp();
    return;
  }

  if (["all", "preflight"].includes(mode)) await preflight();
  if (["all", "api"].includes(mode)) await apiBoundaryTests();
  if (["all", "anon-rls"].includes(mode)) await anonRlsSmoke();
  if (["all", "rls-ab"].includes(mode)) await rlsAbTests();
  if (["all", "storage"].includes(mode)) await storageTests();
  if (["all", "commercial-order"].includes(mode)) await commercialOrderTests();
  if (["all", "sales"].includes(mode)) await salesAssignmentTests();

  finish(hasFailures() ? 1 : 0);
}

function printHelp() {
  console.log(`Max Webstudio P0 test harness

Usage:
  node scripts/p0-test-harness.mjs [all|preflight|api|anon-rls|rls-ab|storage|commercial-order|sales]

Default mode is "all". Tests that require credentials are skipped until the documented P0_* env vars are present.
Secrets are never printed.
`);
}

async function preflight() {
  const baseUrl = base();
  addCheck("preflight", "base-url", "info", baseUrl);
  const config = await publicAuthConfig();
  addCheck("preflight", "client-auth-config", config.status === 200 ? "pass" : "fail", `status ${config.status}`);
  if (config.body) {
    addCheck("preflight", "supabase-url-present", config.body.hasSupabaseUrl ? "pass" : "fail", String(config.body.hasSupabaseUrl));
    addCheck("preflight", "supabase-anon-key-present", config.body.hasAnonKey ? "pass" : "fail", String(config.body.hasAnonKey));
    addCheck("preflight", "client-portal-auth-live", config.body.clientPortalAuthLive ? "pass" : "warn", String(config.body.clientPortalAuthLive));
  }
  const guard = await fetchText(`${baseUrl}/src/admin-route-guard.js?v=20260710-p0-validation`);
  addCheck("preflight", "admin-route-guard-asset", guard.status === 200 && guard.text.includes("requireAuth") ? "pass" : "fail", `status ${guard.status}`);
  preflightEnvironment();
}

async function apiBoundaryTests() {
  const baseUrl = base();
  const legacy = await fetchJson(`${baseUrl}/api/create-payment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  addCheck("api", "legacy-create-payment-closed", legacy.status === 410 ? "pass" : "fail", `status ${legacy.status}`);

  const commercial = await fetchJson(`${baseUrl}/api/commercial-order`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  addCheck("api", "commercial-order-requires-admin", commercial.status === 401 ? "pass" : "fail", `status ${commercial.status}`);

  const adminLeads = await fetchJson(`${baseUrl}/api/admin-leads`);
  addCheck("api", "admin-leads-requires-admin", adminLeads.status === 401 ? "pass" : "fail", `status ${adminLeads.status}`);
}

async function anonRlsSmoke() {
  const config = await supabaseRuntimeConfig();
  if (!config.ready) {
    addCheck("anon-rls", "runtime-config", "skip", config.reason);
    return;
  }
  const tables = jsonEnv("P0_RLS_TABLES_JSON", DEFAULT_TABLES);
  for (const table of tables) {
    const result = await supabaseRest(config, table, "select=id&limit=1", config.anonKey);
    const rows = Array.isArray(result.body) ? result.body.length : null;
    const safe = [401, 403, 404].includes(result.status) || (result.status === 200 && rows === 0);
    addCheck("anon-rls", `anon-select-${table}`, safe ? "pass" : "fail", `status ${result.status}, rows ${rows ?? "n/a"}`);
  }
}

async function rlsAbTests() {
  const config = await supabaseRuntimeConfig();
  const customerAJwt = env("P0_CUSTOMER_A_JWT");
  const customerBJwt = env("P0_CUSTOMER_B_JWT");
  if (!config.ready || !customerAJwt || !customerBJwt) {
    addCheck("rls-ab", "credentials", "skip", "Set P0_CUSTOMER_A_JWT and P0_CUSTOMER_B_JWT to run tenant A/B tests.");
    return;
  }

  const readCases = jsonEnv("P0_RLS_READ_CASES_JSON", defaultRlsReadCases());
  for (const testCase of readCases) {
    const token = testCase.actor === "B" ? customerBJwt : customerAJwt;
    const query = `${testCase.select || "select=id"}&${testCase.filter || ""}`.replace(/&$/, "");
    const result = await supabaseRest(config, testCase.table, query, token);
    const rows = Array.isArray(result.body) ? result.body.length : null;
    const expected = testCase.expect || "zero-or-denied";
    const pass = expected === "one-or-more"
      ? result.status === 200 && rows > 0
      : [401, 403, 404].includes(result.status) || (result.status === 200 && rows === 0);
    addCheck("rls-ab", testCase.name || `${testCase.actor || "A"}-${testCase.table}`, pass ? "pass" : "fail", `status ${result.status}, rows ${rows ?? "n/a"}`);
  }

  if (!mutationsEnabled()) {
    addCheck("rls-ab", "write-cases", "skip", "Set P0_ENABLE_MUTATIONS=true and P0_RLS_WRITE_CASES_JSON for INSERT/UPDATE/DELETE tests.");
    return;
  }

  const writeCases = jsonEnv("P0_RLS_WRITE_CASES_JSON", []);
  for (const testCase of writeCases) {
    const token = testCase.actor === "B" ? customerBJwt : customerAJwt;
    const result = await supabaseRest(config, testCase.table, testCase.query || "", token, {
      method: testCase.method || "POST",
      body: testCase.body ? JSON.stringify(testCase.body) : undefined,
      headers: testCase.method === "DELETE" ? {} : { "content-type": "application/json", prefer: "return=representation" },
    });
    const pass = (testCase.expectStatus || [401, 403]).includes(result.status);
    addCheck("rls-ab", testCase.name || `${testCase.method}-${testCase.table}`, pass ? "pass" : "fail", `status ${result.status}`);
  }
}

async function storageTests() {
  const config = await supabaseRuntimeConfig();
  const customerAJwt = env("P0_CUSTOMER_A_JWT");
  const customerBJwt = env("P0_CUSTOMER_B_JWT");
  const bucket = env("P0_STORAGE_BUCKET");
  const pathA = env("P0_STORAGE_A_PATH");
  if (!config.ready || !customerAJwt || !customerBJwt || !bucket || !pathA) {
    addCheck("storage", "credentials", "skip", "Set P0_CUSTOMER_A_JWT, P0_CUSTOMER_B_JWT, P0_STORAGE_BUCKET and P0_STORAGE_A_PATH.");
    return;
  }

  const ownRead = await storageObject(config, bucket, pathA, customerAJwt);
  addCheck("storage", "customer-a-read-own", ownRead.status < 400 ? "pass" : "fail", `status ${ownRead.status}`);
  const crossRead = await storageObject(config, bucket, pathA, customerBJwt);
  addCheck("storage", "customer-b-read-a", crossRead.status >= 400 ? "pass" : "fail", `status ${crossRead.status}`);

  if (!mutationsEnabled()) {
    addCheck("storage", "write-delete-cases", "skip", "Set P0_ENABLE_MUTATIONS=true plus exact test paths for upload/delete checks.");
  }
}

async function commercialOrderTests() {
  const adminToken = env("P0_ADMIN_JWT");
  if (!adminToken) {
    addCheck("commercial-order", "admin-token", "skip", "Set P0_ADMIN_JWT to run authenticated order tests.");
    return;
  }

  const baseUrl = base();
  const invalidPackage = await postCommercialOrder(baseUrl, adminToken, {
    ...sampleCommercialPayload(),
    packageKey: "not-a-package",
  });
  addCheck("commercial-order", "unknown-package-rejected", invalidPackage.status === 400 ? "pass" : "fail", `status ${invalidPackage.status}`);

  const invalidOption = await postCommercialOrder(baseUrl, adminToken, {
    ...sampleCommercialPayload(),
    options: ["not-an-option"],
  });
  addCheck("commercial-order", "unknown-option-rejected", invalidOption.status === 400 ? "pass" : "fail", `status ${invalidOption.status}`);

  const noTerms = await postCommercialOrder(baseUrl, adminToken, {
    ...sampleCommercialPayload(),
    termsAccepted: false,
  });
  addCheck("commercial-order", "terms-required", noTerms.status === 400 ? "pass" : "fail", `status ${noTerms.status}`);

  if (!mutationsEnabled()) {
    addCheck("commercial-order", "positive-order", "skip", "Set P0_ENABLE_MUTATIONS=true before creating Mollie test payments.");
    return;
  }

  const payload = jsonEnv("P0_COMMERCIAL_ORDER_PAYLOAD_JSON", {
    ...sampleCommercialPayload(),
    packageKey: "starter",
    packagePrice: 1,
    options: ["seo"],
  });
  const order = await postCommercialOrder(baseUrl, adminToken, payload);
  const serverAmount = order.body?.totals?.packagePrice;
  addCheck("commercial-order", "frontend-package-price-ignored", order.status === 200 && serverAmount !== 1 ? "pass" : "fail", `status ${order.status}, server package ${serverAmount ?? "n/a"}`);
}

async function salesAssignmentTests() {
  const cases = jsonEnv("P0_SALES_CASES_JSON", []);
  if (!cases.length) {
    addCheck("sales", "cases", "skip", "Set P0_SALES_CASES_JSON with exact lead/action cases.");
    return;
  }
  const baseUrl = base();
  for (const testCase of cases) {
    const token = env(testCase.tokenEnv || "P0_SALES_A_JWT");
    if (!token) {
      addCheck("sales", testCase.name || "missing-token", "skip", `Missing ${testCase.tokenEnv || "P0_SALES_A_JWT"}.`);
      continue;
    }
    const result = await fetchJson(`${baseUrl}/api/admin-leads`, {
      method: testCase.method || "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(testCase.body || {}),
    });
    const expected = testCase.expectStatus || 200;
    addCheck("sales", testCase.name || "sales-case", result.status === expected ? "pass" : "fail", `status ${result.status}`);
  }
}

function defaultRlsReadCases() {
  const customerAId = env("P0_CUSTOMER_A_ID");
  const customerBId = env("P0_CUSTOMER_B_ID");
  if (!customerAId || !customerBId) return [];
  return [
    { name: "customer-a-own-customer", actor: "A", table: "customers", filter: `id=eq.${encodeURIComponent(customerAId)}`, expect: "one-or-more" },
    { name: "customer-a-cross-customer-b", actor: "A", table: "customers", filter: `id=eq.${encodeURIComponent(customerBId)}`, expect: "zero-or-denied" },
    { name: "customer-b-own-customer", actor: "B", table: "customers", filter: `id=eq.${encodeURIComponent(customerBId)}`, expect: "one-or-more" },
    { name: "customer-b-cross-customer-a", actor: "B", table: "customers", filter: `id=eq.${encodeURIComponent(customerAId)}`, expect: "zero-or-denied" },
  ];
}

function sampleCommercialPayload() {
  return {
    orderId: `${state.runId}-order`,
    name: "P0 Klant A",
    company: "P0 Testorganisatie A",
    email: env("P0_TEST_CUSTOMER_EMAIL") || "p0-klant-a@example.test",
    phone: "0612345678",
    domain: "p0-testorganisatie-a.example",
    packageKey: "starter",
    options: ["seo"],
    paymentChoice: "deposit",
    termsAccepted: true,
    termsAcceptedAt: new Date().toISOString(),
    notes: `P0 test run ${state.runId}`,
  };
}

async function postCommercialOrder(baseUrl, token, payload) {
  return fetchJson(`${baseUrl}/api/commercial-order`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

async function publicAuthConfig() {
  const response = await fetchJson(`${base()}/.netlify/functions/client-auth-config`);
  const body = response.body || {};
  return {
    status: response.status,
    body: {
      hasSupabaseUrl: Boolean(body.supabaseUrl || body.SUPABASE_URL),
      hasAnonKey: Boolean(body.supabaseAnonKey || body.SUPABASE_ANON_KEY),
      clientPortalAuthLive: Boolean(body.clientPortalAuthLive || body.CLIENT_PORTAL_AUTH_LIVE),
      appEnv: body.appEnv || body.APP_ENV || "",
      appEnvironment: body.appEnvironment || body.APP_ENVIRONMENT || "",
    },
    raw: body,
  };
}

async function supabaseRuntimeConfig() {
  const config = await publicAuthConfig();
  const raw = config.raw || {};
  const supabaseUrl = (env("P0_SUPABASE_URL") || raw.supabaseUrl || raw.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = env("P0_SUPABASE_ANON_KEY") || raw.supabaseAnonKey || raw.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !anonKey) return { ready: false, reason: "Supabase URL or anon key unavailable." };
  return { ready: true, supabaseUrl, anonKey };
}

async function supabaseRest(config, table, query, token, options = {}) {
  const url = `${config.supabaseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`;
  return fetchJson(url, {
    method: options.method || "GET",
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(options.headers || {}),
    },
    body: options.body,
  });
}

async function storageObject(config, bucket, objectPath, token, options = {}) {
  return fetchJson(`${config.supabaseUrl}/storage/v1/object/${bucket}/${objectPath.replace(/^\/+/, "")}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    body: options.body,
  });
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  return { status: response.status, text: await response.text() };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: response.status, body, headers: Object.fromEntries(response.headers.entries()) };
}

function addCheck(section, name, status, details = "") {
  state.checks.push({ section, name, status, details });
  console.log(`[${status.toUpperCase()}] ${section} / ${name}${details ? ` - ${details}` : ""}`);
}

function finish(exitCode) {
  const summary = state.checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ runId: state.runId, startedAt: state.startedAt, finishedAt: new Date().toISOString(), summary }, null, 2));
  process.exitCode = exitCode;
}

function hasFailures() {
  return state.checks.some((check) => check.status === "fail");
}

function base() {
  return (env("P0_BASE_URL") || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function env(name) {
  return process.env[name] || "";
}

function mutationsEnabled() {
  return env("P0_ENABLE_MUTATIONS").toLowerCase() === "true";
}

function jsonEnv(name, fallback) {
  const value = env(name);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    addCheck("config", name, "fail", `Invalid JSON: ${error.message}`);
    return fallback;
  }
}

function preflightEnvironment() {
  for (const [group, names] of Object.entries(ENV_GROUPS)) {
    const present = names.filter((name) => Boolean(env(name)));
    const missing = names.filter((name) => !env(name));
    addCheck("preflight-env", `${group}-present`, "info", present.length ? present.join(", ") : "none");
    addCheck("preflight-env", `${group}-missing`, missing.length ? "warn" : "pass", missing.length ? missing.join(", ") : "none");
  }

  for (const [group, required] of Object.entries(RUNNABLE_GROUPS)) {
    const missing = required.filter((name) => !env(name));
    const status = missing.length ? "skip" : "pass";
    addCheck("preflight-runnable", group, status, missing.length ? `missing ${missing.join(", ")}` : "ready");
  }

  if (mutationsEnabled() && !env("P0_TEST_RUN_ID")) {
    addCheck("preflight-consistency", "mutation-run-id", "warn", "P0_ENABLE_MUTATIONS=true without P0_TEST_RUN_ID.");
  }
  if (env("P0_RLS_WRITE_CASES_JSON") && !mutationsEnabled()) {
    addCheck("preflight-consistency", "write-cases-disabled", "warn", "P0_RLS_WRITE_CASES_JSON is set, but P0_ENABLE_MUTATIONS is not true.");
  }
  if (env("P0_STORAGE_B_PATH") && !env("P0_STORAGE_A_PATH")) {
    addCheck("preflight-consistency", "storage-paths", "warn", "P0_STORAGE_B_PATH is set without P0_STORAGE_A_PATH.");
  }
  if (env("P0_COMMERCIAL_ORDER_PAYLOAD_JSON") && !env("P0_ADMIN_JWT")) {
    addCheck("preflight-consistency", "commercial-payload-token", "warn", "P0_COMMERCIAL_ORDER_PAYLOAD_JSON is set without P0_ADMIN_JWT.");
  }
}
