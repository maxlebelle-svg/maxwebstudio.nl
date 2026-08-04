const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");
const crypto = require("crypto");
const {
  CANONICAL_ROLES,
  CANONICAL_PROFILE_STATUSES,
  normalizeRole,
  normalizeProfileStatus,
} = require("./services/profileAccessPolicy");

const allowedRoles = new Set(CANONICAL_ROLES.filter((role) => role !== "demo_user"));
const allowedStatuses = new Set(CANONICAL_PROFILE_STATUSES);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const productionActivationUrl = "https://maxwebstudio.nl/account-activeren";
const productionPartnerActivationUrl = "https://maxwebstudio.nl/account-activeren?context=partner";
const productionPartnerOnboardingUrl = "https://maxwebstudio.nl/partner-onboarding.html";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  }

  const adminCheck = await verifyAdmin(event, jsonResponse);
  if (!adminCheck.success) return adminCheck.response;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Invite-flow is nog niet geconfigureerd." });
  }

  try {
    const payload = parsePayload(event.body);
    const action = cleanText(payload.action || "invite");
    const input = validateInvitePayload(payload);
    if (!input.success) return jsonResponse(400, input);

    const existingUser = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, input.email);
    let authUser = existingUser;
    let setupLink = { actionLink: "", authUser: null };
    const existingPartnerOnboardingInvite = action === "onboarding_invite" && Boolean(existingUser);
    if (existingPartnerOnboardingInvite) {
      setupLink = await generateEmployeeSetupLink(supabaseUrl, serviceRoleKey, input, "magiclink", partnerOnboardingRedirectTo());
    } else if (existingUser || action === "send_password_reset") {
      setupLink = await generateEmployeeSetupLink(supabaseUrl, serviceRoleKey, input, "recovery");
    } else {
      setupLink = await generateEmployeeSetupLink(supabaseUrl, serviceRoleKey, input, "invite");
      authUser = setupLink.authUser || null;
    }
    if (!authUser) {
      authUser = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, input.email);
    }
    if (!authUser) {
      authUser = await createAuthUserSilently(supabaseUrl, serviceRoleKey, input);
      setupLink = await generateEmployeeSetupLink(supabaseUrl, serviceRoleKey, input, "recovery");
    }
    const profile = await upsertProfile(supabaseUrl, serviceRoleKey, {
      ...input,
      authUserId: authUser.id,
      createdBy: adminCheck.admin?.id || null,
      inviteSentAt: existingUser ? null : new Date().toISOString(),
    });
    if (input.role === "sales_partner") {
      await initializePartnerOnboarding(supabaseUrl, serviceRoleKey, {
        profileId: profile.id,
        createdByProfileId: adminCheck.admin?.profileId || null,
        managerProfileId: cleanText(payload.managerProfileId || payload.manager_profile_id) || null,
      });
      if (existingPartnerOnboardingInvite) {
        await activateExistingPartnerOnboarding(supabaseUrl, serviceRoleKey, authUser.id);
      }
    }

    let setupLinkSent = false;
    let customMailSent = false;
    let mailWarning = "";
    if (!existingUser || action === "send_password_reset" || action === "invite" || action === "onboarding_invite") {
      if (setupLink.actionLink) {
        const mailResult = await sendEmployeeInviteMail(input, setupLink.actionLink, { onboardingOnly: existingPartnerOnboardingInvite });
        customMailSent = Boolean(mailResult.sent);
        mailWarning = cleanText(mailResult.warning);
      }
      if (customMailSent) {
        setupLinkSent = true;
      } else if (setupLink.actionLink) {
        mailWarning = mailWarning || "Setup-link is aangemaakt, maar de Max Webstudio mail kon niet worden verstuurd.";
      } else {
        mailWarning = mailWarning || "Setup-link kon niet worden aangemaakt. Er is geen Supabase standaardmail verstuurd om localhost-links te voorkomen.";
      }
    }

    return jsonResponse(200, {
      success: true,
      action,
      authUser: normalizeAuthUser(authUser),
      profile: normalizeProfile(profile),
      createdAuthUser: !existingUser,
      setupLinkSent,
      customMailSent,
      mailWarning,
      activationRedirectTo: inviteRedirectTo(),
      message: setupLinkSent
        ? customMailSent
          ? action === "onboarding_invite"
            ? "De persoonlijke onboardinguitnodiging is verstuurd."
            : "Professionele Max Webstudio uitnodiging is verstuurd."
          : "Setup-link is aangemaakt, maar mail verzenden is niet gelukt. Probeer opnieuw."
        : "Bestaande gebruiker is bijgewerkt. Gebruik de resetlink-actie als wachtwoord setup nodig is.",
    });
  } catch (error) {
    console.error("Admin invite user error", { message: error.message, status: error.status });
    return jsonResponse(error.status || 500, {
      success: false,
      error: error.status ? error.message : "Gebruiker kon niet worden uitgenodigd.",
    });
  }
};

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Ongeldige JSON body.");
    error.status = 400;
    throw error;
  }
}

