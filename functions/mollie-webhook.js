const { getMollieApiKey } = require("./mollie-products");
const crypto = require("crypto");
const { sendEmail } = require("./email");
const { getCompanySettings } = require("./company-settings");
const { createTimelineEvent } = require("./services/timelineService");
const { createPaymentPaidService } = require("./journey/paymentPaid/service");
const { resolvePaymentPaidContext } = require("./journey/paymentPaid/contextResolver");
const domainRegistrar = require("./services/domainRegistrarService");
const paymentPaidService = createPaymentPaidService();
const { SUBSCRIPTION_FIELDS, canonicalSubscriptionPatch, subscriptionView } = require("./_canonical-finance");

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
    const paymentResult = await fetchMolliePaymentWithFallback(paymentId, mollieConfig);
    const mollieResponse = paymentResult.response;
    const payment = paymentResult.payment;

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
      source: cleanText(payment.metadata?.source).slice(0, 60),
      environment: cleanText(payment.mode || payment.metadata?.environment).slice(0, 12),
    });

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
  const livePaymentsAllowed = cleanText(process.env.MOLLIE_ALLOW_LIVE_PAYMENTS).toLowerCase() === "true";
  const domainLiveEnabled = isEnabled(process.env.DOMAIN_PAYMENT_AUTOMATION_ENABLED) && isEnabled(process.env.DOMAIN_PAYMENT_LIVE_ENABLED);
  const domainLiveApiKey = domainLiveEnabled && cleanText(configuredDefaultKey).startsWith("live_") ? configuredDefaultKey : "";
  const apiKey = livePaymentsAllowed && mollieMode === "live"
    ? configuredDefaultKey
    : (configuredTestKey || (mollieMode === "test" ? configuredDefaultKey : ""));
  const testMode = isMollieTestMode(apiKey);

  if (!apiKey && !domainLiveApiKey) {
    return { success: false, reason: "missing_key", mollieMode, testMode };
  }

  if (apiKey && !testMode && !livePaymentsAllowed && apiKey !== domainLiveApiKey) {
    return { success: false, reason: "test_mode_required", mollieMode, testMode };
  }

  return {
    success: true,
    apiKey: apiKey || domainLiveApiKey,
    alternateApiKeys: [...new Set([configuredTestKey, domainLiveApiKey].filter((key) => key && key !== (apiKey || domainLiveApiKey)))],
    mollieMode,
    testMode,
    livePaymentsAllowed,
  };
}

async function fetchMolliePaymentWithFallback(paymentId, mollieConfig) {
  const keys = [mollieConfig.apiKey, ...(mollieConfig.alternateApiKeys || [])].filter(Boolean);
  let primary = null;
  for (const apiKey of keys) {
    const result = await fetchMolliePayment(paymentId, apiKey);
    if (!primary) primary = result;
    if (result.response.ok) return result;
    if (result.response.status !== 404) return result;
  }
  return primary;
}

async function fetchMolliePayment(paymentId, apiKey) {
  const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const payment = await response.json().catch(() => ({}));
  return { response, payment };
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
  const updatedInvoice = { ...invoice, ...patch };
  await safeCreateTimeline(paymentTimelineEvent(invoice, payment, mappedStatus));
  let commercialResult = null;
  let domainPaymentResult = null;
  if (payment.status === "paid") {
    commercialResult = await finalizeCommercialOrderIfNeeded(supabaseUrl, serviceRoleKey, invoice, payment);
    await finalizeSignedOfferFulfilmentIfNeeded(supabaseUrl, serviceRoleKey, invoice, payment, commercialResult);
    domainPaymentResult = await finalizeDomainOrderPaymentIfNeeded(supabaseUrl, serviceRoleKey, invoice, payment);
  }
  console.log("Invoice payment status updated", {
    paymentId: payment.id,
    invoiceId: invoice.id,
    mollieStatus: payment.status,
    invoiceStatus: mappedStatus,
  });

  if (payment.status === "paid" && !invoice.paid_email_sent_at && !domainPaymentResult?.recognized) {
    await dispatchPaidConfirmation(supabaseUrl, serviceRoleKey, updatedInvoice, payment, commercialResult);
  }
}

async function finalizeSignedOfferFulfilmentIfNeeded(supabaseUrl, serviceRoleKey, invoice = {}, payment = {}, commercialResult = null) {
  const context = parseInvoiceContext(invoice.notes);
  const offerVersionId = cleanText(payment.metadata?.commercialOfferVersionId || context.commercialOfferVersionId);
  if (!uuidPattern(offerVersionId)) return null;
  try {
    const run = await fetchRecord(supabaseUrl, serviceRoleKey, "commercial_offer_fulfilment_runs", "id,status,customer_id,invoice_id,project_id,factory_project_id", `offer_version_id=eq.${encodeURIComponent(offerVersionId)}`);
    if (!run?.id) return null;
    const customerId = commercialResult?.customer?.id || run.customer_id || invoice.customer_id || null;
    const projectId = commercialResult?.project?.id || run.project_id || null;
    if (run.factory_project_id) {
      const factory = await fetchRecord(supabaseUrl, serviceRoleKey, "factory_projects", "id,status,configuration", `id=eq.${encodeURIComponent(run.factory_project_id)}`);
      if (factory?.id) {
        const configuration = {
          ...(factory.configuration || {}),
          commercialOffer: {
            ...((factory.configuration || {}).commercialOffer || {}),
            paymentStatus: "paid",
            molliePaymentId: cleanText(payment.id),
            paidAt: cleanText(payment.paidAt) || new Date().toISOString(),
            productionReleasedAt: new Date().toISOString(),
          },
        };
        await patchRecord(supabaseUrl, serviceRoleKey, "factory_projects", factory.id, { status: ["intake", "ready", "paused"].includes(cleanText(factory.status)) ? "in_production" : factory.status, configuration, updated_at: new Date().toISOString() });
      }
    }
    const result = await callRpc(supabaseUrl, serviceRoleKey, "commercial_finalize_fulfilment_v1", {
      input_run_id: run.id,
      input_status: "ready_for_production",
      input_customer_id: customerId,
      input_invoice_id: invoice.id,
      input_project_id: projectId,
      input_factory_project_id: run.factory_project_id || null,
      input_error_code: null,
    });
    console.log("Signed commercial offer released to production", { offerVersionId, invoiceId: invoice.id, projectId, factoryProjectId: run.factory_project_id || "" });
    return result;
  } catch (error) {
    console.error("Signed commercial offer production release failed", { offerVersionId, invoiceId: invoice.id, message: error.message });
    return null;
  }
}

