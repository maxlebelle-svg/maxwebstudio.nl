const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { resolveLiveUrlPolicy, verifyLiveUrlReachability } = require("../functions/journey/websiteLive/urlPolicy");
const { resolveWebsiteLiveContext } = require("../functions/journey/websiteLive/contextResolver");
const { resolveWebsiteLiveOwnership } = require("../functions/journey/websiteLive/ownershipResolver");
const { planWebsiteLiveProgress } = require("../functions/journey/websiteLive/progressTransition");
const { createWebsiteLiveService, _private: servicePrivate } = require("../functions/journey/websiteLive/service");
const { validateMailCommand } = require("../functions/journey/mail/command");
const { renderJourneyMail } = require("../functions/journey/mail/templateRenderer");

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const WEBSITE = "33333333-3333-4333-8333-333333333333";
const INSTANCE = "44444444-4444-4444-8444-444444444444";
const LIVE_URL = "https://www.voorbeeld-klant.nl/";
const BASE_ENV = {
  CONTEXT: "production",
  JOURNEY_ENGINE_ENABLED: "allowlist",
  JOURNEY_ENGINE_ENABLED_ALLOWLIST: CUSTOMER,
  JOURNEY_EMAIL_AUTOMATION_ENABLED: "allowlist",
  JOURNEY_EMAIL_AUTOMATION_ENABLED_ALLOWLIST: CUSTOMER,
  JOURNEY_WEBSITE_LIVE_TEST_CUSTOMERS: CUSTOMER,
  JOURNEY_EMAIL_TEST_RECIPIENTS: "test@example.com",
  JOURNEY_EMAIL_TEST_REPLY_TO: "info@maxwebstudio.nl",
};
const INSTANCE_ROW = {
  id: INSTANCE,
  instance_key: `website-live-test:${CUSTOMER}`,
  customer_id: CUSTOMER,
  journey_type: "website.free_preview_sales",
  environment: "test",
  status: "active",
  current_step: "project_handover",
  updated_at: "2026-07-13T21:00:00Z",
  metadata: {
    testOnly: true,
    websiteLiveEmailOwner: "journey",
    definitionKey: "website.free_preview_sales",
    definitionVersion: 1,
    stepStates: {
      lead_qualified: "completed",
      preview_intake: "completed",
      preview_build: "completed",
      preview_shared: "completed",
      preview_feedback: "completed",
      preview_approved: "completed",
      commercial_agreement: "completed",
      payment_confirmed: "skipped",
      project_handover: "completed",
    },
  },
};

function records(overrides = {}) {
  const customer = { id: CUSTOMER, profile_id: "55555555-5555-4555-8555-555555555555", auth_user_id: "66666666-6666-4666-8666-666666666666", email: "test@example.com", name: "Max" };
  const website = { id: WEBSITE, customer_id: CUSTOMER, name: "Voorbeeld & Partners", domain: "voorbeeld-klant.nl", live_url: LIVE_URL, status: "online", last_deploy_at: "2026-07-13T20:55:00Z", metadata: {} };
  const project = { id: PROJECT, customer_id: CUSTOMER, website_id: WEBSITE, status: "live", journey_type: "website.free_preview_sales", metadata: {} };
  const review = { status: "live", liveAt: "2026-07-13T21:00:00Z", livePublicationReference: "deploy-first-live" };
  return { customer: { ...customer, ...(overrides.customer || {}) }, website: { ...website, ...(overrides.website || {}) }, project: { ...project, ...(overrides.project || {}) }, review: { ...review, ...(overrides.review || {}) } };
}

async function safeContext(overrides = {}) {
  const value = records(overrides);
  return resolveWebsiteLiveContext({ ...value, healthWebsite: overrides.healthWebsite || {}, technicalStored: true, environment: "production", journeyType: "website.free_preview_sales", publicationSource: "website_factory_verified_publication", maintenanceSubscription: overrides.maintenanceSubscription || null }, { reachabilityChecker: async () => ({ reachable: true, reasonCode: "live_url_reachable" }) });
}

test("URL-policy accepts only linked custom or explicitly agreed Netlify production hosts", () => {
  assert.equal(resolveLiveUrlPolicy({ website: records().website }).safe, true);
  assert.equal(resolveLiveUrlPolicy({ website: { domain: "", live_url: "https://klant-live.netlify.app", netlify_project_name: "klant-live", metadata: { netlifyIsCanonical: true } } }).safe, true);
  for (const live_url of ["http://voorbeeld-klant.nl", "https://localhost", "https://127.0.0.1", "javascript:alert(1)", "https://example.com/.netlify/functions/render", "https://example.com/preview", "https://deploy-preview-2--klant.netlify.app", "https://ander-domein.nl"]) {
    assert.equal(resolveLiveUrlPolicy({ website: { ...records().website, live_url } }).safe, false, live_url);
  }
  assert.equal(resolveLiveUrlPolicy({ website: { domain: "", live_url: "https://klant-live.netlify.app", netlify_project_name: "klant-live", metadata: {} } }).reasonCode, "netlify_live_url_not_explicitly_agreed");
});

