const { createTimelineEvent } = require("./services/timelineService");

const ALLOWED_REVIEW_STATUSES = new Set(["interne_preview_klaar", "preview_ready", "preview_ingepland_voor_klant", "preview_verstuurd", "feedback_ontvangen", "aanpassingen_bezig", "definitieve_versie_klaar"]);

function createHandler(deps = {}) {
  const fetchImpl = deps.fetchImpl || global.fetch;
  const timeline = deps.createTimelineEvent || createTimelineEvent;
  const now = deps.now || (() => new Date());
  return async (event) => {
    if (!['GET', 'POST'].includes(event.httpMethod)) return response(405, { success: false, error: "Methode niet toegestaan." });
    const config = runtimeConfig(process.env);
    const bearer = getBearer(event);
    if (!config.ready || !bearer) return response(401, { success: false, code: "AUTH_REQUIRED", error: "Log in om uw persoonlijke demo te bekijken." });
    try {
      const authUser = await getAuthUser(fetchImpl, config, bearer);
      const scope = await resolveLeadScope(fetchImpl, config, authUser.id);
      if (!scope) throw httpError(403, "LEAD_PORTAL_DENIED", "Voor dit account is geen leadpreview beschikbaar.");
      if (event.httpMethod === "POST") return handleAction({ event, fetchImpl, timeline, config, authUser, scope, now });
      await markViewed({ fetchImpl, timeline, config, authUser, scope, now });
      return response(200, await portalPayload(fetchImpl, config, scope));
    } catch (error) {
      console.error("Lead preview portal failed", { code: error.code || "LEAD_PORTAL_FAILED", status: error.statusCode || 500 });
      return response(error.statusCode || 500, { success: false, code: error.code || "LEAD_PORTAL_FAILED", error: error.statusCode ? error.message : "De persoonlijke demo kon niet veilig worden geladen." });
    }
  };
}

async function resolveLeadScope(fetchImpl, config, authUserId) {
  const invitation = await readOne(fetchImpl, config, "lead_demo_invitations", { select: "*", auth_user_id: `eq.${authUserId}`, limit: "1" });
  if (!invitation?.id || !invitation.lead_id || !invitation.demo_journey_id) return null;
  const [profile, lead, journey] = await Promise.all([
    readOne(fetchImpl, config, "profiles", { select: "id,auth_user_id,role,status,metadata", id: `eq.${invitation.profile_id}`, auth_user_id: `eq.${authUserId}`, limit: "1" }),
    readOne(fetchImpl, config, "leads", { select: "*", id: `eq.${invitation.lead_id}`, limit: "1" }),
    readOne(fetchImpl, config, "demo_journeys", { select: "*", id: `eq.${invitation.demo_journey_id}`, lead_id: `eq.${invitation.lead_id}`, limit: "1" }),
  ]);
  if (!profile?.id || !lead?.id || !journey?.id) return null;
  if (!["demo_user", "customer"].includes(clean(profile.role).toLowerCase())) return null;
  if (["disabled", "archived"].includes(clean(profile.status).toLowerCase())) return null;
  const previewVersion = await resolveInvitationPreview(fetchImpl, config, invitation, journey);
  if (!previewVersion?.id) return null;
  return { invitation, profile, lead, journey, previewVersion };
}

