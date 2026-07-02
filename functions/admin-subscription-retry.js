const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");

const SUBSCRIPTION_FIELDS = [
  "id",
  "profile_id",
  "customer_auth_user_id",
  "package_name",
  "billing_cycle",
  "monthly_amount",
  "status",
  "mollie_customer_id",
  "mollie_subscription_id",
  "mollie_subscription_status",
  "mollie_mandate_id",
  "last_payment_at",
  "next_payment_at",
  "mandate_status",
  "mandate_reference",
  "mandate_checkout_url",
  "mandate_payment_id",
  "mandate_payment_status",
  "last_failed_payment_at",
  "last_failed_payment_id",
  "failed_payment_count",
  "retry_status",
  "retry_next_action_at",
  "retry_last_email_sent_at",
  "retry_last_admin_note",
  "subscription_risk_level",
  "subscription_last_error",
  "subscription_synced_at",
  "webhook_last_event",
  "webhook_last_received_at",
  "updated_at",
].join(",");
const PROFILE_FIELDS = "id,auth_user_id,name,company,email";
const allowedActions = new Set(["mark_resolved", "send_retry_email", "add_admin_note", "sync"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse);
    if (!adminCheck.success) return adminCheck.response;

    const config = readConfig();
    if (!config.success) return config.response;

    const payload = parsePayload(event.body);
    const subscriptionId = validateUuid(payload.subscription_id || payload.subscriptionId, "Ongeldig abonnement ID.");
    const action = cleanText(payload.action).toLowerCase();
    if (!allowedActions.has(action)) {
      return jsonResponse(400, { success: false, error: "Kies een geldige retry-actie." });
    }

    const subscription = await fetchSubscription(config.supabaseUrl, config.serviceRoleKey, subscriptionId);
    if (!subscription) return jsonResponse(404, { success: false, error: "Abonnement niet gevonden." });

    if (action === "mark_resolved") return markResolved(config, subscription);
    if (action === "send_retry_email") return sendRetryEmail(config, subscription);
    if (action === "add_admin_note") return addAdminNote(config, subscription, payload);
    return syncSubscription(config, subscription);
  } catch (error) {
    console.error("Admin subscription retry error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });

    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Retry-actie kon niet worden uitgevoerd.",
    });
  }
};

async function markResolved(config, subscription) {
  const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
    retry_status: "resolved",
    subscription_risk_level: "normal",
    retry_next_action_at: null,
    subscription_last_error: null,
    updated_at: new Date().toISOString(),
  });

  return jsonResponse(200, {
    success: true,
    message: "Retry-status is gemarkeerd als opgelost.",
    subscription: normalizeSubscription(updatedSubscription),
  });
}

async function addAdminNote(config, subscription, payload) {
  const note = cleanText(payload.note || payload.retryLastAdminNote || payload.retry_last_admin_note);
  if (!note) return jsonResponse(400, { success: false, error: "Vul een notitie in." });

  const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
    retry_last_admin_note: note,
    updated_at: new Date().toISOString(),
  });

  return jsonResponse(200, {
    success: true,
    message: "Retry-notitie is opgeslagen.",
    subscription: normalizeSubscription(updatedSubscription),
  });
}

async function sendRetryEmail(config, subscription) {
  const profile = await fetchProfile(config.supabaseUrl, config.serviceRoleKey, subscription.profile_id);
  const customerEmail = cleanEmail(profile?.email);
  if (!customerEmail) {
    await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
      subscription_last_error: "Geen klant e-mailadres gevonden.",
      updated_at: new Date().toISOString(),
    });
    return jsonResponse(400, { success: false, error: "Geen klant e-mailadres gevonden." });
  }

  const message = buildRetryEmail(subscription, profile);
  const result = await sendEmail({
    to: customerEmail,
    bcc: cleanEmail(process.env.ADMIN_EMAIL) || undefined,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (!result.sent) {
    const warning = result.warning || "Retry-mail kon niet worden verzonden.";
    await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
      subscription_last_error: warning,
      updated_at: new Date().toISOString(),
    });
    return jsonResponse(502, { success: false, error: "Retry-mail kon niet worden verzonden.", warning });
  }

  const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
    retry_last_email_sent_at: new Date().toISOString(),
    retry_status: cleanText(subscription.retry_status) || "retry_needed",
    subscription_risk_level: riskLevelForCount(Number(subscription.failed_payment_count) || 1),
    subscription_last_error: null,
    updated_at: new Date().toISOString(),
  });

  return jsonResponse(200, {
    success: true,
    message: "Retry-mail is verzonden.",
    subscription: normalizeSubscription(updatedSubscription),
  });
}

async function syncSubscription(config, subscription) {
  const mollieApiKey = process.env.MOLLIE_API_KEY;
  const mollieCustomerId = cleanText(subscription.mollie_customer_id);
  const mollieSubscriptionId = cleanText(subscription.mollie_subscription_id);
  if (!mollieApiKey || !mollieCustomerId || !mollieSubscriptionId) {
    return jsonResponse(400, { success: false, error: "Mollie configuratie of subscription-koppeling ontbreekt." });
  }

  const mollieSubscription = await fetchMollieSubscription(mollieApiKey, mollieCustomerId, mollieSubscriptionId);
  const patch = subscriptionPatchFromMollie(mollieSubscription);
  if (patch.status === "active" && cleanText(subscription.retry_status) && cleanText(subscription.retry_status) !== "resolved") {
    patch.retry_status = "resolved";
    patch.subscription_risk_level = "normal";
    patch.subscription_last_error = null;
  }

  const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, patch);

  return jsonResponse(200, {
    success: true,
    message: "Retry-status is gesynchroniseerd.",
    subscription: normalizeSubscription(updatedSubscription),
  });
}

function readConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Admin subscription retry missing Supabase configuration", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return {
      success: false,
      response: jsonResponse(500, { success: false, error: "Supabase-configuratie ontbreekt." }),
    };
  }
  return { success: true, supabaseUrl, serviceRoleKey };
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

function validateUuid(value, message) {
  const cleaned = cleanText(value);
  if (!uuidPattern.test(cleaned)) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return cleaned;
}

async function fetchSubscription(supabaseUrl, serviceRoleKey, subscriptionId) {
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/customer_subscriptions?select=${SUBSCRIPTION_FIELDS}&id=eq.${encodeURIComponent(subscriptionId)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return Array.isArray(data) ? data[0] : data;
}

async function fetchProfile(supabaseUrl, serviceRoleKey, profileId) {
  const cleanProfileId = cleanText(profileId);
  if (!cleanProfileId) return null;
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/profiles?select=${PROFILE_FIELDS}&id=eq.${encodeURIComponent(cleanProfileId)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return Array.isArray(data) ? data[0] : data;
}

async function patchSubscription(supabaseUrl, serviceRoleKey, subscriptionId, patch) {
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/customer_subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  return Array.isArray(data) ? data[0] : data;
}

async function fetchMollieSubscription(mollieApiKey, mollieCustomerId, mollieSubscriptionId) {
  const response = await fetch(`https://api.mollie.com/v2/customers/${encodeURIComponent(mollieCustomerId)}/subscriptions/${encodeURIComponent(mollieSubscriptionId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${mollieApiKey}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.detail || data.title || "Mollie subscription kon niet worden opgehaald.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  return data;
}

function subscriptionPatchFromMollie(mollieSubscription) {
  const status = cleanText(mollieSubscription.status || "pending");
  const patch = {
    mollie_subscription_status: status,
    next_payment_at: cleanText(mollieSubscription.nextPaymentDate) || null,
    subscription_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (status === "active") patch.status = "active";
  if (status === "canceled") {
    patch.status = "canceled";
    patch.canceled_at = cleanText(mollieSubscription.canceledAt) || new Date().toISOString();
  }
  if (status === "suspended") patch.status = "paused";
  return patch;
}

function buildRetryEmail(subscription, profile) {
  const customerName = cleanText(profile?.name) || cleanText(profile?.company) || "beste klant";
  const packageName = cleanText(subscription.package_name) || "onderhoudsabonnement";
  const portalUrl = absoluteUrl("/client-dashboard.html");
  const mandateUrl = cleanText(subscription.mandate_checkout_url);
  const actionUrl = mandateUrl || portalUrl;
  const text = [
    `Hallo ${customerName},`,
    "",
    `We konden de automatische betaling voor je ${packageName} niet verwerken.`,
    "Geen zorgen: je websitebeheer blijft onze aandacht houden. We vragen je alleen om je betaalmethode of machtiging te controleren.",
    mandateUrl ? `Je kunt je machtiging hier afronden of vernieuwen: ${mandateUrl}` : `Bekijk je abonnement in het klantportaal: ${portalUrl}`,
    "",
    "Als je betaling inmiddels is gelukt, hoef je niets te doen.",
    "",
    "Met vriendelijke groet,",
    "Max Web Studio",
  ].join("\n");

  return {
    subject: "Actie nodig voor je onderhoudsabonnement",
    text,
    html: renderEmailHtml("Actie nodig voor je onderhoudsabonnement", text, actionUrl),
  };
}

function renderEmailHtml(title, text, actionUrl) {
  const paragraphs = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const body = paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const cta = actionUrl
    ? `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#2f7df4;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">Open klantportaal</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0b1220;color:#e5edf8;font-family:Arial,sans-serif;"><div style="max-width:640px;margin:0 auto;padding:32px;"><h1 style="color:#ffffff;">${escapeHtml(title)}</h1>${body}${cta}</div></body></html>`;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error("Supabase subscription retry request failed", {
      status: response.status,
      message: data?.message || data?.error || "Unknown Supabase error",
    });
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  return data;
}

function normalizeSubscription(row) {
  return {
    id: cleanText(row.id),
    status: cleanText(row.status),
    retryStatus: cleanText(row.retry_status),
    subscriptionRiskLevel: cleanText(row.subscription_risk_level || "normal"),
    failedPaymentCount: Number(row.failed_payment_count || 0),
    lastFailedPaymentAt: cleanText(row.last_failed_payment_at),
    retryNextActionAt: cleanText(row.retry_next_action_at),
    retryLastEmailSentAt: cleanText(row.retry_last_email_sent_at),
    retryLastAdminNote: cleanText(row.retry_last_admin_note),
    subscriptionLastError: cleanText(row.subscription_last_error),
  };
}

function riskLevelForCount(count) {
  if (count >= 3) return "high";
  if (count >= 1) return "attention";
  return "normal";
}

function absoluteUrl(path) {
  const siteUrl = (process.env.SITE_URL || "https://maxwebstudio.nl").replace(/\/$/, "");
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
  };
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}
