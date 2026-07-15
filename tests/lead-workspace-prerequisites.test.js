const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const prerequisite = fs.readFileSync(path.resolve(__dirname, "../supabase/migration-drafts/20260715093000_reconcile_lead_workspace_prerequisites.sql"), "utf8");
const workspace = fs.readFileSync(path.resolve(__dirname, "../supabase/migration-drafts/026_sales_workspace_normalized_fields.sql"), "utf8");
const preflight = fs.readFileSync(path.resolve(__dirname, "../supabase/manual-checks/leads_workspace_production_preflight.sql"), "utf8");
const summaryPreflight = fs.readFileSync(path.resolve(__dirname, "../supabase/manual-checks/leads_workspace_production_preflight_summary.sql"), "utf8");
const privilegeDiagnosis = fs.readFileSync(path.resolve(__dirname, "../supabase/manual-checks/leads_workspace_privilege_diagnosis.sql"), "utf8");
const privilegeHardening = fs.readFileSync(path.resolve(__dirname, "../supabase/migration-drafts/20260715120000_harden_lead_workspace_privileges.sql"), "utf8");
const privilegeHardeningPostcheck = fs.readFileSync(path.resolve(__dirname, "../supabase/manual-checks/leads_workspace_privilege_hardening_postcheck.sql"), "utf8");
const authoritativeCatalogSnapshot = fs.readFileSync(path.resolve(__dirname, "../supabase/manual-checks/leads_workspace_authoritative_catalog_snapshot.sql"), "utf8");
const prerequisitePrecheck = fs.readFileSync(path.resolve(__dirname, "../supabase/manual-checks/leads_workspace_prerequisite_precheck.sql"), "utf8");
const prerequisitePostcheck = fs.readFileSync(path.resolve(__dirname, "../supabase/manual-checks/leads_workspace_prerequisite_postcheck.sql"), "utf8");
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
  assert.doesNotMatch(prerequisite, /\b(create|alter|drop)\s+policy\b/i);
  assert.doesNotMatch(prerequisite, /^\s*(grant|revoke)\b/im);
  assert.doesNotMatch(prerequisite, /026_sales_workspace_normalized_fields\.sql\s*;\s*$/im);
});

test("prerequisite precheck is read-only, single-result en fail-closed op de gezaghebbende baseline", () => {
  assert.match(prerequisitePrecheck, /BEGIN READ ONLY;/);
  assert.match(prerequisitePrecheck, /ROLLBACK;\s*$/);
  assert.equal((prerequisitePrecheck.match(/\nSELECT check_name, status, finding_count, details, blocking/g) || []).length, 1);
  for (const evidence of [
    "yxxahurphdbblkuxoeje", "authoritative_row_counts",
    "policy_contract_and_fingerprint", "privilege_hardening_active", "legacy_columns_compatible",
    "unknown_lifecycle_values", "invalid_metadata_values", "assignment_conflicts", "invalid_metadata_timestamps",
    "invalid_or_orphaned_uuid_references", "prerequisite_not_already_applied", "overall_readiness",
  ]) assert.match(prerequisitePrecheck, new RegExp(evidence));
  assert.ok(prerequisitePrecheck.includes("'leads=' || (SELECT count(*) FROM lead_rows) || '/12"));
  assert.ok(prerequisitePrecheck.includes("customer_timeline_events=' || (SELECT row_count FROM timeline_total) || '/37"));
  const executable = prerequisitePrecheck.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/im);
});

