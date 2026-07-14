const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");
const { getCompanySettings, getMailtoLink } = require("./company-settings");
const crypto = require("crypto");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const accountActions = new Set(["invite", "resend", "new_link", "welcome"]);

exports.handler = async (event) => {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { success: false, error: "Alleen GET- en POST-verzoeken zijn toegestaan." });
  }

  const adminCheck = await verifyAdmin(event, jsonResponse);
  if (!adminCheck.success) return adminCheck.response;

  try {
    const payload = event.httpMethod === "GET" ? (event.queryStringParameters || {}) : parsePayload(event.body);
    const canonicalCustomer = await resolveCanonicalCustomer(payload.customerId || payload.relationshipId || payload.id);
    const input = validatePayload(canonicalCustomer);
    if (event.httpMethod === "GET") {
      return jsonResponse(200, { success: true, relationshipType: "customer", relationshipId: input.customerId, account: await readCustomerAccountStatus(input) });
    }
    const action = cleanText(payload.action || "invite").toLowerCase();
    if (!accountActions.has(action)) throwValidation("Kies een geldige accountactie.");
    const actionKey = uuidPattern.test(cleanText(payload.actionKey)) ? cleanText(payload.actionKey) : crypto.randomUUID();
    const authContext = await ensureCustomerAuthContext(input);
    const setupLink = await createInviteOrResetLink(input.email);
    const mailPreview = buildMailPreview(input, setupLink);
    const shouldSend = isProductionEnvironment() && process.env.EMAIL_PROVIDER === "resend" && Boolean(process.env.RESEND_API_KEY);

    if (!shouldSend) {
      return jsonResponse(200, {
        success: true,
        email: {
          requested: true,
          sent: false,
          warning: "Welkomstmail preview klaargezet. Resend is niet geconfigureerd in deze omgeving.",
        },
        mailPreview,
        auth: publicAuthContext(authContext),
        account: { status: authContext.accountStatus, action, actionKey },
      });
    }

    const result = await sendEmail({
      to: input.email,
      from: cleanText(process.env.CUSTOMER_INVITE_FROM_EMAIL) || cleanText(process.env.FROM_EMAIL) || undefined,
      bcc: cleanText(process.env.ADMIN_EMAIL) || undefined,
      subject: mailPreview.subject,
      html: buildWelcomeEmailHtml(input, mailPreview),
      text: mailPreview.text,
      templateKey: "customer_welcome",
      templateName: "Welkomstmail klantportaal",
      customerId: input.customerId,
      triggeredBy: "admin_customer_welcome_email",
      triggeredByUserId: adminCheck.admin?.id,
      metadata: {
        company: input.company,
        website: input.website,
        package: input.package,
        authUserId: authContext.authUserId,
        profileId: authContext.profileId,
        authAction: authContext.authAction,
        accountAction: action,
        actionKey,
      },
      idempotencyKey: `customer.account.invitation:${input.customerId}:${actionKey}`,
    });

    await updateCustomerInvitationStatus(authContext, result.sent ? "sent" : "send_failed", { action, actionKey, providerMessageId: cleanText(result.id) });

    return jsonResponse(200, {
      success: true,
      email: {
        requested: true,
        sent: Boolean(result.sent),
        id: cleanText(result.id),
        warning: cleanText(result.warning),
      },
      mailPreview,
      auth: publicAuthContext(authContext),
      account: { status: result.sent ? "sent" : "send_failed", action, actionKey },
    });
  } catch (error) {
    console.error("Customer welcome email failed", { message: error.message });
    return jsonResponse(error.statusCode || 500, {
      success: false,
      error: error.statusCode ? error.message : "Welkomstmail kon niet veilig worden voorbereid.",
    });
  }
};

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Ongeldige JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

