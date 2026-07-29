const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { definitionsFor, fingerprintFor, normalizeSupplierResult, summarizeGate } = require("../functions/_factory-production-gate");
const { collectSupplierResults } = require("../functions/_factory-production-gate-suppliers");

const root = path.resolve(__dirname, "..");
const project = {
  id: "d9428888-122b-4f2c-9291-31bdf2f21f25", relationship_type: "customer", relationship_id: "ca000000-0000-4000-8000-000000000101",
  factory_type: "food", blueprint_key: "food-pickup-v1", blueprint_version: 1, updated_at: "2026-07-29T18:00:00.000Z", configuration: {},
  gate_generation: 7, gate_generation_id: "70000000-0000-4000-8000-000000000007",
};
const actor = { profileId: "20000000-0000-4000-8000-000000000001", authUserId: "10000000-0000-4000-8000-000000000001", role: "admin" };
const bound = (row) => ({ ...row, project_generation: project.gate_generation, project_generation_id: project.gate_generation_id, project_generation_fingerprint: "f".repeat(64) });

test("Food Gate has fifteen allowlisted suppliers and consciously blocking production sources", () => {
  const checks = definitionsFor(project);
  assert.equal(checks.length, 15);
  assert.equal(new Set(checks.map((item) => item.provider)).size, 10);
  assert.equal(checks.find((item) => item.key === "customer_approval").provider, "customer_approval_registry");
  assert.equal(checks.find((item) => item.key === "mollie_connected").provider, "commerce");
  assert.deepEqual(checks.find((item) => item.key === "internal_approval").allowedAttestorRoles, ["super_admin"]);
});

test("caller cannot choose supplier, status, fingerprint or expiry", () => {
  const definition = definitionsFor(project)[0];
  assert.throws(() => normalizeSupplierResult(project, definition.key, "attacker", { status: "passed", evidence: {} }), { code: "SUPPLIER_MISMATCH" });
  assert.throws(() => normalizeSupplierResult(project, definition.key, definition.provider, { status: "passed", evidence: { summary: "Claim", artifactRef: "fake" } }), { code: "SUPPLIER_EVIDENCE_INVALID" });
  const report = normalizeSupplierResult(project, definition.key, definition.provider, { status: "missing", trustedSnapshot: { found: false }, blockingError: "Canonical record missing" }, new Date("2026-07-29T20:00:00Z"));
  assert.equal(report.status, "missing");
  assert.match(report.input_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(report.expires_at, null);
});

test("supplier snapshot changes the fingerprint", () => {
  const definition = definitionsFor(project)[0];
  assert.notEqual(fingerprintFor(project, definition, { version: 1 }), fingerprintFor(project, definition, { version: 2 }));
});

test("Gate remains blocked for missing, not-configured, failed and expired suppliers", () => {
  const now = new Date("2026-07-29T20:00:00Z");
  const reports = definitionsFor(project).map((item) => normalizeSupplierResult(project, item.key, item.provider, { status: "missing", blockingError: "Missing" }, now));
  reports[0] = normalizeSupplierResult(project, definitionsFor(project)[0].key, definitionsFor(project)[0].provider, { status: "not_configured", blockingError: "Not configured" }, now);
  reports[1] = normalizeSupplierResult(project, definitionsFor(project)[1].key, definitionsFor(project)[1].provider, { status: "failed", blockingError: "Failed" }, now);
  const summary = summarizeGate(project, reports.map(bound), [], now);
  assert.equal(summary.canGoLive, false);
  assert.equal(summary.progress, 0);
  assert.equal(summary.counts.blocking, 15);
});

test("only newest append-only supplier result determines current state and TTL expiry blocks", () => {
  const definition = definitionsFor(project)[0];
  const oldMissing = normalizeSupplierResult(project, definition.key, definition.provider, { status: "missing", blockingError: "Old missing" }, new Date("2026-07-29T18:00:00Z"));
  const latestPass = normalizeSupplierResult(project, definition.key, definition.provider, { status: "passed", trustedSnapshot: { id: 1 }, evidence: { summary: "Trusted", artifactRef: "db://trusted/1", observedAt: "2026-07-29T19:00:00Z" } }, new Date("2026-07-29T19:00:00Z"));
  assert.equal(summarizeGate(project, [bound(oldMissing), bound(latestPass)], [], new Date("2026-07-29T20:00:00Z")).checks[0].effectiveStatus, "passed");
  assert.equal(summarizeGate(project, [bound(oldMissing), bound(latestPass)], [], new Date("2026-07-31T20:00:00Z")).checks[0].effectiveStatus, "expired");
});

test("real suppliers read canonical sources and leave absent sources blocking", async () => {
  const rows = await collectSupplierResults(project, actor, {
    rpc: async (name) => name === "food_demo_bundle_read_v1" ? [{ id: "bundle-1", factory_project_id: project.id, demo_type: "food", blueprint_key: "silverado-food-v1", blueprint_version: 1, invitation_status: "ready", storefront_status: "reachable", dashboard_status: "reachable", storefront_url: "https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord", metadata: { runtimeFrozen: true, selfServiceAccountProven: false }, updated_at: "2026-07-29T19:00:00Z" }] : [],
    readTable: async () => [],
    probeUrl: async () => ({ ok: true, status: 200, body: '<meta name="viewport" content="width=device-width, initial-scale=1">' }),
  }, new Date("2026-07-29T20:00:00Z"));
  const byKey = new Map(rows.map((row) => [row.check_key, row]));
  assert.equal(byKey.get("restaurant_tenant").status, "passed");
  assert.equal(byKey.get("order_route").status, "passed");
  assert.equal(byKey.get("dashboard_view").status, "passed");
  assert.equal(byKey.get("mobile_validation").status, "passed");
  assert.equal(byKey.get("environment_mode").status, "passed");
  assert.equal(byKey.get("manager_tenant_isolation").status, "missing");
  for (const key of ["menu_opening_hours","domain_mapping","dns_verified","ssl_active","business_email_preserved","mollie_connected","legal_set","internal_approval","customer_approval"]) assert.notEqual(byKey.get(key).status, "passed", key);
});

test("override is visible and cannot replace unbound or missing checks", () => {
  const override = { id: "override-1", status: "active", reason: "Bewuste tijdelijke live-uitzondering", open_risks: ["SSL nog in uitgifte"], created_by: "profile-1", created_at: "2026-07-29T18:00:00Z" };
  const summary = summarizeGate(project, [], [override], new Date("2026-07-29T19:00:00Z"));
  assert.equal(summary.releaseMode, "blocked");
  assert.equal(summary.bindingComplete, false);
  assert.equal(summary.canGoLive, false);
  assert.equal(summary.progress, 0);
  assert.equal(summary.counts.blocking, 15);
});

test("schema, server and UI enforce suppliers, append-only evidence and database preflight", () => {
  const sqlPath = path.join(root, "docs/release-readiness/factory-production-gate-v1/20260729200000_factory_production_gate.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const hardening = fs.readFileSync(path.join(root, "docs/release-readiness/factory-production-gate-v1/20260730120000_harden_factory_gate_generation_and_audit.sql"), "utf8");
  const handler = fs.readFileSync(path.join(root, "functions/admin-factory-projects.js"), "utf8");
  const suppliers = fs.readFileSync(path.join(root, "functions/_factory-production-gate-suppliers.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "public/admin/ui/factory-hub.js"), "utf8");
  assert.match(sql, /factory_gate_checks_no_update/);
  assert.match(sql, /factory_customer_approvals_no_update/);
  assert.match(sql, /factory_projects_block_ungated_live/);
  assert.match(sql, /superadmin_required_for_override/);
  assert.match(hardening, /factory_begin_gate_generation_v1/);
  assert.match(hardening, /factory_store_gate_checks_v1/);
  assert.match(hardening, /stale_or_unbound_gate_evidence/);
  assert.match(hardening, /project_generation_fingerprint/);
  assert.match(hardening, /previousStatus/);
  assert.match(hardening, /newStatus/);
  assert.match(hardening, /revoke insert on public\.factory_gate_checks from service_role/);
  assert.match(handler, /CALLER_EVIDENCE_REJECTED/);
  assert.doesNotMatch(handler, /normalizeReport/);
  assert.match(handler, /collectSupplierResults/);
  assert.match(suppliers, /food_demo_bundle_read_v1/);
  assert.match(ui, /Definitief live zetten/);
  assert.match(ui, /LIVE VIA UITZONDERING/);
});

test("release fileset checksum stays exact", () => {
  const sqlPath = path.join(root, "docs/release-readiness/factory-production-gate-v1/20260729200000_factory_production_gate.sql");
  const fileset = JSON.parse(fs.readFileSync(path.join(root, "docs/release-readiness/factory-production-gate-v1/FILESET.json"), "utf8"));
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(sqlPath)).digest("hex"), fileset.files[0].sha256);
  const hardeningPath = path.join(root, "docs/release-readiness/factory-production-gate-v1/20260730120000_harden_factory_gate_generation_and_audit.sql");
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(hardeningPath)).digest("hex"), fileset.files[1].sha256);
});

