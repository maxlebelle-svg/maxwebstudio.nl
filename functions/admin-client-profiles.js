const PROFILE_FIELDS = ["id", "auth_user_id", "name", "company", "website", "package", "created_at", "updated_at"].join(",");
const REQUEST_FIELDS = ["first_name", "last_name", "company_name", "email", "website", "care_plan", "auth_user_id"].join(",");
const allowedPackages = new Set(["Basis", "Plus", "Premium"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { success: false, error: "Alleen GET- en POST-verzoeken zijn toegestaan." });
  }

  const adminCheck = verifyAdmin(event);
  if (!adminCheck.success) return adminCheck.response;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Admin client profiles missing Supabase configuration", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });

    return jsonResponse(500, {
      success: false,
      error: "Klantprofielen konden niet worden beheerd.",
    });
  }

  try {
    if (event.httpMethod === "GET") {
      const [profiles, authUsers, changeRequests] = await Promise.all([
        fetchProfiles(supabaseUrl, serviceRoleKey),
        fetchAuthUsers(supabaseUrl, serviceRoleKey),
        fetchRequestCandidates(supabaseUrl, serviceRoleKey),
      ]);

      return jsonResponse(200, {
        success: true,
        profiles: profiles.map(normalizeProfile),
        authUsers: authUsers.map(normalizeAuthUser).filter((user) => user.id),
        clientCandidates: buildClientCandidates(profiles, changeRequests),
      });
    }

    const payload = parsePayload(event.body);
    const validation = validateProfilePayload(payload);
    if (!validation.success) {
      return jsonResponse(400, { success: false, error: validation.error });
    }

    const savedProfile = await upsertProfile(supabaseUrl, serviceRoleKey, validation.profile);
    const linkedRequests = await linkExistingRequests(supabaseUrl, serviceRoleKey, validation.profile);

    return jsonResponse(200, {
      success: true,
      profile: normalizeProfile(savedProfile),
      linkedRequests,
    });
  } catch (error) {
    console.error("Admin client profiles error", { message: error.message });
    return jsonResponse(error.statusCode || 500, {
      success: false,
      error: error.statusCode ? error.message : "Klantprofielen konden niet worden beheerd.",
    });
  }
};

function verifyAdmin(event) {
  const expectedToken = process.env.ADMIN_TOKEN;
  const authHeader = event.headers.authorization || event.headers.Authorization || "";

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return {
      success: false,
      response: jsonResponse(401, { success: false, error: "Niet geautoriseerd." }),
    };
  }

  return { success: true };
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    const parseError = new Error("Ongeldige JSON body.");
    parseError.statusCode = 400;
    throw parseError;
  }
}

function validateProfilePayload(payload) {
  const authUserId = cleanText(payload.authUserId);
  const name = cleanText(payload.name);
  const company = cleanText(payload.company);
  const website = cleanText(payload.website);
  const selectedPackage = cleanText(payload.package);
  const requestEmail = cleanText(payload.requestEmail).toLowerCase();

  if (!uuidPattern.test(authUserId)) {
    return { success: false, error: "Kies een geldige Supabase Auth gebruiker." };
  }

  if (!name) {
    return { success: false, error: "Vul een klantnaam in." };
  }

  if (!company) {
    return { success: false, error: "Vul een bedrijfsnaam in." };
  }

  if (!allowedPackages.has(selectedPackage)) {
    return { success: false, error: "Kies een geldig onderhoudspakket." };
  }

  return {
    success: true,
    profile: {
      authUserId,
      name,
      company,
      website,
      package: selectedPackage,
      requestEmail,
    },
  };
}

async function fetchProfiles(supabaseUrl, serviceRoleKey) {
  return supabaseFetch(
    `${supabaseUrl}/rest/v1/profiles?select=${PROFILE_FIELDS}&order=company.asc.nullslast`,
    {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    }
  );
}

