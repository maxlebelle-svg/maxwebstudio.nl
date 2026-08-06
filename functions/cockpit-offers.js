const crypto = require("node:crypto");
const commercialOffers = require("./admin-commercial-offers")._private;

const RESPONSE_VERSION = "cockpit-offers-v1";
const MAX_BODY_BYTES = 16384;
const TOKEN_TTL_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_KEY = /^[a-zA-Z0-9:_-]{16,150}$/;
const ADMIN_ROLES = new Set(["super_admin", "admin"]);

exports.handler = createHandler();
exports.createHandler = createHandler;

function createHandler(dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const env = dependencies.env || process.env;
  const now = dependencies.now || (() => new Date());
  const operations = dependencies.operations || {
    preview: commercialOffers.previewMail,
    dispatch: commercialOffers.dispatchMail,
    config: commercialOffers.runtimeConfig,
  };

  return async function cockpitOffers(event = {}) {
    const headers = responseHeaders();
    if (String(event.httpMethod || "").toUpperCase() !== "POST") {
      return json(405, { success: false, code: "POST_REQUIRED", error: "Deze voorstelkoppeling accepteert uitsluitend gecontroleerde acties." }, headers);
    }
    if (clean(header(event, "origin"))) {
      return json(403, { success: false, code: "SERVER_TO_SERVER_REQUIRED", error: "Gebruik de beveiligde serverfunctie van de Cockpit." }, headers);
    }

    const writeToken = clean(env.COCKPIT_WRITE_TOKEN);
    if (writeToken.length < 48 || safeEqual(writeToken, clean(env.COCKPIT_READ_TOKEN))) {
      return json(503, { success: false, code: "COCKPIT_OFFERS_NOT_CONFIGURED", error: "De Cockpit-voorstelkoppeling is nog niet veilig geconfigureerd." }, headers);
    }
    if (!safeEqual(bearer(event), writeToken)) {
      return json(401, { success: false, code: "UNAUTHORIZED", error: "Niet geautoriseerd." }, headers);
    }

    const supabaseUrl = clean(env.SUPABASE_URL).replace(/\/$/, "");
    const secretKey = clean(env.SUPABASE_COCKPIT_SECRET_KEY);
    const actorEmail = clean(env.COCKPIT_ACTOR_EMAIL || env.ADMIN_EMAIL).toLowerCase();
    if (!supabaseUrl || !secretKey || !validEmail(actorEmail) || typeof fetchImpl !== "function") {
      return json(503, { success: false, code: "COCKPIT_ACTOR_NOT_CONFIGURED", error: "De Cockpit-beheerder is nog niet veilig geconfigureerd." }, headers);
    }

    const parsed = parseBody(event.body);
    if (!parsed.ok) return json(parsed.status, { success: false, code: parsed.code, error: parsed.error }, headers);
    const input = validateInput(parsed.value);
    if (!input.ok) return json(400, { success: false, code: input.code, error: input.error }, headers);

    try {
      const context = { fetchImpl, supabaseUrl, secretKey, writeToken, now };
      const [lead, offer, actor] = await Promise.all([
        readOne(context, `leads?select=*&id=eq.${input.leadId}&limit=1`),
        readOne(context, `commercial_offers?select=id,title,status,relationship_type,relationship_id,current_version_id&id=eq.${input.offerId}&limit=1`),
        resolveActor(context, actorEmail),
      ]);
      assertContext({ lead, offer, actor, input });
      const config = operations.config();
      if (!config?.ready) throw coded("OFFER_STORAGE_UNAVAILABLE", 503, "De voorstelopslag is tijdelijk niet beschikbaar.");

      if (input.action === "preview") {
        const result = await invoke(() => operations.preview({ offerVersionId: input.offerVersionId, actionKey: input.actionKey }, actor, config));
        const preview = object(result.preview);
        const previewToken = sealStage(context, input, lead, "preview");
        return json(200, {
          success: true,
          version: RESPONSE_VERSION,
          stage: "preview",
          offer: publicOffer(offer, input),
          recipient: publicRecipient(lead),
          preview: {
            subject: clean(preview.subject),
            text: clean(preview.text),
            desktopUrl: safeHttpsUrl(preview.desktopUrl),
            mobileUrl: safeHttpsUrl(preview.mobileUrl),
            storefrontUrl: safeHttpsUrl(preview.storefrontUrl),
            restaurantPortalUrl: safeHttpsUrl(preview.restaurantPortalUrl),
            validUntil: clean(preview.validUntil),
          },
          previewToken,
          expiresIn: Math.floor(TOKEN_TTL_MS / 1000),
        }, headers);
      }

      if (input.action === "test") {
        verifyStage(context, input.stageToken, input, lead, "preview");
        const result = await invoke(() => operations.dispatch("test", { offerVersionId: input.offerVersionId, actionKey: input.actionKey }, actor, config));
        return json(200, {
          success: true,
          version: RESPONSE_VERSION,
          stage: "test",
          duplicate: Boolean(result.duplicate),
          sentTo: actor.email,
          testToken: sealStage(context, input, lead, "test"),
          expiresIn: Math.floor(TOKEN_TTL_MS / 1000),
        }, headers);
      }

      verifyStage(context, input.stageToken, input, lead, "test");
      if (input.confirmation !== "VERSTUUR") throw coded("CONFIRMATION_REQUIRED", 409, "Typ VERSTUUR om de definitieve verzending te bevestigen.");
      const result = await invoke(() => operations.dispatch("definitive", { offerVersionId: input.offerVersionId, actionKey: input.actionKey }, actor, config));
      return json(200, {
        success: true,
        version: RESPONSE_VERSION,
        stage: "sent",
        duplicate: Boolean(result.duplicate),
        offerId: input.offerId,
        offerVersionId: input.offerVersionId,
        recipient: "customer",
      }, headers);
    } catch (error) {
      const status = Number(error.status || error.statusCode) || 502;
      console.error("Cockpit offer action failed", { action: input.action, offerId: input.offerId, status, code: error.code || "OFFER_ACTION_FAILED" });
      return json(status, { success: false, code: error.code || "OFFER_ACTION_FAILED", error: status >= 500 ? "De voorstelactie is veilig gestopt. Probeer het opnieuw." : error.publicMessage || error.message }, headers);
    }
  };
}

