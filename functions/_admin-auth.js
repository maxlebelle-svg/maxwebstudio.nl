async function verifyAdmin(event, jsonResponse) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const legacyToken = process.env.ADMIN_TOKEN || "";

  if (legacyToken && bearer && bearer === legacyToken) {
    return { success: true, source: "legacy_admin_token" };
  }

  if (!bearer) {
    return unauthorized(jsonResponse);
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return unauthorized(jsonResponse);
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${bearer}`,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.id) {
      return unauthorized(jsonResponse);
    }

    const profile = await fetchProfileForUser({ supabaseUrl, bearer, authUserId: data.id });
    if (!isAllowedAdminRole(profile?.role, profile?.status)) {
      return unauthorized(jsonResponse);
    }

    return {
      success: true,
      source: "supabase_admin_session",
      admin: {
        id: data.id,
        email: String(data.email || "").trim().toLowerCase(),
        role: profile.role,
        profileId: profile.id,
      },
    };
  } catch (error) {
    console.error("Admin auth verification failed", { message: error.message });
    return unauthorized(jsonResponse);
  }
}

async function fetchProfileForUser({ supabaseUrl, bearer, authUserId }) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const apiKey = serviceRoleKey || process.env.SUPABASE_ANON_KEY || "";
  const authorization = serviceRoleKey ? `Bearer ${serviceRoleKey}` : `Bearer ${bearer}`;
  if (!apiKey || !authUserId) return null;

  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,role,status&auth_user_id=eq.${encodeURIComponent(authUserId)}&limit=1`, {
    method: "GET",
    headers: {
      apikey: apiKey,
      Authorization: authorization,
      Accept: "application/json",
    },
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows)) return null;
  return rows[0] || null;
}

function isAllowedAdminRole(role, status = "active") {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const normalizedStatus = String(status || "active").trim().toLowerCase();
  return normalizedStatus === "active" && ["super_admin", "admin"].includes(normalizedRole);
}

function unauthorized(jsonResponse) {
  return {
    success: false,
    response: jsonResponse(401, { success: false, error: "Niet geautoriseerd." }),
  };
}

module.exports = {
  verifyAdmin,
  isAllowedAdminRole,
};
