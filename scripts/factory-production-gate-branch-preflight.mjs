import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = JSON.parse(fs.readFileSync(path.join(root, "docs/release-readiness/factory-production-gate-v1/STAGING_TARGET.json"), "utf8"));
const observedBranch = String(process.env.NETLIFY_STAGING_BRANCH || "").trim();

assert.equal(target.environment, "staging");
assert.equal(target.supabaseProjectRef, "xlxpuuycigeqhgxqtzni");
assert.equal(target.netlifySiteId, "67b2b8af-83fc-4c61-9cd8-2f78842b7615");
assert.equal(target.configurationChangeAuthorized, false);
assert.ok(observedBranch, "NETLIFY_STAGING_BRANCH is required");
assert.equal(observedBranch, target.approvedReleaseBranch, `Netlify staging branch mismatch: expected ${target.approvedReleaseBranch}`);

process.stdout.write(`${JSON.stringify({ status: "PASS_FACTORY_GATE_STAGING_BRANCH", site: target.netlifySiteName, branch: observedBranch })}\n`);
