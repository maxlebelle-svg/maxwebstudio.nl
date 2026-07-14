const crypto = require("crypto");
const { verifyAdmin } = require("./_admin-auth");
const { buildLeadDemoInvitationMail } = require("./services/leadDemoInvitationTemplate");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STAFF_ROLES = new Set(["super_admin", "admin", "sales_manager", "sales_partner", "developer", "designer", "support"]);
const ACTIONS = new Set(["invite", "resend", "new_link"]);

function createHandler(deps = {}) {
  const fetchImpl = deps.fetchImpl || global.fetch;
  const verify = deps.verifyAdmin || verifyAdmin;
  const now = deps.now || (() => new Date());
  return async (event) => {
    if (event.httpMethod !== "POST") return response(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
    const admin = await verify(event, response, { module: "lead_demo_invitation", action: "plan", allowedRoles: ["super_admin", "admin", "sales_manager", "sales_partner"] });
    if (!admin.success) return admin.response;
    const config = runtimeConfig(process.env);
    if (!config.ready) return response(503, { success: false, code: "INVITATION_NOT_CONFIGURED", error: "De demo-uitnodigingsflow is nog niet geconfigureerd." });

    let createdAuthUserId = "";
    let createdProfileId = "";
    try {
      const input = validateInput(parse(event.body));
      const lead = await readOne(fetchImpl, config, "leads", { select: "*", id: `eq.${input.leadId}`, limit: "1" });
      if (!lead?.id) throw httpError(404, "LEAD_NOT_FOUND", "De lead bestaat niet meer.");
      const email = clean(lead.email).toLowerCase();
      if (!EMAIL.test(email)) throw httpError(422, "LEAD_EMAIL_INVALID", "De lead heeft geen geldig e-mailadres.");
      const journey = await resolveJourney(fetchImpl, config, input, lead.id);
      assertJourneyReady(journey, lead.id);

      const existingUser = await findAuthUser(fetchImpl, config, email);
      let authUser = existingUser;
      const redirectTo = leadActivationRedirect(config.siteUrl);
      let link = await generateLink(fetchImpl, config, { type: existingUser ? "recovery" : "invite", email, redirectTo, leadId: lead.id });
      authUser = authUser || link.user || await findAuthUser(fetchImpl, config, email);
      if (!authUser?.id) throw httpError(502, "AUTH_USER_NOT_CREATED", "Het beveiligde account kon niet worden voorbereid.");
      if (!existingUser) createdAuthUserId = authUser.id;

      const profileResult = await ensureLeadProfile(fetchImpl, config, { authUser, lead, admin: admin.admin });
      const profile = profileResult.profile;
      if (profileResult.created) createdProfileId = profile.id;
      if (!link.actionLink) {
        link = await generateLink(fetchImpl, config, { type: "recovery", email, redirectTo, leadId: lead.id });
      }
      if (!link.actionLink) throw httpError(502, "ACTIVATION_LINK_MISSING", "De activatielink kon niet worden gemaakt.");

      const occurredAt = now().toISOString();
      const mail = buildLeadDemoInvitationMail({
        contactName: clean(lead.contact_name || lead.name),
        companyName: clean(lead.company_name || lead.company || lead.name),
        activationUrl: forceRedirect(link.actionLink, redirectTo),
        previewUrl: absolutePreviewUrl(journey.preview_url, config.siteUrl),
        supportEmail: config.supportEmail,
      });
      const stable = crypto.createHash("sha256").update(`${lead.id}:${journey.id}:${input.actionKey}`).digest("hex");
      const rows = await rpc(fetchImpl, config, "plan_lead_demo_invitation", {
        p_lead_id: lead.id,
        p_demo_journey_id: journey.id,
        p_auth_user_id: authUser.id,
        p_profile_id: profile.id,
        p_normalized_email: email,
        p_action_key: input.actionKey,
        p_action_type: input.action,
        p_event_key: `lead.demo_invitation_planned:${stable}`,
        p_outbox_idempotency_key: `lead.demo.invitation:${stable}`,
        p_effect_payload: {
          mailCommand: {
            to: email,
            from: config.fromEmail,
            replyTo: config.replyTo,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            templateKey: "lead_demo_invitation",
            templateName: "Je website-demo staat klaar",
            leadId: lead.id,
            idempotencyKey: `lead.demo.invitation:${stable}`,
          },
          leadId: lead.id,
          demoJourneyId: journey.id,
          actionType: input.action,
          portalPath: "/lead-preview.html",
        },
        p_occurred_at: occurredAt,
      });
      const planned = Array.isArray(rows) ? rows[0] : rows;
      if (!planned?.outbox_id) throw httpError(503, "OUTBOX_NOT_CREATED", "De uitnodiging kon niet duurzaam worden gepland.");

      return response(202, {
        success: true,
        status: "planned",
        duplicate: Boolean(planned.duplicate),
        invitationId: clean(planned.invitation_id),
        outboxId: clean(planned.outbox_id),
        leadId: lead.id,
        demoJourneyId: journey.id,
        authUserId: authUser.id,
        createdAuthUser: !existingUser,
        createdProfile: profileResult.created,
        emailSent: false,
        message: "De demo-uitnodiging is duurzaam gepland voor verzending.",
      });
    } catch (error) {
      await compensate(fetchImpl, runtimeConfig(process.env), { profileId: createdProfileId, authUserId: createdAuthUserId });
      console.error("Lead demo invitation failed", { code: error.code || "INVITATION_FAILED", status: error.statusCode || 500 });
      return response(error.statusCode || 500, { success: false, code: error.code || "INVITATION_FAILED", error: error.statusCode ? error.message : "De demo-uitnodiging kon niet veilig worden gepland." });
    }
  };
}

async function resolveJourney(fetchImpl, config, input, leadId) {
  if (input.demoJourneyId) return readOne(fetchImpl, config, "demo_journeys", { select: "*", id: `eq.${input.demoJourneyId}`, lead_id: `eq.${leadId}`, limit: "1" });
  return readOne(fetchImpl, config, "demo_journeys", { select: "*", lead_id: `eq.${leadId}`, order: "updated_at.desc", limit: "1" });
}

function assertJourneyReady(journey, leadId) {
  if (!journey?.id || clean(journey.lead_id) !== leadId) throw httpError(422, "DEMO_NOT_FOUND", "Voor deze lead is geen demo gekoppeld.");
  if (!clean(journey.preview_url)) throw httpError(422, "DEMO_PREVIEW_MISSING", "De demo heeft nog geen geldige preview.");
  if (!clean(journey.preview_approved_at)) throw httpError(409, "DEMO_NOT_READY", "Keur de demo eerst expliciet goed voor delen.");
}

async function ensureLeadProfile(fetchImpl, config, { authUser, lead, admin }) {
  const existing = await readOne(fetchImpl, config, "profiles", { select: "*", auth_user_id: `eq.${authUser.id}`, limit: "1" });
  if (existing?.id && STAFF_ROLES.has(clean(existing.role).toLowerCase())) throw httpError(409, "IDENTITY_ROLE_CONFLICT", "Dit e-mailadres hoort al bij een intern account.");
  const now = new Date().toISOString();
  const metadata = { ...(existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {}), leadPortal: { leadId: lead.id, mode: "lead_preview", invitedAt: now } };
  const record = {
    auth_user_id: authUser.id,
    name: clean(lead.contact_name || lead.name || authUser.email),
    email: clean(authUser.email).toLowerCase(),
    role: existing?.role === "customer" ? "customer" : "demo_user",
    status: existing?.status === "active" ? "active" : "invited",
    environment: "production",
    metadata,
    updated_at: now,
  };
  if (admin?.id && !existing?.id) record.created_by = admin.id;
  const rows = await rest(fetchImpl, config, `profiles?on_conflict=auth_user_id`, { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: record });
  const profile = Array.isArray(rows) ? rows[0] : rows;
  if (!profile?.id) throw httpError(502, "PROFILE_NOT_CREATED", "Het leadprofiel kon niet worden voorbereid.");
  return { profile, created: !existing?.id };
}

async function findAuthUser(fetchImpl, config, email) {
  for (let page = 1; page <= 5; page += 1) {
    const data = await auth(fetchImpl, config, `admin/users?per_page=200&page=${page}`, { method: "GET" });
    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find((user) => clean(user.email).toLowerCase() === email);
    if (found) return found;
    if (users.length < 200) break;
  }
  return null;
}

async function generateLink(fetchImpl, config, input) {
  try {
    const data = await auth(fetchImpl, config, "admin/generate_link", { method: "POST", body: { type: input.type, email: input.email, redirect_to: input.redirectTo, data: { portalMode: "lead_preview", leadId: input.leadId } } });
    return { actionLink: clean(data.action_link || data.properties?.action_link), user: data.user || data.properties?.user || null };
  } catch (error) {
    if (input.type === "invite" && error.statusCode === 422) return { actionLink: "", user: null };
    throw error;
  }
}

async function compensate(fetchImpl, config, ids) {
  if (!config.ready) return;
  try { if (ids.profileId) await rest(fetchImpl, config, `profiles?id=eq.${encodeURIComponent(ids.profileId)}`, { method: "DELETE" }); } catch {}
  try { if (ids.authUserId) await auth(fetchImpl, config, `admin/users/${encodeURIComponent(ids.authUserId)}`, { method: "DELETE" }); } catch {}
}

function runtimeConfig(env) {
  const supabaseUrl = clean(env.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  const siteUrl = clean(env.SITE_URL || "https://maxwebstudio.nl").replace(/\/$/, "");
  return { ready: /^https:\/\/[^/]+\.supabase\.co$/i.test(supabaseUrl) && Boolean(key), supabaseUrl, key, siteUrl, fromEmail: clean(env.LEAD_DEMO_INVITE_FROM_EMAIL || env.FROM_EMAIL), replyTo: clean(env.REPLY_TO_EMAIL || env.FROM_EMAIL || "info@maxwebstudio.nl"), supportEmail: clean(env.SUPPORT_EMAIL || "info@maxwebstudio.nl") };
}

function leadActivationRedirect(siteUrl) { return `${siteUrl}/account-activeren.html?mode=lead_demo`; }
function absolutePreviewUrl(value, siteUrl) { try { const url = new URL(clean(value), `${siteUrl}/`); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; } }
function forceRedirect(actionLink, redirectTo) { try { const url = new URL(clean(actionLink)); url.searchParams.set("redirect_to", redirectTo); return url.toString(); } catch { return ""; } }
function validateInput(payload) { const leadId = clean(payload.leadId); const demoJourneyId = clean(payload.demoJourneyId); const actionKey = clean(payload.actionKey); const action = clean(payload.action || "invite").toLowerCase(); if (!UUID.test(leadId)) throw httpError(400, "LEAD_ID_INVALID", "Kies een geldige lead."); if (demoJourneyId && !UUID.test(demoJourneyId)) throw httpError(400, "DEMO_ID_INVALID", "Kies een geldige demo."); if (!UUID.test(actionKey)) throw httpError(400, "ACTION_KEY_INVALID", "De uitnodigingsactie mist een geldige unieke sleutel."); if (!ACTIONS.has(action)) throw httpError(400, "ACTION_INVALID", "Onbekende uitnodigingsactie."); return { leadId, demoJourneyId, actionKey, action }; }
function parse(body) { try { return JSON.parse(body || "{}"); } catch { throw httpError(400, "INVALID_JSON", "Ongeldige JSON body."); } }
function httpError(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
function clean(value) { return String(value || "").trim(); }

async function readOne(fetchImpl, config, table, filters) { const query = new URLSearchParams(filters); const rows = await rest(fetchImpl, config, `${table}?${query}`, { method: "GET" }); return Array.isArray(rows) ? rows[0] || null : null; }
async function rpc(fetchImpl, config, name, body) { return rest(fetchImpl, config, `rpc/${name}`, { method: "POST", body }); }
async function rest(fetchImpl, config, path, options = {}) { return request(fetchImpl, `${config.supabaseUrl}/rest/v1/${path}`, { ...options, headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public", ...(options.prefer ? { Prefer: options.prefer } : {}) } }); }
async function auth(fetchImpl, config, path, options = {}) { return request(fetchImpl, `${config.supabaseUrl}/auth/v1/${path}`, { ...options, headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json" } }); }
async function request(fetchImpl, url, options = {}) { const headers = { ...(options.headers || {}) }; if (options.body) headers["Content-Type"] = "application/json"; let result; try { result = await fetchImpl(url, { method: options.method || "GET", headers, body: options.body ? JSON.stringify(options.body) : undefined }); } catch { throw httpError(503, "UPSTREAM_UNAVAILABLE", "De uitnodigingsservice is tijdelijk niet bereikbaar."); } const raw = await result.text(); let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { throw httpError(502, "UPSTREAM_INVALID_RESPONSE", "De uitnodigingsservice gaf een ongeldig antwoord."); } if (!result.ok) throw httpError(result.status >= 500 ? 503 : result.status, clean(data?.code || data?.error_code || "UPSTREAM_REJECTED"), clean(data?.message || data?.error || "De uitnodigingsservice weigerde het verzoek.")); return data; }
function response(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }

exports.handler = createHandler();
exports._test = { createHandler, absolutePreviewUrl, assertJourneyReady, buildLeadDemoInvitationMail, forceRedirect, runtimeConfig, validateInput };