async function handleAction({ event, fetchImpl, timeline, config, authUser, scope, now }) {
  const payload = parse(event.body);
  const action = clean(payload.action).toLowerCase();
  const at = now().toISOString();
  if (action === "activate") {
    await Promise.all([
      patch(fetchImpl, config, "profiles", { id: `eq.${scope.profile.id}`, auth_user_id: `eq.${authUser.id}` }, { status: "active", updated_at: at }),
      patch(fetchImpl, config, "lead_demo_invitations", { id: `eq.${scope.invitation.id}`, auth_user_id: `eq.${authUser.id}` }, { status: "activated", activated_at: at, updated_at: at }),
    ]);
    await safeTimeline(timeline, { leadId: scope.lead.id, eventType: "lead_demo_account_activated", title: "Demo-account geactiveerd", description: "De lead heeft een wachtwoord ingesteld voor de beveiligde demo-omgeving.", module: "lead_demo_portal", referenceType: "lead_demo_invitation", referenceId: scope.invitation.id, actorName: clean(scope.lead.contact_name || scope.lead.name || authUser.email), actorRole: "lead", severity: "success", metadata: { dedupeKey: `lead-demo-activated:${scope.invitation.id}` } });
    return response(200, { success: true, status: "activated", redirectTo: "/lead-preview.html" });
  }
  if (!ALLOWED_REVIEW_STATUSES.has(clean(scope.journey.demo_status).toLowerCase())) throw httpError(409, "PREVIEW_NOT_AVAILABLE", "De demo is nog niet beschikbaar voor feedback.");
  if (action === "view") {
    await markViewed({ fetchImpl, timeline, config, authUser, scope, now });
    return response(200, { success: true, status: "viewed" });
  }
  if (action === "feedback") {
    const feedback = clean(payload.feedback).slice(0, 4000);
    if (!feedback) throw httpError(400, "FEEDBACK_REQUIRED", "Vul uw feedback in.");
    await patch(fetchImpl, config, "demo_journeys", { id: `eq.${scope.journey.id}`, lead_id: `eq.${scope.lead.id}` }, { feedback, demo_status: "feedback_ontvangen", updated_by: authUser.id, updated_at: at });
    await createDemoEvent(fetchImpl, config, scope, authUser, { type: "customer_feedback", title: "Feedback ontvangen", description: "De lead heeft feedback op de demo gegeven.", at });
    await safeTimeline(timeline, { leadId: scope.lead.id, eventType: "preview_feedback_received", title: "Demo-feedback ontvangen", description: "De lead heeft feedback op de eigen demo gegeven.", module: "lead_demo_portal", referenceType: "website_preview_version", referenceId: scope.previewVersion.id, actorName: clean(scope.lead.contact_name || scope.lead.name || authUser.email), actorRole: "lead", severity: "info", metadata: { dedupeKey: `lead-demo-feedback:${scope.journey.id}:${at}`, previewVersionId: scope.previewVersion.id } });
    return response(200, { success: true, status: "feedback_received" });
  }
  if (action === "approve") {
    await patch(fetchImpl, config, "demo_journeys", { id: `eq.${scope.journey.id}`, lead_id: `eq.${scope.lead.id}` }, { demo_status: "definitieve_versie_klaar", approval_status: "customer_approved", preview_approved_by: authUser.id, preview_approved_at: at, updated_by: authUser.id, updated_at: at });
    await createDemoEvent(fetchImpl, config, scope, authUser, { type: "preview_approved", title: "Demo goedgekeurd", description: "De lead heeft de demo goedgekeurd.", at });
    await safeTimeline(timeline, { leadId: scope.lead.id, eventType: "preview_approved", title: "Demo goedgekeurd door lead", description: "De lead heeft exact de gekoppelde previewversie goedgekeurd.", module: "lead_demo_portal", referenceType: "website_preview_version", referenceId: scope.previewVersion.id, actorName: clean(scope.lead.contact_name || scope.lead.name || authUser.email), actorRole: "lead", severity: "success", metadata: { dedupeKey: `lead-demo-approved:${scope.journey.id}`, previewVersionId: scope.previewVersion.id } });
    return response(200, { success: true, status: "approved" });
  }
  throw httpError(400, "ACTION_INVALID", "Onbekende portalactie.");
}

