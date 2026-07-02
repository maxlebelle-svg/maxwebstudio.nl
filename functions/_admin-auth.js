const DEFAULT_ADMIN_EMAIL = "info@maxwebstudio.nl";

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

    const email = String(data.email || "").trim().toLowerCase();
    if (!isAllowedAdminEmail(email)) {
      return unauthorized(jsonResponse);
    }

    return {
      success: true,
      source: "supabase_admin_session",
      admin: {
        id: data.id,
        email,
      },
    };
  } catch (error) {
    console.error("Admin auth verification failed", { message: error.message });
    return unauthorized(jsonResponse);
  }
}

function isAllowedAdminEmail(email) {
  const allowed = String(process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email);
}

function unauthorized(jsonResponse) {
  return {
    success: false,
    response: jsonResponse(401, { success: false, error: "Niet geautoriseerd." }),
  };
}

module.exports = {
  verifyAdmin,
  isAllowedAdminEmail,
};