async function finalizeDomainOrderPaymentIfNeeded(supabaseUrl, serviceRoleKey, invoice = {}, payment = {}) {
  const context = parseInvoiceContext(invoice.notes);
  if (cleanText(context.source) !== "domain_order") return { recognized: false };
  const requestId = cleanText(context.domainRequestId || payment.metadata?.domainRequestId);
  if (!uuidPattern(requestId)) {
    console.error("Domain payment missing valid request id", { invoiceId: invoice.id, paymentId: cleanText(payment.id) });
    return { recognized: true, completed: false };
  }
  try {
    const request = await fetchRecord(supabaseUrl, serviceRoleKey, "domain_requests", "id,customer_id,website_id,domain_name,status,customer_payload,internal_metadata", `id=eq.${encodeURIComponent(requestId)}`);
    if (!request?.id) throw new Error("Domeinopdracht bij betaling niet gevonden.");
    const paidAt = cleanText(payment.paidAt) || new Date().toISOString();
    const internalMetadata = {
      ...(request.internal_metadata || {}),
      payment: {
        ...((request.internal_metadata || {}).payment || {}),
        invoiceId: invoice.id,
        paymentId: cleanText(payment.id),
        status: "paid",
        paidAt,
        updatedAt: new Date().toISOString(),
      },
    };
    const alreadyRecorded = cleanText((request.internal_metadata || {}).payment?.status) === "paid"
      && cleanText((request.internal_metadata || {}).payment?.paymentId) === cleanText(payment.id);
    if (!alreadyRecorded) {
      await patchRecord(supabaseUrl, serviceRoleKey, "domain_requests", request.id, { status: "scheduled", internal_metadata: internalMetadata, updated_at: new Date().toISOString() });
      await insertRecord(supabaseUrl, serviceRoleKey, "domain_request_events", {
        domain_request_id: request.id,
        customer_id: request.customer_id,
        actor_type: "system",
        event_type: "domain_payment_paid",
        safe_metadata: { invoiceId: invoice.id, paymentId: cleanText(payment.id), paidAt },
      });
    }
    const payload = request.customer_payload || {};
    const customerEmail = cleanEmail(payload.email || context.customerEmail);
    const customerName = cleanText(payload.holderName || payload.companyName || context.customerName || "klant");
    const customerMail = buildDomainPaidEmail({ customerName, domainName: request.domain_name });
    const customerResult = customerEmail ? await sendEmail({
      to: customerEmail,
      bcc: cleanEmail(process.env.DOMAIN_ORDER_ADMIN_EMAIL || process.env.ADMIN_EMAIL) || undefined,
      subject: customerMail.subject,
      html: customerMail.html,
      text: customerMail.text,
      templateKey: "domain_payment_received",
      templateName: "Betaling domein ontvangen",
      customerId: request.customer_id,
      invoiceId: invoice.id,
      triggeredBy: "mollie_webhook",
      idempotencyKey: `domain.payment.received:${request.id}:${cleanText(payment.id)}`,
      sensitiveContent: true,
      metadata: { domainName: request.domain_name, domainRequestId: request.id, paymentId: cleanText(payment.id) },
    }).catch((error) => ({ sent: false, warning: error.message })) : { sent: false };
    if (customerResult.sent) await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, { paid_email_sent_at: new Date().toISOString(), email_last_error: null });
    const registrationResult = await attemptAutomaticDomainRegistration(supabaseUrl, serviceRoleKey, { ...request, status: alreadyRecorded ? request.status : "scheduled", internal_metadata: internalMetadata }, invoice, payment);
    const adminEmail = cleanEmail(process.env.DOMAIN_ORDER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "info@maxwebstudio.nl");
    if (adminEmail && !registrationResult.enabled) {
      const link = `${cleanText(process.env.SITE_URL || process.env.URL || "https://maxwebstudio.nl").replace(/\/$/, "")}/admin-domain-center.html?relationshipType=customer&relationshipId=${encodeURIComponent(request.customer_id)}&customerId=${encodeURIComponent(request.customer_id)}`;
      await sendEmail({
        to: adminEmail,
        subject: `Domein betaald: ${request.domain_name}`,
        html: `<p>De betaling voor <strong>${escapeHtml(request.domain_name)}</strong> is door Mollie bevestigd.</p><p>De opdracht staat klaar voor handmatige registratie bij Openprovider.</p><p><a href="${escapeHtml(link)}">Open in Domein Center</a></p>`,
        text: `De betaling voor ${request.domain_name} is door Mollie bevestigd. Registreer het domein nu handmatig bij Openprovider.\n${link}`,
        templateKey: "domain_payment_paid_admin",
        templateName: "Domeinbetaling ontvangen",
        customerId: request.customer_id,
        invoiceId: invoice.id,
        triggeredBy: "mollie_webhook",
        idempotencyKey: `domain.payment.paid.admin:${request.id}:${cleanText(payment.id)}`,
        suppressTimelineEvent: true,
      });
    }
    console.log("Domain payment finalized", { requestId: request.id, invoiceId: invoice.id, paymentId: cleanText(payment.id), customerEmailSent: Boolean(customerResult.sent), registration: registrationResult.status });
    return { recognized: true, completed: true, confirmationSent: Boolean(customerResult.sent), registration: registrationResult };
  } catch (error) {
    console.error("Domain payment finalization failed", { invoiceId: invoice.id, paymentId: cleanText(payment.id), message: error.message });
    return { recognized: true, completed: false };
  }
}

