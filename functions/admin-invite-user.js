const { verifyAdmin } = require("./_admin-auth");

const allowedRoles = new Set(["super_admin", "admin", "sales_manager", "sales_partner", "developer", "designer", "support", "customer"]);
const allowedStatuses = new Set(["invited", "active", "disabled", "archived"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const authUser = existingUser || await inviteAuthUser(supabaseUrl, serviceRoleKey, input);
    const profile = await upsertProfile(supabaseUrl, serviceRoleKey, {
      ...input,
      authUserId: authUser.id,
      createdBy: adminCheck.admin?.id || null,
      inviteSentAt: existingUser ? null : new Date().toISOString(),
    });

    let setupLinkSent = !existingUser;
    if (existingUser && action === "send_password_reset") {
      await sendPasswordReset(supabaseUrl, serviceRoleKey, input.email);
      setupLinkSent = true;
    }

    return jsonResponse(200, {
      success: true,
      action,
      authUser: normalizeAuthUser(authUser),
      profile: normalizeProfile(profile),
      createdAuthUser: !existingUser,
      setupLinkSent,
      message: setupLinkSent
        ? "Uitnodiging/setup-link is verstuurd."
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

function validateInvitePayload(payload = {}) {
  const name = cleanText(payload.name || payload.naam);
  const email = cleanText(payload.email).toLowerCase();
  const phone = cleanText(payload.phone || payload.telephone || payload.telefoon);
  const role = cleanText(payload.role || "sales_partner").toLowerCase();
  const status = cleanText(payload.status || "invited").toLowerCase();

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

async function inviteAuthUser(supabaseUrl, serviceRoleKey, input) {
  const redirectTo = process.env.SUPABASE_INVITE_REDIRECT_TO || process.env.URL
    ? `${String(process.env.SUPABASE_INVITE_REDIRECT_TO || process.env.URL).replace(/\/$/, "")}/login.html?type=recovery`
    : "";
  const inviteUrl = new URL(`${supabaseUrl}/auth/v1/invite`);
  if (redirectTo) inviteUrl.searchParams.set("redirect_to", redirectTo);
  return supabaseFetch(inviteUrl.toString(), {
    method: "POST",
    headers: authAdminHeaders(serviceRoleKey),
    body: JSON.stringify({
      email: input.email,
      data: { name: input.name, role: input.role },
    }),
  });
}

async function sendPasswordReset(supabaseUrl, serviceRoleKey, email) {
  const redirectTo = process.env.SUPABASE_INVITE_REDIRECT_TO || process.env.URL
    ? `${String(process.env.SUPABASE_INVITE_REDIRECT_TO || process.env.URL).replace(/\/$/, "")}/login.html?type=recovery`
    : "";
  const recoverUrl = new URL(`${supabaseUrl}/auth/v1/recover`);
  if (redirectTo) recoverUrl.searchParams.set("redirect_to", redirectTo);
  await supabaseFetch(recoverUrl.toString(), {
    method: "POST",
    headers: authAdminHeaders(serviceRoleKey),
    body: JSON.stringify({ email }),
  });
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
