const { verifyAdmin } = require("./_admin-auth");

const BUCKET = "relationship-assets";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "sales", "designer", "developer", "support"];
const ACTIONS = Object.freeze({
  approve: { status: "approved" },
  reject: { status: "rejected" },
  review: { status: "reviewing" },
  archive: { status: "archived" },
  primary: { status: "approved", primary: true, brandingRole: "primary_logo" },
  branding: { status: "reviewing", brandingRole: "logo" },
  website: { status: "reviewing", websiteRole: "content_asset" },
});

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { success: false, code: "INVALID_METHOD", error: "Deze actie wordt niet ondersteund." });
  const auth = await verifyAdmin(event, json, { module: "relationship_assets", action: event.httpMethod === "GET" ? "read" : "review", allowedRoles: STAFF_ROLES });
  if (!auth.success) return auth.response;
  try {
    const context = config();
    if (event.httpMethod === "GET") {
      const params = queryParams(event);
      const downloadId = clean(params.get("download"));
      if (downloadId) return downloadAsset(context, downloadId, params);
      return listAssets(context, params);
    }
    return updateAsset(context, auth.admin || {}, JSON.parse(event.body || "{}"));
  } catch (error) {
    console.error("Admin relationship asset failed", {
      errorName: error.name || "Error",
      errorMessage: error.technicalMessage || error.message || "unknown",
      phase: error.phase || "admin_assets",
      databaseCode: error.databaseCode || null,
      details: error.details || null,
      hint: error.hint || null,
    });
    return json(error.status || 500, { success: false, code: error.code || "INTERNAL_ERROR", error: error.status ? error.message : "De assetbibliotheek kon niet worden verwerkt." });
  }
};

async function listAssets(context, params) {
  const relationship = relationshipFrom(params);
  if (!relationship) return json(400, { success: false, code: "RELATIONSHIP_REQUIRED", error: "Selecteer eerst een actieve lead of klant." });
  const column = relationship.relationshipType === "lead" ? "lead_id" : "customer_id";
  const filter = `&${column}=eq.${encodeURIComponent(relationship.relationshipId)}`;
  const customerFilter = relationship.relationshipType === "customer" ? `&id=eq.${encodeURIComponent(relationship.relationshipId)}` : "&id=eq.00000000-0000-0000-0000-000000000000";
  const relatedFilter = relationship.relationshipType === "customer" ? `&customer_id=eq.${encodeURIComponent(relationship.relationshipId)}` : "&customer_id=eq.00000000-0000-0000-0000-000000000000";
  const [files, customers, projects, websites] = await Promise.all([
    rest(context, `files?select=id,customer_id,lead_id,name,original_filename,mime_type,size_bytes,category,status,uploaded_by_type,is_primary,is_client_visible,metadata,created_at,updated_at&order=created_at.desc&limit=300${filter}`, { method: "GET", phase: "list_files" }),
    rest(context, `customers?select=id,name,company&order=updated_at.desc&limit=1${customerFilter}`, { method: "GET", phase: "list_customers" }),
    restOptional(context, `projects?select=id,customer_id,name,status&order=updated_at.desc&limit=50${relatedFilter}`, "list_projects"),
    restOptional(context, `websites?select=id,customer_id,name,domain,status&order=updated_at.desc&limit=50${relatedFilter}`, "list_websites"),
  ]);
  const customerMap = new Map((customers || []).map((row) => [row.id, clean(row.company || row.name) || "Klant"]));
  const projectMap = firstByCustomer(projects);
  const websiteMap = firstByCustomer(websites);
  const assets = (Array.isArray(files) ? files : []).map((row) => ({ ...safe(row, {
    customerName: customerMap.get(row.customer_id) || "Onbekende klant",
    project: projectMap.get(row.customer_id) || null,
    website: websiteMap.get(row.customer_id) || null,
  }), downloadUrl: `/api/admin-relationship-assets?download=${encodeURIComponent(row.id)}&relationshipType=${relationship.relationshipType}&relationshipId=${encodeURIComponent(relationship.relationshipId)}` }));
  return json(200, { success: true, relationship, assets, filters: buildFilters(assets) });
}

