const crypto = require("crypto");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOMAIN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const TYPES = new Set(["registration", "transfer", "connection"]);
const STATUSES = new Set([
  "draft", "awaiting_customer", "ready_for_review", "awaiting_approval",
  "scheduled", "in_progress", "technical_checks", "active", "needs_action",
  "failed", "cancelled",
]);

function contextFromEnv() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) throw httpError(500, "Domeinworkflow is nog niet geconfigureerd.");
  return { supabaseUrl, serviceRoleKey };
}

async function getAuthUser(context, event) {
  const authorization = cleanText(event.headers?.authorization || event.headers?.Authorization);
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const response = await fetch(`${context.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: context.serviceRoleKey, Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) return null;
  return response.json();
}

async function customerForAuthUser(context, authUserId) {
  if (!isUuid(authUserId)) return null;
  return fetchOne(context, "customers", "id,auth_user_id,profile_id,name,company,email,website", `auth_user_id=eq.${encodeURIComponent(authUserId)}`);
}

async function listRequests(context, customerId) {
  if (!isUuid(customerId)) throw httpError(400, "Ongeldige klant.");
  const select = "id,customer_id,project_id,website_id,request_type,domain_name,alternative_domains,status,customer_payload,internal_metadata,transfer_secret_received_at,transfer_secret_consumed_at,customer_submitted_at,completed_at,created_at,updated_at";
  const rows = await rest(context, `domain_requests?select=${encodeURIComponent(select)}&customer_id=eq.${encodeURIComponent(customerId)}&order=updated_at.desc`);
  return (Array.isArray(rows) ? rows : []).map(sanitizeRequest);
}

async function createRequest(context, input, actor = {}) {
  const customerId = cleanText(input.customerId);
  const requestType = cleanText(input.requestType).toLowerCase();
  const domainName = normalizeDomain(input.domainName);
  if (!isUuid(customerId)) throw httpError(400, "Kies een geldige klant.");
  if (!TYPES.has(requestType)) throw httpError(400, "Kies registratie, verhuizing of koppeling.");
  if (!isDomain(domainName)) throw httpError(400, "Vul een geldige domeinnaam in.");
  const now = new Date().toISOString();
  const record = {
    customer_id: customerId,
    project_id: isUuid(input.projectId) ? input.projectId : null,
    website_id: isUuid(input.websiteId) ? input.websiteId : null,
    request_type: requestType,
    domain_name: domainName,
    alternative_domains: normalizeDomains(input.alternativeDomains).filter((value) => value !== domainName),
    status: "awaiting_customer",
    internal_metadata: { note: cleanText(input.note).slice(0, 2000), steps: defaultSteps(requestType) },
    created_by_auth_user_id: isUuid(actor.id || actor.authUserId) ? (actor.id || actor.authUserId) : null,
    created_at: now,
    updated_at: now,
  };
  let rows;
  try {
    rows = await rest(context, "domain_requests", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) });
  } catch (error) {
    if (error.status === 409) throw httpError(409, "Er staat al een open domeinopdracht voor dit domein.");
    throw error;
  }
  const created = rows?.[0];
  await appendEvent(context, created, "admin", actor, "domain_request_created", { requestType, domainName });
  return sanitizeRequest(created);
}

async function saveCustomerInput(context, customer, input, actor) {
  const request = await requestForCustomer(context, input.requestId, customer.id);
  if (["active", "failed", "cancelled"].includes(request.status)) throw httpError(409, "Deze domeinopdracht kan niet meer worden aangepast.");
  if (!["draft", "awaiting_customer", "ready_for_review", "needs_action"].includes(request.status)) throw httpError(409, "Max Webstudio is deze domeinopdracht al aan het uitvoeren.");
  const payload = normalizeCustomerPayload(input.customerPayload || input.answers || {}, request.request_type);
  const submitted = input.action === "submit";
  const missing = missingCustomerFields(payload, request.request_type);
  if (submitted && missing.length) throw httpError(400, `Vul eerst in: ${missing.join(", ")}.`);
  const now = new Date().toISOString();
  const patch = {
    customer_payload: payload,
    status: submitted ? "ready_for_review" : request.status,
    customer_submitted_at: submitted ? now : request.customer_submitted_at,
    updated_at: now,
  };
  const transferCode = cleanText(input.transferCode);
  if (submitted && request.request_type === "transfer" && !transferCode && !request.transfer_secret_received_at) throw httpError(400, "Vul eerst de verhuiscode in.");
  if (request.request_type === "transfer" && transferCode) {
    patch.transfer_secret_ciphertext = encryptSecret(transferCode);
    patch.transfer_secret_received_at = now;
    patch.transfer_secret_consumed_at = null;
  }
  const rows = await rest(context, `domain_requests?id=eq.${encodeURIComponent(request.id)}&customer_id=eq.${encodeURIComponent(customer.id)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch),
  });
  const updated = rows?.[0];
  await appendEvent(context, updated, "customer", actor, submitted ? "customer_input_submitted" : "customer_input_saved", {
    requestType: request.request_type, hasTransferCode: Boolean(transferCode || updated.transfer_secret_received_at),
  });
  return sanitizeRequest(updated);
}