async function resolveCanonicalCustomer(customerId) {
  const id = cleanText(customerId);
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    const error = new Error("Kies een geldige klant.");
    error.statusCode = 400;
    throw error;
  }
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("Klantcontrole is tijdelijk niet beschikbaar.");
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/customers?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Accept: "application/json" },
  });
  const rows = await response.json().catch(() => []);
  const customer = Array.isArray(rows) ? rows[0] : null;
  const metadata = customer?.metadata && typeof customer.metadata === "object" ? customer.metadata : {};
  const unavailable = !customer || customer.archived_at || customer.deleted_at || customer.is_demo || customer.is_test || metadata.archivedAt || metadata.deletedAt || metadata.isDemo || metadata.isTest
    || ["archived", "deleted", "inactive"].includes(cleanText(customer.status || customer.portal_status).toLowerCase())
    || ["demo", "test"].includes(cleanText(customer.environment || metadata.environment).toLowerCase());
  if (!response.ok || unavailable || !emailPattern.test(cleanText(customer?.email))) {
    const error = new Error("Deze klant bestaat niet meer of is niet mailbaar.");
    error.statusCode = response.ok ? 422 : 503;
    throw error;
  }
  return {
    customerId: id,
    name: cleanText(customer.name || customer.contact_name || customer.company || customer.company_name),
    company: cleanText(customer.company || customer.company_name || customer.name),
    email: cleanText(customer.email).toLowerCase(),
    website: cleanText(customer.website || customer.website_url),
    package: cleanText(customer.package || "Basis"),
  };
}

function validatePayload(payload = {}) {
  const input = {
    customerId: cleanText(payload.customerId || payload.id),
    name: cleanText(payload.name || payload.contactName),
    company: cleanText(payload.company || payload.companyName),
    email: cleanText(payload.email).toLowerCase(),
    website: cleanText(payload.website || payload.domain),
    package: cleanText(payload.package || payload.packageName || "Basis"),
  };
  if (!input.name) input.name = input.company || "klant";
  if (!input.company) throwValidation("Vul een bedrijfsnaam in.");
  if (!emailPattern.test(input.email)) throwValidation("Vul een geldig e-mailadres in.");
  return input;
}

async function ensureCustomerAuthContext(input) {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return { configured: false, authUserId: "", profileId: "", authAction: "manual_required", accountStatus: "not_invited", profile: null };
  }

  const authUser = await ensureCustomerAuthUser(supabaseUrl, serviceRoleKey, input);
  if (!authUser?.id) {
    const error = new Error("Klantaccount kon niet worden klaargezet. Controleer Supabase Auth voor dit e-mailadres.");
    error.statusCode = 500;
    throw error;
  }

  const profile = await ensureCustomerProfile(supabaseUrl, serviceRoleKey, input, authUser.id);
  if (!profile?.id) {
    const error = new Error("Accountprofiel kon niet worden klaargezet. Controleer Supabase profiles/auth_user_id configuratie.");
    error.statusCode = 500;
    throw error;
  }
  return {
    configured: true,
    authUserId: cleanText(authUser.id),
    profileId: cleanText(profile?.id),
    authAction: cleanText(authUser.action || "existing"),
    accountStatus: authUser.active || cleanText(profile.status).toLowerCase() === "active" ? "activated" : authUser.action === "created" ? "not_invited" : invitationStatus(profile),
    profile,
  };
}

async function ensureCustomerAuthUser(supabaseUrl, serviceRoleKey, input) {
  const email = cleanText(input.email).toLowerCase();
  const existing = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
  if (existing?.id) return { id: existing.id, action: "existing", active: Boolean(existing.email_confirmed_at || existing.confirmed_at || existing.last_sign_in_at) };

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email,
      password: crypto.randomBytes(24).toString("base64url"),
      email_confirm: true,
      user_metadata: {
        name: input.name,
        company: input.company,
        createdBy: "admin_customer_welcome_email",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Customer auth user create failed", { status: response.status, message: data.message || data.error || "" });
    return null;
  }
  return data?.id ? { id: data.id, action: "created", active: false } : null;
}

async function readCustomerAccountStatus(input) {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) return { status: "not_invited", configured: false };
  const authUser = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, input.email);
  if (!authUser?.id) return { status: "not_invited", configured: true, hasAuthUser: false };
  const profile = await findProfileForAuthUser(supabaseUrl, serviceRoleKey, authUser.id, input.email);
  const active = Boolean(authUser.email_confirmed_at || authUser.confirmed_at || authUser.last_sign_in_at) || cleanText(profile?.status).toLowerCase() === "active";
  return {
    status: active ? "activated" : invitationStatus(profile),
    configured: true,
    hasAuthUser: true,
    hasProfile: Boolean(profile?.id),
    authUserId: authUser.id,
    profileId: profile?.id || "",
  };
}

