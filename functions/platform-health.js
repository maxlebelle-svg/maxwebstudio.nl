const fs = require("fs");
const path = require("path");
const { verifyAdmin } = require("./_admin-auth");

const REQUIRED_ENV = [
  { key: "SUPABASE_URL", critical: true, label: "Supabase URL" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", critical: true, label: "Supabase service role" },
  { key: "SUPABASE_ANON_KEY", critical: true, label: "Supabase anon key" },
  { key: "RESEND_API_KEY", critical: false, label: "Resend API key" },
  { key: "RESEND_FROM_EMAIL", critical: false, label: "Resend from email" },
  { key: "MOLLIE_API_KEY", critical: false, label: "Mollie API key" },
  { key: "SITE_URL", critical: false, label: "Platform URL" },
  { key: "ADMIN_TOKEN", critical: false, label: "Legacy admin token" },
];

const FUNCTION_CHECKS = [
  { id: "mail", label: "Mail", file: "admin-email-logs.js", critical: false },
  { id: "resend-webhook", label: "Resend webhook", file: "resend-webhook.js", critical: false },
  { id: "mollie-webhook", label: "Mollie webhook", file: "mollie-webhook.js", critical: false },
  { id: "activity-events", label: "Activity events", file: "admin-activity-events.js", critical: true },
  { id: "customer-timeline", label: "Customer timeline", file: "customer-timeline.js", critical: true },
  { id: "max-brain", label: "Max Brain context", file: "max-brain-context.js", critical: false },
  { id: "dashboard-metrics", label: "CEO dashboard metrics", file: "admin-dashboard-metrics.js", critical: false },
  { id: "customer-portal", label: "Customer portal", file: "client-auth-config.js", critical: false },
  { id: "storage", label: "Storage access", file: "invoice-download.js", critical: false },
  { id: "preview", label: "Preview environment", file: "demo-preview.js", critical: false },
  { id: "website-factory", label: "Website Factory", file: "website-factory.js", critical: false },
];

exports.handler = async (event) => {
  const startedAt = Date.now();
  try {
    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "platform_health",
      action: "read",
      allowedRoles: ["super_admin", "admin", "developer", "support"],
    });
    if (!adminCheck.success) return adminCheck.response;

    const environment = checkEnvironment();
    const supabase = await checkSupabase();
    const functions = checkFunctions();
    const subsystems = buildSubsystemChecks({ environment, supabase, functions });
    const status = overallStatus(subsystems);
    const warnings = collectWarnings({ environment, supabase, functions, subsystems });

    return jsonResponse(200, {
      success: true,
      checkedAt: new Date().toISOString(),
      overallStatus: status,
      latencyMs: Date.now() - startedAt,
      checks: subsystems,
      environment,
      recentErrors: warnings,
    });
  } catch (error) {
    console.error("Platform health error", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Platform Health kon niet worden geladen.",
      checkedAt: new Date().toISOString(),
      overallStatus: "Critical",
    });
  }
};

function checkEnvironment() {
  const variables = REQUIRED_ENV.map((item) => ({
    key: item.key,
    label: item.label,
    critical: item.critical,
    present: Boolean(String(process.env[item.key] || "").trim()),
  }));
  const missingCritical = variables.filter((item) => item.critical && !item.present);
  const missingOptional = variables.filter((item) => !item.critical && !item.present);
  return {
    status: missingCritical.length ? "Critical" : missingOptional.length ? "Warning" : "Healthy",
    variables,
    missingCritical: missingCritical.map((item) => item.key),
    missingOptional: missingOptional.map((item) => item.key),
  };
}