async function updateAdminRequest(context, input, actor = {}) {
  const requestId = cleanText(input.requestId);
  const customerId = cleanText(input.customerId);
  const status = cleanText(input.status).toLowerCase();
  if (!isUuid(requestId) || !isUuid(customerId)) throw httpError(400, "Ongeldige domeinopdracht.");
  if (!STATUSES.has(status)) throw httpError(400, "Ongeldige status.");
  const existing = await requestForCustomer(context, requestId, customerId);
  const now = new Date().toISOString();
  const internalMetadata = {
    ...(existing.internal_metadata || {}),
    note: input.note === undefined ? cleanText(existing.internal_metadata?.note) : cleanText(input.note).slice(0, 2000),
    steps: { ...(existing.internal_metadata?.steps || {}), ...(plainBooleanObject(input.steps) || {}) },
  };
  const patch = { status, internal_metadata: internalMetadata, updated_at: now };
  if (status === "active") patch.completed_at = existing.completed_at || now;
  const rows = await rest(context, `domain_requests?id=eq.${encodeURIComponent(requestId)}&customer_id=eq.${encodeURIComponent(customerId)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch),
  });
  const updated = rows?.[0];
  if (status === "active") await upsertDomainAsset(context, updated);
  await appendEvent(context, updated, "admin", actor, "domain_request_status_changed", { from: existing.status, to: status });
  return sanitizeRequest(updated);
}

async function revealTransferCode(context, input, actor = {}) {
  const request = await requestForCustomer(context, input.requestId, input.customerId);
  if (request.request_type !== "transfer" || !request.transfer_secret_ciphertext) throw httpError(404, "Er is geen verhuiscode aangeleverd.");
  const transferCode = decryptSecret(request.transfer_secret_ciphertext);
  await rest(context, `domain_requests?id=eq.${encodeURIComponent(request.id)}`, {
    method: "PATCH", body: JSON.stringify({ transfer_secret_consumed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  await appendEvent(context, request, "admin", actor, "transfer_code_revealed", { reason: "domain_transfer_execution" });
  return transferCode;
}

async function requestForCustomer(context, requestId, customerId) {
  if (!isUuid(requestId) || !isUuid(customerId)) throw httpError(400, "Ongeldige domeinopdracht.");
  const request = await fetchOne(context, "domain_requests", "*", `id=eq.${encodeURIComponent(requestId)}&customer_id=eq.${encodeURIComponent(customerId)}`);
  if (!request) throw httpError(404, "Domeinopdracht niet gevonden.");
  return request;
}

async function appendEvent(context, request, actorType, actor, eventType, safeMetadata = {}) {
  if (!request?.id) return;
  await rest(context, "domain_request_events", {
    method: "POST",
    body: JSON.stringify({
      domain_request_id: request.id,
      customer_id: request.customer_id,
      actor_type: actorType,
      actor_auth_user_id: isUuid(actor?.id || actor?.authUserId) ? (actor.id || actor.authUserId) : null,
      event_type: eventType,
      safe_metadata: safeMetadata,
    }),
  });
}

async function upsertDomainAsset(context, request) {
  const payload = request.customer_payload || {};
  const record = {
    customer_id: request.customer_id,
    website_id: request.website_id,
    source_request_id: request.id,
    domain_name: request.domain_name,
    status: "active",
    legal_owner: cleanText(payload.holderName || payload.companyName),
    auto_renew: Boolean(payload.autoRenew),
    email_status: payload.hasDomainEmail === "yes" ? "existing" : "not_configured",
    updated_at: new Date().toISOString(),
  };
  await rest(context, "domains?on_conflict=customer_id,domain_name", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record),
  });
}

function sanitizeRequest(row = {}) {
  return {
    id: row.id,
    customerId: row.customer_id,
    projectId: row.project_id,
    websiteId: row.website_id,
    requestType: row.request_type,
    domainName: row.domain_name,
    alternativeDomains: row.alternative_domains || [],
    status: row.status,
    customerPayload: row.customer_payload || {},
    internalMetadata: row.internal_metadata || {},
    hasTransferCode: Boolean(row.transfer_secret_received_at),
    transferCodeViewed: Boolean(row.transfer_secret_consumed_at),
    customerSubmittedAt: row.customer_submitted_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCustomerPayload(input = {}, requestType) {
  const allowed = ["holderType", "holderName", "companyName", "address", "postalCode", "city", "country", "phone", "email", "currentRegistrar", "hasDomainEmail", "mailboxes", "transferTiming", "dnsScope", "autoRenew", "approval", "notes"];
  const result = {};
  allowed.forEach((key) => {
    if (key === "autoRenew" || key === "approval") result[key] = input[key] === true;
    else if (key === "mailboxes") result[key] = String(input[key] || "").split(/\n|,/).map(cleanText).filter(Boolean).slice(0, 30);
    else result[key] = cleanText(input[key]).slice(0, key === "notes" ? 2000 : 300);
  });
  result.requestType = requestType;
  return result;
}

function missingCustomerFields(payload, type) {
  const labels = [];
  if (!payload.holderName) labels.push("naam domeinhouder");
  if (!payload.address || !payload.postalCode || !payload.city) labels.push("volledig adres");
  if (!payload.email) labels.push("e-mailadres");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) labels.push("geldig e-mailadres");
  if (!payload.approval) labels.push("akkoord");
  if (type === "transfer" && !payload.currentRegistrar) labels.push("huidige provider");
  if (["transfer", "connection"].includes(type) && !payload.hasDomainEmail) labels.push("e-mailgebruik op het domein");
  return labels;
}

function defaultSteps(type) {
  return type === "registration"
    ? { availability_checked: false, approval_received: false, registered: false, dns_checked: false, ssl_active: false }
    : { transfer_code_received: false, transfer_started: false, dns_checked: false, ssl_active: false, email_checked: false };
}

function encryptSecret(secret) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(cleanText(secret), "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(envelope) {
  const [version, iv, tag, encrypted] = cleanText(envelope).split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw httpError(500, "Verhuiscode kan niet veilig worden gelezen.");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw httpError(500, "Verhuiscode kan niet veilig worden gelezen.");
  }
}

function encryptionKey() {
  const secret = cleanText(process.env.DOMAIN_TRANSFER_ENCRYPTION_KEY);
  if (secret.length < 24) throw httpError(503, "Veilige opslag van de verhuiscode is nog niet geconfigureerd.");
  return crypto.createHash("sha256").update(secret).digest();
}

async function fetchOne(context, table, select, filter) {
  const rows = await rest(context, `${table}?select=${encodeURIComponent(select)}&${filter}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function rest(context, path, options = {}) {
  const response = await fetch(`${context.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: context.serviceRoleKey,
      Authorization: `Bearer ${context.serviceRoleKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Profile": "public",
      "Content-Profile": "public",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = httpError(response.status, data?.message || data?.error || "Domeingegevens konden niet worden verwerkt.");
    error.code = data?.code || "";
    throw error;
  }
  return data;
}

function normalizeDomain(value) {
  return cleanText(value).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
}
function normalizeDomains(value) { return [...new Set((Array.isArray(value) ? value : String(value || "").split(/\n|,/)).map(normalizeDomain).filter(isDomain))].slice(0, 5); }
function isDomain(value) { return DOMAIN.test(cleanText(value)); }
function isUuid(value) { return UUID.test(cleanText(value)); }
function cleanText(value) { return String(value || "").trim(); }
function plainBooleanObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [cleanText(key).slice(0, 80), item === true]));
}
function httpError(status, message) { const error = new Error(message); error.status = status; error.statusCode = status; return error; }
function jsonResponse(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }
function parsePayload(body) { try { return JSON.parse(body || "{}"); } catch { throw httpError(400, "Verzoek kon niet worden gelezen."); } }

module.exports = {
  contextFromEnv, getAuthUser, customerForAuthUser, listRequests, createRequest,
  saveCustomerInput, updateAdminRequest, revealTransferCode, jsonResponse,
  parsePayload, cleanText, isUuid, normalizeDomain,
  _private: { encryptSecret, decryptSecret, sanitizeRequest, missingCustomerFields, normalizeCustomerPayload, defaultSteps },
};
