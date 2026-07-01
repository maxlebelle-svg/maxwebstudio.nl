const crypto = require("crypto");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedPackages = new Set(["Basis", "Plus", "Premium"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  }

  const adminCheck = verifyAdmin(event);
  if (!adminCheck.success) return adminCheck.response;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Customer onboarding missing Supabase server configuration", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });

    return jsonResponse(500, {
      success: false,
      error: "Klant kon niet veilig worden klaargezet.",
    });
  }

  try {
    const payload = validatePayload(parsePayload(event.body));
    if (!payload.success) return jsonResponse(400, { success: false, error: payload.error });

    const input = payload.value;
    const recordEnvironment = getRecordEnvironment();
    const isDemoRecord = recordEnvironment !== "production";
    const authUser = await ensureAuthUser(supabaseUrl, serviceRoleKey, input);
    const profile = await upsertByLookup({
      supabaseUrl,
      serviceRoleKey,
      table: "profiles",
      lookup: `auth_user_id=eq.${encodeURIComponent(authUser.id)}`,
      record: {
        auth_user_id: authUser.id,
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone,
        website: input.domain,
        package: input.package,
        role: "customer",
        status: "active",
        is_demo: isDemoRecord,
        environment: recordEnvironment,
        metadata: {
          createdBy: "admin-customer-create-wizard",
          authAction: authUser.action,
          sourceEnvironment: recordEnvironment,
        },
        updated_at: new Date().toISOString(),
      },
    });

    const customer = await upsertByLookup({
      supabaseUrl,
      serviceRoleKey,
      table: "customers",
      lookup: `auth_user_id=eq.${encodeURIComponent(authUser.id)}`,
      record: {
        auth_user_id: authUser.id,
        profile_id: profile.id,
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone,
        website: input.domain,
        package: input.package,
        status: "active",
        portal_status: "active",
        customer_since: new Date().toISOString().slice(0, 10),
        is_demo: isDemoRecord,
        environment: recordEnvironment,
        metadata: {
          createdBy: "admin-customer-create-wizard",
          sourceEnvironment: recordEnvironment,
        },
        updated_at: new Date().toISOString(),
      },
    });

    const website = await upsertByLookup({
      supabaseUrl,
      serviceRoleKey,
      table: "websites",
      lookup: `customer_id=eq.${encodeURIComponent(customer.id)}&domain=eq.${encodeURIComponent(input.domain)}`,
      record: {
        customer_id: customer.id,
        profile_id: profile.id,
        name: input.company,
        domain: input.domain,
        live_url: normalizeWebsiteUrl(input.domain),
        status: "online",
        hosting_package: input.package,
        care_package: input.package,
        ssl_status: "unknown",
        hosting_status: "unknown",
        uptime_status: "unknown",
        dns_status: "unknown",
        is_demo: isDemoRecord,
        environment: recordEnvironment,
        metadata: {
          createdBy: "admin-customer-create-wizard",
          sourceEnvironment: recordEnvironment,
        },
        updated_at: new Date().toISOString(),
      },
    });

    const project = await upsertByLookup({
      supabaseUrl,
      serviceRoleKey,
      table: "projects",
      lookup: `customer_id=eq.${encodeURIComponent(customer.id)}&website_id=eq.${encodeURIComponent(website.id)}`,
      record: {
        customer_id: customer.id,
        website_id: website.id,
        name: input.projectName || `Klantportaal ${input.company}`,
        type: "client_portal_onboarding",
        status: "onboarding",
        phase: "Klantportaal actief",
        progress: 20,
        checklist: [],
        tasks: [],
        timeline: [],
        is_demo: isDemoRecord,
        environment: recordEnvironment,
        metadata: {
          createdBy: "admin-customer-create-wizard",
          sourceEnvironment: recordEnvironment,
        },
        updated_at: new Date().toISOString(),
      },
    });

    const passwordSetup = await createPasswordSetupLink(supabaseUrl, serviceRoleKey, input);

    return jsonResponse(200, {
      success: true,
      onboarding: {
        authUser: { id: authUser.id, action: authUser.action },
        profile: pickRecord(profile),
        customer: pickRecord(customer),
        website: pickRecord(website),
        project: pickRecord(project),
        portalStatus: "active",
        passwordSetup: {
          status: passwordSetup.status,
          redirectTo: passwordSetup.redirectTo,
        },
      },
      mailPreview: buildMailPreview(input, passwordSetup),
      note: "Welkomstmail is alleen als concept klaargezet. Er is geen e-mail verzonden.",
    });
  } catch (error) {
    console.error("Customer onboarding failed", {
      message: error.message,
      code: error.code || "",
      status: error.status || 0,
    });

    return jsonResponse(error.statusCode || 500, {
      success: false,
      error: error.statusCode ? error.message : "Klant kon niet veilig worden klaargezet.",
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

function validatePayload(payload) {
  const value = {
    name: cleanText(payload.name),
    company: cleanText(payload.company),
    email: cleanText(payload.email).toLowerCase(),
    phone: cleanText(payload.phone),
    package: cleanText(payload.package) || "Basis",
    domain: cleanDomain(payload.domain || payload.website),
    projectName: cleanText(payload.projectName),
  };

  if (!value.name) return { success: false, error: "Vul een klantnaam in." };
  if (!value.company) return { success: false, error: "Vul een bedrijfsnaam in." };
  if (!emailPattern.test(value.email)) return { success: false, error: "Vul een geldig e-mailadres in." };
  if (!allowedPackages.has(value.package)) return { success: false, error: "Kies een geldig pakket." };
  if (!value.domain) return { success: false, error: "Vul een website of domein in." };

  return { success: true, value };
}

function getRecordEnvironment() {
  const environment = cleanText(process.env.APP_ENVIRONMENT || process.env.APP_ENV).toLowerCase();
  if (environment === "production") return "production";
  if (environment === "demo") return "demo";
  return "test";
}

async function ensureAuthUser(supabaseUrl, serviceRoleKey, input) {
  const existingUser = await findAuthUser(supabaseUrl, serviceRoleKey, input.email);
  if (existingUser?.id) return { id: existingUser.id, action: "existing" };

  const createdUser = await supabaseFetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeaders(serviceRoleKey),
    body: JSON.stringify({
      email: input.email,
      password: crypto.randomBytes(24).toString("base64url"),
      email_confirm: true,
      user_metadata: {
        name: input.name,
        company: input.company,
        createdBy: "admin-customer-create-wizard",
      },
    }),
  });

  if (!createdUser?.id) {
    const error = new Error("Supabase Auth gebruiker kon niet worden aangemaakt.");
    error.statusCode = 502;
    throw error;
  }

  return { id: createdUser.id, action: "created" };
}

async function findAuthUser(supabaseUrl, serviceRoleKey, email) {
  const data = await supabaseFetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200&page=1`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });

  return (Array.isArray(data?.users) ? data.users : []).find((user) => cleanText(user.email).toLowerCase() === email) || null;
}

async function createPasswordSetupLink(supabaseUrl, serviceRoleKey, input) {
  const redirectTo = cleanText(process.env.CLIENT_PORTAL_REDIRECT_URL) || "https://maxwebstudio.nl/login.html";

  try {
    const data = await supabaseFetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: authHeaders(serviceRoleKey),
      body: JSON.stringify({
        type: "recovery",
        email: input.email,
        redirect_to: redirectTo,
      }),
    });

    const actionLink = cleanText(data?.action_link || data?.actionLink || data?.properties?.action_link || data?.properties?.actionLink);
    return {
      status: actionLink ? "generated" : "manual_required",
      actionLink,
      redirectTo,
    };
  } catch (error) {
    console.error("Password setup link generation failed", {
      status: error.status || 0,
      code: error.code || "",
      message: error.message,
    });

    return {
      status: "manual_required",
      actionLink: "",
      redirectTo,
    };
  }
}

async function upsertByLookup({ supabaseUrl, serviceRoleKey, table, lookup, record }) {
  const existing = await supabaseFetch(`${supabaseUrl}/rest/v1/${table}?select=id&${lookup}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });

  const existingId = Array.isArray(existing) && existing[0]?.id ? existing[0].id : "";
  const url = existingId
    ? `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(existingId)}`
    : `${supabaseUrl}/rest/v1/${table}`;

  const data = await supabaseFetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify(record),
  });

  const savedRecord = Array.isArray(data) ? data[0] : data;
  if (!savedRecord?.id) {
    const error = new Error(`${table} kon niet worden opgeslagen.`);
    error.statusCode = 502;
    throw error;
  }
  return savedRecord;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.code = data?.code || "";
    error.details = data?.details || "";
    error.hint = data?.hint || "";
    error.status = response.status;
    throw error;
  }

  return data;
}

