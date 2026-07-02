const { verifyAdmin } = require("./_admin-auth");
const SUBSCRIPTION_FIELDS = [
  "id",
  "profile_id",
  "customer_auth_user_id",
  "package_name",
  "billing_cycle",
  "monthly_amount",
  "status",
  "start_date",
  "next_invoice_date",
  "mollie_customer_id",
  "mollie_subscription_id",
  "mollie_subscription_status",
  "mollie_mandate_id",
  "last_payment_at",
  "next_payment_at",
  "canceled_at",
  "paused_at",
  "mandate_status",
  "mandate_reference",
  "mandate_checkout_url",
  "mandate_payment_id",
  "mandate_payment_status",
  "subscription_synced_at",
  "webhook_last_event",
  "webhook_last_received_at",
  "admin_action_last_type",
  "admin_action_last_at",
  "admin_action_last_error",
  "cancellation_reason",
  "cancellation_requested_at",
  "resumed_at",
  "notes",
  "created_at",
  "updated_at",
].join(",");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedActions = new Set(["pause", "resume", "cancel", "sync"]);

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
      return jsonResponse(400, { success: false, error: "Kies een geldige abonnementsactie." });
    }

    const subscription = await fetchSubscription(config.supabaseUrl, config.serviceRoleKey, subscriptionId);
    if (!subscription) return jsonResponse(404, { success: false, error: "Abonnement niet gevonden." });

    if (action === "pause") return handlePause(config, subscription);
    if (action === "resume") return handleResume(config, subscription);
    if (action === "cancel") return handleCancel(config, subscription, payload);
    return handleSync(config, subscription);
  } catch (error) {
    console.error("Admin Mollie subscription action error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });

    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Mollie abonnementsactie kon niet worden uitgevoerd.",
    });
  }
};

async function handlePause(config, subscription) {
  const now = new Date().toISOString();
  const warning = "Mollie ondersteunt in deze integratie geen directe pauzeeractie; de lokale CRM-status is bijgewerkt.";
  const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
    status: "paused",
    paused_at: now,
    admin_action_last_type: "pause",
    admin_action_last_at: now,
    admin_action_last_error: warning,
    updated_at: now,
  });

  return jsonResponse(200, {
    success: true,
    warning,
    subscription: normalizeSubscription(updatedSubscription),
  });
}

async function handleResume(config, subscription) {
  const now = new Date().toISOString();
  const warning = "Mollie ondersteunt in deze integratie geen directe hervatactie; de lokale CRM-status is bijgewerkt.";
  const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
    status: "active",
    resumed_at: now,
    admin_action_last_type: "resume",
    admin_action_last_at: now,
    admin_action_last_error: warning,
    updated_at: now,
  });

  return jsonResponse(200, {
    success: true,
    warning,
    subscription: normalizeSubscription(updatedSubscription),
  });
}

async function handleCancel(config, subscription, payload) {
  const mollieCustomerId = cleanText(subscription.mollie_customer_id);
  const mollieSubscriptionId = cleanText(subscription.mollie_subscription_id);
  const now = new Date().toISOString();
  const actionPatch = {
    admin_action_last_type: "cancel",
    admin_action_last_at: now,
    updated_at: now,
  };

  if (!mollieCustomerId || !mollieSubscriptionId) {
    const message = "Dit abonnement heeft nog geen gekoppelde Mollie subscription.";
    await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
      ...actionPatch,
      admin_action_last_error: message,
    });
    return jsonResponse(400, { success: false, error: message });
  }

  try {
    const mollieSubscription = await cancelMollieSubscription(config.mollieApiKey, mollieCustomerId, mollieSubscriptionId);
    const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
      ...actionPatch,
      status: "canceled",
      mollie_subscription_status: cleanText(mollieSubscription.status || "canceled"),
      canceled_at: cleanText(mollieSubscription.canceledAt) || now,
      cancellation_requested_at: now,
      cancellation_reason: cleanText(payload.cancellation_reason || payload.cancellationReason),
      admin_action_last_error: null,
    });

    return jsonResponse(200, {
      success: true,
      message: "Abonnement is opgezegd.",
      subscription: normalizeSubscription(updatedSubscription),
    });
  } catch (error) {
    await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
      ...actionPatch,
      admin_action_last_error: error.message || "Mollie opzegactie is mislukt.",
    });
    throw error;
  }
}

async function handleSync(config, subscription) {
  const now = new Date().toISOString();
  const mollieCustomerId = cleanText(subscription.mollie_customer_id);
  const mollieSubscriptionId = cleanText(subscription.mollie_subscription_id);
  const actionPatch = {
    admin_action_last_type: "sync",
    admin_action_last_at: now,
    updated_at: now,
  };

  if (!mollieCustomerId) {
    const message = "Dit abonnement heeft nog geen gekoppelde Mollie customer.";
    const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
      ...actionPatch,
      admin_action_last_error: message,
    });
    return jsonResponse(400, { success: false, error: message, subscription: normalizeSubscription(updatedSubscription) });
  }

  try {
    const mandate = await findValidMandate(config.mollieApiKey, mollieCustomerId);
    if (!mollieSubscriptionId) {
      const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
        ...actionPatch,
        mollie_mandate_id: cleanText(mandate?.id) || cleanText(subscription.mollie_mandate_id) || null,
        mandate_status: cleanText(mandate?.status || subscription.mandate_status) || null,
        mandate_reference: cleanText(mandate?.method || mandate?.reference || subscription.mandate_reference) || null,
        admin_action_last_error: "Geen Mollie subscription gekoppeld; alleen mandategegevens bijgewerkt.",
        subscription_synced_at: now,
      });
      return jsonResponse(200, {
        success: true,
        warning: "Geen Mollie subscription gekoppeld; mandategegevens zijn bijgewerkt.",
        subscription: normalizeSubscription(updatedSubscription),
      });
    }

    const mollieSubscription = await fetchMollieSubscription(config.mollieApiKey, mollieCustomerId, mollieSubscriptionId);
    const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
      ...subscriptionPatchFromMollie(mollieSubscription, mandate),
      ...actionPatch,
      admin_action_last_error: null,
    });

    return jsonResponse(200, {
      success: true,
      message: "Abonnement is gesynchroniseerd.",
      subscription: normalizeSubscription(updatedSubscription),
    });
  } catch (error) {
    await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
      ...actionPatch,
      admin_action_last_error: error.message || "Synchronisatie is mislukt.",
    });
    throw error;
  }
}

