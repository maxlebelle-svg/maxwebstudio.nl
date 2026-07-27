const { verifyAdmin } = require("./_admin-auth");

const STAFF_ROLES = ["super_admin","admin","sales_manager","sales_partner","designer","developer","support"];
const ELEVATED_ROLES = new Set(["super_admin","admin","sales_manager"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

function createHandler(overrides = {}) {
  const dependencies = {
    env: process.env,
    fetchImpl: (...args) => fetch(...args),
    verifyStaff: (event) => verifyAdmin(event, json, { allowedRoles: STAFF_ROLES, module: "whatsapp", action: "send", disableLegacyToken: true }),
    now: () => Date.now(),
    logger: console,
    ...overrides,
  };

  return async (event = {}) => {
    if (event.httpMethod !== "POST") return json(405, { success:false, error:"Alleen POST-verzoeken zijn toegestaan." });
    const auth = await dependencies.verifyStaff(event);
    if (!auth?.success) return auth?.response || json(401, { success:false, error:"Niet geautoriseerd." });

    let payload;
    try { payload = JSON.parse(event.body || "{}"); }
    catch (error) { return json(400, { success:false, error:"Ongeldig verzendverzoek." }); }
    const input = {
      conversationId: clean(payload.conversationId),
      clientMessageId: clean(payload.clientMessageId),
      body: clean(payload.body),
    };
    if (!UUID_PATTERN.test(input.conversationId) || !UUID_PATTERN.test(input.clientMessageId)) return json(400, { success:false, error:"Het gesprek of bericht is ongeldig." });
    if (Array.from(input.body).length < 1 || Array.from(input.body).length > 4096) return json(400, { success:false, error:"Het bericht moet tussen 1 en 4096 tekens bevatten." });

    try {
      const config = configuration(dependencies.env);
      const context = await loadConversation(input.conversationId, config, dependencies.fetchImpl);
      if (!canAccess(context.conversation, auth.admin)) return json(403, { success:false, error:"Dit gesprek is niet aan jou toegewezen." });
      if (!withinCustomerServiceWindow(context.lastInboundAt, dependencies.now())) {
        return json(409, { success:false, code:"WHATSAPP_TEMPLATE_REQUIRED", error:"Het laatste WhatsApp-bericht is ouder dan 24 uur. Gebruik straks een goedgekeurd WhatsApp-template." });
      }

      const queued = await rpc("mws_queue_whatsapp_text_v1", {
        p_conversation_id: input.conversationId,
        p_channel_id: context.channel.id,
        p_client_message_id: input.clientMessageId,
        p_body: input.body,
        p_sender_auth_user_id: auth.admin.id,
      }, config, dependencies.fetchImpl);
      const messageId = clean(queued?.messageId);
      if (!UUID_PATTERN.test(messageId)) throw coded("WHATSAPP_QUEUE_INVALID_RESPONSE");

      let providerMessageId;
      try {
        providerMessageId = await sendToMeta(context.channel, input.body, config, dependencies.fetchImpl);
      } catch (error) {
        await finalize(messageId, null, false, error.code, "Meta heeft het bericht niet geaccepteerd.", config, dependencies.fetchImpl).catch(() => null);
        throw error;
      }

      try {
        await finalize(messageId, providerMessageId, true, null, null, config, dependencies.fetchImpl);
      } catch (error) {
        dependencies.logger.error?.("whatsapp_send_reconciliation_required", { messageId, code:safeCode(error.code) });
        return json(202, { success:true, accepted:true, reconciled:false, messageId, providerMessageId, warning:"WhatsApp heeft het bericht geaccepteerd, maar de lokale status moet worden gecontroleerd." });
      }

      dependencies.logger.info?.("whatsapp_send_accepted", { messageId, conversationId:input.conversationId });
      return json(200, { success:true, accepted:true, reconciled:true, messageId, providerMessageId });
    } catch (error) {
      dependencies.logger.error?.("whatsapp_send_failed", { code:safeCode(error.code) });
      return json(error.statusCode || 502, { success:false, error:publicError(error.code) });
    }
  };
}

async function loadConversation(conversationId, config, fetchImpl) {
  const conversations = await rest(`conversations?select=id,assigned_user_id,status&id=eq.${encodeURIComponent(conversationId)}&limit=1`, config, fetchImpl);
  const conversation = Array.isArray(conversations) ? conversations[0] : null;
  if (!conversation?.id) throw statusError("WHATSAPP_CONVERSATION_NOT_FOUND", 404);
  const channels = await rest(`conversation_channels?select=id,external_contact_id,normalized_phone,status,metadata&conversation_id=eq.${encodeURIComponent(conversationId)}&channel=eq.whatsapp&status=eq.active&limit=1`, config, fetchImpl);
  const channel = Array.isArray(channels) ? channels[0] : null;
  if (!channel?.id) throw statusError("WHATSAPP_CHANNEL_NOT_FOUND", 409);
  const inbound = await rest(`conversation_messages?select=provider_created_at,created_at&conversation_id=eq.${encodeURIComponent(conversationId)}&channel=eq.whatsapp&direction=eq.inbound&order=provider_created_at.desc.nullslast,created_at.desc&limit=1`, config, fetchImpl);
  const row = Array.isArray(inbound) ? inbound[0] : null;
  return { conversation, channel, lastInboundAt: row?.provider_created_at || row?.created_at || null };
}

function canAccess(conversation, staff) {
  const role = clean(staff?.role).toLowerCase();
  if (ELEVATED_ROLES.has(role)) return true;
  return Boolean(staff?.id) && clean(conversation?.assigned_user_id) === clean(staff.id);
}

function withinCustomerServiceWindow(lastInboundAt, now) {
  const timestamp = Date.parse(lastInboundAt || "");
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp < SESSION_WINDOW_MS;
}

async function sendToMeta(channel, body, config, fetchImpl) {
  const phoneNumberId = clean(channel.metadata?.phoneNumberId || config.phoneNumberId);
  if (!phoneNumberId || phoneNumberId !== config.phoneNumberId) throw coded("WHATSAPP_PHONE_NUMBER_MISMATCH");
  const recipient = clean(channel.external_contact_id || channel.normalized_phone).replace(/[^0-9]/g, "");
  if (!recipient) throw coded("WHATSAPP_RECIPIENT_MISSING");
  let response;
  try {
    response = await fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/messages`, {
      method:"POST",
      headers:{ Authorization:`Bearer ${config.accessToken}`, "Content-Type":"application/json", Accept:"application/json" },
      body:JSON.stringify({ messaging_product:"whatsapp", recipient_type:"individual", to:recipient, type:"text", text:{ preview_url:false, body } }),
      signal:AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) { throw coded("WHATSAPP_META_UNAVAILABLE"); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw coded("WHATSAPP_META_REJECTED");
  const providerMessageId = clean(data?.messages?.[0]?.id);
  if (!providerMessageId) throw coded("WHATSAPP_META_INVALID_RESPONSE");
  return providerMessageId;
}

function finalize(messageId, providerMessageId, sent, failureCode, failureReason, config, fetchImpl) {
  return rpc("mws_finalize_whatsapp_text_v1", { p_message_id:messageId, p_provider_message_id:providerMessageId, p_sent:sent, p_failure_code:failureCode, p_failure_reason:failureReason }, config, fetchImpl);
}
async function rpc(name, body, config, fetchImpl) {
  const response = await fetchImpl(`${config.url}/rest/v1/rpc/${name}`, { method:"POST", headers:rpcHeaders(config.key), body:JSON.stringify(body), signal:AbortSignal.timeout(TIMEOUT_MS) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw coded("WHATSAPP_STORAGE_REJECTED");
  return data;
}
async function rest(path, config, fetchImpl) {
  let response;
  try { response = await fetchImpl(`${config.url}/rest/v1/${path}`, { headers:{ apikey:config.key, Authorization:`Bearer ${config.key}`, Accept:"application/json" }, signal:AbortSignal.timeout(TIMEOUT_MS) }); }
  catch (cause) { throw coded("WHATSAPP_STORAGE_UNAVAILABLE"); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw coded("WHATSAPP_STORAGE_REJECTED");
  return data;
}
function configuration(env) {
  const value = { url:clean(env.SUPABASE_URL).replace(/\/$/,""), key:clean(env.SUPABASE_SERVICE_ROLE_KEY), accessToken:clean(env.WHATSAPP_ACCESS_TOKEN), phoneNumberId:clean(env.WHATSAPP_PHONE_NUMBER_ID), graphVersion:clean(env.WHATSAPP_GRAPH_API_VERSION) };
  if (!value.url || !value.key || !value.accessToken || !value.phoneNumberId || !/^v\d+\.\d+$/.test(value.graphVersion)) throw statusError("WHATSAPP_CONFIGURATION_MISSING",503);
  return value;
}
function rpcHeaders(key) { return { apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json", Accept:"application/json", "Accept-Profile":"public", "Content-Profile":"public" }; }
function publicError(code) { const messages={ WHATSAPP_CONFIGURATION_MISSING:"WhatsApp is nog niet geactiveerd.", WHATSAPP_CONVERSATION_NOT_FOUND:"Het gesprek bestaat niet.", WHATSAPP_CHANNEL_NOT_FOUND:"Dit gesprek heeft geen actief WhatsApp-kanaal.", WHATSAPP_META_REJECTED:"WhatsApp heeft het bericht geweigerd.", WHATSAPP_META_UNAVAILABLE:"WhatsApp is tijdelijk niet bereikbaar." }; return messages[code] || "Het WhatsApp-bericht kon niet veilig worden verzonden."; }
function statusError(code,statusCode) { const error=coded(code); error.statusCode=statusCode; return error; }
function coded(code) { const error=new Error(code); error.code=code; return error; }
function safeCode(code) { return /^WHATSAPP_[A-Z0-9_]+$/.test(clean(code)) ? clean(code) : "WHATSAPP_INTERNAL_ERROR"; }
function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
function json(statusCode,body) { return { statusCode, headers:{ "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" }, body:JSON.stringify(body) }; }

exports.handler = createHandler();
exports._private = { canAccess, createHandler, loadConversation, sendToMeta, withinCustomerServiceWindow };