test("prerequisite postcheck bewijst schema, data en security in één read-only resultset", () => {
  assert.match(prerequisitePostcheck, /BEGIN READ ONLY;/);
  assert.match(prerequisitePostcheck, /ROLLBACK;\s*$/);
  assert.equal((prerequisitePostcheck.match(/\nSELECT check_name,status,finding_count,details,blocking/g) || []).length, 1);
  for (const check of [
    "prerequisite_column_types", "validated_check_constraints", "validated_auth_foreign_keys",
    "prerequisite_indexes", "target_rls_enabled", "policy_contract_and_fingerprint",
    "privilege_hardening_preserved", "required_application_privileges", "unknown_values",
    "valid_timestamps", "assignment_consistency", "no_orphaned_uuid_references",
    "migration_history_status", "overall_readiness",
  ]) assert.match(prerequisitePostcheck, new RegExp(`'${check}'`));
  assert.match(prerequisitePostcheck, /CASE WHEN applied THEN 'PASS' ELSE 'WARN' END/);
  assert.match(prerequisitePostcheck, /SQL Editor does not automatically register migration history/);
  const executable = prerequisitePostcheck.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/im);
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

test("samengevoegde productiepreflight levert exact één exporteerbare controletabel", () => {
  assert.match(summaryPreflight, /^--[^\n]*\n--[^\n]*\n\nBEGIN READ ONLY;/);
  assert.match(summaryPreflight, /ROLLBACK;\s*$/);
  assert.match(summaryPreflight, /SELECT check_name, status, finding_count, details, stop_condition/);
  assert.match(summaryPreflight, /'overall_readiness'/);
  assert.match(summaryPreflight, /status = 'FAIL' AND stop_condition/);
  assert.match(summaryPreflight, /CASE WHEN count\(\*\) FILTER \(WHERE status = 'FAIL' AND stop_condition\) = 0 THEN 'PASS' ELSE 'FAIL' END/);
  assert.equal((summaryPreflight.match(/\nSELECT check_name, status, finding_count, details, stop_condition/g) || []).length, 1);
});

test("samengevoegde productiepreflight bevat alle verplichte controles en blijft read-only", () => {
  for (const checkName of [
    "required_tables_exist", "leads_column_types_compatible", "leads_rls_enabled", "leads_policies_exist",
    "service_role_required_privileges", "anon_authenticated_privileges_not_too_broad", "unknown_lifecycle_values",
    "unknown_call_outcome_values", "unknown_next_action_types", "unknown_acquisition_channel_values",
    "invalid_uuid_strings", "orphaned_owner_id", "orphaned_assigned_to", "orphaned_assigned_user_id", "orphaned_created_by",
    "orphaned_closed_by_user_id", "assignment_conflicts", "invalid_metadata_timestamps",
    "invalid_next_action_timestamps", "nullable_field_distribution", "unexpected_leads_constraints",
    "unvalidated_constraints", "missing_required_indexes", "duplicate_leads_indexes",
    "duplicate_timeline_idempotency_keys", "total_leads", "total_customer_timeline_events",
  ]) assert.match(summaryPreflight, new RegExp(`'${checkName}'`));

  const executable = summaryPreflight.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/im);
  assert.doesNotMatch(executable, /\bselect\s+.*\binto\b/i);
  assert.doesNotMatch(executable, /pg_(advisory|terminate|cancel)|dblink|lo_(create|import|export|unlink)/i);
  assert.doesNotMatch(summaryPreflight, /THEN\s+'(?!PASS|WARN|FAIL)[A-Z_]+'\s+ELSE/);
  for (const match of summaryPreflight.matchAll(/query_to_xml\('([^']+)'/g)) {
    assert.match(match[1], /^SELECT\b/);
  }
});

test("privilegediagnose levert één read-only export met het vereiste bewijscontract", () => {
  assert.match(privilegeDiagnosis, /^--[^\n]*\n--[^\n]*\n\nBEGIN READ ONLY;/);
  assert.match(privilegeDiagnosis, /ROLLBACK;\s*$/);
  assert.equal((privilegeDiagnosis.match(/\nSELECT\n  object_type,/g) || []).length, 1);
  for (const column of [
    "object_type", "schema_name", "object_name", "grantee", "privilege_type", "source",
    "rls_enabled", "policy_name", "policy_command", "assessment", "reason", "blocking",
  ]) assert.match(privilegeDiagnosis, new RegExp(`\\b${column}\\b`));
  for (const role of ["anon", "authenticated", "service_role"]) assert.match(privilegeDiagnosis, new RegExp(`'${role}'`));
  for (const object of ["leads", "customer_timeline_events"]) assert.match(privilegeDiagnosis, new RegExp(`'${object}'`));

  const executable = privilegeDiagnosis.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/im);
  assert.doesNotMatch(executable, /\bselect\s+.*\binto\b/i);
});