async function attemptAutomaticDomainRegistration(supabaseUrl, serviceRoleKey, request, invoice, payment) {
  const config = domainRegistrar.registrationConfig(process.env, request.domain_name);
  if (!config.enabled) return { enabled: false, status: "manual", warning: config.warning };
  const existingStatus = cleanText(request.internal_metadata?.registration?.status);
  if (["active", "requested"].includes(existingStatus)) return { enabled: true, status: existingStatus, duplicate: true };
  if (["processing", "needs_action"].includes(existingStatus)) return { enabled: true, status: existingStatus, duplicate: true };

  const startedAt = new Date().toISOString();
  const processingMetadata = {
    ...(request.internal_metadata || {}),
    registration: { status: "processing", provider: "openprovider", startedAt, paymentId: cleanText(payment.id), invoiceId: invoice.id },
  };
  const claimed = await claimDomainRegistration(supabaseUrl, serviceRoleKey, request.id, processingMetadata);
  if (!claimed) return { enabled: true, status: "already_claimed", duplicate: true };
  await insertRecord(supabaseUrl, serviceRoleKey, "domain_request_events", {
    domain_request_id: request.id,
    customer_id: request.customer_id,
    actor_type: "system",
    event_type: "domain_registration_started",
    safe_metadata: { provider: "openprovider", startedAt, invoiceId: invoice.id, paymentId: cleanText(payment.id) },
  });

  let providerResult = null;
  try {
    const result = providerResult = await domainRegistrar.registerDomain({
      requestId: request.id,
      domainName: request.domain_name,
      autoRenew: request.customer_payload?.autoRenew !== false,
      holder: request.customer_payload || {},
    });
    if (!result.enabled) throw registrationError("registrar_configuration_incomplete", result.warning || "Automatische registratie is onvolledig geconfigureerd.");
    const completedAt = new Date().toISOString();
    const status = result.active ? "active" : "technical_checks";
    const registrationStatus = result.active ? "active" : "requested";
    const registrationMetadata = {
      ...processingMetadata,
      registration: {
        ...processingMetadata.registration,
        status: registrationStatus,
        domainId: result.domainId,
        customerHandle: result.customerHandle,
        providerStatus: result.providerStatus,
        activationDate: result.activationDate,
        expirationDate: result.expirationDate,
        renewalDate: result.renewalDate,
        completedAt,
      },
    };
    const patch = { status, internal_metadata: registrationMetadata, updated_at: completedAt };
    if (status === "active") patch.completed_at = completedAt;
    await patchRecord(supabaseUrl, serviceRoleKey, "domain_requests", request.id, patch);
    if (status === "active") await upsertDomainFromRegistration(supabaseUrl, serviceRoleKey, request, result, completedAt);
    await insertRecord(supabaseUrl, serviceRoleKey, "domain_request_events", {
      domain_request_id: request.id,
      customer_id: request.customer_id,
      actor_type: "system",
      event_type: "domain_registration_succeeded",
      safe_metadata: { provider: "openprovider", domainId: result.domainId, providerStatus: result.providerStatus, completedAt },
    });
    await sendDomainRegistrationResult(request, invoice, result, true).catch((error) => {
      console.error("Domain registration success notification failed", { requestId: request.id, domainName: request.domain_name, message: error.message });
    });
    return { enabled: true, status: registrationStatus, domainId: result.domainId };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const errorCode = providerResult?.domainId ? "registrar_post_registration_sync_failed" : safeRegistrarErrorCode(error);
    const failedMetadata = {
      ...processingMetadata,
      registration: {
        ...processingMetadata.registration,
        status: "needs_action",
        errorCode,
        failedAt,
        domainId: providerResult?.domainId || null,
        customerHandle: providerResult?.customerHandle || null,
        providerStatus: providerResult?.providerStatus || null,
      },
    };
    await patchRecord(supabaseUrl, serviceRoleKey, "domain_requests", request.id, { status: "needs_action", internal_metadata: failedMetadata, updated_at: failedAt });
    await insertRecord(supabaseUrl, serviceRoleKey, "domain_request_events", {
      domain_request_id: request.id,
      customer_id: request.customer_id,
      actor_type: "system",
      event_type: "domain_registration_needs_action",
      safe_metadata: { provider: "openprovider", errorCode, failedAt },
    });
    await sendDomainRegistrationResult(request, invoice, { errorCode }, false);
    console.error("Automatic domain registration needs action", { requestId: request.id, domainName: request.domain_name, errorCode });
    return { enabled: true, status: "needs_action", errorCode };
  }
}

async function claimDomainRegistration(supabaseUrl, serviceRoleKey, requestId, internalMetadata) {
  const response = await fetch(`${supabaseUrl}/rest/v1/domain_requests?id=eq.${encodeURIComponent(requestId)}&status=in.(scheduled,awaiting_approval)`, {
    method: "PATCH",
    headers: { ...restHeaders(serviceRoleKey), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "in_progress", internal_metadata: internalMetadata, updated_at: new Date().toISOString() }),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data?.message || data?.error || "Domeinregistratie kon niet veilig worden vergrendeld.");
  return Array.isArray(data) ? data[0] || null : data;
}

