"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const workerPath = path.join(root, "scripts/website-factory-browser-worker.mjs");
const worker = fs.readFileSync(workerPath, "utf8");
const endpoint = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/website-factory-browser-worker.yml"), "utf8");

test("browser worker is dependency-free and exposes a safe configuration check", () => {
  const help = spawnSync(process.execPath, [workerPath, "--help"], { cwd: root, encoding: "utf8" });

  assert.equal(help.status, 0);
  assert.match(help.stdout, /FACTORY_BASE_URL/);
  assert.doesNotMatch(worker, /from ["'](?:playwright|puppeteer)/);
  assert.match(worker, /typeof WebSocket !== "function"/);
});

test("worker reviews mobile, tablet and desktop and submits immutable evidence", () => {
  assert.match(worker, /mobile: \{ width: 390, height: 844 \}/);
  assert.match(worker, /tablet: \{ width: 768, height: 1024 \}/);
  assert.match(worker, /desktop: \{ width: 1440, height: 1000 \}/);
  assert.match(worker, /artifactHash/);
  assert.match(worker, /submit_browser_review/);
  assert.match(worker, /Page\.captureScreenshot/);
  assert.match(worker, /Runtime\.exceptionThrown/);
  assert.match(worker, /unlabeledControls/);
  assert.match(worker, /brokenImages/);
  assert.match(worker, /status: "worker_error"/);
  assert.match(worker, /worker-error\.json/);
  assert.match(worker, /redactUrl\(queuedJob\?\.previewUrl\)/);
  assert.match(worker, /state === "interactive"/);
  assert.match(worker, /attempt < 300/);
});

test("Factory exposes only eligible builds through the browser review queue", () => {
  assert.match(endpoint, /action === "get_browser_review_queue"/);
  assert.match(endpoint, /BROWSER_QUEUE_MANAGER_REQUIRED/);
  assert.match(endpoint, /managerRoles\.has\(cleanText\(context\.admin\?\.role\)\)/);
  assert.match(endpoint, /qualityReport\?\.readiness\?\.customerPreview !== true/);
  assert.match(endpoint, /qualityReport\?\.browserReview\?\.required === true/);
  assert.match(endpoint, /qualityReport\?\.browserReview\?\.status === "not_run"/);
  assert.match(endpoint, /qualityReport\?\.readiness\?\.reason === "browser_review_required"/);
  assert.match(endpoint, /qualityReport\?\.browserRepair\?\.status === "awaiting_recheck"/);
  assert.match(endpoint, /isUsableGeneratedPackage\(job\.generatedPackage\)/);
  assert.match(endpoint, /offset: String\(offset\)/);
  assert.match(endpoint, /while \(jobs\.length < requestedLimit && offset < maxScannedRows\)/);
  assert.match(endpoint, /pageSize = Math\.max\(50, requestedLimit \* 10\)/);
  assert.match(endpoint, /select: BUILD_JOB_QUEUE_SCAN_FIELDS/);
  assert.match(endpoint, /readBuildJobRuntimeById\(context, candidate\.id/);
  assert.match(endpoint, /order: "updated_at\.desc"/);
  assert.doesNotMatch(endpoint, /limit: String\(requestedLimit \* 3\)/);
});

test("scheduled workflow is bounded, serialized and preserves its evidence", () => {
  assert.match(workflow, /cron: "\*\/10 \* \* \* \*"/);
  assert.match(workflow, /timeout-minutes: 15/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /FACTORY_ADMIN_JWT:/);
  assert.match(workflow, /vars\.FACTORY_BASE_URL/);
  assert.doesNotMatch(workflow, /secrets\.FACTORY_BASE_URL/);
  assert.match(worker, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(worker, /maxwebstudio-website-factory-browser-worker/);
});