test("privilegediagnose scheidt RLS-acties van niet-row-scoped grants", () => {
  for (const assessment of ["EXPECTED", "REVIEW", "DANGEROUS"]) {
    assert.match(privilegeDiagnosis, new RegExp(`'${assessment}'`));
  }
  assert.match(privilegeDiagnosis, /p\.privilege_type IN \('TRUNCATE', 'REFERENCES', 'TRIGGER'\) THEN 'DANGEROUS'/);
  assert.match(privilegeDiagnosis, /NOT policies\.has_policy THEN 'EXPECTED'/);
  assert.match(privilegeDiagnosis, /policies\.has_unconditional_policy THEN 'DANGEROUS'/);
  assert.match(privilegeDiagnosis, /No effective table or column grant; the action is denied before RLS/);
  assert.match(privilegeDiagnosis, /RLS is enabled and no applicable policy exists; default deny applies/);
  assert.match(privilegeDiagnosis, /SECURITY DEFINER executes with owner rights/);
});

test("privilegehardening trekt uitsluitend bewezen browserrisico's in", () => {
  assert.match(privilegeHardening, /revoke truncate, references, trigger on table public\.leads from anon, authenticated;/i);
  assert.match(privilegeHardening, /revoke truncate, references, trigger on table public\.customer_timeline_events from anon, authenticated;/i);
  for (const signature of [
    "current_app_role\\(\\)", "current_profile_id\\(\\)", "has_app_role\\(text\\[\\]\\)",
    "is_admin_role\\(\\)", "is_staff_role\\(\\)", "owns_commercial_record\\(uuid\\)",
  ]) {
    assert.match(privilegeHardening, new RegExp(`revoke execute on function public\\.${signature} from public, anon;`, "i"));
    assert.match(privilegeHardening, new RegExp(`grant execute on function public\\.${signature} to authenticated, service_role;`, "i"));
  }
  assert.doesNotMatch(privilegeHardening, /revoke\s+(select|insert|update|delete)\b/i);
  assert.doesNotMatch(privilegeHardening, /revoke\s+create\s+on\s+schema/i);
  assert.doesNotMatch(privilegeHardening, /\b(create|alter|drop)\s+policy\b/i);
  assert.doesNotMatch(privilegeHardening, /^\s*(insert|update|delete|truncate)\b/im);
});

test("privilegehardening is transactioneel, idempotent en fail-closed", () => {
  assert.match(privilegeHardening, /begin;/i);
  assert.match(privilegeHardening, /commit;/i);
  assert.match(privilegeHardening, /lock_timeout = '5s'/);
  assert.match(privilegeHardening, /statement_timeout = '2min'/);
  assert.match(privilegeHardening, /browser role has CREATE on schema public/);
  assert.match(privilegeHardening, /RLS is not enabled on every target table/);
  assert.match(privilegeHardening, /SECURITY DEFINER with a fixed safe search_path/);
  assert.match(privilegeHardening, /application rollback needs no/);
});

test("privilegehardening-nacontrole levert één read-only bewijsresultset", () => {
  assert.match(privilegeHardeningPostcheck, /^--[^\n]*\n--[^\n]*\n\nBEGIN READ ONLY;/);
  assert.match(privilegeHardeningPostcheck, /ROLLBACK;\s*$/);
  assert.equal((privilegeHardeningPostcheck.match(/\nSELECT check_name, status, finding_count, details, blocking/g) || []).length, 1);
  for (const check of [
    "browser_table_privileges_removed", "browser_schema_create_absent", "required_schema_usage_present",
    "security_definer_helpers_safe", "helper_execute_acl", "authenticated_leads_flow_privileges",
    "service_role_privileges_preserved", "target_rls_enabled", "target_policies_preserved", "overall_readiness",
  ]) assert.match(privilegeHardeningPostcheck, new RegExp(`'${check}'`));

  const executable = privilegeHardeningPostcheck.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/im);
  assert.doesNotMatch(executable, /\bselect\s+.*\binto\b/i);
});