function invitationStatus(profile) {
  const metadata = profile?.metadata && typeof profile.metadata === "object" ? profile.metadata : {};
  const status = cleanText(metadata.accountInvitationStatus || metadata.account_invitation_status);
  if (["planned", "sent", "link_expired", "send_failed"].includes(status)) return status;
  return cleanText(profile?.status).toLowerCase() === "invited" ? "sent" : "not_invited";
}

async function updateCustomerInvitationStatus(authContext, status, details = {}) {
  const profile = authContext?.profile;
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!profile?.id || !supabaseUrl || !serviceRoleKey) return;
  const metadata = {
    ...(profile.metadata && typeof profile.metadata === "object" ? profile.metadata : {}),
    accountInvitationStatus: status,
    accountInvitationAction: cleanText(details.action),
    accountInvitationActionKey: cleanText(details.actionKey),
    accountInvitationProviderMessageId: cleanText(details.providerMessageId),
    accountInvitationUpdatedAt: new Date().toISOString(),
  };
  try {
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
      method: "PATCH",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", "Content-Profile": "public", Prefer: "return=minimal" },
      body: JSON.stringify({ metadata, updated_at: new Date().toISOString() }),
    });
  } catch (error) {
    console.warn("Customer invitation status could not be recorded", { message: error.message });
  }
}

function isProductionEnvironment() {
  return [process.env.APP_ENV, process.env.APP_ENVIRONMENT, process.env.CONTEXT, process.env.NODE_ENV]
    .map((value) => cleanText(value).toLowerCase())
    .some((value) => ["production", "prod"].includes(value));
}

function publicAuthContext(context = {}) {
  return {
    configured: Boolean(context.configured),
    authUserId: cleanText(context.authUserId),
    profileId: cleanText(context.profileId),
    authAction: cleanText(context.authAction),
    accountStatus: cleanText(context.accountStatus),
  };
}

async function findAuthUserByEmail(supabaseUrl, serviceRoleKey, email) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200&page=1`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return (Array.isArray(data.users) ? data.users : []).find((user) => cleanText(user.email).toLowerCase() === email) || null;
}

async function ensureCustomerProfile(supabaseUrl, serviceRoleKey, input, authUserId) {
  const now = new Date().toISOString();
  const existingProfile = await findProfileForAuthUser(supabaseUrl, serviceRoleKey, authUserId, input.email);
  const existingMetadata = existingProfile?.metadata && typeof existingProfile.metadata === "object" ? existingProfile.metadata : {};
  const record = {
    auth_user_id: authUserId,
    name: cleanText(existingProfile?.name) || input.name,
    email: cleanText(existingProfile?.email) || input.email,
    company: cleanText(existingProfile?.company) || input.company,
    website: cleanText(existingProfile?.website) || input.website,
    package: cleanText(existingProfile?.package) || input.package,
    role: cleanText(existingProfile?.role) || "customer",
    status: cleanText(existingProfile?.status) || "invited",
    updated_at: now,
    metadata: {
      ...existingMetadata,
      customerId: input.customerId,
      provisionedVia: "admin_customer_welcome_email",
      provisionedAt: now,
    },
  };

  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=auth_user_id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Accept: "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(record),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Customer profile upsert failed", { status: response.status, message: data.message || data.error || "" });
    return null;
  }
  return Array.isArray(data) ? data[0] : data;
}

async function findProfileForAuthUser(supabaseUrl, serviceRoleKey, authUserId, email) {
  const query = [
    `auth_user_id.eq.${encodeURIComponent(authUserId)}`,
    `email.eq.${encodeURIComponent(cleanText(email).toLowerCase())}`,
  ].join(",");
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,auth_user_id,name,email,role,status,company,website,package,metadata&or=(${query})&limit=1`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ([]));
  if (!response.ok || !Array.isArray(data)) return null;
  return data[0] || null;
}

async function createInviteOrResetLink(email) {
  const companySettings = getCompanySettings();
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const redirectTo = cleanText(process.env.CLIENT_PORTAL_REDIRECT_URL) || `${companySettings.websiteUrl}/login.html`;
  if (!supabaseUrl || !serviceRoleKey) {
    return { status: "manual_required", actionLink: "", redirectTo };
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ type: "recovery", email, redirect_to: redirectTo }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { status: "manual_required", actionLink: "", redirectTo };
    const actionLink = cleanText(data.action_link || data.actionLink || data.properties?.action_link || data.properties?.actionLink);
    return { status: actionLink ? "generated" : "manual_required", actionLink, redirectTo };
  } catch {
    return { status: "manual_required", actionLink: "", redirectTo };
  }
}

