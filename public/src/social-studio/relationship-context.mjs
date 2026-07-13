const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RelationshipContextIsolationError extends Error {
  constructor(message = "Relatiecontext komt niet overeen.") {
    super(message);
    this.name = "RelationshipContextIsolationError";
    this.code = "CONTEXT_MISMATCH";
  }
}

function clean(value) { return String(value || "").trim(); }

export function relationshipScope(relationship) {
  if (!relationship) return { scopeId: "internal:max-webstudio", entityType: "internal", relationshipId: null };
  const entityType = clean(relationship.entityType).toLowerCase();
  const relationshipId = clean(entityType === "lead" ? relationship.leadId : relationship.customerId);
  if (!["lead", "customer"].includes(entityType) || !UUID.test(relationshipId)) throw new RelationshipContextIsolationError("Ongeldige actieve relatie.");
  return { scopeId: `${entityType}:${relationshipId}`, entityType, relationshipId };
}

export function assertRelationshipWorkspace(scope, payload = {}) {
  if (scope.entityType === "internal") return true;
  const relationship = payload.relationship || {};
  const responseId = clean(relationship.relationshipId || (scope.entityType === "lead" ? relationship.leadId : relationship.customerId));
  if (relationship.entityType !== scope.entityType || responseId !== scope.relationshipId) throw new RelationshipContextIsolationError();
  const linked = payload.linkedRecords || {};
  for (const row of [...(linked.websites || []), ...(linked.projects || []), ...(linked.assets || [])]) {
    const rowId = clean(scope.entityType === "lead" ? row.lead_id || row.leadId : row.customer_id || row.customerId);
    if (rowId && rowId !== scope.relationshipId) throw new RelationshipContextIsolationError("Gekoppelde data hoort bij een andere relatie.");
  }
  return true;
}

export function buildRelationshipContext({ scope, activeRelationship, workspace = {}, centralBranding = null, contentItems = [] } = {}) {
  const internal = scope.entityType === "internal";
  if (!internal) assertRelationshipWorkspace(scope, workspace);
  const linked = workspace.linkedRecords || {};
  const relationship = internal ? {
    entityType: "internal", companyName: "Max Webstudio", websiteUrl: "https://maxwebstudio.nl",
  } : { ...(workspace.relationship || activeRelationship || {}) };
  const website = linked.website || linked.websites?.[0] || {};
  const project = linked.project || linked.projects?.[0] || {};
  const approvedAssets = (linked.assets || []).filter((asset) => ["approved", "ready"].includes(clean(asset.status).toLowerCase()));
  const metadata = relationship.metadata || {};
  return {
    scopeId: scope.scopeId,
    source: internal ? "max-webstudio-default" : "secured-relationship-workspace",
    relationship,
    brand: {
      brandName: clean(relationship.companyName || centralBranding?.companyName || "Max Webstudio"),
      industry: clean(metadata.industry || project.industry || website.industry),
      audience: clean(metadata.targetAudience || project.target_audience || centralBranding?.briefing?.audience),
      colors: centralBranding?.colors || [],
      toneOfVoice: clean(centralBranding?.briefing?.toneOfVoice),
      region: clean(metadata.region || project.region),
      services: centralBranding?.briefing?.services || metadata.services || [],
    },
    website: { id: website.id || null, url: clean(relationship.websiteUrl || website.url || website.domain), status: clean(website.status) },
    project: { id: project.id || null, name: clean(project.name || project.title), status: clean(project.status) },
    contact: { email: clean(relationship.email), phone: clean(relationship.phone) },
    assets: approvedAssets.map((asset) => ({ id: asset.id, name: asset.name || asset.assetName || "Asset", category: asset.category || "Asset", status: asset.status })),
    previousContent: contentItems.filter((item) => item.scopeId === scope.scopeId).slice(0, 20),
  };
}

export function contextChips(context = {}) {
  const chips = [];
  if (context.brand?.industry) chips.push({ label: "Branche", value: context.brand.industry });
  if (context.brand?.region) chips.push({ label: "Regio", value: context.brand.region });
  if (context.brand?.toneOfVoice) chips.push({ label: "Tone", value: context.brand.toneOfVoice });
  for (const service of context.brand?.services || []) chips.push({ label: "Dienst", value: service });
  for (const asset of context.assets || []) chips.push({ label: "Asset", value: asset.category || asset.name });
  if (!chips.length) chips.push({ label: "Profiel", value: context.brand?.brandName || "Max Webstudio" });
  return chips.slice(0, 10);
}

function sessionToken(storage) {
  for (const key of ["maxwebstudioSupabaseAuthSession", "mws_admin_supabase_session"]) {
    try {
      const value = JSON.parse(storage.getItem(key) || "null");
      const token = value?.access_token || value?.accessToken;
      if (token) return token;
    } catch { /* ignore invalid local session */ }
  }
  return "";
}

export async function loadRelationshipWorkspace(activeRelationship, { fetchImpl = fetch, storage = localStorage } = {}) {
  const scope = relationshipScope(activeRelationship);
  if (scope.entityType === "internal") return { scope, workspace: {}, activeRelationship: null };
  const token = sessionToken(storage);
  if (!token) throw new Error("Adminsessie ontbreekt.");
  const query = new URLSearchParams({ entityType: scope.entityType, id: scope.relationshipId });
  const response = await fetchImpl(`/api/admin-relationship-workspace?${query}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || "Relatiecontext kon niet worden geladen.");
  assertRelationshipWorkspace(scope, data);
  return { scope, workspace: data, activeRelationship };
}

export function readCentralBranding(scope, storage = localStorage) {
  if (scope.entityType === "internal") return null;
  try {
    const state = JSON.parse(storage.getItem("maxwebstudioBrandCenter") || "{}");
    return (state.projects || []).find((project) => clean(project.customerId) === scope.relationshipId) || null;
  } catch { return null; }
}
