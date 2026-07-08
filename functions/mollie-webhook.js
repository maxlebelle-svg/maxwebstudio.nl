const { getMollieApiKey } = require("./mollie-products");
const { sendEmail } = require("./email");
const { getCompanySettings, getMailtoLink } = require("./company-settings");

const knownStatuses = new Set([
  "paid",
  "open",
  "pending",
  "failed",
  "canceled",
  "expired",
  "refunded",
  "charged_back",
]);
const retryPaymentStatuses = new Set(["failed", "expired", "canceled", "charged_back"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return textResponse(405, "Method not allowed");
  }

  const paymentId = getPaymentId(event);

  if (!paymentId) {
    console.warn("Mollie webhook without payment id");
    return textResponse(400, "Missing payment id");
  }

  const mollieConfig = readMollieWebhookConfig();

  if (!mollieConfig.success) {
    console.error("Mollie webhook payment configuration blocked", {
      reason: mollieConfig.reason,
      mollieMode: mollieConfig.mollieMode,
      testMode: mollieConfig.testMode,
    });
    return textResponse(200, "Webhook received");
  }

  try {
    const mollieResponse = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        Authorization: `Bearer ${mollieConfig.apiKey}`,
      },
    });

    const payment = await mollieResponse.json();

    if (!mollieResponse.ok) {
      console.error("Mollie webhook fetch failed", {
        paymentId,
        status: mollieResponse.status,
        title: payment.title,
      });

      return textResponse(200, "Webhook received");
    }

    const status = payment.status;
    const safeStatus = knownStatuses.has(status) ? status : "unknown";

    console.log("Mollie payment status", {
      paymentId: payment.id,
      status: safeStatus,
      websitePackage: payment.metadata?.websitePackage,
      websitePackageName: payment.metadata?.websitePackageName,
      carePackage: payment.metadata?.carePackage,
      carePackageName: payment.metadata?.carePackageName,
      customerEmail: payment.metadata?.customerEmail,
      depositAmountInclVat: payment.metadata?.depositAmountInclVat,
    });

    if (status === "paid") {
      console.log("Max Webstudio payment received", {
        paymentId: payment.id,
        metadata: payment.metadata || {},
      });
    }

    if (isSubscriptionPayment(payment)) {
      await updateSubscriptionPaymentIfPresent(payment, mollieConfig.apiKey);
    } else {
      await updateInvoicePaymentIfPresent(payment);
    }

    return textResponse(200, "Webhook processed");
  } catch (error) {
    console.error("Mollie webhook error", {
      paymentId,
      message: error.message,
    });

    return textResponse(200, "Webhook received");
  }
};

function readMollieWebhookConfig() {
  const mollieMode = cleanText(process.env.MOLLIE_MODE || "test").toLowerCase();
  const configuredTestKey = process.env.MOLLIE_TEST_API_KEY;
  const configuredDefaultKey = process.env.MOLLIE_API_KEY || getMollieApiKey();
  const apiKey = mollieMode === "test" ? (configuredTestKey || configuredDefaultKey) : configuredDefaultKey;
  const testMode = isMollieTestMode(apiKey);
  const livePaymentsAllowed = cleanText(process.env.MOLLIE_ALLOW_LIVE_PAYMENTS).toLowerCase() === "true";

  if (!apiKey) {
    return { success: false, reason: "missing_key", mollieMode, testMode };
  }

  if ((mollieMode !== "test" || !testMode) && !livePaymentsAllowed) {
    return { success: false, reason: "test_mode_required", mollieMode, testMode };
  }

  return { success: true, apiKey, mollieMode, testMode };
}

function isMollieTestMode(apiKey) {
  return cleanText(apiKey).startsWith("test_");
}

function isSubscriptionPayment(payment) {
  return Boolean(
    cleanText(payment.subscriptionId)
    || cleanText(payment.metadata?.subscriptionId)
    || cleanText(payment.metadata?.source) === "admin_crm_subscription_mandate"
  );
}