function inviteRedirectTo() {
  const configured = cleanText(process.env.SUPABASE_INVITE_REDIRECT_TO || process.env.EMPLOYEE_INVITE_REDIRECT_URL);
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) return configured;
  return productionActivationUrl;
}

function partnerOnboardingRedirectTo() {
  const configured = cleanText(process.env.PARTNER_ONBOARDING_INVITE_REDIRECT_TO);
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) return configured;
  return productionPartnerOnboardingUrl;
}

function partnerActivationRedirectTo() {
  const configured = cleanText(process.env.PARTNER_ACTIVATION_REDIRECT_TO);
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) return configured;
  return productionPartnerActivationUrl;
}

function forceInviteRedirect(actionLink = "") {
  const cleanLink = cleanText(actionLink);
  if (!cleanLink) return "";

  try {
    const url = new URL(cleanLink);
    url.searchParams.set("redirect_to", inviteRedirectTo());
    return url.toString();
  } catch {
    return cleanLink;
  }
}

function validateInvitePayload(payload = {}) {
  const name = cleanText(payload.name || payload.naam);
  const email = cleanText(payload.email).toLowerCase();
  const phone = cleanText(payload.phone || payload.telephone || payload.telefoon);
  const role = normalizeRole(payload.role || "sales_partner");
  const status = normalizeProfileStatus(payload.status || "invited");

  if (!name) return { success: false, error: "Vul een naam in." };
  if (!emailPattern.test(email)) return { success: false, error: "Vul een geldig e-mailadres in." };
  if (!allowedRoles.has(role)) return { success: false, error: "Kies een geldige rol." };
  if (!allowedStatuses.has(status)) return { success: false, error: "Kies een geldige status." };

  return { success: true, name, email, phone, role, status };
}

