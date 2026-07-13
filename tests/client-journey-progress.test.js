const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createHandler } = require("../functions/client-journey-progress");
const { createClientJourneyReadService } = require("../functions/journey/clientReadService");
const { isSafeClientActionUrl, resolveClientAction } = require("../functions/journey/clientActionPolicy");
const { createClientJourneyReadRepository } = require("../functions/journey/clientReadRepository");

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const INSTANCE_ID = "33333333-3333-4333-8333-333333333333";
const DEFINITION_ID = "44444444-4444-4444-8444-444444444444";

function repository(snapshot, customer = { id: CUSTOMER_ID, auth_user_id: USER_ID, company: "Testbedrijf", package: "WEB-BUSINESS" }) {
  return {
    reads: 0,
    resolves: 0,
    async resolveCustomer(authUserId) { this.resolves += 1; assert.equal(authUserId, USER_ID); return customer; },
    async readSnapshot(resolvedCustomer) { this.reads += 1; assert.equal(resolvedCustomer.id, CUSTOMER_ID); return { customer, ...snapshot }; },
  };
}

function realJourneySnapshot(overrides = {}) {
  return {
    instance: {
      id: INSTANCE_ID,
      definition_id: DEFINITION_ID,
      customer_id: CUSTOMER_ID,
      journey_type: "website.direct_checkout",
      definition_version: 1,
      current_step: "website_build",
      status: "active",
      product_code: "WEB-BUSINESS",
      updated_at: "2026-07-13T10:00:00.000Z",
      metadata: { internalNote: "never expose", stepStates: { order_received: "completed", payment_confirmed: "completed", onboarding_information: "completed", content_ready: "completed", website_build: "in_progress" } },
      ...overrides,
    },
    definition: { id: DEFINITION_ID, definition_key: "website.direct_checkout", version: 1 },
    project: null,
    invoice: null,
    demo: null,
    lead: null,
    assignee: null,
  };
}

test("GET endpoint weigert een niet-ingelogde bezoeker", async () => {
  const handler = createHandler({ env: {}, fetchImpl: async () => { throw new Error("should not fetch"); } });
  const response = await handler({ httpMethod: "GET", headers: {} });
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).success, false);
});

test("endpoint is GET-only en negeert een client-side customer-id", async () => {
  let receivedUserId = "";
  const service = { async getProgress(userId) { receivedUserId = userId; return { authorized: true, disabled: false, progress: { source: "unavailable" }, featureFlags: {} }; } };
  const handler = createHandler({ authenticate: async () => ({ id: USER_ID }), service, log: { info() {}, error() {} } });
  assert.equal((await handler({ httpMethod: "POST", headers: {} })).statusCode, 405);
  const response = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } });
  assert.equal(response.statusCode, 200);
  assert.equal(receivedUserId, USER_ID);
});

test("ingelogde klant krijgt uitsluitend gesaniteerde eigen journeyprogress", async () => {
  const repo = repository(realJourneySnapshot());
  const service = createClientJourneyReadService({ repository: repo, env: { JOURNEY_ENGINE_ENABLED: "on", JOURNEY_PROGRESS_UI_ENABLED: "on" }, log: { info() {}, error() {} } });
  const result = await service.getProgress(USER_ID, { environment: "production" });
  assert.equal(result.progress.source, "journey");
  assert.equal(result.progress.productLabel, "Business Website");
  assert.equal(result.progress.currentStep.key, "website_build");
  assert.equal(result.progress.percentage, 50);
  assert.equal(result.progress.contact.name, "Team Max Webstudio");
  const serialized = JSON.stringify(result.progress);
  assert.doesNotMatch(serialized, /internalNote|stepStates|definition_id|auth_user_id|provider/i);
});

test("voltooide journey retourneert 100 procent", async () => {
  const completeStates = Object.fromEntries(["order_received", "payment_confirmed", "onboarding_information", "content_ready", "website_build", "customer_review", "launch_checks", "handover"].map((key) => [key, "completed"]));
  const repo = repository(realJourneySnapshot({ status: "completed", current_step: "handover", metadata: { stepStates: completeStates } }));
  const service = createClientJourneyReadService({ repository: repo, env: { JOURNEY_ENGINE_ENABLED: "on", JOURNEY_PROGRESS_UI_ENABLED: "on" }, log: { info() {}, error() {} } });
  const result = await service.getProgress(USER_ID, { environment: "production" });
  assert.equal(result.progress.percentage, 100);
  assert.equal(result.progress.complete, true);
});

test("legacy estimate en ontbrekende journeytabel vallen veilig terug", async () => {
  const repo = repository({ journeyTablesAvailable: false, instance: null, definition: null, project: { id: "p", status: "development", updated_at: "2026-07-12T10:00:00Z" }, invoice: null, demo: null, lead: null, assignee: null });
  const service = createClientJourneyReadService({ repository: repo, env: { JOURNEY_ENGINE_ENABLED: "on", JOURNEY_PROGRESS_UI_ENABLED: "on" }, log: { info() {}, error() {} } });
  const result = await service.getProgress(USER_ID, { environment: "production" });
  assert.equal(result.progress.source, "legacy_estimate");
  assert.equal(result.progress.estimateLabel, "Gebaseerd op de huidige projectfase");
  assert.equal(result.progress.currentStep.label, "Website bouwen");
});

