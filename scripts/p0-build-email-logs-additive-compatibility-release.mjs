import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = "docs/release-readiness/p0-email-logs-additive-compatibility";
const executionOrder = ["supabase/migrations/20260722136000_p0_email_logs_additive_compatibility.sql"];
const releaseFiles = [
  ...executionOrder,
  `${evidence}/PRECONDITIONS.sql`,
  `${evidence}/POSTCONDITIONS.sql`,
  `${evidence}/EXPECTED_PRODUCTION_PRESTATE.json`,
  `${evidence}/ROLLBACK_RECOVERY.md`,
  `${evidence}/LOCAL_VALIDATION.json`,
  `${evidence}/RELEASE_REPORT.md`,
  "scripts/p0-build-email-logs-additive-compatibility-release.mjs",
  "scripts/p0-email-logs-additive-compatibility-local-validation.zsh",
  "tests/fixtures/p0-email-logs-additive-compatibility-baseline.sql",
  "tests/p0-email-logs-additive-compatibility-release.test.js",
];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (relative) => fs.readFileSync(path.join(root, relative));
const writeJson = (relative, value) => fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);

const fileset = {
  schemaVersion: 1,
  executionOrder,
  files: releaseFiles.map((relative) => {
    const bytes = read(relative);
    return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
  }),
};
writeJson(`${evidence}/FILESET.json`, fileset);

const manifestBase = {
  schemaVersion: 1,
  release: "P0 Email Logs Additive Compatibility Correction Release",
  status: "EXECUTED_AND_FINAL_COMPATIBILITY_VERIFIED",
  productionTarget: {
    project: "maxwebstudio",
    projectRef: "yxxahurphdbblkuxoeje",
    baselineLatestMigration: "20260722135000",
  },
  migrationVersions: ["20260722136000"],
  executionOrder,
  releaseFiles: [...releaseFiles, `${evidence}/FILESET.json`, `${evidence}/MANIFEST.json`],
  hashedFileCount: releaseFiles.length,
  releaseFileCount: releaseFiles.length + 2,
  filesetSha256: sha256(read(`${evidence}/FILESET.json`)),
  impactClassification: "ACCEPTABLE_UPDATED_AT_MIGRATION_EFFECT",
  productionReadOnlyCompatibilityVerified: true,
  gateDPreparationEligible: true,
  releaseType: "DATABASE_ONLY_APPEND_ONLY_COMPATIBILITY",
  applicationChangesPerformed: false,
  productionContactedWithWrites: false,
  productionChangesPerformed: false,
  gateDRetryAuthorized: false,
  selfHashAlgorithm: "SHA-256 over canonical compact JSON with selfHash=null",
  selfHash: null,
};
const manifest = { ...manifestBase, selfHash: sha256(JSON.stringify(manifestBase)) };
writeJson(`${evidence}/MANIFEST.json`, manifest);
console.log(JSON.stringify({
  releaseFileCount: manifest.releaseFileCount,
  hashedFileCount: manifest.hashedFileCount,
  migrationSha256: fileset.files[0].sha256,
  filesetSha256: manifest.filesetSha256,
  manifestSelfHash: manifest.selfHash,
}, null, 2));
