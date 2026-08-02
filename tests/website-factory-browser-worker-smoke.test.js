"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const { mkdtemp, readFile, access, rm } = require("node:fs/promises");
const { spawn } = require("node:child_process");

const enabled = process.env.RUN_FACTORY_BROWSER_SMOKE === "1";

test("headless worker inspects three viewports and submits browser evidence", { skip: !enabled, timeout: 60000 }, async () => {
  const root = path.join(__dirname, "..");
  const output = await mkdtemp(path.join(os.tmpdir(), "mws-browser-worker-"));
  let submittedEvidence = null;
  let workerAuthorization = "";
  const hash = "a".repeat(64);
  const server = http.createServer(async (request, response) => {
    if (request.url.startsWith("/oidc")) {
      const requestUrl = new URL(request.url, origin(server));
      assert.equal(requestUrl.searchParams.get("audience"), "maxwebstudio-website-factory-browser-worker");
      assert.equal(request.headers.authorization, "Bearer github-request-token");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ value: "oidc-smoke-token" }));
      return;
    }
    if (request.url === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    if (request.url === "/preview") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px Arial;color:#123}main{max-width:1000px;margin:auto;padding:32px}section{padding:48px 0}button,input{font:inherit;padding:12px}</style></head><body><main><h1>Studio Morgen</h1><section><h2>Behandelingen</h2><p>Persoonlijke aandacht voor uw huid.</p><button type="button">Plan een afspraak</button></section><form><label for="email">E-mail</label><input id="email" name="email"></form></main></body></html>');
      return;
    }
    if (request.url === "/.netlify/functions/website-factory" && request.method === "POST") {
      workerAuthorization = request.headers.authorization || "";
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw || "{}");
      response.writeHead(200, { "Content-Type": "application/json" });
      if (body.action === "get_browser_review_queue") {
        response.end(JSON.stringify({ success: true, jobs: [{ id: "smoke-job", previewUrl: `${origin(server)}/preview`, artifactHash: hash }] }));
        return;
      }
      if (body.action === "submit_browser_review") {
        submittedEvidence = body.evidence;
        response.end(JSON.stringify({ success: true, customerPreviewReady: true, browserReview: { passed: true, score: 95 }, browserRepair: { status: "passed" } }));
        return;
      }
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const child = spawn(process.execPath, [path.join(root, "scripts/website-factory-browser-worker.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        FACTORY_BASE_URL: origin(server),
        FACTORY_ADMIN_JWT: "",
        ACTIONS_ID_TOKEN_REQUEST_URL: `${origin(server)}/oidc?apiVersion=1`,
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "github-request-token",
        FACTORY_BROWSER_OUTPUT_DIR: output,
        CHROME_BIN: process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const exitCode = await new Promise((resolve) => child.on("close", resolve));
    assert.equal(exitCode, 0, stderr || stdout);
    assert.equal(submittedEvidence.schemaVersion, "mws.browser-review.v1");
    assert.equal(workerAuthorization, "Bearer oidc-smoke-token");
    assert.equal(submittedEvidence.artifactHash, hash);
    assert.deepEqual(Object.keys(submittedEvidence.viewports), ["mobile", "tablet", "desktop"]);
    assert.ok(
      Object.values(submittedEvidence.viewports).every((viewport) => viewport.checks.console.status === "passed"),
      JSON.stringify(Object.fromEntries(Object.entries(submittedEvidence.viewports).map(([name, viewport]) => [name, viewport.checks.console])), null, 2),
    );
    const run = JSON.parse(await readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.status, "passed");
    await Promise.all(["mobile", "tablet", "desktop"].map((name) => access(path.join(output, "smoke-job", "attempt-1", `${name}.png`))));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(output, { recursive: true, force: true });
  }
});

function origin(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}
