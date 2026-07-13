const { createJourneyLogger } = require("./logger");

function createClientJourneyReadRepository(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "journey_client_repository" });
  const config = supabaseConfig(env);
  return {
    resolveCustomer: (authUserId) => resolveCustomer({ authUserId, config, fetchImpl }),
    readSnapshot: (customer) => readSnapshot({ customer, config, fetchImpl, log }),
  };
}

async function resolveCustomer({ authUserId, config, fetchImpl }) {
  if (!config.available) throw repositoryError("missing_supabase_config", 500);
  const userId = uuid(authUserId);
  if (!userId) throw repositoryError("invalid_authenticated_user", 401);
  const [directRows, profile] = await Promise.all([
    readRows(fetchImpl, config, "customers", query({ select: CUSTOMER_SELECT, auth_user_id: `eq.${userId}`, order: "updated_at.desc", limit: "10" })),
    readOne(fetchImpl, config, "profiles", query({ select: "id,auth_user_id,status,role", auth_user_id: `eq.${userId}`, limit: "1" })),
  ]);
  if (profile && !isProfileActive(profile)) return null;
  const direct = directRows.find(isCustomerActive);
  if (direct?.id) return direct;
  if (!profile?.id) return null;
  const profileRows = await readRows(fetchImpl, config, "customers", query({ select: CUSTOMER_SELECT, profile_id: `eq.${uuid(profile.id)}`, order: "updated_at.desc", limit: "10" }));
  return profileRows.find(isCustomerActive) || null;
}

async function readSnapshot({ customer, config, fetchImpl, log }) {
  if (!config.available) throw repositoryError("missing_supabase_config", 500);
  const customerId = uuid(customer?.id);
  if (!customerId) throw repositoryError("customer_not_found", 403);
  const instanceResult = await safeRead(fetchImpl, config, "journey_instances", query({
    select: "id,definition_id,customer_id,project_id,product_code,journey_type,definition_version,current_phase,current_step,status,environment,metadata,started_at,completed_at,cancelled_at,updated_at,assignee_auth_user_id",
    customer_id: `eq.${customerId}`, order: "updated_at.desc", limit: "1",
  }));
  const instance = instanceResult.rows[0] || null;
  const [definitionResult, projectResult, invoiceResult, demoResult, assigneeResult] = await Promise.all([
    instance?.definition_id ? safeRead(fetchImpl, config, "journey_definitions", query({ select: "id,definition_key,version,product_code,journey_type,status", id: `eq.${uuid(instance.definition_id)}`, limit: "1" })) : emptyRead(),
    safeRead(fetchImpl, config, "projects", query({ select: "id,customer_id,status,phase,progress,environment,metadata,created_at,updated_at", customer_id: `eq.${customerId}`, order: "updated_at.desc", limit: "1" })),
    readInvoiceForCustomer(fetchImpl, config, customer),
    safeRead(fetchImpl, config, "demo_journeys", query({ select: "id,lead_id,customer_id,business_name,demo_status,preview_generated_at,environment,created_at,updated_at", customer_id: `eq.${customerId}`, order: "updated_at.desc", limit: "1" })),
    instance?.assignee_auth_user_id ? safeRead(fetchImpl, config, "profiles", query({ select: "id,auth_user_id,name,email,role,status,metadata", auth_user_id: `eq.${uuid(instance.assignee_auth_user_id)}`, limit: "1" })) : emptyRead(),
  ]);
  const demo = demoResult.rows[0] || null;
  const leadResult = demo?.lead_id
    ? await safeRead(fetchImpl, config, "leads", query({ select: "id,company_name,status,source,environment,metadata,created_at,updated_at", id: `eq.${uuid(demo.lead_id)}`, limit: "1" }))
    : emptyRead();
  if (!instanceResult.available) log.info("client_journey_table_unavailable", { operation: "client_snapshot", result: "fallback", source: "legacy_estimate", reason: instanceResult.reason });
  return {
    journeyTablesAvailable: instanceResult.available,
    instance,
    definition: definitionResult.rows[0] || null,
    customer,
    project: projectResult.rows[0] || null,
    invoice: invoiceResult.rows[0] || null,
    demo,
    lead: leadResult.rows[0] || null,
    assignee: assigneeResult.rows[0] || null,
  };
}

