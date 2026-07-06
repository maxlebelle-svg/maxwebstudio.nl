const { verifyAdmin } = require("./_admin-auth");

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const TIMEZONE = "Europe/Amsterdam";
const EXTENDED_PROPERTY_LEAD_ID = "String {00020329-0000-0000-C000-000000000046} Name MaxWebStudioLeadId";
const EXTENDED_PROPERTY_SOURCE = "String {00020329-0000-0000-C000-000000000046} Name MaxWebStudioSource";
const staffRoles = ["super_admin", "admin", "sales_manager", "sales_partner"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});

  const action = cleanText(event.queryStringParameters?.action || parsePayload(event.body).action || "status").toLowerCase();
  const adminCheck = await verifyAdmin(event, jsonResponse, {
    module: "microsoft-calendar",
    action,
    allowedRoles: staffRoles,
    allowedStatuses: ["active", "invited"],
  });
  if (!adminCheck.success) return adminCheck.response;

  try {
    if (event.httpMethod === "GET" && action === "status") return statusResponse();
    if (event.httpMethod === "GET" && action === "events") return listEvents(event);
    if (event.httpMethod === "POST" && action === "createevent") return createEvent(event, adminCheck.admin);
    return jsonResponse(405, { success: false, error: "Deze Microsoft agenda actie wordt niet ondersteund." });
  } catch (error) {
    console.error("Microsoft calendar API failed", {
      action,
      status: error.status || 500,
      message: error.message,
    });
    return jsonResponse(error.status || 500, {
      success: false,
      error: error.publicMessage || error.message || "Microsoft agenda kon niet worden gesynchroniseerd.",
      diagnostics: {
        module: "microsoft-calendar",
        action,
        reason: error.reason || "microsoft_calendar_failed",
      },
    });
  }
};

function getConfig() {
  const tenantId = cleanText(process.env.MICROSOFT_TENANT_ID);
  const clientId = cleanText(process.env.MICROSOFT_CLIENT_ID);
  const clientSecret = cleanText(process.env.MICROSOFT_CLIENT_SECRET);
  const defaultUser = cleanText(process.env.MICROSOFT_DEFAULT_CALENDAR_USER || process.env.MICROSOFT_CALENDAR_USER);
  const missing = [];
  if (!tenantId) missing.push("MICROSOFT_TENANT_ID");
  if (!clientId) missing.push("MICROSOFT_CLIENT_ID");
  if (!clientSecret) missing.push("MICROSOFT_CLIENT_SECRET");
  return {
    tenantId,
    clientId,
    clientSecret,
    defaultUser,
    configured: missing.length === 0,
    missing,
  };
}

function statusResponse() {
  const config = getConfig();
  return jsonResponse(200, {
    success: true,
    configured: config.configured,
    mode: config.configured ? "outlook-calendar" : "local-fallback",
    missing: config.missing,
    defaultUser: config.defaultUser,
    message: config.configured
      ? "Microsoft agenda is klaar voor synchronisatie."
      : "Microsoft agenda is nog niet gekoppeld. Afspraken blijven lokaal beschikbaar.",
  });
}

async function listEvents(event) {
  const config = getConfiguredOrThrow();
  const start = cleanText(event.queryStringParameters?.start);
  const end = cleanText(event.queryStringParameters?.end);
  const userEmail = resolveCalendarUser(event.queryStringParameters?.userEmail, config);
  if (!start || !end) return jsonResponse(400, { success: false, error: "Start- en einddatum ontbreken." });
  if (!userEmail) return jsonResponse(400, { success: false, error: "Geen Microsoft agenda gebruiker gevonden." });

  const token = await getAccessToken(config);
  const url = new URL(`${GRAPH_BASE_URL}/users/${encodeURIComponent(userEmail)}/calendarView`);
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("endDateTime", end);
  url.searchParams.set("$select", "id,subject,bodyPreview,start,end,showAs,isCancelled,webLink,lastModifiedDateTime,singleValueExtendedProperties");
  url.searchParams.set("$top", "100");
  url.searchParams.set("$expand", "singleValueExtendedProperties($filter=id eq '" + EXTENDED_PROPERTY_LEAD_ID.replace(/'/g, "''") + "' or id eq '" + EXTENDED_PROPERTY_SOURCE.replace(/'/g, "''") + "')");

  const data = await graphFetch(url.toString(), token);
  return jsonResponse(200, {
    success: true,
    configured: true,
    userEmail,
    events: Array.isArray(data.value) ? data.value.map(mapGraphEvent) : [],
    syncedAt: new Date().toISOString(),
  });
}

