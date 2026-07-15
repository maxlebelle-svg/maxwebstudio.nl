const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const prerequisite = fs.readFileSync(path.resolve(__dirname, "../supabase/migration-drafts/20260715093000_reconcile_lead_workspace_prerequisites.sql"), "utf8");
const workspace = fs.readFileSync(path.resolve(__dirname, "../supabase/migration-drafts/026_sales_workspace_normalized_fields.sql"), "utf8");
const preflight = fs.readFileSync(path.resolve(__dirname, "../supabase/manual-checks/leads_workspace_production_preflight.sql"), "utf8");
const api = fs.readFileSync(path.resolve(__dirname, "../functions/admin-leads.js"), "utf8");
const leadsApi = require("../functions/admin-leads");

test("prerequisite en workspace-normalisatie hebben een expliciete dependencyvolgorde", () => {
  assert.match(prerequisite, /PREREQUISITE MIGRATION/);
  assert.match(workspace, /WORKSPACE NORMALIZATION MIGRATION/);
  assert.match(workspace, /20260715093000_reconcile_lead_workspace_prerequisites\.sql/);
});

test("prerequisite gebruikt één canoniek assignment-, bel- en bronmodel", () => {
  for (const field of [
    "assigned_user_id", "last_call_outcome", "next_action_type", "next_action_at",
    "next_action_note", "next_action_assigned_user_id", "closed_by_user_id",
    "acquisition_channel", "sourced_by_user_id", "won_at",
  ]) assert.match(prerequisite, new RegExp(`add column if not exists ${field}`));
  assert.doesNotMatch(prerequisite, /add column if not exists call_disposition/);
  assert.doesNotMatch(prerequisite, /add column if not exists lead_source/);
  assert.doesNotMatch(prerequisite, /add column if not exists converted_at/);
  assert.match(prerequisite, /assigned_to is a deprecated UUID compatibility bridge/);
});

test("prerequisite is transactioneel, fail-closed en zonder destructieve datamutaties", () => {
  assert.match(prerequisite, /begin;/);
  assert.match(prerequisite, /lock_timeout = '5s'/);
  assert.match(prerequisite, /statement_timeout = '2min'/);
  assert.match(prerequisite, /unknown last_call_outcome/);
  assert.match(prerequisite, /invalid or orphaned user references/);
  assert.match(prerequisite, /conflicts/);
  assert.doesNotMatch(prerequisite, /\bdelete\s+from\b/i);
  assert.doesNotMatch(prerequisite, /\btruncate\b/i);
  assert.doesNotMatch(prerequisite, /\bdrop\s+column\b/i);
  assert.doesNotMatch(prerequisite, /alter column [a-z_]+ set not null/i);
  assert.doesNotMatch(prerequisite, /lead_score/i);
});

test("read-only productiepreflight dekt schema, data, assignment en timeline", () => {
  assert.match(preflight, /begin read only;/i);
  assert.match(preflight, /rollback;/i);
  for (const catalog of ["information_schema.columns", "pg_constraint", "pg_indexes", "pg_policies", "role_table_grants"]) {
    assert.match(preflight, new RegExp(catalog.replace(".", "\\.")));
  }
  for (const check of ["NULL\/empty counts", "Metadata values", "Orphaned UUID references", "Conflicting legacy\/current assignment", "Timeline totals"]) {
    assert.match(preflight, new RegExp(check));
  }
  const executable = preflight.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/i);
});

test("API heeft afzonderlijke selectcontracten voor legacy, prerequisites en workspace", () => {
  assert.match(api, /lead_status,pipeline_stage,interest_level,priority,is_favorite,archived_at,assigned_user_id/);
  assert.match(api, /lead_status,assigned_user_id,assigned_at,assigned_by,normalized_company_name/);
  assert.match(api, /status,owner_id,created_by,assigned_to,notes,is_demo,environment,metadata/);
});

test("API doorloopt zonder crash legacy, prerequisites-only en workspace-selects", async () => {
  const previousFetch = global.fetch;
  const states = {
    legacy: (select) => !select.includes("assigned_user_id") && select.includes("company_name"),
    prerequisites: (select) => select.includes("assigned_user_id") && !select.includes("pipeline_stage") && !select.includes("reviewed_at"),
    workspace: (select) => select.includes("pipeline_stage") && !select.includes("reviewed_at"),
  };
  try {
    for (const [state, accepts] of Object.entries(states)) {
      global.fetch = async (url) => {
        const select = new URL(url).searchParams.get("select") || "";
        if (!accepts(select)) {
          return new Response(JSON.stringify({ code: "42703", message: `column missing in ${state}` }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", company_name: state, metadata: {} }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
      const rows = await leadsApi._test.readLeadRows({ supabaseUrl: "https://example.test", serviceRoleKey: "test-only" });
      assert.equal(rows[0].company_name, state);
    }
  } finally {
    global.fetch = previousFetch;
  }
});
