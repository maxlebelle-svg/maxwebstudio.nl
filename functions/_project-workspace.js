const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function workspaceSlugFor({ businessName = "", websiteUrl = "" } = {}) {
  const source = cleanText(businessName) || hostnameFor(websiteUrl) || "demo-project";
  return safeSlug(source) || "demo-project";
}

function zipFilenameFor({ businessName = "", websiteUrl = "", version = 1 } = {}) {
  const slug = workspaceSlugFor({ businessName, websiteUrl });
  const previewVersion = Math.max(1, Number(version || 1));
  return `${slug}-preview-v${previewVersion}.zip`;
}

async function upsertProjectWorkspace(context = {}, payload = {}) {
  const supabaseUrl = cleanText(context.supabaseUrl).replace(/\/$/, "");
  const serviceRoleKey = cleanText(context.serviceRoleKey);
  const demoJourneyId = cleanText(payload.demoJourneyId || payload.demo_journey_id);
  if (!supabaseUrl || !serviceRoleKey || !demoJourneyId) return null;

  const baseSlug = workspaceSlugFor({
    businessName: payload.businessName || payload.business_name,
    websiteUrl: payload.websiteUrl || payload.website_url,
  });
  const now = new Date().toISOString();
  const latestZipFilename = cleanText(payload.latestZipFilename || payload.latest_zip_filename);
  const latestPreviewUrl = cleanText(payload.latestPreviewUrl || payload.latest_preview_url);
  const latestPreviewVersion = numericOrNull(payload.latestPreviewVersion || payload.latest_preview_version);
  const baseRecord = {
    lead_id: cleanUuid(payload.leadId || payload.lead_id) || null,
    customer_id: cleanUuid(payload.customerId || payload.customer_id) || null,
    demo_journey_id: demoJourneyId,
    business_name: cleanText(payload.businessName || payload.business_name),
    website_url: cleanText(payload.websiteUrl || payload.website_url),
    workspace_title: cleanText(payload.workspaceTitle || payload.workspace_title || payload.businessName || payload.business_name || hostnameFor(payload.websiteUrl || payload.website_url) || "Projectruimte"),
    storage_provider: cleanText(payload.storageProvider || payload.storage_provider || "internal"),
    updated_by: cleanText(payload.updatedBy || payload.updated_by || context.admin?.id) || null,
    updated_at: now,
  };
  if (latestZipFilename) baseRecord.latest_zip_filename = latestZipFilename;
  if (latestPreviewUrl) baseRecord.latest_preview_url = latestPreviewUrl;
  if (latestPreviewVersion) baseRecord.latest_preview_version = latestPreviewVersion;
  if (!baseRecord.business_name) baseRecord.business_name = baseRecord.workspace_title;
  baseRecord.storage_path = cleanText(payload.storagePath || payload.storage_path) || `projects/${baseSlug}/`;

  try {
    const existing = await readWorkspaceByJourney(context, demoJourneyId);
    if (existing?.id) {
      const record = {
        ...baseRecord,
        workspace_slug: cleanText(existing.workspace_slug) || baseSlug,
        storage_path: cleanText(existing.storage_path) || `projects/${cleanText(existing.workspace_slug) || baseSlug}/`,
      };
      const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/project_workspaces?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        headers: { ...restHeaders(serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      return normalizeProjectWorkspace(rows[0] || existing);
    }

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const slug = attempt ? `${baseSlug}-${attempt + 1}` : baseSlug;
      const record = {
        ...baseRecord,
        workspace_slug: slug,
        storage_path: `projects/${slug}/`,
        created_by: cleanText(payload.createdBy || payload.created_by || context.admin?.id) || null,
        created_at: now,
      };
      try {
        const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/project_workspaces`, {
          method: "POST",
          headers: { ...restHeaders(serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
          body: JSON.stringify(record),
        });
        return normalizeProjectWorkspace(rows[0] || {});
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }
    }
    return null;
  } catch (error) {
    if (isMissingWorkspaceTableError(error)) return null;
    throw error;
  }
}

async function readProjectWorkspace(context = {}, { demoJourneyId = "" } = {}) {
  const id = cleanText(demoJourneyId);
  if (!id) return null;
  try {
    const row = await readWorkspaceByJourney(context, id);
    return row ? normalizeProjectWorkspace(row) : null;
  } catch (error) {
    if (isMissingWorkspaceTableError(error)) return null;
    throw error;
  }
}

function normalizeProjectWorkspace(row = {}) {
  if (!row?.id) return null;
  return {
    id: cleanText(row.id),
    leadId: cleanText(row.lead_id),
    customerId: cleanText(row.customer_id),
    demoJourneyId: cleanText(row.demo_journey_id),
    businessName: cleanText(row.business_name),
    websiteUrl: cleanText(row.website_url),
    workspaceSlug: cleanText(row.workspace_slug),
    workspaceTitle: cleanText(row.workspace_title),
    storageProvider: cleanText(row.storage_provider),
    storagePath: cleanText(row.storage_path),
    driveFolderUrl: cleanText(row.drive_folder_url),
    latestZipFilename: cleanText(row.latest_zip_filename),
    latestPreviewUrl: cleanText(row.latest_preview_url),
    latestPreviewVersion: row.latest_preview_version === null || row.latest_preview_version === undefined ? null : Number(row.latest_preview_version),
    createdBy: cleanText(row.created_by),
    updatedBy: cleanText(row.updated_by),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

async function readWorkspaceByJourney(context = {}, demoJourneyId = "") {
  const supabaseUrl = cleanText(context.supabaseUrl).replace(/\/$/, "");
  const serviceRoleKey = cleanText(context.serviceRoleKey);
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/project_workspaces?select=*&demo_journey_id=eq.${encodeURIComponent(cleanText(demoJourneyId))}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return rows[0] || null;
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
      error.responseText = text;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    error.hint = data?.hint || "";
    error.responseText = text;
    error.responseJson = data;
    throw error;
  }
  return Array.isArray(data) ? data : [];
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

function hostnameFor(value = "") {
  const text = cleanText(value);
  if (!text) return "";
  try {
    return new URL(text.startsWith("http") ? text : `https://${text}`).hostname.replace(/^www\./, "");
  } catch {
    return text.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
}

function safeSlug(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function isMissingWorkspaceTableError(error = {}) {
  const message = `${error.message || ""} ${error.details || ""}`.toLowerCase();
  return error.code === "42P01" || message.includes("project_workspaces") && (message.includes("does not exist") || message.includes("schema cache"));
}

function isUniqueConflict(error = {}) {
  return error.code === "23505" || /duplicate key|unique constraint/i.test(`${error.message || ""} ${error.details || ""}`);
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function cleanUuid(value = "") {
  const text = cleanText(value);
  return uuidPattern.test(text) ? text : "";
}

module.exports = {
  normalizeProjectWorkspace,
  readProjectWorkspace,
  safeSlug,
  upsertProjectWorkspace,
  workspaceSlugFor,
  zipFilenameFor,
};
