const { verifyAdmin } = require("./_admin-auth");
const WEBSITE_HEALTH_FIELDS = [
  "id",
  "profile_id",
  "customer_auth_user_id",
  "name",
  "domain",
  "live_url",
  "status",
  "ssl_status",
  "hosting_status",
  "last_deploy_at",
  "uptime_status",
  "ssl_expires_at",
  "performance_score",
  "seo_score",
  "mobile_score",
  "desktop_score",
  "last_uptime_check",
  "dns_status",
  "monitor_enabled",
  "updated_at",
].join(",");

const allowedUptimeStatuses = new Set(["online", "offline", "unknown"]);
const allowedDnsStatuses = new Set(["valid", "warning", "invalid", "unknown"]);
const allowedSslStatuses = new Set(["active", "pending", "inactive", "unknown"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  try {
    if (!["GET", "POST"].includes(event.httpMethod)) {
      return jsonResponse(405, { success: false, error: "Alleen GET- en POST-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse);
    if (!adminCheck.success) return adminCheck.response;

    const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Admin website health missing Supabase configuration", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });

      return jsonResponse(500, {
        success: false,
        error: "Website health kon niet worden beheerd.",
      });
    }

    if (event.httpMethod === "GET") {
      const websites = await fetchWebsiteHealth(supabaseUrl, serviceRoleKey);
      return jsonResponse(200, {
        success: true,
        websites: websites.map(normalizeWebsiteHealth),
      });
    }

    const payload = parsePayload(event.body);
    const action = cleanText(payload.action || "update_health");

    if (action === "run_check") {
      const id = validateWebsiteId(payload.id);
      const currentWebsite = await fetchWebsiteById(supabaseUrl, serviceRoleKey, id);
      const checkedWebsite = await updateWebsiteHealth(supabaseUrl, serviceRoleKey, id, createMockHealth(currentWebsite));
      return jsonResponse(200, {
        success: true,
        website: normalizeWebsiteHealth(checkedWebsite),
        message: "Mock health-check uitgevoerd.",
      });
    }

    if (action === "toggle_monitor") {
      const id = validateWebsiteId(payload.id);
      const monitorEnabled = Boolean(payload.monitorEnabled);
      const updatedWebsite = await updateWebsiteHealth(supabaseUrl, serviceRoleKey, id, {
        monitor_enabled: monitorEnabled,
        updated_at: new Date().toISOString(),
      });
      return jsonResponse(200, { success: true, website: normalizeWebsiteHealth(updatedWebsite) });
    }

    if (action === "update_health") {
      const id = validateWebsiteId(payload.id);
      const health = validateHealthPayload(payload);
      const updatedWebsite = await updateWebsiteHealth(supabaseUrl, serviceRoleKey, id, health);
      return jsonResponse(200, { success: true, website: normalizeWebsiteHealth(updatedWebsite) });
    }

    return jsonResponse(400, { success: false, error: "Onbekende health-actie." });
  } catch (error) {
    console.error("Admin website health error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });

    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Website health kon niet worden beheerd.",
    });
  }
};

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    const parseError = new Error("Ongeldige JSON body.");
    parseError.statusCode = 400;
    throw parseError;
  }
}

