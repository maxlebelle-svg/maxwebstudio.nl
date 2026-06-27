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
].join(",");
const PROFILE_FIELDS = "id,auth_user_id,name,company,email";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
    }

    const adminCheck = verifyAdmin(event);
    if (!adminCheck.success) return adminCheck.response;

    const config = readConfig();
    if (!config.success) return config.response;

    const payload = parsePayload(event.body);
    const action = cleanText(payload.action || "activate_subscription").toLowerCase();
    const subscriptionId = validateUuid(payload.subscription_id || payload.subscriptionId, "Ongeldig abonnement ID.");

    const subscription = await fetchSubscription(config.supabaseUrl, config.serviceRoleKey, subscriptionId);
    if (!subscription) return jsonResponse(404, { success: false, error: "Abonnement niet gevonden." });

    const profile = await fetchProfile(config.supabaseUrl, config.serviceRoleKey, subscription.profile_id);
    const customerEmail = cleanEmail(profile?.email);
    if (!customerEmail) return jsonResponse(400, { success: false, error: "Klantprofiel heeft geen geldig e-mailadres." });

    const amount = Number(subscription.monthly_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(400, { success: false, error: "Abonnementsbedrag moet groter zijn dan 0." });
    }

    const mollieCustomerId = cleanText(subscription.mollie_customer_id) || await createMollieCustomer(config.mollieApiKey, profile, customerEmail);
    let currentSubscription = { ...subscription, mollie_customer_id: mollieCustomerId };
    if (!cleanText(subscription.mollie_customer_id)) {
      currentSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
        mollie_customer_id: mollieCustomerId,
        updated_at: new Date().toISOString(),
      });
    }

    if (action === "sync_subscription") {
      const syncedSubscription = await syncMollieSubscription(config, currentSubscription);
      return jsonResponse(200, {
        success: true,
        message: "Abonnement gesynchroniseerd.",
        subscription: normalizeSubscription(syncedSubscription),
      });
    }

    if (cleanText(currentSubscription.mollie_subscription_id)) {
      const syncedSubscription = await syncMollieSubscription(config, currentSubscription);
      return jsonResponse(200, {
        success: true,
        reused: true,
        warning: "Dit abonnement heeft al een Mollie subscription en is gesynchroniseerd.",
        subscription: normalizeSubscription(syncedSubscription),
      });
    }

    const mandate = await findValidMandate(config.mollieApiKey, mollieCustomerId);
    if (!mandate) {
      const mandatePayment = await createMandatePayment(config, mollieCustomerId, currentSubscription, profile, customerEmail);
      const checkoutUrl = mandatePayment?._links?.checkout?.href || "";
      if (!mandatePayment.id || !checkoutUrl) {
        console.error("Mollie mandate payment missing expected fields", {
          hasPaymentId: Boolean(mandatePayment.id),
          hasCheckoutUrl: Boolean(checkoutUrl),
        });
        return jsonResponse(502, { success: false, error: "Mollie gaf geen geldige machtigingslink terug." });
      }

      const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, currentSubscription.id, {
        mollie_customer_id: mollieCustomerId,
        mandate_status: "pending",
        mandate_checkout_url: checkoutUrl,
        mandate_payment_id: mandatePayment.id,
        mandate_payment_status: cleanText(mandatePayment.status || "open"),
        webhook_last_event: "mandate_payment_created",
        updated_at: new Date().toISOString(),
      });

      return jsonResponse(200, {
        success: true,
        requiresMandate: true,
        warning: "Klant moet eerst machtiging afronden.",
        checkoutUrl,
        paymentId: mandatePayment.id,
        subscription: normalizeSubscription(updatedSubscription),
      });
    }

    const updatedSubscription = await createAndStoreSubscription(config, currentSubscription, mandate, "subscription_created");
    return jsonResponse(200, {
      success: true,
      customerId: mollieCustomerId,
      subscriptionId: updatedSubscription.mollie_subscription_id,
      subscription: normalizeSubscription(updatedSubscription),
    });
  } catch (error) {
    console.error("Admin Mollie subscription error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Mollie abonnement kon niet worden geactiveerd.",
    });
  }
};

function verifyAdmin(event) {
  const expectedToken = process.env.ADMIN_TOKEN;
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return { success: false, response: jsonResponse(401, { success: false, error: "Niet geautoriseerd." }) };
  }
  return { success: true };
}

