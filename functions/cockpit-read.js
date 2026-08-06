const crypto = require("node:crypto");
const { isValidPublicSlug, publicPreviewUrl } = require("./_public-preview");

const RESPONSE_VERSION = "cockpit-read-v3";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;
const OPEN_LEAD_STATUSES = new Set([
  "new", "nieuw", "lead", "bellen", "te bellen", "contact planned", "contacted",
  "qualified", "reviewing", "interesting", "assigned", "call scheduled",
  "contact attempted", "follow up", "opvolgen", "appointment scheduled",
  "demo requested", "demo building", "demo ready", "demo sent", "proposal sent",
  "negotiation", "offerte", "quote ready", "quote sent",
]);
const READY_PROPOSAL_STATUSES = new Set(["ready for review", "ready", "draft", "concept", "sent", "viewed"]);
const ATTENTION_PROJECT_STATUSES = new Set(["attention", "aandacht nodig", "blocked", "vertraagd", "delayed", "at_risk"]);

exports.handler = createHandler();
exports.createHandler = createHandler;

function createHandler(dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const env = dependencies.env || process.env;
  const now = dependencies.now || (() => new Date());

  return async function cockpitRead(event = {}) {
    const headers = responseHeaders();
    if (String(event.httpMethod || "GET").toUpperCase() !== "GET") {
      return json(405, { success: false, code: "READ_ONLY", error: "De Cockpit-koppeling is uitsluitend leesbaar." }, headers);
    }

    if (clean(header(event, "origin"))) {
      return json(403, { success: false, code: "SERVER_TO_SERVER_REQUIRED", error: "Gebruik de beveiligde serverfunctie van de Cockpit." }, headers);
    }

    const configuredToken = clean(env.COCKPIT_READ_TOKEN);
    if (configuredToken.length < 32) {
      return json(503, { success: false, code: "COCKPIT_NOT_CONFIGURED", error: "De Cockpit-koppeling is nog niet geconfigureerd." }, headers);
    }
    const suppliedToken = bearer(event);
    if (!safeEqual(suppliedToken, configuredToken)) {
      return json(401, { success: false, code: "UNAUTHORIZED", error: "Niet geautoriseerd." }, headers);
    }

    const supabaseUrl = clean(env.SUPABASE_URL).replace(/\/$/, "");
    const cockpitSecretKey = clean(env.SUPABASE_COCKPIT_SECRET_KEY);
    if (!supabaseUrl || !cockpitSecretKey || typeof fetchImpl !== "function") {
      return json(503, { success: false, code: "DATA_SOURCE_UNAVAILABLE", error: "De Cockpit-databron is nog niet beschikbaar." }, headers);
    }

    const limit = boundedLimit(event.queryStringParameters?.limit);
    const context = { fetchImpl, supabaseUrl, cockpitSecretKey };
    const resources = await Promise.all([
      safeRead("leads", () => readRows(context, "leads", { limit, order: "updated_at.desc.nullslast" })),
      safeRead("customers", () => readRows(context, "customers", { limit, order: "updated_at.desc.nullslast" })),
      safeRead("projects", () => readRows(context, "projects", { limit, order: "updated_at.desc.nullslast" })),
      safeRead("proposals", () => readRows(context, "commercial_offers", { limit, order: "updated_at.desc.nullslast" })),
      safeRead("proposalVersions", () => readRows(context, "commercial_offer_versions", { limit, order: "updated_at.desc.nullslast" })),
      safeRead("files", () => readRows(context, "files", { limit, order: "created_at.desc.nullslast" })),
      safeRead("previews", () => readRows(context, "public_preview_publications", { limit: MAX_LIMIT, order: "updated_at.desc.nullslast" })),
    ]);

    const unavailable = resources.filter((resource) => !resource.ok).map((resource) => resource.name);
    const rows = Object.fromEntries(resources.map((resource) => [resource.name, resource.rows]));
    const customers = rows.customers.filter((row) => !isDemo(row)).map(mapCustomer);
    const customerLabels = new Map(customers.map((customer) => [customer.id, customer.companyName]));
    const previewUrlsByLead = mapActiveLeadPreviewUrls(rows.previews, env.PUBLIC_PREVIEW_BASE_URL);
    const leads = rows.leads.filter((row) => !isDemo(row)).map((row) => mapLead(row, previewUrlsByLead));
    const leadLabels = new Map(leads.map((lead) => [lead.id, lead.companyName]));
    const projects = rows.projects.filter((row) => !isDemo(row)).map((row) => mapProject(row, customerLabels));
    const proposalVersions = new Map(rows.proposalVersions.map((version) => [clean(version.id), version]));
    const proposals = rows.proposals.filter((row) => !isDemo(row)).map((row) => mapProposal(row, { leadLabels, customerLabels, proposalVersions }));
    const files = rows.files.filter((row) => !isDemo(row)).map(mapFile).filter((file) => file.relationshipId);
    const generatedAt = now().toISOString();

    return json(200, {
      success: true,
      version: RESPONSE_VERSION,
      readOnly: true,
      generatedAt,
      partial: unavailable.length > 0,
      unavailable,
      summary: buildSummary({ leads, projects, proposals, generatedAt }),
      leads,
      projects,
      proposals,
      files,
    }, headers);
  };
}