async function fetchWebsiteHealth(supabaseUrl, serviceRoleKey) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/customer_websites?select=${WEBSITE_HEALTH_FIELDS}&order=updated_at.desc.nullslast&limit=300`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
}

async function fetchWebsiteById(supabaseUrl, serviceRoleKey, id) {
  const data = await supabaseFetch(
    `${supabaseUrl}/rest/v1/customer_websites?select=${WEBSITE_HEALTH_FIELDS}&id=eq.${encodeURIComponent(id)}&limit=1`,
    {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    }
  );

  const website = Array.isArray(data) ? data[0] : data;
  if (!website) {
    const error = new Error("Website niet gevonden.");
    error.statusCode = 404;
    throw error;
  }

  return website;
}

async function updateWebsiteHealth(supabaseUrl, serviceRoleKey, id, health) {
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/customer_websites?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify(health),
  });

  const website = Array.isArray(data) ? data[0] : data;
  if (!website) throw new Error("Supabase returned no website after health update.");
  return website;
}

function createMockHealth(website) {
  const hasLiveUrl = Boolean(cleanText(website.live_url));
  const scoreSeed = cleanText(website.domain || website.live_url || website.name).length;
  const baseScore = hasLiveUrl ? 82 : 58;
  const performanceScore = clampScore(baseScore + (scoreSeed % 9));
  const seoScore = clampScore(baseScore + 4 + (scoreSeed % 7));
  const mobileScore = clampScore(performanceScore - 5);
  const desktopScore = clampScore(performanceScore + 6);

  return {
    uptime_status: hasLiveUrl ? "online" : "unknown",
    dns_status: cleanText(website.domain) ? "valid" : "unknown",
    ssl_status: cleanText(website.live_url).startsWith("https://") ? "active" : "unknown",
    ssl_expires_at: cleanText(website.live_url).startsWith("https://") ? addDaysIso(80) : null,
    performance_score: performanceScore,
    seo_score: seoScore,
    mobile_score: mobileScore,
    desktop_score: desktopScore,
    last_uptime_check: new Date().toISOString(),
    monitor_enabled: website.monitor_enabled !== false,
    updated_at: new Date().toISOString(),
  };
}

function validateHealthPayload(payload) {
  const uptimeStatus = cleanText(payload.uptimeStatus || "unknown").toLowerCase();
  const dnsStatus = cleanText(payload.dnsStatus || "unknown").toLowerCase();
  const sslStatus = cleanText(payload.sslStatus || "unknown").toLowerCase();

  if (!allowedUptimeStatuses.has(uptimeStatus)) {
    const error = new Error("Kies een geldige uptime-status.");
    error.statusCode = 400;
    throw error;
  }

  if (!allowedDnsStatuses.has(dnsStatus)) {
    const error = new Error("Kies een geldige DNS-status.");
    error.statusCode = 400;
    throw error;
  }

  if (!allowedSslStatuses.has(sslStatus)) {
    const error = new Error("Kies een geldige SSL-status.");
    error.statusCode = 400;
    throw error;
  }

  return {
    uptime_status: uptimeStatus,
    dns_status: dnsStatus,
    ssl_status: sslStatus,
    ssl_expires_at: cleanText(payload.sslExpiresAt) || null,
    performance_score: nullableScore(payload.performanceScore),
    seo_score: nullableScore(payload.seoScore),
    mobile_score: nullableScore(payload.mobileScore),
    desktop_score: nullableScore(payload.desktopScore),
    last_uptime_check: cleanText(payload.lastUptimeCheck) || new Date().toISOString(),
    monitor_enabled: payload.monitorEnabled !== false,
    updated_at: new Date().toISOString(),
  };
}

function validateWebsiteId(id) {
  const cleanId = cleanText(id);
  if (!uuidPattern.test(cleanId)) {
    const error = new Error("Kies een geldige website.");
    error.statusCode = 400;
    throw error;
  }

  return cleanId;
}

function nullableScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return clampScore(number);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("Admin website health received non-JSON Supabase response", {
        status: response.status,
        bodyPreview: text.slice(0, 160),
      });
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }

  if (!response.ok) {
    console.error("Admin website health Supabase error", {
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

function normalizeWebsiteHealth(row) {
  return {
    id: cleanText(row.id),
    profileId: cleanText(row.profile_id),
    customerAuthUserId: cleanText(row.customer_auth_user_id),
    name: cleanText(row.name),
    domain: cleanText(row.domain),
    liveUrl: cleanText(row.live_url),
    status: cleanText(row.status || "live").toLowerCase(),
    sslStatus: cleanText(row.ssl_status || "unknown").toLowerCase(),
    hostingStatus: cleanText(row.hosting_status || "unknown").toLowerCase(),
    lastDeployAt: cleanText(row.last_deploy_at),
    uptimeStatus: cleanText(row.uptime_status || "unknown").toLowerCase(),
    sslExpiresAt: cleanText(row.ssl_expires_at),
    performanceScore: normalizeNullableNumber(row.performance_score),
    seoScore: normalizeNullableNumber(row.seo_score),
    mobileScore: normalizeNullableNumber(row.mobile_score),
    desktopScore: normalizeNullableNumber(row.desktop_score),
    lastUptimeCheck: cleanText(row.last_uptime_check),
    dnsStatus: cleanText(row.dns_status || "unknown").toLowerCase(),
    monitorEnabled: row.monitor_enabled !== false,
    updatedAt: cleanText(row.updated_at),
  };
}

function normalizeNullableNumber(value) {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
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
