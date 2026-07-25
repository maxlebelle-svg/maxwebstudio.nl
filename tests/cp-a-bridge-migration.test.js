const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bridgePath = path.join(root, "supabase/migrations/20260724110000_bridge_preview_publication_portal_review.sql");
const cpAPath = path.join(root, "supabase/migrations/20260724120000_cp_a_portal_trust_chain.sql");
const bridge = fs.readFileSync(bridgePath, "utf8");
const cpA = fs.readFileSync(cpAPath, "utf8");

test("bridge migration sorts immediately before the immutable CP-A trust chain", () => {
  assert.ok(path.basename(bridgePath) < path.basename(cpAPath));
  assert.match(bridge, /^begin;/m);
  assert.match(bridge, /^commit;/m);
});

test("bridge materializes the complete nullable portal-review column contract", () => {
  const columns = [
    "customer_id", "project_id", "website_id", "title", "customer_summary", "change_summary",
    "safe_preview_path", "published_to_portal", "published_at", "published_by", "review_deadline",
    "allow_feedback", "allow_approval", "notify_customer", "status", "feedback_items", "approved_at",
    "approved_by_auth_user_id", "approval_metadata", "metadata", "updated_at",
  ];
  for (const column of columns) {
    assert.match(bridge, new RegExp(`add column if not exists ${column} `));
  }
  assert.doesNotMatch(bridge, /alter column .* set not null/i);
});

test("bridge fails closed when dependencies or existing columns are incompatible", () => {
  assert.match(bridge, /CP-A bridge dependency is missing/);
  assert.match(bridge, /CP-A bridge incompatible column/);
  assert.match(bridge, /CP-A bridge column postcondition failed/);
  assert.match(bridge, /using errcode = '42804'/);
});

test("foreign keys are definition-checked, orphan-checked and validated", () => {
  for (const target of ["customers", "projects", "websites", "profiles", "auth.users"]) {
    assert.match(bridge, new RegExp(target.replace(".", "\\.")));
  }
  assert.match(bridge, /on delete set null not valid/i);
  assert.match(bridge, /validate constraint/i);
  assert.match(bridge, /found orphan customer_id values/);
  assert.match(bridge, /found orphan project_id values/);
  assert.match(bridge, /found orphan website_id values/);
});

test("legacy preview ownership is never guessed or backfilled", () => {
  assert.doesNotMatch(bridge, /update\s+public\.website_preview_versions/i);
  assert.doesNotMatch(bridge, /insert\s+into\s+public\.website_preview_versions/i);
  assert.doesNotMatch(bridge, /first\s+customer/i);
});

test("constraints and indexes are compared by their definitions", () => {
  assert.match(bridge, /pg_get_constraintdef/);
  assert.match(bridge, /pg_get_indexdef/);
  assert.match(bridge, /incompatible constraint/);
  assert.match(bridge, /incompatible index/);
  assert.match(bridge, /name collision for index/);
});

test("bridge preserves RLS and introduces no grants, policies or executable functions", () => {
  assert.match(bridge, /requires RLS to remain enabled/);
  assert.doesNotMatch(bridge, /\bgrant\b/i);
  assert.doesNotMatch(bridge, /create\s+policy/i);
  assert.doesNotMatch(bridge, /create\s+(or\s+replace\s+)?function/i);
  assert.doesNotMatch(bridge, /security\s+definer/i);
});

test("bridge and CP-A retain separate responsibilities", () => {
  assert.doesNotMatch(bridge, /website_preview_approvals\s*\(/);
  assert.doesNotMatch(bridge, /quote_acceptances\s*\(/);
  assert.match(cpA, /create table public\.website_preview_approvals/);
  assert.match(cpA, /create table public\.quote_acceptances/);
});

test("bridge bytes have a reviewable SHA-256 identity", () => {
  const checksum = crypto.createHash("sha256").update(bridge).digest("hex");
  assert.match(checksum, /^[0-9a-f]{64}$/);
});