function readConfig() {
  const mollieApiKey = process.env.MOLLIE_API_KEY;
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!mollieApiKey || !supabaseUrl || !serviceRoleKey) {
    console.error("Admin Mollie subscription action missing configuration", {
      hasMollieApiKey: Boolean(mollieApiKey),
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return {
      success: false,
      response: jsonResponse(500, { success: false, error: "Mollie- of Supabase-configuratie ontbreekt." }),
    };
  }

  return { success: true, mollieApiKey, supabaseUrl, serviceRoleKey };
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

async function cancelMollieSubscription(mollieApiKey, mollieCustomerId, mollieSubscriptionId) {
  const response = await fetch(`https://api.mollie.com/v2/customers/${encodeURIComponent(mollieCustomerId)}/subscriptions/${encodeURIComponent(mollieSubscriptionId)}`, {
    method: "DELETE",
    headers: mollieHeaders(mollieApiKey),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Mollie subscription cancel failed", {
      status: response.status,
      title: data.title,
      detail: data.detail,
    });
    const error = new Error(data.detail || data.title || "Mollie subscription kon niet worden opgezegd.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  return data;
}

async function fetchMollieSubscription(mollieApiKey, mollieCustomerId, mollieSubscriptionId) {
  const response = await fetch(`https://api.mollie.com/v2/customers/${encodeURIComponent(mollieCustomerId)}/subscriptions/${encodeURIComponent(mollieSubscriptionId)}`, {
    method: "GET",
    headers: mollieHeaders(mollieApiKey),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.detail || data.title || "Mollie subscription kon niet worden opgehaald.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  return data;
}

async function findValidMandate(mollieApiKey, mollieCustomerId) {
  const response = await fetch(`https://api.mollie.com/v2/customers/${encodeURIComponent(mollieCustomerId)}/mandates`, {
    method: "GET",
    headers: mollieHeaders(mollieApiKey),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.detail || data.title || "Mollie mandates konden niet worden opgehaald.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  const mandates = Array.isArray(data._embedded?.mandates) ? data._embedded.mandates : [];
  return mandates.find((mandate) => cleanText(mandate.status).toLowerCase() === "valid") || null;
}

function subscriptionPatchFromMollie(mollieSubscription, mandate) {
  const status = cleanText(mollieSubscription.status || "pending");
  const patch = {
    mollie_subscription_id: cleanText(mollieSubscription.id) || null,
    mollie_subscription_status: status,
    mollie_mandate_id: cleanText(mollieSubscription.mandateId || mandate?.id) || null,
    mandate_status: cleanText(mandate?.status || (mollieSubscription.mandateId ? "valid" : "")) || null,
    mandate_reference: cleanText(mandate?.method || mandate?.reference) || null,
    next_payment_at: cleanText(mollieSubscription.nextPaymentDate) || null,
    subscription_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (status === "active") patch.status = "active";
  if (status === "canceled") {
    patch.status = "canceled";
    patch.canceled_at = cleanText(mollieSubscription.canceledAt) || new Date().toISOString();
  }
  if (status === "suspended") {
    patch.status = "paused";
    patch.paused_at = new Date().toISOString();
  }

  return patch;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error("Supabase subscription action request failed", {
      status: response.status,
      message: data?.message || data?.error || "Unknown Supabase error",
    });
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  return data;
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
  };
}

function mollieHeaders(mollieApiKey) {
  return {
    Authorization: `Bearer ${mollieApiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function normalizeSubscription(row) {
  return {
    id: cleanText(row.id),
    status: cleanText(row.status),
    mollieCustomerId: cleanText(row.mollie_customer_id),
    mollieSubscriptionId: cleanText(row.mollie_subscription_id),
    mollieSubscriptionStatus: cleanText(row.mollie_subscription_status),
    mandateStatus: cleanText(row.mandate_status),
    lastPaymentAt: cleanText(row.last_payment_at),
    nextPaymentAt: cleanText(row.next_payment_at),
    canceledAt: cleanText(row.canceled_at),
    pausedAt: cleanText(row.paused_at),
    resumedAt: cleanText(row.resumed_at),
    adminActionLastType: cleanText(row.admin_action_last_type),
    adminActionLastAt: cleanText(row.admin_action_last_at),
    adminActionLastError: cleanText(row.admin_action_last_error),
    cancellationReason: cleanText(row.cancellation_reason),
    cancellationRequestedAt: cleanText(row.cancellation_requested_at),
    subscriptionSyncedAt: cleanText(row.subscription_synced_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
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
