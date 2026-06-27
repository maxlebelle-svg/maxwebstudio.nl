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
    const subscriptionId = validateUuid(payload.subscription_id || payload.subscriptionId, "Ongeldig abonnement ID.");

    const subscription = await fetchSubscription(config.supabaseUrl, config.serviceRoleKey, subscriptionId);
    if (!subscription) return jsonResponse(404, { success: false, error: "Abonnement niet gevonden." });

    if (cleanText(subscription.mollie_subscription_id)) {
      return jsonResponse(200, {
        success: true,
        reused: true,
        warning: "Dit abonnement heeft al een Mollie subscription.",
        subscription: normalizeSubscription(subscription),
      });
    }

    const profile = await fetchProfile(config.supabaseUrl, config.serviceRoleKey, subscription.profile_id);
    const customerEmail = cleanEmail(profile?.email);
    if (!customerEmail) return jsonResponse(400, { success: false, error: "Klantprofiel heeft geen geldig e-mailadres." });

    const amount = Number(subscription.monthly_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(400, { success: false, error: "Abonnementsbedrag moet groter zijn dan 0." });
    }

    const mollieCustomerId = cleanText(subscription.mollie_customer_id) || await createMollieCustomer(config.mollieApiKey, profile, customerEmail);
    if (!cleanText(subscription.mollie_customer_id)) {
      await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
        mollie_customer_id: mollieCustomerId,
        updated_at: new Date().toISOString(),
      });
    }

    const mollieSubscription = await createMollieSubscription(config.mollieApiKey, mollieCustomerId, subscription);
    if (!mollieSubscription?.id) {
      console.error("Mollie subscription missing expected id", { subscriptionId: subscription.id });
      return jsonResponse(502, { success: false, error: "Mollie gaf geen geldig subscription ID terug." });
    }

    const updatedSubscription = await patchSubscription(config.supabaseUrl, config.serviceRoleKey, subscription.id, {
      mollie_customer_id: mollieCustomerId,
      mollie_subscription_id: mollieSubscription.id,
      mollie_subscription_status: cleanText(mollieSubscription.status || "pending"),
      mollie_mandate_id: cleanText(mollieSubscription.mandateId || subscription.mollie_mandate_id) || null,
      next_payment_at: cleanText(mollieSubscription.nextPaymentDate) || cleanText(subscription.next_invoice_date) || null,
      updated_at: new Date().toISOString(),
    });

    return jsonResponse(200, {
      success: true,
      customerId: mollieCustomerId,
      subscriptionId: mollieSubscription.id,
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
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!mollieApiKey || !supabaseUrl || !serviceRoleKey) {
    console.error("Admin Mollie subscription missing configuration", {
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
