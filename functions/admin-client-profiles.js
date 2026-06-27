const BASE_PROFILE_FIELDS = ["id", "auth_user_id", "name", "company", "website", "package", "created_at", "updated_at"];
const CRM_PROFILE_FIELDS = [...BASE_PROFILE_FIELDS, "email", "phone", "status", "customer_since", "archived_at"];
const REQUEST_FIELDS = ["first_name", "last_name", "company_name", "email", "phone", "website", "care_plan", "status", "auth_user_id", "created_at"].join(",");
const WEBSITE_FIELDS = [
  "id",
  "profile_id",
  "customer_auth_user_id",
  "name",
  "domain",
  "live_url",
  "staging_url",
  "netlify_project_name",
  "netlify_site_id",
  "github_repo_url",
  "github_branch",
  "status",
  "ssl_status",
  "hosting_status",
  "last_deploy_at",
  "last_checked_at",
  "notes",
  "created_at",
  "updated_at",
].join(",");
const allowedPackages = new Set(["Basis", "Plus", "Premium"]);
const allowedStatuses = new Set(["actief", "onboarding", "pauze", "gearchiveerd"]);
const allowedWebsiteStatuses = new Set(["live", "staging", "onderhoud", "gearchiveerd"]);
const allowedSslStatuses = new Set(["active", "pending", "inactive", "unknown"]);
const allowedHostingStatuses = new Set(["active", "paused", "inactive", "unknown"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      const [profiles, authUsers, changeRequests, websites] = await Promise.all([
        fetchProfiles(supabaseUrl, serviceRoleKey),
        fetchAuthUsers(supabaseUrl, serviceRoleKey),
        fetchRequestCandidates(supabaseUrl, serviceRoleKey),
        fetchWebsites(supabaseUrl, serviceRoleKey),
      ]);

      const normalizedAuthUsers = authUsers.map(normalizeAuthUser).filter((user) => user.id);
      const normalizedProfiles = profiles.map(normalizeProfile);
      const normalizedWebsites = websites.map(normalizeWebsite);
      const notes = await fetchCustomerNotes(supabaseUrl, serviceRoleKey);

      return jsonResponse(200, {
        success: true,
        profiles: normalizedProfiles,
        customers: buildCustomers(normalizedProfiles, normalizedAuthUsers, changeRequests, notes, normalizedWebsites),
        websites: buildWebsites(normalizedWebsites, normalizedProfiles),
        authUsers: normalizedAuthUsers,
        clientCandidates: buildClientCandidates(profiles, changeRequests),
      });
    }

    const payload = parsePayload(event.body);
    const action = cleanText(payload.action || "save");

    if (action === "save_website") {
      const normalizedProfiles = (await fetchProfiles(supabaseUrl, serviceRoleKey)).map(normalizeProfile);
      const validation = validateWebsitePayload(payload, normalizedProfiles);
      if (!validation.success) return jsonResponse(400, { success: false, error: validation.error });
      const savedWebsite = await upsertWebsite(supabaseUrl, serviceRoleKey, validation.website);
      return jsonResponse(200, { success: true, website: normalizeWebsite(savedWebsite) });
    }

    if (action === "archive_website") {
      const id = cleanText(payload.id);
      if (!uuidPattern.test(id)) return jsonResponse(400, { success: false, error: "Kies een geldige website." });
      const archivedWebsite = await archiveWebsite(supabaseUrl, serviceRoleKey, id);
      return jsonResponse(200, { success: true, website: normalizeWebsite(archivedWebsite) });
    }

    if (action === "send_invite") {
      const result = await sendInvite(supabaseUrl, serviceRoleKey, payload.email);
      return jsonResponse(200, result);
    }

    if (action === "send_password_reset") {
      const result = await sendPasswordReset(supabaseUrl, serviceRoleKey, payload.email);
      return jsonResponse(200, result);
    }

    const authUsers = await fetchAuthUsers(supabaseUrl, serviceRoleKey);

    if (action === "check_auth_user") {
      return jsonResponse(200, {
        success: true,
        authUser: findAuthUserByEmail(payload.email, authUsers.map(normalizeAuthUser).filter((user) => user.id)),
      });
    }

    const validation = validateProfilePayload(payload, authUsers.map(normalizeAuthUser).filter((user) => user.id), action);
    if (!validation.success) {
      return jsonResponse(400, { success: false, error: validation.error });
    }

    const savedProfile = await upsertProfile(supabaseUrl, serviceRoleKey, validation.profile);
    await upsertCustomerNotes(supabaseUrl, serviceRoleKey, normalizeProfile(savedProfile).id, validation.profile.notes);
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

function validateProfilePayload(payload, authUsers, action) {
  let authUserId = cleanText(payload.authUserId);
  const name = cleanText(payload.name);
  const company = cleanText(payload.company);
  const website = cleanText(payload.website);
  const selectedPackage = cleanText(payload.package) || "Basis";
  const email = cleanText(payload.email || payload.requestEmail).toLowerCase();
  const phone = cleanText(payload.phone);
  const status = cleanText(payload.status || "actief").toLowerCase();
  const customerSince = cleanText(payload.customerSince);
  const notes = cleanText(payload.notes).slice(0, 4000);
  const matchedUser = email ? authUsers.find((user) => user.email.toLowerCase() === email) : null;

  if (!authUserId && matchedUser?.id) {
    authUserId = matchedUser.id;
  }

  if (action === "link_login" && matchedUser?.id) {
    authUserId = matchedUser.id;
  }

  if (!emailPattern.test(email)) {
    return { success: false, error: "Vul een geldig e-mailadres in." };
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
      customerSince,
      archivedAt: status === "gearchiveerd" ? new Date().toISOString() : null,
      notes,
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

async function fetchWebsites(supabaseUrl, serviceRoleKey) {
  try {
    return await supabaseFetch(
      `${supabaseUrl}/rest/v1/customer_websites?select=${WEBSITE_FIELDS}&order=updated_at.desc.nullslast&limit=300`,
      {
        method: "GET",
        headers: restHeaders(serviceRoleKey),
      }
    );
  } catch (error) {
    if (!isSchemaColumnError(error) && error.status !== 404) throw error;
    console.error("Customer websites table missing, continuing without website operations data", { message: error.message });
    return [];
  }
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
    customer_since: profile.customerSince || new Date().toISOString(),
    archived_at: profile.archivedAt,
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
    savedProfile.warning = "Extra CRM-velden zijn niet opgeslagen omdat de profiles tabel nog niet alle CRM-kolommen heeft.";
    return savedProfile;
  }
}

async function fetchCustomerNotes(supabaseUrl, serviceRoleKey) {
  try {
    const data = await supabaseFetch(`${supabaseUrl}/rest/v1/admin_customer_notes?select=profile_id,notes`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
    const notes = new Map();
    (Array.isArray(data) ? data : []).forEach((row) => {
      notes.set(cleanText(row.profile_id), cleanText(row.notes));
    });
    return notes;
  } catch (error) {
    if (!isSchemaColumnError(error) && error.status !== 404) throw error;
    console.error("Admin customer notes table missing, continuing without notes", { message: error.message });
    return new Map();
  }
}

async function upsertCustomerNotes(supabaseUrl, serviceRoleKey, profileId, notes) {
  if (!profileId) return;

  try {
    await supabaseFetch(`${supabaseUrl}/rest/v1/admin_customer_notes?on_conflict=profile_id`, {
      method: "POST",
      headers: {
        ...restHeaders(serviceRoleKey),
        "Content-Type": "application/json",
        "Content-Profile": "public",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        profile_id: profileId,
        notes: cleanText(notes),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    if (!isSchemaColumnError(error) && error.status !== 404) throw error;
    console.error("Admin customer notes could not be saved because notes table is missing", { message: error.message });
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

function validateWebsitePayload(payload, profiles) {
  const id = cleanText(payload.id);
  const profileId = cleanText(payload.profileId);
  const profile = profiles.find((item) => item.id === profileId);
  const name = cleanText(payload.name);
  const domain = cleanText(payload.domain);
  const liveUrl = cleanText(payload.liveUrl);
  const stagingUrl = cleanText(payload.stagingUrl);
  const netlifyProjectName = cleanText(payload.netlifyProjectName);
  const netlifySiteId = cleanText(payload.netlifySiteId);
  const githubRepoUrl = cleanText(payload.githubRepoUrl);
  const githubBranch = cleanText(payload.githubBranch) || "main";
  const status = cleanText(payload.status || "live").toLowerCase();
  const sslStatus = cleanText(payload.sslStatus || "unknown").toLowerCase();
  const hostingStatus = cleanText(payload.hostingStatus || "active").toLowerCase();
  const lastDeployAt = cleanText(payload.lastDeployAt);
  const lastCheckedAt = cleanText(payload.lastCheckedAt);
  const notes = cleanText(payload.notes).slice(0, 4000);

  if (id && !uuidPattern.test(id)) {
    return { success: false, error: "Kies een geldige website." };
  }

  if (!profile) {
    return { success: false, error: "Koppel de website aan een geldige klant." };
  }

  if (!name) {
    return { success: false, error: "Vul een websitetitel in." };
  }

  if (!domain && !liveUrl) {
    return { success: false, error: "Vul minimaal een domein of live URL in." };
  }

  if (!allowedWebsiteStatuses.has(status)) {
    return { success: false, error: "Kies een geldige websitestatus." };
  }

  if (!allowedSslStatuses.has(sslStatus)) {
    return { success: false, error: "Kies een geldige SSL-status." };
  }

  if (!allowedHostingStatuses.has(hostingStatus)) {
    return { success: false, error: "Kies een geldige hostingstatus." };
  }

  return {
    success: true,
    website: {
      id,
      profileId,
      customerAuthUserId: profile.authUserId || null,
      name,
      domain,
      liveUrl,
      stagingUrl,
      netlifyProjectName,
      netlifySiteId,
      githubRepoUrl,
      githubBranch,
      status,
      sslStatus,
      hostingStatus,
      lastDeployAt,
      lastCheckedAt,
      notes,
    },
  };
}

async function upsertWebsite(supabaseUrl, serviceRoleKey, website) {
  const record = {
    profile_id: website.profileId,
    customer_auth_user_id: website.customerAuthUserId,
    name: website.name,
    domain: website.domain,
    live_url: website.liveUrl,
    staging_url: website.stagingUrl,
    netlify_project_name: website.netlifyProjectName,
    netlify_site_id: website.netlifySiteId,
    github_repo_url: website.githubRepoUrl,
    github_branch: website.githubBranch,
    status: website.status,
    ssl_status: website.sslStatus,
    hosting_status: website.hostingStatus,
    last_deploy_at: website.lastDeployAt || null,
    last_checked_at: website.lastCheckedAt || null,
    notes: website.notes,
    updated_at: new Date().toISOString(),
  };

  if (website.id) record.id = website.id;

  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/customer_websites?on_conflict=id`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(record),
  });

  const savedWebsite = Array.isArray(data) ? data[0] : data;
  if (!savedWebsite) throw new Error("Supabase returned no website after upsert.");
  return savedWebsite;
}

async function archiveWebsite(supabaseUrl, serviceRoleKey, id) {
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/customer_websites?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      status: "gearchiveerd",
      hosting_status: "inactive",
      updated_at: new Date().toISOString(),
    }),
  });

  const archivedWebsite = Array.isArray(data) ? data[0] : data;
  if (!archivedWebsite) throw new Error("Supabase returned no website after archive.");
  return archivedWebsite;
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

function buildCustomers(profiles, authUsers, changeRequests, notes, websites = []) {
  const authUserMap = new Map(authUsers.map((user) => [user.id, user]));
  const requestMap = new Map();
  const websiteMap = new Map();

  websites.forEach((website) => {
    if (!website.profileId || website.status === "gearchiveerd") return;
    if (!websiteMap.has(website.profileId)) websiteMap.set(website.profileId, website);
  });

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
    const websiteRecord = websiteMap.get(profile.id);
    const email = cleanText(profile.email || authUser?.email || request.email);
    const phone = cleanText(profile.phone || request.phone);
    const status = cleanText(profile.status || "actief").toLowerCase();

    return {
      ...profile,
      email,
      phone,
      website: websiteRecord?.liveUrl || profile.website,
      status: allowedStatuses.has(status) ? status : "actief",
      authEmail: cleanText(authUser?.email),
      authStatus: authUser?.id ? "login actief" : "geen login",
      notes: notes.get(profile.id) || "",
      portalUrl: "/client-dashboard.html",
    };
  });
}

function buildWebsites(websites, profiles) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  return websites.map((website) => {
    const profile = profileMap.get(website.profileId) || {};
    return {
      ...website,
      customerName: profile.name || "",
      customerCompany: profile.company || "",
      customerEmail: profile.email || "",
    };
  });
}

function normalizeWebsite(row) {
  return {
    id: cleanText(row.id),
    profileId: cleanText(row.profile_id),
    customerAuthUserId: cleanText(row.customer_auth_user_id),
    name: cleanText(row.name),
    domain: cleanText(row.domain),
    liveUrl: cleanText(row.live_url),
    stagingUrl: cleanText(row.staging_url),
    netlifyProjectName: cleanText(row.netlify_project_name),
    netlifySiteId: cleanText(row.netlify_site_id),
    githubRepoUrl: cleanText(row.github_repo_url),
    githubBranch: cleanText(row.github_branch || "main"),
    status: cleanText(row.status || "live").toLowerCase(),
    sslStatus: cleanText(row.ssl_status || "unknown").toLowerCase(),
    hostingStatus: cleanText(row.hosting_status || "active").toLowerCase(),
    lastDeployAt: cleanText(row.last_deploy_at),
    lastCheckedAt: cleanText(row.last_checked_at),
    notes: cleanText(row.notes),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
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
    customerSince: cleanText(row.customer_since || row.created_at),
    archivedAt: cleanText(row.archived_at),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function normalizeAuthUser(user) {
  return {
    id: cleanText(user.id),
    email: cleanText(user.email),
    createdAt: cleanText(user.created_at || user.createdAt),
    confirmedAt: cleanText(user.confirmed_at || user.email_confirmed_at),
    lastSignInAt: cleanText(user.last_sign_in_at),
  };
}

function findAuthUserByEmail(email, authUsers) {
  const cleanEmail = cleanText(email).toLowerCase();
  if (!emailPattern.test(cleanEmail)) return null;
  return authUsers.find((user) => user.email.toLowerCase() === cleanEmail) || null;
}

async function sendInvite(supabaseUrl, serviceRoleKey, email) {
  const cleanEmail = cleanText(email).toLowerCase();
  if (!emailPattern.test(cleanEmail)) {
    return { success: false, error: "Vul een geldig e-mailadres in." };
  }

  const data = await supabaseFetch(`${supabaseUrl}/auth/v1/invite`, {
    method: "POST",
    headers: authAdminHeaders(serviceRoleKey),
    body: JSON.stringify({ email: cleanEmail }),
  });

  return { success: true, authUser: normalizeAuthUser(data || {}) };
}

async function sendPasswordReset(supabaseUrl, serviceRoleKey, email) {
  const cleanEmail = cleanText(email).toLowerCase();
  if (!emailPattern.test(cleanEmail)) {
    return { success: false, error: "Vul een geldig e-mailadres in." };
  }

  await supabaseFetch(`${supabaseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: authAdminHeaders(serviceRoleKey),
    body: JSON.stringify({ email: cleanEmail }),
  });

  return { success: true };
}

function authAdminHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
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
