const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260719120000_media_asset_foundation.sql");
const smokePath = path.join(root, "supabase/tests/media_asset_foundation_smoke.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const smoke = fs.readFileSync(smokePath, "utf8");

function compact(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

test("migration scope is limited to the shared media asset foundation", () => {
  const tables = [...migration.matchAll(/create table public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
  assert.deepEqual(tables, ["media_assets"]);
  for (const forbidden of [
    "social_master_contents", "social_content_variants", "social_content_drafts",
    "social_content_revisions", "social_approvals", "delivery_jobs", "provider_connections",
  ]) {
    assert.equal(migration.includes(`create table public.${forbidden}`), false);
  }
});

test("customer and internal ownership never use a sentinel customer", () => {
  const sql = compact(migration);
  assert(sql.includes("owner_scope in ('customer','internal')"));
  assert(sql.includes("owner_scope = 'customer' and customer_id is not null"));
  assert(sql.includes("owner_scope = 'internal' and customer_id is null"));
  assert(sql.includes("references public.customers(id) on delete restrict"));
});

test("immutable technical metadata and one-way lifecycle are trigger enforced", () => {
  const sql = compact(migration);
  for (const field of [
    "owner_scope", "customer_id", "asset_type", "storage_provider", "storage_bucket",
    "storage_object_path", "storage_object_version", "byte_checksum", "mime_type",
    "size_bytes", "width_px", "height_px", "duration_ms", "source_file_id",
    "created_by_type", "created_by_id", "created_at", "idempotency_key", "input_fingerprint",
  ]) {
    assert(sql.includes(`old.${field} is distinct from new.${field}`), `${field} must be immutable`);
  }
  assert(sql.includes("only the active to archived media asset transition is allowed"));
  assert(sql.includes("media assets cannot be deleted"));
  assert(sql.includes("before update or delete on public.media_assets"));
});

test("versioned and null-version storage identities are independently unique", () => {
  const sql = compact(migration);
  assert(sql.includes("create unique index media_assets_storage_identity_unversioned"));
  assert(sql.includes("where storage_object_version is null"));
  assert(sql.includes("create unique index media_assets_storage_identity_versioned"));
  assert(sql.includes("where storage_object_version is not null"));
  assert(sql.includes("constraint media_assets_id_checksum_key unique (id,byte_checksum)"));
});

test("registration has full idempotency and scoped byte deduplication", () => {
  const sql = compact(migration);
  assert(sql.includes("input_asset_id uuid"));
  assert(sql.includes("'assetid',input_asset_id"));
  assert(sql.includes("id,owner_scope,customer_id"));
  assert(sql.includes("reserved media asset id conflict: immutable input differs"));
  assert(sql.includes("media asset idempotency conflict: immutable input differs"));
  assert(sql.includes("media asset checksum conflict: technical metadata differs"));
  assert(sql.includes("media asset storage identity conflict"));
  assert(sql.includes("exception when unique_violation"));
  assert(sql.includes("for insert_attempt in 1..2 loop"));
  for (const field of [
    "id", "input_fingerprint", "owner_scope", "customer_id", "asset_type", "storage_provider",
    "storage_bucket", "storage_object_path", "storage_object_version", "byte_checksum",
    "mime_type", "size_bytes", "width_px", "height_px", "duration_ms",
    "source_file_id", "created_by_type", "created_by_id",
  ]) {
    assert(sql.includes(`existing_asset.${field}`), `${field} must participate in retry comparison`);
  }
});

test("source files are validation input and never an alternate mutable asset identity", () => {
  const sql = compact(migration);
  assert(sql.includes("source_file_id uuid references public.files(id) on delete restrict"));
  assert(sql.includes("source_file.customer_id is distinct from input_customer_id"));
  assert(sql.includes("source_file.storage_path is distinct from normalized_path"));
  assert(sql.includes("lower(source_file.checksum) is distinct from normalized_checksum"));
  assert(sql.includes("source_file.size_bytes is distinct from input_size_bytes"));
  assert(sql.includes("source_file.status in ('rejected','replaced','archived')"));
});

test("bounded RPCs use fixed security-definer settings without dynamic SQL", () => {
  const sql = compact(migration);
  for (const fn of ["register_media_asset", "archive_media_asset"]) {
    const start = sql.indexOf(`function public.${fn}`);
    const end = sql.indexOf("$$;", start);
    const block = sql.slice(start, end);
    assert(block.includes("security definer"));
    assert(block.includes("set search_path = pg_catalog"));
    assert(block.includes("perform public.assert_media_asset_service_role()"));
  }
  assert.equal(/\bexecute\s+format\s*\(/i.test(migration), false);
  assert.equal(/\bexecute\s+immediate\b/i.test(migration), false);
});

test("grants expose read-only table access and only two operational RPCs", () => {
  const sql = compact(migration);
  assert(sql.includes("revoke all on table public.media_assets from public,anon,authenticated,service_role"));
  assert(sql.includes("grant select on table public.media_assets to service_role"));
  assert.equal(/grant\s+(insert|update|delete|all).*media_assets/i.test(migration), false);
  assert(sql.includes("grant execute on function public.register_media_asset"));
  assert(sql.includes("grant execute on function public.archive_media_asset"));
  for (const helper of [
    "assert_media_asset_service_role", "media_asset_registration_fingerprint_v1",
    "media_asset_archive_fingerprint_v1", "media_asset_before_update_or_delete",
  ]) {
    assert(sql.includes(`revoke all on function public.${helper}`));
  }
});

test("transactional smoke covers required attacks and leaves no assets", () => {
  const sql = compact(smoke);
  assert(sql.startsWith("begin;"));
  assert(sql.endsWith("rollback;"));
  for (const expectation of [
    "identical registration retry must return the same media asset",
    "scoped checksum deduplication must return the existing media asset",
    "conflicting registration retry must be rejected",
    "same reserved asset id with different immutable input must be rejected",
    "same checksum with conflicting technical metadata must be rejected",
    "unversioned storage identity must be unique when version is null",
    "cross-customer source_file must be rejected",
    "source_file metadata mismatch must be rejected",
    "checksum deduplication must not reactivate an archived media asset",
    "immutable media asset metadata update must be rejected",
    "archived media asset reactivation must be rejected",
    "media asset delete must be rejected",
    "anon/authenticated must have no media_assets table privileges",
  ]) {
    assert(sql.includes(expectation), `missing smoke assertion: ${expectation}`);
  }
});

test("migration checksum is available for the review gate", () => {
  const checksum = crypto.createHash("sha256").update(migration).digest("hex");
  assert.match(checksum, /^[0-9a-f]{64}$/);
});
