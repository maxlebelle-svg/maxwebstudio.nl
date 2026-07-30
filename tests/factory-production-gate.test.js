const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { definitionsFor, fingerprintFor, normalizeSupplierResult, summarizeGate } = require("../functions/_factory-production-gate");
const { collectSupplierResults } = require("../functions/_factory-production-gate-suppliers");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const project = {
  id: "d9428888-122b-4f2c-9291-31bdf2f21f25", relationship_type: "customer", relationship_id: "ca000000-0000-4000-8000-000000000101",
  factory_type: "website", blueprint_key: "website-service-v1", blueprint_version: 1, updated_at: "2026-07-30T12:00:00.000Z", configuration: {},
  gate_generation: 7, gate_generation_id: "70000000-0000-4000-8000-000000000007",
};
const actor = { profileId: "20000000-0000-4000-8000-000000000001", authUserId: "10000000-0000-4000-8000-000000000001", role: "admin" };
const bound = (row) => ({ ...row, project_generation: project.gate_generation, project_generation_id: project.gate_generation_id, project_generation_fingerprint: "f".repeat(64) });

test("generic Gate has exactly five server-owned required suppliers", () => {
  const checks = definitionsFor(project);
  assert.deepEqual(checks.map((item) => item.key), ["product_ready", "domain_mapping", "ssl_active", "internal_approval", "customer_approval"]);
  assert.deepEqual(checks.find((item) => item.key === "internal_approval").allowedAttestorRoles, ["super_admin"]);
  assert.equal(checks.find((item) => item.key === "customer_approval").provider, "customer_approval_registry");
});

