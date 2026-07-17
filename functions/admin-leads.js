const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const {
  mergeMissingLeadValues,
  normalizedLeadIdentifiers,
  normalizeCompanyName,
  normalizeDomain,
  normalizePhone,
} = require("./services/leadDeduplicationService");

const staffRoles = ["super_admin", "admin", "sales_manager", "sales_partner"];
const managerRoles = new Set(["super_admin", "admin", "sales_manager"]);
const acquisitionChannels = new Set(["website", "email", "outbound_sales", "referral", "phone", "social", "partner", "manual", "import", "other"]);
const pipelineStages = new Set(["new", "contacted", "interested", "demo_planned", "demo_in_progress", "demo_sent", "awaiting_feedback", "approved", "awaiting_payment", "customer", "closed"]);
const callDispositions = new Set(["not_called", "called", "no_answer", "voicemail", "callback", "invalid_number", "busy"]);
const callOutcomeByDisposition = new Map([
  ["not_called", ""], ["called", "contacted"], ["no_answer", "no_answer"],
  ["voicemail", "voicemail_left"], ["callback", "callback_requested"],
  ["invalid_number", "wrong_number"], ["busy", "busy"],
]);
const callDispositionByOutcome = new Map([
  ["contacted", "called"], ["interested", "called"], ["no_answer", "no_answer"],
  ["voicemail_left", "voicemail"], ["callback_requested", "callback"],
  ["wrong_number", "invalid_number"], ["busy", "busy"],
]);
const interestLevels = new Set(["hot", "interested", "unsure", "not_interested"]);
const leadPriorities = new Set(["high", "normal", "low"]);
const allowedStatuses = new Set([
  "lead",
  "bellen",
  "offerte",
  "verkocht",
  "klant_actief",
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
  "archived",
  "gearchiveerd",
  "geconverteerd",
  "reviewing",
  "interesting",
  "not_interesting",
  "assigned",
  "call_scheduled",
  "contact_attempted",
  "contacted",
  "follow_up",
  "appointment_scheduled",
  "demo_requested",
  "demo_building",
  "demo_ready",
  "demo_sent",
  "proposal_sent",
  "negotiation",
  "customer",
]);

const lifecycleStatuses = new Set([
  "new",
  "reviewing",
  "interesting",
  "not_interesting",
  "assigned",
  "call_scheduled",
  "contact_attempted",
  "contacted",
  "follow_up",
  "appointment_scheduled",
  "demo_requested",
  "demo_building",
  "demo_ready",
  "demo_sent",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
  "customer",
]);

const terminalLeadStatuses = new Set(["won", "lost", "not_interesting", "customer"]);
const nextActionTypes = new Set(["call", "email", "send_demo", "create_demo", "send_proposal", "follow_up", "appointment", "await_response", "custom"]);
const callOutcomes = new Map([
  ["interested", { label: "Geïnteresseerd", status: "interesting", nextActionType: "follow_up", defaultBusinessDays: 2 }],
  ["no_answer", { label: "Geen gehoor", status: "contact_attempted", nextActionType: "call", defaultBusinessDays: 2 }],
  ["voicemail_left", { label: "Voicemail ingesproken", status: "follow_up", nextActionType: "call", defaultBusinessDays: 2 }],
  ["wrong_number", { label: "Verkeerd nummer", status: "contact_attempted", nextActionType: "custom" }],
  ["callback_requested", { label: "Terugbellen gevraagd", status: "follow_up", nextActionType: "call" }],
  ["contacted", { label: "Contact gehad", status: "contacted", nextActionType: "follow_up", defaultBusinessDays: 3 }],
  ["appointment_scheduled", { label: "Afspraak gemaakt", status: "appointment_scheduled", nextActionType: "appointment" }],
  ["demo_requested", { label: "Demo gewenst", status: "demo_requested", nextActionType: "create_demo" }],
  ["proposal_requested", { label: "Voorstel gewenst", status: "proposal_sent", nextActionType: "send_proposal" }],
  ["not_interested", { label: "Niet geïnteresseerd", status: "lost", nextActionType: "custom" }],
  ["no_budget", { label: "Geen budget", status: "lost", nextActionType: "custom" }],
  ["later", { label: "Later opnieuw benaderen", status: "follow_up", nextActionType: "follow_up", defaultBusinessDays: 5 }],
  ["already_helped", { label: "Al voorzien", status: "lost", nextActionType: "custom" }],
  ["business_closed", { label: "Bedrijf gesloten", status: "lost", nextActionType: "custom" }],
]);

const rejectionReasons = new Set([
  "website_already_good",
  "no_suitable_contact_details",
  "business_inactive",
  "too_small_no_commercial_chance",
  "wrong_business_type",
  "outside_target_group",
  "outside_region",
  "already_customer",
  "competitor",
  "duplicate_lead",
  "no_interest",
  "no_budget",
  "other",
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
  const admin = adminCheck.admin || {};

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Production leads API is nog niet geconfigureerd." });
  }

  try {
    if (event.httpMethod === "GET") return readLeads({ supabaseUrl, serviceRoleKey, admin });
    if (event.httpMethod === "POST") return createLead({ event, supabaseUrl, serviceRoleKey, admin });
    if (event.httpMethod === "PATCH") return updateLead({ event, supabaseUrl, serviceRoleKey, admin });
    if (event.httpMethod === "DELETE") return deleteLead({ event, supabaseUrl, serviceRoleKey, admin });
    return jsonResponse(405, { success: false, error: "Methode niet toegestaan voor leads." });
  } catch (error) {
    const missing = isMissingTableError(error);
    console.error("Admin leads API failed", {
      method: event.httpMethod,
      role: admin.role || "",
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
        resolvedRole: admin.role || "",
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
  let payload = parsePayload(event.body);
  if (leadAssignmentInput(payload)) {
    const assignment = await validateLeadAssignee({
      assignment: resolveLeadAssignment(payload, admin, { create: true }),
      admin,
      supabaseUrl,
      serviceRoleKey,
    });
    payload = {
      ...payload,
      ownerAuthUserId: assignment.userId,
      ownerEmail: assignment.email,
      ownerName: assignment.name,
      assignedTo: assignment.id,
      assignedUserId: assignment.userId,
      assignedUserEmail: assignment.email,
      assignedUserName: assignment.name,
    };
  }
  const preparedRecord = leadPayload(payload, admin, { create: true });
  const existingLead = await findExistingLead({ supabaseUrl, serviceRoleKey, payload, record: preparedRecord });
  if (existingLead?.id) {
    const patch = mergeMissingLeadValues(existingLead, {
      ...preparedRecord,
      metadata: {
        ...(existingLead.metadata && typeof existingLead.metadata === "object" ? existingLead.metadata : {}),
        ...(preparedRecord.metadata && typeof preparedRecord.metadata === "object" ? preparedRecord.metadata : {}),
        duplicateFoundAt: new Date().toISOString(),
        duplicateSource: cleanText(payload.source || preparedRecord.metadata?.source || "admin-dashboard-leadfinder"),
      },
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const rows = await trySchemaAttempts([
      () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id: existingLead.id, record: patch }),
      () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id: existingLead.id, record: { metadata: patch.metadata, updated_at: patch.updated_at } }),
    ]);
    const lead = mapLead(rows[0] || existingLead);
    await insertLeadTimelineEvent({ supabaseUrl, serviceRoleKey, leadId: lead.id, admin, eventType: "lead_found_again", title: "Lead opnieuw gevonden in zoekopdracht", metadata: { duplicate: true } });
    return jsonResponse(200, {
      success: true,
      lead,
      created: false,
      duplicate: true,
      leadId: lead.id,
      status: lead.leadStatus,
      assignedTo: lead.assignedUserName || lead.assignedUserEmail || lead.assignedTo,
      lastActivityAt: lead.lastActivityAt || lead.updatedAt,
      diagnostics: {
        module: "leads",
        resolvedRole: admin.role,
        reason: "lead_duplicate_returned",
        leadId: lead.id,
      },
    });
  }
  const attempts = [
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: preparedRecord }),
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: minimalModernLeadPayload(preparedRecord) }),
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: legacyLeadPayload(payload, admin, { create: true, extended: true }) }),
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: legacyLeadPayload(payload, admin, { create: true, extended: true, ownerColumn: false, interestColumn: false, messageColumn: false, lifecycleColumns: true }) }),
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: legacyLeadPayload(payload, admin, { create: true, extended: false }) }),
    () => insertLeadRecord({ supabaseUrl, serviceRoleKey, record: legacyLeadPayload(payload, admin, { create: true, extended: false, ownerColumn: false }) }),
  ];
  const rows = await trySchemaAttempts(attempts);
  const lead = mapLead(rows[0] || {});
  await insertLeadTimelineEvent({ supabaseUrl, serviceRoleKey, leadId: lead.id, admin, eventType: "lead_found", title: "Lead gevonden", metadata: { source: lead.source } });
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

function minimalModernLeadPayload(record = {}) {
  const allowedColumns = [
    "company_name",
    "contact_name",
    "email",
    "phone",
    "website",
    "status",
    "notes",
    "metadata",
    "is_demo",
    "environment",
    "created_at",
    "updated_at",
  ];
  return Object.fromEntries(
    allowedColumns
      .filter((column) => Object.prototype.hasOwnProperty.call(record, column))
      .map((column) => [column, record[column]])
  );
}

async function updateLead({ event, supabaseUrl, serviceRoleKey, admin }) {
  const payload = parsePayload(event.body);
  if (payload.action === "bulk_update") return bulkUpdateLeads({ payload, supabaseUrl, serviceRoleKey, admin });
  const id = cleanText(payload.id || event.queryStringParameters?.id);
  if (!id) return jsonResponse(400, { success: false, error: "Lead id ontbreekt." });
  const existingLead = await assertCanMutateLead({ supabaseUrl, serviceRoleKey, admin, id });
  if (payload.action === "review" || payload.decision) {
    return reviewLead({ payload, existingLead, supabaseUrl, serviceRoleKey, admin, id });
  }
  if (payload.action === "assign") {
    return assignLead({ payload, existingLead, supabaseUrl, serviceRoleKey, admin, id });
  }
  if (["call_started", "contact", "next_action", "complete_next_action", "win", "lose", "demo_requested", "appointment_scheduled"].includes(payload.action)) {
    return mutateSalesPipeline({ payload, existingLead, supabaseUrl, serviceRoleKey, admin, id });
  }
  if (leadAssignmentInput(payload)) {
    return jsonResponse(400, { success: false, error: "Gebruik de expliciete toewijzingsactie om de eigenaar te wijzigen." });
  }
  const modernRecord = leadPayload(payload, admin, { update: true, existingLead });
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
  const lead = mapLead(rows[0] || { id, ...modernRecord });
  await insertLeadTimelineEvent({ supabaseUrl, serviceRoleKey, leadId: lead.id, admin, eventType: "lead_updated", title: "Lead bijgewerkt", metadata: { status: lead.leadStatus } });
  return jsonResponse(200, { success: true, lead, updated: true });
}

