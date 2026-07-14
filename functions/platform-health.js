const fs = require("fs");
const path = require("path");
const { verifyAdmin } = require("./_admin-auth");
const { createActivityEvent } = require("./services/timelineService");

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
  { id: "email-studio", label: "E-mail Studio", file: "admin-invoice-email.js", critical: false },
  { id: "resend-webhook", label: "Resend webhook", file: "resend-webhook.js", critical: false },
  { id: "mollie-webhook", label: "Mollie webhook", file: "mollie-webhook.js", critical: false },
  { id: "payment", label: "Payments", file: "admin-mollie-payment.js", critical: false },
  { id: "commercial-flow", label: "Commercial Flow", file: "commercial-order.js", critical: false },
  { id: "activity-events", label: "Activity events", file: "admin-activity-events.js", critical: true },
  { id: "customer-timeline", label: "Customer timeline", file: "customer-timeline.js", critical: true },
  { id: "max-brain", label: "Max Brain context", file: "max-brain-context.js", critical: false },
  { id: "dashboard-metrics", label: "CEO dashboard metrics", file: "admin-dashboard-metrics.js", critical: false },
  { id: "customer-portal", label: "Customer portal", file: "client-auth-config.js", critical: false },
  { id: "storage", label: "Storage access", file: "invoice-download.js", critical: false },
  { id: "uploads", label: "Uploads", file: "intake-storage.js", critical: false },
  { id: "preview", label: "Preview environment", file: "demo-preview.js", critical: false },
  { id: "website-factory", label: "Website Factory", file: "website-factory.js", critical: false },
  { id: "website-factory-core", label: "Website Factory core", file: "_website-factory-core.js", critical: false },
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
    const role = String(adminCheck.admin?.role || adminCheck.source || "").toLowerCase();
    const canSeeDeveloperInfo = ["super_admin", "admin", "developer", "legacy_admin_token"].includes(role);

    const environment = checkEnvironment();
    const supabase = await checkSupabase();
    const functions = checkFunctions();
    const artifacts = checkArtifacts();
    const subsystems = buildSubsystemChecks({ environment, supabase, functions, artifacts });
    const status = overallStatus(subsystems);
    const healthScore = calculateHealthScore(subsystems);
    const warnings = collectWarnings({ environment, supabase, functions, artifacts, subsystems });
    const openFailures = warnings.filter((item) => item.level === "critical" || item.level === "warning");
    const automationSummary = summarizeAutomations(subsystems);
    const notificationSummary = {
      warningCount: warnings.filter((item) => item.level === "warning").length,
      criticalCount: warnings.filter((item) => item.level === "critical").length,
    };
    await logHealthSignals({ status, healthScore, warnings, subsystems });

    return jsonResponse(200, {
      success: true,
      checkedAt: new Date().toISOString(),
      overallStatus: status,
      platformStatus: status,
      healthScore,
      latencyMs: Date.now() - startedAt,
      checks: subsystems,
      services: subsystems,
      serviceDetails: subsystems.map(serviceDetail),
      summary: {
        status,
        healthScore,
        lastCheck: new Date().toISOString(),
        warningCount: notificationSummary.warningCount,
        criticalCount: notificationSummary.criticalCount,
        activeAutomations: automationSummary.active,
        openFailures: openFailures.length,
      },
      environment: canSeeDeveloperInfo ? environment : redactEnvironment(environment),
      recentErrors: warnings,
      developerInfo: canSeeDeveloperInfo ? { environment, functions, artifacts, supabase } : undefined,
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

function checkArtifacts() {
  const publicDir = path.join(__dirname, "..", "public");
  const rows = [
    { id: "notifications-ui", label: "Notification Center UI", file: "admin-notification-center.html", critical: true },
    { id: "automations-ui", label: "Max Automations UI", file: "admin-max-automations.html", critical: false },
    { id: "brain-ui", label: "Max Brain UI", file: "admin-max-brain.html", critical: false },
    { id: "ceo-ui", label: "CEO-modus", file: "admin-dashboard.html", critical: false },
    { id: "command-ui", label: "Max Command registry", file: "admin/ui/global-command-palette.js", critical: false },
    { id: "factory-ui", label: "Website Factory UI", file: "admin-website-factory.html", critical: false },
    { id: "preview-ui", label: "Preview Builder UI", file: "preview.html", critical: false },
    { id: "portal-ui", label: "Customer Portal UI", file: "klantportaal.html", critical: false },
    { id: "seo-ui", label: "SEO Engine UI", file: "admin-seo-studio.html", critical: false },
  ];
  return rows.map((item) => {
    const present = fs.existsSync(path.join(publicDir, item.file));
    return {
      id: item.id,
      label: item.label,
      critical: item.critical,
      status: present ? "Healthy" : item.critical ? "Critical" : "Warning",
      present,
      latencyMs: 0,
      message: present ? "Module is aanwezig in het platform." : "Module ontbreekt in de deploy.",
    };
  });
}

function buildSubsystemChecks({ environment, supabase, functions, artifacts }) {
  const functionById = new Map(functions.map((item) => [item.id, item]));
  const artifactById = new Map(artifacts.map((item) => [item.id, item]));
  const mailReady = functionById.get("mail");
  const emailStudioReady = functionById.get("email-studio");
  const resendWebhook = functionById.get("resend-webhook");
  const mollieWebhook = functionById.get("mollie-webhook");
  const paymentReady = functionById.get("payment");
  const commercialReady = functionById.get("commercial-flow");
  const activityReady = functionById.get("activity-events");
  const timelineReady = functionById.get("customer-timeline");
  const notificationsReady = artifactById.get("notifications-ui");
  const automationsReady = artifactById.get("automations-ui");
  const brainReady = artifactById.get("brain-ui");
  const ceoReady = artifactById.get("ceo-ui");
  const commandReady = artifactById.get("command-ui");
  const resendMissing = environment.variables.some((item) => item.key === "RESEND_API_KEY" && !item.present);
  const mollieMissing = environment.variables.some((item) => item.key === "MOLLIE_API_KEY" && !item.present);
  const storageReady = functionById.get("storage");
  const uploadReady = functionById.get("uploads");
  const customerPortalReady = functionById.get("customer-portal");
  const previewReady = functionById.get("preview");
  const previewUiReady = artifactById.get("preview-ui");
  const factoryReady = functionById.get("website-factory");
  const factoryCoreReady = functionById.get("website-factory-core");
  const factoryUiReady = artifactById.get("factory-ui");
  const portalUiReady = artifactById.get("portal-ui");
  const seoUiReady = artifactById.get("seo-ui");

  return [
    card("mail", "Mail", mailReady.status, "Mail Center endpoint beschikbaar.", mailReady.latencyMs, false),
    card("email-studio", "E-mail Studio", emailStudioReady.status, "E-mail Studio en factuurmailroute beschikbaar.", emailStudioReady.latencyMs, false),
    card("resend", "Resend", resendMissing ? "Warning" : resendWebhook.status, resendMissing ? "Resend configuratie vraagt aandacht." : "Resend events en mailstatussen zijn gekoppeld.", resendWebhook.latencyMs, false),
    card("supabase", "Supabase", supabase.status, supabase.message, supabase.latencyMs, true),
    card("storage", "Storage", statusFromChildren([storageReady, uploadReady]), "Private downloads en intake uploads zijn gekoppeld.", maxLatency([storageReady, uploadReady]), false),
    card("mollie", "Mollie", mollieMissing ? "Warning" : mollieWebhook.status, mollieMissing ? "Mollie configuratie vraagt aandacht." : "Mollie webhookroute beschikbaar.", mollieWebhook.latencyMs, false),
    card("payments", "Payments", paymentReady.status, "Betalingsroute en betaalstatussen zijn beschikbaar.", paymentReady.latencyMs, false),
    card("webhooks", "Webhooks", statusFromChildren([resendWebhook, mollieWebhook]), "Resend en Mollie webhookroutes gecontroleerd.", maxLatency([resendWebhook, mollieWebhook]), false),
    card("timeline", "Timeline", statusFromChildren([activityReady, timelineReady]), "Activity events en customer timeline beschikbaar.", maxLatency([activityReady, timelineReady]), true),
    card("notifications", "Notifications", statusFromChildren([activityReady, notificationsReady]), "Notification Center gebruikt activity events.", maxLatency([activityReady, notificationsReady]), true),
    card("automations", "Automations", automationsReady.status, "Workflow builder en execution diagnostics beschikbaar.", automationsReady.latencyMs, false),
    card("customer-portal", "Customer Portal", statusFromChildren([customerPortalReady, portalUiReady]), "Klantportaal en auth-config route beschikbaar.", maxLatency([customerPortalReady, portalUiReady]), false),
    card("preview-environment", "Preview Environment", statusFromChildren([previewReady, previewUiReady]), "Preview route en reviewomgeving beschikbaar.", maxLatency([previewReady, previewUiReady]), false),
    card("website-factory", "Website Factory", statusFromChildren([factoryReady, factoryCoreReady, factoryUiReady]), "Website Factory endpoint, core en UI beschikbaar.", maxLatency([factoryReady, factoryCoreReady, factoryUiReady]), false),
    card("commercial-flow", "Commercial Flow", commercialReady.status, "Order, contract en payment startflow beschikbaar.", commercialReady.latencyMs, false),
    card("onboarding", "Onboarding", statusFromChildren([uploadReady, portalUiReady]), "Onboarding updates en uploads lopen via bestaande klantportal.", maxLatency([uploadReady, portalUiReady]), false),
    card("max-brain", "Max Brain", brainReady.status, "Max Brain UI gebruikt bestaande CRM-data.", brainReady.latencyMs, false),
    card("ceo-mode", "CEO-modus", ceoReady.status, "CEO-dashboardwidgets beschikbaar.", ceoReady.latencyMs, false),
    card("max-command", "Max Command", commandReady.status, "Command registry beschikbaar.", commandReady.latencyMs, false),
    card("growth-automations", "Growth Automations", statusFromChildren([automationsReady, brainReady]), "Groei-inzichten gebruiken Max Automations en Max Brain.", maxLatency([automationsReady, brainReady]), false),
    card("launch-automations", "Launch Automations", statusFromChildren([factoryReady, automationsReady]), "Preview- en livegangflow gekoppeld aan Factory en Automations.", maxLatency([factoryReady, automationsReady]), false),
    card("seo-engine", "SEO Engine", seoUiReady.status, "SEO Engine UI beschikbaar.", seoUiReady.latencyMs, false),
    card("uploads", "Uploads", uploadReady.status, "Klantuploads en intake storage helper beschikbaar.", uploadReady.latencyMs, false),
    card("ai-pipeline", "AI Pipeline", statusFromChildren([factoryCoreReady, brainReady]), "AI pipeline gebruikt Website Factory core en Max Brain context.", maxLatency([factoryCoreReady, brainReady]), false),
  ].map((item) => ({
    ...item,
    lastCheck: new Date().toISOString(),
    openIssues: item.status === "Healthy" ? 0 : 1,
    impact: impactForStatus(item.status, item.critical),
    retryPossible: true,
  }));
}

function card(id, label, status, message, latencyMs, critical) {
  return { id, label, status, message, latencyMs, critical };
}

function overallStatus(checks) {
  if (checks.some((item) => item.critical && item.status === "Critical")) return "Critical";
  if (checks.some((item) => item.status === "Critical" || item.status === "Warning")) return "Warning";
  return "Healthy";
}

function calculateHealthScore(checks = []) {
  if (!checks.length) return 0;
  const totalWeight = checks.reduce((sum, item) => sum + (item.critical ? 2 : 1), 0);
  const lost = checks.reduce((sum, item) => {
    const weight = item.critical ? 2 : 1;
    if (item.status === "Critical") return sum + weight;
    if (item.status === "Warning") return sum + weight * 0.45;
    if (item.status === "Unknown") return sum + weight * 0.25;
    return sum;
  }, 0);
  return Math.max(0, Math.min(100, Math.round(((totalWeight - lost) / totalWeight) * 100)));
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

function collectWarnings({ environment, supabase, functions, artifacts, subsystems }) {
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
  artifacts.filter((item) => item.status !== "Healthy").forEach((item) => {
    rows.push({ level: item.status.toLowerCase(), source: item.id, message: `${item.label}: ${item.message}`, createdAt: new Date().toISOString() });
  });
  subsystems.filter((item) => item.status !== "Healthy" && !rows.some((row) => row.source === item.id)).forEach((item) => {
    rows.push({ level: item.status.toLowerCase(), source: item.id, message: item.message, createdAt: new Date().toISOString() });
  });
  return rows.slice(0, 20);
}

function summarizeAutomations(subsystems = []) {
  const automationRows = subsystems.filter((item) => /automation|launch|growth/.test(item.id));
  return {
    active: automationRows.filter((item) => item.status === "Healthy").length,
    failed: automationRows.filter((item) => item.status === "Critical").length,
  };
}

function serviceDetail(item = {}) {
  return {
    id: item.id,
    name: item.label,
    status: item.status || "Unknown",
    lastCheck: item.lastCheck || new Date().toISOString(),
    lastError: item.status === "Healthy" ? "" : item.message || "Controle nodig.",
    openIssues: item.openIssues || 0,
    impact: item.impact || impactForStatus(item.status, item.critical),
    retryPossible: item.retryPossible !== false,
  };
}

function impactForStatus(status, critical) {
  if (status === "Critical") return critical ? "Kritieke platformfunctie vraagt direct aandacht." : "Onderdeel kan beperkt beschikbaar zijn.";
  if (status === "Warning") return "Onderdeel werkt, maar configuratie of monitoring vraagt aandacht.";
  if (status === "Unknown") return "Status kan nog niet worden vastgesteld.";
  return "Geen actieve impact.";
}

function redactEnvironment(environment = {}) {
  return {
    status: environment.status,
    variables: (environment.variables || []).map((item) => ({
      label: item.label,
      critical: item.critical,
      present: item.present,
    })),
  };
}

async function logHealthSignals({ status, healthScore, warnings, subsystems }) {
  const relevantWarnings = warnings.filter((item) => item.level === "critical" || item.level === "warning").slice(0, 5);
  const checkedDate = new Date().toISOString().slice(0, 10);
  if (status !== "Healthy") {
    await safeActivityEvent({
      eventType: "health_warning",
      severity: status === "Critical" ? "error" : "warning",
      title: status === "Critical" ? "Platform critical" : "Platform warning",
      description: `Health score ${healthScore}/100. ${relevantWarnings.length} signaal${relevantWarnings.length === 1 ? "" : "en"} open.`,
      module: "platform_health",
      metadata: { dedupeKey: `platform-health-${checkedDate}-${status.toLowerCase()}`, healthScore, status },
    });
  } else {
    await safeActivityEvent({
      eventType: "health_restored",
      severity: "success",
      title: "Health restored",
      description: `Health score ${healthScore}/100. Alle kritieke checks zijn gezond.`,
      module: "platform_health",
      metadata: { dedupeKey: `platform-health-${checkedDate}-healthy`, healthScore, status },
    });
  }

  await Promise.all(relevantWarnings.map((warning) => safeActivityEvent({
    eventType: eventTypeForWarning(warning, subsystems),
    severity: warning.level === "critical" ? "error" : "warning",
    title: titleForWarning(warning),
    description: warning.message,
    module: "platform_health",
    metadata: { dedupeKey: `platform-health-${checkedDate}-${warning.source}-${warning.level}`, source: warning.source },
  })));
}

function eventTypeForWarning(warning = {}, subsystems = []) {
  const source = cleanText(warning.source).toLowerCase();
  const subsystem = subsystems.find((item) => item.id === source || item.label?.toLowerCase() === source);
  const id = subsystem?.id || source;
  if (/mail|resend|email/.test(id)) return "mail_warning";
  if (/payment|mollie|invoice/.test(id)) return "payment_warning";
  if (/automation|growth|launch/.test(id)) return "automation_warning";
  if (/factory|ai-pipeline/.test(id)) return "factory_warning";
  if (/preview/.test(id)) return "preview_warning";
  return "service_warning";
}

function titleForWarning(warning = {}) {
  const source = cleanText(warning.source || "Platform");
  if (/mail|resend|email/i.test(source)) return "Mail warning";
  if (/payment|mollie|invoice/i.test(source)) return "Payment warning";
  if (/automation|growth|launch/i.test(source)) return "Automation failed";
  if (/factory|ai-pipeline/i.test(source)) return "Factory failed";
  if (/preview/i.test(source)) return "Preview failed";
  if (warning.level === "critical") return "Platform critical";
  return "Platform warning";
}

async function safeActivityEvent(input) {
  try {
    await createActivityEvent({ ...input, actorName: "Platform Health Center", actorRole: "system", isGlobal: true });
  } catch (error) {
    console.warn("Platform health event skipped", { message: error.message, eventType: input.eventType });
  }
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