function validateInput(body = {}) {
  const action = clean(body.action).toLowerCase();
  if (!["preview", "test", "send"].includes(action)) return invalid("ACTION_NOT_ALLOWED", "Deze voorstelhandeling is niet toegestaan vanuit de Cockpit.");
  const offerId = clean(body.offerId);
  const offerVersionId = clean(body.offerVersionId);
  const leadId = clean(body.leadId);
  if (![offerId, offerVersionId, leadId].every((value) => UUID.test(value))) return invalid("CONTEXT_INVALID", "Kies een geldig voorstel en een geldige lead.");
  const actionKey = clean(body.actionKey);
  if (!ACTION_KEY.test(actionKey)) return invalid("ACTION_KEY_INVALID", "De unieke aanvraagcode ontbreekt.");
  const stageToken = action === "preview" ? "" : clean(body.stageToken);
  if (action !== "preview" && stageToken.length < 80) return invalid("STAGE_TOKEN_REQUIRED", "Doorloop eerst de vorige controlestap.");
  return { ok: true, action, offerId, offerVersionId, leadId, actionKey, stageToken, confirmation: clean(body.confirmation) };
}

async function resolveActor(context, email) {
  const encoded = encodeURIComponent(email);
  const actor = await readOne(context, `profiles?select=id,auth_user_id,email,role,status&email=eq.${encoded}&status=eq.active&limit=1`);
  if (!actor || !UUID.test(clean(actor.id)) || !UUID.test(clean(actor.auth_user_id)) || !ADMIN_ROLES.has(normalize(actor.role)) || clean(actor.email).toLowerCase() !== email) {
    throw coded("COCKPIT_ACTOR_INVALID", 503, "De Cockpit-beheerder kon niet veilig worden vastgesteld.");
  }
  return { id: clean(actor.auth_user_id), profileId: clean(actor.id), email, role: normalize(actor.role) };
}

function assertContext({ lead, offer, actor, input }) {
  if (!lead) throw coded("LEAD_NOT_FOUND", 404, "Deze lead bestaat niet meer.");
  if (isDemo(lead)) throw coded("DEMO_SEND_BLOCKED", 403, "Demo-leads mogen geen echte voorstellen ontvangen.");
  if (!validEmail(clean(lead.email))) throw coded("CUSTOMER_EMAIL_REQUIRED", 409, "Vul in het adminportaal eerst een geldig e-mailadres in.");
  if (!offer) throw coded("OFFER_NOT_FOUND", 404, "Dit voorstel bestaat niet meer.");
  if (clean(offer.relationship_type).toLowerCase() !== "lead" || clean(offer.relationship_id) !== input.leadId || clean(offer.current_version_id) !== input.offerVersionId) {
    throw coded("OFFER_CONTEXT_MISMATCH", 409, "Het voorstel hoort niet bij deze lead of is niet meer de actuele versie.");
  }
  if (!actor?.id || !actor?.profileId) throw coded("COCKPIT_ACTOR_INVALID", 503, "De Cockpit-beheerder kon niet veilig worden vastgesteld.");
}