test("local PostgreSQL validator is isolated and covers direct SQL and RPC attacks", () => {
  const script = fs.readFileSync(path.join(root, "scripts/factory-production-gate-local-validation.zsh"), "utf8");
  const fixture = fs.readFileSync(path.join(root, "tests/fixtures/factory-production-gate-functional.sql"), "utf8");
  assert.match(script, /listen_addresses=''/);
  assert.match(script, /remote environment variable forbidden/);
  assert.match(fixture, /direct live update unexpectedly allowed/);
  assert.match(fixture, /caller-supplied evidence insert unexpectedly allowed/);
  assert.match(fixture, /cross-tenant customer approval unexpectedly allowed/);
  assert.match(fixture, /LIVE VIA UITZONDERING audit missing/);
  const generationFixture = fs.readFileSync(path.join(root, "tests/fixtures/factory-production-gate-generation-functional.sql"), "utf8");
  assert.match(generationFixture, /current caller timestamp rescued stale generation/);
  assert.match(generationFixture, /override replaced unbound technical truth/);
  assert.match(generationFixture, /live authorization replay emitted/);
});

test("unbound historical evidence fails closed even when every result says passed", () => {
  const rows = definitionsFor(project).map((item) => normalizeSupplierResult(project, item.key, item.provider, {
    status: "passed", trustedSnapshot: { proven: true }, evidence: { summary: "Trusted", artifactRef: `db://trusted/${item.key}`, observedAt: "2026-07-30T12:00:00Z" },
  }, new Date("2026-07-30T12:00:00Z")));
  const summary = summarizeGate(project, rows, [], new Date("2026-07-30T12:01:00Z"));
  assert.equal(summary.bindingComplete, false);
  assert.equal(summary.canGoLive, false);
  assert.equal(summary.counts.blocking, 15);
});