async function upsertDomainFromRegistration(supabaseUrl, serviceRoleKey, request, result, completedAt) {
  const response = await fetch(`${supabaseUrl}/rest/v1/domains?on_conflict=customer_id,domain_name`, {
    method: "POST",
    headers: { ...restHeaders(serviceRoleKey), "Content-Type": "application/json", "Content-Profile": "public", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
    customer_id: request.customer_id,
    website_id: request.website_id || null,
    source_request_id: request.id,
    domain_name: request.domain_name,
    status: "active",
    legal_owner: cleanText(request.customer_payload?.holderName || request.customer_payload?.companyName),
    auto_renew: request.customer_payload?.autoRenew !== false,
    email_status: "not_configured",
    registrar: "openprovider",
    operational_metadata: { provider: "openprovider", registrarDomainId: result.domainId, providerStatus: result.providerStatus },
    updated_at: completedAt,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || "Domeinasset kon niet worden opgeslagen.");
  }
}

async function sendDomainRegistrationResult(request, invoice, result, succeeded) {
  const adminEmail = cleanEmail(process.env.DOMAIN_ORDER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "info@maxwebstudio.nl");
  const customerEmail = cleanEmail(request.customer_payload?.email);
  const customerName = cleanText(request.customer_payload?.holderName || request.customer_payload?.companyName || "klant");
  const link = `${cleanText(process.env.SITE_URL || process.env.URL || "https://maxwebstudio.nl").replace(/\/$/, "")}/admin-domain-center.html?relationshipType=customer&relationshipId=${encodeURIComponent(request.customer_id)}&customerId=${encodeURIComponent(request.customer_id)}`;
  if (succeeded && customerEmail) {
    const mail = buildDomainRegisteredEmail({ customerName, domainName: request.domain_name, requested: result.requested });
    await sendEmail({
      to: customerEmail,
      bcc: adminEmail || undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      templateKey: "domain_registration_completed",
      templateName: "Domeinregistratie afgerond",
      customerId: request.customer_id,
      invoiceId: invoice.id,
      triggeredBy: "mollie_webhook",
      idempotencyKey: `domain.registration.completed:${request.id}:${result.domainId}`,
      sensitiveContent: true,
      metadata: { domainName: request.domain_name, domainRequestId: request.id, registrarDomainId: result.domainId },
    });
  }
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: succeeded ? `Domein automatisch geregistreerd: ${request.domain_name}` : `Actie nodig bij domeinregistratie: ${request.domain_name}`,
      html: succeeded
        ? `<p><strong>${escapeHtml(request.domain_name)}</strong> is automatisch bij Openprovider verwerkt.</p><p>Status: ${escapeHtml(result.providerStatus)}</p><p><a href="${escapeHtml(link)}">Open in Domein Center</a></p>`
        : `<p>De automatische registratie van <strong>${escapeHtml(request.domain_name)}</strong> is veilig gestopt.</p><p>Controleer de opdracht handmatig in Domein Center. Foutcategorie: ${escapeHtml(result.errorCode)}</p><p><a href="${escapeHtml(link)}">Open in Domein Center</a></p>`,
      text: succeeded
        ? `${request.domain_name} is automatisch bij Openprovider verwerkt. Status: ${result.providerStatus}.\n${link}`
        : `De automatische registratie van ${request.domain_name} is veilig gestopt. Controleer de opdracht handmatig. Foutcategorie: ${result.errorCode}.\n${link}`,
      templateKey: succeeded ? "domain_registration_completed_admin" : "domain_registration_attention_admin",
      templateName: succeeded ? "Domein automatisch geregistreerd" : "Actie nodig bij domeinregistratie",
      customerId: request.customer_id,
      invoiceId: invoice.id,
      triggeredBy: "mollie_webhook",
      idempotencyKey: `domain.registration.${succeeded ? "completed" : "attention"}.admin:${request.id}:${succeeded ? result.domainId : result.errorCode}`,
      suppressTimelineEvent: true,
    });
  }
}

function safeRegistrarErrorCode(error) {
  const code = cleanText(error?.code).toLowerCase();
  return /^registrar_[a-z0-9_]{1,60}$/.test(code) ? code : "registrar_registration_failed";
}

function registrationError(code, message) { const error = new Error(message); error.code = code; return error; }

async function dispatchPaidConfirmation(supabaseUrl, serviceRoleKey, invoice, payment, commercialResult) {
  try {
    const invoiceContext = parseInvoiceContext(invoice.notes);
    const profile = await fetchInvoiceProfile(supabaseUrl, serviceRoleKey, invoice.profile_id);
    const customer = commercialResult?.customer || await resolveInvoiceCustomer(supabaseUrl, serviceRoleKey, invoice, invoiceContext);
    const paymentContext = resolvePaymentPaidContext({ provider: "mollie", providerVerified: true, customerId: customer?.id, payment, invoice, invoiceContext });
    const result = await paymentPaidService.dispatch({ customerId: customer?.id || "", invoiceId: invoice.id, paidAt: payment.paidAt || invoice.paid_at, recipient: profile?.email || "", firstName: profile?.name || profile?.company || "", invoiceLabel: invoice.invoice_number || invoice.title || "uw betaling", paymentContext, legacySend: async () => sendPaidConfirmationEmail(supabaseUrl, serviceRoleKey, invoice) });
    console.log("Payment confirmation ownership resolved", { code: "PAYMENT_CONFIRMATION_OWNER", owner: result.owner, reason: result.reason, durable: result.durable === true, duplicate: result.duplicate === true, paymentEnvironment: paymentContext.environment, paymentType: paymentContext.paymentType });
    return result;
  } catch (error) {
    console.error("Payment confirmation ownership failed", { code: "PAYMENT_CONFIRMATION_OWNERSHIP_FAILED", category: cleanText(error?.code || error?.name || "unknown").slice(0, 80) });
    return { owner: "none", reason: "ownership_ambiguous_no_legacy", durable: false };
  }
}

async function resolveInvoiceCustomer(supabaseUrl, serviceRoleKey, invoice, context) {
  if (invoice.profile_id) {
    const byProfile = await fetchRecord(supabaseUrl, serviceRoleKey, "customers", "id,profile_id,auth_user_id,name,company,email", `profile_id=eq.${encodeURIComponent(invoice.profile_id)}`);
    if (byProfile?.id) return byProfile;
  }
  if (context.customerId) return fetchRecord(supabaseUrl, serviceRoleKey, "customers", "id,profile_id,auth_user_id,name,company,email", `id=eq.${encodeURIComponent(context.customerId)}`);
  return null;
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
  return fetchSingleCustomerSubscription(supabaseUrl, serviceRoleKey, `metadata->financeOperations->>mandate_payment_id=eq.${encodeURIComponent(paymentId)}`);
}

async function fetchCustomerSubscriptionByMollieSubscriptionId(supabaseUrl, serviceRoleKey, mollieSubscriptionId) {
  if (!mollieSubscriptionId) return null;
  return fetchSingleCustomerSubscription(supabaseUrl, serviceRoleKey, `mollie_subscription_id=eq.${encodeURIComponent(mollieSubscriptionId)}`);
}

async function fetchSingleCustomerSubscription(supabaseUrl, serviceRoleKey, filter) {
  return fetchSingleCustomerSubscriptionWithFields(supabaseUrl, serviceRoleKey, filter, SUBSCRIPTION_FIELDS);
}

