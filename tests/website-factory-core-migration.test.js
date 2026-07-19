const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260719170000_create_website_factory_core.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const backend = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
const demoJourney = fs.readFileSync(path.join(root, "functions/demo-journey.js"), "utf8");

test("core migration is one explicit transaction and fails on conflicts", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/m);
  assert.deepEqual(
    [...migration.matchAll(/create table\s+public\.([a-z0-9_]+)/gi)].map((match) => match[1]),
    ["website_build_jobs", "website_preview_versions"],
  );
  assert.doesNotMatch(migration, /if not exists|create or replace|create extension/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.(leads|customers|demo_journeys)|mollie|resend|stripe|https?:\/\/|yxxahurphdbblkuxoeje|xlxpuuycigeqhgxqtzni/i);
});

test("build jobs have canonical states, ownership, idempotency and integrity", () => {
  for (const column of [
    "demo_journey_id", "lead_id", "customer_id", "status", "package_type",
    "generator_version", "request_fingerprint", "idempotency_key", "generated_package",
    "package_checksum", "error_phase", "error_code", "error_message", "created_by",
    "updated_by", "created_at", "updated_at",
  ]) assert.match(migration, new RegExp(`\\b${column}\\b`));
  assert.match(migration, /status in \('queued', 'running', 'succeeded', 'failed'\)/i);
  assert.match(migration, /unique \(demo_journey_id, request_fingerprint\)/i);
  assert.match(migration, /unique \(demo_journey_id, idempotency_key\)/i);
  assert.match(migration, /status <> 'succeeded'[\s\S]*generated_package[\s\S]*package_checksum/i);
  assert.match(migration, /lead_id[\s\S]*references public\.leads\(id\) on delete set null/i);
  assert.match(migration, /customer_id[\s\S]*references public\.customers\(id\) on delete set null/i);
});

test("preview versions are complete, unique, immutable and single-active", () => {
  assert.match(migration, /unique \(demo_journey_id, version\)/i);
  assert.match(migration, /unique \(build_job_id\)/i);
  assert.match(migration, /unique \(preview_token\)/i);
  assert.match(migration, /website_preview_versions_one_active_idx[\s\S]*where is_active/i);
  assert.match(migration, /website preview versions are immutable/i);
  assert.match(migration, /preview version must exactly match a succeeded build/i);
  assert.match(migration, /build_record\.generated_package is distinct from new\.generated_package/i);
  assert.match(migration, /build_record\.package_checksum is distinct from new\.package_checksum/i);
});

test("promotion locks, inserts before deactivation and updates the journey atomically", () => {
  assert.match(migration, /create function public\.promote_website_factory_preview/i);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/i);
  assert.match(migration, /where id = p_build_job_id\s+for update/i);
  assert.match(migration, /where id = build_record\.demo_journey_id\s+for update/i);
  const insertAt = migration.indexOf("insert into public.website_preview_versions");
  const deactivateAt = migration.indexOf("set is_active = false", insertAt);
  const activateAt = migration.indexOf("set is_active = true", deactivateAt);
  const journeyAt = migration.indexOf("update public.demo_journeys", activateAt);
  assert(insertAt > 0 && insertAt < deactivateAt && deactivateAt < activateAt && activateAt < journeyAt);
  assert.match(migration, /return query select[\s\S]*preview_record\.id[\s\S]*preview_record\.version[\s\S]*preview_record\.package_checksum/i);
});

test("RLS denies clients and service role can only promote previews through the RPC", () => {
  for (const table of ["website_build_jobs", "website_preview_versions"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all privileges on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, "i"));
  }
  assert.match(migration, /grant select, insert, update on table public\.website_build_jobs\s+to service_role/i);
  assert.match(migration, /grant select on table public\.website_preview_versions\s+to service_role/i);
  assert.doesNotMatch(migration, /grant[^;]*insert[^;]*website_preview_versions/i);
  assert.match(migration, /grant execute on function public\.promote_website_factory_preview/i);
});

test("backend reserves by fingerprint, persists checksum before promotion and uses the RPC response", () => {
  assert.match(backend, /factoryRequestFingerprint/);
  assert.match(backend, /readBuildJobByFingerprint/);
  assert.match(backend, /claimBuildJob/);
  assert.match(backend, /status: "succeeded"[\s\S]*generated_package: generatedPackage[\s\S]*package_checksum: packageChecksum/i);
  assert.match(backend, /rpc\/promote_website_factory_preview/);
  assert.match(backend, /createPreviewJourneyEventOnce[\s\S]*createJourneyEvent/i);
  assert.doesNotMatch(backend, /migration 019_ai_website_factory_v1/i);
  assert.doesNotMatch(demoJourney, /migration 019_ai_website_factory_v1/i);
});
