const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const {
  activationUrl,
  assertEligibility,
  clean,
  correlationId,
  invitationStatus,
  normalizeEmail,
  whatsappMessage,
  whatsappUrl,
} = require("./_dca-invitation");

const STAFF_ROLES = ["super_admin", "admin", "sales_manager"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { success: false, error: "Methode niet toegestaan." });
  const auth = await verifyAdmin(event, json, {
    module: "dca_1_demo_invitation",
    action: event.httpMethod.toLowerCase(),
    allowedRoles: STAFF_ROLES,
    allowedStatuses: ["active"],
    disableLegacyToken: true,
  });
  if (!auth.success) return auth.response;

  const context = getContext();
  if (!context.available) return json(500, { success: false, error: "Uitnodigingsservice is nog niet geconfigureerd." });
  const requestId = correlationId();
  let provisionalIdentity = null;
  try {
    const payload = parse(event.body);
    const journeyId = uuid(payload.demoJourneyId || payload.demo_journey_id || payload.id);
    if (!journeyId) return json(400, { success: false, error: "Demo journey ontbreekt.", requestId });
    const state = await loadEligibility(context, journeyId, payload.email);
    const action = clean(payload.action || "status").toLowerCase();

    if (action === "status" || action === "prepare") {
      return json(200, { success: true, requestId, ...adminPayload(state) });
    }
    if (action === "revoke") {
      if (!state.link?.id || !["active", "opened"].includes(state.link.status)) return json(409, { success: false, requestId, error: "Er is geen actieve link om in te trekken." });
      await rpc(context, "dca_0_revoke_activation_link", {
        input_activation_link_id: state.link.id,
        input_reason: "DCA_1_ADMIN_REVOCATION",
      });
      const refreshed = await loadEligibility(context, journeyId, payload.email);
      return json(200, { success: true, requestId, ...adminPayload(refreshed) });
    }
    if (!["create", "rotate"].includes(action)) return json(400, { success: false, requestId, error: "Onbekende uitnodigingsactie." });

    const identity = await resolveInvitationIdentity(context, state, payload.email, {
      allowProvision: action === "create",
      createdBy: clean(auth.admin?.profileId || auth.admin?.id),
    });
    provisionalIdentity = identity.provisional || null;
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const created = first(await rpc(context, "dca_0_create_activation_link", {
      input_lead_id: state.lead.id,
      input_demo_journey_id: state.journey.id,
      input_preview_version_id: state.preview.id,
      input_preview_publication_id: state.publication.id,
      input_auth_user_id: identity.auth_user_id,
      input_profile_id: identity.id,
      input_recipient_email: state.eligibility.normalizedEmail,
      input_created_by: clean(auth.admin?.profileId || auth.admin?.id || "dca_1_admin"),
      input_expires_at: expiresAt,
      input_rotate: action === "rotate",
    }));
    // From this point the identity is durably referenced by the canonical invitation.
    provisionalIdentity = null;
    const url = activationUrl(resolveOrigin(event), created?.activation_token);
    const message = url ? whatsappMessage({
      contactName: state.journey.contact_name || state.lead.name,
      companyName: state.journey.business_name || state.lead.company,
      activationUrl: url,
    }) : "";
    const refreshed = await loadEligibility(context, journeyId, payload.email);
    return json(200, {
      success: true,
      requestId,
      ...adminPayload(refreshed),
      oneTimeLink: url || null,
      whatsappUrl: url ? whatsappUrl(state.journey.phone || state.lead.phone, message) : null,
      tokenCreated: Boolean(created?.token_created),
      invitationReused: !created?.invitation_created,
      previousTokenRotated: Boolean(created?.previous_token_rotated),
    });
  } catch (error) {
    if (provisionalIdentity) await compensateProvisionalIdentity(context, provisionalIdentity);
    // Never log request bodies, URLs, e-mail addresses or activation tokens.
    console.error("DCA-1 admin invitation failed", { requestId, code: clean(error.code), status: error.status || 500 });
    return json(error.status || 500, {
      success: false,
      requestId,
      reasonCode: clean(error.code || "DCA_INVITATION_FAILED"),
      error: safeMessage(error),
    });
  }
};