test("bounded reachability probe blocks private DNS and untrusted redirects", async () => {
  const policy = resolveLiveUrlPolicy({ website: records().website });
  const privateDns = await verifyLiveUrlReachability(policy, { lookup: async () => [{ address: "127.0.0.1" }], fetchImpl: async () => { throw new Error("must not fetch"); } });
  assert.equal(privateDns.reasonCode, "live_url_private_address_resolved");
  const redirected = await verifyLiveUrlReachability(policy, { lookup: async () => [{ address: "93.184.216.34" }], fetchImpl: async () => ({ status: 302, headers: { get: () => "https://127.0.0.1/private" } }) });
  assert.equal(redirected.reasonCode, "live_url_redirect_host_forbidden");
  const healthy = await verifyLiveUrlReachability(policy, { lookup: async () => [{ address: "93.184.216.34" }], fetchImpl: async () => ({ status: 200, headers: { get: () => null } }) });
  assert.equal(healthy.reachable, true);
});

test("context resolver requires durable ownership, live state, safe URL and successful probe", async () => {
  const valid = await safeContext();
  assert.equal(valid.safe, true);
  assert.equal(valid.urlState, "reachable");
  assert.equal(valid.safeLiveUrl, LIVE_URL);
  assert.equal(valid.nextStepType, "post_launch_check");
  const pending = await safeContext({ healthWebsite: { dns_status: "valid", ssl_status: "pending" } });
  assert.equal(pending.safe, false);
  assert.equal(pending.reasonCode, "website_live_dns_or_ssl_pending");
  const mismatch = await safeContext({ website: { customer_id: "77777777-7777-4777-8777-777777777777" } });
  assert.equal(mismatch.reasonCode, "website_live_ownership_mismatch");
  const cancelled = await safeContext({ project: { status: "cancelled" } });
  assert.equal(cancelled.reasonCode, "website_live_project_cancelled");
  const unpaid = await safeContext({ project: { metadata: { websiteCommercialOrder: { status: "unpaid" } } } });
  assert.equal(unpaid.reasonCode, "website_live_commercial_state_inconsistent");
});

test("ownership is isolated to its own allowlist and one enabled existing test journey", async () => {
  const context = await safeContext();
  assert.equal(resolveWebsiteLiveOwnership({ recipient: "test@example.com", customerId: CUSTOMER, websiteId: WEBSITE, runtimeEnvironment: "production", websiteLiveContext: context }, BASE_ENV).reason, "test_journey_missing");
  const eligible = resolveWebsiteLiveOwnership({ recipient: "test@example.com", customerId: CUSTOMER, websiteId: WEBSITE, runtimeEnvironment: "production", websiteLiveContext: context, journeyInstance: INSTANCE_ROW, transition: { valid: true } }, BASE_ENV);
  assert.equal(eligible.owner, "journey");
  assert.equal(resolveWebsiteLiveOwnership({ recipient: "test@example.com", customerId: CUSTOMER, websiteId: WEBSITE, runtimeEnvironment: "production", websiteLiveContext: context, journeyInstance: INSTANCE_ROW, transition: { valid: true } }, { ...BASE_ENV, JOURNEY_WEBSITE_LIVE_TEST_CUSTOMERS: "" }).owner, "legacy");
  assert.equal(resolveWebsiteLiveOwnership({ recipient: "test@example.com", customerId: CUSTOMER, websiteId: WEBSITE, runtimeEnvironment: "production", websiteLiveContext: { safe: false, reasonCode: "unsafe" } }, BASE_ENV).owner, "none");
  assert.equal(resolveWebsiteLiveOwnership({ recipient: "test@example.com", customerId: CUSTOMER, websiteId: WEBSITE, runtimeEnvironment: "production", websiteLiveContext: context, journeyInstance: INSTANCE_ROW, transition: { valid: true } }, { ...BASE_ENV, JOURNEY_PAYMENT_PAID_TEST_CUSTOMERS: CUSTOMER, JOURNEY_WEBSITE_LIVE_TEST_CUSTOMERS: "" }).owner, "legacy");
});

