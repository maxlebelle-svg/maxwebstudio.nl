const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const staging = path.join(root, "supabase-environments/staging");
const canonical = path.join(staging, "supabase/migrations");
const general = path.join(root, "supabase/migrations");
const manifest = JSON.parse(fs.readFileSync(path.join(staging, "migration-manifest.json"), "utf8"));
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sql = (directory) => fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
const runDenied = (args, environment = {}) => spawnSync("zsh", [path.join(staging, "run.zsh"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, ...environment } });

test("validator certifies the reconciled static staging root", async () => {
  const { validateGovernedStagingRoot } = await import(path.join(root, "scripts/validate-governed-staging-root.mjs"));
  const result = validateGovernedStagingRoot(root);
  assert.equal(result.status, "PASS_GOVERNED_STAGING_ROOT_STATIC");
  assert.equal(result.applied, 35);
  assert.deepEqual(result.pending, ["20260729200000"]);
});

test("manifest is locked to maxwebstudio-test and forbids production plus Silverado", () => {
  assert.equal(manifest.targetProjectRef, "xlxpuuycigeqhgxqtzni");
  assert.deepEqual(manifest.forbiddenProjectRefs, ["yxxahurphdbblkuxoeje", "obprooubcbnfgouytvrw"]);
  assert.equal(fs.readFileSync(path.join(staging, "target-project-ref"), "utf8").trim(), manifest.targetProjectRef);
});

test("manifest records exactly the 35 evidenced remote-applied versions", () => {
  assert.equal(manifest.applied.length, 35);
  assert.equal(new Set(manifest.applied.map((item) => item.version)).size, 35);
  assert(manifest.applied.every((item) => item.remoteStatus === "applied" && item.classification === "applied"));
  assert.deepEqual(manifest.applied.slice(-3).map((item) => item.version), ["20260729120000", "20260729170000", "20260729180000"]);
});

test("Factory Hub, Food Demo Bundle and ACL repair checksums remain exact", () => {
  const expected = new Map([
    ["20260729120000", "070243fb04f11a2828950e64074684332ac4549666ae37a0324ea000bdc11638"],
    ["20260729170000", "010c01ffc9c2ac2cd01d85196a93c27d2a8cf5dde5ac5d629350ef7a620b56e2"],
    ["20260729180000", "737bfc5f3d8e519fdddb4baeee010941a712c7dc90841c0c053617847b5a8f5e"],
  ]);
  for (const [version, checksum] of expected) assert.equal(manifest.applied.find((item) => item.version === version).sha256, checksum);
});

test("Production Gate is chronologically next and the only pending candidate", () => {
  assert.deepEqual(manifest.pending.map((item) => item.version), ["20260729200000"]);
  assert.equal(manifest.pending[0].filename, "20260729200000_factory_production_gate.sql");
  assert.equal(manifest.pending[0].sha256, "830e113abb432417d50262ef45f48a390e2cbd900a5a45c2fb1faeb6360132d5");
  assert(manifest.applied.every((item) => Number(item.version) < 20260729200000));
});

test("canonical root contains all 35 applied migrations plus only Production Gate", () => {
  const expected = [...manifest.applied, ...manifest.pending].map((item) => item.filename).sort();
  assert.deepEqual(sql(canonical), expected);
  assert.equal(expected.length, 36);
});

test("every canonical byte matches checksum, source path and committed Git blob", () => {
  for (const entry of [...manifest.applied, ...manifest.pending]) {
    const canonicalFile = path.join(canonical, entry.filename);
    const sourceFile = path.join(root, entry.sourcePath);
    assert.equal(sha(canonicalFile), entry.sha256, entry.filename);
    assert.equal(fs.readFileSync(canonicalFile).equals(fs.readFileSync(sourceFile)), true, entry.filename);
    assert.equal(execFileSync("git", ["rev-parse", `${entry.sourceCommit}:${entry.sourcePath}`], { cwd: root, encoding: "utf8" }).trim(), entry.blobId, entry.filename);
  }
});

test("every general migration has exactly one applied or excluded classification", () => {
  const classified = [...manifest.applied.filter((item) => fs.existsSync(path.join(general, item.filename))), ...manifest.excluded].map((item) => item.filename).sort();
  assert.deepEqual(sql(general), classified);
  assert.equal(new Set(classified).size, classified.length);
});

test("excluded line contains 31 provider blockers and seven later feature migrations", () => {
  assert.equal(manifest.excluded.length, 38);
  assert.equal(manifest.excluded.filter((item) => item.providerBlockingOlderMigration).length, 31);
  assert.equal(manifest.excluded.filter((item) => !item.providerBlockingOlderMigration).length, 7);
  assert.equal(manifest.excluded.some((item) => item.version === "20260729180000"), false);
});

test("general migration fingerprint remains immutable", () => {
  const fingerprint = sql(general).map((filename) => `${filename} ${sha(path.join(general, filename))}\n`).join("");
  assert.equal(crypto.createHash("sha256").update(fingerprint).digest("hex"), manifest.generalMigrationRootFingerprint);
});

test("governed root contains no seed, Auth or Storage mutation bundle", () => {
  assert.equal(fs.existsSync(path.join(staging, "supabase/seed.sql")), false);
  assert.equal(fs.existsSync(path.join(staging, "supabase/auth")), false);
  assert.equal(fs.existsSync(path.join(staging, "supabase/storage")), false);
});

test("runner fails before provider access without the explicit staging lock", () => {
  const result = runDenied(["list"], { MWS_STAGING_PROJECT_REF: "" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /MWS_STAGING_PROJECT_REF/);
});

test("runner rejects production and Silverado locks", () => {
  for (const ref of manifest.forbiddenProjectRefs) {
    const result = runDenied(["list"], { MWS_STAGING_PROJECT_REF: ref });
    assert.equal(result.status, 64);
    assert.match(result.stderr, /must equal xlxpuuycigeqhgxqtzni/);
  }
});

test("runner refuses include-all, repair, reset and arbitrary db-push", () => {
  for (const argument of ["--include-all", "repair", "reset", "db-push"]) {
    const result = runDenied(["list", argument], { MWS_STAGING_PROJECT_REF: "xlxpuuycigeqhgxqtzni" });
    assert.equal(result.status, 64, argument);
  }
});

test("runner exposes only list, dry-run and the exact Production Gate apply action", () => {
  const source = fs.readFileSync(path.join(staging, "run.zsh"), "utf8");
  assert.match(source, /apply-production-gate/);
  assert.doesNotMatch(source, /apply-factory|apply-food|migration repair|db reset/);
  assert.match(source, /migration up --linked/);
});
