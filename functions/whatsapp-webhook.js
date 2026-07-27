const crypto = require("crypto");
const { signInternalPayload } = require("./whatsapp-autopilot-background")._private;

const MAX_WEBHOOK_BYTES = 1048576;
const RPC_TIMEOUT_MS = 8000;

function createHandler(overrides = {}) {
  const dependencies = {
    env: process.env,
    fetchImpl: (...args) => fetch(...args),
    logger: console,
    ...overrides,
  };

  return async (event = {}) => {
    if (event.httpMethod === "GET") return verifySubscription(event, dependencies.env);
    if (event.httpMethod !== "POST") return response(405, "Method not allowed");

    const raw = rawBody(event);
    if (!raw.valid || raw.bytes.length > MAX_WEBHOOK_BYTES) return response(413, "Payload too large");
    const appSecret = clean(dependencies.env.WHATSAPP_APP_SECRET);
    if (!appSecret || !verifySignature(raw.bytes, header(event, "x-hub-signature-256"), appSecret)) {
      return response(401, "Invalid signature");
    }

    let payload;
    try { payload = JSON.parse(raw.bytes.toString("utf8")); }
    catch (error) { return response(400, "Invalid JSON"); }
    if (payload?.object !== "whatsapp_business_account") return response(200, "Ignored");

    const notifications = extractNotifications(payload);
    try {
      for (const item of notifications) {
        if (item.kind === "message") {
          const ingested = await ingestMessage(item, dependencies);
          if (["text","interactive"].includes(item.contentType)) await dispatchAutopilot(ingested, dependencies);
        }
        if (item.kind === "status") await applyStatus(item, dependencies);
      }
      dependencies.logger.info?.("whatsapp_webhook_processed", {
        messages: notifications.filter((item) => item.kind === "message").length,
        statuses: notifications.filter((item) => item.kind === "status").length,
      });
      return response(200, "EVENT_RECEIVED");
    } catch (error) {
      dependencies.logger.error?.("whatsapp_webhook_failed", { code: safeCode(error.code) });
      return response(503, "Processing unavailable");
    }
  };
}

function verifySubscription(event, env) {
  const query = event.queryStringParameters || {};
  const mode = clean(query["hub.mode"]);
  const token = clean(query["hub.verify_token"]);
  const challenge = clean(query["hub.challenge"]);
  const expected = clean(env.WHATSAPP_VERIFY_TOKEN);
  if (mode === "subscribe" && expected && safeEqual(token, expected) && challenge) {
    return response(200, challenge);
  }
  return response(403, "Verification failed");
}

function extractNotifications(payload) {
  const output = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "messages") continue;
      const value = change.value || {};
      const phoneNumberId = clean(value.metadata?.phone_number_id);
      const wabaId = clean(entry.id);
      const contacts = new Map((Array.isArray(value.contacts) ? value.contacts : []).map((contact) => [clean(contact.wa_id), clean(contact.profile?.name)]));
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const from = clean(message.from);
        const normalized = normalizeMessage(message);
        if (!phoneNumberId || !from || !clean(message.id) || !normalized) continue;
        output.push({
          kind: "message",
          phoneNumberId,
          wabaId,
          providerMessageId: clean(message.id),
          contactWaId: from,
          displayName: contacts.get(from) || "",
          contentType: normalized.contentType,
          body: normalized.body,
          providerCreatedAt: epochToIso(message.timestamp),
          metadata: normalized.metadata,
        });
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!clean(status.id) || !clean(status.status)) continue;
        const firstError = Array.isArray(status.errors) ? status.errors[0] : null;
        output.push({
          kind: "status",
          providerMessageId: clean(status.id),
          status: clean(status.status).toLowerCase(),
          statusAt: epochToIso(status.timestamp),
          failureCode: clean(firstError?.code),
          failureReason: clean(firstError?.title || firstError?.message || firstError?.error_data?.details).slice(0, 2000),
        });
      }
    }
  }
  return output;
}

function normalizeMessage(message) {
  const type = clean(message?.type).toLowerCase();
  const contextId = clean(message?.context?.id);
  const metadata = contextId ? { contextMessageId: contextId } : {};
  if (type === "text") return { contentType: "text", body: clean(message.text?.body), metadata };
  if (type === "interactive") {
    const body = clean(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "[Interactief antwoord]");
    return { contentType: "interactive", body, metadata: { ...metadata, interactiveId: clean(message.interactive?.button_reply?.id || message.interactive?.list_reply?.id) } };
  }
  if (type === "location") {
    const latitude = Number(message.location?.latitude);
    const longitude = Number(message.location?.longitude);
    return { contentType: "location", body: "[Locatie gedeeld]", metadata: { ...metadata, latitude, longitude, name: clean(message.location?.name).slice(0, 240) } };
  }
  const placeholders = { image: "[Afbeelding]", document: "[Document]", audio: "[Audiobericht]", video: "[Video]", sticker: "[Sticker]", contacts: "[Contact gedeeld]", reaction: "[Reactie]" };
  if (placeholders[type]) {
    const supportedType = ["image","document","audio","video"].includes(type) ? type : "system";
    return { contentType: supportedType, body: clean(message[type]?.caption) || placeholders[type], metadata };
  }
  return { contentType: "system", body: "[Niet-ondersteund WhatsApp-bericht]", metadata: { ...metadata, providerType: type || "unknown" } };
}

