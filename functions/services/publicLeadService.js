const crypto = require("node:crypto");
const { normalizedLeadIdentifiers } = require("./leadDeduplicationService");

async function persistPublicLead(input = {}, dependencies = {}) {
  const env = dependencies.env || process.env;
  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const supabaseUrl = cleanText(env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) throw statusError(503, "Leadopslag is niet geconfigureerd.");

  const lead = normalizeInput(input);
  const requestId = stableRequestId(lead);
  const headers = restHeaders(serviceRoleKey);
  const existing = await findExisting({ supabaseUrl, headers, fetchImpl, requestId, email: lead.email });
  if (existing) return { lead: existing, created: false, requestId };

  const identifiers = normalizedLeadIdentifiers(lead);
  const now = new Date().toISOString();
  const record = {
    company_name: lead.company,
    contact_name: lead.name,
    email: lead.email,
    phone: lead.phone,
    status: "nieuw",
    lead_status: "new",
    notes: lead.message,
    normalized_company_name: identifiers.normalizedCompanyName || null,
    normalized_phone: identifiers.normalizedPhone || null,
    external_source: lead.source,
    external_source_id: requestId,
    last_activity_at: now,
    is_demo: false,
    environment: "production",
    metadata: {
      source: lead.source,
      publicRequestId: requestId,
      submittedAt: lead.submittedAt,
      packageInterest: lead.packageInterest,
      carePackage: lead.carePackage,
      termsAccepted: true,
    },
    created_at: now,
    updated_at: now,
  };

  let { response, data } = await insertLead({ supabaseUrl, headers, fetchImpl, record });
  if (!response.ok && isMissingColumnResponse(response, data)) {
    const raced = await findExisting({ supabaseUrl, headers, fetchImpl, requestId, email: lead.email });
    if (raced) return { lead: raced, created: false, requestId };
    ({ response, data } = await insertLead({
      supabaseUrl,
      headers,
      fetchImpl,
      record: legacyCompatibleRecord(record),
    }));
  }
  if (response.status === 409) {
    const raced = await findExisting({ supabaseUrl, headers, fetchImpl, requestId, email: lead.email });
    if (raced) return { lead: raced, created: false, requestId };
  }
  if (!response.ok) throw statusError(503, data?.message || data?.error || "Lead kon niet duurzaam worden opgeslagen.");
  const persisted = Array.isArray(data) ? data[0] : data;
  if (!isUuid(persisted?.id)) throw statusError(503, "Leadopslag gaf geen geldige lead-ID terug.");
  return { lead: persisted, created: true, requestId };
}

async function insertLead({ supabaseUrl, headers, fetchImpl, record }) {
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/leads`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(record),
  });
  return { response, data: await readJson(response) };
}

function legacyCompatibleRecord(record) {
  return {
    company_name: record.company_name,
    contact_name: record.contact_name,
    email: record.email,
    phone: record.phone,
    status: record.status,
    notes: record.notes,
    is_demo: record.is_demo,
    environment: record.environment,
    metadata: {
      ...record.metadata,
      leadStatus: record.lead_status,
      lead_status: record.lead_status,
      normalizedCompanyName: record.normalized_company_name,
      normalizedPhone: record.normalized_phone,
      externalSource: record.external_source,
      externalSourceId: record.external_source_id,
      lastActivityAt: record.last_activity_at,
    },
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function isMissingColumnResponse(response, data) {
  if (response.status !== 400) return false;
  const evidence = [data?.code, data?.message, data?.details, data?.hint].map(cleanText).join(" ").toLowerCase();
  return evidence.includes("pgrst204") || evidence.includes("42703") || evidence.includes("column") || evidence.includes("schema cache");
}

async function findExisting({ supabaseUrl, headers, fetchImpl, requestId, email }) {
  for (const filter of [
    `external_source=eq.homepage-contact-form&external_source_id=eq.${encodeURIComponent(requestId)}`,
    `email=eq.${encodeURIComponent(email)}`,
  ]) {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/leads?select=*&${filter}&order=created_at.desc&limit=1`, { headers });
    const data = await readJson(response);
    if (!response.ok) {
      if (response.status === 400 && filter.startsWith("external_source=")) continue;
      throw statusError(503, data?.message || data?.error || "Bestaande lead kon niet worden gecontroleerd.");
    }
    if (Array.isArray(data) && data[0]?.id) return data[0];
  }
  return null;
}

function normalizeInput(input = {}) {
  return {
    id: cleanText(input.id || input.requestId),
    name: cleanText(input.name), company: cleanText(input.company), email: cleanText(input.email).toLowerCase(), phone: cleanText(input.phone),
    packageInterest: cleanText(input.packageInterest), carePackage: cleanText(input.carePackage), message: cleanText(input.message),
    source: "homepage-contact-form", submittedAt: cleanText(input.submittedAt || input.createdAt) || new Date().toISOString(),
  };
}

function stableRequestId(lead) {
  if (/^lead-[a-z0-9-]{6,80}$/i.test(lead.id)) return lead.id;
  return `lead-${crypto.createHash("sha256").update([lead.email, lead.submittedAt, lead.message].join("|")).digest("hex").slice(0, 32)}`;
}

function restHeaders(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" }; }
async function readJson(response) { const text = await response.text(); try { return text ? JSON.parse(text) : null; } catch { return null; } }
function statusError(status, message) { const error = new Error(message); error.status = status; return error; }
function cleanText(value) { return String(value || "").trim(); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value)); }

module.exports = { persistPublicLead, _private: { isMissingColumnResponse, legacyCompatibleRecord, normalizeInput, stableRequestId } };