async function loadEligibility(context, journeyId, overrideEmail = "") {
  const journey = await one(context, "demo_journeys", `select=*&id=eq.${encodeURIComponent(journeyId)}&limit=1`);
  if (!journey?.id) throw fault("JOURNEY_NOT_FOUND", "Demo journey niet gevonden.", 404);
  const lead = await one(context, "leads", `select=id,name,company,email,phone,converted_customer_id&id=eq.${encodeURIComponent(journey.lead_id || "missing")}&limit=1`);
  const saved = journey.preview_package?.savedDemoSite || journey.preview_package?.saved_demo_site || {};
  const previewId = uuid(saved.previewVersionId || saved.preview_version_id);
  const preview = previewId ? await one(context, "website_preview_versions", `select=id,demo_journey_id,customer_id,project_id,website_id,version,title,generated_package,metadata&id=eq.${encodeURIComponent(previewId)}&limit=1`) : null;
  const publications = preview?.id ? await many(context, "public_preview_publications", `select=id,relationship_type,relationship_id,preview_version_id,enabled,revoked_at&preview_version_id=eq.${encodeURIComponent(preview.id)}&enabled=eq.true&revoked_at=is.null&limit=2`) : [];
  if (publications.length !== 1) throw fault("PUBLICATION_COUNT_MISMATCH", "Deze demo heeft niet exact één actieve previewpublicatie.", 409);
  const publication = publications[0];
  const customerId = clean(lead?.converted_customer_id);
  const customer = customerId ? await one(context, "customers", `select=id,auth_user_id,profile_id,name,company,email&id=eq.${encodeURIComponent(customerId)}&limit=1`) : null;
  const projectId = uuid(preview?.project_id || saved.projectId || saved.project_id);
  const project = projectId ? await one(context, "projects", `select=id,customer_id,name,status&id=eq.${encodeURIComponent(projectId)}&limit=1`) : null;
  const email = normalizeEmail(overrideEmail || journey.email || lead?.email);
  const profile = email ? await resolveProfileByEmail(context, email) : null;
  const eligibility = assertEligibility({ journey, lead, preview, publication, customer, project, profile, email });
  const invitation = await one(context, "lead_demo_invitations", `select=id,status,opened_at,activated_at,updated_at&lead_id=eq.${encodeURIComponent(lead.id)}&demo_journey_id=eq.${encodeURIComponent(journey.id)}&preview_version_id=eq.${encodeURIComponent(preview.id)}&normalized_email=eq.${encodeURIComponent(email)}&limit=1`);
  const links = invitation?.id ? await many(context, "client_activation_links", `select=id,status,expires_at,opened_at,activated_at,revoked_at,created_at,updated_at&lead_demo_invitation_id=eq.${encodeURIComponent(invitation.id)}&order=created_at.desc&limit=10`) : [];
  const link = links.find((candidate) => ["active", "opened"].includes(candidate.status)) || links[0] || null;
  return { journey, lead, preview, publication, customer, project, profile, eligibility, invitation, link };
}