test("authoritative catalog snapshot is read-only en levert exact één resultset", () => {
  assert.match(authoritativeCatalogSnapshot, /^--[^\n]*\n--[^\n]*\n\nBEGIN READ ONLY;/);
  assert.match(authoritativeCatalogSnapshot, /ROLLBACK;\s*$/);
  assert.equal((authoritativeCatalogSnapshot.match(/\nSELECT\n  i\.database_name,/g) || []).length, 1);
  const executable = authoritativeCatalogSnapshot.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/im);
  assert.doesNotMatch(executable, /\bselect\s+.*\binto\b/i);
  for (const unsafe of ["pg_advisory", "pg_terminate", "pg_cancel", "dblink", "lo_create", "lo_import", "lo_export", "lo_unlink"]) {
    assert.doesNotMatch(executable, new RegExp(unsafe, "i"));
  }
});

test("authoritative catalog snapshot draagt volledige database-identiteit op iedere rij", () => {
  for (const expression of [
    "current_database\\(\\)", "current_user", "session_user", "current_role", "inet_server_addr\\(\\)",
    "inet_server_port\\(\\)", "current_setting\\('server_version'\\)",
    "current_setting\\('transaction_read_only'\\)", "current_setting\\('search_path'\\)", "clock_timestamp\\(\\)",
  ]) assert.match(authoritativeCatalogSnapshot, new RegExp(expression));
  for (const column of [
    "database_name", "current_user_name", "session_user_name", "current_role_name", "server_address",
    "server_port", "postgres_version", "transaction_read_only", "search_path", "captured_at_utc",
    "category", "schema_name", "object_name", "object_identity", "attribute_name", "attribute_value",
    "source_catalog", "visibility_status",
  ]) assert.match(authoritativeCatalogSnapshot, new RegExp(`\\b${column}\\b`));
});

test("authoritative catalog snapshot gebruikt primaire catalogi en fail-closed zichtbaarheidsstatussen", () => {
  for (const catalog of [
    "pg_class", "pg_namespace", "pg_proc", "pg_get_function_identity_arguments", "pg_get_functiondef",
    "pg_policies", "pg_policy", "pg_roles", "aclexplode", "pg_get_userbyid", "information_schema.role_table_grants",
  ]) assert.match(authoritativeCatalogSnapshot, new RegExp(catalog.replace(".", "\\.")));
  for (const status of ["OBJECT_ABSENT", "OBJECT_PRESENT", "OBJECT_NOT_VISIBLE", "ROLE_NOT_VISIBLE", "CATALOG_INCONSISTENT"]) {
    assert.match(authoritativeCatalogSnapshot, new RegExp(`'${status}'`));
  }
  assert.match(authoritativeCatalogSnapshot, /'identity_summary'/);
  assert.match(authoritativeCatalogSnapshot, /'overall_catalog_consistency'/);
  assert.match(authoritativeCatalogSnapshot, /catalog_fingerprint_md5/);
  assert.match(authoritativeCatalogSnapshot, /WHEN \(SELECT server_address FROM identity_context\) IS NULL THEN 'WARN'/);
});

test("authoritative catalog snapshot inventariseert targets, ACL-bronnen en migrationcontext", () => {
  for (const object of [
    "leads", "customer_timeline_events", "current_profile_id", "current_app_role", "has_app_role",
    "is_admin_role", "is_staff_role", "owns_commercial_record",
  ]) assert.match(authoritativeCatalogSnapshot, new RegExp(`'${object}'`));
  for (const category of [
    "table_count", "policy", "policy_comparison", "function_acl", "function_effective_execute",
    "table_acl", "table_effective_privilege", "table_grant_comparison", "schema_acl",
    "schema_effective_privilege", "migration_context", "wrong_schema_table",
  ]) assert.match(authoritativeCatalogSnapshot, new RegExp(`'${category}'`));
  for (const source of ["explicit", "via_PUBLIC", "via_role_membership_or_owner", "none"]) {
    assert.match(authoritativeCatalogSnapshot, new RegExp(`'${source}'`));
  }
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
