const test = require("node:test");
const assert = require("node:assert/strict");

const originalFetch = global.fetch;
const originalInfo = console.info;
const originalError = console.error;
const originalEnv = {
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  ALLOW_LEGACY_ADMIN_TOKEN: process.env.ALLOW_LEGACY_ADMIN_TOKEN,
  APP_ENV: process.env.APP_ENV,
  APP_ENVIRONMENT: process.env.APP_ENVIRONMENT,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const adminToken = "observability-admin-fixture";
const serviceRoleKey = "observability-service-fixture";
const journeyId = "f866b859-88f9-4fbd-aee2-11d337e5a88d";
const leadId = "50000000-0000-4000-8000-000000000001";

process.env.ADMIN_TOKEN = adminToken;
process.env.ALLOW_LEGACY_ADMIN_TOKEN = "true";
process.env.APP_ENV = "test";
process.env.APP_ENVIRONMENT = "test";
process.env.SUPABASE_URL = "https://staging.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

const demoJourney = require("../functions/demo-journey");
const { createReadPhaseObserver } = demoJourney._test;

test.afterEach(() => {
  global.fetch = originalFetch;
  console.info = originalInfo;
  console.error = originalError;
});

test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("read phases project the payload while preserving main concurrency", async (t) => {
  const database = observableDatabase({ missingWorkspace: true, generatedContent: "zwaar pakket é🚀" });
  const logs = [];
  global.fetch = database.fetch;
  console.info = (entry) => logs.push(entry);

  const response = await demoJourney.handler(readEvent());
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.journey.id, journeyId);
  assert.equal(body.projectWorkspace, null);
  assert.equal(body.demoJourney.id, journeyId);
  assert.equal(body.records[0].id, journeyId);
  assert.equal(body.events.length, 1);
  assert.equal(Array.isArray(body.templates), true);
  assert.equal(body.buildHistory.latestJob.generatedPackage.files[0].path, "index.html");
  assert.equal(body.buildHistory.latestJob.generatedPackage.files[0].bytes, Buffer.byteLength("zwaar pakket é🚀", "utf8"));
  assert.equal(body.buildHistory.latestJob.generatedPackage.contentIncluded, false);
  assert.deepEqual(body.buildStatus, body.buildHistory.latestJob);
  assert.equal(hasKeyRecursively(body.buildHistory, "content"), false);
  t.diagnostic(`projected handler response bytes: ${Buffer.byteLength(response.body, "utf8")}`);
  for (const phase of ["journey", "events", "build_jobs", "preview_versions", "project_workspace"]) {
    assert.equal(logs.filter((entry) => entry.phase === phase && entry.event === "demo_journey_read_phase_started").length, 1);
    assert.equal(logs.filter((entry) => entry.phase === phase && entry.event === "demo_journey_read_phase_completed").length, 1);
  }
  assert.ok(database.maxConcurrent > 1);
  assert.equal(logs.some((entry) => entry.event === "demo_journey_read_phase_failed"), false);
  const postLogs = postReadLogs(logs);
  assert.deepEqual(postLogs.map((entry) => entry.event), [
    "demo_journey_reads_completed",
    "demo_journey_response_build_started",
    "demo_journey_response_build_completed",
    "demo_journey_handler_returning",
  ]);
  assert.deepEqual(postLogs.map((entry) => entry.responseBytes), [
    null,
    null,
    Buffer.byteLength(response.body, "utf8"),
    Buffer.byteLength(response.body, "utf8"),
  ]);
  for (let index = 1; index < postLogs.length; index += 1) {
    assert.ok(postLogs[index].totalElapsedMs >= postLogs[index - 1].totalElapsedMs);
  }
  assertSafeLogs(logs);
});

test("upstream failure identifies the phase without changing concurrent main behavior", async () => {
  const database = observableDatabase({ failPhase: "events" });
  const logs = [];
  global.fetch = database.fetch;
  console.info = (entry) => logs.push(entry);
  console.error = () => {};

  const response = await demoJourney.handler(readEvent());
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 502);
  assert.equal(body.success, false);
  assert.equal(body.reason, "demo_journey_api_failed");
  const failed = logs.find((entry) => entry.phase === "events" && entry.event === "demo_journey_read_phase_failed");
  assert.equal(failed.upstreamStatus, 502);
  assert.equal(failed.upstreamCode, "UPSTREAM_TIMEOUT");
  assert.deepEqual(postReadLogs(logs), []);
  assert.equal(Object.hasOwn(body, "readPhase"), false);
  assertSafeLogs(logs);
});

