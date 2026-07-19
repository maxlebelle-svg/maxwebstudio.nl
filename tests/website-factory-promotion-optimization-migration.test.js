const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260719180000_optimize_website_factory_preview_promotion.sql");
const migration = fs.readFileSync(migrationPath, "utf8");

test("promotion optimization is one guarded forward transaction", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/m);
  assert.match(migration, /faa14563e803c069ef873edf00dcac08/);
  assert.match(migration, /bf64b4d0c635faa6fc6dae1a1dfe7c5d/);
  assert.match(migration, /d581c570b3a01e86ce1a615a78f002f4/);
  assert.match(migration, /unexpected promote_website_factory_preview definition/);
  assert.match(migration, /unexpected validate_website_preview_version definition/);
  assert.doesNotMatch(migration, /create table|alter table|drop table|insert into public\.(leads|customers|projects)|statement_timeout|lock_timeout/i);
});

test("validation keeps immutability without running on activation-only updates", () => {
  assert.match(migration, /if tg_op = 'UPDATE'[\s\S]*website preview versions are immutable/i);
  assert.match(migration, /select status, demo_journey_id, package_checksum/i);
  assert.match(migration, /build_record\.package_checksum is distinct from new\.package_checksum/i);
  assert.match(migration, /drop trigger website_preview_versions_validate_and_immutable/i);
  assert.match(migration, /before insert on public\.website_preview_versions[\s\S]*execute function public\.validate_website_preview_version/i);
  assert.match(migration, /before update of[\s\S]*generated_package[\s\S]*on public\.website_preview_versions/i);
  assert.doesNotMatch(migration, /build_record\.generated_package is distinct from new\.generated_package/i);
  assert.doesNotMatch(migration, /to_jsonb\(new\)|to_jsonb\(old\)/i);
});

test("promotion stays locked and atomic while returning lightweight metadata", () => {
  assert.match(migration, /where id = p_build_job_id\s+for update/i);
  assert.match(migration, /where id = build_record\.demo_journey_id\s+for update/i);
  assert.match(migration, /insert into public\.website_preview_versions/i);
  assert.match(migration, /set is_active = false[\s\S]*set is_active = true[\s\S]*update public\.demo_journeys/i);
  assert.equal((migration.match(/null::jsonb/g) || []).length, 2);
});

test("active preview briefing is promoted from the durable build package", () => {
  assert.match(migration, /generated_package #>> '\{meta,customerWishes\}'/i);
  assert.match(migration, /generated_briefing = coalesce\(promoted_briefing, journey_record\.generated_briefing\)/i);
});

test("client access remains revoked and only service_role can execute promotion", () => {
  assert.match(migration, /revoke all privileges on function public\.validate_website_preview_version\(\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /revoke all privileges on function public\.promote_website_factory_preview\(uuid, text, text, text\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.promote_website_factory_preview\(uuid, text, text, text\)[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant[^;]*(anon|authenticated)/i);
});