async function bulkUpdateLeads({ payload = {}, supabaseUrl, serviceRoleKey, admin }) {
  const ids = [...new Set((Array.isArray(payload.ids) ? payload.ids : []).map(cleanText).filter(Boolean))].slice(0, 100);
  const operation = cleanText(payload.operation);
  const value = cleanText(payload.value);
  if (!ids.length) return jsonResponse(400, { success: false, error: "Selecteer minimaal één lead." });
  if (!["owner", "call_disposition", "interest_level", "priority", "archive"].includes(operation)) {
    return jsonResponse(400, { success: false, error: "Kies een geldige bulkactie." });
  }
  if (operation === "owner" && !managerRoles.has(normalizeRole(admin.role))) {
    return jsonResponse(403, { success: false, error: "Alleen een salesmanager of beheerder mag eigenaren in bulk wijzigen." });
  }
  const results = [];
  for (const id of ids) {
    try {
      const existingLead = await assertCanMutateLead({ supabaseUrl, serviceRoleKey, admin, id });
      if (operation === "owner") {
        const response = await assignLead({ payload: { assignedTo: value, assignedUserId: value, assignedUserEmail: payload.ownerEmail, assignedUserName: payload.ownerName }, existingLead, supabaseUrl, serviceRoleKey, admin, id });
        const body = parsePayload(response.body, true);
        if (response.statusCode >= 400) throw Object.assign(new Error(body.error || "Toewijzing mislukt."), { status: response.statusCode });
      } else {
        const changes = operation === "archive"
          ? { pipelineStage: "closed", metadata: { archivedAt: new Date().toISOString() } }
          : ({ call_disposition: { callDisposition: value, lastCallOutcome: callOutcomeByDisposition.get(value) }, interest_level: { interestLevel: value }, priority: { priority: value } })[operation];
        const record = leadPayload(changes, admin, { update: true, existingLead });
        record.metadata = { ...(existingLead.metadata && typeof existingLead.metadata === "object" ? existingLead.metadata : {}), ...(record.metadata || {}) };
        if (operation === "archive") record.archived_at = record.metadata.archivedAt;
        await trySchemaAttempts([
          () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record }),
          () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record: { metadata: record.metadata, updated_at: record.updated_at } }),
        ]);
        await insertLeadTimelineEvent({ supabaseUrl, serviceRoleKey, leadId: id, admin, eventType: "lead_bulk_updated", title: "Lead via bulkactie bijgewerkt", metadata: { operation, value } });
      }
      results.push({ id, success: true });
    } catch (error) {
      results.push({ id, success: false, error: error.message || "Bijwerken mislukt." });
    }
  }
  return jsonResponse(results.some((result) => result.success) ? 200 : 409, {
    success: results.every((result) => result.success),
    partial: results.some((result) => result.success) && results.some((result) => !result.success),
    results,
    updated: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
  });
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
  if (normalizeRole(admin.role) !== "super_admin") {
    return jsonResponse(403, { success: false, error: "Alleen super admin mag leads definitief verwijderen. Archiveer de lead of zet hem op Niet interessant." });
  }
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
  const role = normalizeRole(admin.role);
  const adminTokens = [admin.id, admin.profileId, admin.email].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
  const ownerTokens = leadOwnerTokens(normalizedLead);
  const canClaimOpenLead = role === "sales_partner" && !ownerTokens.length && ["new", "interesting"].includes(normalizedLead.leadStatus);
  if (!managerRoles.has(role) && !canClaimOpenLead && !ownerTokens.some((token) => adminTokens.includes(token))) {
    const error = new Error("Je mag deze lead niet wijzigen.");
    error.status = 403;
    throw error;
  }
  return lead;
}

