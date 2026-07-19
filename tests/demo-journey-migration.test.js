const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260719160000_create_demo_journey_workflow.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const backend = fs.readFileSync(path.join(root, "functions/demo-journey.js"), "utf8");
const previewBackend = fs.readFileSync(path.join(root, "functions/demo-preview.js"), "utf8");

test("migration creates only the canonical Demo Journey storage tables", () => {
  const tables = [...migration.matchAll(/create table\s+public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
  assert.deepEqual(tables, ["demo_journeys", "demo_journey_events"]);
  assert.doesNotMatch(migration, /create table\s+if not exists/i);
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/m);
  assert.doesNotMatch(migration, /if not exists|or replace/i);
});

test("lead, customer and event foreign keys use the reviewed delete behavior", () => {
  assert.match(migration, /foreign key \(lead_id\) references public\.leads\(id\) on delete set null/i);
  assert.match(migration, /foreign key \(customer_id\) references public\.customers\(id\) on delete set null/i);
  assert.match(migration, /foreign key \(demo_journey_id\) references public\.demo_journeys\(id\) on delete cascade/i);
});

test("relationship contract permits conversion and controlled manual identity", () => {
  assert.match(migration, /constraint demo_journeys_relationship_identity_check check/i);
  for (const expression of [
    "lead_id is not null",
    "customer_id is not null",
    "nullif(btrim(business_name), '') is not null",
    "nullif(btrim(contact_name), '') is not null",
    "nullif(btrim(email), '') is not null",
  ]) assert(migration.includes(expression));
  assert.match(migration, /Allows lead-only, customer-only, both during conversion/i);
});

test("preview tokens are non-empty and unique when present", () => {
  assert.match(migration, /demo_journeys_preview_token_check/i);
  assert.match(migration, /create unique index demo_journeys_preview_token_unique_idx[\s\S]*where preview_token is not null/i);
  assert.match(previewBackend, /const storedToken = cleanText\(row\.preview_token\)/);
  assert.match(backend, /crypto\.randomBytes\(16\)\.toString\("hex"\)/);
});

test("updated_at trigger is schema-qualified and uses a fixed search path", () => {
  assert.match(migration, /create function public\.set_demo_journey_updated_at\(\)/i);
  assert.match(migration, /set search_path = pg_catalog/i);
  assert.match(migration, /new\.updated_at := pg_catalog\.clock_timestamp\(\)/i);
  assert.match(migration, /execute function public\.set_demo_journey_updated_at\(\)/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("RLS and least-privilege grants deny direct client access", () => {
  for (const table of ["demo_journeys", "demo_journey_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all privileges on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, "i"));
  }
  assert.match(migration, /grant select, insert, update on table public\.demo_journeys\s+to service_role/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.demo_journey_events\s+to service_role/i);
  assert.equal((migration.match(/to anon, authenticated/gi) || []).length, 2);
  assert.equal((migration.match(/using \(false\)/gi) || []).length, 2);
  assert.equal((migration.match(/with check \(false\)/gi) || []).length, 2);
});

test("backend persistence columns are present or covered by its reviewed compatibility fallback", () => {
  const requiredColumns = [
    "id", "lead_id", "customer_id", "business_name", "contact_name", "email", "phone",
    "website_url", "demo_status", "generated_briefing", "preview_url", "preview_token",
    "preview_package", "preview_generated_at", "feedback", "internal_notes", "follow_up_at",
    "assigned_to", "email_flow_enabled", "last_email_status", "last_email_sent_at",
    "next_email_type", "created_by", "updated_by", "created_at", "updated_at",
  ];
  for (const column of requiredColumns) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, "i"), `missing backend column ${column}`);
  }
  for (const fallbackColumn of [
    "intake_json", "intake_summary", "intake_completeness", "asset_metadata",
    "approval_status", "preview_approved_by", "preview_approved_at",
    "delivery_approved_by", "delivery_approved_at",
  ]) {
    assert.match(backend, new RegExp(`\\b${fallbackColumn}\\b`), `backend fallback missing ${fallbackColumn}`);
    assert.doesNotMatch(migration, new RegExp(`\\b${fallbackColumn}\\b`, "i"), `out-of-scope column ${fallbackColumn}`);
  }
});

test("migration contains no Factory, payment, provider, test-data or production behavior", () => {
  for (const forbidden of [
    /website_build_jobs/i,
    /website_preview_versions/i,
    /project_workspaces/i,
    /client_email_flows/i,
    /customer_timeline_events/i,
    /mollie/i,
    /resend/i,
    /stripe/i,
    /net\.http/i,
    /https?:\/\//i,
    /insert\s+into/i,
    /update\s+public\./i,
    /delete\s+from/i,
    /yxxahurphdbblkuxoeje/i,
    /xlxpuuycigeqhgxqtzni/i,
  ]) assert.doesNotMatch(migration, forbidden);
});