test("caller cannot choose supplier, status, fingerprint or expiry", () => {
  const definition = definitionsFor(project)[0];
  assert.throws(() => normalizeSupplierResult(project, definition.key, "attacker", { status: "passed", evidence: {} }), { code: "SUPPLIER_MISMATCH" });
  assert.throws(() => normalizeSupplierResult(project, definition.key, definition.provider, { status: "passed", evidence: { summary: "Claim", artifactRef: "fake" } }), { code: "SUPPLIER_EVIDENCE_INVALID" });
  const report = normalizeSupplierResult(project, definition.key, definition.provider, { status: "missing", trustedSnapshot: { found: false }, blockingError: "Canonical record missing" }, new Date("2026-07-30T12:00:00Z"));
  assert.equal(report.status, "missing");
  assert.match(report.input_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(report.expires_at, null);
});

test("supplier snapshot changes the server-derived fingerprint", () => {
  const definition = definitionsFor(project)[0];
  assert.notEqual(fingerprintFor(project, definition, { version: 1 }), fingerprintFor(project, definition, { version: 2 }));
});

test("missing, failed and expired checks block while all-green is only technically ready", () => {
  const now = new Date("2026-07-30T12:00:00Z");
  const definitions = definitionsFor(project);
  const missing = definitions.map((item) => bound(normalizeSupplierResult(project, item.key, item.provider, { status: "missing", blockingError: "Missing" }, now)));
  missing[1] = bound(normalizeSupplierResult(project, definitions[1].key, definitions[1].provider, { status: "failed", blockingError: "Failed" }, now));
  assert.equal(summarizeGate(project, missing, [], now).canGoLive, false);
  const passed = definitions.map((item) => bound(normalizeSupplierResult(project, item.key, item.provider, {
    status: "passed", trustedSnapshot: { key: item.key }, evidence: { summary: "Trusted", artifactRef: `db://trusted/${item.key}`, observedAt: now.toISOString() },
  }, now)));
  const green = summarizeGate(project, passed, [], now);
  assert.equal(green.strictCanGoLive, true);
  assert.equal(green.releaseMode, "standard");
  assert.equal(project.status, undefined);
  assert.equal(summarizeGate(project, passed, [], new Date("2026-08-02T12:00:00Z")).canGoLive, false);
});

test("unbound historical evidence and overrides always fail closed", () => {
  const rows = definitionsFor(project).map((item) => normalizeSupplierResult(project, item.key, item.provider, {
    status: "passed", trustedSnapshot: { proven: true }, evidence: { summary: "Trusted", artifactRef: `db://trusted/${item.key}`, observedAt: "2026-07-30T12:00:00Z" },
  }, new Date("2026-07-30T12:00:00Z")));
  const override = { id: "override-1", status: "active", reason: "Controlled exception reason", open_risks: ["Proof absent"], created_at: "2026-07-30T12:00:00Z" };
  const summary = summarizeGate(project, rows, [override], new Date("2026-07-30T12:01:00Z"));
  assert.equal(summary.bindingComplete, false);
  assert.equal(summary.canGoLive, false);
  assert.equal(summary.releaseMode, "blocked");
});

test("generic suppliers use only canonical Factory, domain and approval sources", async () => {
  const rows = await collectSupplierResults(project, actor, {
    readTable: async (table) => table === "factory_gate_attestations" ? [{ id: "a1", statement_version: "v1", statement_hash: "a".repeat(64) }]
      : table === "factory_customer_approvals" ? [{ id: "c1", statement_version: "v1", statement_hash: "b".repeat(64), approved_at: "2026-07-30T12:00:00Z" }]
        : table === "customer_websites" ? [{ id: "w1", domain: "example.test", ssl_status: "active", updated_at: "2026-07-30T12:00:00Z" }] : [],
  }, new Date("2026-07-30T12:00:00Z"));
  const byKey = new Map(rows.map((row) => [row.check_key, row]));
  assert.equal(rows.length, 5);
  assert.equal(byKey.get("product_ready").status, "not_configured");
  assert.equal(byKey.get("domain_mapping").status, "passed");
  assert.equal(byKey.get("ssl_active").status, "passed");
  assert.equal(byKey.get("internal_approval").status, "passed");
  assert.equal(byKey.get("customer_approval").status, "passed");
});

test("schema and server enforce generation, replay, audit and caller-evidence contracts", () => {
  const baseSql = read("supabase/migrations/20260729200000_factory_production_gate.sql");
  const hardening = read("supabase/migrations/20260730120000_harden_factory_gate_generation_and_audit.sql");
  const handler = read("functions/admin-factory-projects.js");
  assert.match(baseSql, /factory_projects_block_ungated_live/);
  assert.match(baseSql, /factory_gate_events_no_update/);
  assert.match(baseSql, /superadmin_required_for_override/);
  assert.match(hardening, /factory_begin_gate_generation_v1/);
  assert.match(hardening, /factory_store_gate_checks_v1/);
  assert.match(hardening, /stale_or_unbound_gate_evidence/);
  assert.match(hardening, /project_generation_fingerprint/);
  assert.match(hardening, /previousStatus/);
  assert.match(hardening, /newStatus/);
  assert.match(hardening, /revoke insert on public\.factory_gate_checks from service_role/);
  assert.match(handler, /CALLER_EVIDENCE_REJECTED/);
  assert.match(handler, /collectSupplierResults/);
  for (const marker of ["normalizeReport", "fo" + "od", "silver" + "ado"]) assert.equal(handler.toLowerCase().includes(marker.toLowerCase()), false, marker);
});

test("certified Gate migration hashes remain exact", () => {
  const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
  assert.equal(sha("supabase/migrations/20260729200000_factory_production_gate.sql"), "830e113abb432417d50262ef45f48a390e2cbd900a5a45c2fb1faeb6360132d5");
  assert.equal(sha("supabase/migrations/20260730120000_harden_factory_gate_generation_and_audit.sql"), "22fa7f5f39a74e662134c825eb2feff3313f0c281d99107add7c9ca0173819ea");
});

test("isolated PostgreSQL validator covers direct SQL, tenant and replay attacks", () => {
  const script = read("scripts/factory-production-gate-local-validation.zsh");
  const functional = read("tests/fixtures/factory-production-gate-functional.sql");
  const generation = read("tests/fixtures/factory-production-gate-generation-functional.sql");
  assert.match(script, /listen_addresses=''/);
  assert.match(script, /remote environment variable forbidden/);
  assert.match(functional, /direct live update unexpectedly allowed/);
  assert.match(functional, /cross-tenant customer approval unexpectedly allowed/);
  assert.match(generation, /current caller timestamp rescued stale generation/);
  assert.match(generation, /override replaced unbound technical truth/);
  assert.match(generation, /live authorization replay emitted/);
});
