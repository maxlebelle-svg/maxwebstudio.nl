const crypto = require("node:crypto");

const RESPONSE_VERSION = "cockpit-write-v1";
const MAX_BODY_BYTES = 8192;
const MAX_NOTE_LENGTH = 1000;
const MAX_ACTION_NOTE_LENGTH = 500;
const MAX_STORED_NOTES_LENGTH = 20000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9:_-]{16,128}$/;
const ACTION_TYPES = new Set(["call", "email", "follow_up", "appointment", "await_response", "custom"]);

exports.handler = createHandler();
exports.createHandler = createHandler;

function createHandler(dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const env = dependencies.env || process.env;
  const now = dependencies.now || (() => new Date());

  return async function cockpitWrite(event = {}) {
    const headers = responseHeaders();
    if (String(event.httpMethod || "").toUpperCase() !== "POST") {
      return json(405, { success: false, code: "POST_REQUIRED", error: "Deze Cockpit-koppeling accepteert uitsluitend gecontroleerde schrijfacties." }, headers);
    }
    if (clean(header(event, "origin"))) {
      return json(403, { success: false, code: "SERVER_TO_SERVER_REQUIRED", error: "Gebruik de beveiligde serverfunctie van de Cockpit." }, headers);
    }

    const configuredToken = clean(env.COCKPIT_WRITE_TOKEN);
    if (configuredToken.length < 48 || safeEqual(configuredToken, clean(env.COCKPIT_READ_TOKEN))) {
      return json(503, { success: false, code: "COCKPIT_WRITE_NOT_CONFIGURED", error: "De Cockpit-schrijfkoppeling is nog niet veilig geconfigureerd." }, headers);
    }
    if (!safeEqual(bearer(event), configuredToken)) {
      return json(401, { success: false, code: "UNAUTHORIZED", error: "Niet geautoriseerd." }, headers);
    }

    const supabaseUrl = clean(env.SUPABASE_URL).replace(/\/$/, "");
    const secretKey = clean(env.SUPABASE_COCKPIT_SECRET_KEY);
    if (!supabaseUrl || !secretKey || typeof fetchImpl !== "function") {
      return json(503, { success: false, code: "DATA_SOURCE_UNAVAILABLE", error: "De Cockpit-databron is niet beschikbaar." }, headers);
    }

    const parsed = parseBody(event.body);
    if (!parsed.ok) return json(parsed.status, { success: false, code: parsed.code, error: parsed.error }, headers);

    const input = validateInput(parsed.value, now());
    if (!input.ok) return json(400, { success: false, code: input.code, error: input.error }, headers);

    try {
      const context = { fetchImpl, supabaseUrl, secretKey, now };
      const existing = await readLead(context, input.leadId);
      if (!existing) return json(404, { success: false, code: "LEAD_NOT_FOUND", error: "Deze lead bestaat niet meer." }, headers);
      if (isDemo(existing)) return json(403, { success: false, code: "DEMO_WRITE_BLOCKED", error: "Demo-leads mogen niet via de Cockpit worden gewijzigd." }, headers);

      const priorWrite = object(existing.metadata).cockpitWrite;
      if (object(priorWrite).lastIdempotencyKey === input.idempotencyKey) {
        return json(200, responsePayload(existing, input, { duplicate: true }), headers);
      }

      const mutation = buildMutation(existing, input, now());
      const updated = await updateLead(context, existing, mutation);
      if (!updated) {
        return json(409, { success: false, code: "LEAD_CHANGED", error: "De lead is ondertussen gewijzigd. Vernieuw de Cockpit en probeer opnieuw." }, headers);
      }

      await writeAudit(context, updated, input).catch((error) => {
        console.warn("Cockpit audit event unavailable", { action: input.action, leadId: input.leadId, status: error.status || 502, code: error.code || "AUDIT_UNAVAILABLE" });
      });
      return json(200, responsePayload(updated, input, { duplicate: false }), headers);
    } catch (error) {
      console.error("Cockpit write failed", { action: input.action, leadId: input.leadId, status: error.status || 502, code: error.code || "UPSTREAM_FAILED" });
      return json(error.status || 502, { success: false, code: error.code || "WRITE_FAILED", error: "De wijziging is veilig gestopt. Probeer het opnieuw." }, headers);
    }
  };
}

