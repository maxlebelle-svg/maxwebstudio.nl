const { verifyAdmin } = require("./_admin-auth");

const staffRoles = ["super_admin", "admin", "sales_manager", "sales_partner"];
const managerRoles = new Set(["super_admin", "admin", "sales_manager"]);
const allowedStatuses = new Set([
  "nieuw",
  "new",
  "contact_planned",
  "contacted",
  "qualified",
  "quote_ready",
  "quote_sent",
  "won",
  "lost",
  "customer_active",
  "te_bellen",
  "gebeld",
  "voicemail",
  "interesse",
  "opvolgen",
  "geen_interesse",
  "geconverteerd",
]);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});

  const adminCheck = await verifyAdmin(event, jsonResponse, {
    module: "leads",
    action: event.httpMethod.toLowerCase(),
    allowedRoles: staffRoles,
    allowedStatuses: ["active", "invited"],
  });
  if (!adminCheck.success) return adminCheck.response;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Production leads API is nog niet geconfigureerd." });
  }

  try {
    if (event.httpMethod === "GET") return readLeads({ supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    if (event.httpMethod === "POST") return createLead({ event, supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    if (event.httpMethod === "PATCH") return updateLead({ event, supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    if (event.httpMethod === "DELETE") return deleteLead({ event, supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    return jsonResponse(405, { success: false, error: "Methode niet toegestaan voor leads." });
  } catch (error) {
    const missing = isMissingTableError(error);
    console.error("Admin leads API failed", {
      method: event.httpMethod,
      role: adminCheck.admin?.role || "",
      status: error.status || 500,
      code: error.code || "",
      message: error.message,
    });
    return jsonResponse(missing ? 503 : error.status || 500, {
      success: false,
      error: missing
        ? "Production leads tabel ontbreekt nog. Rol de migration voor public.leads uit."
        : error.message || "Leads konden niet worden verwerkt.",
      setupRequired: missing,
      diagnostics: {
        module: "leads",
        resolvedRole: adminCheck.admin?.role || "",
        reason: missing ? "missing_public_leads_table" : "lead_api_failed",
      },
    });
  }
};

async function readLeads({ supabaseUrl, serviceRoleKey, admin }) {
  const params = new URLSearchParams({
    select: "id,company_name,contact_name,email,phone,website,status,owner_id,created_by,assigned_to,notes,is_demo,environment,metadata,created_at,updated_at",
    order: "updated_at.desc.nullslast",
    limit: "500",
  });
  if (!managerRoles.has(normalizeRole(admin.role))) {
    params.set("or", `(owner_id.eq.${admin.id},created_by.eq.${admin.id},assigned_to.eq.${admin.id})`);
  }
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/leads?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return jsonResponse(200, {
    success: true,
    mode: "supabase-production",
    records: rows.map(mapLead),
    counts: { supabase: rows.length, hybrid: rows.length, local: 0 },
    refreshedAt: new Date().toISOString(),
  });
}

async function createLead({ event, supabaseUrl, serviceRoleKey, admin }) {
  const payload = parsePayload(event.body);
  const record = leadPayload(payload, admin, { create: true });
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/leads`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      Prefer: "return=representation",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });
  return jsonResponse(200, { success: true, lead: mapLead(rows[0] || record), created: true });
}

async function updateLead({ event, supabaseUrl, serviceRoleKey, admin }) {
  const payload = parsePayload(event.body);
  const id = cleanText(payload.id || event.queryStringParameters?.id);
  if (!id) return jsonResponse(400, { success: false, error: "Lead id ontbreekt." });
  const existingLead = await assertCanMutateLead({ supabaseUrl, serviceRoleKey, admin, id });
  const record = leadPayload(payload, admin, { update: true });
  if (record.metadata) {
    record.metadata = {
      ...(existingLead.metadata && typeof existingLead.metadata === "object" ? existingLead.metadata : {}),
      ...record.metadata,
    };
  }
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      Prefer: "return=representation",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });
  return jsonResponse(200, { success: true, lead: mapLead(rows[0] || { id, ...record }), updated: true });
}

async function deleteLead({ event, supabaseUrl, serviceRoleKey, admin }) {
  const id = cleanText(event.queryStringParameters?.id || parsePayload(event.body, true).id);
  if (!id) return jsonResponse(400, { success: false, error: "Lead id ontbreekt." });
  await assertCanMutateLead({ supabaseUrl, serviceRoleKey, admin, id });
  await supabaseFetch(`${supabaseUrl}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      ...restHeaders(serviceRoleKey),
      Prefer: "return=minimal",
    },
  });
  return jsonResponse(200, { success: true, deleted: true, id });
}

async function assertCanMutateLead({ supabaseUrl, serviceRoleKey, admin, id }) {
  const params = new URLSearchParams({
    select: "id,owner_id,created_by,assigned_to,metadata",
    id: `eq.${id}`,
    limit: "1",
  });
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/leads?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const lead = rows[0];
  if (!lead) {
    const error = new Error("Lead niet gevonden.");
    error.status = 404;
    throw error;
  }
  if (!managerRoles.has(normalizeRole(admin.role)) && ![lead.owner_id, lead.created_by, lead.assigned_to].map(cleanText).includes(admin.id)) {
    const error = new Error("Je mag deze lead niet wijzigen.");
    error.status = 403;
    throw error;
  }
  return lead;
}

function leadPayload(payload = {}, admin = {}, options = {}) {
  const now = new Date().toISOString();
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status") || Object.prototype.hasOwnProperty.call(payload, "callStatus");
  const status = cleanText(hasStatus ? (payload.status || payload.callStatus) : "nieuw").toLowerCase();
  if (status && !allowedStatuses.has(status)) {
    const error = new Error("Ongeldige leadstatus.");
    error.status = 400;
    throw error;
  }
  const record = {
    company_name: cleanText(payload.companyName || payload.company_name || payload.company || payload.businessName),
    contact_name: cleanText(payload.contactName || payload.contact_name || payload.name || payload.contact),
    email: cleanText(payload.email).toLowerCase(),
    phone: cleanText(payload.phone),
    website: cleanText(payload.websiteUrl || payload.website),
    status: status || "nieuw",
    notes: cleanText(payload.notes || payload.message),
    assigned_to: cleanText(payload.assignedTo || payload.assigned_to || payload.ownerAuthUserId || payload.owner_id || admin.id) || admin.id,
    metadata: {
      ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
      source: cleanText(payload.source || "admin-dashboard-leadfinder"),
      region: cleanText(payload.region),
      industry: cleanText(payload.industry),
      websiteStatus: cleanText(payload.websiteStatus),
      leadScore: Number(payload.leadScore || payload.score || 60),
      followUpDate: cleanText(payload.followUpDate),
      googlePlaceId: cleanText(payload.googlePlaceId),
      googleMapsUrl: cleanText(payload.googleMapsUrl),
      websiteAnalysis: payload.websiteAnalysis && typeof payload.websiteAnalysis === "object" ? payload.websiteAnalysis : undefined,
      updatedBy: admin.id,
      updatedByEmail: admin.email,
    },
    is_demo: false,
    environment: "production",
    updated_at: now,
  };
  if (options.create) {
    record.owner_id = cleanText(payload.ownerAuthUserId || payload.owner_id || admin.id) || admin.id;
    record.created_by = cleanText(payload.createdBy || payload.created_by || admin.id) || admin.id;
    record.created_at = now;
    record.metadata.createdByEmail = cleanText(payload.createdByEmail || admin.email);
    record.metadata.createdByName = cleanText(payload.createdByName || admin.email);
  }
  if (options.update) {
    const hasAssignment = ["assignedTo", "assigned_to", "ownerAuthUserId", "owner_id"].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
    const hasSource = Object.prototype.hasOwnProperty.call(payload, "source");
    Object.keys(record).forEach((key) => {
      if (record[key] === "" && !["email", "phone", "website", "notes"].includes(key)) delete record[key];
    });
    if (!hasStatus) delete record.status;
    if (!hasAssignment) delete record.assigned_to;
    if (!hasSource) delete record.metadata.source;
    Object.keys(record.metadata || {}).forEach((key) => {
      if (record.metadata[key] === "" || record.metadata[key] === undefined || Number.isNaN(record.metadata[key])) delete record.metadata[key];
    });
  }
  if (options.create && !record.company_name && !record.contact_name && !record.email) {
    const error = new Error("Vul minimaal een bedrijfsnaam, contactpersoon of e-mailadres in.");
    error.status = 400;
    throw error;
  }
  return record;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error("Supabase gaf geen geldige JSON-response terug.");
      error.status = response.status || 500;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function mapLead(row = {}) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: cleanText(row.id),
    companyName: cleanText(row.company_name),
    contactName: cleanText(row.contact_name),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    websiteUrl: cleanText(row.website),
    callStatus: normalizeLeadStatus(row.status),
    status: normalizeLeadStatus(row.status),
    source: cleanText(meta.source || "supabase-production"),
    notes: cleanText(row.notes),
    ownerAuthUserId: cleanText(row.owner_id),
    assignedUserName: cleanText(meta.assignedUserName),
    assignedUserEmail: cleanText(meta.assignedUserEmail),
    salesPartnerEmail: cleanText(meta.salesPartnerEmail || meta.createdByEmail),
    salesPartnerName: cleanText(meta.salesPartnerName || meta.createdByName),
    createdBy: cleanText(row.created_by),
    createdByEmail: cleanText(meta.createdByEmail),
    createdByName: cleanText(meta.createdByName),
    assignedTo: cleanText(row.assigned_to),
    industry: cleanText(meta.industry),
    region: cleanText(meta.region),
    websiteStatus: cleanText(meta.websiteStatus || "onbekend"),
    leadScore: Number(meta.leadScore || 60),
    followUpDate: cleanText(meta.followUpDate),
    googlePlaceId: cleanText(meta.googlePlaceId),
    googleMapsUrl: cleanText(meta.googleMapsUrl),
    isDemo: Boolean(row.is_demo),
    environment: cleanText(row.environment || "production"),
    metadata: meta,
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
    _supabaseId: cleanText(row.id),
  };
}

function normalizeLeadStatus(value) {
  const status = cleanText(value).toLowerCase();
  if (status === "new") return "nieuw";
  return status || "nieuw";
}

function parsePayload(body, silent = false) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    if (silent) return {};
    const error = new Error("Ongeldige JSON body.");
    error.status = 400;
    throw error;
  }
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
}

function isMissingTableError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.status === 404
    || text.includes("42p01")
    || text.includes("pgrst205")
    || text.includes("schema cache")
    || text.includes("could not find the table")
    || text.includes("public.leads");
}

function normalizeRole(role) {
  return cleanText(role).toLowerCase();
}

function cleanText(value) {
  return String(value || "").trim();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