function authHeaders(serviceRoleKey) {
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

function buildMailPreview(input, passwordSetup = {}) {
  const loginLink = cleanText(passwordSetup.actionLink) || cleanText(process.env.CLIENT_PORTAL_REDIRECT_URL) || "https://maxwebstudio.nl/login.html";
  const setupInstruction = passwordSetup.status === "generated"
    ? "Activeer je account via de knop Account activeren en stel daarna veilig je eigen wachtwoord in."
    : "Open de loginpagina en kies wachtwoord opnieuw instellen om veilig je eigen wachtwoord te maken.";
  const subject = "Welkom bij Max Webstudio – je klantportaal staat klaar";
  const text = [
    `Hoi ${input.name},`,
    "",
    `Je klantportaal voor ${input.company} staat klaar bij Max Webstudio.`,
    "In je portaal zie je de status van je website, kun je wijzigingen aanvragen, berichten volgen en belangrijke updates terugvinden.",
    "",
    setupInstruction,
    "",
    `Account activeren: ${loginLink}`,
    "",
    "Heb je vragen? Neem gerust contact op met Max Webstudio.",
  ].join("\n");

  return {
    subject,
    loginLink,
    buttonLabel: "Account activeren",
    text,
  };
}

function pickRecord(record) {
  return {
    id: cleanText(record.id),
    name: cleanText(record.name),
    status: cleanText(record.status || record.portal_status),
  };
}

function normalizeWebsiteUrl(domain) {
  const clean = cleanDomain(domain);
  return clean ? `https://${clean}` : "";
}

function cleanDomain(value) {
  return cleanText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
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