async function readLeadRows({ supabaseUrl, serviceRoleKey, id = "" }) {
  const params = new URLSearchParams({
    select: "*",
    order: "updated_at.desc.nullslast",
    limit: id ? "1" : "500",
  });
  if (id) params.set("id", `eq.${id}`);
  return supabaseFetch(`${supabaseUrl}/rest/v1/leads?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
}

async function findExistingLead({ supabaseUrl, serviceRoleKey, payload = {}, record = {} }) {
  const identifiers = normalizedLeadIdentifiers({
    ...payload,
    companyName: payload.companyName || record.company_name,
    websiteUrl: payload.websiteUrl || payload.website || record.website,
    phone: payload.phone || record.phone,
    email: payload.email || record.email,
    metadata: {
      ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
      ...(record.metadata && typeof record.metadata === "object" ? record.metadata : {}),
    },
  });
  const hardFilters = [
    identifiers.kvkNumber && `kvk_number=eq.${encodeURIComponent(identifiers.kvkNumber)}`,
    identifiers.externalSourceId && `external_source_id=eq.${encodeURIComponent(identifiers.externalSourceId)}`,
    identifiers.normalizedDomain && `normalized_domain=eq.${encodeURIComponent(identifiers.normalizedDomain)}`,
    identifiers.normalizedPhone && `normalized_phone=eq.${encodeURIComponent(identifiers.normalizedPhone)}`,
    identifiers.normalizedEmail && `email=eq.${encodeURIComponent(identifiers.normalizedEmail)}`,
  ].filter(Boolean);
  for (const filter of hardFilters) {
    const fallbackFilters = legacyDuplicateFilters(filter);
    const found = await trySchemaAttempts([
      () => readLeadRowsByQuery({ supabaseUrl, serviceRoleKey, query: `${filter}&limit=1` }),
      ...fallbackFilters.map((fallbackFilter) => () => readLeadRowsByQuery({ supabaseUrl, serviceRoleKey, query: `${fallbackFilter}&limit=1` })),
    ]).catch(() => []);
    if (found?.[0]) return found[0];
  }
  if (identifiers.normalizedCompanyName && (identifiers.normalizedPostalCode || identifiers.normalizedCity)) {
    const rows = await readLeadRows({ supabaseUrl, serviceRoleKey }).catch(() => []);
    return rows.find((row) => {
      const candidate = normalizedLeadIdentifiers(row);
      if (candidate.normalizedCompanyName !== identifiers.normalizedCompanyName) return false;
      return Boolean((identifiers.normalizedPostalCode && candidate.normalizedPostalCode === identifiers.normalizedPostalCode)
        || (identifiers.normalizedCity && candidate.normalizedCity === identifiers.normalizedCity));
    }) || null;
  }
  return null;
}

function legacyDuplicateFilters(filter = "") {
  if (filter.startsWith("normalized_domain=eq.")) {
    const value = filter.slice("normalized_domain=eq.".length);
    return [
      `website=ilike.*${encodeURIComponent(value)}*`,
      `website_url=ilike.*${encodeURIComponent(value)}*`,
      `interest=ilike.*${encodeURIComponent(value)}*`,
    ];
  }
  if (filter.startsWith("normalized_phone=eq.")) {
    const value = filter.slice("normalized_phone=eq.".length);
    return [
      `phone=ilike.*${encodeURIComponent(value.slice(-9))}*`,
    ];
  }
  if (filter.startsWith("external_source_id=eq.")) {
    const value = filter.slice("external_source_id=eq.".length);
    return [
      `metadata->>googlePlaceId=eq.${value}`,
      `metadata->>externalSourceId=eq.${value}`,
    ];
  }
  return [];
}

async function readLeadRowsByQuery({ supabaseUrl, serviceRoleKey, query }) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/leads?select=*&${query}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
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

function firstCleanText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function firstUuid(...values) {
  return values.map(cleanText).find((value) => isUuid(value)) || null;
}

function isUuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value));
}

function leadAssignmentInput(payload = {}) {
  const meta = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  return [
    "assignedTo",
    "assigned_to",
    "assignedToEmail",
    "assigned_to_email",
    "assignedUserEmail",
    "assigned_user_email",
    "assignedUserId",
    "assigned_user_id",
    "assignedUserName",
    "assigned_user_name",
    "assignedToName",
    "assigned_to_name",
    "medewerker",
    "medewerkerEmail",
    "medewerker_email",
    "employee",
    "employeeEmail",
    "employee_email",
    "salesPartnerEmail",
    "sales_partner_email",
    "salesPartnerName",
    "sales_partner_name",
    "userEmail",
    "user_email",
    "userName",
    "user_name",
    "ownerAuthUserId",
    "owner_id",
    "ownerEmail",
    "owner_email",
    "ownerName",
    "owner_name",
  ].some((key) => Object.prototype.hasOwnProperty.call(payload, key) || Object.prototype.hasOwnProperty.call(meta, key));
}

function resolveLeadAssignment(payload = {}, admin = {}, options = {}) {
  const meta = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const existing = options.existingLead || {};
  const existingMeta = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const createDefaultId = options.create ? firstCleanText(payload.ownerAuthUserId, payload.owner_id, admin.id) : "";
  const createDefaultEmail = options.create ? firstCleanText(payload.ownerEmail, payload.owner_email, admin.email) : "";
  const createDefaultName = options.create ? firstCleanText(payload.ownerName, payload.owner_name, admin.email) : "";
  const userId = firstCleanText(
    payload.assignedUserId,
    payload.assigned_user_id,
    meta.assignedUserId,
    meta.assigned_user_id,
    existing.assignedUserId,
    existingMeta.assignedUserId,
    existingMeta.assigned_user_id
  );
  const email = firstCleanText(
    payload.assignedUserEmail,
    payload.assigned_user_email,
    payload.assignedToEmail,
    payload.assigned_to_email,
    payload.medewerkerEmail,
    payload.medewerker_email,
    payload.employeeEmail,
    payload.employee_email,
    payload.salesPartnerEmail,
    payload.sales_partner_email,
    payload.userEmail,
    payload.user_email,
    meta.assignedUserEmail,
    meta.assigned_user_email,
    meta.assignedToEmail,
    meta.assigned_to_email,
    meta.medewerkerEmail,
    meta.medewerker_email,
    meta.employeeEmail,
    meta.employee_email,
    meta.salesPartnerEmail,
    meta.sales_partner_email,
    meta.userEmail,
    meta.user_email,
    existing.assignedUserEmail,
    existingMeta.assignedUserEmail,
    existingMeta.assigned_user_email,
    existingMeta.assignedToEmail,
    existingMeta.assigned_to_email,
    existingMeta.medewerkerEmail,
    existingMeta.medewerker_email,
    existingMeta.employeeEmail,
    existingMeta.employee_email,
    existingMeta.salesPartnerEmail,
    existingMeta.sales_partner_email,
    existingMeta.userEmail,
    existingMeta.user_email,
    existing.ownerEmail,
    createDefaultEmail
  ).toLowerCase();
  const name = firstCleanText(
    payload.assignedUserName,
    payload.assigned_user_name,
    payload.assignedToName,
    payload.assigned_to_name,
    payload.medewerker,
    payload.employee,
    payload.salesPartnerName,
    payload.sales_partner_name,
    payload.userName,
    payload.user_name,
    meta.assignedUserName,
    meta.assigned_user_name,
    meta.assignedToName,
    meta.assigned_to_name,
    meta.medewerker,
    meta.employee,
    meta.salesPartnerName,
    meta.sales_partner_name,
    meta.userName,
    meta.user_name,
    existing.assignedUserName,
    existingMeta.assignedUserName,
    existingMeta.assigned_user_name,
    existingMeta.assignedToName,
    existingMeta.assigned_to_name,
    existingMeta.medewerker,
    existingMeta.employee,
    existingMeta.salesPartnerName,
    existingMeta.sales_partner_name,
    existingMeta.userName,
    existingMeta.user_name,
    existing.ownerName,
    createDefaultName,
    email
  );
  const id = firstCleanText(
    payload.assignedTo,
    payload.assigned_to,
    userId,
    meta.assignedTo,
    meta.assigned_to,
    existing.assignedTo,
    existingMeta.assignedTo,
    existingMeta.assigned_to,
    createDefaultId
  );
  return { id, userId, email, name };
}

function leadPayload(payload = {}, admin = {}, options = {}) {
  const now = new Date().toISOString();
  const existingMeta = options.existingLead?.metadata && typeof options.existingLead.metadata === "object" ? options.existingLead.metadata : {};
  const assignment = resolveLeadAssignment(payload, admin, options);
  const identifiers = normalizedLeadIdentifiers(payload);
  const lifecycleStatus = normalizeLifecycleStatus(payload.leadStatus || payload.lead_status || payload.status || payload.callStatus || options.existingLead?.lead_status || options.existingLead?.leadStatus || existingMeta.leadStatus || existingMeta.lead_status || "new");
  const ownerAuthUserId = firstCleanText(payload.ownerAuthUserId, payload.owner_id, existingMeta.ownerAuthUserId, existingMeta.owner_auth_user_id, options.create ? admin.id : "");
  const ownerProfileId = firstCleanText(payload.ownerProfileId, payload.owner_profile_id, existingMeta.ownerProfileId, existingMeta.owner_profile_id);
  const ownerEmail = firstCleanText(payload.ownerEmail, payload.owner_email, existingMeta.ownerEmail, existingMeta.owner_email, payload.createdByEmail, options.create ? admin.email : "").toLowerCase();
  const ownerName = firstCleanText(payload.ownerName, payload.owner_name, existingMeta.ownerName, existingMeta.owner_name, payload.createdByName, options.create ? admin.email : "");
  const analysisScore = websiteAnalysisScore(payload.websiteAnalysis || payload.metadata?.websiteAnalysis);
  const acquisitionChannel = cleanText(payload.acquisitionChannel || payload.acquisition_channel || options.existingLead?.acquisition_channel || options.existingLead?.acquisitionChannel || existingMeta.acquisitionChannel || existingMeta.acquisition_channel).toLowerCase();
  if (acquisitionChannel && !acquisitionChannels.has(acquisitionChannel)) {
    const error = new Error("Kies een geldig acquisitiekanaal.");
    error.status = 400;
    throw error;
  }
  const sourcedByInput = cleanText(payload.sourcedByUserId || payload.sourced_by_user_id || options.existingLead?.sourced_by_user_id || options.existingLead?.sourcedByUserId || existingMeta.sourcedByUserId || existingMeta.sourced_by_user_id);
  const sourcedByUserId = firstUuid(sourcedByInput);
  if (sourcedByInput && !sourcedByUserId) {
    const error = new Error("Kies een geldige medewerker bij 'Ingebracht door'.");
    error.status = 400;
    throw error;
  }
  if (sourcedByUserId && !managerRoles.has(normalizeRole(admin.role)) && sourcedByUserId !== firstUuid(admin.id)) {
    const error = new Error("Je mag alleen jezelf als bronmedewerker kiezen.");
    error.status = 403;
    throw error;
  }
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status") || Object.prototype.hasOwnProperty.call(payload, "callStatus");
  const hasSource = Object.prototype.hasOwnProperty.call(payload, "source");
  const hasWebsiteStatus = Object.prototype.hasOwnProperty.call(payload, "websiteStatus") || Object.prototype.hasOwnProperty.call(payload, "website_status");
  const hasLeadScore = Object.prototype.hasOwnProperty.call(payload, "leadScore") || Object.prototype.hasOwnProperty.call(payload, "score") || Object.prototype.hasOwnProperty.call(payload, "lead_score");
  const hasFollowUpDate = Object.prototype.hasOwnProperty.call(payload, "followUpDate") || Object.prototype.hasOwnProperty.call(payload, "follow_up_date");
  const hasPipelineStage = Object.prototype.hasOwnProperty.call(payload, "pipelineStage") || Object.prototype.hasOwnProperty.call(payload, "pipeline_stage");
  const hasCallDisposition = Object.prototype.hasOwnProperty.call(payload, "callDisposition") || Object.prototype.hasOwnProperty.call(payload, "call_disposition");
  const hasLastCallOutcome = Object.prototype.hasOwnProperty.call(payload, "lastCallOutcome") || Object.prototype.hasOwnProperty.call(payload, "last_call_outcome") || hasCallDisposition;
  const hasInterestLevel = Object.prototype.hasOwnProperty.call(payload, "interestLevel") || Object.prototype.hasOwnProperty.call(payload, "interest_level");
  const hasPriority = Object.prototype.hasOwnProperty.call(payload, "priority");
  const hasIsFavorite = Object.prototype.hasOwnProperty.call(payload, "isFavorite") || Object.prototype.hasOwnProperty.call(payload, "is_favorite");
  const isFavoriteInput = Object.prototype.hasOwnProperty.call(payload, "isFavorite") ? payload.isFavorite : payload.is_favorite;
  if (hasIsFavorite && typeof isFavoriteInput !== "boolean") {
    throw Object.assign(new Error("Favorietstatus moet true of false zijn."), { status: 400 });
  }
  const isFavorite = hasIsFavorite
    ? isFavoriteInput
    : Boolean(options.existingLead?.is_favorite ?? options.existingLead?.isFavorite ?? existingMeta.isFavorite ?? false);
  const pipelineStage = cleanText(payload.pipelineStage || payload.pipeline_stage || options.existingLead?.pipeline_stage || options.existingLead?.pipelineStage || existingMeta.pipelineStage || existingMeta.pipeline_stage || "new").toLowerCase();
  const callDisposition = cleanText(payload.callDisposition || payload.call_disposition || options.existingLead?.call_disposition || options.existingLead?.callDisposition || existingMeta.callDisposition || existingMeta.call_disposition || "not_called").toLowerCase();
  const lastCallOutcome = cleanText(payload.lastCallOutcome || payload.last_call_outcome || (hasCallDisposition ? callOutcomeByDisposition.get(callDisposition) : "") || options.existingLead?.last_call_outcome || options.existingLead?.lastCallOutcome || existingMeta.lastCallOutcome || existingMeta.last_call_outcome).toLowerCase();
  const interestLevel = cleanText(payload.interestLevel || payload.interest_level || options.existingLead?.interest_level || options.existingLead?.interestLevel || existingMeta.interestLevel || existingMeta.interest_level || "unsure").toLowerCase();
  const priority = cleanText(payload.priority || options.existingLead?.priority || existingMeta.priority || "normal").toLowerCase();
  if (!pipelineStages.has(pipelineStage)) throw Object.assign(new Error("Kies een geldige pipelinefase."), { status: 400 });
  if (!callDispositions.has(callDisposition)) throw Object.assign(new Error("Kies een geldige belstatus."), { status: 400 });
  if (!interestLevels.has(interestLevel)) throw Object.assign(new Error("Kies een geldige interesse."), { status: 400 });
  if (!leadPriorities.has(priority)) throw Object.assign(new Error("Kies een geldige prioriteit."), { status: 400 });
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
    lead_status: lifecycleStatus,
    pipeline_stage: pipelineStage,
    last_call_outcome: lastCallOutcome || null,
    interest_level: interestLevel,
    priority,
    is_favorite: isFavorite,
    notes: cleanText(payload.notes || payload.message),
    assigned_to: assignment.id,
    assigned_user_id: firstUuid(assignment.userId, assignment.id),
    assigned_at: payload.assignedAt || payload.assigned_at || existingMeta.assignedAt || existingMeta.assigned_at || (assignment.id || assignment.email ? now : null),
    assigned_by: payload.assignedBy || payload.assigned_by || existingMeta.assignedBy || existingMeta.assigned_by || (assignment.id || assignment.email ? admin.id : null),
    reviewed_at: cleanText(payload.reviewedAt || payload.reviewed_at || existingMeta.reviewedAt || existingMeta.reviewed_at),
    reviewed_by: cleanText(payload.reviewedBy || payload.reviewed_by || existingMeta.reviewedBy || existingMeta.reviewed_by),
    rejection_reason: cleanText(payload.rejectionReason || payload.rejection_reason || existingMeta.rejectionReason || existingMeta.rejection_reason),
    rejection_note: cleanText(payload.rejectionNote || payload.rejection_note || existingMeta.rejectionNote || existingMeta.rejection_note),
    rejected_at: cleanText(payload.rejectedAt || payload.rejected_at || existingMeta.rejectedAt || existingMeta.rejected_at),
    rejected_by: cleanText(payload.rejectedBy || payload.rejected_by || existingMeta.rejectedBy || existingMeta.rejected_by),
    normalized_company_name: identifiers.normalizedCompanyName || normalizeCompanyName(payload.companyName || payload.company_name || payload.company || payload.businessName),
    normalized_domain: identifiers.normalizedDomain || normalizeDomain(payload.websiteUrl || payload.website),
    normalized_phone: identifiers.normalizedPhone || normalizePhone(payload.phone),
    external_source: cleanText(payload.externalSource || payload.external_source || payload.source || options.existingLead?.external_source || options.existingLead?.externalSource || existingMeta.externalSource || existingMeta.external_source || "admin-dashboard-leadfinder"),
    external_source_id: identifiers.externalSourceId,
    acquisition_channel: acquisitionChannel || null,
    sourced_by_user_id: sourcedByUserId,
    last_activity_at: cleanText(payload.lastActivityAt || payload.last_activity_at || now),
    last_contacted_at: cleanText(payload.lastContactedAt || payload.last_contacted_at || existingMeta.lastContactedAt || existingMeta.last_contacted_at),
    next_action_at: cleanText(payload.nextActionAt || payload.next_action_at || payload.followUpDate || existingMeta.nextActionAt || existingMeta.next_action_at),
    lead_score_reasoning: cleanText(payload.leadScoreReasoning || payload.lead_score_reasoning || existingMeta.leadScoreReasoning || existingMeta.lead_score_reasoning),
    lead_score_updated_at: cleanText(payload.leadScoreUpdatedAt || payload.lead_score_updated_at || existingMeta.leadScoreUpdatedAt || existingMeta.lead_score_updated_at || (hasLeadScore ? now : "")),
    owner_email: assignment.email || ownerEmail,
    owner_name: assignment.name || ownerName,
    assigned_user_email: assignment.email,
    assigned_user_name: assignment.name,
    sales_partner_email: firstCleanText(payload.salesPartnerEmail, payload.sales_partner_email, assignment.email).toLowerCase(),
    sales_partner_name: firstCleanText(payload.salesPartnerName, payload.sales_partner_name, assignment.name),
    metadata: {
      ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
      source: cleanText(payload.source || "admin-dashboard-leadfinder"),
      leadStatus: lifecycleStatus,
      lead_status: lifecycleStatus,
      pipelineStage,
      lastCallOutcome,
      interestLevel,
      priority,
      isFavorite,
      region: cleanText(payload.region),
      industry: cleanText(payload.industry),
      websiteStatus: cleanText(payload.websiteStatus),
      leadScore: analysisScore ?? Number(payload.leadScore || payload.score || 60),
      followUpDate: cleanText(payload.followUpDate),
      googlePlaceId: cleanText(payload.googlePlaceId),
      externalSource: cleanText(payload.externalSource || payload.external_source || payload.source || options.existingLead?.external_source || options.existingLead?.externalSource || existingMeta.externalSource || existingMeta.external_source || "admin-dashboard-leadfinder"),
      externalSourceId: identifiers.externalSourceId,
      acquisitionChannel,
      sourcedByUserId: sourcedByUserId || "",
      sourcedByName: cleanText(payload.sourcedByName || payload.sourced_by_name),
      normalizedCompanyName: identifiers.normalizedCompanyName,
      normalizedDomain: identifiers.normalizedDomain,
      normalizedPhone: identifiers.normalizedPhone,
      reviewedAt: cleanText(payload.reviewedAt || payload.reviewed_at || existingMeta.reviewedAt || existingMeta.reviewed_at),
      reviewedBy: cleanText(payload.reviewedBy || payload.reviewed_by || existingMeta.reviewedBy || existingMeta.reviewed_by),
      rejectionReason: cleanText(payload.rejectionReason || payload.rejection_reason || existingMeta.rejectionReason || existingMeta.rejection_reason),
      rejectionNote: cleanText(payload.rejectionNote || payload.rejection_note || existingMeta.rejectionNote || existingMeta.rejection_note),
      rejectedAt: cleanText(payload.rejectedAt || payload.rejected_at || existingMeta.rejectedAt || existingMeta.rejected_at),
      rejectedBy: cleanText(payload.rejectedBy || payload.rejected_by || existingMeta.rejectedBy || existingMeta.rejected_by),
      assignedAt: cleanText(payload.assignedAt || payload.assigned_at || existingMeta.assignedAt || existingMeta.assigned_at || (assignment.id || assignment.email ? now : "")),
      assignedBy: cleanText(payload.assignedBy || payload.assigned_by || existingMeta.assignedBy || existingMeta.assigned_by || (assignment.id || assignment.email ? admin.id : "")),
      lastActivityAt: cleanText(payload.lastActivityAt || payload.last_activity_at || now),
      lastContactedAt: cleanText(payload.lastContactedAt || payload.last_contacted_at || existingMeta.lastContactedAt || existingMeta.last_contacted_at),
      nextActionAt: cleanText(payload.nextActionAt || payload.next_action_at || payload.followUpDate || existingMeta.nextActionAt || existingMeta.next_action_at),
      googleMapsUrl: cleanText(payload.googleMapsUrl),
      websiteAnalysis: payload.websiteAnalysis && typeof payload.websiteAnalysis === "object" ? payload.websiteAnalysis : undefined,
      demoBriefing: cleanText(payload.demoBriefing || payload.generatedBriefing),
      salesCallBriefing: cleanText(payload.salesCallBriefing),
      demoFactoryIntake: payload.demoFactoryIntake && typeof payload.demoFactoryIntake === "object" ? payload.demoFactoryIntake : undefined,
      demoOutputRequirements: Array.isArray(payload.demoOutputRequirements) ? payload.demoOutputRequirements : undefined,
      demoRequestSource: cleanText(payload.demoRequestSource),
      demoRequestedAt: cleanText(payload.demoRequestedAt),
      ownerAuthUserId,
      ownerProfileId,
      ownerEmail,
      ownerName,
      assignedTo: assignment.id,
      assignedUserId: assignment.userId,
      assignedUserEmail: assignment.email,
      assignedUserName: assignment.name,
      medewerker: assignment.name,
      medewerkerEmail: assignment.email,
      employee: assignment.name,
      employeeEmail: assignment.email,
      assignedToEmail: assignment.email,
      assignedToName: assignment.name,
      userEmail: assignment.email,
      userName: assignment.name,
      salesPartnerEmail: firstCleanText(payload.salesPartnerEmail, payload.sales_partner_email, assignment.email).toLowerCase(),
      salesPartnerName: firstCleanText(payload.salesPartnerName, payload.sales_partner_name, assignment.name),
      updatedBy: admin.id,
      updatedByEmail: admin.email,
    },
    is_demo: false,
    environment: "production",
    updated_at: now,
  };
  if (options.create) {
    record.owner_id = ownerAuthUserId || admin.id;
    record.created_by = cleanText(payload.createdBy || payload.created_by || admin.id) || admin.id;
    record.created_at = now;
    record.metadata.createdByEmail = cleanText(payload.createdByEmail || admin.email);
    record.metadata.createdByName = cleanText(payload.createdByName || admin.email);
  }
  [
    "reviewed_at",
    "reviewed_by",
    "rejection_reason",
    "rejection_note",
    "rejected_at",
    "rejected_by",
    "assigned_user_id",
    "assigned_at",
    "assigned_by",
    "last_contacted_at",
    "last_call_outcome",
    "next_action_at",
    "lead_score_reasoning",
    "lead_score_updated_at",
    "external_source_id",
  ].forEach((key) => {
    if (record[key] === "" || record[key] === undefined) delete record[key];
  });
  if (options.update) {
    if (!hasPipelineStage) delete record.pipeline_stage;
    if (!hasLastCallOutcome) delete record.last_call_outcome;
    if (!hasInterestLevel) delete record.interest_level;
    if (!hasPriority) delete record.priority;
    if (!hasIsFavorite) {
      delete record.is_favorite;
      delete record.metadata.isFavorite;
    }
    const hasAssignment = leadAssignmentInput(payload) || Boolean(assignment.id || assignment.email || assignment.name);
    Object.keys(record).forEach((key) => {
      if (record[key] === "" && !["email", "phone", "website", "notes"].includes(key)) delete record[key];
    });
    if (!hasStatus) delete record.status;
    if (!Object.prototype.hasOwnProperty.call(payload, "leadStatus") && !Object.prototype.hasOwnProperty.call(payload, "lead_status")) delete record.lead_status;
    if (!hasAssignment) {
      delete record.assigned_to;
      delete record.assigned_user_id;
      delete record.assigned_at;
      delete record.assigned_by;
      delete record.owner_email;
      delete record.owner_name;
      delete record.assigned_user_email;
      delete record.assigned_user_name;
      delete record.sales_partner_email;
      delete record.sales_partner_name;
      [
        "ownerAuthUserId",
        "ownerProfileId",
        "ownerEmail",
        "ownerName",
        "assignedUserEmail",
        "assignedUserId",
        "assignedUserName",
        "assignedAt",
        "assignedBy",
        "medewerker",
        "medewerkerEmail",
        "employee",
        "employeeEmail",
        "assignedToEmail",
        "assignedToName",
        "userEmail",
        "userName",
        "salesPartnerEmail",
        "salesPartnerName",
      ].forEach((key) => delete record.metadata[key]);
    }
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
  const assignment = resolveLeadAssignment(payload, admin, options);
  const identifiers = normalizedLeadIdentifiers(payload);
  const lifecycleStatus = normalizeLifecycleStatus(payload.leadStatus || payload.lead_status || payload.status || payload.callStatus || "new");
  const ownerAuthUserId = firstCleanText(payload.ownerAuthUserId, payload.owner_id, existingMeta.ownerAuthUserId, existingMeta.owner_auth_user_id, options.create ? admin.id : "");
  const ownerProfileId = firstCleanText(payload.ownerProfileId, payload.owner_profile_id, existingMeta.ownerProfileId, existingMeta.owner_profile_id);
  const ownerEmail = firstCleanText(payload.ownerEmail, payload.owner_email, existingMeta.ownerEmail, existingMeta.owner_email, payload.createdByEmail, options.create ? admin.email : "").toLowerCase();
  const ownerName = firstCleanText(payload.ownerName, payload.owner_name, existingMeta.ownerName, existingMeta.owner_name, payload.createdByName, options.create ? admin.email : "");
  const analysisScore = websiteAnalysisScore(payload.websiteAnalysis || payload.metadata?.websiteAnalysis);
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status") || Object.prototype.hasOwnProperty.call(payload, "callStatus");
  const hasSource = Object.prototype.hasOwnProperty.call(payload, "source");
  const hasWebsiteStatus = Object.prototype.hasOwnProperty.call(payload, "websiteStatus") || Object.prototype.hasOwnProperty.call(payload, "website_status");
  const hasLeadScore = Object.prototype.hasOwnProperty.call(payload, "leadScore") || Object.prototype.hasOwnProperty.call(payload, "score") || Object.prototype.hasOwnProperty.call(payload, "lead_score");
  const hasFollowUpDate = Object.prototype.hasOwnProperty.call(payload, "followUpDate") || Object.prototype.hasOwnProperty.call(payload, "follow_up_date");
  const meta = {
    ...existingMeta,
    ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
    ownerAuthUserId,
    ownerProfileId,
    ownerEmail,
    ownerName,
    createdBy: cleanText(payload.createdBy || payload.created_by || options.existingLead?.createdBy || existingMeta.createdBy || admin.id) || admin.id,
    createdByEmail: cleanText(payload.createdByEmail || options.existingLead?.createdByEmail || existingMeta.createdByEmail || admin.email),
    createdByName: cleanText(payload.createdByName || options.existingLead?.createdByName || existingMeta.createdByName || admin.email),
    assignedTo: assignment.id,
    assignedUserId: assignment.userId,
    assignedUserEmail: assignment.email,
    assignedUserName: assignment.name,
    medewerker: assignment.name,
    medewerkerEmail: assignment.email,
    employee: assignment.name,
    employeeEmail: assignment.email,
    assignedToEmail: assignment.email,
    assignedToName: assignment.name,
    userEmail: assignment.email,
    userName: assignment.name,
    salesPartnerEmail: firstCleanText(payload.salesPartnerEmail, payload.sales_partner_email, assignment.email).toLowerCase(),
    salesPartnerName: firstCleanText(payload.salesPartnerName, payload.sales_partner_name, assignment.name),
    source: cleanText(payload.source || "admin-dashboard-leadfinder"),
    leadStatus: lifecycleStatus,
    lead_status: lifecycleStatus,
    websiteStatus: cleanText(payload.websiteStatus),
    leadScore: analysisScore ?? Number(payload.leadScore || payload.score || 60),
    googlePlaceId: cleanText(payload.googlePlaceId),
    googleMapsUrl: cleanText(payload.googleMapsUrl),
    demoBriefing: cleanText(payload.demoBriefing || payload.generatedBriefing),
    salesCallBriefing: cleanText(payload.salesCallBriefing),
    demoFactoryIntake: payload.demoFactoryIntake && typeof payload.demoFactoryIntake === "object" ? payload.demoFactoryIntake : undefined,
    demoOutputRequirements: Array.isArray(payload.demoOutputRequirements) ? payload.demoOutputRequirements : undefined,
    demoRequestSource: cleanText(payload.demoRequestSource),
    demoRequestedAt: cleanText(payload.demoRequestedAt),
    externalSource: cleanText(payload.externalSource || payload.external_source || payload.source || "admin-dashboard-leadfinder"),
    externalSourceId: identifiers.externalSourceId,
    acquisitionChannel: cleanText(payload.acquisitionChannel || payload.acquisition_channel || existingMeta.acquisitionChannel || existingMeta.acquisition_channel),
    sourcedByUserId: cleanText(payload.sourcedByUserId || payload.sourced_by_user_id || existingMeta.sourcedByUserId || existingMeta.sourced_by_user_id),
    sourcedByName: cleanText(payload.sourcedByName || payload.sourced_by_name || existingMeta.sourcedByName || existingMeta.sourced_by_name),
    normalizedCompanyName: identifiers.normalizedCompanyName,
    normalizedDomain: identifiers.normalizedDomain || normalizeDomain(payload.websiteUrl || payload.website),
    normalizedPhone: identifiers.normalizedPhone || normalizePhone(payload.phone),
    lastActivityAt: cleanText(payload.lastActivityAt || payload.last_activity_at || now),
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
    status: legacyDbStatus(payload.status || payload.callStatus || "nieuw"),
    metadata: meta,
    is_demo: false,
    environment: "production",
    updated_at: now,
  };
  if (options.ownerColumn !== false) {
    record.owner_auth_user_id = ownerAuthUserId;
  }
  if (options.interestColumn !== false) {
    record.interest = cleanText(payload.interest || payload.websiteUrl || payload.website);
  }
  if (options.messageColumn !== false) {
    record.message = cleanText(payload.notes || payload.message);
  }
  if (options.extended) {
    record.branch = cleanText(payload.industry || payload.branch);
    record.region = cleanText(payload.region);
    record.website_url = cleanText(payload.websiteUrl || payload.website);
    record.website_status = cleanText(payload.websiteStatus || "unknown");
    record.lead_score = analysisScore ?? Number(payload.leadScore || payload.score || 60);
    record.call_status = normalizeLeadStatus(payload.callStatus || payload.status || "nieuw");
    record.follow_up_date = cleanText(payload.followUpDate);
    record.notes = cleanText(payload.notes || payload.message);
  }
  if (options.lifecycleColumns) {
    record.lead_status = lifecycleStatus;
    record.reviewed_at = cleanText(payload.reviewedAt || payload.reviewed_at || existingMeta.reviewedAt || existingMeta.reviewed_at);
    record.reviewed_by = cleanText(payload.reviewedBy || payload.reviewed_by || existingMeta.reviewedBy || existingMeta.reviewed_by);
    record.rejection_reason = cleanText(payload.rejectionReason || payload.rejection_reason || existingMeta.rejectionReason || existingMeta.rejection_reason);
    record.rejection_note = cleanText(payload.rejectionNote || payload.rejection_note || existingMeta.rejectionNote || existingMeta.rejection_note);
    record.rejected_at = cleanText(payload.rejectedAt || payload.rejected_at || existingMeta.rejectedAt || existingMeta.rejected_at);
    record.rejected_by = cleanText(payload.rejectedBy || payload.rejected_by || existingMeta.rejectedBy || existingMeta.rejected_by);
    record.assigned_user_id = firstUuid(assignment.userId, assignment.id);
    record.assigned_at = payload.assignedAt || payload.assigned_at || existingMeta.assignedAt || existingMeta.assigned_at || (assignment.id || assignment.email ? now : "");
    record.assigned_by = payload.assignedBy || payload.assigned_by || existingMeta.assignedBy || existingMeta.assigned_by || (assignment.id || assignment.email ? admin.id : "");
    record.normalized_company_name = identifiers.normalizedCompanyName || normalizeCompanyName(payload.companyName || payload.company_name || payload.company || payload.businessName);
    record.normalized_domain = identifiers.normalizedDomain || normalizeDomain(payload.websiteUrl || payload.website);
    record.normalized_phone = identifiers.normalizedPhone || normalizePhone(payload.phone);
    record.external_source = cleanText(payload.externalSource || payload.external_source || payload.source || "admin-dashboard-leadfinder");
    record.external_source_id = identifiers.externalSourceId;
    record.last_activity_at = cleanText(payload.lastActivityAt || payload.last_activity_at || now);
    record.last_contacted_at = cleanText(payload.lastContactedAt || payload.last_contacted_at || existingMeta.lastContactedAt || existingMeta.last_contacted_at);
    record.next_action_at = cleanText(payload.nextActionAt || payload.next_action_at || payload.followUpDate || existingMeta.nextActionAt || existingMeta.next_action_at);
    record.lead_score_reasoning = cleanText(payload.leadScoreReasoning || payload.lead_score_reasoning || existingMeta.leadScoreReasoning || existingMeta.lead_score_reasoning);
    record.lead_score_updated_at = cleanText(payload.leadScoreUpdatedAt || payload.lead_score_updated_at || existingMeta.leadScoreUpdatedAt || existingMeta.lead_score_updated_at || (hasLeadScore ? now : ""));
  }
  const allowedEmpty = new Set(["email", "phone", "interest", "message", "notes", "website_url"]);
  Object.keys(record).forEach((key) => {
    if (record[key] === "" && !allowedEmpty.has(key)) delete record[key];
  });
  if (options.create) record.created_at = now;
  if (options.update) {
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

async function reviewLead({ payload = {}, existingLead = {}, supabaseUrl, serviceRoleKey, admin, id }) {
  const now = new Date().toISOString();
  const decision = cleanText(payload.decision || payload.leadStatus || payload.lead_status).toLowerCase();
  const leadStatus = decision === "interesting" ? "interesting" : decision === "not_interesting" ? "not_interesting" : "";
  if (!leadStatus) return jsonResponse(400, { success: false, error: "Kies Interessant of Niet interessant." });
  const reason = cleanText(payload.reason || payload.rejectionReason || payload.rejection_reason);
  if (leadStatus === "not_interesting" && !rejectionReasons.has(reason)) {
    return jsonResponse(400, { success: false, error: "Kies een geldige afwijsreden." });
  }
  const existingMeta = existingLead.metadata && typeof existingLead.metadata === "object" ? existingLead.metadata : {};
  const note = cleanText(payload.note || payload.rejectionNote || payload.rejection_note);
  const title = leadStatus === "interesting" ? "Lead gemarkeerd als interessant" : "Lead gemarkeerd als niet interessant";
  const metadata = {
    ...existingMeta,
    leadStatus,
    lead_status: leadStatus,
    pipelineStage: cleanText(existingLead.pipeline_stage || existingMeta.pipelineStage || existingMeta.pipeline_stage),
    interestLevel: cleanText(existingLead.interest_level || existingMeta.interestLevel || existingMeta.interest_level),
    priority: cleanText(existingLead.priority || existingMeta.priority),
    isFavorite: Boolean(existingLead.is_favorite ?? existingMeta.isFavorite ?? false),
    archivedAt: cleanText(existingLead.archived_at || existingMeta.archivedAt || existingMeta.archived_at),
    reviewedAt: now,
    reviewedBy: admin.id,
    reviewedByEmail: admin.email,
    lastActivityAt: now,
  };
  if (leadStatus === "not_interesting") {
    metadata.rejectionReason = reason;
    metadata.rejectionNote = note;
    metadata.rejectedAt = now;
    metadata.rejectedBy = admin.id;
  }
  const record = {
    status: legacyDbStatus(leadStatus),
    call_status: leadStatus === "interesting" ? "interesse" : "geen_interesse",
    lead_status: leadStatus,
    reviewed_at: now,
    reviewed_by: admin.id,
    rejection_reason: leadStatus === "not_interesting" ? reason : "",
    rejection_note: leadStatus === "not_interesting" ? note : "",
    rejected_at: leadStatus === "not_interesting" ? now : null,
    rejected_by: leadStatus === "not_interesting" ? admin.id : null,
    last_activity_at: now,
    metadata,
    updated_at: now,
  };
  const attempts = [
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record }),
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record: { metadata, updated_at: now } }),
  ];
  const rows = await trySchemaAttempts(attempts);
  const lead = mapLead(rows[0] || { id, ...existingLead, ...record });
  await insertLeadTimelineEvent({
    supabaseUrl,
    serviceRoleKey,
    leadId: id,
    admin,
    eventType: leadStatus === "interesting" ? "lead_marked_interesting" : "lead_marked_not_interesting",
    title,
    metadata: { reason, note, leadStatus },
  });
  return jsonResponse(200, { success: true, lead, updated: true, decision: leadStatus });
}

async function assignLead({ payload = {}, existingLead = {}, supabaseUrl, serviceRoleKey, admin, id }) {
  const now = new Date().toISOString();
  let assignment = resolveLeadAssignment(payload, admin, { update: true, existingLead });
  if (!assignment.id && !assignment.email) return jsonResponse(400, { success: false, error: "Kies een medewerker om toe te wijzen." });
  assignment = await validateLeadAssignee({ assignment, admin, supabaseUrl, serviceRoleKey });
  const existingMeta = existingLead.metadata && typeof existingLead.metadata === "object" ? existingLead.metadata : {};
  const metadata = {
    ...existingMeta,
    leadStatus: "assigned",
    lead_status: "assigned",
    assignedTo: assignment.id,
    assignedUserId: assignment.userId,
    assignedUserEmail: assignment.email,
    assignedUserName: assignment.name,
    assignedAt: now,
    assignedBy: admin.id,
    lastActivityAt: now,
  };
  const record = {
    lead_status: "assigned",
    assigned_to: assignment.id,
    assigned_user_id: firstUuid(assignment.userId, assignment.id),
    assigned_user_email: assignment.email,
    assigned_user_name: assignment.name,
    assigned_at: now,
    assigned_by: admin.id,
    owner_email: assignment.email,
    owner_name: assignment.name,
    last_activity_at: now,
    metadata,
    updated_at: now,
  };
  const attempts = [
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record }),
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record: { assigned_to: assignment.id, metadata, updated_at: now } }),
  ];
  const rows = await trySchemaAttempts(attempts);
  const lead = mapLead(rows[0] || { id, ...existingLead, ...record });
  await insertLeadTimelineEvent({ supabaseUrl, serviceRoleKey, leadId: id, admin, eventType: "lead_assigned", title: "Lead toegewezen", metadata: { assignedTo: assignment.id, assignedUserEmail: assignment.email, assignedUserName: assignment.name } });
  return jsonResponse(200, { success: true, lead, updated: true, assigned: true });
}

async function validateLeadAssignee({ assignment = {}, admin = {}, supabaseUrl, serviceRoleKey }) {
  const candidateUuid = firstUuid(assignment.userId, assignment.id);
  const candidateEmail = firstCleanText(assignment.email, cleanText(assignment.id).includes("@") ? assignment.id : "").toLowerCase();
  if (!candidateUuid && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
    throw Object.assign(new Error("Kies een geldige interne medewerker."), { status: 400 });
  }
  const role = normalizeRole(admin.role);
  if (!managerRoles.has(role)) {
    const ownTokens = [admin.id, admin.profileId, admin.email].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
    const requestedTokens = [candidateUuid, candidateEmail].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
    if (!requestedTokens.some((token) => ownTokens.includes(token))) {
      throw Object.assign(new Error("Je mag een lead alleen aan jezelf toewijzen."), { status: 403 });
    }
  }
  const selects = "id,auth_user_id,email,name,role,status,archived_at";
  const attempts = [];
  if (candidateUuid) {
    for (const column of ["auth_user_id", "id"]) {
      const params = new URLSearchParams({ select: selects, [column]: `eq.${candidateUuid}`, limit: "1" });
      attempts.push(() => supabaseFetch(`${supabaseUrl}/rest/v1/profiles?${params.toString()}`, { method: "GET", headers: restHeaders(serviceRoleKey) }));
    }
  }
  if (candidateEmail) {
    const params = new URLSearchParams({ select: selects, email: `ilike.${candidateEmail}`, limit: "1" });
    attempts.push(() => supabaseFetch(`${supabaseUrl}/rest/v1/profiles?${params.toString()}`, { method: "GET", headers: restHeaders(serviceRoleKey) }));
  }
  let profile = null;
  for (const attempt of attempts) {
    const rows = await attempt();
    if (rows?.[0]) { profile = rows[0]; break; }
  }
  if (!profile || profile.archived_at || !staffRoles.includes(normalizeRole(profile.role)) || !["active", "invited"].includes(cleanText(profile.status).toLowerCase())) {
    throw Object.assign(new Error("Deze medewerker is niet actief of heeft geen salesrechten."), { status: 400 });
  }
  return {
    id: cleanText(profile.auth_user_id || profile.id),
    userId: cleanText(profile.auth_user_id),
    email: cleanText(profile.email).toLowerCase(),
    name: cleanText(profile.name || profile.email),
  };
}

async function mutateSalesPipeline({ payload = {}, existingLead = {}, supabaseUrl, serviceRoleKey, admin, id }) {
  const now = new Date().toISOString();
  const idempotencyKey = cleanText(payload.idempotencyKey || payload.idempotency_key);
  if (idempotencyKey && await hasLeadTimelineIdempotencyKey({ supabaseUrl, serviceRoleKey, leadId: id, idempotencyKey })) {
    return jsonResponse(200, { success: true, lead: mapLead(existingLead), updated: false, duplicate: true, idempotencyKey });
  }
  const lead = mapLead(existingLead);
  const existingMeta = existingLead.metadata && typeof existingLead.metadata === "object" ? existingLead.metadata : {};
  const action = cleanText(payload.action);
  const conflict = leadActionConflict(lead, admin);
  if (conflict) return jsonResponse(409, { success: false, error: conflict.message, conflict });

  let eventType = action;
  let title = "Lead bijgewerkt";
  let nextStatus = lead.leadStatus;
  let nextActionType = cleanText(payload.nextActionType || payload.next_action_type || lead.nextActionType);
  let nextActionAt = cleanText(payload.nextActionAt || payload.next_action_at || lead.nextActionAt);
  let nextActionNote = cleanText(payload.nextActionNote || payload.next_action_note || lead.nextActionNote);
  let nextActionAssignedUserId = firstUuid(payload.nextActionAssignedUserId, payload.next_action_assigned_user_id, lead.assignedUserId, admin.id);
  let lastCallOutcome = cleanText(payload.outcome || payload.callOutcome || payload.lastCallOutcome || payload.last_call_outcome || lead.lastCallOutcome);
  let lastContactedAt = lead.lastContactedAt;
  let lastContactedBy = lead.lastContactedBy;
  let appointmentAt = cleanText(payload.appointmentAt || payload.appointment_at || lead.appointmentAt);
  let appointmentType = cleanText(payload.appointmentType || payload.appointment_type || lead.appointmentType);
  let appointmentLocation = cleanText(payload.appointmentLocation || payload.appointment_location || lead.appointmentLocation);
  let wonAt = cleanText(lead.wonAt);
  let wonBy = cleanText(lead.wonBy);
  let lostAt = cleanText(lead.lostAt);
  let lostBy = cleanText(lead.lostBy);
  let lostReason = cleanText(payload.lostReason || payload.lost_reason || lead.lostReason);
  let lostNote = cleanText(payload.lostNote || payload.lost_note || payload.note || lead.lostNote);
  let nextActionCreatedAutomatically = Boolean(payload.nextActionCreatedAutomatically ?? payload.next_action_created_automatically ?? false);
  let nextActionCompletedAt = cleanText(lead.nextActionCompletedAt);
  let nextActionCompletedBy = cleanText(lead.nextActionCompletedBy);

  if (action === "call_started") {
    eventType = "call_started";
    title = "Belactie gestart";
    nextStatus = ["new", "interesting", "assigned"].includes(lead.leadStatus) ? "call_scheduled" : lead.leadStatus;
  }

  if (action === "contact") {
    const outcomeConfig = callOutcomes.get(lastCallOutcome);
    if (!outcomeConfig) return jsonResponse(400, { success: false, error: "Kies een geldige gespreksuitkomst." });
    eventType = outcomeEventType(lastCallOutcome);
    title = `Gesprek vastgelegd: ${outcomeConfig.label}`;
    nextStatus = normalizeLifecycleStatus(payload.leadStatus || payload.lead_status || outcomeConfig.status);
    nextActionType = cleanText(payload.nextActionType || payload.next_action_type || outcomeConfig.nextActionType);
    nextActionAt = cleanText(payload.nextActionAt || payload.next_action_at) || nextBusinessDateIso(outcomeConfig.defaultBusinessDays);
    nextActionNote = cleanText(payload.nextActionNote || payload.next_action_note || payload.note);
    nextActionCreatedAutomatically = !cleanText(payload.nextActionAt || payload.next_action_at) && Boolean(outcomeConfig.defaultBusinessDays);
    if (lastCallOutcome === "callback_requested" && !nextActionAt) {
      return jsonResponse(400, { success: false, error: "Kies een datum en tijd voor de terugbelafspraak." });
    }
    lastContactedAt = now;
    lastContactedBy = admin.id;
    if (lastCallOutcome === "appointment_scheduled") appointmentAt = nextActionAt;
  }

  if (action === "next_action") {
    if (!nextActionTypes.has(nextActionType)) return jsonResponse(400, { success: false, error: "Kies een geldige volgende actie." });
    if (!nextActionAt) return jsonResponse(400, { success: false, error: "Kies een datum en tijd voor de volgende actie." });
    eventType = "next_action_scheduled";
    title = "Volgende actie gepland";
    nextStatus = normalizeLifecycleStatus(payload.leadStatus || payload.lead_status || lead.leadStatus || "follow_up");
    nextActionCompletedAt = "";
    nextActionCompletedBy = "";
  }

  if (action === "complete_next_action") {
    eventType = "next_action_completed";
    title = "Volgende actie afgerond";
    nextActionType = "";
    nextActionAt = "";
    nextActionNote = "";
    nextActionAssignedUserId = null;
    nextActionCreatedAutomatically = false;
    nextActionCompletedAt = now;
    nextActionCompletedBy = admin.id;
  }

  if (action === "demo_requested") {
    eventType = "demo_requested";
    title = "Demo aangevraagd";
    nextStatus = "demo_requested";
    nextActionType = "create_demo";
    nextActionAt = nextActionAt || nextBusinessDateIso(1);
    nextActionNote = nextActionNote || cleanText(payload.demoWishes || payload.demo_wishes || payload.note);
  }

  if (action === "appointment_scheduled") {
    eventType = "appointment_scheduled";
    title = "Afspraak gepland";
    nextStatus = "appointment_scheduled";
    nextActionType = "appointment";
    appointmentAt = cleanText(payload.appointmentAt || payload.appointment_at || nextActionAt);
    nextActionAt = appointmentAt || nextActionAt;
    nextActionNote = nextActionNote || cleanText(payload.note);
  }

  if (action === "win") {
    eventType = "lead_won";
    title = "Lead gewonnen";
    nextStatus = "won";
    wonAt = now;
    wonBy = admin.id;
    nextActionType = "";
    nextActionAt = "";
    nextActionNote = "";
    nextActionAssignedUserId = null;
  }

  if (action === "lose") {
    eventType = "lead_lost";
    title = "Lead verloren";
    nextStatus = "lost";
    lostAt = now;
    lostBy = admin.id;
    nextActionType = "";
    nextActionAt = "";
    nextActionNote = "";
    nextActionAssignedUserId = null;
  }

  const metadata = {
    ...existingMeta,
    leadStatus: nextStatus,
    lead_status: nextStatus,
    lastActivityAt: now,
    lastContactedAt,
    lastContactedBy,
    lastCallOutcome,
    nextActionType,
    nextActionAt,
    nextActionNote,
    nextActionAssignedUserId: nextActionAssignedUserId || "",
    nextActionCreatedAutomatically,
    nextActionCompletedAt,
    nextActionCompletedBy,
    appointmentAt,
    appointmentType,
    appointmentLocation,
    wonAt,
    wonBy,
    closedByUserId: action === "win" ? admin.id : lead.closedByUserId,
    lostAt,
    lostBy,
    lostReason,
    lostNote,
  };
  Object.keys(metadata).forEach((key) => {
    if (metadata[key] === "" || metadata[key] === undefined || metadata[key] === null) delete metadata[key];
  });

  const record = {
    lead_status: nextStatus,
    status: legacyDbStatus(nextStatus),
    call_status: legacyCallStatus(nextStatus, lastCallOutcome),
    last_activity_at: now,
    last_contacted_at: lastContactedAt || null,
    last_contacted_by: firstUuid(lastContactedBy),
    last_call_outcome: lastCallOutcome || null,
    next_action_type: nextActionType || null,
    next_action_at: nextActionAt || null,
    next_action_note: nextActionNote || null,
    next_action_assigned_user_id: nextActionAssignedUserId || null,
    next_action_created_automatically: nextActionCreatedAutomatically,
    next_action_completed_at: nextActionCompletedAt || null,
    next_action_completed_by: firstUuid(nextActionCompletedBy),
    appointment_at: appointmentAt || null,
    appointment_type: appointmentType || null,
    appointment_location: appointmentLocation || null,
    won_at: wonAt || null,
    won_by: firstUuid(wonBy),
    closed_by_user_id: action === "win" ? firstUuid(admin.id) : firstUuid(lead.closedByUserId),
    lost_at: lostAt || null,
    lost_by: firstUuid(lostBy),
    lost_reason: lostReason || null,
    lost_note: lostNote || null,
    metadata,
    updated_at: now,
  };
  const attempts = [
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record }),
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record: { lead_status: nextStatus, status: record.status, call_status: record.call_status, last_activity_at: now, last_contacted_at: lastContactedAt || null, next_action_at: nextActionAt || null, metadata, updated_at: now } }),
    () => updateLeadRecord({ supabaseUrl, serviceRoleKey, id, record: { metadata, updated_at: now } }),
  ];
  const rows = await trySchemaAttempts(attempts);
  const updatedLead = mapLead(rows[0] || { id, ...existingLead, ...record });
  await insertLeadTimelineEvent({
    supabaseUrl,
    serviceRoleKey,
    leadId: id,
    admin,
    eventType,
    title,
    metadata: {
      action,
      outcome: lastCallOutcome,
      previousOutcome: lead.lastCallOutcome,
      note: cleanText(payload.note),
      nextActionType,
      nextActionAt,
      nextActionNote,
      nextActionCreatedAutomatically,
      leadStatus: nextStatus,
      previousLeadStatus: lead.leadStatus,
      occurredAt: now,
      appointmentAt,
      lostReason,
      idempotencyKey,
    },
  });
  return jsonResponse(200, { success: true, lead: updatedLead, updated: true, action, eventType });
}

async function hasLeadTimelineIdempotencyKey({ supabaseUrl, serviceRoleKey, leadId, idempotencyKey }) {
  if (!leadId || !idempotencyKey || !/^[a-zA-Z0-9:_-]{8,160}$/.test(idempotencyKey)) return false;
  const activityQuery = new URLSearchParams({
    select: "id",
    entity_type: "eq.leads",
    entity_id: `eq.${leadId}`,
    "metadata->>idempotencyKey": `eq.${idempotencyKey}`,
    limit: "1",
  });
  const timelineQuery = new URLSearchParams({
    select: "id",
    lead_id: `eq.${leadId}`,
    "metadata->>idempotencyKey": `eq.${idempotencyKey}`,
    limit: "1",
  });
  const attempts = [
    `${supabaseUrl}/rest/v1/activity_logs?${activityQuery.toString()}`,
    `${supabaseUrl}/rest/v1/customer_timeline_events?${timelineQuery.toString()}`,
  ];
  for (const url of attempts) {
    try {
      const rows = await supabaseFetch(url, { method: "GET", headers: restHeaders(serviceRoleKey) });
      if (rows?.length) return true;
    } catch (error) {
      if (!isMissingTableError(error) && !isMissingColumnError(error)) throw error;
    }
  }
  return false;
}

async function insertLeadTimelineEvent({ supabaseUrl, serviceRoleKey, leadId, admin = {}, eventType = "", title = "", metadata = {} }) {
  if (!leadId || !eventType) return;
  const now = new Date().toISOString();
  const actorUserId = firstUuid(admin.id);
  const actorEmail = cleanText(admin.email);
  const profileId = firstUuid(admin.profileId);
  const sharedMetadata = { title, leadId, actorUserId: actorUserId || "", actorEmail, ...metadata };
  const payloads = [
    {
      entity_type: "leads",
      entity_id: leadId,
      actor_profile_id: profileId,
      event_type: eventType,
      summary: title,
      metadata: sharedMetadata,
      environment: "production",
      is_demo: false,
      created_at: now,
    },
    {
      entity_type: "leads",
      entity_id: leadId,
      action: eventType,
      profile_id: profileId,
      performed_by: actorEmail || actorUserId || "system",
      metadata: sharedMetadata,
      environment: "production",
      is_demo: false,
      created_at: now,
    },
    {
      lead_id: leadId,
      module: "leads",
      event_type: eventType,
      title,
      description: title,
      user_id: actorUserId,
      actor_name: actorEmail || "Systeem",
      actor_role: cleanText(admin.role) || "system",
      severity: "info",
      is_global: true,
      metadata: sharedMetadata,
      created_at: now,
    },
  ];
  const attempts = [
    () => supabaseFetch(`${supabaseUrl}/rest/v1/activity_logs`, {
      method: "POST",
      headers: { ...restHeaders(serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
      body: JSON.stringify(payloads[0]),
    }),
    () => supabaseFetch(`${supabaseUrl}/rest/v1/activity_logs`, {
      method: "POST",
      headers: { ...restHeaders(serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
      body: JSON.stringify(payloads[1]),
    }),
    () => supabaseFetch(`${supabaseUrl}/rest/v1/customer_timeline_events`, {
      method: "POST",
      headers: { ...restHeaders(serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
      body: JSON.stringify(payloads[2]),
    }),
  ];
  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch (error) {
      if (!isMissingTableError(error) && !isMissingColumnError(error)) {
        console.warn("Lead timeline event kon niet worden opgeslagen", { leadId, eventType, status: error.status, code: error.code });
        return;
      }
    }
  }
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
  const analysisScore = websiteAnalysisScore(meta.websiteAnalysis);
  const leadStatus = normalizeLifecycleStatus(row.lead_status || meta.leadStatus || meta.lead_status || row.call_status || row.status);
  const lastCallOutcome = cleanText(row.last_call_outcome || meta.lastCallOutcome || meta.last_call_outcome).toLowerCase();
  return {
    id: cleanText(row.id),
    companyName: cleanText(row.company_name || row.company),
    contactName: cleanText(row.contact_name || row.name),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    websiteUrl: cleanText(row.website || row.website_url || row.interest || meta.websiteUrl || meta.website),
    callStatus: normalizeLeadStatus(row.call_status || row.status),
    status: normalizeLeadStatus(row.call_status || row.status),
    leadStatus,
    lead_status: leadStatus,
    pipelineStage: cleanText(row.pipeline_stage || meta.pipelineStage || meta.pipeline_stage),
    callDisposition: cleanText(row.call_disposition || meta.callDisposition || meta.call_disposition || callDispositionByOutcome.get(lastCallOutcome) || (row.last_contacted_at || meta.lastContactedAt ? "called" : "not_called")),
    interestLevel: cleanText(row.interest_level || meta.interestLevel || meta.interest_level),
    priority: cleanText(row.priority || meta.priority),
    isFavorite: Boolean(row.is_favorite ?? meta.isFavorite ?? false),
    archivedAt: cleanText(row.archived_at || meta.archivedAt || meta.archived_at),
    source: cleanText(row.source || meta.source || "supabase-production"),
    notes: cleanText(row.notes || row.message),
    ownerAuthUserId: cleanText(row.owner_id || row.owner_auth_user_id || meta.ownerAuthUserId || meta.owner_auth_user_id),
    ownerProfileId: cleanText(row.owner_profile_id || meta.ownerProfileId || meta.owner_profile_id),
    ownerEmail: cleanText(row.assigned_user_email || meta.assignedUserEmail || meta.assigned_user_email || meta.assignedToEmail || meta.assigned_to_email || meta.medewerkerEmail || meta.medewerker_email || meta.employeeEmail || meta.employee_email || row.sales_partner_email || meta.salesPartnerEmail || meta.sales_partner_email || row.owner_email || meta.ownerEmail || meta.owner_email || meta.userEmail || meta.user_email),
    ownerName: cleanText(row.assigned_user_name || meta.assignedUserName || meta.assigned_user_name || meta.assignedToName || meta.assigned_to_name || meta.medewerker || meta.employee || row.sales_partner_name || meta.salesPartnerName || meta.sales_partner_name || row.owner_name || meta.ownerName || meta.owner_name || meta.userName || meta.user_name),
    assignedUserName: cleanText(row.assigned_user_name || meta.assignedUserName || meta.assigned_user_name || meta.assignedToName || meta.assigned_to_name || meta.medewerker || meta.employee),
    assignedUserEmail: cleanText(row.assigned_user_email || meta.assignedUserEmail || meta.assigned_user_email || meta.assignedToEmail || meta.assigned_to_email || meta.medewerkerEmail || meta.medewerker_email || meta.employeeEmail || meta.employee_email),
    assignedUserId: cleanText(row.assigned_user_id || meta.assignedUserId || meta.assigned_user_id),
    salesPartnerEmail: cleanText(row.sales_partner_email || meta.salesPartnerEmail || meta.sales_partner_email),
    salesPartnerName: cleanText(row.sales_partner_name || meta.salesPartnerName || meta.sales_partner_name),
    createdBy: cleanText(row.created_by || meta.createdBy || row.owner_auth_user_id),
    createdByEmail: cleanText(row.created_by_email || meta.createdByEmail || meta.created_by_email),
    createdByName: cleanText(row.created_by_name || meta.createdByName || meta.created_by_name),
    assignedTo: cleanText(row.assigned_to || meta.assignedTo || meta.assigned_to),
    industry: cleanText(row.branch || meta.industry),
    region: cleanText(row.region || meta.region),
    websiteStatus: cleanText(row.website_status || meta.websiteStatus || "onbekend"),
    leadScore: analysisScore ?? Number(row.lead_score || meta.leadScore || 60),
    followUpDate: cleanText(row.follow_up_date || meta.followUpDate),
    googlePlaceId: cleanText(meta.googlePlaceId),
    googleMapsUrl: cleanText(meta.googleMapsUrl),
    reviewedAt: cleanText(row.reviewed_at || meta.reviewedAt || meta.reviewed_at),
    reviewedBy: cleanText(row.reviewed_by || meta.reviewedBy || meta.reviewed_by),
    rejectionReason: cleanText(row.rejection_reason || meta.rejectionReason || meta.rejection_reason),
    rejectionNote: cleanText(row.rejection_note || meta.rejectionNote || meta.rejection_note),
    rejectedAt: cleanText(row.rejected_at || meta.rejectedAt || meta.rejected_at),
    rejectedBy: cleanText(row.rejected_by || meta.rejectedBy || meta.rejected_by),
    assignedAt: cleanText(row.assigned_at || meta.assignedAt || meta.assigned_at),
    assignedBy: cleanText(row.assigned_by || meta.assignedBy || meta.assigned_by),
    normalizedCompanyName: cleanText(row.normalized_company_name || meta.normalizedCompanyName || meta.normalized_company_name),
    normalizedDomain: cleanText(row.normalized_domain || meta.normalizedDomain || meta.normalized_domain),
    normalizedPhone: cleanText(row.normalized_phone || meta.normalizedPhone || meta.normalized_phone),
    externalSource: cleanText(row.external_source || meta.externalSource || meta.external_source),
    externalSourceId: cleanText(row.external_source_id || meta.externalSourceId || meta.external_source_id),
    acquisitionChannel: cleanText(row.acquisition_channel || meta.acquisitionChannel || meta.acquisition_channel),
    sourcedByUserId: cleanText(row.sourced_by_user_id || meta.sourcedByUserId || meta.sourced_by_user_id),
    sourcedByName: cleanText(meta.sourcedByName || meta.sourced_by_name),
    closedByUserId: cleanText(row.closed_by_user_id || meta.closedByUserId || meta.closed_by_user_id || row.won_by || meta.wonBy),
    lastActivityAt: cleanText(row.last_activity_at || meta.lastActivityAt || meta.last_activity_at || row.updated_at),
    lastContactedAt: cleanText(row.last_contacted_at || meta.lastContactedAt || meta.last_contacted_at),
    lastContactedBy: cleanText(row.last_contacted_by || meta.lastContactedBy || meta.last_contacted_by),
    lastCallOutcome,
    nextActionType: cleanText(row.next_action_type || meta.nextActionType || meta.next_action_type),
    nextActionAt: cleanText(row.next_action_at || meta.nextActionAt || meta.next_action_at),
    nextActionNote: cleanText(row.next_action_note || meta.nextActionNote || meta.next_action_note),
    nextActionAssignedUserId: cleanText(row.next_action_assigned_user_id || meta.nextActionAssignedUserId || meta.next_action_assigned_user_id),
    nextActionCreatedAutomatically: Boolean(row.next_action_created_automatically ?? meta.nextActionCreatedAutomatically ?? meta.next_action_created_automatically),
    nextActionCompletedAt: cleanText(row.next_action_completed_at || meta.nextActionCompletedAt || meta.next_action_completed_at),
    nextActionCompletedBy: cleanText(row.next_action_completed_by || meta.nextActionCompletedBy || meta.next_action_completed_by),
    appointmentAt: cleanText(row.appointment_at || meta.appointmentAt || meta.appointment_at),
    appointmentType: cleanText(row.appointment_type || meta.appointmentType || meta.appointment_type),
    appointmentLocation: cleanText(row.appointment_location || meta.appointmentLocation || meta.appointment_location),
    wonAt: cleanText(row.won_at || meta.wonAt || meta.won_at),
    wonBy: cleanText(row.won_by || meta.wonBy || meta.won_by),
    lostAt: cleanText(row.lost_at || meta.lostAt || meta.lost_at),
    lostBy: cleanText(row.lost_by || meta.lostBy || meta.lost_by),
    lostReason: cleanText(row.lost_reason || meta.lostReason || meta.lost_reason),
    lostNote: cleanText(row.lost_note || meta.lostNote || meta.lost_note),
    leadScoreReasoning: cleanText(row.lead_score_reasoning || meta.leadScoreReasoning || meta.lead_score_reasoning),
    leadScoreUpdatedAt: cleanText(row.lead_score_updated_at || meta.leadScoreUpdatedAt || meta.lead_score_updated_at),
    demoBriefing: cleanText(meta.demoBriefing),
    salesCallBriefing: cleanText(meta.salesCallBriefing),
    demoFactoryIntake: meta.demoFactoryIntake && typeof meta.demoFactoryIntake === "object" ? meta.demoFactoryIntake : null,
    demoOutputRequirements: Array.isArray(meta.demoOutputRequirements) ? meta.demoOutputRequirements : [],
    demoRequestSource: cleanText(meta.demoRequestSource),
    demoRequestedAt: cleanText(meta.demoRequestedAt),
    isDemo: Boolean(row.is_demo),
    environment: cleanText(row.environment || "production"),
    metadata: meta,
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
    _supabaseId: cleanText(row.id),
  };
}

function normalizeLifecycleStatus(value) {
  const status = cleanText(value).toLowerCase();
  const mapped = ({
    lead: "new",
    nieuw: "new",
    new: "new",
    bellen: "call_scheduled",
    te_bellen: "call_scheduled",
    contact_planned: "call_scheduled",
    contact_attempted: "contact_attempted",
    belpoging: "contact_attempted",
    gebeld: "contacted",
    contacted: "contacted",
    voicemail: "follow_up",
    opvolgen: "follow_up",
    follow_up: "follow_up",
    appointment_scheduled: "appointment_scheduled",
    afspraak_gepland: "appointment_scheduled",
    interesse: "interesting",
    qualified: "interesting",
    offerte: "proposal_sent",
    quote_ready: "proposal_sent",
    quote_sent: "proposal_sent",
    negotiation: "negotiation",
    onderhandeling: "negotiation",
    verkocht: "won",
    won: "won",
    geconverteerd: "customer",
    klant_actief: "customer",
    customer_active: "customer",
    lost: "lost",
    geen_interesse: "not_interesting",
    archived: "lost",
    gearchiveerd: "lost",
  })[status] || status || "new";
  return lifecycleStatuses.has(mapped) ? mapped : "new";
}

function normalizeLeadStatus(value) {
  const status = cleanText(value).toLowerCase();
  if (status === "new") return "nieuw";
  if (status === "follow_up") return "opvolgen";
  if (status === "converted") return "geconverteerd";
  if (status === "qualified") return "interesse";
  if (status === "customer-active") return "klant_actief";
  return status || "nieuw";
}

function legacyDbStatus(value) {
  const status = normalizeLeadStatus(value);
  if (status === "lead") return "new";
  if (status === "bellen") return "follow_up";
  if (status === "offerte") return "qualified";
  if (status === "verkocht" || status === "klant_actief") return "converted";
  if (status === "nieuw") return "new";
  if (status === "interesting") return "qualified";
  if (status === "not_interesting") return "lost";
  if (status === "call_scheduled") return "follow_up";
  if (status === "proposal_sent") return "qualified";
  if (status === "customer") return "converted";
  if (["opvolgen", "contact_planned", "voicemail"].includes(status)) return "follow_up";
  if (["gebeld", "contacted"].includes(status)) return "contacted";
  if (["interesse", "qualified", "quote_ready", "quote_sent"].includes(status)) return "qualified";
  if (["won", "customer_active", "geconverteerd"].includes(status)) return "converted";
  if (["lost", "geen_interesse"].includes(status)) return "lost";
  if (status === "archived" || status === "gearchiveerd") return "archived";
  return "new";
}

function legacyCallStatus(status = "", outcome = "") {
  const normalized = normalizeLifecycleStatus(status);
  if (normalized === "new") return "nieuw";
  if (normalized === "interesting") return "interesse";
  if (normalized === "assigned") return "bellen";
  if (normalized === "call_scheduled") return "contact_planned";
  if (normalized === "contact_attempted") return outcome === "voicemail_left" ? "voicemail" : "gebeld";
  if (normalized === "contacted") return "contacted";
  if (normalized === "follow_up") return "opvolgen";
  if (normalized === "appointment_scheduled") return "contact_planned";
  if (normalized === "demo_requested") return "interesse";
  if (normalized === "proposal_sent") return "quote_sent";
  if (normalized === "negotiation") return "quote_sent";
  if (normalized === "won") return "won";
  if (normalized === "lost" || normalized === "not_interesting") return "geen_interesse";
  if (normalized === "customer") return "klant_actief";
  return normalizeLeadStatus(status || "nieuw");
}

function outcomeEventType(outcome = "") {
  return ({
    interested: "lead_interested",
    no_answer: "no_answer",
    voicemail_left: "voicemail_left",
    wrong_number: "call_completed",
    callback_requested: "callback_requested",
    contacted: "contacted",
    appointment_scheduled: "appointment_scheduled",
    demo_requested: "demo_requested",
    proposal_requested: "proposal_requested",
    not_interested: "lead_lost",
    no_budget: "lead_lost",
    later: "call_completed",
    already_helped: "lead_lost",
    business_closed: "lead_lost",
  })[outcome] || "call_completed";
}

function operationalLeadGroup(lead = {}) {
  const outcome = cleanText(lead.lastCallOutcome || lead.last_call_outcome || lead.metadata?.lastCallOutcome);
  return ["interested", "not_interested", "voicemail_left", "callback_requested"].includes(outcome) ? outcome : "";
}

function nextBusinessDateIso(days = 0) {
  if (!days) return "";
  const date = new Date();
  let remaining = Number(days) || 0;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}

function leadActionConflict(lead = {}, admin = {}) {
  const role = normalizeRole(admin.role);
  if (managerRoles.has(role)) return null;
  if (terminalLeadStatuses.has(lead.leadStatus)) {
    return { code: "lead_closed", message: "Deze lead is al gesloten en kan niet meer worden opgevolgd." };
  }
  const adminTokens = [admin.id, admin.profileId, admin.email].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
  const ownerTokens = leadOwnerTokens(lead);
  if (ownerTokens.length && !ownerTokens.some((token) => adminTokens.includes(token))) {
    return {
      code: "assigned_to_other",
      message: `Deze lead wordt al behandeld door ${lead.assignedUserName || lead.ownerName || lead.assignedUserEmail || "een collega"}.`,
      ownerName: lead.assignedUserName || lead.ownerName || "",
      ownerEmail: lead.assignedUserEmail || lead.ownerEmail || "",
      lastActivityAt: lead.lastActivityAt || "",
    };
  }
  const recent = lead.lastContactedAt ? new Date(lead.lastContactedAt) : null;
  if (recent && !Number.isNaN(recent.getTime()) && Date.now() - recent.getTime() < 5 * 60 * 1000 && lead.lastContactedBy && !adminTokens.includes(cleanText(lead.lastContactedBy).toLowerCase())) {
    return {
      code: "recent_contact_by_other",
      message: "Deze lead is net door een collega opgevolgd.",
      lastActivityAt: lead.lastContactedAt,
    };
  }
  return null;
}

function leadOwnerTokens(lead = {}) {
  const assignmentTokens = [
    lead.assignedTo,
    lead.assignedUserId,
    lead.assignedUserEmail,
    lead.medewerkerEmail,
    lead.employeeEmail,
    lead.assignedToEmail,
    lead.userEmail,
    lead.salesPartnerEmail,
    lead.metadata?.assignedTo,
    lead.metadata?.assigned_to,
    lead.metadata?.assignedUserId,
    lead.metadata?.assigned_user_id,
    lead.metadata?.assignedUserEmail,
    lead.metadata?.assigned_user_email,
    lead.metadata?.medewerkerEmail,
    lead.metadata?.medewerker_email,
    lead.metadata?.employeeEmail,
    lead.metadata?.employee_email,
    lead.metadata?.assignedToEmail,
    lead.metadata?.assigned_to_email,
    lead.metadata?.userEmail,
    lead.metadata?.user_email,
    lead.metadata?.salesPartnerEmail,
    lead.metadata?.sales_partner_email,
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
  if (assignmentTokens.length) return assignmentTokens;
  return [
    lead.ownerAuthUserId,
    lead.ownerEmail,
    lead.metadata?.ownerAuthUserId,
    lead.metadata?.owner_auth_user_id,
    lead.metadata?.ownerEmail,
    lead.metadata?.owner_email,
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
}

function isLeadVisibleForAdmin(lead = {}, admin = {}) {
  if (managerRoles.has(normalizeRole(admin.role))) return true;
  if (normalizeRole(admin.role) !== "sales_partner") return false;
  const adminTokens = [admin.id, admin.profileId, admin.email].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
  const ownerTokens = leadOwnerTokens(lead);
  if (!ownerTokens.length && ["interesting", "new"].includes(lead.leadStatus)) return true;
  return ownerTokens.some((token) => adminTokens.includes(token));
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

function websiteAnalysisScore(analysis = null) {
  if (!analysis || typeof analysis !== "object" || !analysis.ok) return null;
  const score = Number(analysis.score);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
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
      ...corsHeaders({ methods: "GET, POST, PATCH, DELETE, OPTIONS" }),
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

exports._test = { acquisitionChannels, callOutcomes, leadPayload, mapLead, operationalLeadGroup, readLeadRows, validateLeadAssignee };
