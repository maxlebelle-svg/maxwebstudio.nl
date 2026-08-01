const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260731200000_harden_commercial_offer_sales_assignment_rls.sql");
const migration = fs.readFileSync(migrationPath, "utf8");

const certified = new Map([
  ["20260730150000_commercial_offer_foundation.sql", "a6f043620b7bc1e56dc974f0d29631b4fe139aeef2a445342745e5d016a3513e"],
  ["20260730170000_composer_service_role_read_fix.sql", "c5cfd06648d52225b1833a6214cb1e3f983734199273294824941afbc6dbf89c"],
  ["20260730223000_commercial_offer_phase_d1_mail.sql", "be3a84c026da82650fae95a2d33fc7706c21d84835fc09145838857810c8128c"],
  ["20260731100000_harden_commercial_offer_interest_security.sql", "facbccb7d4fe014c24922f22bb18255c10a0e59bfaceccd0691376aaec2ae58f"],
  ["20260731190000_harden_commercial_offer_child_read_scope.sql", "5cdb759417ef3c68cf4d81da5ed9cc80cefaa994e654167de320ca44f222a99f"],
]);

test("the five certified commercial migrations remain byte-identical", () => {
  for (const [file, expected] of certified) {
    const source = fs.readFileSync(path.join(root, "supabase/migrations", file));
    assert.equal(crypto.createHash("sha256").update(source).digest("hex"), expected, file);
  }
});

test("the repair is one forward-only transaction replacing exactly four read policies", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.equal((migration.match(/drop policy if exists/g) || []).length, 4);
  assert.equal((migration.match(/create policy/g) || []).length, 4);
  assert.doesNotMatch(migration, /\b(drop table|truncate|delete from|insert into|update\s+public\.|alter table)\b/i);
});

test("sales assignment is a bounded boolean helper with fixed privileges", () => {
  assert.match(migration, /commercial_current_user_has_sales_relationship_access_v1\(text,uuid\)/);
  assert.match(migration, /returns boolean[\s\S]*language plpgsql[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(migration, /if not public\.has_app_role\(array\['sales_partner','sales'\]\) then[\s\S]*return false;/);
  const helperBody = migration.slice(migration.indexOf("as $function$"), migration.indexOf("$function$;", migration.indexOf("as $function$") + 1));
  assert.doesNotMatch(helperBody, /\bexecute\b/i);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, service_role/);
  assert.match(migration, /grant execute on function[\s\S]*to authenticated/);
});

test("customer-facing policies never directly query leads or grant customer lead access", () => {
  const policies = migration.slice(migration.indexOf("drop policy if exists commercial_offers_scoped_read"));
  assert.doesNotMatch(policies, /\b(from|join)\s+public\.leads\b/i);
  assert.doesNotMatch(migration, /grant\s+select[\s\S]*\bpublic\.leads\b/i);
  assert.match(policies, /public\.owns_customer\(customer_id\)/);
  assert.match(policies, /public\.owns_customer\(o\.customer_id\)/);
  assert.match(policies, /commercial_current_user_has_sales_relationship_access_v1\(relationship_type,relationship_id\)/);
  assert.match(policies, /commercial_current_user_has_sales_relationship_access_v1\(o\.relationship_type,o\.relationship_id\)/);
});