async function updateInvoicePaymentIfPresent(payment) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("Mollie webhook invoice update skipped: missing Supabase configuration", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return;
  }

  const invoice = await fetchInvoiceByPaymentId(supabaseUrl, serviceRoleKey, payment.id);
  if (!invoice) {
    console.warn("Mollie webhook invoice not found for payment id", { paymentId: payment.id });
    return;
  }

  const mappedStatus = mapMollieStatusToInvoiceStatus(payment.status);
  const patch = {
    mollie_payment_status: payment.status || "unknown",
    status: mappedStatus,
    paid_at: payment.status === "paid" ? new Date().toISOString() : invoice.paid_at || null,
    updated_at: new Date().toISOString(),
  };

  await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, patch);
  console.log("Invoice payment status updated", {
    paymentId: payment.id,
    invoiceId: invoice.id,
    mollieStatus: payment.status,
    invoiceStatus: mappedStatus,
  });

  if (payment.status === "paid" && !invoice.paid_email_sent_at) {
    await sendPaidConfirmationEmail(supabaseUrl, serviceRoleKey, invoice);
  }
}

async function updateSubscriptionPaymentIfPresent(payment, mollieApiKey) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("Mollie webhook subscription update skipped: missing Supabase configuration", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return;
  }

  const metadata = payment.metadata || {};
  const metadataSubscriptionId = cleanText(metadata.subscriptionId);
  const mollieSubscriptionId = cleanText(payment.subscriptionId);
  const customerId = cleanText(payment.customerId);
  let subscription = null;

  if (metadataSubscriptionId) {
    subscription = await fetchCustomerSubscriptionById(supabaseUrl, serviceRoleKey, metadataSubscriptionId);
  }
  if (!subscription && payment.id) {
    subscription = await fetchCustomerSubscriptionByMandatePaymentId(supabaseUrl, serviceRoleKey, payment.id);
  }
  if (!subscription && mollieSubscriptionId) {
    subscription = await fetchCustomerSubscriptionByMollieSubscriptionId(supabaseUrl, serviceRoleKey, mollieSubscriptionId);
  }

  if (!subscription) return;

  const now = new Date().toISOString();
  const isMandatePayment = cleanText(metadata.source) === "admin_crm_subscription_mandate" || cleanText(subscription.mandate_payment_id) === cleanText(payment.id);
  const paymentStatus = cleanText(payment.status || "unknown");
  const basePatch = {
    mandate_payment_status: isMandatePayment ? paymentStatus : cleanText(subscription.mandate_payment_status) || null,
    webhook_last_event: isMandatePayment ? `mandate_payment_${paymentStatus}` : `subscription_payment_${paymentStatus}`,
    webhook_last_received_at: now,
    updated_at: now,
  };

  if (paymentStatus === "paid") {
    basePatch.last_payment_at = cleanText(payment.paidAt) || now;
    basePatch.retry_status = "resolved";
    basePatch.subscription_risk_level = "normal";
    basePatch.retry_next_action_at = null;
    basePatch.subscription_last_error = null;
  }

  let mandate = null;
  const mollieCustomerId = customerId || cleanText(subscription.mollie_customer_id);
  if (mollieCustomerId) {
    mandate = await findValidMandate(mollieApiKey, mollieCustomerId).catch((error) => {
      console.error("Mollie webhook mandate lookup skipped", { message: error.message });
      return null;
    });
  }

  if (mandate) {
    basePatch.mollie_customer_id = mollieCustomerId;
    basePatch.mollie_mandate_id = cleanText(mandate.id);
    basePatch.mandate_status = cleanText(mandate.status);
    basePatch.mandate_reference = cleanText(mandate.method || mandate.reference);
  }

  if (isMandatePayment && paymentStatus === "paid" && mandate && !cleanText(subscription.mollie_subscription_id)) {
    const updatedWithMandate = await patchCustomerSubscription(supabaseUrl, serviceRoleKey, subscription.id, {
      ...basePatch,
      mandate_checkout_url: null,
    });
    const createdSubscription = await createMollieSubscription(mollieApiKey, mollieCustomerId, {
      ...subscription,
      ...updatedWithMandate,
      mollie_mandate_id: cleanText(mandate.id),
    });
    await patchCustomerSubscription(supabaseUrl, serviceRoleKey, subscription.id, subscriptionPatchFromMollie(createdSubscription, mandate, {
      mollie_customer_id: mollieCustomerId,
      webhook_last_event: "subscription_created_after_mandate",
      webhook_last_received_at: now,
      mandate_checkout_url: null,
      mandate_payment_status: paymentStatus,
      last_payment_at: cleanText(payment.paidAt) || now,
    }));
    console.log("Mollie subscription created after mandate payment", {
      subscriptionId: subscription.id,
      mollieSubscriptionId: createdSubscription.id,
    });
    return;
  }

  if (cleanText(subscription.mollie_subscription_id) && mollieCustomerId) {
    const mollieSubscription = await fetchMollieSubscription(mollieApiKey, mollieCustomerId, cleanText(subscription.mollie_subscription_id)).catch((error) => {
      console.error("Mollie webhook subscription fetch skipped", { message: error.message });
      return null;
    });
    if (mollieSubscription) {
      const patch = {
        ...basePatch,
        ...subscriptionPatchFromMollie(mollieSubscription, mandate, {
          webhook_last_event: basePatch.webhook_last_event,
          webhook_last_received_at: now,
          last_payment_at: paymentStatus === "paid" ? cleanText(payment.paidAt) || now : cleanText(subscription.last_payment_at) || null,
        }),
      };
      if (retryPaymentStatuses.has(paymentStatus)) {
        Object.assign(patch, retryPatchFromPayment(subscription, payment, paymentStatus, now));
      }
      const updatedSubscription = await patchCustomerSubscription(supabaseUrl, serviceRoleKey, subscription.id, patch);
      if (retryPaymentStatuses.has(paymentStatus)) {
        await sendSubscriptionRetryEmailIfNeeded(supabaseUrl, serviceRoleKey, updatedSubscription || { ...subscription, ...patch });
      }
      return;
    }
  }

  if (retryPaymentStatuses.has(paymentStatus)) {
    Object.assign(basePatch, retryPatchFromPayment(subscription, payment, paymentStatus, now));
  }
  const updatedSubscription = await patchCustomerSubscription(supabaseUrl, serviceRoleKey, subscription.id, basePatch);
  if (retryPaymentStatuses.has(paymentStatus)) {
    await sendSubscriptionRetryEmailIfNeeded(supabaseUrl, serviceRoleKey, updatedSubscription || { ...subscription, ...basePatch });
  }
}