async function fetchSingleCustomerSubscriptionWithFields(supabaseUrl, serviceRoleKey, filter, fields) {
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?select=${fields}&${filter}&limit=1`, {
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

  const row = Array.isArray(data) ? data[0] : data;
  return row ? subscriptionView(row) : row;
}

async function patchCustomerSubscription(supabaseUrl, serviceRoleKey, subscriptionId, patch) {
  const current = await fetchCustomerSubscriptionById(supabaseUrl, serviceRoleKey, subscriptionId);
  const canonicalPatch = canonicalSubscriptionPatch(patch, current?.metadata || {});
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(canonicalPatch),
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

  const row = Array.isArray(data) ? data[0] : data;
  return row ? subscriptionView(row) : row;
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
        customerId: cleanText(subscription.customer_id),
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
    "id,customer_id,invoice_number,title,total,status,paid_at,pdf_file_path,paid_email_sent_at,email_last_error,notes,mollie_payment_id"
  );
  if (invoice !== false) return invoice;

  return fetchInvoiceByPaymentIdWithFields(
    supabaseUrl,
    serviceRoleKey,
    paymentId,
    "id,customer_id,invoice_number,title,total,status,paid_at,pdf_file_path,notes,mollie_payment_id"
  );
}

async function fetchInvoiceByPaymentIdWithFields(supabaseUrl, serviceRoleKey, paymentId, fields) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/invoices?select=${fields}&mollie_payment_id=eq.${encodeURIComponent(paymentId)}&limit=1`,
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

  if (Array.isArray(data) && data.length > 1) {
    console.error("Mollie webhook invoice lookup ambiguous", { paymentId, matchCount: data.length });
    return null;
  }
  return Array.isArray(data) ? data[0] : data;
}

async function sendPaidConfirmationEmail(supabaseUrl, serviceRoleKey, invoice) {
  try {
    const profile = await fetchCustomerProfile(supabaseUrl, serviceRoleKey, invoice.customer_id);
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
      suppressTimelineEvent: true,
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
    await safeCreateTimeline({
      eventType: "invoice_paid",
      title: "Factuur betaald",
      description: `${invoice.invoice_number || "Factuur"} is betaald via Mollie.`,
      module: "invoice",
      referenceType: "invoice",
      referenceId: invoice.id,
      actorName: "Mollie",
      actorRole: "payment_provider",
      icon: "💰",
      severity: "success",
      metadata: {
        dedupeKey: `mollie_invoice_paid:${invoice.id}:${invoice.mollie_payment_id || invoice.paid_at || ""}`,
        customerId: invoice.customer_id || "",
        paymentId: invoice.mollie_payment_id || "",
      },
    });
    console.log("Mollie webhook paid email sent", { invoiceId: invoice.id });
  } catch (error) {
    console.error("Mollie webhook paid email failed", {
      invoiceId: invoice.id,
      message: error.message,
    });
  }
}

async function safeCreateTimeline(input) {
  try {
    return await createTimelineEvent(input);
  } catch (error) {
    console.error("Mollie timeline event failed", { message: error.message });
    return null;
  }
}

function paymentTimelineEvent(invoice = {}, payment = {}, invoiceStatus = "") {
  const status = cleanText(payment.status || invoiceStatus || "unknown").toLowerCase();
  const statusMap = {
    open: { eventType: "payment_created", title: "Betaling aangemaakt", severity: "info" },
    pending: { eventType: "payment_created", title: "Betaling in behandeling", severity: "info" },
    paid: { eventType: "payment_paid", title: "Betaling ontvangen", severity: "success" },
    canceled: { eventType: "payment_cancelled", title: "Betaling geannuleerd", severity: "warning" },
    cancelled: { eventType: "payment_cancelled", title: "Betaling geannuleerd", severity: "warning" },
    expired: { eventType: "payment_failed", title: "Betaling verlopen", severity: "warning" },
    failed: { eventType: "payment_failed", title: "Betaling mislukt", severity: "error" },
    refunded: { eventType: "payment_refunded", title: "Betaling terugbetaald", severity: "warning" },
    charged_back: { eventType: "payment_refunded", title: "Betaling teruggeboekt", severity: "error" },
  };
  const config = statusMap[status] || { eventType: "payment_created", title: "Betaling bijgewerkt", severity: "info" };
  return {
    eventType: config.eventType,
    title: config.title,
    description: `${cleanText(invoice.invoice_number || invoice.title) || "Factuur"}: betalingsstatus ${status || "onbekend"}.`,
    module: "billing",
    referenceType: "invoice",
    referenceId: invoice.id,
    invoiceId: invoice.id,
    actorName: "Mollie",
    actorRole: "payment_provider",
    icon: status === "paid" ? "€" : "!",
    severity: config.severity,
    metadata: {
      dedupeKey: `mollie_payment:${config.eventType}:${invoice.id}:${cleanText(payment.id)}:${status}`,
      customerId: invoice.customer_id || "",
      paymentId: cleanText(payment.id),
      mollieStatus: status,
      invoiceStatus: cleanText(invoiceStatus),
    },
  };
}

