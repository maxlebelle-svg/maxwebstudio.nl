const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts/factory-production-gate-branch-preflight.mjs");
function run(branch) { return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", env: { ...process.env, NETLIFY_STAGING_BRANCH: branch } }); }

test("staging branch preflight accepts only the approved Production Gate release branch", () => {
  const pass = run("codex/factory-hub-staging-certification");
  assert.equal(pass.status, 0);
  assert.match(pass.stdout, /PASS_FACTORY_GATE_STAGING_BRANCH/);
  const stale = run("codex/partner-onboarding-v1-staging-ready");
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /Netlify staging branch mismatch/);
  const missing = run("");
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /NETLIFY_STAGING_BRANCH is required/);
});
