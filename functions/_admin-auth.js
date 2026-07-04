async function verifyAdmin(event, jsonResponse, options = {}) {
  const allowedRoles = Array.isArray(options.allowedRoles) && options.allowedRoles.length
    ? options.allowedRoles.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean)
    : ["super_admin", "admin"];
  const allowedStatuses = Array.isArray(options.allowedStatuses) && options.allowedStatuses.length
    ? options.allowedStatuses.map((status) => String(status || "").trim().toLowerCase()).filter(Boolean)
    : ["active"];
  const diagnostics = {
    module: String(options.module || "").trim(),
    action: String(options.action || "admin"),
  };
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const legacyToken = process.env.ADMIN_TOKEN || "";

  if (!options.disableLegacyToken && legacyToken && bearer && bearer === legacyToken) {
    return { success: true, source: "legacy_admin_token" };
  }

  if (!bearer) {
    return unauthorized(jsonResponse, { ...diagnostics, reason: "missing_bearer" });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return unauthorized(jsonResponse, { ...diagnostics, reason: "missing_supabase_auth_config" });
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
      return unauthorized(jsonResponse, { ...diagnostics, reason: "invalid_supabase_session", status: response.status || 401 });
    }

    const profile = await fetchProfileForUser({ supabaseUrl, bearer, authUserId: data.id });
    if (!isAllowedRole(profile?.role, profile?.status, { allowedRoles, allowedStatuses })) {
      return unauthorized(jsonResponse, {
        ...diagnostics,
        resolvedRole: String(profile?.role || "").trim().toLowerCase(),
        profileStatus: String(profile?.status || "").trim().toLowerCase(),
        reason: "role_or_status_not_allowed",
      });
    }

    return {
      success: true,
      source: "supabase_admin_session",
      admin: {
        id: data.id,
        email: String(data.email || "").trim().toLowerCase(),
        role: profile.role,
        status: profile.status,
        profileId: profile.id,
      },
    };
  } catch (error) {
    console.error("Admin auth verification failed", { message: error.message, module: diagnostics.module, action: diagnostics.action });
    return unauthorized(jsonResponse, { ...diagnostics, reason: "auth_verification_exception" });
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
  return isAllowedRole(role, status, { allowedRoles: ["super_admin", "admin"], allowedStatuses: ["active"] });
}

function isAllowedRole(role, status = "active", options = {}) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const normalizedStatus = String(status || "active").trim().toLowerCase();
  const allowedRoles = Array.isArray(options.allowedRoles) && options.allowedRoles.length ? options.allowedRoles : ["super_admin", "admin"];
  const allowedStatuses = Array.isArray(options.allowedStatuses) && options.allowedStatuses.length ? options.allowedStatuses : ["active"];
  return allowedStatuses.includes(normalizedStatus) && allowedRoles.includes(normalizedRole);
}

function unauthorized(jsonResponse, details = {}) {
  const debug = {
    module: details.module || "",
    action: details.action || "",
    resolvedRole: details.resolvedRole || "",
    status: details.profileStatus || details.status || "",
    reason: details.reason || "unauthorized",
  };
  console.warn("Admin auth rejected", debug);
  return {
    success: false,
    response: jsonResponse(401, {
      success: false,
      error: "Niet geautoriseerd.",
      diagnostics: debug,
    }),
  };
}

module.exports = {
  verifyAdmin,
  isAllowedAdminRole,
  isAllowedRole,
};
