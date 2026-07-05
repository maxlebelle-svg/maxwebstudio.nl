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
  const rows = await readLeadRows({ supabaseUrl, serviceRoleKey });
  const mappedRows = rows.map(mapLead).filter((lead) => !isDemoLead(lead));
  const records = mappedRows.filter((lead) => isLeadVisibleForAdmin(lead, admin));
  const diagnostics = buildLeadReadDiagnostics({ rows: mappedRows, records, admin });
  if (managerRoles.has(normalizeRole(admin.role))) {
    console.info("Admin leads read: manager received all visible production leads", diagnostics);
  }
  return jsonResponse(200, {
    success: true,
    mode: "supabase-production",
    records,
    counts: { supabase: records.length, hybrid: records.length, local: 0, beforeRoleFilter: mappedRows.length, afterRoleFilter: records.length },
    diagnostics,
    refreshedAt: new Date().toISOString(),
  });
}

function isDemoLead(lead = {}) {
  const source = cleanText(lead.source || lead._source).toLowerCase();
  const environment = cleanText(lead.environment || lead.metadata?.environment).toLowerCase();
  const id = cleanText(lead.id).toLowerCase();
  const email = cleanText(lead.email).toLowerCase();
  const website = cleanText(lead.websiteUrl).toLowerCase();
  return Boolean(lead.isDemo || lead.is_demo || lead.metadata?.isDemo)
    || environment === "demo"
    || source.includes("demo")
    || id.includes("demo")
    || email.endsWith(".example")
    || website.includes(".example");
}

async function createLead({ event, supabaseUrl, serviceRoleKey, admin }) {
  const payload = parsePayload(event.body);
  const attempts = [
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: leadPayload(payload, admin, { create: true }) }),
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: legacyLeadPayload(payload, admin, { create: true, extended: true }) }),
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: legacyLeadPayload(payload, admin, { create: true, extended: false }) }),
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: legacyLeadPayload(payload, admin, { create: true, extended: false, ownerColumn: false }) }),
  ];
  const rows = await trySchemaAttempts(attempts);
  const lead = mapLead(rows[0] || {});
  return jsonResponse(200, {
    success: true,
    lead,
    created: true,
    diagnostics: {
      module: "leads",
      resolvedRole: admin.role,
      status: admin.status,
      reason: "lead_inserted",
      leadId: lead.id,
    },
  });
}

async function updateLead({ event, supabaseUrl, serviceRoleKey, admin }) {
  const payload = parsePayload(event.body);
  const id = cleanText(payload.id || event.queryStringParameters?.id);
  if (!id) return jsonResponse(400, { success: false, error: "Lead id ontbreekt." });
  const existingLead = await assertCanMutateLead({ supabaseUrl, serviceRoleKey, admin, id });
  const modernRecord = leadPayload(payload, admin, { update: true });
  if (modernRecord.metadata) {
    modernRecord.metadata = {
      ...(existingLead.metadata && typeof existingLead.metadata === "object" ? existingLead.metadata : {}),
      ...modernRecord.metadata,
    };
  }
  const attempts = [
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record: modernRecord }),
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record: legacyLeadPayload(payload, admin, { update: true, extended: true, existingLead }) }),
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record: legacyLeadPayload(payload, admin, { update: true, extended: false, existingLead }) }),
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record: legacyLeadPayload(payload, admin, { update: true, extended: false, ownerColumn: false, existingLead }) }),
  ];
  const rows = await trySchemaAttempts(attempts);
  return jsonResponse(200, { success: true, lead: mapLead(rows[0] || { id, ...modernRecord }), updated: true });
}