function validateInput(body = {}, currentDate = new Date()) {
  const action = clean(body.action);
  if (!["add_note", "schedule_next_action"].includes(action)) return invalid("ACTION_NOT_ALLOWED", "Deze handeling is niet toegestaan vanuit de Cockpit.");
  const leadId = clean(body.leadId);
  if (!UUID.test(leadId)) return invalid("INVALID_LEAD_ID", "Kies een geldige lead.");
  const idempotencyKey = clean(body.idempotencyKey);
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) return invalid("INVALID_IDEMPOTENCY_KEY", "De unieke aanvraagcode is ongeldig.");

  if (action === "add_note") {
    const note = safeText(body.note, MAX_NOTE_LENGTH);
    if (!note) return invalid("NOTE_REQUIRED", "Vul een notitie in.");
    return { ok: true, action, leadId, idempotencyKey, note };
  }

  const nextActionType = clean(body.nextActionType).toLowerCase();
  if (!ACTION_TYPES.has(nextActionType)) return invalid("INVALID_ACTION_TYPE", "Kies een geldige vervolgactie.");
  const nextActionAt = validActionDate(body.nextActionAt, currentDate);
  if (!nextActionAt) return invalid("INVALID_ACTION_DATE", "Kies een geldige datum binnen de komende twee jaar.");
  const note = safeText(body.note, MAX_ACTION_NOTE_LENGTH);
  return { ok: true, action, leadId, idempotencyKey, nextActionType, nextActionAt, note };
}

function buildMutation(existing = {}, input = {}, currentDate = new Date()) {
  const timestamp = currentDate.toISOString();
  const metadata = {
    ...object(existing.metadata),
    cockpitWrite: {
      lastIdempotencyKey: input.idempotencyKey,
      lastAction: input.action,
      lastAt: timestamp,
      source: "base44-cockpit",
    },
  };

  if (input.action === "add_note") {
    const currentNotes = clean(existing.notes);
    const stampedNote = `[${timestamp.slice(0, 16).replace("T", " ")} UTC · Cockpit]\n${input.note}`;
    const notes = [currentNotes, stampedNote].filter(Boolean).join("\n\n");
    if (notes.length > MAX_STORED_NOTES_LENGTH) {
      const error = new Error("De bestaande notities zijn te lang om veilig aan te vullen.");
      error.status = 409;
      error.code = "NOTES_LIMIT_REACHED";
      throw error;
    }
    return { notes, metadata, last_activity_at: timestamp, updated_at: timestamp };
  }

  metadata.nextActionType = input.nextActionType;
  metadata.nextActionAt = input.nextActionAt;
  metadata.nextActionNote = input.note;
  metadata.nextActionCreatedAutomatically = false;
  delete metadata.nextActionCompletedAt;
  delete metadata.nextActionCompletedBy;
  return {
    next_action_type: input.nextActionType,
    next_action_at: input.nextActionAt,
    next_action_note: input.note || null,
    next_action_created_automatically: false,
    next_action_completed_at: null,
    next_action_completed_by: null,
    metadata,
    last_activity_at: timestamp,
    updated_at: timestamp,
  };
}