async function findAuthUserByEmail(supabaseUrl, serviceRoleKey, email) {
  const data = await supabaseFetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200&page=1`, {
    method: "GET",
    headers: authAdminHeaders(serviceRoleKey),
  });
  const users = Array.isArray(data?.users) ? data.users : [];
  return users.find((user) => cleanText(user.email).toLowerCase() === email) || null;
}

async function createAuthUserSilently(supabaseUrl, serviceRoleKey, input) {
  return supabaseFetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: authAdminHeaders(serviceRoleKey),
    body: JSON.stringify({
      email: input.email,
      password: crypto.randomBytes(24).toString("base64url"),
      email_confirm: true,
      user_metadata: { name: input.name, role: input.role },
    }),
  });
}

async function generateEmployeeSetupLink(supabaseUrl, serviceRoleKey, input, type = "invite", redirectTo = inviteRedirectTo()) {
  try {
    const data = await supabaseFetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: authAdminHeaders(serviceRoleKey),
      body: JSON.stringify({
        type,
        email: input.email,
        data: { name: input.name, role: input.role },
        redirect_to: redirectTo,
      }),
    });
    const rawActionLink = cleanText(data.action_link || data.actionLink || data.properties?.action_link || data.properties?.actionLink);
    return {
      actionLink: type === "magiclink" ? forceRedirect(rawActionLink, redirectTo) : forceInviteRedirect(rawActionLink),
      authUser: data.user || data.properties?.user || null,
    };
  } catch (error) {
    console.error("Employee setup link generation failed", { message: error.message, status: error.status });
    return { actionLink: "", authUser: null };
  }
}

async function sendEmployeeInviteMail(input, actionLink, options = {}) {
  const onboardingOnly = Boolean(options.onboardingOnly);
  const safeActionLink = onboardingOnly
    ? forceRedirect(actionLink, partnerOnboardingRedirectTo())
    : input.role === "sales_partner"
      ? forceRedirect(actionLink, partnerActivationRedirectTo())
      : forceInviteRedirect(actionLink);
  const firstName = cleanText(input.name).split(/\s+/)[0] || "daar";
  const roleLabel = input.role === "sales_partner" ? "Sales Partner" : input.role.replace(/_/g, " ");
  const subject = onboardingOnly ? "Je Max Webstudio-onboarding staat klaar" : "Welkom bij Max Webstudio";
  const text = [
    `Hoi ${firstName},`,
    "",
    onboardingOnly ? "Je Max Webstudio-onboarding staat voor je klaar." : "Welkom bij Max Webstudio.",
    "",
    onboardingOnly
      ? `Via onderstaande persoonlijke link log je veilig in als ${roleLabel} en open je direct je onboarding.`
      : `Je bent uitgenodigd als ${roleLabel}. Via onderstaande link activeer je je account en kies je je wachtwoord.`,
    "",
    `${onboardingOnly ? "Onboarding starten" : "Account activeren"}: ${safeActionLink}`,
    "",
    onboardingOnly
      ? "Doorloop de leerstof, de kennistoets, je ZZP-dossier en daarna de digitale overeenkomst."
      : input.role === "sales_partner" ? "Na activatie start je eerst met jouw beveiligde partneronboarding." : "Na activatie kom je direct in jouw dashboard.",
    "",
    "Groet,",
    "Max Webstudio",
  ].join("\n");
  const html = buildEmployeeInviteHtml({ firstName, roleLabel, actionLink: safeActionLink, isSalesPartner: input.role === "sales_partner", onboardingOnly });
  return sendEmail({
    to: input.email,
    from: cleanText(process.env.EMPLOYEE_INVITE_FROM_EMAIL) || cleanText(process.env.FROM_EMAIL) || undefined,
    subject,
    html,
    text,
    messageType: onboardingOnly ? "employee_onboarding_invite" : "employee_account_activation",
    templateKey: onboardingOnly ? "employee_onboarding_invite" : "employee_account_activation",
    idempotencyKey: crypto.createHash("sha256").update([
      onboardingOnly ? "employee-onboarding-invite" : "employee-account-activation",
      input.email,
      safeActionLink,
    ].join(":"), "utf8").digest("hex"),
    sensitiveContent: true,
    triggeredBy: "admin_invite_user",
  });
}

function buildEmployeeInviteHtml({ firstName, roleLabel, actionLink, isSalesPartner, onboardingOnly = false }) {
  const safeName = escapeHtml(firstName);
  const safeRole = escapeHtml(roleLabel);
  const safeLink = escapeHtml(actionLink);
  const logoUrl = "https://maxwebstudio.nl/assets/email/maxwebstudio-logo-mark-light-v1.png";
  return `<!doctype html>
<html lang="nl">
  <body style="margin:0;background:#07121f;font-family:Inter,Arial,sans-serif;color:#102033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07121f;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 30px;background:#0f2742;color:#ffffff;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;">
                  <tr>
                    <td style="width:58px;vertical-align:middle;">
                      <img src="${logoUrl}" width="48" height="48" alt="Max Webstudio logo" style="display:block;border:0;border-radius:12px;background:#06121f;">
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:#83e6c6;">Max Webstudio</div>
                      <h1 style="margin:8px 0 0;font-size:28px;line-height:1.15;">${onboardingOnly ? "Je onboarding staat klaar" : "Welkom bij Max Webstudio"}</h1>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Hoi ${safeName},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">${onboardingOnly ? `Via onderstaande persoonlijke link log je veilig in als <strong>${safeRole}</strong> en open je direct je onboarding.` : `Je bent uitgenodigd als <strong>${safeRole}</strong>. Via onderstaande knop activeer je je account en kies je je wachtwoord.`}</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.65;">${onboardingOnly ? "Doorloop de leerstof, de kennistoets, je ZZP-dossier en daarna de digitale overeenkomst." : isSalesPartner ? "Na activatie start je eerst met jouw beveiligde partneronboarding." : "Na activatie kom je direct in jouw dashboard."}</p>
                <a href="${safeLink}" style="display:inline-block;background:#28d39a;color:#07121f;text-decoration:none;font-weight:900;padding:14px 20px;border-radius:10px;">${onboardingOnly ? "Start je onboarding" : "Account activeren"}</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#5b6b7c;">Werkt de knop niet? Kopieer deze link:<br><a href="${safeLink}" style="color:#0f6f92;">${safeLink}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function upsertProfile(supabaseUrl, serviceRoleKey, input) {
  const record = {
    auth_user_id: input.authUserId,
    name: input.name,
    email: input.email,
    role: input.role,
    status: input.status,
    created_by: input.createdBy,
    environment: "production",
    metadata: {
      inviteFlow: "admin-invite-user",
      inviteSentAt: input.inviteSentAt,
      phone: input.phone || null,
    },
    updated_at: new Date().toISOString(),
  };

  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=auth_user_id`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(record),
  });
  return Array.isArray(data) ? data[0] : data;
}

async function initializePartnerOnboarding(supabaseUrl, serviceRoleKey, input) {
  if (!input.profileId) throw Object.assign(new Error("Partnerprofiel ontbreekt na uitnodiging."), { status: 500 });
  return supabaseFetch(`${supabaseUrl}/rest/v1/rpc/partner_initialize_onboarding`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
    },
    body: JSON.stringify({
      input_profile_id: input.profileId,
      input_created_by_profile_id: input.createdByProfileId,
      input_manager_profile_id: input.managerProfileId,
    }),
  });
}

async function activateExistingPartnerOnboarding(supabaseUrl, serviceRoleKey, authUserId) {
  if (!authUserId) throw Object.assign(new Error("Auth-account ontbreekt voor onboardingactivatie."), { status: 500 });
  return supabaseFetch(`${supabaseUrl}/rest/v1/rpc/partner_mark_account_activated`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
    },
    body: JSON.stringify({
      input_auth_user_id: authUserId,
      input_idempotency_key: `partner-onboarding-invite:${authUserId}`,
    }),
  });
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function authAdminHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };
}

function normalizeAuthUser(user = {}) {
  return {
    id: cleanText(user.id),
    email: cleanText(user.email),
    confirmedAt: cleanText(user.confirmed_at || user.email_confirmed_at),
    lastSignInAt: cleanText(user.last_sign_in_at),
  };
}

function normalizeProfile(row = {}) {
  return {
    id: cleanText(row.id),
    authUserId: cleanText(row.auth_user_id),
    name: cleanText(row.name),
    email: cleanText(row.email),
    role: cleanText(row.role),
    status: cleanText(row.status),
  };
}

function cleanText(value) {
  return String(value || "").trim();
}

function forceRedirect(actionLink = "", redirectTo = "") {
  const cleanLink = cleanText(actionLink);
  if (!cleanLink) return "";
  try {
    const url = new URL(cleanLink);
    url.searchParams.set("redirect_to", redirectTo);
    return url.toString();
  } catch {
    return cleanLink;
  }
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

exports._test = { buildEmployeeInviteHtml, forceRedirect, partnerOnboardingRedirectTo };