async function insertLeadRecord({ supabaseUrl, serviceRoleKey, record }) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/leads`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      Prefer: "return=representation",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });
}

async function updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record }) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      Prefer: "return=representation",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });
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
  const rows = await readLeadRows({ supabaseUrl, serviceRoleKey, id });
  const lead = rows[0];
  if (!lead) {
    const error = new Error("Lead niet gevonden.");
    error.status = 404;
    throw error;
  }
  const normalizedLead = mapLead(lead);
  if (!managerRoles.has(normalizeRole(admin.role)) && !leadOwnerTokens(normalizedLead).includes(admin.id)) {
    const error = new Error("Je mag deze lead niet wijzigen.");
    error.status = 403;
    throw error;
  }
  return lead;
}

async function readLeadRows({ supabaseUrl, serviceRoleKey, id = "" }) {
  const selects = [
    "id,company_name,contact_name,email,phone,website,status,owner_id,owner_profile_id,owner_email,owner_name,created_by,created_by_email,created_by_name,assigned_to,assigned_user_email,assigned_user_name,sales_partner_email,sales_partner_name,notes,is_demo,environment,metadata,created_at,updated_at",
    "id,company_name,contact_name,email,phone,website,status,owner_id,created_by,assigned_to,notes,is_demo,environment,metadata,created_at,updated_at",
    "id,company,name,email,phone,source,interest,status,converted_customer_id,message,is_demo,environment,metadata,created_at,updated_at,owner_auth_user_id,branch,region,website_url,website_status,lead_score,call_status,follow_up_date,notes",
    "id,company,name,email,phone,source,interest,status,converted_customer_id,message,is_demo,environment,metadata,created_at,updated_at,owner_auth_user_id",
    "id,company,name,email,phone,source,interest,status,converted_customer_id,message,is_demo,environment,metadata,created_at,updated_at",
  ];
  const attempts = selects.map((select) => () => {
    const params = new URLSearchParams({
      select,
      order: "updated_at.desc.nullslast",
      limit: id ? "1" : "500",
    });
    if (id) params.set("id", `eq.${id}`);
    return supabaseFetch(`${supabaseUrl}/rest/v1/leads?${params.toString()}`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
  });
  return trySchemaAttempts(attempts);
}

async function trySchemaAttempts(attempts = []) {
  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (!isMissingColumnError(error) && !isStatusConstraintError(error)) throw error;
    }
  }
  throw lastError || new Error("Lead schema kon niet worden bepaald.");
}

function leadPayload(payload = {}, admin = {}, options = {}) {
  const now = new Date().toISOString();
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status") || Object.prototype.hasOwnProperty.call(payload, "callStatus");
  const hasSource = Object.prototype.hasOwnProperty.call(payload, "source");
  const hasWebsiteStatus = Object.prototype.hasOwnProperty.call(payload, "websiteStatus") || Object.prototype.hasOwnProperty.call(payload, "website_status");
  const hasLeadScore = Object.prototype.hasOwnProperty.call(payload, "leadScore") || Object.prototype.hasOwnProperty.call(payload, "score") || Object.prototype.hasOwnProperty.call(payload, "lead_score");
  const hasFollowUpDate = Object.prototype.hasOwnProperty.call(payload, "followUpDate") || Object.prototype.hasOwnProperty.call(payload, "follow_up_date");
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
      ownerAuthUserId: cleanText(payload.ownerAuthUserId || payload.owner_id || admin.id) || admin.id,
      ownerProfileId: cleanText(payload.ownerProfileId || payload.owner_profile_id),
      ownerEmail: cleanText(payload.ownerEmail || payload.owner_email || payload.createdByEmail || admin.email).toLowerCase(),
      ownerName: cleanText(payload.ownerName || payload.owner_name || payload.createdByName || admin.email),
      assignedUserEmail: cleanText(payload.assignedUserEmail || payload.assigned_user_email || payload.ownerEmail || admin.email).toLowerCase(),
      assignedUserName: cleanText(payload.assignedUserName || payload.assigned_user_name || payload.ownerName || admin.email),
      salesPartnerEmail: cleanText(payload.salesPartnerEmail || payload.sales_partner_email),
      salesPartnerName: cleanText(payload.salesPartnerName || payload.sales_partner_name),
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
    Object.keys(record).forEach((key) => {
      if (record[key] === "" && !["email", "phone", "website", "notes"].includes(key)) delete record[key];
    });
    if (!hasStatus) delete record.status;
    if (!hasAssignment) delete record.assigned_to;
    if (!hasSource) delete record.metadata.source;
    if (!hasWebsiteStatus) delete record.metadata.websiteStatus;
    if (!hasLeadScore) delete record.metadata.leadScore;
    if (!hasFollowUpDate) delete record.metadata.followUpDate;
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

function legacyLeadPayload(payload = {}, admin = {}, options = {}) {
  const now = new Date().toISOString();
  const existingMeta = options.existingLead?.metadata && typeof options.existingLead.metadata === "object" ? options.existingLead.metadata : {};
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status") || Object.prototype.hasOwnProperty.call(payload, "callStatus");
  const hasSource = Object.prototype.hasOwnProperty.call(payload, "source");
  const hasWebsiteStatus = Object.prototype.hasOwnProperty.call(payload, "websiteStatus") || Object.prototype.hasOwnProperty.call(payload, "website_status");
  const hasLeadScore = Object.prototype.hasOwnProperty.call(payload, "leadScore") || Object.prototype.hasOwnProperty.call(payload, "score") || Object.prototype.hasOwnProperty.call(payload, "lead_score");
  const hasFollowUpDate = Object.prototype.hasOwnProperty.call(payload, "followUpDate") || Object.prototype.hasOwnProperty.call(payload, "follow_up_date");
  const meta = {
    ...existingMeta,
    ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
    ownerAuthUserId: cleanText(payload.ownerAuthUserId || payload.owner_id || options.existingLead?.ownerAuthUserId || existingMeta.ownerAuthUserId || admin.id) || admin.id,
    ownerProfileId: cleanText(payload.ownerProfileId || payload.owner_profile_id || options.existingLead?.ownerProfileId || existingMeta.ownerProfileId),
    ownerEmail: cleanText(payload.ownerEmail || payload.owner_email || options.existingLead?.ownerEmail || existingMeta.ownerEmail || payload.createdByEmail || admin.email).toLowerCase(),
    ownerName: cleanText(payload.ownerName || payload.owner_name || options.existingLead?.ownerName || existingMeta.ownerName || payload.createdByName || admin.email),
    createdBy: cleanText(payload.createdBy || payload.created_by || options.existingLead?.createdBy || existingMeta.createdBy || admin.id) || admin.id,
    createdByEmail: cleanText(payload.createdByEmail || options.existingLead?.createdByEmail || existingMeta.createdByEmail || admin.email),
    createdByName: cleanText(payload.createdByName || options.existingLead?.createdByName || existingMeta.createdByName || admin.email),
    assignedTo: cleanText(payload.assignedTo || payload.assigned_to || payload.ownerAuthUserId || options.existingLead?.assignedTo || existingMeta.assignedTo || admin.id) || admin.id,
    assignedUserEmail: cleanText(payload.assignedUserEmail || payload.assigned_user_email || options.existingLead?.assignedUserEmail || existingMeta.assignedUserEmail || payload.ownerEmail || admin.email).toLowerCase(),
    assignedUserName: cleanText(payload.assignedUserName || payload.assigned_user_name || options.existingLead?.assignedUserName || existingMeta.assignedUserName || payload.ownerName || admin.email),
    source: cleanText(payload.source || "admin-dashboard-leadfinder"),
    websiteStatus: cleanText(payload.websiteStatus),
    leadScore: Number(payload.leadScore || payload.score || 60),
    googlePlaceId: cleanText(payload.googlePlaceId),
    googleMapsUrl: cleanText(payload.googleMapsUrl),
    updatedBy: admin.id,
    updatedByEmail: admin.email,
  };
  if (payload.websiteAnalysis && typeof payload.websiteAnalysis === "object") meta.websiteAnalysis = payload.websiteAnalysis;

  const record = {
    company: cleanText(payload.companyName || payload.company_name || payload.company || payload.businessName),
    name: cleanText(payload.contactName || payload.contact_name || payload.name || payload.contact),
    email: cleanText(payload.email).toLowerCase(),
    phone: cleanText(payload.phone),
    source: cleanText(payload.source || "admin-dashboard-leadfinder"),
    interest: cleanText(payload.interest || payload.websiteUrl || payload.website),
    status: legacyDbStatus(payload.status || payload.callStatus || "nieuw"),
    message: cleanText(payload.notes || payload.message),
    metadata: meta,
    is_demo: false,
    environment: "production",
    updated_at: now,
  };
  if (options.ownerColumn !== false) {
    record.owner_auth_user_id = cleanText(payload.ownerAuthUserId || payload.owner_id || admin.id) || admin.id;
  }
  if (options.extended) {
    record.branch = cleanText(payload.industry || payload.branch);
    record.region = cleanText(payload.region);
    record.website_url = cleanText(payload.websiteUrl || payload.website);
    record.website_status = cleanText(payload.websiteStatus || "unknown");
    record.lead_score = Number(payload.leadScore || payload.score || 60);
    record.call_status = normalizeLeadStatus(payload.callStatus || payload.status || "nieuw");
    record.follow_up_date = cleanText(payload.followUpDate);
    record.notes = cleanText(payload.notes || payload.message);
  }
  if (options.create) record.created_at = now;
  if (options.update) {
    const allowedEmpty = new Set(["email", "phone", "interest", "message", "notes", "website_url"]);
    Object.keys(record).forEach((key) => {
      if (record[key] === "" && !allowedEmpty.has(key)) delete record[key];
    });
    if (!hasStatus) {
      delete record.status;
      delete record.call_status;
    }
    if (!hasSource) {
      delete record.source;
      delete record.metadata.source;
    }
    if (!hasWebsiteStatus) {
      delete record.website_status;
      delete record.metadata.websiteStatus;
    }
    if (!hasLeadScore) {
      delete record.lead_score;
      delete record.metadata.leadScore;
    }
    if (!hasFollowUpDate) {
      delete record.follow_up_date;
      delete record.metadata.followUpDate;
    }
    Object.keys(record.metadata || {}).forEach((key) => {
      if (record.metadata[key] === "" || record.metadata[key] === undefined || Number.isNaN(record.metadata[key])) delete record.metadata[key];
    });
  }
  if (options.create && !record.company && !record.name && !record.email) {
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
    companyName: cleanText(row.company_name || row.company),
    contactName: cleanText(row.contact_name || row.name),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    websiteUrl: cleanText(row.website || row.website_url || row.interest || meta.websiteUrl || meta.website),
    callStatus: normalizeLeadStatus(row.call_status || row.status),
    status: normalizeLeadStatus(row.call_status || row.status),
    source: cleanText(row.source || meta.source || "supabase-production"),
    notes: cleanText(row.notes || row.message),
    ownerAuthUserId: cleanText(row.owner_id || row.owner_auth_user_id || meta.ownerAuthUserId || meta.owner_auth_user_id),
    ownerProfileId: cleanText(row.owner_profile_id || meta.ownerProfileId || meta.owner_profile_id),
    ownerEmail: cleanText(row.owner_email || meta.ownerEmail || meta.owner_email),
    ownerName: cleanText(row.owner_name || meta.ownerName || meta.owner_name),
    assignedUserName: cleanText(row.assigned_user_name || meta.assignedUserName || meta.assigned_user_name),
    assignedUserEmail: cleanText(row.assigned_user_email || meta.assignedUserEmail || meta.assigned_user_email),
    salesPartnerEmail: cleanText(row.sales_partner_email || meta.salesPartnerEmail || meta.sales_partner_email || meta.createdByEmail),
    salesPartnerName: cleanText(row.sales_partner_name || meta.salesPartnerName || meta.sales_partner_name || meta.createdByName),
    createdBy: cleanText(row.created_by || meta.createdBy || row.owner_auth_user_id),
    createdByEmail: cleanText(row.created_by_email || meta.createdByEmail || meta.created_by_email),
    createdByName: cleanText(row.created_by_name || meta.createdByName || meta.created_by_name),
    assignedTo: cleanText(row.assigned_to || meta.assignedTo || meta.assigned_to),
    industry: cleanText(row.branch || meta.industry),
    region: cleanText(row.region || meta.region),
    websiteStatus: cleanText(row.website_status || meta.websiteStatus || "onbekend"),
    leadScore: Number(row.lead_score || meta.leadScore || 60),
    followUpDate: cleanText(row.follow_up_date || meta.followUpDate),
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
  if (status === "follow_up") return "opvolgen";
  if (status === "converted") return "geconverteerd";
  if (status === "qualified") return "interesse";
  return status || "nieuw";
}

function legacyDbStatus(value) {
  const status = normalizeLeadStatus(value);
  if (status === "nieuw") return "new";
  if (["opvolgen", "contact_planned", "voicemail"].includes(status)) return "follow_up";
  if (["gebeld", "contacted"].includes(status)) return "contacted";
  if (["interesse", "qualified", "quote_ready", "quote_sent"].includes(status)) return "qualified";
  if (["won", "customer_active", "geconverteerd"].includes(status)) return "converted";
  if (["lost", "geen_interesse"].includes(status)) return "lost";
  if (status === "archived" || status === "gearchiveerd") return "archived";
  return "new";
}

function leadOwnerTokens(lead = {}) {
  return [
    lead.ownerAuthUserId,
    lead.ownerEmail,
    lead.createdBy,
    lead.createdByEmail,
    lead.assignedTo,
    lead.assignedUserEmail,
    lead.salesPartnerEmail,
    lead.metadata?.ownerAuthUserId,
    lead.metadata?.ownerEmail,
    lead.metadata?.createdBy,
    lead.metadata?.createdByEmail,
    lead.metadata?.assignedTo,
    lead.metadata?.assignedUserEmail,
    lead.metadata?.salesPartnerEmail,
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
}

function isLeadVisibleForAdmin(lead = {}, admin = {}) {
  if (managerRoles.has(normalizeRole(admin.role))) return true;
  if (normalizeRole(admin.role) !== "sales_partner") return false;
  const adminTokens = [admin.id, admin.profileId, admin.email].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
  return leadOwnerTokens(lead).some((token) => adminTokens.includes(token));
}

function buildLeadReadDiagnostics({ rows = [], records = [], admin = {} }) {
  const owners = new Set();
  rows.forEach((lead) => {
    leadOwnerTokens(lead).forEach((token) => {
      if (token.includes("@")) owners.add(token.toLowerCase());
    });
  });
  return {
    module: "leads",
    dataSource: "Supabase",
    currentUserEmail: cleanText(admin.email).toLowerCase(),
    currentUserId: cleanText(admin.id),
    resolvedRole: normalizeRole(admin.role),
    managerAccess: managerRoles.has(normalizeRole(admin.role)),
    totalLeadsFetched: rows.length,
    totalLeadsAfterRoleFilter: records.length,
    uniqueLeadOwnerEmails: [...owners].sort(),
  };
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

function isMissingColumnError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.status === 400
    && (text.includes("42703")
      || text.includes("pgrst204")
      || text.includes("column")
      || text.includes("could not find"));
}

function isStatusConstraintError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return text.includes("23514") || text.includes("leads_status_check") || text.includes("violates check constraint");
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
