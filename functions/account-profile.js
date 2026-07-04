exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
  }

  const bearer = getBearer(event);
  if (!bearer) {
    return jsonResponse(401, { success: false, error: "Niet ingelogd." });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Profielcontrole is nog niet geconfigureerd." });
  }

  try {
    const authUser = await supabaseFetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json",
      },
    });

    const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/profiles?select=id,auth_user_id,name,email,role,status,last_login_at,metadata&auth_user_id=eq.${encodeURIComponent(authUser.id)}&limit=1`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
        "Accept-Profile": "public",
      },
    });
    const profile = Array.isArray(rows) ? rows[0] : null;

    if (!profile?.id || !profile.role) {
      return jsonResponse(403, {
        success: false,
        code: "PROFILE_ROLE_MISSING",
        error: "Account bestaat, maar profiel/rol ontbreekt. Vraag een beheerder om toegang te activeren.",
      });
    }

    return jsonResponse(200, {
      success: true,
      user: {
        id: cleanText(authUser.id),
        email: cleanText(authUser.email).toLowerCase(),
      },
      profile: normalizeProfile(profile),
    });
  } catch (error) {
    console.error("Account profile lookup failed", { message: error.message, status: error.status });
    return jsonResponse(error.status || 500, {
      success: false,
      error: error.status ? error.message : "Profiel kon niet worden gecontroleerd.",
    });
  }
};

function getBearer(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
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

function normalizeProfile(row = {}) {
  return {
    id: cleanText(row.id),
    authUserId: cleanText(row.auth_user_id),
    name: cleanText(row.name),
    email: cleanText(row.email).toLowerCase(),
    role: cleanText(row.role).toLowerCase(),
    status: cleanText(row.status || "active").toLowerCase(),
    customerId: cleanText(row.customer_id || row.metadata?.customerId),
    lastLoginAt: cleanText(row.last_login_at),
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