async function invoke(operation) {
  const response = await operation();
  const status = Number(response?.statusCode) || 500;
  let body = {};
  try { body = JSON.parse(response?.body || "{}"); } catch {}
  if (status < 200 || status >= 300 || body.success !== true) {
    throw coded(clean(body.code) || "OFFER_ACTION_REJECTED", status, clean(body.error) || "De voorstelactie is afgewezen.");
  }
  return body;
}

function sealStage(context, input, lead, stage) {
  const issuedAt = context.now().getTime();
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    stage,
    offerId: input.offerId,
    offerVersionId: input.offerVersionId,
    leadId: input.leadId,
    recipientHash: sha256(clean(lead.email).toLowerCase()),
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_MS,
  })).toString("base64url");
  return `${payload}.${hmac(payload, context.writeToken)}`;
}

function verifyStage(context, token, input, lead, expectedStage) {
  const [payload, signature, extra] = clean(token).split(".");
  if (!payload || !signature || extra || !safeEqual(signature, hmac(payload, context.writeToken))) throw coded("STAGE_TOKEN_INVALID", 409, "De controlestap is ongeldig of verlopen.");
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw coded("STAGE_TOKEN_INVALID", 409, "De controlestap is ongeldig of verlopen."); }
  const nowMs = context.now().getTime();
  if (data.v !== 1 || data.stage !== expectedStage || data.offerId !== input.offerId || data.offerVersionId !== input.offerVersionId || data.leadId !== input.leadId || data.recipientHash !== sha256(clean(lead.email).toLowerCase()) || !Number.isFinite(data.exp) || data.exp < nowMs || data.iat > nowMs + 5000) {
    throw coded("STAGE_TOKEN_INVALID", 409, "De controlestap is ongeldig of verlopen.");
  }
}

async function readOne(context, path) {
  const response = await context.fetchImpl(`${context.supabaseUrl}/rest/v1/${path}`, {
    method: "GET",
    headers: { apikey: context.secretKey, Accept: "application/json", "Accept-Profile": "public" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data)) throw coded("DATA_SOURCE_UNAVAILABLE", response.status || 502, "De Cockpit-databron is tijdelijk niet beschikbaar.");
  return data[0] || null;
}

function publicOffer(offer, input) { return { id: input.offerId, versionId: input.offerVersionId, title: clean(offer.title) || "Voorstel", status: clean(offer.status) }; }
function publicRecipient(lead) { return { companyName: clean(lead.company_name || lead.company || lead.name), contactName: clean(lead.contact_name || lead.contact_person), email: clean(lead.email).toLowerCase() }; }
function safeHttpsUrl(value) { const raw = clean(value); if (!raw) return ""; try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : ""; } catch { return ""; } }
function parseBody(body) { const raw = typeof body === "string" ? body : JSON.stringify(body || {}); if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return { ok: false, status: 413, code: "BODY_TOO_LARGE", error: "De aanvraag is te groot." }; try { const value = JSON.parse(raw || "{}"); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid"); return { ok: true, value }; } catch { return { ok: false, status: 400, code: "INVALID_JSON", error: "De aanvraag bevat geen geldige gegevens." }; } }
function isDemo(row = {}) { const metadata = object(row.metadata); const source = normalize(row.source || metadata.source); const environment = normalize(row.environment || metadata.environment); return Boolean(row.is_demo || row.isDemo || metadata.isDemo) || environment === "demo" || source.includes("demo") || clean(row.email).toLowerCase().endsWith(".example"); }
function responseHeaders() { return { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "X-MWS-Cockpit-Mode": "restricted-offers" }; }
function json(statusCode, body, headers = responseHeaders()) { return { statusCode, headers, body: JSON.stringify(body) }; }
function invalid(code, error) { return { ok: false, code, error }; }
function coded(code, status, publicMessage) { return Object.assign(new Error(publicMessage), { code, status, statusCode: status, publicMessage }); }
function hmac(value, secret) { return crypto.createHmac("sha256", secret).update(value).digest("base64url"); }
function sha256(value) { return crypto.createHash("sha256").update(clean(value)).digest("hex"); }
function validEmail(value) { const email = clean(value); return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function normalize(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clean(value) { return String(value ?? "").trim(); }
function header(event = {}, name) { const headers = event.headers || {}; return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()] ?? ""; }
function bearer(event = {}) { const authorization = clean(header(event, "authorization")); return authorization.startsWith("Bearer ") ? clean(authorization.slice(7)) : ""; }
function safeEqual(left, right) { const a = Buffer.from(String(left || "")); const b = Buffer.from(String(right || "")); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); }

exports._test = { assertContext, sealStage, validateInput, verifyStage };