async function fetchCustomerSubscriptionById(supabaseUrl, serviceRoleKey, id) {
  if (!id) return null;
  return fetchSingleCustomerSubscription(supabaseUrl, serviceRoleKey, `id=eq.${encodeURIComponent(id)}`);
}

async function fetchCustomerSubscriptionByMandatePaymentId(supabaseUrl, serviceRoleKey, paymentId) {
  if (!paymentId) return null;
  return fetchSingleCustomerSubscription(supabaseUrl, serviceRoleKey, `mandate_payment_id=eq.${encodeURIComponent(paymentId)}`);
}

async function fetchCustomerSubscriptionByMollieSubscriptionId(supabaseUrl, serviceRoleKey, mollieSubscriptionId) {
  if (!mollieSubscriptionId) return null;
  return fetchSingleCustomerSubscription(supabaseUrl, serviceRoleKey, `mollie_subscription_id=eq.${encodeURIComponent(mollieSubscriptionId)}`);
}

async function fetchSingleCustomerSubscription(supabaseUrl, serviceRoleKey, filter) {
  const fullFields = [
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
    "retry_status",
    "retry_next_action_at",
    "retry_last_email_sent_at",
    "retry_last_admin_note",
    "subscription_risk_level",
    "subscription_last_error",
    "last_failed_payment_at",
    "last_failed_payment_id",
    "failed_payment_count",
  ].join(",");
  const baseFields = [
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
  ].join(",");
  const result = await fetchSingleCustomerSubscriptionWithFields(supabaseUrl, serviceRoleKey, filter, fullFields);
  if (result !== false) return result;
  return fetchSingleCustomerSubscriptionWithFields(supabaseUrl, serviceRoleKey, filter, baseFields);
}