async function resolveInvitationIdentity(context, state, emailOverride, options = {}) {
  const email = normalizeEmail(emailOverride || state.eligibility.normalizedEmail);
  const profiles = await many(context, "profiles", `select=id,auth_user_id,email,role,status&email=eq.${encodeURIComponent(email)}&limit=2`);
  if (profiles.length > 1) throw fault("IDENTITY_COUNT_MISMATCH", "Voor dit e-mailadres bestaat niet exact één veilig profiel.", 409);
  if (profiles.length === 0) {
    if (!options.allowProvision || state.customer?.id) throw fault("IDENTITY_COUNT_MISMATCH", "Voor dit e-mailadres bestaat nog geen veilig profiel.", 409);
    return provisionLeadIdentity(context, state, email, options.createdBy);
  }
  const profile = profiles[0];
  if (!profile.auth_user_id || clean(profile.status) !== "active") throw fault("IDENTITY_INACTIVE", "Het gekoppelde demo-profiel is niet actief.", 409);
  if (state.customer?.id) {
    if (clean(state.customer.profile_id) !== clean(profile.id) || clean(state.customer.auth_user_id) !== clean(profile.auth_user_id)) throw fault("CUSTOMER_IDENTITY_MISMATCH", "Klant- en accountownership komen niet overeen.", 409);
  } else if (clean(profile.role) !== "demo_user") {
    throw fault("DEMO_IDENTITY_REQUIRED", "Een nieuwe lead vereist eerst een geïsoleerd demo-profiel.", 409);
  }
  return profile;
}

async function provisionLeadIdentity(context, state, email, createdBy = "") {
  const authUsers = await findAuthUsersByEmail(context, email);
  if (authUsers.length) throw fault("UNBOUND_AUTH_IDENTITY", "Voor dit e-mailadres bestaat al een account zonder eenduidige leadkoppeling.", 409);
  let authUserId = "";
  let profileId = "";
  try {
    const generated = await authRequest(context, "admin/generate_link", {
      method: "POST",
      body: {
        type: "invite",
        email,
        data: { portalMode: "lead_preview", leadId: state.lead.id },
      },
    });
    const user = generated?.user || generated?.properties?.user || null;
    authUserId = clean(user?.id);
    if (!authUserId) throw fault("AUTH_IDENTITY_NOT_CREATED", "Het beveiligde demo-account kon niet worden voorbereid.", 502);
    const now = new Date().toISOString();
    const profile = first(await restRequest(context, "profiles?on_conflict=auth_user_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        auth_user_id: authUserId,
        name: clean(state.journey.contact_name || state.lead.name || email),
        email,
        role: "demo_user",
        status: "active",
        environment: "production",
        metadata: { leadPortal: { leadId: state.lead.id, mode: "lead_preview", preparedAt: now } },
        ...(createdBy ? { created_by: createdBy } : {}),
        updated_at: now,
      },
    }));
    profileId = clean(profile?.id);
    if (!profileId || clean(profile.auth_user_id) !== authUserId || clean(profile.role) !== "demo_user") {
      throw fault("PROFILE_IDENTITY_NOT_CREATED", "Het geïsoleerde demo-profiel kon niet worden voorbereid.", 502);
    }
    return { ...profile, provisional: { authUserId, profileId } };
  } catch (error) {
    await compensateProvisionalIdentity(context, { authUserId, profileId });
    throw error;
  }
}

async function findAuthUsersByEmail(context, email) {
  const matches = [];
  for (let page = 1; page <= 5; page += 1) {
    const data = await authRequest(context, `admin/users?per_page=200&page=${page}`, { method: "GET" });
    const users = Array.isArray(data?.users) ? data.users : [];
    matches.push(...users.filter((user) => normalizeEmail(user?.email) === email));
    if (users.length < 200 || matches.length > 1) break;
  }
  return matches;
}

async function compensateProvisionalIdentity(context, identity = {}) {
  try {
    if (identity.profileId) await restRequest(context, `profiles?id=eq.${encodeURIComponent(identity.profileId)}`, { method: "DELETE" });
  } catch {}
  try {
    if (identity.authUserId) await authRequest(context, `admin/users/${encodeURIComponent(identity.authUserId)}`, { method: "DELETE" });
  } catch {}
}

