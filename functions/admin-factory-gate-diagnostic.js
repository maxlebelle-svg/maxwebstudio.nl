const { verifyAdmin } = require("./_admin-auth");

const STAGING_SITE_ID = "67b2b8af-83fc-4c61-9cd8-2f78842b7615";
const STAGING_SITE_NAME = "maxwebstudio-staging";
const STAGING_HOST = "maxwebstudio-staging.netlify.app";
const STAGING_ORIGIN = `https://${STAGING_HOST}`;
const STAGING_SUPABASE_ORIGIN = "https://xlxpuuycigeqhgxqtzni.supabase.co";
const RESOURCES = Object.freeze(["factory_gate_checks", "factory_gate_overrides"]);
const SAFE_POSTGREST_CODES = new Set(["PGRST205", "PGRST301", "PGRST302", "42P01", "42501", "28000", "28P01"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { success: false, error: "Niet toegestaan." });
  if (!isConfirmedStagingTarget(event, process.env)) return json(404, { success: false, error: "Niet beschikbaar." });

  const adminCheck = await verifyAdmin(event, json, {
    module: "factory_gate_staging_diagnostic",
    action: "read_only_probe",
    allowedRoles: ["super_admin"],
    allowedStatuses: ["active"],
    disableLegacyToken: true,
  });
  if (!adminCheck.success) return adminCheck.response;

  const baseUrl = normalizedOrigin(process.env.SUPABASE_URL);
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!baseUrl || !serviceRoleKey) return json(503, { success: false, error: "Diagnose niet beschikbaar." });

  const results = [];
  for (const resource of RESOURCES) {
    results.push(await probeResource({ baseUrl, serviceRoleKey, resource }));
  }
  return json(200, { results });
};

async function probeResource({ baseUrl, serviceRoleKey, resource }) {
  try {
    const response = await fetch(`${baseUrl}/rest/v1/${resource}?select=id&limit=0`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });
    let postgrestCode = null;
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const candidate = String(payload?.code || "");
      postgrestCode = SAFE_POSTGREST_CODES.has(candidate) ? candidate : null;
    }
    return safeResult(resource, response.status, postgrestCode, classify(response.status, postgrestCode, response.ok));
  } catch {
    return safeResult(resource, null, null, "network_failure");
  }
}

function safeResult(resource, httpStatus, postgrestCode, category) {
  return {
    httpStatus: Number.isInteger(httpStatus) ? httpStatus : null,
    postgrestCode: postgrestCode || null,
    resource,
    category,
    serviceRoleConfigured: true,
    stagingTargetConfirmed: true,
  };
}

function classify(status, code, ok) {
  if (ok) return "reachable";
  if (code === "PGRST205" || code === "42P01") return "resource_missing";
  if (code === "42501" || status === 403) return "permission_denied";
  if (["PGRST301", "PGRST302", "28000", "28P01"].includes(code) || status === 401) return "authentication_failed";
  if ([400, 405, 406, 409, 416].includes(status)) return "request_invalid";
  return "unknown_safe_error";
}

function isConfirmedStagingTarget(event, env) {
  const host = normalizedRequestHost(event?.headers?.["x-forwarded-host"] || event?.headers?.["X-Forwarded-Host"] || event?.headers?.host || event?.headers?.Host);
  const siteId = String(env.SITE_ID || "").trim();
  const siteName = String(env.SITE_NAME || "").trim();
  const siteOrigin = normalizedOrigin(env.URL);
  return host === STAGING_HOST
    && siteId === STAGING_SITE_ID
    && siteName === STAGING_SITE_NAME
    && siteOrigin === STAGING_ORIGIN
    && normalizedOrigin(env.SUPABASE_URL) === STAGING_SUPABASE_ORIGIN;
}

function normalizedRequestHost(value) {
  const raw = String(value || "").split(",")[0].trim();
  if (!raw) return "";
  try {
    const url = new URL(`https://${raw}`);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return "";
    if (raw.toLowerCase() !== url.hostname.toLowerCase()) return "";
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizedOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(body),
  };
}

exports._private = { RESOURCES, classify, isConfirmedStagingTarget, normalizedOrigin, normalizedRequestHost, probeResource };