async function ingestMessage(item, dependencies) {
  const config = databaseConfig(dependencies.env);
  const expectedPhoneNumberId = clean(dependencies.env.WHATSAPP_PHONE_NUMBER_ID);
  if (expectedPhoneNumberId && item.phoneNumberId !== expectedPhoneNumberId) throw coded("WHATSAPP_PHONE_NUMBER_MISMATCH");
  return rpc("mws_ingest_whatsapp_message_v1", {
    p_phone_number_id: item.phoneNumberId,
    p_waba_id: item.wabaId,
    p_provider_message_id: item.providerMessageId,
    p_contact_wa_id: item.contactWaId,
    p_display_name: item.displayName,
    p_content_type: item.contentType,
    p_body: item.body,
    p_provider_created_at: item.providerCreatedAt,
    p_metadata: item.metadata,
  }, config, dependencies.fetchImpl);
}

async function dispatchAutopilot(ingested, dependencies) {
  const conversationId = clean(ingested?.conversationId);
  const inboundMessageId = clean(ingested?.messageId);
  if (!conversationId || !inboundMessageId) throw coded("WHATSAPP_AUTOPILOT_JOB_INVALID");
  const raw = JSON.stringify({ conversationId, inboundMessageId });
  const signature = signInternalPayload(raw, dependencies.env.WHATSAPP_APP_SECRET);
  const baseUrl = clean(dependencies.env.URL || dependencies.env.SITE_URL || "https://maxwebstudio.nl").replace(/\/$/, "");
  let result;
  try {
    result = await dependencies.fetchImpl(`${baseUrl}/.netlify/functions/whatsapp-autopilot-background`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-max-ai-signature":signature },
      body:raw,
      signal:AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch (cause) { throw coded("WHATSAPP_AUTOPILOT_UNAVAILABLE"); }
  if (!result.ok) throw coded("WHATSAPP_AUTOPILOT_REJECTED");
}

async function applyStatus(item, dependencies) {
  const config = databaseConfig(dependencies.env);
  await rpc("mws_apply_whatsapp_status_v1", {
    p_provider_message_id: item.providerMessageId,
    p_status: item.status,
    p_status_at: item.statusAt,
    p_failure_code: item.failureCode || null,
    p_failure_reason: item.failureReason || null,
  }, config, dependencies.fetchImpl);
}

async function rpc(name, body, config, fetchImpl) {
  let result;
  try {
    result = await fetchImpl(`${config.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: rpcHeaders(config.key),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch (cause) { throw coded("WHATSAPP_STORAGE_UNAVAILABLE"); }
  if (!result.ok) throw coded("WHATSAPP_STORAGE_REJECTED");
  return result.json().catch(() => null);
}

function verifySignature(bytes, signature, secret) {
  const supplied = clean(signature);
  if (!/^sha256=[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(bytes).digest("hex")}`;
  return safeEqual(supplied.toLowerCase(), expected.toLowerCase());
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function rawBody(event) {
  const source = typeof event.body === "string" ? event.body : "";
  if (!event.isBase64Encoded) return { valid: true, bytes: Buffer.from(source, "utf8") };
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(source)) return { valid: false, bytes: Buffer.alloc(0) };
  return { valid: true, bytes: Buffer.from(source, "base64") };
}

function databaseConfig(env) {
  const url = clean(env.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw coded("WHATSAPP_CONFIGURATION_MISSING");
  return { url, key };
}
function rpcHeaders(key) { return { apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json", Accept:"application/json", "Accept-Profile":"public", "Content-Profile":"public" }; }
function epochToIso(value) { const seconds = Number(value); return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString(); }
function header(event, name) { const pair = Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase()); return clean(pair?.[1]); }
function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
function coded(code) { const error = new Error(code); error.code = code; return error; }
function safeCode(code) { return /^WHATSAPP_[A-Z0-9_]+$/.test(clean(code)) ? clean(code) : "WHATSAPP_INTERNAL_ERROR"; }
function response(statusCode, body) { return { statusCode, headers:{ "Content-Type":"text/plain; charset=utf-8", "Cache-Control":"no-store" }, body:String(body) }; }

exports.handler = createHandler();
exports._private = { createHandler, dispatchAutopilot, extractNotifications, normalizeMessage, rawBody, safeEqual, verifySignature, verifySubscription };
