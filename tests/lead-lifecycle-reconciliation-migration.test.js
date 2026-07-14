const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260714120000_reconcile_production_lead_lifecycle.sql"), "utf8");

test("lead lifecycle reconciliation is forward-only and validates before enforcing", () => {
  assert.match(migration, /add column if not exists lead_status text/i);
  assert.match(migration, /when 'nieuw' then 'new'/i);
  assert.match(migration, /when 'interesse' then 'interesting'/i);
  assert.match(migration, /when 'opvolgen' then 'follow_up'/i);
  assert.match(migration, /validation failed: % leads have an invalid canonical lifecycle/i);
  assert.match(migration, /alter column lead_status set not null/i);
  assert.match(migration, /validate constraint leads_lead_status_check/i);
  assert.doesNotMatch(migration, /drop\s+(table|column)|truncate|delete\s+from/i);
});

test("lead lifecycle reconciliation preserves temporary status compatibility", () => {
  assert.doesNotMatch(migration, /alter\s+column\s+status|drop\s+column\s+status/i);
  assert.match(migration, /legacy status remains a temporary compatibility field/i);
  assert.match(migration, /create unique index if not exists leads_external_source_id_uidx/i);
});