test("onbekende legacy-status geeft unavailable zonder misleidende 0 procent", async () => {
  const repo = repository({ journeyTablesAvailable: false, instance: null, definition: null, project: { id: "p", status: "mystery" }, invoice: null, demo: null, lead: null, assignee: null });
  const service = createClientJourneyReadService({ repository: repo, env: { JOURNEY_ENGINE_ENABLED: "on", JOURNEY_PROGRESS_UI_ENABLED: "on" }, log: { info() {}, error() {} } });
  const result = await service.getProgress(USER_ID, { environment: "production" });
  assert.equal(result.progress.source, "unavailable");
  assert.equal(result.progress.percentage, null);
});

test("flags off zijn een volledige no-op zonder journey-read", async () => {
  const repo = repository(realJourneySnapshot());
  const service = createClientJourneyReadService({ repository: repo, env: {}, log: { info() {}, error() {} } });
  const result = await service.getProgress(USER_ID, { environment: "production" });
  assert.equal(result.disabled, true);
  assert.equal(repo.resolves, 0);
  assert.equal(repo.reads, 0);
});

test("test-only werkt alleen in testcontext", async () => {
  const env = { JOURNEY_ENGINE_ENABLED: "test_only", JOURNEY_PROGRESS_UI_ENABLED: "test_only" };
  const prodRepo = repository(realJourneySnapshot());
  const prod = await createClientJourneyReadService({ repository: prodRepo, env, log: { info() {}, error() {} } }).getProgress(USER_ID, { environment: "production" });
  assert.equal(prod.disabled, true);
  const testRepo = repository(realJourneySnapshot());
  const active = await createClientJourneyReadService({ repository: testRepo, env, log: { info() {}, error() {} } }).getProgress(USER_ID, { environment: "test", isTest: true });
  assert.equal(active.disabled, false);
  assert.equal(active.progress.source, "journey");
});

test("allowlist activeert uitsluitend de gekoppelde klant", async () => {
  const env = { JOURNEY_ENGINE_ENABLED: "allowlist", JOURNEY_ENGINE_ENABLED_ALLOWLIST: CUSTOMER_ID, JOURNEY_PROGRESS_UI_ENABLED: "allowlist", JOURNEY_PROGRESS_UI_ENABLED_ALLOWLIST: CUSTOMER_ID };
  const result = await createClientJourneyReadService({ repository: repository(realJourneySnapshot()), env, log: { info() {}, error() {} } }).getProgress(USER_ID, { environment: "production" });
  assert.equal(result.disabled, false);
});

test("klantacties gebruiken alleen bestaande allowlisted portalroutes", async () => {
  assert.deepEqual(resolveClientAction({ key: "customer_review", customerActionType: "review" }), { required: true, found: true, type: "review", url: "/klantportaal.html#website-review", label: "Ontwerp beoordelen" });
  assert.equal(resolveClientAction({ key: "customer_review", customerActionType: "pay" }).found, false);
  assert.equal(isSafeClientActionUrl("https://evil.example/pay"), false);
  assert.equal(isSafeClientActionUrl("javascript:alert(1)"), false);
  assert.equal(isSafeClientActionUrl("/klantportaal.html#facturen"), true);
});

test("repository weigert een inactief of niet-klantprofiel ondanks een directe customer-koppeling", async () => {
  for (const profile of [{ id: "55555555-5555-4555-8555-555555555555", status: "disabled", role: "customer" }, { id: "55555555-5555-4555-8555-555555555555", status: "active", role: "admin" }]) {
    const fetchImpl = async (url) => ({
      ok: true,
      status: 200,
      async text() {
        if (String(url).includes("/customers?")) return JSON.stringify([{ id: CUSTOMER_ID, auth_user_id: USER_ID, status: "active", portal_status: "active" }]);
        if (String(url).includes("/profiles?")) return JSON.stringify([profile]);
        return "[]";
      },
    });
    const repo = createClientJourneyReadRepository({ env: { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "server-only" }, fetchImpl, log: { info() {}, error() {} } });
    assert.equal(await repo.resolveCustomer(USER_ID), null);
  }
});

test("UI bevat loading, legacy, unavailable, blocked, skipped, contactfallback en mobiele bescherming", () => {
  const root = path.join(__dirname, "..");
  const ui = fs.readFileSync(path.join(root, "public/src/ui/clientJourneyProgress.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "public/journey-progress.css"), "utf8");
  const html = fs.readFileSync(path.join(root, "public/klantportaal.html"), "utf8");
  assert.match(ui, /renderLoading/);
  assert.match(ui, /legacy_estimate/);
  assert.match(ui, /renderUnavailable/);
  assert.match(ui, /is-blocked|className: "blocked"/);
  assert.match(ui, /is-skipped|className: "skipped"/);
  assert.match(ui, /Team Max Webstudio/);
  assert.match(ui, /aria-valuenow/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.doesNotMatch(css, /min-width:\s*[6-9]\d\dpx/);
  assert.match(html, /loadClientJourneyProgress/);
});

test("feature adapter voorkomt dubbel percentage en behoudt bestaande specialistische acties", () => {
  const root = path.join(__dirname, "..");
  const ui = fs.readFileSync(path.join(root, "public/src/ui/clientJourneyProgress.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "public/klantportaal.html"), "utf8");
  assert.match(ui, /workspaceProgress\.hidden = true/);
  assert.match(ui, /nextCard\.dataset\.journeyProgressActive/);
  assert.match(html, /previewVersionRequest\(\{\s*action: "feedback"/);
  assert.match(html, /previewVersionRequest\(\{\s*action: "approve"/);
  assert.match(html, /latestPreview\.safePreviewPath/);
  assert.match(html, /invoiceUrl\(openInvoice\) \|\| "#facturen"/);
});