test("progress moves a complete test journey to 95 percent post-launch without forcing review or commerce", async () => {
  const context = await safeContext();
  const transition = planWebsiteLiveProgress(INSTANCE_ROW, "publication-fingerprint", { ...context, liveAt: records().review.liveAt, liveHostnameFingerprint: "host-fingerprint" });
  assert.equal(transition.valid, true);
  assert.equal(transition.after.percentage, 95);
  assert.equal(transition.patch.current_step, "post_launch_check");
  assert.equal(transition.patch.metadata.stepStates.website_live, "completed");
  assert.equal(transition.patch.metadata.stepStates.post_launch_check, "ready");
  assert.equal(transition.patch.metadata.reviewScheduled, false);
  assert.equal(transition.patch.metadata.progressDefinitionVersion, 2);
  const duplicate = planWebsiteLiveProgress({ ...INSTANCE_ROW, metadata: { ...INSTANCE_ROW.metadata, processedWebsiteLiveReferences: ["publication-fingerprint"] } }, "publication-fingerprint", context);
  assert.equal(duplicate.duplicate, true);
  const blocked = planWebsiteLiveProgress({ ...INSTANCE_ROW, metadata: { ...INSTANCE_ROW.metadata, stepStates: { ...INSTANCE_ROW.metadata.stepStates, project_handover: "blocked" } } }, "new-ref", context);
  assert.equal(blocked.valid, false);
});

test("stable website scope records one event/outbox and never falls back after ambiguous acceptance", async () => {
  const context = await safeContext();
  const calls = [];
  let writes = 0;
  let legacy = 0;
  const journeyRepository = { recordJourneyEvent: async (event, settings) => { calls.push({ event, settings }); writes += 1; return { available: true, row: { outbox_id: "outbox-1", duplicate: writes > 1 } }; } };
  const websiteRepository = { findTestJourney: async () => ({ available: true, row: INSTANCE_ROW }), applyProgress: async () => ({ available: true, skipped: false, reason: "progress_updated" }) };
  const service = createWebsiteLiveService({ env: BASE_ENV, journeyRepository, websiteRepository, log: { info() {}, error() {} } });
  const input = { customerId: CUSTOMER, websiteId: WEBSITE, projectId: PROJECT, recipient: "test@example.com", firstName: "Max", websiteLabel: "Voorbeeld", liveAt: records().review.liveAt, websiteLiveContext: context, legacySend: async () => { legacy += 1; } };
  const first = await service.dispatch(input);
  const second = await service.dispatch(input);
  assert.equal(first.owner, "journey");
  assert.equal(second.duplicate, true);
  assert.equal(legacy, 0);
  assert.equal(calls[0].event.event_type || calls[0].event.eventType, "website.live");
  assert.equal(calls[0].settings.outbox.effectType, "email.website_live");
  assert.equal(calls[0].event.eventKey, calls[1].event.eventKey);
  assert.equal(calls[0].settings.outbox.idempotencyKey, calls[1].settings.outbox.idempotencyKey);
  assert.equal(JSON.stringify(calls[0]).includes(LIVE_URL), true);
  assert.equal(calls[0].event.payload.safeLiveUrl, undefined);
  const ambiguous = createWebsiteLiveService({ env: BASE_ENV, journeyRepository: { recordJourneyEvent: async () => { throw Object.assign(new Error("timeout"), { code: "timeout" }); } }, websiteRepository, log: { info() {}, error() {} } });
  const failed = await ambiguous.dispatch(input);
  assert.equal(failed.owner, "journey");
  assert.equal(failed.fallbackAllowed, false);
  assert.equal(legacy, 0);
  assert.equal(servicePrivate.stableKeys({ customerId: CUSTOMER, websiteId: WEBSITE, projectId: PROJECT, publicationReference: "first", canonicalHost: "example.nl", templateVersion: 1 }).eventKey, servicePrivate.stableKeys({ customerId: CUSTOMER, websiteId: WEBSITE, projectId: PROJECT, publicationReference: "first", canonicalHost: "example.nl", templateVersion: 1 }).eventKey);
});

test("flags off retain one safe legacy owner while unsafe URL has no mail owner", async () => {
  const context = await safeContext();
  let legacy = 0;
  const websiteRepository = { findTestJourney: async () => { throw new Error("must not read"); } };
  const service = createWebsiteLiveService({ env: { ...BASE_ENV, JOURNEY_ENGINE_ENABLED: "off", JOURNEY_EMAIL_AUTOMATION_ENABLED: "off" }, journeyRepository: {}, websiteRepository, log: { info() {}, error() {} } });
  const result = await service.dispatch({ customerId: CUSTOMER, websiteId: WEBSITE, projectId: PROJECT, recipient: "test@example.com", websiteLiveContext: context, legacySend: async () => { legacy += 1; } });
  assert.equal(result.owner, "legacy");
  assert.equal(legacy, 1);
  const unsafe = await service.dispatch({ customerId: CUSTOMER, websiteId: WEBSITE, projectId: PROJECT, recipient: "test@example.com", websiteLiveContext: { safe: false, reasonCode: "live_url_unreachable", publicationReference: "ref" }, legacySend: async () => { legacy += 1; } });
  assert.equal(unsafe.owner, "none");
  assert.equal(legacy, 1);
});