async function createEvent(event, admin = {}) {
  const config = getConfiguredOrThrow();
  const payload = parsePayload(event.body);
  const userEmail = resolveCalendarUser(payload.userEmail || payload.ownerEmail || payload.assignedToEmail || admin?.email, config);
  if (!userEmail) return jsonResponse(400, { success: false, error: "Geen Microsoft agenda gebruiker gevonden." });

  const title = cleanText(payload.title);
  const startDateTime = cleanText(payload.startDateTime);
  const endDateTime = cleanText(payload.endDateTime);
  if (!title) return jsonResponse(400, { success: false, error: "Titel ontbreekt." });
  if (!startDateTime || !endDateTime) return jsonResponse(400, { success: false, error: "Start- of eindtijd ontbreekt." });

  const token = await getAccessToken(config);
  const graphPayload = {
    subject: title,
    body: {
      contentType: "HTML",
      content: buildEventBody(payload),
    },
    start: {
      dateTime: startDateTime,
      timeZone: TIMEZONE,
    },
    end: {
      dateTime: endDateTime,
      timeZone: TIMEZONE,
    },
    showAs: "busy",
    categories: ["Max CRM"],
    singleValueExtendedProperties: [
      { id: EXTENDED_PROPERTY_SOURCE, value: "maxwebstudio-sales-agenda" },
      ...(cleanText(payload.leadId) ? [{ id: EXTENDED_PROPERTY_LEAD_ID, value: cleanText(payload.leadId) }] : []),
    ],
  };

  const data = await graphFetch(`${GRAPH_BASE_URL}/users/${encodeURIComponent(userEmail)}/events`, token, {
    method: "POST",
    body: JSON.stringify(graphPayload),
  });

  return jsonResponse(200, {
    success: true,
    configured: true,
    userEmail,
    event: mapGraphEvent(data),
    syncedAt: new Date().toISOString(),
  });
}

async function getAccessToken(config) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error("Microsoft agenda login is mislukt.");
    error.status = response.status || 502;
    error.reason = "microsoft_token_failed";
    throw error;
  }
  return data.access_token;
}

async function graphFetch(url, token, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: `outlook.timezone="${TIMEZONE}"`,
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "Microsoft agenda gaf geen geldige reactie.");
    error.status = response.status || 502;
    error.reason = data?.error?.code || "microsoft_graph_error";
    throw error;
  }
  return data;
}

function getConfiguredOrThrow() {
  const config = getConfig();
  if (config.configured) return config;
  const error = new Error("Microsoft agenda is nog niet gekoppeld.");
  error.status = 503;
  error.reason = "microsoft_calendar_not_configured";
  error.publicMessage = "Microsoft agenda is nog niet gekoppeld. De afspraak blijft lokaal beschikbaar.";
  throw error;
}

function resolveCalendarUser(value, config) {
  return cleanText(value) || config.defaultUser;
}

function mapGraphEvent(event = {}) {
  const extended = Array.isArray(event.singleValueExtendedProperties) ? event.singleValueExtendedProperties : [];
  const leadId = extended.find((item) => item.id === EXTENDED_PROPERTY_LEAD_ID)?.value || "";
  return {
    id: cleanText(event.id),
    microsoftEventId: cleanText(event.id),
    leadId: cleanText(leadId),
    title: cleanText(event.subject) || "Agenda-afspraak",
    notes: cleanText(event.bodyPreview),
    startDateTime: event.start?.dateTime || "",
    endDateTime: event.end?.dateTime || "",
    timeZone: event.start?.timeZone || TIMEZONE,
    webLink: cleanText(event.webLink),
    status: event.isCancelled ? "gearchiveerd" : "open",
    source: "microsoft_calendar",
    updatedAt: cleanText(event.lastModifiedDateTime),
  };
}

function buildEventBody(payload = {}) {
  const lines = [
    cleanText(payload.notes),
    cleanText(payload.leadName) ? `Lead: ${cleanText(payload.leadName)}` : "",
    cleanText(payload.leadId) ? `Lead ID: ${cleanText(payload.leadId)}` : "",
    cleanText(payload.phone) ? `Telefoon: ${cleanText(payload.phone)}` : "",
    cleanText(payload.source) ? `Bron: ${cleanText(payload.source)}` : "Bron: Max CRM sales agenda",
  ].filter(Boolean);
  return lines.map((line) => `<p>${escapeHtml(line).replace(/\n/g, "<br>")}</p>`).join("");
}

function cleanText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function parsePayload(body) {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