test("post-read logger failures cannot change the successful response", async (t) => {
  const eventNames = [
    "demo_journey_reads_completed",
    "demo_journey_response_build_started",
    "demo_journey_response_build_completed",
    "demo_journey_handler_returning",
  ];
  const baselineDatabase = observableDatabase({ missingWorkspace: true });
  global.fetch = baselineDatabase.fetch;
  console.info = () => {};
  const baseline = await demoJourney.handler(readEvent());

  for (const eventName of eventNames) {
    await t.test(eventName, async () => {
      const database = observableDatabase({ missingWorkspace: true });
      global.fetch = database.fetch;
      console.info = (entry) => {
        if (entry.event === eventName) throw new Error("post-read logger failed");
      };

      const response = await demoJourney.handler(readEvent());

      assert.deepEqual(response, baseline);
      assert.deepEqual(database.calls, baselineDatabase.calls);
      assert.ok(database.maxConcurrent > 1);
    });
  }
});

test("a pending upstream call only emits started until controlled release", async () => {
  let release;
  const database = observableDatabase({
    pendingPhase: "events",
    onPending(resolve) { release = resolve; },
  });
  const logs = [];
  global.fetch = database.fetch;
  console.info = (entry) => logs.push(entry);

  const responsePromise = demoJourney.handler(readEvent());
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(typeof release, "function");
  assert.equal(logs.filter((entry) => entry.phase === "events" && entry.event === "demo_journey_read_phase_started").length, 1);
  assert.equal(logs.some((entry) => entry.phase === "events" && entry.event !== "demo_journey_read_phase_started"), false);

  release(json([]));
  const response = await responsePromise;
  assert.equal(response.statusCode, 200);
  assert.equal(logs.some((entry) => entry.phase === "events" && entry.event === "demo_journey_read_phase_failed"), false);
  assertSafeLogs(logs);
});

test("a started logger failure cannot block or duplicate the operation", async () => {
  const expected = { ok: true };
  let calls = 0;
  const observe = createReadPhaseObserver({
    logger(entry) {
      if (entry.event === "demo_journey_read_phase_started") throw new Error("started logger failed");
    },
  });

  const result = await observe("journey", async () => {
    calls += 1;
    return expected;
  });

  assert.strictEqual(result, expected);
  assert.equal(calls, 1);
});

test("a completed logger failure cannot change a successful result", async () => {
  const expected = { rows: ["unchanged"] };
  let calls = 0;
  const observe = createReadPhaseObserver({
    logger(entry) {
      if (entry.event === "demo_journey_read_phase_completed") throw new Error("completed logger failed");
    },
  });

  const result = await observe("events", async () => {
    calls += 1;
    return expected;
  });

  assert.strictEqual(result, expected);
  assert.equal(calls, 1);
});

test("a failed logger failure preserves the original upstream error identity", async () => {
  const original = Object.assign(new Error("original upstream failure"), {
    code: "ORIGINAL_UPSTREAM",
    status: 503,
  });
  let calls = 0;
  const observe = createReadPhaseObserver({
    logger(entry) {
      if (entry.event === "demo_journey_read_phase_failed") throw new Error("failed logger failed");
    },
  });

  await assert.rejects(
    observe("build_jobs", async () => {
      calls += 1;
      throw original;
    }),
    (error) => error === original
      && error.message === "original upstream failure"
      && error.code === "ORIGINAL_UPSTREAM"
      && error.status === 503,
  );
  assert.equal(calls, 1);
});

test("a logger that always throws cannot change success or failure semantics", async () => {
  const observe = createReadPhaseObserver({ logger() { throw new Error("logger always fails"); } });
  const expected = ["stable-result"];
  const original = Object.assign(new Error("stable-error"), { code: "STABLE_ERROR", status: 502 });
  let successCalls = 0;
  let failureCalls = 0;

  const result = await observe("preview_versions", async () => {
    successCalls += 1;
    return expected;
  });
  await assert.rejects(
    observe("project_workspace", async () => {
      failureCalls += 1;
      throw original;
    }),
    (error) => error === original,
  );

  assert.strictEqual(result, expected);
  assert.equal(successCalls, 1);
  assert.equal(failureCalls, 1);
});