async function checkSupabase() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const apiKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  if (!supabaseUrl || !apiKey) {
    return {
      status: "Critical",
      configured: false,
      reachable: false,
      latencyMs: null,
      message: "Supabase configuratie ontbreekt.",
    };
  }

  const started = Date.now();
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    const latencyMs = Date.now() - started;
    return {
      status: response.ok ? "Healthy" : response.status >= 500 ? "Critical" : "Warning",
      configured: true,
      reachable: true,
      latencyMs,
      httpStatus: response.status,
      message: response.ok ? "Supabase REST bereikbaar." : `Supabase REST gaf HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      status: "Critical",
      configured: true,
      reachable: false,
      latencyMs: Date.now() - started,
      message: "Supabase REST niet bereikbaar.",
    };
  }
}

function checkFunctions() {
  return FUNCTION_CHECKS.map((item) => {
    const filePath = path.join(__dirname, item.file);
    const present = fs.existsSync(filePath);
    return {
      id: item.id,
      label: item.label,
      critical: item.critical,
      status: present ? "Healthy" : item.critical ? "Critical" : "Warning",
      present,
      latencyMs: 0,
      message: present ? "Function bestand aanwezig in deploy bundle." : "Function bestand ontbreekt.",
    };
  });
}

function buildSubsystemChecks({ environment, supabase, functions }) {
  const functionById = new Map(functions.map((item) => [item.id, item]));
  const mailReady = functionById.get("mail");
  const resendWebhook = functionById.get("resend-webhook");
  const mollieWebhook = functionById.get("mollie-webhook");
  const activityReady = functionById.get("activity-events");
  const timelineReady = functionById.get("customer-timeline");
  const resendMissing = environment.variables.some((item) => item.key === "RESEND_API_KEY" && !item.present);
  const mollieMissing = environment.variables.some((item) => item.key === "MOLLIE_API_KEY" && !item.present);
  const storageReady = functionById.get("storage");
  const customerPortalReady = functionById.get("customer-portal");
  const previewReady = functionById.get("preview");
  const factoryReady = functionById.get("website-factory");

  return [
    card("mail", "Mail", mailReady.status, "Mail Center endpoint beschikbaar.", mailReady.latencyMs, false),
    card("resend", "Resend", resendMissing ? "Warning" : resendWebhook.status, resendMissing ? "Resend configuratie vraagt aandacht." : "Resend events en mailstatussen zijn gekoppeld.", resendWebhook.latencyMs, false),
    card("supabase", "Supabase", supabase.status, supabase.message, supabase.latencyMs, true),
    card("storage", "Storage", storageReady.status, "Private download- en opslagroute beschikbaar.", storageReady.latencyMs, false),
    card("mollie", "Mollie", mollieMissing ? "Warning" : mollieWebhook.status, mollieMissing ? "Mollie configuratie vraagt aandacht." : "Mollie webhookroute beschikbaar.", mollieWebhook.latencyMs, false),
    card("webhooks", "Webhooks", statusFromChildren([resendWebhook, mollieWebhook]), "Resend en Mollie webhookroutes gecontroleerd.", maxLatency([resendWebhook, mollieWebhook]), false),
    card("timeline", "Timeline", statusFromChildren([activityReady, timelineReady]), "Activity events en customer timeline beschikbaar.", maxLatency([activityReady, timelineReady]), true),
    card("notifications", "Notifications", activityReady.status, "Notification Center gebruikt activity events.", activityReady.latencyMs, true),
    card("automations", "Automations", "Healthy", "Workflow builder en execution diagnostics voorbereid.", 0, false),
    card("customer-portal", "Customer Portal", customerPortalReady.status, "Klantportaal auth-config route beschikbaar.", customerPortalReady.latencyMs, false),
    card("preview-environment", "Preview Environment", previewReady.status, "Preview route beschikbaar.", previewReady.latencyMs, false),
    card("website-factory", "Website Factory", factoryReady.status, "Website Factory endpoint beschikbaar.", factoryReady.latencyMs, false),
  ];
}

function card(id, label, status, message, latencyMs, critical) {
  return { id, label, status, message, latencyMs, critical };
}

function overallStatus(checks) {
  if (checks.some((item) => item.critical && item.status === "Critical")) return "Critical";
  if (checks.some((item) => item.status === "Critical" || item.status === "Warning")) return "Warning";
  return "Healthy";
}

function statusFromChildren(rows = []) {
  if (rows.some((row) => row?.status === "Critical")) return "Critical";
  if (rows.some((row) => row?.status === "Warning")) return "Warning";
  return "Healthy";
}

function maxLatency(rows = []) {
  const values = rows.map((row) => Number(row?.latencyMs)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function collectWarnings({ environment, supabase, functions, subsystems }) {
  const rows = [];
  environment.variables.filter((item) => !item.present).forEach((item) => {
    rows.push({
      level: item.critical ? "critical" : "warning",
      source: "environment",
      message: `${item.label} ontbreekt.`,
      createdAt: new Date().toISOString(),
    });
  });
  if (supabase.status !== "Healthy") {
    rows.push({ level: supabase.status.toLowerCase(), source: "supabase", message: supabase.message, createdAt: new Date().toISOString() });
  }
  functions.filter((item) => item.status !== "Healthy").forEach((item) => {
    rows.push({ level: item.status.toLowerCase(), source: "functions", message: `${item.label}: ${item.message}`, createdAt: new Date().toISOString() });
  });
  subsystems.filter((item) => item.status !== "Healthy" && !rows.some((row) => row.source === item.id)).forEach((item) => {
    rows.push({ level: item.status.toLowerCase(), source: item.id, message: item.message, createdAt: new Date().toISOString() });
  });
  return rows.slice(0, 20);
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