function readConfig() {
  const mollieApiKey = process.env.MOLLIE_API_KEY;
  const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!mollieApiKey || !siteUrl || !supabaseUrl || !serviceRoleKey) {
    console.error("Admin Mollie subscription missing configuration", {
      hasMollieApiKey: Boolean(mollieApiKey),
      hasSiteUrl: Boolean(siteUrl),
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return {
      success: false,
      response: jsonResponse(500, { success: false, error: "Mollie- of Supabase-configuratie ontbreekt." }),
    };
  }

  return { success: true, mollieApiKey, siteUrl, supabaseUrl, serviceRoleKey };
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

async function createMollieCustomer(mollieApiKey, profile, email) {
  const response = await fetch("https://api.mollie.com/v2/customers", {
    method: "POST",
    headers: mollieHeaders(mollieApiKey),
    body: JSON.stringify({
      name: cleanText(profile.company) || cleanText(profile.name) || email,
      email,
      metadata: {
        source: "max_web_studio_admin_crm",
        profileId: cleanText(profile.id),
        authUserId: cleanText(profile.auth_user_id),
      },
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Mollie customer creation failed", {
      status: response.status,
      title: data.title,
      detail: data.detail,
    });
    const error = new Error(data.detail || data.title || "Mollie customer kon niet worden aangemaakt.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  if (!data.id) {
    const error = new Error("Mollie gaf geen geldig customer ID terug.");
    error.statusCode = 502;
    throw error;
  }

  return data.id;
}

async function createMandatePayment(config, mollieCustomerId, subscription, profile, email) {
  const response = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: mollieHeaders(config.mollieApiKey),
    body: JSON.stringify({
      amount: {
        currency: "EUR",
        value: "0.01",
      },
      customerId: mollieCustomerId,
      sequenceType: "first",
      description: `Machtiging ${subscriptionDescription(subscription)}`.slice(0, 255),
      redirectUrl: `${config.siteUrl}/client-dashboard.html`,
      webhookUrl: `${config.siteUrl}/.netlify/functions/mollie-webhook`,
      metadata: {
        source: "admin_crm_subscription_mandate",
        subscriptionId: cleanText(subscription.id),
        profileId: cleanText(subscription.profile_id),
        packageName: cleanText(subscription.package_name),
        customerEmail: email,
        customerName: cleanText(profile.company) || cleanText(profile.name),
      },
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Mollie mandate payment creation failed", {
      status: response.status,
      title: data.title,
      detail: data.detail,
    });
    const error = new Error(data.detail || data.title || "Mollie machtigingsbetaling kon niet worden aangemaakt.");
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
    console.error("Mollie mandate lookup failed", {
      status: response.status,
      title: data.title,
      detail: data.detail,
    });
    const error = new Error(data.detail || data.title || "Mollie mandates konden niet worden opgehaald.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  const mandates = Array.isArray(data._embedded?.mandates) ? data._embedded.mandates : [];
  return mandates.find((mandate) => cleanText(mandate.status).toLowerCase() === "valid") || null;
}

async function syncMollieSubscription(config, subscription) {
  const mollieCustomerId = cleanText(subscription.mollie_customer_id);
  const mollieSubscriptionId = cleanText(subscription.mollie_subscription_id);
  if (!mollieCustomerId) {
    const error = new Error("Abonnement heeft nog geen Mollie customer.");
    error.statusCode = 400;
    throw error;
  }

  const mandate = await findValidMandate(config.mollieApiKey, mollieCustomerId).catch((error) => {
    console.error("Mollie mandate sync skipped", { message: error.message });
    return null;
  });

  if (!mollieSubscriptionId) {
    if (!mandate) {
      return patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
        mandate_status: cleanText(subscription.mandate_status || "pending"),
        subscription_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return createAndStoreSubscription(config, subscription, mandate, "manual_subscription_created");
  }

  const mollieSubscription = await fetchMollieSubscription(config.mollieApiKey, mollieCustomerId, mollieSubscriptionId);
  return patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, subscriptionPatchFromMollie(mollieSubscription, mandate, {
    webhook_last_event: "manual_subscription_sync",
  }));
}

async function createAndStoreSubscription(config, subscription, mandate, eventName) {
  const mollieCustomerId = cleanText(subscription.mollie_customer_id);
  const mollieSubscription = await createMollieSubscription(config.mollieApiKey, mollieCustomerId, {
    ...subscription,
    mollie_mandate_id: cleanText(subscription.mollie_mandate_id || mandate?.id),
  });
  if (!mollieSubscription?.id) {
    console.error("Mollie subscription missing expected id", { subscriptionId: subscription.id });
    const error = new Error("Mollie gaf geen geldig subscription ID terug.");
    error.statusCode = 502;
    throw error;
  }

  return patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, subscriptionPatchFromMollie(mollieSubscription, mandate, {
    mollie_customer_id: mollieCustomerId,
    mollie_subscription_id: mollieSubscription.id,
    mandate_checkout_url: null,
    webhook_last_event: eventName,
  }));
}

async function createMollieSubscription(mollieApiKey, mollieCustomerId, subscription) {
  const payload = {
    amount: {
      currency: "EUR",
      value: subscriptionAmountForCycle(subscription).toFixed(2),
    },
    interval: billingInterval(subscription.billing_cycle),
    description: subscriptionDescription(subscription),
    metadata: {
      source: "max_web_studio_admin_crm",
      subscriptionId: cleanText(subscription.id),
      profileId: cleanText(subscription.profile_id),
      packageName: cleanText(subscription.package_name),
    },
  };

  const startDate = cleanText(subscription.start_date);
  if (startDate && new Date(startDate).getTime() > Date.now()) payload.startDate = startDate;

  const mandateId = cleanText(subscription.mollie_mandate_id);
  if (mandateId) payload.mandateId = mandateId;

  const response = await fetch(`https://api.mollie.com/v2/customers/${encodeURIComponent(mollieCustomerId)}/subscriptions`, {
    method: "POST",
    headers: mollieHeaders(mollieApiKey),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Mollie subscription creation failed", {
      status: response.status,
      title: data.title,
      detail: data.detail,
    });
    const error = new Error(data.detail || data.title || "Mollie subscription kon niet worden aangemaakt.");
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
    console.error("Mollie subscription fetch failed", {
      status: response.status,
      title: data.title,
      detail: data.detail,
    });
    const error = new Error(data.detail || data.title || "Mollie subscription kon niet worden opgehaald.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  return data;
}

function subscriptionPatchFromMollie(mollieSubscription, mandate, extra = {}) {
  const status = cleanText(mollieSubscription.status || "pending");
  return {
    ...extra,
    mollie_subscription_id: cleanText(mollieSubscription.id || extra.mollie_subscription_id) || null,
    mollie_subscription_status: status,
    mollie_mandate_id: cleanText(mollieSubscription.mandateId || mandate?.id) || null,
    mandate_status: cleanText(mandate?.status || (mollieSubscription.mandateId ? "valid" : "")) || null,
    mandate_reference: cleanText(mandate?.method || mandate?.reference) || null,
    next_payment_at: cleanText(mollieSubscription.nextPaymentDate) || null,
    canceled_at: status === "canceled" ? new Date().toISOString() : null,
    paused_at: status === "suspended" ? new Date().toISOString() : null,
    subscription_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
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
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error("Supabase returned no subscription after update.");
  return saved;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("Admin Mollie subscription received non-JSON Supabase response", { status: response.status });
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }
  if (!response.ok) {
    console.error("Admin Mollie subscription Supabase error", { status: response.status, message: data?.message || data?.error || "Unknown Supabase error" });
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function normalizeSubscription(row) {
  return {
    id: cleanText(row.id),
    profileId: cleanText(row.profile_id),
    packageName: cleanText(row.package_name),
    billingCycle: cleanText(row.billing_cycle),
    monthlyAmount: Number(row.monthly_amount) || 0,
    status: cleanText(row.status),
    mollieCustomerId: cleanText(row.mollie_customer_id),
    mollieSubscriptionId: cleanText(row.mollie_subscription_id),
    mollieSubscriptionStatus: cleanText(row.mollie_subscription_status),
    mollieMandateId: cleanText(row.mollie_mandate_id),
    lastPaymentAt: cleanText(row.last_payment_at),
    nextPaymentAt: cleanText(row.next_payment_at),
    mandateStatus: cleanText(row.mandate_status),
    mandateReference: cleanText(row.mandate_reference),
    mandateCheckoutUrl: cleanText(row.mandate_checkout_url),
    mandatePaymentId: cleanText(row.mandate_payment_id),
    mandatePaymentStatus: cleanText(row.mandate_payment_status),
    subscriptionSyncedAt: cleanText(row.subscription_synced_at),
    webhookLastEvent: cleanText(row.webhook_last_event),
    webhookLastReceivedAt: cleanText(row.webhook_last_received_at),
  };
}

function subscriptionAmountForCycle(subscription) {
  const amount = Number(subscription.monthly_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error("Abonnementsbedrag moet groter zijn dan 0.");
    error.statusCode = 400;
    throw error;
  }
  const cycle = cleanText(subscription.billing_cycle || "monthly").toLowerCase();
  if (cycle === "quarterly") return amount * 3;
  if (cycle === "yearly") return amount * 12;
  return amount;
}

function billingInterval(value) {
  const cycle = cleanText(value || "monthly").toLowerCase();
  if (cycle === "quarterly") return "3 months";
  if (cycle === "yearly") return "12 months";
  return "1 month";
}

function subscriptionDescription(subscription) {
  const packageName = cleanText(subscription.package_name) || "Onderhoud";
  return `Max Web Studio ${packageName} onderhoud`.slice(0, 255);
}

function validateUuid(id, message) {
  const cleanId = cleanText(id);
  if (!uuidPattern.test(cleanId)) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return cleanId;
}

function mollieHeaders(mollieApiKey) {
  return {
    Authorization: `Bearer ${mollieApiKey}`,
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

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanText(value) {
  return String(value || "").trim();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