function buildMailPreview(input, setupLink = {}) {
  const companySettings = getCompanySettings();
  const loginLink = cleanText(setupLink.actionLink) || cleanText(setupLink.redirectTo) || `${companySettings.websiteUrl}/login.html`;
  const setupInstruction = setupLink.status === "generated"
    ? "Via onderstaande knop kun je veilig je account activeren en zelf je wachtwoord instellen."
    : "Open de loginpagina en kies wachtwoord opnieuw instellen om veilig je eigen wachtwoord te maken.";
  const subject = `Welkom bij ${companySettings.companyName} – klantportaal voor ${input.company}`;
  const text = [
    `Hoi ${input.name},`,
    "",
    `Je klantportaal voor ${input.company} staat klaar bij ${companySettings.companyName}.`,
    input.website ? `Gekoppelde website: ${input.website}` : "",
    input.package ? `Onderhoudspakket: ${input.package}` : "",
    "",
    setupInstruction,
    "",
    `Account openen: ${loginLink}`,
    "",
    "Er worden geen wachtwoorden per mail verstuurd. Je stelt je wachtwoord zelf veilig in.",
    "",
    `Vragen? Mail naar ${companySettings.primaryEmail}.`,
    "",
    "Met vriendelijke groet,",
    companySettings.companyName,
  ].filter(Boolean).join("\n");
  return { subject, loginLink, buttonLabel: setupLink.status === "generated" ? "Account activeren" : "Login openen", text };
}

function buildWelcomeEmailHtml(input, mailPreview) {
  const companySettings = getCompanySettings();
  const name = escapeHtml(input.name);
  const company = escapeHtml(input.company);
  const website = escapeHtml(input.website);
  const packageName = escapeHtml(input.package);
  const actionLink = escapeHtml(mailPreview.loginLink);
  const buttonLabel = escapeHtml(mailPreview.buttonLabel);
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(mailPreview.subject)}</title></head><body style="margin:0;background:#061626;color:#ffffff;font-family:Inter,Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#061626;padding:28px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#102a3d;border:1px solid rgba(68,180,255,.26);border-radius:24px;overflow:hidden;"><tr><td style="padding:32px 30px 18px;"><div style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#27c7ff;font-weight:800;">${escapeHtml(companySettings.companyName)}</div><h1 style="margin:14px 0 10px;font-size:32px;line-height:1.12;color:#ffffff;">Je klantportaal staat klaar.</h1><p style="margin:0;color:#c9d7e8;font-size:16px;line-height:1.7;">Hoi ${name}, je klantportaal voor <strong style="color:#ffffff;">${company}</strong> is klaargezet.</p></td></tr><tr><td style="padding:0 30px 24px;"><p style="margin:0 0 18px;color:#c9d7e8;font-size:16px;line-height:1.7;">${website ? `Website: <strong style="color:#ffffff;">${website}</strong><br />` : ""}${packageName ? `Onderhoudspakket: <strong style="color:#ffffff;">${packageName}</strong>` : ""}</p><p style="margin:0 0 18px;color:#c9d7e8;font-size:16px;line-height:1.7;">Er worden geen wachtwoorden per mail verstuurd. Je stelt je wachtwoord zelf veilig in.</p><a href="${actionLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800;border-radius:14px;padding:14px 20px;">${buttonLabel}</a><p style="margin:18px 0 0;color:#91a6bc;font-size:13px;line-height:1.6;">Werkt de knop niet? Open dan deze link:<br /><a href="${actionLink}" style="color:#7dd3fc;">${actionLink}</a></p></td></tr><tr><td style="padding:22px 30px;background:rgba(255,255,255,.05);color:#aabbd0;font-size:13px;line-height:1.6;">Heb je vragen? Reageer op deze mail of mail naar <a href="${escapeAttribute(getMailtoLink(companySettings, "Vraag over klantportaal"))}" style="color:#7dd3fc;">${escapeHtml(companySettings.primaryEmail)}</a>.</td></tr></table></td></tr></table></body></html>`;
}

function throwValidation(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function cleanText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

exports._test = { invitationStatus, isProductionEnvironment, publicAuthContext };