function mapFile(row = {}) {
  const leadId = clean(row.lead_id);
  const customerId = clean(row.customer_id);
  const relationshipType = leadId ? "lead" : customerId ? "customer" : "";
  return compact({
    id: clean(row.id),
    relationshipType,
    relationshipId: leadId || customerId,
    name: first(row.original_filename, row.name, "Bestand"),
    mimeType: clean(row.mime_type).toLowerCase(),
    sizeBytes: safeSize(row.size_bytes),
    category: first(row.category, "document"),
    status: first(row.status, "new"),
    createdAt: iso(row.created_at),
  });
}

async function safeRead(name, reader) {
  try {
    const rows = await reader();
    return { name, ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    console.error("Cockpit read resource unavailable", { resource: name, status: error.status || 502, code: error.code || "UPSTREAM_FAILED" });
    return { name, ok: false, rows: [] };
  }
}

async function readRows(context, table, options = {}) {
  const params = new URLSearchParams({
    select: "*",
    limit: String(options.limit || DEFAULT_LIMIT),
    order: options.order || "updated_at.desc.nullslast",
  });
  const response = await context.fetchImpl(`${context.supabaseUrl}/rest/v1/${table}?${params}`, {
    method: "GET",
    headers: {
      apikey: context.cockpitSecretKey,
      Accept: "application/json",
      "Accept-Profile": "public",
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data)) {
    const error = new Error("Cockpit resource read failed.");
    error.status = response.status || 502;
    error.code = clean(data?.code) || "UPSTREAM_FAILED";
    throw error;
  }
  return data;
}

function mapLead(row = {}, previewUrlsByLead = new Map()) {
  const metadata = object(row.metadata);
  const demoUrl = previewUrlsByLead.get(clean(row.id)) || "";
  return compact({
    id: clean(row.id),
    companyName: first(row.company_name, row.company, row.business_name, row.name),
    contactName: first(row.contact_name, row.contact_person, metadata.contactName),
    email: clean(row.email).toLowerCase(),
    phone: first(row.phone, row.phone_number, metadata.phone),
    websiteUrl: first(row.website_url, row.website, metadata.websiteUrl),
    demoAvailable: Boolean(demoUrl),
    demoUrl,
    status: first(row.lead_status, row.pipeline_stage, row.status, "new"),
    priority: first(row.priority, row.lead_priority, metadata.priority, "normal"),
    nextAction: first(row.next_action, row.next_action_label, metadata.nextAction),
    nextActionAt: iso(row.next_action_at || row.follow_up_at || metadata.nextActionAt),
    lastContactAt: iso(row.last_contact_at || metadata.lastContactAt),
    updatedAt: iso(row.updated_at || row.created_at),
  });
}

function mapActiveLeadPreviewUrls(rows = [], baseUrl = "") {
  const previews = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (clean(row.relationship_type).toLowerCase() !== "lead" || row.enabled !== true || row.revoked_at) continue;
    const relationshipId = clean(row.relationship_id);
    const slug = clean(row.public_slug);
    if (!relationshipId || !isValidPublicSlug(slug) || previews.has(relationshipId)) continue;
    const url = publicPreviewUrl(slug, baseUrl || undefined);
    if (url) previews.set(relationshipId, url);
  }
  return previews;
}

function mapCustomer(row = {}) {
  return compact({
    id: clean(row.id),
    companyName: first(row.company, row.name, row.company_name),
    status: first(row.status, row.portal_status),
  });
}

function mapProject(row = {}, customerLabels = new Map()) {
  const metadata = object(row.metadata);
  const customerId = clean(row.customer_id || row.profile_id);
  return compact({
    id: clean(row.id),
    customerId,
    customerName: customerLabels.get(customerId) || "",
    name: first(row.name, row.title, row.project_name, "Project"),
    status: first(row.status, "unknown"),
    phase: first(row.phase, row.current_phase, metadata.phase),
    progress: boundedProgress(row.progress ?? metadata.progress),
    deadline: dateOnly(row.deadline || row.due_date || metadata.deadline),
    updatedAt: iso(row.updated_at || row.created_at),
  });
}

function mapProposal(row = {}, labels = {}) {
  const relationshipType = clean(row.relationship_type).toLowerCase();
  const relationshipId = clean(row.relationship_id);
  const relationshipName = relationshipType === "lead"
    ? labels.leadLabels?.get(relationshipId)
    : labels.customerLabels?.get(relationshipId);
  const currentVersionId = clean(row.current_version_id);
  const version = labels.proposalVersions?.get(currentVersionId) || {};
  const versionStatus = first(version.status);
  const hasNonBindingLines = Boolean(version.has_non_binding_lines);
  return compact({
    id: clean(row.id),
    title: first(row.title, "Voorstel"),
    status: first(row.status, "draft"),
    relationshipType,
    relationshipId,
    relationshipName: relationshipName || "",
    currentVersionId,
    versionNumber: safePositiveInteger(version.version_number),
    versionStatus,
    oneTimeExVatCents: safeCents(version.one_time_ex_vat_cents),
    recurringExVatCents: safeCents(version.recurring_ex_vat_cents),
    dueNowInclVatCents: safeCents(version.due_now_incl_vat_cents),
    hasNonBindingLines,
    sendReady: Boolean(currentVersionId && versionStatus === "ready_for_review" && !hasNonBindingLines),
    updatedAt: iso(row.updated_at || row.created_at),
  });
}

function buildSummary({ leads, projects, proposals, generatedAt }) {
  const nowMs = Date.parse(generatedAt);
  const followUpsDue = leads.filter((lead) => {
    const at = Date.parse(lead.nextActionAt || "");
    return Number.isFinite(at) && at <= nowMs && isOpenLead(lead.status);
  }).length;
  return {
    openLeads: leads.filter((lead) => isOpenLead(lead.status)).length,
    followUpsDue,
    proposalsReady: proposals.filter((proposal) => READY_PROPOSAL_STATUSES.has(normalize(proposal.status))).length,
    projectsAttention: projects.filter((project) => ATTENTION_PROJECT_STATUSES.has(normalize(project.status))).length,
  };
}

function isOpenLead(status) {
  const normalized = normalize(status);
  return OPEN_LEAD_STATUSES.has(normalized) || !["won", "lost", "customer", "closed", "archived", "verkocht", "gewonnen", "verloren"].includes(normalized);
}

function isDemo(row = {}) {
  const metadata = object(row.metadata);
  const source = normalize(row.source || metadata.source);
  const environment = normalize(row.environment || metadata.environment);
  return Boolean(row.is_demo || row.isDemo || metadata.isDemo)
    || environment === "demo"
    || source.includes("demo")
    || clean(row.email).toLowerCase().endsWith(".example");
}

function responseHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "X-MWS-Cockpit-Mode": "read-only",
  };
}

function json(statusCode, body, headers = responseHeaders()) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function bearer(event = {}) {
  const authorization = clean(header(event, "authorization"));
  return authorization.startsWith("Bearer ") ? clean(authorization.slice(7)) : "";
}

function header(event = {}, name) {
  const headers = event.headers || {};
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()] ?? "";
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function boundedLimit(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

function boundedProgress(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function safeSize(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeCents(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function safePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function dateOnly(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined;
}

function iso(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function first(...values) {
  return values.map(clean).find(Boolean) || "";
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function clean(value) {
  return String(value ?? "").trim();
}

exports._test = {
  buildSummary,
  isDemo,
  mapLead,
  mapProject,
  mapProposal,
  safeEqual,
};
