const { clean, firstName } = require("./_dca-invitation");
const { bodyWithinLimit, clearSessionCookie, isJsonRequest, readSessionCookie, sameOrigin, sha256 } = require("./_dca-exchange");
const previewRenderer = require("./client-preview-render")._private;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { success: false, error: "Methode niet toegestaan." });
  if (!sameOrigin(event) || !isJsonRequest(event) || !bodyWithinLimit(event)) return invalidSession(config().environment);
  const context = config();
  if (!context.available) return invalidSession(context.environment, 503);
  try {
    const body = JSON.parse(event.body || "{}");
    const action = clean(body.action || "open").toLowerCase();
    if (!["open", "preview"].includes(action)) return invalidSession(context.environment);
    const secret = readSessionCookie(event.headers?.cookie || event.headers?.Cookie, context.environment);
    if (!secret) return invalidSession(context.environment, 401);

    const binding = first(await rpc(context, "dca_1_resolve_exchange_session", { input_session_hash: sha256(secret) }));
    if (!binding?.invitation_id) return invalidSession(context.environment, 401);
    const journey = await one(context, "demo_journeys", `select=id,lead_id,business_name,contact_name,preview_package&id=eq.${encodeURIComponent(await journeyId(context, binding.invitation_id))}&limit=1`);
    if (!journey?.id || clean(journey.lead_id) !== clean(binding.lead_id)) return invalidLink();
    const lead = await one(context, "leads", `select=id,name,company&id=eq.${encodeURIComponent(binding.lead_id)}&limit=1`);
    if (!lead?.id) return invalidLink();
    const version = await one(context, "website_preview_versions", `select=id,demo_journey_id,version,title,generated_package,metadata&id=eq.${encodeURIComponent(binding.preview_version_id)}&limit=1`);
    if (!version?.id || clean(version.demo_journey_id) !== clean(journey.id)) return invalidLink();
    const publication = await one(context, "public_preview_publications", `select=id,relationship_type,relationship_id,preview_version_id,enabled,revoked_at&id=eq.${encodeURIComponent(binding.preview_publication_id)}&limit=1`);
    const ownershipMatches = publication?.relationship_type === "lead"
      ? clean(publication.relationship_id) === clean(binding.lead_id) && !binding.customer_id
      : publication?.relationship_type === "customer" && clean(publication.relationship_id) === clean(binding.customer_id);
    if (!publication?.id || publication.enabled !== true || publication.revoked_at || clean(publication.preview_version_id) !== clean(version.id) || !ownershipMatches) return invalidLink();

    if (action === "preview") {
      const resolved = await previewRenderer.resolvePreviewPackage(context, version);
      if (!resolved.package?.files?.length) return json(404, { success: false, error: "Deze website-preview is tijdelijk niet beschikbaar." });
      const html = previewRenderer.renderPackageHtml(resolved.package, { title: clean(version.title || journey.business_name || "Website-preview") });
      return json(200, { success: true, preview: { html } });
    }

    const workflow = journey.preview_package?.savedDemoSite?.workflow || journey.preview_package?.saved_demo_site?.workflow || {};
    return json(200, {
      success: true,
      presentation: {
        firstName: firstName(journey.contact_name || lead.name),
        companyName: clean(journey.business_name || lead.company) || "jouw bedrijf",
        status: "Wacht op jouw beoordeling",
        deliveryExpectation: clean(workflow.deliveryExpectation || workflow.delivery_expectation || "In overleg"),
        canActivate: false,
      },
    });
  } catch {
    // Deliberately omit token, URL, request body and upstream details from logs and responses.
    return invalidSession(context.environment);
  }
};

async function journeyId(context, invitationId) {
  const invitation = await one(context, "lead_demo_invitations", `select=demo_journey_id&id=eq.${encodeURIComponent(invitationId)}&limit=1`);
  return clean(invitation?.demo_journey_id);
}
async function one(context, table, query) { return first(await get(context, table, query)); }
async function get(context, table, query) {
  const response = await fetch(`${context.supabaseUrl}/rest/v1/${table}?${query}`, { headers: restHeaders(context.serviceRoleKey) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data)) throw new Error("Binding read failed");
  return data;
}
async function rpc(context, name, body) {
  const response = await fetch(`${context.supabaseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers: { ...restHeaders(context.serviceRoleKey), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Binding resolve failed");
  return data;
}
function restHeaders(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" }; }
function config() { const supabaseUrl = clean(process.env.SUPABASE_URL).replace(/\/$/, ""); const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY); const environment = clean(process.env.APP_ENV || process.env.APP_ENVIRONMENT || "staging"); return { supabaseUrl, serviceRoleKey, environment, available: Boolean(supabaseUrl && serviceRoleKey) }; }
function first(value) { return Array.isArray(value) ? value[0] || null : value || null; }
function invalidLink() { return json(404, { success: false, error: "Deze persoonlijke link is ongeldig of niet meer actief." }); }
function invalidSession(environment, statusCode = 404) { return json(statusCode, { success: false, error: "Deze persoonlijke link is ongeldig of niet meer actief." }, clearSessionCookie(environment)); }
function json(statusCode, body, cookie = "") { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" }, multiValueHeaders: cookie ? { "Set-Cookie": [cookie] } : undefined, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { config, invalidLink, invalidSession, journeyId };
