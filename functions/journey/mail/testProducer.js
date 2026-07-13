const { randomUUID } = require("crypto");
const { createJourneyRepository } = require("../repository");
const { validateMailCommand } = require("./command");

function createJourneyMailTestProducer(options = {}) {
  const env = options.env || process.env;
  const repository = options.repository || createJourneyRepository(options);
  return { enqueue: (input = {}, context = {}) => enqueue({ input, context, env, repository }) };
}

async function enqueue({ input, context, env, repository }) {
  const requestKey = safeRequestKey(input.requestKey) || randomUUID().toLowerCase();
  const eventKey = `journey.test:${requestKey}`;
  const outboxIdempotencyKey = `journey.test.mail:${requestKey}`;
  const command = validateMailCommand({
    automationKey: "journey.synthetic_status_update",
    templateKey: "journey.test_status_update",
    templateVersion: 1,
    journeyEventKey: eventKey,
    outboxIdempotencyKey,
    customerReference: "synthetic-test",
    journeyInstanceReference: null,
    recipient: input.recipient,
    fromProfile: { name: "Max Webstudio", email: "info@maxwebstudio.nl" },
    replyToProfile: { name: "Max Webstudio", email: "info@maxwebstudio.nl" },
    subjectData: { label: "Interne journeytest" },
    templateData: { firstName: "testgebruiker", projectLabel: "Interne journeytest", percentage: 50, currentStep: "Testworker veilig valideren", nextStep: "Resultaat controleren", contactName: "Team Max Webstudio" },
    actionUrl: "https://www.maxwebstudio.nl/klantportaal.html",
    locale: "nl",
    metadata: { scenario: "synthetic_status_update" },
  }, { ...context, environment: "test", scopeKey: context.scopeKey || "journey-mail-worker" }, env);
  try {
    const result = await repository.recordJourneyEvent({ eventKey, eventType: "project.started", entityType: "project", entityId: `synthetic:${requestKey}`, environment: "test", occurredAt: new Date().toISOString(), payload: { synthetic: true, testMode: true } }, { context: { ...context, environment: "test", isTest: true, scopeKey: context.scopeKey || "journey-mail-worker" }, outbox: { idempotencyKey: outboxIdempotencyKey, effectType: "email.journey_test", payload: { mailCommand: command } } });
    if (!result.available) return { created: false, duplicate: false, storageAvailable: result.reason !== "storage_unavailable", reason: result.reason || "storage_unavailable" };
    return { created: Boolean(result.row?.outbox_id), duplicate: Boolean(result.row?.duplicate), storageAvailable: true, eventFingerprint: requestKey.slice(0, 12) };
  } catch (error) {
    if (isMissingStorage(error)) return { created: false, duplicate: false, storageAvailable: false, reason: "storage_unavailable" };
    throw error;
  }
}

function isMissingStorage(error) { return error?.statusCode === 404 || ["42P01", "42883", "PGRST202", "PGRST205"].includes(error?.code); }
function safeRequestKey(value) { const key = String(value || "").trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{7,63}$/.test(key) ? key : ""; }

module.exports = { createJourneyMailTestProducer, _private: { safeRequestKey } };