async function readLead(context, leadId) {
  const params = new URLSearchParams({ select: "*", id: `eq.${leadId}`, limit: "1" });
  const rows = await request(context, `leads?${params}`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateLead(context, existing, mutation) {
  const params = new URLSearchParams({ id: `eq.${existing.id}` });
  if (clean(existing.updated_at)) params.set("updated_at", `eq.${existing.updated_at}`);
  const rows = await request(context, `leads?${params}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(mutation),
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function writeAudit(context, lead, input) {
  const eventType = input.action === "add_note" ? "cockpit_note_added" : "cockpit_next_action_scheduled";
  const summary = input.action === "add_note" ? "Notitie toegevoegd via Cockpit" : "Vervolgactie gepland via Cockpit";
  const payload = {
    entity_type: "leads",
    entity_id: lead.id,
    event_type: eventType,
    summary,
    metadata: {
      source: "base44-cockpit",
      idempotencyKey: input.idempotencyKey,
      nextActionType: input.nextActionType || "",
      nextActionAt: input.nextActionAt || "",
    },
    environment: "production",
    is_demo: false,
    created_at: context.now().toISOString(),
  };
  await request(context, "activity_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload), allowEmpty: true });
}

async function request(context, path, options = {}) {
  const response = await context.fetchImpl(`${context.supabaseUrl}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: context.secretKey,
      Accept: "application/json",
      "Accept-Profile": "public",
      "Content-Profile": "public",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error("Cockpit data source returned an invalid response.");
      error.status = 502;
      error.code = "INVALID_UPSTREAM_RESPONSE";
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error("Cockpit data write failed.");
    error.status = response.status || 502;
    error.code = clean(data?.code) || "UPSTREAM_FAILED";
    throw error;
  }
  if (options.allowEmpty && !text) return null;
  return data;
}

function responsePayload(lead = {}, input = {}, options = {}) {
  return {
    success: true,
    version: RESPONSE_VERSION,
    action: input.action,
    duplicate: Boolean(options.duplicate),
    lead: {
      id: clean(lead.id),
      companyName: clean(lead.company_name || lead.company || lead.name),
      nextActionType: clean(lead.next_action_type || object(lead.metadata).nextActionType),
      nextActionAt: clean(lead.next_action_at || object(lead.metadata).nextActionAt),
      updatedAt: clean(lead.updated_at),
    },
  };
}

function parseBody(body) {
  const raw = typeof body === "string" ? body : JSON.stringify(body || {});
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return { ok: false, status: 413, code: "BODY_TOO_LARGE", error: "De aanvraag is te groot." };
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, code: "INVALID_JSON", error: "De aanvraag bevat geen geldige gegevens." };
  }
}

function validActionDate(value, currentDate) {
  const parsed = Date.parse(clean(value));
  const nowMs = currentDate.getTime();
  if (!Number.isFinite(parsed) || parsed < nowMs - 5 * 60 * 1000 || parsed > nowMs + 2 * 365 * 24 * 60 * 60 * 1000) return "";
  return new Date(parsed).toISOString();
}

function safeText(value, limit) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return text.length <= limit ? text : "";
}

function isDemo(row = {}) {
  const metadata = object(row.metadata);
  const source = clean(row.source || metadata.source).toLowerCase();
  const environment = clean(row.environment || metadata.environment).toLowerCase();
  return Boolean(row.is_demo || row.isDemo || metadata.isDemo) || environment === "demo" || source.includes("demo") || clean(row.email).toLowerCase().endsWith(".example");
}

function responseHeaders() {
  return { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "X-MWS-Cockpit-Mode": "restricted-write" };
}

function json(statusCode, body, headers = responseHeaders()) { return { statusCode, headers, body: JSON.stringify(body) }; }
function invalid(code, error) { return { ok: false, code, error }; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clean(value) { return String(value ?? "").trim(); }
function header(event = {}, name) { const headers = event.headers || {}; return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()] ?? ""; }
function bearer(event = {}) { const authorization = clean(header(event, "authorization")); return authorization.startsWith("Bearer ") ? clean(authorization.slice(7)) : ""; }
function safeEqual(left, right) { const a = Buffer.from(String(left || "")); const b = Buffer.from(String(right || "")); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); }

exports._test = { buildMutation, isDemo, parseBody, validActionDate, validateInput };
