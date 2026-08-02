const { corsHeaders } = require("./_cors");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCEPTANCE_STATEMENT_VERSION = "quote_acceptance_nl_v1";
const ACCEPTANCE_STATEMENT = "Ik ga akkoord met deze specifieke offerteversie en geef Max Webstudio toestemming om het beschreven project voor te bereiden. Dit is geen betaling.";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (!["GET", "POST"].includes(event.httpMethod)) return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });
  const context = getContext();
  if (!context.available) return jsonResponse(500, { success: false, error: "De offerteomgeving is nog niet geconfigureerd." });

  try {
    const authUser = await readAuthUser(context, getBearer(event));
    const customer = await resolveCustomerForAuthUser(context, authUser.id);
    if (!customer?.id) return jsonResponse(403, { success: false, error: "Geen klantprofiel gekoppeld aan deze sessie." });
    const payload = event.httpMethod === "POST" ? parsePayload(event.body) : {};
    const quoteId = uuidOrEmpty(payload.quoteId || payload.quote_id || event.queryStringParameters?.quoteId || event.queryStringParameters?.quote_id);
    if (!quoteId) return jsonResponse(400, { success: false, error: "Offerte-ID ontbreekt." });

    if (event.httpMethod === "POST") {
      if (cleanText(payload.action).toLowerCase() !== "accept") return jsonResponse(400, { success: false, error: "Onbekende offerteactie." });
      const expectedVersion = Number(payload.expectedVersion || payload.expected_version || 0);
      const expectedChecksum = cleanText(payload.expectedChecksum || payload.expected_checksum).toLowerCase();
      const idempotencyKey = cleanText(payload.idempotencyKey || payload.idempotency_key);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || !/^[0-9a-f]{64}$/.test(expectedChecksum)) {
        return jsonResponse(400, { success: false, error: "De verwachte offerteversie ontbreekt." });
      }
      if (idempotencyKey.length < 16 || idempotencyKey.length > 160) {
        return jsonResponse(400, { success: false, error: "Ongeldige herhaalbeveiliging." });
      }
      try {
        const result = await callRpc(context, "record_quote_acceptance", {
          input_quote_id: quoteId,
          input_customer_id: customer.id,
          input_auth_user_id: authUser.id,
          input_expected_version: expectedVersion,
          input_expected_checksum: expectedChecksum,
          input_idempotency_key: idempotencyKey,
          input_statement_version: ACCEPTANCE_STATEMENT_VERSION,
          input_statement_snapshot: ACCEPTANCE_STATEMENT,
        });
        const quote = await loadQuote(context, customer.id, quoteId);
        return jsonResponse(200, {
          success: true,
          duplicate: result?.duplicate === true,
          quote,
          acceptance: sanitizeAcceptance(result?.acceptance || quote.acceptance),
          sideEffects: { paymentStarted: false, emailSent: false },
        });
      } catch (error) {
        if (error.code === "40001") return jsonResponse(409, { success: false, error: "De offerte is gewijzigd. Ververs de pagina en controleer de nieuwe versie." });
        if (error.code === "23514") return jsonResponse(409, { success: false, error: "Deze offerte kan niet meer worden geaccepteerd." });
        if (error.code === "42501") return jsonResponse(403, { success: false, error: "Je hebt geen toegang tot deze offerte." });
        throw error;
      }
    }

    const quote = await loadQuote(context, customer.id, quoteId);
    return jsonResponse(200, { success: true, quote });
  } catch (error) {
    console.error("Client quote failed", { message: error.message, status: error.status || 500, code: error.code || "" });
    return jsonResponse(error.status || 500, { success: false, error: error.message || "De offerte kon niet worden geladen." });
  }
};

async function loadQuote(context, customerId, quoteId) {
  const quote = await readSingle(context, "quotes", [
    "select=id,customer_id,website_id,project_id,quote_number,type,title,status,quote_date,valid_until,subtotal,vat,total,accepted_at,sent_at,proposal,metadata,archived_at,deleted_at,created_at,updated_at,quote_version",
    `id=eq.${quoteId}`,
    `customer_id=eq.${customerId}`,
    "limit=1",
  ].join("&"));
  if (!quote?.id) throw httpError("Offerte niet gevonden voor dit klantaccount.", 404);
  const [lines, acceptanceRows, checksum] = await Promise.all([
    readRows(context, "quote_lines", `select=id,description,quantity,unit_price,vat_rate,line_total,position&quote_id=eq.${quote.id}&deleted_at=is.null&order=position.asc,id.asc`),
    readRows(context, "quote_acceptances", `select=id,quote_id,customer_id,project_id,quote_version,quote_checksum,subtotal,vat,total,currency,accepted_at,acceptance_statement_version,created_at&quote_id=eq.${quote.id}&customer_id=eq.${customerId}&limit=1`),
    callRpc(context, "cp_a_quote_checksum", { input_quote_id: quote.id }),
  ]);
  const acceptance = Array.isArray(acceptanceRows) ? acceptanceRows[0] || null : null;
  return sanitizeQuote(quote, lines, checksum, acceptance);
}

