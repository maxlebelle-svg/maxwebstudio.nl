const { verifyAdmin: defaultVerifyAdmin } = require("./_admin-auth");
const { createJourneyMailTestProducer } = require("./journey/mail/testProducer");
const { createJourneyMailWorker } = require("./journey/mail/worker");
const { evaluateJourneyEmailMode, normalizeEmail } = require("./journey/mail/recipientPolicy");
const { parseAllowlist, resolveJourneyFeatureFlag } = require("./journey/featureFlags");
const { FEATURE_FLAGS } = require("./journey/types");
const { createPreviewReadyRepository } = require("./journey/previewReady/repository");
const { createFeedbackReceivedRepository } = require("./journey/feedbackReceived/repository");

function createHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  const verifyAdmin = dependencies.verifyAdmin || defaultVerifyAdmin;
  const producer = dependencies.producer || createJourneyMailTestProducer({ env, fetchImpl: dependencies.fetchImpl, logger: dependencies.logger });
  const worker = dependencies.worker || createJourneyMailWorker({ env, fetchImpl: dependencies.fetchImpl, logger: dependencies.logger, mailSender: dependencies.mailSender });
  const previewRepository = dependencies.previewRepository || createPreviewReadyRepository({ env, fetchImpl: dependencies.fetchImpl });
  const feedbackRepository = dependencies.feedbackRepository || createFeedbackReceivedRepository({ env, fetchImpl: dependencies.fetchImpl });
  return async function handler(event = {}) {
    if (event.httpMethod !== "POST") return json(405, { success: false, error: "Alleen POST is toegestaan." });
    const auth = await verifyAdmin(event, json, { module: "journey_mail_test", action: "test_only", allowedRoles: ["super_admin"], allowedStatuses: ["active"], disableLegacyToken: true });
    if (!auth.success) return auth.response;
    const payload = parseBody(event.body);
    const context = { environment: runtimeEnvironment(env), isTest: runtimeEnvironment(env) === "test", scopeKey: "journey-mail-worker", customerId: String(payload.customerId || "").trim(), adminAuthorized: true };
    const gate = evaluateJourneyEmailMode(context, env);
    if (!gate.allowed) return json(409, { success: false, testMode: true, reason: gate.reason, error: "Journey-testmail is niet veilig ingeschakeld." });
    if (payload.action === "create_preview_test_journey") {
      const customerId = String(payload.customerId || "").trim();
      const selected = parseAllowlist(env.JOURNEY_PREVIEW_READY_TEST_CUSTOMERS);
      const engine = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env);
      if (!engine.enabled || !selected.has(customerId)) return json(409, { success: false, testMode: true, reason: !engine.enabled ? engine.reason : "customer_not_selected_for_preview_ready_test", error: "Deze klant is niet expliciet geselecteerd voor de previewtest." });
      try {
        const result = await previewRepository.ensureTestJourney({ customerId, projectId: payload.projectId, productCode: payload.productCode });
        return json(result.available && result.row ? 200 : 503, { success: Boolean(result.available && result.row), testMode: true, instanceId: result.row?.id || null, instanceKey: result.row?.instance_key || null, reason: result.reason || "created" });
      } catch (error) {
        return json(error?.statusCode === 400 ? 400 : 503, { success: false, testMode: true, reason: error?.statusCode === 400 ? String(error.code || "invalid_test_journey_scope") : "test_journey_storage_failed", error: "De testjourney kon niet veilig worden aangemaakt." });
      }
    }
    if (payload.action === "enable_feedback_received_test") {
      const customerId = String(payload.customerId || "").trim();
      const selected = parseAllowlist(env.JOURNEY_FEEDBACK_RECEIVED_TEST_CUSTOMERS);
      const engine = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env);
      if (!engine.enabled || !selected.has(customerId)) return json(409, { success: false, testMode: true, reason: !engine.enabled ? engine.reason : "customer_not_selected_for_feedback_test", error: "Deze klant is niet expliciet geselecteerd voor de feedbacktest." });
      try {
        const result = await feedbackRepository.enableTestJourney(customerId);
        return json(result.available && result.row ? 200 : 409, { success: Boolean(result.available && result.row), testMode: true, instanceId: result.row?.id || null, instanceKey: result.row?.instance_key || null, reason: result.reason || "feedback_test_enabled" });
      } catch (error) {
        return json(error?.statusCode === 400 ? 400 : 503, { success: false, testMode: true, reason: error?.statusCode === 400 ? String(error.code || "invalid_customer_id") : "feedback_test_storage_failed", error: "De feedbacktest kon niet veilig worden ingeschakeld." });
      }
    }
    if (payload.action === "enqueue_test") {
      const recipient = normalizeEmail(payload.recipient);
      if (!recipient) return json(400, { success: false, error: "Geldig testadres ontbreekt." });
      const result = await producer.enqueue({ recipient, requestKey: payload.requestKey }, context);
      return json(result.storageAvailable ? 200 : 503, { success: result.storageAvailable, testMode: true, ...result });
    }
    if (payload.action === "process_test") {
      const result = await worker.run({ batchSize: payload.batchSize }, context);
      return json(result.storageAvailable === false ? 503 : 200, { success: result.result !== "disabled" && result.storageAvailable !== false, testMode: true, worker: result });
    }
    return json(400, { success: false, error: "Onbekende testactie." });
  };
}

function runtimeEnvironment(env) { const values = [env.APP_ENV, env.APP_ENVIRONMENT, env.CONTEXT, env.NETLIFY_ENV].map((value) => String(value || "").toLowerCase()); return values.some((value) => ["production", "prod"].includes(value)) ? "production" : "test"; }
function parseBody(body) { try { const value = JSON.parse(body || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }

exports.handler = createHandler();
exports.createHandler = createHandler;