async function readInvoiceForCustomer(fetchImpl, config, customer) {
  const profileId = uuid(customer.profile_id);
  const authUserId = uuid(customer.auth_user_id);
  if (profileId) {
    const result = await safeRead(fetchImpl, config, "customer_invoices", query({ select: "id,profile_id,customer_auth_user_id,status,mollie_payment_status,paid_at,notes,created_at,updated_at", profile_id: `eq.${profileId}`, order: "updated_at.desc", limit: "1" }));
    if (result.rows.length || !authUserId) return result;
  }
  return authUserId ? safeRead(fetchImpl, config, "customer_invoices", query({ select: "id,profile_id,customer_auth_user_id,status,mollie_payment_status,paid_at,notes,created_at,updated_at", customer_auth_user_id: `eq.${authUserId}`, order: "updated_at.desc", limit: "1" })) : emptyRead();
}

async function safeRead(fetchImpl, config, table, search) {
  try { return { available: true, reason: null, rows: await readRows(fetchImpl, config, table, search) }; }
  catch (error) {
    if (isMissingRelationError(error)) return { available: false, reason: "table_missing", rows: [] };
    return { available: false, reason: "table_read_failed", rows: [] };
  }
}

async function readOne(fetchImpl, config, table, search) { return (await readRows(fetchImpl, config, table, search))[0] || null; }
async function readRows(fetchImpl, config, table, search) {
  if (typeof fetchImpl !== "function") throw repositoryError("missing_fetch", 500);
  let response;
  try { response = await fetchImpl(`${config.url}/rest/v1/${table}?${search}`, { headers: restHeaders(config.key) }); }
  catch { throw repositoryError("request_failed", 503); }
  const body = await response.text();
  let data = null;
  try { data = body ? JSON.parse(body) : []; } catch { throw repositoryError("invalid_response", 502); }
  if (!response.ok) {
    const error = repositoryError(text(data?.code || "request_failed"), response.status || 500);
    error.details = text(data?.details || data?.message);
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function query(values) { const search = new URLSearchParams(); Object.entries(values).forEach(([key, value]) => { if (value) search.set(key, value); }); return search.toString(); }
function emptyRead() { return { available: true, reason: null, rows: [] }; }
function supabaseConfig(env) { const url = text(env?.SUPABASE_URL).replace(/\/$/, ""); const key = text(env?.SUPABASE_SERVICE_ROLE_KEY); return { available: Boolean(/^https:\/\/[^/]+\.supabase\.co$/i.test(url) && key), url, key }; }
function restHeaders(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public" }; }
function isMissingRelationError(error = {}) { const details = text(error.details).toLowerCase(); return error.statusCode === 404 || ["42P01", "PGRST205"].includes(error.code) || details.includes("schema cache") || details.includes("does not exist") || details.includes("could not find the table"); }
function repositoryError(code, statusCode) { const error = new Error("Journey client read failed."); error.name = "JourneyClientRepositoryError"; error.code = code; error.statusCode = statusCode; return error; }
function uuid(value) { const id = text(value); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : ""; }
function text(value) { return String(value || "").trim(); }
function isProfileActive(profile = {}) { const status = text(profile.status || "active").toLowerCase(); const role = text(profile.role || "customer").toLowerCase(); return status === "active" && (!role || role === "customer"); }
function isCustomerActive(customer = {}) { const inactive = new Set(["disabled", "archived", "deleted", "inactive"]); return !inactive.has(text(customer.status).toLowerCase()) && !inactive.has(text(customer.portal_status).toLowerCase()); }

const CUSTOMER_SELECT = "id,auth_user_id,profile_id,name,company,company_name,package,status,portal_status,environment,metadata,created_at,updated_at";

module.exports = { createClientJourneyReadRepository, _private: { isCustomerActive, isMissingRelationError, isProfileActive, query, safeRead } };