async function sendSubscriptionRetryEmailIfNeeded(supabaseUrl, serviceRoleKey, subscription) {
  try {
    if (!subscription || subscription.retry_last_email_sent_at) return;
    const profile = await fetchCustomerProfile(supabaseUrl, serviceRoleKey, subscription.customer_id);
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

async function finalizeCommercialOrderIfNeeded(supabaseUrl, serviceRoleKey, invoice = {}, payment = {}) {
  const context = parseInvoiceContext(invoice.notes);
  if (cleanText(context.source) !== "commercial_order") return null;

  try {
    const profile = await ensurePaidCommercialProfile(supabaseUrl, serviceRoleKey, invoice, context);
    const customer = await ensurePaidCommercialCustomer(supabaseUrl, serviceRoleKey, profile, context);
    const website = await ensurePaidCommercialWebsite(supabaseUrl, serviceRoleKey, customer, profile, context);
    const project = await ensurePaidCommercialProject(supabaseUrl, serviceRoleKey, customer, website, context);
    await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, {
      customer_id: customer.id,
      notes: mergeInvoiceContext(invoice.notes, {
        ...context,
        customerId: customer.id,
        websiteId: website.id,
        projectId: project.id,
        portalStatus: "invited",
        commercialOrderCompletedAt: new Date().toISOString(),
      }),
    });
    await safeCreateTimeline({
      eventType: "customer_portal_action",
      title: "Klantportaal geactiveerd",
      description: `${context.customerCompany || context.customerName || "Klant"} is klaargezet na betaling.`,
      module: "customer_portal",
      referenceType: "customer",
      referenceId: customer.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      actorName: "Max CRM",
      actorRole: "automation",
      icon: "✓",
      severity: "success",
      metadata: {
        dedupeKey: `commercial_order_portal:${invoice.id}`,
        orderId: context.orderId || "",
        projectId: project.id,
      },
    });
    await safeCreateTimeline({
      eventType: "project_updated",
      title: "Project automatisch gestart",
      description: `${project.name || "Project"} staat in onboarding.`,
      module: "projects",
      referenceType: "project",
      referenceId: project.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      actorName: "Max Automations",
      actorRole: "automation",
      icon: "→",
      severity: "success",
      metadata: {
        dedupeKey: `commercial_order_project:${invoice.id}:${project.id}`,
        orderId: context.orderId || "",
        paymentId: cleanText(payment.id),
      },
    });
    await sendCommercialWelcomeEmail(supabaseUrl, serviceRoleKey, profile, customer, project, context);
    return { profile, customer, website, project };
  } catch (error) {
    console.error("Commercial order finalization failed", { invoiceId: invoice.id, message: error.message, status: error.status || 0 });
    await safeCreateTimeline({
      eventType: "automation_failed",
      title: "Nieuwe opdracht vraagt aandacht",
      description: "Betaling is ontvangen, maar automatische projectstart kon niet volledig worden afgerond.",
      module: "automation",
      referenceType: "invoice",
      referenceId: invoice.id,
      invoiceId: invoice.id,
      actorName: "Max Automations",
      actorRole: "automation",
      icon: "!",
      severity: "error",
      metadata: {
        dedupeKey: `commercial_order_finalization_failed:${invoice.id}`,
        orderId: context.orderId || "",
      },
    });
    return null;
  }
}

async function ensurePaidCommercialProfile(supabaseUrl, serviceRoleKey, invoice, context) {
  const linkedCustomer = invoice.customer_id
    ? await fetchRecord(supabaseUrl, serviceRoleKey, "customers", "id,profile_id,auth_user_id", `id=eq.${encodeURIComponent(invoice.customer_id)}`)
    : null;
  let profile = linkedCustomer?.profile_id
    ? await fetchRecord(supabaseUrl, serviceRoleKey, "profiles", "id,auth_user_id,name,company,email,phone,website,package,status,metadata", `id=eq.${encodeURIComponent(linkedCustomer.profile_id)}`)
    : null;
  const email = cleanEmail(profile?.email || context.customerEmail || context.email);
  if (!profile && email) {
    profile = await fetchRecord(supabaseUrl, serviceRoleKey, "profiles", "id,auth_user_id,name,company,email,phone,website,package,status,metadata", `email=eq.${encodeURIComponent(email)}`);
  }
  const authUser = await ensureCommercialAuthUser(supabaseUrl, serviceRoleKey, {
    email,
    name: profile?.name || context.customerName,
    company: profile?.company || context.customerCompany,
  });
  return upsertCommercialRecord(supabaseUrl, serviceRoleKey, "profiles", {
    id: profile?.id || linkedCustomer?.profile_id || undefined,
    auth_user_id: authUser?.id || profile?.auth_user_id || null,
    name: profile?.name || context.customerName || context.customerCompany || "",
    company: profile?.company || context.customerCompany || "",
    email,
    package: context.packageLabel || profile?.package || "",
    role: profile?.role || "customer",
    status: context.testOrder ? (profile?.status || "pending") : "active",
    metadata: {
      ...(profile?.metadata || {}),
      commercialOrderStatus: "paid",
      latestCommercialOrderId: context.orderId || "",
      portalAccessStatus: "invited",
      onboardingStatus: ((profile?.metadata || {}).onboarding || {}).status || "not_started",
      authAction: authUser?.action || "skipped",
      ...(context.testOrder ? { environment: "test" } : {}),
    },
    updated_at: new Date().toISOString(),
  });
}

async function ensurePaidCommercialCustomer(supabaseUrl, serviceRoleKey, profile, context) {
  const existing = await fetchRecord(supabaseUrl, serviceRoleKey, "customers", "id,profile_id,auth_user_id,name,company,email,phone,website,package,status,portal_status,metadata", `profile_id=eq.${encodeURIComponent(profile.id)}`);
  return upsertCommercialRecord(supabaseUrl, serviceRoleKey, "customers", {
    id: existing?.id || undefined,
    profile_id: profile.id,
    auth_user_id: profile.auth_user_id || existing?.auth_user_id || null,
    name: existing?.name || profile.name || context.customerName || "",
    company: existing?.company || profile.company || context.customerCompany || "",
    email: existing?.email || profile.email || "",
    website: existing?.website || cleanDomain(context.domain || profile.website || ""),
    package: context.packageLabel || existing?.package || profile.package || "",
    status: "active",
    portal_status: "invited",
    customer_since: new Date().toISOString().slice(0, 10),
    metadata: {
      ...(existing?.metadata || {}),
      commercialOrderStatus: "paid",
      latestCommercialOrderId: context.orderId || "",
      portalAccessStatus: "invited",
      onboardingStatus: ((existing?.metadata || {}).onboarding || {}).status || "not_started",
    },
    updated_at: new Date().toISOString(),
  });
}

async function ensurePaidCommercialWebsite(supabaseUrl, serviceRoleKey, customer, profile, context) {
  const domain = cleanDomain(context.domain || customer.website || profile.website || "");
  const existing = domain
    ? await fetchRecord(supabaseUrl, serviceRoleKey, "websites", "id,customer_id,profile_id,name,domain,live_url,status,metadata", `customer_id=eq.${encodeURIComponent(customer.id)}&domain=eq.${encodeURIComponent(domain)}`)
    : null;
  return upsertCommercialRecord(supabaseUrl, serviceRoleKey, "websites", {
    id: existing?.id || undefined,
    customer_id: customer.id,
    profile_id: profile.id,
    name: customer.company || customer.name || "Nieuwe website",
    domain,
    live_url: domain ? `https://${domain}` : "",
    status: "onboarding",
    hosting_package: context.packageLabel || "",
    care_package: context.packageLabel || "",
    ssl_status: "unknown",
    hosting_status: "unknown",
    uptime_status: "unknown",
    dns_status: "unknown",
    metadata: {
      ...(existing?.metadata || {}),
      commercialOrderStatus: "paid",
      latestCommercialOrderId: context.orderId || "",
    },
    updated_at: new Date().toISOString(),
  });
}

async function ensurePaidCommercialProject(supabaseUrl, serviceRoleKey, customer, website, context) {
  const existing = await fetchRecord(supabaseUrl, serviceRoleKey, "projects", "id,customer_id,website_id,name,type,status,phase,progress,metadata", `customer_id=eq.${encodeURIComponent(customer.id)}&website_id=eq.${encodeURIComponent(website.id)}`);
  return upsertCommercialRecord(supabaseUrl, serviceRoleKey, "projects", {
    id: existing?.id || undefined,
    customer_id: customer.id,
    website_id: website.id,
    name: existing?.name || `Website project ${customer.company || customer.name || ""}`.trim(),
    type: "website_delivery",
    status: "onboarding",
    phase: "Intake gestart",
    progress: Math.max(Number(existing?.progress) || 0, 15),
    checklist: existing?.checklist || [],
    tasks: existing?.tasks || [],
    timeline: existing?.timeline || [],
    metadata: {
      ...(existing?.metadata || {}),
      commercialOrderStatus: "paid",
      latestCommercialOrderId: context.orderId || "",
      packageLabel: context.packageLabel || "",
      paymentChoice: context.paymentChoice || "",
      remainingAmount: context.remainingAmount || 0,
      onboarding: {
        ...((existing?.metadata || {}).onboarding || {}),
        customerId: customer.id,
        projectId: existing?.id || "",
        status: ((existing?.metadata || {}).onboarding || {}).status || "not_started",
        answers: ((existing?.metadata || {}).onboarding || {}).answers || {},
        files: ((existing?.metadata || {}).onboarding || {}).files || [],
        createdAt: ((existing?.metadata || {}).onboarding || {}).createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      onboardingStatus: ((existing?.metadata || {}).onboarding || {}).status || "not_started",
    },
    updated_at: new Date().toISOString(),
  });
}

async function sendCommercialWelcomeEmail(supabaseUrl, serviceRoleKey, profile, customer, project, context) {
  if (!cleanEmail(profile.email)) return null;
  const companySettings = getCompanySettings();
  const passwordSetup = await createCommercialPasswordSetupLink(supabaseUrl, serviceRoleKey, profile.email);
  const portalUrl = passwordSetup.actionLink || absoluteUrl(`/login.html?email=${encodeURIComponent(profile.email)}`);
  const text = [
    `Hallo ${profile.name || customer.name || "daar"},`,
    "",
    `Bedankt voor je opdracht voor ${customer.company || "je bedrijf"}. Je betaling is ontvangen en we hebben je project gestart.`,
    `Pakket: ${context.packageLabel || customer.package || "Website"}.`,
    "",
    "De volgende stap is je onboarding. Je klantportaal staat klaar zodra je je wachtwoord instelt.",
    passwordSetup.actionLink ? "Gebruik de knop hieronder om je account te activeren." : "Gebruik de knop hieronder om je klantportaal te openen.",
    "",
    "Met vriendelijke groet,",
    companySettings.companyName,
  ].join("\n");
  const result = await sendEmail({
    to: profile.email,
    bcc: cleanEmail(process.env.ADMIN_EMAIL) || undefined,
    subject: "Welkom bij Max Webstudio - je project is gestart",
    text,
    html: renderEmailHtml("Je project is gestart", text, portalUrl, {
      ctaLabel: passwordSetup.actionLink ? "Account activeren" : "Open klantportaal",
    }),
    customerId: customer.id,
    projectId: project.id,
    templateKey: "commercial_order_welcome",
    templateName: "Nieuwe opdracht welkom",
    triggeredBy: "commercial_order_webhook",
  });
  return result;
}

async function createCommercialPasswordSetupLink(supabaseUrl, serviceRoleKey, email) {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        type: "recovery",
        email,
        redirect_to: absoluteUrl("/login.html"),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { status: "manual_required", actionLink: "" };
    return {
      status: data?.action_link || data?.properties?.action_link ? "generated" : "manual_required",
      actionLink: cleanText(data?.action_link || data?.properties?.action_link),
    };
  } catch {
    return { status: "manual_required", actionLink: "" };
  }
}

async function ensureCommercialAuthUser(supabaseUrl, serviceRoleKey, input = {}) {
  const email = cleanEmail(input.email);
  if (!email) return null;
  const existing = await findCommercialAuthUser(supabaseUrl, serviceRoleKey, email);
  if (existing?.id) return { id: existing.id, action: "existing" };
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email,
      password: crypto.randomBytes(24).toString("base64url"),
      email_confirm: true,
      user_metadata: {
        name: cleanText(input.name),
        company: cleanText(input.company),
        createdBy: "commercial_order_webhook",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Commercial order auth user create failed", { status: response.status, message: data.message || data.error || "" });
    return null;
  }
  return data?.id ? { id: data.id, action: "created" } : null;
}

async function findCommercialAuthUser(supabaseUrl, serviceRoleKey, email) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200&page=1`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return (Array.isArray(data.users) ? data.users : []).find((user) => cleanEmail(user.email) === email) || null;
}

async function fetchRecord(supabaseUrl, serviceRoleKey, table, fields, filter) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(fields)}&${filter}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) return null;
  return Array.isArray(data) ? data[0] || null : data;
}

async function upsertCommercialRecord(supabaseUrl, serviceRoleKey, table, record) {
  const payload = { ...record };
  if (!payload.id) delete payload.id;
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(data.message || data.error || `${table} kon niet worden opgeslagen.`);
    error.status = response.status;
    throw error;
  }
  return Array.isArray(data) ? data[0] || null : data;
}

function parseInvoiceContext(notes = "") {
  const marker = "Factuurregels:";
  const text = cleanText(notes);
  const index = text.lastIndexOf(marker);
  if (index < 0) return {};
  try {
    const parsed = JSON.parse(text.slice(index + marker.length).trim());
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mergeInvoiceContext(notes = "", context = {}) {
  const marker = "\n---\nFactuurregels:";
  const text = cleanText(notes);
  const index = text.lastIndexOf(marker);
  const cleanNotes = index >= 0 ? text.slice(0, index).trim() : text;
  return [cleanNotes, `\n---\nFactuurregels: ${JSON.stringify(context)}`].filter(Boolean).join("\n");
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

async function fetchCustomerProfile(supabaseUrl, serviceRoleKey, customerId) {
  if (!customerId) return null;
  const customer = await fetchRecord(supabaseUrl, serviceRoleKey, "customers", "id,profile_id,auth_user_id", `id=eq.${encodeURIComponent(customerId)}`);
  if (!customer?.profile_id) return null;
  const profile = await fetchInvoiceProfile(supabaseUrl, serviceRoleKey, customer.profile_id);
  return profile ? { ...profile, auth_user_id: profile.auth_user_id || customer.auth_user_id || null } : null;
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
    `Bedrag: ${formatMoney(invoice.total)}.`,
    cleanText(invoice.pdf_file_path) ? "De factuur-PDF blijft veilig beschikbaar in je klantportaal." : "",
    "",
    "Je klantportaal en projectintake staan klaar om verder te gaan.",
    "",
    `Vragen? Mail naar ${companySettings.primaryEmail}.`,
    "",
    "Met vriendelijke groet,",
    companySettings.companyName,
  ].filter(Boolean).join("\n");

  return {
    subject: `Betaling ontvangen voor factuur ${invoiceNumber}`,
    text,
    html: renderEmailHtml("Betaling ontvangen", text, portalUrl, { ctaLabel: "Open klantportaal" }),
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
    html: renderEmailHtml("Actie nodig voor je onderhoudsabonnement", text, mandateUrl || portalUrl, {
      ctaLabel: mandateUrl ? "Machtiging afronden" : "Open klantportaal",
    }),
  };
}

function renderEmailHtml(heading, text, portalUrl, options = {}) {
  const companySettings = getCompanySettings();
  const paragraphs = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const ctaLabel = cleanText(options.ctaLabel) || "Open klantportaal";
  return `
    <div style="margin:0;padding:0;background:#07111f;color:#eaf1ff;font-family:Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
        <div style="border:1px solid rgba(255,255,255,0.12);border-radius:18px;background:#0b1728;padding:28px;">
          <p style="margin:0 0 10px;color:#7db7ff;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(companySettings.companyName)}</p>
          <h1 style="margin:0 0 20px;color:#ffffff;font-size:28px;line-height:1.2;">${escapeHtml(heading)}</h1>
          ${paragraphs.map((line) => `<p style="margin:0 0 14px;color:#d7e3f7;font-size:15px;line-height:1.7;">${linkify(escapeHtml(line))}</p>`).join("")}
          <p style="margin:24px 0 0;">
            <a href="${escapeAttribute(portalUrl)}" style="display:inline-block;background:#2f8cff;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700;">${escapeHtml(ctaLabel)}</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

async function patchInvoice(supabaseUrl, serviceRoleKey, invoiceId, patch) {
  const response = await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${encodeURIComponent(invoiceId)}`, {
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

async function patchRecord(supabaseUrl, serviceRoleKey, table, id, patch) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...restHeaders(serviceRoleKey), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || `${table} kon niet worden bijgewerkt.`);
  }
}

async function insertRecord(supabaseUrl, serviceRoleKey, table, record) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...restHeaders(serviceRoleKey), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || `${table} kon niet worden opgeslagen.`);
  }
}

function buildDomainPaidEmail({ customerName, domainName }) {
  const subject = `Betaling ontvangen voor ${domainName}`;
  const text = `Beste ${customerName},\n\nWe hebben je betaling voor ${domainName} ontvangen. De domeinregistratie staat nu klaar voor uitvoering. Zodra de registratie bij de registrar is afgerond, ontvang je opnieuw bericht.\n\nMet vriendelijke groet,\nMax Webstudio`;
  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f7fb;font-family:Inter,Arial,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="padding:30px;border:1px solid #dbe6f0;border-radius:18px;background:#fff"><p style="margin:0 0 8px;color:#1594d0;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em">Max Webstudio · Betaling bevestigd</p><h1 style="margin:0 0 14px;font-size:25px">Betaling ontvangen</h1><p style="color:#52677a;line-height:1.65">Beste ${escapeHtml(customerName)}, we hebben je betaling voor <strong>${escapeHtml(domainName)}</strong> ontvangen. De domeinregistratie staat nu klaar voor uitvoering.</p><p style="color:#52677a;line-height:1.65">Zodra de registratie bij de registrar is afgerond, ontvang je opnieuw bericht.</p></div></div></body></html>`;
  return { subject, text, html };
}

function buildDomainRegisteredEmail({ customerName, domainName, requested = false }) {
  const subject = requested ? `Registratie van ${domainName} is aangevraagd` : `${domainName} is geregistreerd`;
  const statusText = requested
    ? "De aanvraag is bij de registry in behandeling. Zodra de registry de registratie activeert, werken we de status automatisch of handmatig bij."
    : "De registratie bij Openprovider is geslaagd. Het domein staat op basis van de door jou aangeleverde houdergegevens geregistreerd.";
  const text = `Beste ${customerName},\n\n${statusText}\n\nDomeinnaam: ${domainName}\n\nLet op: bij een .com-domein kan de domeinhouder nog een verificatiemail van Openprovider ontvangen. Rond die controle tijdig af.\n\nMet vriendelijke groet,\nMax Webstudio`;
  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f7fb;font-family:Inter,Arial,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="padding:30px;border:1px solid #dbe6f0;border-radius:18px;background:#fff"><p style="margin:0 0 8px;color:#1594d0;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em">Max Webstudio · Domeinregistratie</p><h1 style="margin:0 0 14px;font-size:25px">${escapeHtml(domainName)} ${requested ? "is aangevraagd" : "is geregistreerd"}</h1><p style="color:#52677a;line-height:1.65">Beste ${escapeHtml(customerName)}, ${escapeHtml(statusText)}</p><p style="margin:20px 0 0;color:#64748b;font-size:12px;line-height:1.6">Bij een .com-domein kan de domeinhouder nog een verificatiemail van Openprovider ontvangen. Rond die controle tijdig af.</p></div></div></body></html>`;
  return { subject, text, html };
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

async function callRpc(supabaseUrl, serviceRoleKey, name, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...restHeaders(serviceRoleKey), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `${name} kon niet worden uitgevoerd.`);
  return data;
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
  const amount = Number(subscription.total_incl_vat ?? subscription.monthly_amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount;
}

function billingInterval(value) {
  const cycle = cleanText(value || "monthly").toLowerCase();
  if (cycle === "quarterly") return "3 months";
  if (cycle === "yearly") return "12 months";
  return "1 month";
}

function subscriptionDescription(subscription) {
  const packageName = cleanText(subscription.plan || subscription.package_name) || "Onderhoud";
  return `Max Web Studio ${packageName} onderhoud`.slice(0, 255);
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanDomain(value = "") {
  return cleanText(value).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}

function cleanText(value) {
  return String(value || "").trim();
}

function isEnabled(value) {
  return ["true", "1", "yes", "on"].includes(cleanText(value).toLowerCase());
}

function uuidPattern(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value));
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
