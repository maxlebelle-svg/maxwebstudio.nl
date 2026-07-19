const assert = require("node:assert/strict");
const test = require("node:test");

const { runBuildJob } = require("../functions/website-factory");
const demoJourney = require("../functions/demo-journey");

const journeyId = "11111111-1111-4111-8111-111111111111";
const admin = { id: "system:rc15-test", role: "super_admin", status: "active" };
const context = { supabaseUrl: "https://local.test", serviceRoleKey: "local-service-key", admin };
const briefing = "Branche: schilder\nDiensten: binnenschilderwerk, buitenschilderwerk\nDoelgroep: woningeigenaren\nRegio: Amsterdam";
const originalAuthEnv = {
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  ALLOW_LEGACY_ADMIN_TOKEN: process.env.ALLOW_LEGACY_ADMIN_TOKEN,
  APP_ENV: process.env.APP_ENV,
  APP_ENVIRONMENT: process.env.APP_ENVIRONMENT,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

process.env.ADMIN_TOKEN = "rc15c-local-admin-fixture";
process.env.ALLOW_LEGACY_ADMIN_TOKEN = "true";
process.env.APP_ENV = "test";
process.env.APP_ENVIRONMENT = "test";
process.env.SUPABASE_URL = context.supabaseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = context.serviceRoleKey;

test.after(() => {
  for (const [key, value] of Object.entries(originalAuthEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

function factoryDatabase() {
  const state = {
    journey: {
      id: journeyId,
      business_name: "Schilderbedrijf Test",
      contact_name: "Max",
      email: "max@example.test",
      phone: "0612345678",
      website_url: "https://example.test",
      generated_briefing: briefing,
      preview_package: {},
      created_by: admin.id,
      updated_by: admin.id,
    },
    jobs: [],
    previews: [],
    events: [],
    failPromotion: false,
  };

  state.fetch = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    const body = options.body ? JSON.parse(options.body) : {};
    const method = options.method || "GET";

    if (url.pathname === "/rest/v1/demo_journeys" && method === "GET") return response(200, [state.journey]);

    if (url.pathname === "/rest/v1/demo_journeys" && method === "PATCH") {
      Object.assign(state.journey, body);
      return response(200, [state.journey]);
    }

    if (url.pathname === "/rest/v1/project_workspaces") {
      return response(404, { code: "PGRST205", message: "Could not find project_workspaces in the schema cache" });
    }

    if (url.pathname === "/rest/v1/website_build_jobs" && method === "GET") {
      const id = (url.searchParams.get("id") || "").replace(/^eq\./, "");
      const fingerprint = (url.searchParams.get("request_fingerprint") || "").replace(/^eq\./, "");
      return response(200, state.jobs.filter((job) => (!id || job.id === id) && (!fingerprint || job.request_fingerprint === fingerprint)));
    }

    if (url.pathname === "/rest/v1/website_build_jobs" && method === "POST") {
      if (state.jobs.some((job) => job.demo_journey_id === body.demo_journey_id && job.request_fingerprint === body.request_fingerprint)) {
        return response(409, { code: "23505", message: "duplicate build fingerprint" });
      }
      const row = {
        ...body,
        id: `22222222-2222-4222-8222-${String(state.jobs.length + 1).padStart(12, "0")}`,
        created_at: "2026-07-19T17:00:00.000Z",
        updated_at: "2026-07-19T17:00:00.000Z",
      };
      state.jobs.push(row);
      return response(201, [row]);
    }

    if (url.pathname === "/rest/v1/website_build_jobs" && method === "PATCH") {
      const id = (url.searchParams.get("id") || "").replace(/^eq\./, "");
      const allowed = decodeURIComponent(url.searchParams.get("status") || "").replace(/^in\.\(|\)$/g, "").split(",");
      const row = state.jobs.find((job) => job.id === id && allowed.includes(job.status));
      if (!row) return response(200, []);
      Object.assign(row, body, { updated_at: "2026-07-19T17:00:01.000Z" });
      return response(200, [row]);
    }

    if (url.pathname === "/rest/v1/website_preview_versions" && method === "GET") {
      const buildId = (url.searchParams.get("build_job_id") || "").replace(/^eq\./, "");
      return response(200, state.previews.filter((preview) => !buildId || preview.build_job_id === buildId));
    }

    if (url.pathname === "/rest/v1/rpc/promote_website_factory_preview" && method === "POST") {
      if (state.failPromotion) return response(500, { code: "forced_promotion_failure", message: "forced promotion failure" });
      const existing = state.previews.find((preview) => preview.build_job_id === body.p_build_job_id);
      if (existing) return response(200, [{ ...existing, generated_package: null, preview_version_id: existing.id, created: false }]);
      const job = state.jobs.find((candidate) => candidate.id === body.p_build_job_id);
      state.previews.forEach((preview) => { preview.is_active = false; });
      const preview = {
        id: `33333333-3333-4333-8333-${String(state.previews.length + 1).padStart(12, "0")}`,
        demo_journey_id: journeyId,
        build_job_id: job.id,
        version: state.previews.length + 1,
        preview_url: body.p_preview_url,
        preview_token: body.p_preview_token,
        generated_package: job.generated_package,
        package_checksum: job.package_checksum,
        is_active: true,
        created_at: "2026-07-19T17:00:02.000Z",
        created_by: body.p_created_by,
      };
      state.previews.push(preview);
      Object.assign(state.journey, {
        preview_url: preview.preview_url,
        preview_token: preview.preview_token,
        preview_package: preview.generated_package,
        generated_briefing: job.generated_package.meta.customerWishes,
        demo_status: "interne_preview_klaar",
      });
      return response(200, [{ ...preview, generated_package: null, preview_version_id: preview.id, created: true }]);
    }

    if (url.pathname === "/rest/v1/demo_journey_events" && method === "GET") {
      const description = (url.searchParams.get("description") || "").replace(/^eq\./, "");
      return response(200, state.events.filter((event) => event.description === description));
    }

    if (url.pathname === "/rest/v1/demo_journey_events" && method === "POST") {
      state.events.push(body);
      return response(201, []);
    }

    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  };
  return state;
}

test("successful retry reuses one build, one preview, one checksum and one event", async (t) => {
  const database = factoryDatabase();
  const previousFetch = global.fetch;
  global.fetch = database.fetch;
  t.after(() => { global.fetch = previousFetch; });

  const first = await runBuildJob(context, { demoJourneyId: journeyId, generatedBriefing: briefing, packageType: "starter" });
  const reopened = JSON.parse(JSON.stringify({ job: database.jobs[0], preview: database.previews[0] }));
  const retry = await runBuildJob(context, { demoJourneyId: journeyId, generatedBriefing: briefing, packageType: "starter" });

  assert.equal(first.job.status, "succeeded");
  assert.match(first.job.packageChecksum, /^[0-9a-f]{64}$/);
  assert.equal(first.previewVersion.id, retry.previewVersion.id);
  assert.equal(first.previewVersion.version, 1);
  assert.equal(first.previewVersion.packageChecksum, first.job.packageChecksum);
  assert.deepEqual(first.previewVersion.generatedPackage, first.job.generatedPackage);
  assert.equal(reopened.job.id, retry.job.id);
  assert.equal(reopened.job.request_fingerprint, retry.job.requestFingerprint);
  assert.equal(reopened.preview.id, retry.previewVersion.id);
  assert.equal(reopened.preview.version, retry.previewVersion.version);
  assert.equal(reopened.preview.preview_url, retry.previewVersion.previewUrl);
  assert.equal(reopened.preview.preview_token, retry.previewVersion.previewToken);
  assert.deepEqual(reopened.preview.generated_package, retry.previewVersion.generatedPackage);
  assert.equal(reopened.preview.package_checksum, retry.job.packageChecksum);
  assert.equal(reopened.preview.is_active, true);
  assert.equal(database.jobs.length, 1);
  assert.equal(database.previews.length, 1);
  assert.equal(database.events.length, 1);
});

test("generate_preview retry without previewUrl preserves the promoted journey URL", async (t) => {
  const database = factoryDatabase();
  const previousFetch = global.fetch;
  global.fetch = database.fetch;
  t.after(() => { global.fetch = previousFetch; });
  const event = {
    httpMethod: "POST",
    path: "/.netlify/functions/demo-journey",
    headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}`, "content-type": "application/json" },
    queryStringParameters: {},
    body: JSON.stringify({
      action: "generate_preview",
      id: journeyId,
      generatedBriefing: briefing,
      packageType: "starter",
    }),
  };

  const firstResponse = await demoJourney.handler(event);
  assert.equal(firstResponse.statusCode, 200);
  const beforeRetry = JSON.parse(JSON.stringify({
    journey: database.journey,
    job: database.jobs[0],
    preview: database.previews[0],
  }));
  assert.ok(beforeRetry.journey.preview_url);

  const retryResponse = await demoJourney.handler(event);
  assert.equal(retryResponse.statusCode, 200);
  assert.equal(database.journey.preview_url, beforeRetry.journey.preview_url);
  assert.equal(database.journey.preview_token, beforeRetry.journey.preview_token);
  assert.deepEqual(database.journey.preview_package, beforeRetry.journey.preview_package);
  assert.equal(database.jobs[0].id, beforeRetry.job.id);
  assert.equal(database.jobs[0].request_fingerprint, beforeRetry.job.request_fingerprint);
  assert.equal(database.jobs[0].package_checksum, beforeRetry.job.package_checksum);
  assert.equal(database.previews[0].id, beforeRetry.preview.id);
  assert.equal(database.previews[0].version, 1);
  assert.equal(database.jobs.length, 1);
  assert.equal(database.previews.length, 1);
  assert.equal(database.events.length, 1);
});

test("changed input creates version 2 while a failed version 3 promotion preserves it", async (t) => {
  const database = factoryDatabase();
  const previousFetch = global.fetch;
  global.fetch = database.fetch;
  t.after(() => { global.fetch = previousFetch; });

  const first = await runBuildJob(context, { demoJourneyId: journeyId, generatedBriefing: briefing, packageType: "starter" });
  const second = await runBuildJob(context, { demoJourneyId: journeyId, generatedBriefing: `${briefing}\nStijl: premium`, packageType: "premium" });
  assert.equal(second.previewVersion.version, 2);
  assert.equal(database.previews[0].is_active, false);
  assert.equal(database.previews[1].is_active, true);
  assert.notEqual(first.job.requestFingerprint, second.job.requestFingerprint);
  assert.notEqual(first.job.packageChecksum, second.job.packageChecksum);
  assert.equal(database.journey.generated_briefing, `${briefing}\nStijl: premium`);

  database.failPromotion = true;
  await assert.rejects(
    runBuildJob(context, { demoJourneyId: journeyId, generatedBriefing: `${briefing}\nStijl: minimalistisch`, packageType: "business" }),
    /forced promotion failure/,
  );
  assert.equal(database.previews.length, 2);
  assert.equal(database.previews[1].is_active, true);
  assert.equal(database.journey.preview_token, database.previews[1].preview_token);
  assert.equal(database.journey.generated_briefing, `${briefing}\nStijl: premium`);
  assert.equal(database.jobs[2].status, "failed");
  assert.equal(database.jobs[2].error_phase, "promote_preview");

  const failedChecksum = database.jobs[2].package_checksum;
  database.failPromotion = false;
  const resumed = await runBuildJob(context, { demoJourneyId: journeyId, generatedBriefing: `${briefing}\nStijl: minimalistisch`, packageType: "business" });
  assert.equal(database.jobs.length, 3);
  assert.equal(resumed.job.id, database.jobs[2].id);
  assert.equal(resumed.job.packageChecksum, failedChecksum);
  assert.equal(resumed.previewVersion.version, 3);
  assert.equal(database.previews.length, 3);
  assert.equal(database.journey.generated_briefing, `${briefing}\nStijl: minimalistisch`);
});

test("concurrent identical builds converge on one build and one active preview", async (t) => {
  const database = factoryDatabase();
  const previousFetch = global.fetch;
  global.fetch = database.fetch;
  t.after(() => { global.fetch = previousFetch; });

  const [first, retry] = await Promise.all([
    runBuildJob(context, { demoJourneyId: journeyId, generatedBriefing: briefing, packageType: "starter" }),
    runBuildJob(context, { demoJourneyId: journeyId, generatedBriefing: briefing, packageType: "starter" }),
  ]);

  assert.equal(first.job.id, retry.job.id);
  assert.equal(database.jobs.length, 1);
  assert.equal(database.previews.length, 1);
  assert.equal(database.previews.filter((preview) => preview.is_active).length, 1);
  assert.equal(database.events.length, 1);
});

test("generate_preview does not publish changed briefing when promotion fails", async (t) => {
  const database = factoryDatabase();
  const previousFetch = global.fetch;
  global.fetch = database.fetch;
  t.after(() => { global.fetch = previousFetch; });

  await runBuildJob(context, { demoJourneyId: journeyId, generatedBriefing: briefing, packageType: "starter" });
  const activeBriefing = database.journey.generated_briefing;
  database.failPromotion = true;
  const event = {
    httpMethod: "POST",
    path: "/.netlify/functions/demo-journey",
    headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}`, "content-type": "application/json" },
    queryStringParameters: {},
    body: JSON.stringify({
      action: "generate_preview",
      id: journeyId,
      generatedBriefing: `${briefing}\nStijl: editorial`,
      packageType: "premium",
    }),
  };

  const failed = await demoJourney.handler(event);
  assert.equal(failed.statusCode, 500);
  assert.equal(database.journey.generated_briefing, activeBriefing);
  assert.equal(database.previews.length, 1);
  assert.equal(database.previews[0].is_active, true);
});