function sanitizeQuote(row = {}, lines = [], checksum = "", acceptance = null) {
  const status = acceptance ? "accepted" : cleanText(row.status || "draft");
  const validUntil = cleanText(row.valid_until);
  const validDate = validUntil ? new Date(`${validUntil}T23:59:59Z`) : null;
  const replaced = Boolean(row.metadata?.replacedByQuoteId || row.metadata?.supersededByQuoteId);
  return {
    id: cleanText(row.id),
    quoteNumber: cleanText(row.quote_number) || "Offerte",
    projectId: cleanText(row.project_id),
    websiteId: cleanText(row.website_id),
    type: cleanText(row.type),
    title: cleanText(row.title) || "Offerte",
    proposal: cleanText(row.proposal),
    status,
    version: Number(row.quote_version || 1),
    checksum: cleanText(checksum),
    quoteDate: cleanText(row.quote_date || row.created_at),
    validUntil,
    sentAt: cleanText(row.sent_at),
    subtotal: Number(row.subtotal || 0),
    vat: Number(row.vat || 0),
    total: Number(row.total || 0),
    currency: "EUR",
    lines: (Array.isArray(lines) ? lines : []).map((line) => ({
      id: cleanText(line.id),
      description: cleanText(line.description) || "Offertregel",
      quantity: Number(line.quantity || 0),
      unitPrice: Number(line.unit_price || 0),
      vatRate: Number(line.vat_rate || 0),
      lineTotal: Number(line.line_total || 0),
      position: Number(line.position || 0),
    })),
    acceptable: !acceptance && status === "sent" && Boolean(validDate && validDate.getTime() >= Date.now())
      && !row.archived_at && !row.deleted_at && !replaced,
    acceptanceStatement: ACCEPTANCE_STATEMENT,
    acceptanceStatementVersion: ACCEPTANCE_STATEMENT_VERSION,
    acceptance: acceptance ? sanitizeAcceptance(acceptance) : null,
  };
}

function sanitizeAcceptance(row = {}) {
  if (!row?.id) return null;
  return {
    id: cleanText(row.id),
    quoteId: cleanText(row.quote_id),
    quoteVersion: Number(row.quote_version || 0),
    quoteChecksum: cleanText(row.quote_checksum),
    subtotal: Number(row.subtotal || 0),
    vat: Number(row.vat || 0),
    total: Number(row.total || 0),
    currency: cleanText(row.currency || "EUR"),
    acceptedAt: cleanText(row.accepted_at),
    statementVersion: cleanText(row.acceptance_statement_version),
  };
}

async function readAuthUser(context, bearer) {
  if (!bearer) throw httpError("Log in om deze offerte te bekijken.", 401);
  const response = await fetch(`${context.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: context.anonKey, Authorization: `Bearer ${bearer}`, Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) throw httpError("Sessie is ongeldig.", 401);
  return data;
}

async function resolveCustomerForAuthUser(context, authUserId) {
  const direct = await readSingle(context, "customers", `select=*&auth_user_id=eq.${authUserId}&limit=1`);
  if (direct?.id) return direct;
  const profile = await readSingle(context, "profiles", `select=*&auth_user_id=eq.${authUserId}&limit=1`);
  if (!profile?.id) return null;
  return readSingle(context, "customers", `select=*&profile_id=eq.${profile.id}&limit=1`);
}

async function readRows(context, table, query) {
  const data = await supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?${query}`, { headers: restHeaders(context.serviceRoleKey) });
  return Array.isArray(data) ? data : [];
}

async function readSingle(context, table, query) {
  const rows = await readRows(context, table, query);
  return rows[0] || null;
}

async function callRpc(context, name, record) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...restHeaders(context.serviceRoleKey), "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

async function supabaseFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Databaseverzoek mislukt.");
    error.status = response.status;
    error.code = data?.code || "";
    throw error;
  }
  return data;
}

function restHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" };
}

function getContext() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const anonKey = cleanText(process.env.SUPABASE_ANON_KEY);
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { available: Boolean(supabaseUrl && anonKey && serviceRoleKey), supabaseUrl, anonKey, serviceRoleKey };
}

function getBearer(event = {}) {
  const value = event.headers?.authorization || event.headers?.Authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function parsePayload(body) {
  try { return JSON.parse(body || "{}"); } catch { throw httpError("Ongeldige JSON body.", 400); }
}

function uuidOrEmpty(value) { const text = cleanText(value); return UUID_PATTERN.test(text) ? text : ""; }
function cleanText(value = "") { return String(value || "").trim(); }
function httpError(message, status) { return Object.assign(new Error(message), { status }); }
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...corsHeaders({ methods: "GET, POST, OPTIONS" }) },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

exports._private = { sanitizeQuote, sanitizeAcceptance };