async function fetchAuthUsers(supabaseUrl, serviceRoleKey) {
  const data = await supabaseFetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200&page=1`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });

  return Array.isArray(data?.users) ? data.users : [];
}

async function fetchRequestCandidates(supabaseUrl, serviceRoleKey) {
  return supabaseFetch(
    `${supabaseUrl}/rest/v1/change_requests?select=${REQUEST_FIELDS}&order=created_at.desc&limit=200`,
    {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    }
  );
}

async function upsertProfile(supabaseUrl, serviceRoleKey, profile) {
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=auth_user_id`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      auth_user_id: profile.authUserId,
      name: profile.name,
      company: profile.company,
      website: profile.website,
      package: profile.package,
      updated_at: new Date().toISOString(),
    }),
  });

  const savedProfile = Array.isArray(data) ? data[0] : data;
  if (!savedProfile) throw new Error("Supabase returned no profile after upsert.");
  return savedProfile;
}

async function linkExistingRequests(supabaseUrl, serviceRoleKey, profile) {
  if (!profile.requestEmail) return 0;

  const data = await supabaseFetch(
    `${supabaseUrl}/rest/v1/change_requests?email=eq.${encodeURIComponent(profile.requestEmail)}&auth_user_id=is.null`,
    {
      method: "PATCH",
      headers: {
        ...restHeaders(serviceRoleKey),
        "Content-Type": "application/json",
        "Content-Profile": "public",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ auth_user_id: profile.authUserId }),
    }
  );

  return Array.isArray(data) ? data.length : 0;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("Admin client profiles received non-JSON Supabase response", {
        status: response.status,
        bodyPreview: text.slice(0, 160),
      });
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }

  if (!response.ok) {
    console.error("Admin client profiles Supabase error", {
      status: response.status,
      message: data?.message || data?.error || "Unknown Supabase error",
    });
    throw new Error(data?.message || data?.error || "Supabase request failed.");
  }

  return data;
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };
}

function buildClientCandidates(profiles, changeRequests) {
  const candidates = new Map();

  profiles.forEach((profile) => {
    const normalizedProfile = normalizeProfile(profile);
    candidates.set(`profile:${normalizedProfile.authUserId}`, {
      key: `profile:${normalizedProfile.authUserId}`,
      label: `${normalizedProfile.company || normalizedProfile.name} - gekoppeld profiel`,
      name: normalizedProfile.name,
      company: normalizedProfile.company,
      website: normalizedProfile.website,
      package: normalizedProfile.package,
      authUserId: normalizedProfile.authUserId,
      email: "",
      profileId: normalizedProfile.id,
      createdAt: normalizedProfile.createdAt,
    });
  });

  changeRequests.forEach((request) => {
    const email = cleanText(request.email).toLowerCase();
    const company = cleanText(request.company_name);
    const key = email ? `request:${email}` : `request:${company.toLowerCase()}`;

    if (!key || candidates.has(key)) return;

    const name = [cleanText(request.first_name), cleanText(request.last_name)].filter(Boolean).join(" ");
    candidates.set(key, {
      key,
      label: `${company || name || email || "Onbekende klant"}${email ? ` - ${email}` : ""}`,
      name,
      company,
      website: cleanText(request.website),
      package: cleanText(request.care_plan),
      authUserId: cleanText(request.auth_user_id),
      email,
      profileId: "",
      createdAt: "",
    });
  });

  return Array.from(candidates.values()).sort((a, b) => a.label.localeCompare(b.label, "nl"));
}

function normalizeProfile(row) {
  return {
    id: cleanText(row.id),
    authUserId: cleanText(row.auth_user_id),
    name: cleanText(row.name),
    company: cleanText(row.company),
    website: cleanText(row.website),
    package: cleanText(row.package),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function normalizeAuthUser(user) {
  return {
    id: cleanText(user.id),
    email: cleanText(user.email),
    createdAt: cleanText(user.created_at || user.createdAt),
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