async function fetchSingleCustomerSubscriptionWithFields(supabaseUrl, serviceRoleKey, filter, fields) {
  const response = await fetch(`${supabaseUrl}/rest/v1/customer_subscriptions?select=${fields}&${filter}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    console.error("Mollie webhook subscription lookup failed", {
      filter,
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    if (isSchemaColumnError(data)) return false;
    return null;
  }

  return Array.isArray(data) ? data[0] : data;
}

async function patchCustomerSubscription(supabaseUrl, serviceRoleKey, subscriptionId, patch) {
  const response = await fetch(`${supabaseUrl}/rest/v1/customer_subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Mollie webhook subscription update failed", {
      subscriptionId,
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    return null;
  }

  return Array.isArray(data) ? data[0] : data;
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

async function createMollieSubscription(mollieApiKey, mollieCustomerId, subscription) {
  const response = await fetch(`https://api.mollie.com/v2/customers/${encodeURIComponent(mollieCustomerId)}/subscriptions`, {
    method: "POST",
    headers: mollieHeaders(mollieApiKey),
    body: JSON.stringify({
      amount: {
        currency: "EUR",
        value: subscriptionAmountForCycle(subscription).toFixed(2),
      },
      interval: billingInterval(subscription.billing_cycle),
      description: subscriptionDescription(subscription),
      mandateId: cleanText(subscription.mollie_mandate_id) || undefined,
      metadata: {
        source: "max_web_studio_admin_crm",
        subscriptionId: cleanText(subscription.id),
        profileId: cleanText(subscription.profile_id),
        packageName: cleanText(subscription.package_name),
      },
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
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
    const error = new Error(data.detail || data.title || "Mollie subscription kon niet worden opgehaald.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  return data;
}

function subscriptionPatchFromMollie(mollieSubscription, mandate, extra = {}) {
  const status = cleanText(mollieSubscription.status || "pending");
  const patch = {
    ...extra,
    mollie_subscription_id: cleanText(mollieSubscription.id || extra.mollie_subscription_id) || null,
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

function retryPatchFromPayment(subscription, payment, paymentStatus, now) {
  const previousCount = Number(subscription.failed_payment_count || 0);
  const failedPaymentCount = previousCount + 1;
  const retryStatus = failedPaymentCount >= 3 || paymentStatus === "charged_back"
    ? "action_required"
    : failedPaymentCount === 1 ? "payment_failed" : "retry_needed";
  return {
    last_failed_payment_at: cleanText(payment.failedAt || payment.canceledAt || payment.expiredAt) || now,
    last_failed_payment_id: cleanText(payment.id),
    failed_payment_count: failedPaymentCount,
    retry_status: retryStatus,
    retry_next_action_at: retryNextActionDate(failedPaymentCount),
    subscription_risk_level: riskLevelForCount(failedPaymentCount),
    subscription_last_error: `Mollie betaling ${paymentStatus}.`,
  };
}

function retryNextActionDate(failedPaymentCount) {
  const date = new Date();
  date.setDate(date.getDate() + (failedPaymentCount >= 3 ? 1 : 3));
  return date.toISOString();
}

function riskLevelForCount(count) {
  if (count >= 3) return "high";
  if (count >= 1) return "attention";
  return "normal";
}

async function fetchInvoiceByPaymentId(supabaseUrl, serviceRoleKey, paymentId) {
  const invoice = await fetchInvoiceByPaymentIdWithFields(
    supabaseUrl,
    serviceRoleKey,
    paymentId,
    "id,profile_id,invoice_number,title,amount,status,paid_at,pdf_file_path,paid_email_sent_at,email_last_error"
  );
  if (invoice !== false) return invoice;

  return fetchInvoiceByPaymentIdWithFields(
    supabaseUrl,
    serviceRoleKey,
    paymentId,
    "id,profile_id,invoice_number,title,amount,status,paid_at,pdf_file_path"
  );
}

async function fetchInvoiceByPaymentIdWithFields(supabaseUrl, serviceRoleKey, paymentId, fields) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/customer_invoices?select=${fields}&mollie_payment_id=eq.${encodeURIComponent(paymentId)}&limit=1`,
    {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    }
  );
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    console.error("Mollie webhook invoice lookup failed", {
      paymentId,
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    if (isSchemaColumnError(data)) return false;
    return null;
  }

  return Array.isArray(data) ? data[0] : data;
}

async function sendPaidConfirmationEmail(supabaseUrl, serviceRoleKey, invoice) {
  try {
    const profile = await fetchInvoiceProfile(supabaseUrl, serviceRoleKey, invoice.profile_id);
    const customerEmail = cleanEmail(profile?.email);

    if (!customerEmail) {
      console.warn("Mollie webhook paid email skipped: missing customer email", { invoiceId: invoice.id });
      await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, { email_last_error: "Geen klant e-mailadres gevonden." });
      return;
    }

    const message = buildPaidConfirmationEmail(invoice, profile);
    const result = await sendEmail({
      to: customerEmail,
      bcc: cleanEmail(process.env.ADMIN_EMAIL) || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (!result.sent) {
      console.warn("Mollie webhook paid email skipped", { invoiceId: invoice.id, warning: result.warning || "Unknown email warning" });
      await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, { email_last_error: result.warning || "Betaalbevestiging kon niet worden verzonden." });
      return;
    }

    await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, {
      paid_email_sent_at: new Date().toISOString(),
      email_last_error: null,
    });
    console.log("Mollie webhook paid email sent", { invoiceId: invoice.id });
  } catch (error) {
    console.error("Mollie webhook paid email failed", {
      invoiceId: invoice.id,
      message: error.message,
    });
  }
}

async function sendSubscriptionRetryEmailIfNeeded(supabaseUrl, serviceRoleKey, subscription) {
  try {
    if (!subscription || subscription.retry_last_email_sent_at) return;
    const profile = await fetchInvoiceProfile(supabaseUrl, serviceRoleKey, subscription.profile_id);
    const customerEmail = cleanEmail(profile?.email);

    if (!customerEmail) {
      console.warn("Mollie webhook subscription retry email skipped: missing customer email", { subscriptionId: subscription.id });
      await patchCustomerSubscription(supabaseUrl, serviceRoleKey, subscription.id, {
        subscription_last_error: "Geen klant e-mailadres gevonden.",
      });
      return;
    }

    const message = buildSubscriptionRetryEmail(subscription, profile);
    const result = await sendEmail({
      to: customerEmail,
      bcc: cleanEmail(process.env.ADMIN_EMAIL) || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (!result.sent) {
      console.warn("Mollie webhook subscription retry email skipped", {
        subscriptionId: subscription.id,
        warning: result.warning || "Unknown email warning",
      });
      await patchCustomerSubscription(supabaseUrl, serviceRoleKey, subscription.id, {
        subscription_last_error: result.warning || "Retry-mail kon niet worden verzonden.",
      });
      return;
    }

    await patchCustomerSubscription(supabaseUrl, serviceRoleKey, subscription.id, {
      retry_last_email_sent_at: new Date().toISOString(),
      subscription_last_error: null,
    });
    console.log("Mollie webhook subscription retry email sent", { subscriptionId: subscription.id });
  } catch (error) {
    console.error("Mollie webhook subscription retry email failed", {
      subscriptionId: subscription?.id,
      message: error.message,
    });
  }
}

async function fetchInvoiceProfile(supabaseUrl, serviceRoleKey, profileId) {
  if (!profileId) return null;
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,name,company,email&id=eq.${encodeURIComponent(profileId)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    console.error("Mollie webhook profile lookup failed", {
      profileId,
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    return null;
  }

  return Array.isArray(data) ? data[0] : data;
}

function buildPaidConfirmationEmail(invoice, profile) {
  const companySettings = getCompanySettings();
  const customerName = cleanText(profile?.name) || cleanText(profile?.company) || "beste klant";
  const invoiceNumber = cleanText(invoice.invoice_number) || "je factuur";
  const title = cleanText(invoice.title) || "Factuur";
  const portalUrl = absoluteUrl("/client-dashboard.html");
  const text = [
    `Hallo ${customerName},`,
    "",
    `Bedankt, we hebben de betaling voor factuur ${invoiceNumber} ontvangen.`,
    `Factuur: ${title}.`,
    `Bedrag: ${formatMoney(invoice.amount)}.`,
    cleanText(invoice.pdf_file_path) ? `De factuur-PDF blijft veilig beschikbaar in je klantportaal: ${portalUrl}` : "",
    "",
    `Vragen? Mail naar ${companySettings.primaryEmail} of gebruik ${getMailtoLink(companySettings, `Vraag over factuur ${invoiceNumber}`)}.`,
    "",
    "Met vriendelijke groet,",
    companySettings.companyName,
  ].filter(Boolean).join("\n");

  return {
    subject: `Betaling ontvangen voor factuur ${invoiceNumber}`,
    text,
    html: renderEmailHtml("Betaling ontvangen", text, portalUrl),
  };
}

function buildSubscriptionRetryEmail(subscription, profile) {
  const companySettings = getCompanySettings();
  const customerName = cleanText(profile?.name) || cleanText(profile?.company) || "beste klant";
  const packageName = cleanText(subscription.package_name) || "onderhoudsabonnement";
  const portalUrl = absoluteUrl("/client-dashboard.html");
  const mandateUrl = cleanText(subscription.mandate_checkout_url);
  const text = [
    `Hallo ${customerName},`,
    "",
    `We konden je maandelijkse betaling voor ${packageName} niet verwerken.`,
    "Dat kan gebeuren. Controleer alsjeblieft je betaalmethode of rond je machtiging opnieuw af.",
    mandateUrl ? `Je kunt de machtiging hier afronden: ${mandateUrl}` : `Je kunt je abonnement bekijken in je klantportaal: ${portalUrl}`,
    "",
    "Als de betaling inmiddels is gelukt, hoef je niets te doen.",
    "",
    `Vragen? Mail naar ${companySettings.primaryEmail}.`,
    "",
    "Met vriendelijke groet,",
    companySettings.companyName,
  ].filter(Boolean).join("\n");

  return {
    subject: "We konden je maandelijkse betaling niet verwerken",
    text,
    html: renderEmailHtml("Actie nodig voor je onderhoudsabonnement", text, mandateUrl || portalUrl),
  };
}

function renderEmailHtml(heading, text, portalUrl) {
  const companySettings = getCompanySettings();
  const paragraphs = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return `
    <div style="margin:0;padding:0;background:#07111f;color:#eaf1ff;font-family:Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
        <div style="border:1px solid rgba(255,255,255,0.12);border-radius:18px;background:#0b1728;padding:28px;">
          <p style="margin:0 0 10px;color:#7db7ff;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(companySettings.companyName)}</p>
          <h1 style="margin:0 0 20px;color:#ffffff;font-size:28px;line-height:1.2;">${escapeHtml(heading)}</h1>
          ${paragraphs.map((line) => `<p style="margin:0 0 14px;color:#d7e3f7;font-size:15px;line-height:1.7;">${linkify(escapeHtml(line))}</p>`).join("")}
          <p style="margin:24px 0 0;">
            <a href="${escapeAttribute(portalUrl)}" style="display:inline-block;background:#2f8cff;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700;">Open klantportaal</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

async function patchInvoice(supabaseUrl, serviceRoleKey, invoiceId, patch) {
  const response = await fetch(`${supabaseUrl}/rest/v1/customer_invoices?id=eq.${encodeURIComponent(invoiceId)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Mollie webhook invoice update failed", {
      invoiceId,
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
  }
}

function mapMollieStatusToInvoiceStatus(status) {
  if (status === "paid") return "paid";
  if (status === "canceled") return "canceled";
  if (status === "expired") return "expired";
  if (status === "failed") return "failed";
  return "sent";
}

function getPaymentId(event) {
  const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  const contentType = event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";

  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(body);
      return payload.id || payload.paymentId || "";
    } catch (error) {
      return "";
    }
  }

  const params = new URLSearchParams(body);
  return params.get("id") || "";
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };
}

function mollieHeaders(mollieApiKey) {
  return {
    Authorization: `Bearer ${mollieApiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function isSchemaColumnError(data) {
  const message = `${data?.code || ""} ${data?.message || ""} ${data?.details || ""} ${data?.hint || ""}`.toLowerCase();
  return message.includes("42703") || message.includes("pgrst204") || message.includes("column") || message.includes("schema cache");
}

function absoluteUrl(path) {
  const siteUrl = cleanText(process.env.SITE_URL || getCompanySettings().websiteUrl).replace(/\/$/, "");
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(number);
}

function subscriptionAmountForCycle(subscription) {
  const amount = Number(subscription.monthly_amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
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

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanText(value) {
  return String(value || "").trim();
}

function linkify(value) {
  return value.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${escapeAttribute(url)}" style="color:#7db7ff;">${url}</a>`);
}

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function textResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body,
  };
}
