const BASE_PROFILE_FIELDS = ["id", "auth_user_id", "name", "company", "website", "package", "created_at", "updated_at"];
const CRM_PROFILE_FIELDS = [...BASE_PROFILE_FIELDS, "email", "phone", "status"];
const REQUEST_FIELDS = ["first_name", "last_name", "company_name", "email", "phone", "website", "care_plan", "status", "auth_user_id", "created_at"].join(",");
const allowedPackages = new Set(["Basis", "Plus", "Premium"]);
const allowedStatuses = new Set(["actief", "lead", "gepauzeerd", "gestopt"]);
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

      const normalizedAuthUsers = authUsers.map(normalizeAuthUser).filter((user) => user.id);
      const normalizedProfiles = profiles.map(normalizeProfile);

      return jsonResponse(200, {
        success: true,
        profiles: normalizedProfiles,
        customers: buildCustomers(normalizedProfiles, normalizedAuthUsers, changeRequests),
        authUsers: normalizedAuthUsers,
        clientCandidates: buildClientCandidates(profiles, changeRequests),
      });
    }

    const payload = parsePayload(event.body);
    const authUsers = await fetchAuthUsers(supabaseUrl, serviceRoleKey);
    const validation = validateProfilePayload(payload, authUsers.map(normalizeAuthUser).filter((user) => user.id));
    if (!validation.success) {
      return jsonResponse(400, { success: false, error: validation.error });
    }

    const savedProfile = await upsertProfile(supabaseUrl, serviceRoleKey, validation.profile);
    const linkedRequests = await linkExistingRequests(supabaseUrl, serviceRoleKey, validation.profile);

    return jsonResponse(200, {
      success: true,
      profile: normalizeProfile(savedProfile),
      linkedRequests,
      warning: savedProfile.warning || undefined,
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

function validateProfilePayload(payload, authUsers) {
  let authUserId = cleanText(payload.authUserId);
  const name = cleanText(payload.name);
  const company = cleanText(payload.company);
  const website = cleanText(payload.website);
  const selectedPackage = cleanText(payload.package) || "Basis";
  const email = cleanText(payload.email || payload.requestEmail).toLowerCase();
  const phone = cleanText(payload.phone);
  const status = cleanText(payload.status || "actief").toLowerCase();
  const matchedUser = email ? authUsers.find((user) => user.email.toLowerCase() === email) : null;

  if (!authUserId && matchedUser?.id) {
    authUserId = matchedUser.id;
  }

  if (!uuidPattern.test(authUserId)) {
    return { success: false, error: "Kies een geldige Supabase Auth gebruiker of gebruik een e-mailadres dat al in Supabase Auth bestaat." };
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

  if (!allowedStatuses.has(status)) {
    return { success: false, error: "Kies een geldige klantstatus." };
  }

  return {
    success: true,
    profile: {
      authUserId,
      name,
      company,
      website,
      package: selectedPackage,
      email,
      phone,
      status,
      requestEmail: email,
    },
  };
}

async function fetchProfiles(supabaseUrl, serviceRoleKey) {
  try {
    return await supabaseFetch(
      `${supabaseUrl}/rest/v1/profiles?select=${CRM_PROFILE_FIELDS.join(",")}&order=company.asc.nullslast`,
      {
        method: "GET",
        headers: restHeaders(serviceRoleKey),
      }
    );
  } catch (error) {
    if (!isSchemaColumnError(error)) throw error;
    console.error("Admin client profiles CRM columns missing, falling back to base profile fields", { message: error.message });
    return supabaseFetch(
      `${supabaseUrl}/rest/v1/profiles?select=${BASE_PROFILE_FIELDS.join(",")}&order=company.asc.nullslast`,
      {
        method: "GET",
        headers: restHeaders(serviceRoleKey),
      }
    );
  }
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
  const record = {
    auth_user_id: profile.authUserId,
    name: profile.name,
    company: profile.company,
    website: profile.website,
    package: profile.package,
    email: profile.email,
    phone: profile.phone,
    status: profile.status,
    updated_at: new Date().toISOString(),
  };

  try {
    return await upsertProfileRecord(supabaseUrl, serviceRoleKey, record);
  } catch (error) {
    if (!isSchemaColumnError(error)) throw error;
    console.error("Admin client profiles optional CRM columns missing, saving base profile fields only", { message: error.message });
    const fallbackRecord = {
      auth_user_id: record.auth_user_id,
      name: record.name,
      company: record.company,
      website: record.website,
      package: record.package,
      updated_at: record.updated_at,
    };
    const savedProfile = await upsertProfileRecord(supabaseUrl, serviceRoleKey, fallbackRecord);
    savedProfile.warning = "Extra CRM-velden zijn niet opgeslagen omdat de profiles tabel nog geen email, phone en status kolommen heeft.";
    return savedProfile;
  }
}

async function upsertProfileRecord(supabaseUrl, serviceRoleKey, record) {
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
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.code = data?.code || "";
    error.details = data?.details || "";
    error.hint = data?.hint || "";
    error.status = response.status;
    throw error;
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
      email: normalizedProfile.email,
      phone: normalizedProfile.phone,
      status: normalizedProfile.status,
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
      phone: cleanText(request.phone),
      status: "actief",
      authUserId: cleanText(request.auth_user_id),
      email,
      profileId: "",
      createdAt: "",
    });
  });

  return Array.from(candidates.values()).sort((a, b) => a.label.localeCompare(b.label, "nl"));
}

function buildCustomers(profiles, authUsers, changeRequests) {
  const authUserMap = new Map(authUsers.map((user) => [user.id, user]));
  const requestMap = new Map();

  changeRequests.forEach((request) => {
    const authUserId = cleanText(request.auth_user_id);
    const email = cleanText(request.email).toLowerCase();
    const key = authUserId || email;
    if (!key || requestMap.has(key)) return;
    requestMap.set(key, request);
  });

  return profiles.map((profile) => {
    const authUser = authUserMap.get(profile.authUserId);
    const request = requestMap.get(profile.authUserId) || requestMap.get(cleanText(profile.email).toLowerCase()) || {};
    const email = cleanText(profile.email || authUser?.email || request.email);
    const phone = cleanText(profile.phone || request.phone);
    const status = cleanText(profile.status || "actief").toLowerCase();

    return {
      ...profile,
      email,
      phone,
      status: allowedStatuses.has(status) ? status : "actief",
      authEmail: cleanText(authUser?.email),
      portalUrl: "/client-dashboard.html",
    };
  });
}

function normalizeProfile(row) {
  return {
    id: cleanText(row.id),
    authUserId: cleanText(row.auth_user_id),
    name: cleanText(row.name),
    company: cleanText(row.company),
    website: cleanText(row.website),
    package: cleanText(row.package),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    status: cleanText(row.status || "actief").toLowerCase(),
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

function isSchemaColumnError(error) {
  const message = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return error.code === "42703" || error.code === "PGRST204" || message.includes("column") || message.includes("schema cache");
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
