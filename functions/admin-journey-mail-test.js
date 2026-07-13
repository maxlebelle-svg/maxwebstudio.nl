const { verifyAdmin: defaultVerifyAdmin } = require("./_admin-auth");
const { createJourneyMailTestProducer } = require("./journey/mail/testProducer");
const { createJourneyMailWorker } = require("./journey/mail/worker");
const { evaluateJourneyEmailMode, normalizeEmail } = require("./journey/mail/recipientPolicy");

function createHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  const verifyAdmin = dependencies.verifyAdmin || defaultVerifyAdmin;
  const producer = dependencies.producer || createJourneyMailTestProducer({ env, fetchImpl: dependencies.fetchImpl, logger: dependencies.logger });
  const worker = dependencies.worker || createJourneyMailWorker({ env, fetchImpl: dependencies.fetchImpl, logger: dependencies.logger, mailSender: dependencies.mailSender });
  return async function handler(event = {}) {
    if (event.httpMethod !== "POST") return json(405, { success: false, error: "Alleen POST is toegestaan." });
    const auth = await verifyAdmin(event, json, { module: "journey_mail_test", action: "test_only", allowedRoles: ["super_admin"], allowedStatuses: ["active"], disableLegacyToken: true });
    if (!auth.success) return auth.response;
    const context = { environment: runtimeEnvironment(env), isTest: runtimeEnvironment(env) === "test", scopeKey: "journey-mail-worker", adminAuthorized: true };
    const gate = evaluateJourneyEmailMode(context, env);
    if (!gate.allowed) return json(409, { success: false, testMode: true, reason: gate.reason, error: "Journey-testmail is niet veilig ingeschakeld." });
    const payload = parseBody(event.body);
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
