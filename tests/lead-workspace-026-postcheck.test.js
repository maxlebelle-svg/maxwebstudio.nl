const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const postcheck = fs.readFileSync(path.resolve(__dirname, "../supabase/manual-checks/leads_workspace_026_postcheck.sql"), "utf8");
const api = fs.readFileSync(path.resolve(__dirname, "../functions/admin-leads.js"), "utf8");

test("026-postcheck is read-only and returns exactly one exportable resultset", () => {
  assert.match(postcheck, /BEGIN READ ONLY;/);
  assert.match(postcheck, /ROLLBACK;\s*$/);
  assert.equal((postcheck.match(/\nSELECT check_name,status,finding_count,details,blocking/g) || []).length, 1);
  const executable = postcheck.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/im);
  assert.doesNotMatch(executable, /\bselect\s+.*\binto\b/i);
});

test("026-postcheck exposes only PASS, WARN and FAIL with blocking overall readiness", () => {
  assert.match(postcheck, /'overall_readiness'/);
  assert.match(postcheck, /status='FAIL' AND blocking/);
  for (const status of ["PASS", "WARN", "FAIL"]) assert.match(postcheck, new RegExp(`'${status}'`));
  assert.doesNotMatch(postcheck, /THEN\s+'(?!PASS|WARN|FAIL)[A-Z_]+'\s+ELSE/);
});

test("026-postcheck validates all workspace columns and data contracts", () => {
  for (const column of [
    "pipeline_stage", "interest_level", "priority", "is_favorite",
    "next_action_completed_at", "next_action_completed_by", "archived_at",
  ]) assert.match(postcheck, new RegExp(`'${column}'`));
  for (const check of [
    "workspace_columns_exact", "workspace_backfill_not_null", "workspace_allowed_values",
    "next_action_completed_by_uuid", "next_action_completed_by_orphans", "workspace_metadata_values",
  ]) assert.match(postcheck, new RegExp(`'${check}'`));
});

test("026-postcheck rejects constraint and index definition drift and semantic duplicates", () => {
  for (const constraint of [
    "leads_pipeline_stage_check", "leads_interest_level_check", "leads_priority_check",
    "leads_next_action_completed_by_fkey",
  ]) assert.match(postcheck, new RegExp(constraint));
  for (const index of [
    "leads_pipeline_stage_updated_idx", "leads_interest_priority_idx", "leads_open_next_action_idx",
    "leads_active_owner_idx", "customer_timeline_events_lead_idempotency_uidx",
  ]) assert.match(postcheck, new RegExp(index));
  assert.match(postcheck, /'semantic_duplicate_constraints'/);
  assert.match(postcheck, /'semantic_duplicate_indexes'/);
  assert.match(postcheck, /pg_get_constraintdef/);
  assert.match(postcheck, /pg_get_indexdef/);
});

test("026-postcheck preserves security, prerequisite and history contracts", () => {
  for (const check of [
    "policy_fingerprint_unchanged", "browser_dangerous_privileges_absent",
    "helper_security_and_execute_acl", "application_table_privileges",
    "prerequisite_columns_preserved", "prerequisite_constraints_preserved",
    "prerequisite_indexes_preserved", "migration_history_status",
  ]) assert.match(postcheck, new RegExp(`'${check}'`));
  assert.match(postcheck, /7286fe06b77a30efeacbb3eeb4894648/);
  assert.match(postcheck, /CASE WHEN applied THEN 'PASS' ELSE 'WARN' END/);
  assert.match(postcheck, /no history write is performed/);
});

test("backend reads and writes all seven workspace fields through its canonical contract", () => {
  for (const field of [
    "pipeline_stage", "interest_level", "priority", "is_favorite",
    "next_action_completed_at", "next_action_completed_by", "archived_at",
  ]) assert.match(api, new RegExp(`\\b${field}\\b`));
  assert.match(api, /pipelineStages/);
  assert.match(api, /interestLevels/);
  assert.match(api, /leadPriorities/);
});
