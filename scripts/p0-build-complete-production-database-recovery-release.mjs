import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = "docs/release-readiness/p0-complete-production-database-recovery";
const versions = ["20260722130000","20260722131000","20260722132000","20260722133000","20260722134000","20260722135000"];
const executionOrder = [
  "supabase/migrations/20260722130000_p0_recover_business_events.sql",
  "supabase/migrations/20260722131000_p0_recover_transactional_lead_intake.sql",
  "supabase/migrations/20260722132000_p0_recover_security_hardening.sql",
  "supabase/migrations/20260722133000_p0_recover_lead_intake_abuse_control.sql",
  "supabase/migrations/20260722134000_p0_remove_verified_staging_smoke_objects.sql",
  "supabase/migrations/20260722135000_p0_recover_sales_manager_lead_policy.sql",
];
const releaseFiles = [
  ...executionOrder,
  ...versions.map((version) => `${evidence}/POSTCONDITIONS_${version}.sql`),
  `${evidence}/PRECONDITIONS.sql`,
  `${evidence}/POSTCONDITIONS.sql`,
  `${evidence}/CATALOG_FINGERPRINT.sql`,
  `${evidence}/TARGET_AND_HISTORY_EVIDENCE.sql`,
  `${evidence}/DEPENDENCY_MATRIX.json`,
  `${evidence}/RUNTIME_CONFIGURATION.json`,
  `${evidence}/ROLLBACK_RECOVERY.md`,
  `${evidence}/EXECUTION_RUNBOOK.md`,
  `${evidence}/LOCAL_VALIDATION.json`,
  `${evidence}/RELEASE_REPORT.md`,
  "scripts/p0-build-complete-production-database-recovery-release.mjs",
  "scripts/p0-complete-production-database-recovery-local-validation.zsh",
  "tests/fixtures/p0-complete-production-database-recovery-baseline.sql",
  "tests/fixtures/p0-complete-production-database-recovery-functional.sql",
  "tests/fixtures/p0-production-poststate-staging-nonce.sql",
  "tests/p0-complete-production-database-recovery-release.test.js",
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
const filesetBytes = read(`${evidence}/FILESET.json`);
const manifestBase = {
  schemaVersion: 1,
  release: "Complete P0 Production Database Recovery Release",
  status: "PACKAGED_AND_LOCALLY_VALIDATED",
  productionTarget: { project: "maxwebstudio", projectRef: "yxxahurphdbblkuxoeje", baselineLatestMigration: "20260718190000" },
  migrationVersions: versions,
  executionOrder,
  supersededMigrations: ["20260722120000","20260722121000","20260722122000","20260722123000","20260722124000","20260722125000","20260722126000"],
  releaseFiles: [...releaseFiles, `${evidence}/FILESET.json`, `${evidence}/MANIFEST.json`],
  hashedFileCount: releaseFiles.length,
  releaseFileCount: releaseFiles.length + 2,
  filesetSha256: sha256(filesetBytes),
  sourceSemantics: { aliases: [["company","company_name"],["name","contact_name"],["website_url","website"]], independent: ["source","external_source"] },
  gateState: { gateA: "PASS", gateBAuthorized: false, gateCAuthorized: false, gateDAuthorized: false },
  selfHashAlgorithm: "SHA-256 over canonical compact JSON with selfHash=null",
  selfHash: null,
  productionContactedReadOnly: true,
  productionChangesPerformed: false,
  productionExecutionAuthorized: false,
};
const manifest = { ...manifestBase, selfHash: sha256(JSON.stringify(manifestBase)) };
writeJson(`${evidence}/MANIFEST.json`, manifest);
console.log(JSON.stringify({ releaseFileCount: manifest.releaseFileCount, filesetSha256: manifest.filesetSha256, manifestSelfHash: manifest.selfHash }, null, 2));