async function updateAsset(context, admin, input) {
  const assetId = clean(input.assetId);
  const action = clean(input.action).toLowerCase();
  const definition = ACTIONS[action];
  if (!UUID.test(assetId) || !definition) return json(400, { success: false, code: "INVALID_ACTION", error: "Kies een geldige assetactie." });
  const asset = (await rest(context, `files?select=*&id=eq.${assetId}&limit=1`, { method: "GET", phase: "find_asset" }))?.[0];
  if (!asset) return json(404, { success: false, code: "NOT_FOUND", error: "Dit bestand bestaat niet meer." });
  const relationship = relationshipFrom(input);
  if (!relationship) return json(400, { success: false, code: "RELATIONSHIP_REQUIRED", error: "Selecteer eerst een actieve lead of klant." });
  const assetRelationshipId = relationship.relationshipType === "lead" ? asset.lead_id : asset.customer_id;
  if (assetRelationshipId !== relationship.relationshipId) return json(409, { success: false, code: "CONTEXT_MISMATCH", error: "Dit bestand hoort niet bij deze werkruimte." });
  if (definition.primary) {
    const relationshipFilter = asset.customer_id ? `customer_id=eq.${asset.customer_id}` : `lead_id=eq.${asset.lead_id}`;
    await rest(context, `files?${relationshipFilter}&is_primary=eq.true`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_primary: false, updated_at: new Date().toISOString() }), phase: "clear_primary" });
  }
  const currentMetadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  const preserveApproved = ["branding", "website"].includes(action) && clean(asset.status).toLowerCase() === "approved";
  const update = {
    status: preserveApproved ? "approved" : definition.status,
    is_primary: definition.primary ? true : Boolean(asset.is_primary),
    updated_at: new Date().toISOString(),
    metadata: {
      ...currentMetadata,
      reviewedByAuthUserId: admin.id || null,
      rejectionReason: action === "reject" ? clean(input.reason).slice(0, 500) : null,
      brandingRole: definition.brandingRole || currentMetadata.brandingRole || null,
      websiteRole: definition.websiteRole || currentMetadata.websiteRole || null,
      usedInBranding: Boolean(definition.brandingRole || currentMetadata.usedInBranding),
      usedForWebsite: Boolean(definition.websiteRole || currentMetadata.usedForWebsite),
    },
  };
  const rows = await rest(context, `files?id=eq.${assetId}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(update), phase: "update_asset" });
  await timeline(context, asset, admin, action);
  return json(200, { success: true, asset: safe(rows?.[0] || { ...asset, ...update }) });
}

function relationshipFrom(input = {}) {
  const get = (key) => typeof input.get === "function" ? input.get(key) : input[key];
  const relationshipType = clean(get("relationshipType") || (get("leadId") ? "lead" : get("customerId") ? "customer" : "")).toLowerCase();
  const relationshipId = clean(get("relationshipId") || (relationshipType === "lead" ? get("leadId") : get("customerId")));
  if (!['lead', 'customer'].includes(relationshipType) || !UUID.test(relationshipId)) return null;
  return { relationshipType, relationshipId };
}

async function downloadAsset(context, assetId, params) {
  if (!UUID.test(assetId)) return json(400, { success: false, code: "INVALID_ASSET", error: "Kies een geldig bestand." });
  const relationship = relationshipFrom(params);
  if (!relationship) return json(400, { success: false, code: "RELATIONSHIP_REQUIRED", error: "Selecteer eerst een actieve lead of klant." });
  const asset = (await rest(context, `files?select=id,customer_id,lead_id,name,original_filename,storage_path,mime_type,status&id=eq.${assetId}&limit=1`, { method: "GET", phase: "download_lookup" }))?.[0];
  if (!asset?.storage_path || ["archived", "replaced", "deleted"].includes(clean(asset.status).toLowerCase())) return json(404, { success: false, code: "NOT_FOUND", error: "Dit bestand is niet beschikbaar." });
  const assetRelationshipId = relationship.relationshipType === "lead" ? asset.lead_id : asset.customer_id;
  if (assetRelationshipId !== relationship.relationshipId) return json(404, { success: false, code: "NOT_FOUND", error: "Dit bestand is niet beschikbaar." });
  const result = await fetch(`${context.url}/storage/v1/object/sign/${BUCKET}/${encodeStoragePath(asset.storage_path)}`, {
    method: "POST",
    headers: serviceHeaders(context),
    body: JSON.stringify({ expiresIn: 60 }),
  });
  const data = await result.json().catch(() => null);
  if (!result.ok || !clean(data?.signedURL || data?.signedUrl || data?.url)) throw upstream("SIGNED_DOWNLOAD_FAILED", 502, "Het bestand kan tijdelijk niet worden geopend.", "sign_download", result, data);
  const signedPath = clean(data.signedURL || data.signedUrl || data.url);
  const location = new URL(signedPath.startsWith("http") ? signedPath : `${context.url}/storage/v1${signedPath}`);
  location.searchParams.set("download", safeDownloadName(asset.original_filename || asset.name));
  return { statusCode: 302, headers: { Location: location.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }, body: "" };
}

async function timeline(context, asset, admin, action) {
  try {
    await rest(context, "customer_timeline_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        customer_id: asset.customer_id || null,
        lead_id: asset.lead_id || null,
        user_id: admin.id || null,
        event_type: `asset_${action}`,
        title: "Merkasset bijgewerkt",
        module: "asset_manager",
        reference_type: "file",
        reference_id: asset.id,
        metadata: { category: asset.category, action },
      }),
      phase: "asset_timeline",
    });
  } catch (error) {
    console.warn("Admin asset timeline skipped", { phase: "asset_timeline", errorMessage: error.technicalMessage || error.message });
  }
}

function safe(row = {}, context = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    customerId: row.customer_id || null,
    customerName: context.customerName || null,
    name: clean(row.original_filename || row.name) || "Bestand",
    mimeType: clean(row.mime_type).toLowerCase(),
    sizeBytes: Number(row.size_bytes || 0),
    category: clean(row.category) || "other",
    status: clean(row.status) || "new",
    uploadedByType: clean(row.uploaded_by_type) || "admin",
    description: clean(metadata.description),
    isPrimary: Boolean(row.is_primary),
    brandingRole: clean(metadata.brandingRole),
    websiteRole: clean(metadata.websiteRole),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || row.created_at || null,
    project: context.project ? { name: clean(context.project.name), status: clean(context.project.status) } : null,
    website: context.website ? { name: clean(context.website.name || context.website.domain), status: clean(context.website.status) } : null,
    previewAvailable: /^image\/(?:jpeg|png|webp|svg\+xml)$/.test(clean(row.mime_type).toLowerCase()),
    downloadUrl: `/api/admin-relationship-assets?download=${encodeURIComponent(row.id)}`,
  };
}

function buildFilters(assets) {
  const unique = (key) => [...new Set(assets.map((asset) => clean(asset[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl"));
  return { customers: unique("customerName"), categories: unique("category"), statuses: unique("status"), mimeTypes: unique("mimeType") };
}
function firstByCustomer(rows) { const map = new Map(); (rows || []).forEach((row) => { if (row.customer_id && !map.has(row.customer_id)) map.set(row.customer_id, row); }); return map; }
async function restOptional(context, path, phase) { try { return await rest(context, path, { method: "GET", phase }); } catch { return []; } }
async function rest(context, path, options = {}) {
  const { phase = "database", headers = {}, ...request } = options;
  const response = await fetch(`${context.url}/rest/v1/${path}`, { ...request, headers: serviceHeaders(context, headers) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw upstream("DATA_FAILED", response.status >= 500 ? 502 : 500, "Assetgegevens konden niet worden verwerkt.", phase, response, data);
  return data;
}
function upstream(code, status, message, phase, response, data) { return Object.assign(new Error(message), { code, status, phase, databaseCode: clean(data?.code), technicalMessage: clean(data?.message || data?.msg), details: clean(data?.details), hint: clean(data?.hint), upstreamStatus: response?.status }); }
function serviceHeaders(context, extra = {}) { return { apikey: context.key, Authorization: `Bearer ${context.key}`, Accept: "application/json", "Content-Type": "application/json", ...extra }; }
function config() { const url = clean(process.env.SUPABASE_URL).replace(/\/$/, ""); const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY); if (!url || !key) throw Object.assign(new Error("Assetbeheer is tijdelijk niet beschikbaar."), { status: 503 }); return { url, key }; }
function queryParams(event) { if (event.rawQuery) return new URLSearchParams(event.rawQuery); const params = new URLSearchParams(); Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => { if (value != null) params.set(key, value); }); return params; }
function encodeStoragePath(value) { return clean(value).split("/").map(encodeURIComponent).join("/"); }
function safeDownloadName(value) { return clean(value || "bestand").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "-").slice(0, 255) || "bestand"; }
function clean(value) { return String(value ?? "").trim(); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }

exports._test = { safe, ACTIONS, buildFilters, safeDownloadName };