function observableDatabase(options = {}) {
  const state = { calls: [], concurrent: 0, maxConcurrent: 0 };
  state.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    const phase = phaseForPath(path);
    if (!phase) throw new Error("Unexpected local mock request.");
    state.calls.push(phase);
    state.concurrent += 1;
    state.maxConcurrent = Math.max(state.maxConcurrent, state.concurrent);
    try {
      if (options.pendingPhase === phase) {
        return await new Promise((resolve) => options.onPending(resolve));
      }
      await Promise.resolve();
      if (options.failPhase === phase) return json({ code: "UPSTREAM_TIMEOUT", message: "Safe upstream failure" }, 502);
      if (phase === "journey") return json([journeyRow()]);
      if (phase === "events") return json([{ id: "event-fixture", demo_journey_id: journeyId, event_type: "created", created_at: "2026-07-19T08:00:00.000Z" }]);
      if (phase === "build_jobs") return json([{ id: "build-fixture", demo_journey_id: journeyId, status: "succeeded", generated_package: generatedPackage(options.generatedContent), created_at: "2026-07-19T08:00:00.000Z" }]);
      if (phase === "preview_versions") return json([{ id: "preview-fixture", demo_journey_id: journeyId, version: 2, is_active: true, package_checksum: "a".repeat(64), generated_package: generatedPackage(options.generatedContent) }]);
      if (phase === "project_workspace" && options.missingWorkspace) {
        return json({ code: "PGRST205", message: "Could not find project_workspaces in the schema cache" }, 404);
      }
      if (phase === "public_preview_publication") return json([]);
      return json([]);
    } finally {
      state.concurrent -= 1;
    }
  };
  return state;
}

function phaseForPath(path) {
  return ({
    "/rest/v1/demo_journeys": "journey",
    "/rest/v1/demo_journey_events": "events",
    "/rest/v1/website_build_jobs": "build_jobs",
    "/rest/v1/website_preview_versions": "preview_versions",
    "/rest/v1/project_workspaces": "project_workspace",
    "/rest/v1/public_preview_publications": "public_preview_publication",
  })[path] || "";
}

function journeyRow() {
  return {
    id: journeyId,
    lead_id: leadId,
    business_name: "Synthetic fixture",
    demo_status: "interne_preview_klaar",
    created_by: "system:legacy-admin-token",
    updated_at: "2026-07-19T08:00:00.000Z",
  };
}

function generatedPackage(content) {
  return content === undefined ? null : {
    version: 2,
    files: [{ path: "index.html", content }],
    meta: { template: "premium", customerWishes: "must not leave the function" },
  };
}

function hasKeyRecursively(value, target) {
  if (Array.isArray(value)) return value.some((item) => hasKeyRecursively(item, target));
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).some((key) => key === target || hasKeyRecursively(value[key], target));
}

function readEvent() {
  return {
    httpMethod: "GET",
    path: "/.netlify/functions/demo-journey",
    headers: { authorization: `Bearer ${adminToken}` },
    queryStringParameters: { id: journeyId },
    body: null,
  };
}

function assertSafeLogs(logs) {
  for (const entry of logs) {
    const allowedKeys = entry.event.startsWith("demo_journey_read_phase_")
      ? ["event", "phase", "elapsedMs", "upstreamStatus", "upstreamCode"]
      : ["event", "elapsedMs", "totalElapsedMs", "responseBytes"];
    assert.deepEqual(Object.keys(entry).sort(), allowedKeys.sort());
    const serialized = JSON.stringify(entry);
    for (const forbidden of ["https://", "?", adminToken, serviceRoleKey, journeyId, leadId, "authorization", "headers", "body", "Synthetic fixture"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  }
}

function readLogs(logs) {
  return logs.filter((entry) => entry.event.startsWith("demo_journey_read_phase_"));
}

function postReadLogs(logs) {
  return logs.filter((entry) => [
    "demo_journey_reads_completed",
    "demo_journey_response_build_started",
    "demo_journey_response_build_completed",
    "demo_journey_handler_returning",
  ].includes(entry.event));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