async function portalPayload(fetchImpl, config, scope) {
  const events = await readMany(fetchImpl, config, "demo_journey_events", { select: "id,event_type,title,description,created_at", demo_journey_id: `eq.${scope.journey.id}`, visible_to_customer: "eq.true", order: "created_at.desc", limit: "30" });
  return {
    success: true,
    portalMode: "lead_preview",
    relationshipType: "lead",
    lead: { id: scope.lead.id, companyName: clean(scope.lead.company_name || scope.lead.company || scope.lead.name), contactName: clean(scope.lead.contact_name || scope.lead.name), email: clean(scope.lead.email) },
    invitation: { status: clean(scope.invitation.status), activatedAt: clean(scope.invitation.activated_at), sentAt: clean(scope.invitation.sent_at) },
    demo: { id: scope.journey.id, status: clean(scope.journey.demo_status), approvalStatus: clean(scope.journey.approval_status), previewVersionId: clean(scope.previewVersion.id), previewSource: previewSource(scope.previewVersion), version: Number(scope.previewVersion.version || 1), previewUrl: previewVersionUrl(scope.previewVersion, config.siteUrl), feedback: clean(scope.journey.feedback), updatedAt: clean(scope.journey.updated_at), versions: sanitizeVersions(scope.journey.preview_package) },
    events: Array.isArray(events) ? events.map((event) => ({ id: clean(event.id), type: clean(event.event_type), title: clean(event.title), description: clean(event.description), createdAt: clean(event.created_at) })) : [],
    customerModules: { invoices: false, onboarding: false, subscriptions: false, projects: false, assets: false },
    nextStep: "Bekijk de demo en geef feedback of keur het ontwerp goed.",
  };
}

async function markViewed({ fetchImpl, timeline, config, authUser, scope, now }) {
  const at = now().toISOString();
  if (scope.invitation.opened_at) return;
  await patch(fetchImpl, config, "lead_demo_invitations", { id: `eq.${scope.invitation.id}`, auth_user_id: `eq.${authUser.id}`, opened_at: "is.null" }, { opened_at: at, updated_at: at });
  await createDemoEvent(fetchImpl, config, scope, authUser, { type: "preview_opened", title: "Demo bekeken", description: "De lead heeft de beveiligde demo geopend.", at });
  await safeTimeline(timeline, { leadId: scope.lead.id, eventType: "preview_opened", title: "Demo bekeken door lead", description: "De lead heeft de gekoppelde previewversie geopend.", module: "lead_demo_portal", referenceType: "website_preview_version", referenceId: scope.previewVersion.id, actorName: clean(scope.lead.contact_name || scope.lead.name || authUser.email), actorRole: "lead", severity: "info", metadata: { dedupeKey: `lead-demo-viewed:${scope.invitation.id}`, previewVersionId: scope.previewVersion.id } });
}

async function resolveInvitationPreview(fetchImpl, config, invitation, journey) {
  const previewVersionId = clean(invitation?.metadata?.portalPreview?.previewVersionId);
  if (previewVersionId) {
    const version = await readOne(fetchImpl, config, "website_preview_versions", {
      select: "id,demo_journey_id,version,preview_url,preview_token,generated_package,metadata,is_active,status,allow_feedback,allow_approval,approved_at,feedback_items",
      id: `eq.${previewVersionId}`,
      demo_journey_id: `eq.${journey.id}`,
      limit: "1",
    });
    if (!version?.id || clean(version.demo_journey_id) !== clean(journey.id) || !previewVersionUrl(version, config.siteUrl)) return null;
    return version;
  }
  const legacyUrl = previewUrl(journey, config.siteUrl);
  if (!legacyUrl) return null;
  return { id: `legacy:${journey.id}`, demo_journey_id: journey.id, version: 1, preview_url: legacyUrl, metadata: { previewSource: "website_factory" } };
}

function previewSource(version = {}) {
  const source = clean(version.metadata?.previewSource).toLowerCase();
  return ["manual", "manual_zip", "manual-zip", "zip"].includes(source) ? "manual_zip" : "website_factory";
}