test("website live template is escaped, test-marked, factual and CTA-safe", () => {
  const command = validateMailCommand({ automationKey: "journey.website_live", templateKey: "journey.website_live", templateVersion: 1, journeyEventKey: "website.live:test", outboxIdempotencyKey: "website.live.email:test:v1", customerReference: CUSTOMER, journeyInstanceReference: INSTANCE, recipient: "test@example.com", replyToProfile: { email: "info@maxwebstudio.nl" }, subjectData: { label: "Voorbeeld & Partners" }, templateData: { firstName: "Max & Co", websiteLabel: "Voorbeeld & Partners", liveUrl: LIVE_URL, portalUrl: "https://maxwebstudio.nl/klantportaal.html", percentage: 95, currentPhase: "Nazorg", nextStep: "Wij controleren de livegang.", maintenanceState: "selected_not_activated", contactName: "Team Max Webstudio" }, actionUrl: LIVE_URL, metadata: { scenario: "website_live_test_customer", websiteReference: WEBSITE, projectReference: PROJECT, liveHostnameFingerprint: "abcdef1234567890" } }, { customerId: CUSTOMER, journeyInstanceId: INSTANCE, environment: "test" }, BASE_ENV);
  const rendered = renderJourneyMail(command);
  assert.equal(rendered.subject, "[TEST] Uw website staat live");
  assert.match(rendered.html, /Bekijk uw website/);
  assert.match(rendered.html, /Voorbeeld &amp; Partners/);
  assert.match(rendered.text, new RegExp(LIVE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(rendered.text, /wordt niet automatisch geactiveerd/);
  assert.doesNotMatch(`${rendered.html}\n${rendered.text}`, /review vragen|betaalverzoek|geïndexeerd|uptimegarantie/i);
  assert.throws(() => validateMailCommand({ ...command, actionUrl: "https://127.0.0.1", templateData: { ...command.templateData, liveUrl: "https://127.0.0.1" } }, { customerId: CUSTOMER, journeyInstanceId: INSTANCE, environment: "test" }, BASE_ENV), /ongeldig/i);
});

test("Website Factory integration stores first, remains idempotent and creates no commercial side effects", () => {
  const source = fs.readFileSync(path.join(__dirname, "../functions/website-factory.js"), "utf8");
  assert.ok(source.indexOf("persistPreviewReview(context, records, review, projectPatch)") < source.indexOf("websiteLiveService.dispatch"));
  assert.match(source, /review\.liveAt = currentReview\.liveAt \|\| now/);
  assert.match(source, /progress: 95/);
  assert.match(source, /reviewScheduled: false/);
  assert.match(source, /wasAlreadyLive \? null : sendPreviewLaunchMail/);
  assert.doesNotMatch(source, /activateSelectedMaintenance/);
  assert.doesNotMatch(source, /review_requested|Review verzoek gepland|Review vragen/);
  assert.doesNotMatch(source, /if \(action === "complete_launch"\) await createPostLaunchGrowthEvents/);
  assert.match(source, /findMaintenanceSubscription/);
});

test("admin diagnostics and migration stay safe, bounded and test-only", () => {
  const root = path.resolve(__dirname, "..");
  const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260713220000_enable_website_live_test_outbox.sql"), "utf8");
  const adminRepository = fs.readFileSync(path.join(root, "functions/journey/adminReadRepository.js"), "utf8");
  const adminService = fs.readFileSync(path.join(root, "functions/journey/adminReadService.js"), "utf8");
  const adminEndpoint = fs.readFileSync(path.join(root, "functions/admin-journey-mail-test.js"), "utf8");
  assert.match(migration, /email\.website_live/);
  assert.match(migration, /p_environment <> 'test'/);
  assert.match(migration, /least\(coalesce\(p_batch_size, 5\), 20\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.match(migration, /revoke all on function[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*service_role/i);
  assert.doesNotMatch(migration, /\b(drop|truncate|delete|insert)\b/i);
  for (const field of ["website_reference", "project_reference", "live_hostname_fingerprint", "maintenance_state"]) assert.match(adminRepository, new RegExp(field));
  assert.match(adminService, /email\.website_live/);
  assert.doesNotMatch(adminRepository, /safe_live_url|deploy_payload|recipient/);
  assert.match(adminEndpoint, /enable_website_live_test/);
  assert.match(adminEndpoint, /allowedRoles: \["super_admin"\]/);
});