function adminPayload(state) {
  const workflow = state.journey.preview_package?.savedDemoSite?.workflow || state.journey.preview_package?.saved_demo_site?.workflow || {};
  return {
    eligible: true,
    invitation: {
      status: invitationStatus(state.link, state.invitation),
      expiresAt: state.link?.expires_at || null,
      openedAt: state.link?.opened_at || null,
      activatedAt: state.link?.activated_at || null,
      canRevoke: ["active", "opened"].includes(state.link?.status),
      canRotate: Boolean(state.invitation?.id),
    },
    details: {
      contactName: clean(state.journey.contact_name || state.lead.name),
      companyName: clean(state.journey.business_name || state.lead.company),
      email: state.eligibility.normalizedEmail,
      phone: clean(state.journey.phone || state.lead.phone),
      lead: "Gekoppeld",
      demoJourney: "Gekoppeld",
      previewPublication: "Actief",
      previewVersion: clean(state.preview.title || `Versie ${state.preview.version || ""}`),
      previewSource: state.eligibility.source === "manual_zip" ? "ZIP" : "Factory",
      customer: state.customer?.id ? clean(state.customer.company || state.customer.name || "Bestaande klant") : "Nieuwe lead — nog geen customer",
      project: state.project?.id ? clean(state.project.name || "Gekoppeld project") : "Nog niet gekoppeld",
      deliveryExpectation: clean(workflow.deliveryExpectation || workflow.delivery_expectation || "In overleg"),
      quote: "Niet gekoppeld",
    },
  };
}

async function one(context, table, query) { return first(await many(context, table, query)); }
async function many(context, table, query) {
  const response = await fetch(`${context.url}/rest/v1/${table}?${query}`, { headers: headers(context.key) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw fault(data?.code || "SUPABASE_READ_FAILED", "Uitnodigingsgegevens konden niet veilig worden gecontroleerd.", response.status);
  return Array.isArray(data) ? data : [];
}
async function rpc(context, name, body) {
  const response = await fetch(`${context.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { ...headers(context.key), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw fault(data?.code || "RPC_FAILED", data?.message || "Uitnodigingsactie is veilig gestopt.", response.status);
  return Array.isArray(data) ? data : data;
}
async function restRequest(context, path, options = {}) {
  const response = await fetch(`${context.url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      ...headers(context.key),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw fault(data?.code || "SUPABASE_WRITE_FAILED", "De uitnodigingsidentiteit kon niet veilig worden voorbereid.", response.status);
  return data;
}
async function authRequest(context, path, options = {}) {
  const response = await fetch(`${context.url}/auth/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: context.key,
      Authorization: `Bearer ${context.key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw fault(data?.code || data?.error_code || "AUTH_IDENTITY_FAILED", "Het beveiligde demo-account kon niet veilig worden voorbereid.", response.status);
  return data;
}
async function resolveProfileByEmail(context, email) {
  const rows = await many(context, "profiles", `select=id,auth_user_id,email,role,status&email=eq.${encodeURIComponent(email)}&limit=2`);
  return rows.length === 1 ? rows[0] : null;
}
function headers(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" }; }
function getContext() { const url = clean(process.env.SUPABASE_URL).replace(/\/$/, ""); const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY); return { url, key, available: Boolean(url && key) }; }
function resolveOrigin(event) { const host = clean(event.headers?.["x-forwarded-host"] || event.headers?.["X-Forwarded-Host"] || event.headers?.host || event.headers?.Host).split(",")[0]; if (host) return `https://${host}`; return clean(process.env.DEPLOY_PRIME_URL || process.env.URL || process.env.SITE_URL); }
function parse(body) { try { return JSON.parse(body || "{}"); } catch { throw fault("INVALID_JSON", "Ongeldige invoer.", 400); } }
function uuid(value) { const text = clean(value); return UUID.test(text) ? text : ""; }
function first(value) { return Array.isArray(value) ? value[0] || null : value || null; }
function fault(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
function safeMessage(error) { return error.status && error.status < 500 ? error.message : "Uitnodigingsactie is veilig gestopt. Probeer opnieuw of controleer de koppelingen."; }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders({ methods: "POST, OPTIONS" }) }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { adminPayload, compensateProvisionalIdentity, findAuthUsersByEmail, loadEligibility, provisionLeadIdentity, resolveInvitationIdentity, resolveOrigin };