function previewVersionUrl(version = {}, siteUrl = "") {
  try {
    const url = new URL(clean(version.preview_url), `${siteUrl}/`);
    const site = new URL(siteUrl);
    if (url.protocol !== "https:" || (url.hostname !== site.hostname && !url.hostname.endsWith(`.${site.hostname}`))) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function createDemoEvent(fetchImpl, config, scope, authUser, input) {
  try { await rest(fetchImpl, config, "demo_journey_events", { method: "POST", prefer: "return=minimal", body: { demo_journey_id: scope.journey.id, event_type: input.type, title: input.title, description: input.description, visible_to_customer: true, created_by: authUser.id, created_at: input.at } }); } catch {}
}
async function safeTimeline(timeline, event) { try { await timeline(event); } catch {} }
function sanitizeVersions(previewPackage) { const review = previewPackage && typeof previewPackage === "object" ? previewPackage.previewReview : null; const versions = Array.isArray(review?.versions) ? review.versions : []; return versions.map((item) => ({ version: clean(item.version), date: clean(item.date), status: clean(item.status), notes: clean(item.notes) })); }
function previewUrl(journey, siteUrl) { const token = clean(journey.preview_token); if (token) return `${siteUrl}/.netlify/functions/demo-preview?id=${encodeURIComponent(journey.id)}&token=${encodeURIComponent(token)}`; try { const url = new URL(clean(journey.preview_url), `${siteUrl}/`); return url.origin === new URL(siteUrl).origin ? url.toString() : ""; } catch { return ""; } }
function runtimeConfig(env) { const supabaseUrl = clean(env.SUPABASE_URL).replace(/\/$/, ""); const serviceKey = clean(env.SUPABASE_SERVICE_ROLE_KEY); const anonKey = clean(env.SUPABASE_ANON_KEY); const siteUrl = clean(env.SITE_URL || "https://maxwebstudio.nl").replace(/\/$/, ""); return { ready: Boolean(supabaseUrl && serviceKey && anonKey), supabaseUrl, serviceKey, anonKey, siteUrl }; }
function getBearer(event) { const header = event.headers?.authorization || event.headers?.Authorization || ""; return header.startsWith("Bearer ") ? header.slice(7).trim() : ""; }
async function getAuthUser(fetchImpl, config, bearer) { const data = await request(fetchImpl, `${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.anonKey, Authorization: `Bearer ${bearer}` } }); if (!data?.id) throw httpError(401, "AUTH_INVALID", "Uw sessie is niet geldig."); return data; }
async function readOne(fetchImpl, config, table, filters) { const rows = await readMany(fetchImpl, config, table, filters); return rows[0] || null; }
async function readMany(fetchImpl, config, table, filters) { return rest(fetchImpl, config, `${table}?${new URLSearchParams(filters)}`, { method: "GET" }); }
async function patch(fetchImpl, config, table, filters, body) { return rest(fetchImpl, config, `${table}?${new URLSearchParams(filters)}`, { method: "PATCH", prefer: "return=representation", body }); }
async function rest(fetchImpl, config, path, options) { return request(fetchImpl, `${config.supabaseUrl}/rest/v1/${path}`, { ...options, headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, Accept: "application/json", "Content-Type": "application/json", ...(options?.prefer ? { Prefer: options.prefer } : {}) } }); }
async function request(fetchImpl, url, options = {}) { let result; try { result = await fetchImpl(url, { method: options.method || "GET", headers: options.headers, body: options.body ? JSON.stringify(options.body) : undefined }); } catch { throw httpError(503, "UPSTREAM_UNAVAILABLE", "De portalservice is tijdelijk niet bereikbaar."); } const raw = await result.text(); let data; try { data = raw ? JSON.parse(raw) : []; } catch { throw httpError(502, "UPSTREAM_INVALID", "De portalservice gaf een ongeldig antwoord."); } if (!result.ok) throw httpError(result.status === 401 ? 401 : 502, "UPSTREAM_REJECTED", "De portalgegevens konden niet veilig worden gecontroleerd."); return data; }
function parse(body) { try { return JSON.parse(body || "{}"); } catch { throw httpError(400, "INVALID_JSON", "Ongeldige JSON body."); } }
function httpError(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
function clean(value) { return String(value || "").trim(); }
function response(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }

exports.handler = createHandler();
exports._test = { createHandler, previewSource, previewUrl, previewVersionUrl, resolveInvitationPreview, resolveLeadScope, sanitizeVersions };
