const { createEmailLog, updateEmailLog } = require("./mailLogService");
const { createActivityEvent } = require("./timelineService");
const { applyTransactionalEmailPolicy } = require("./transactionalEmailPolicy");

async function sendTrackedEmail(input = {}, dependencies = {}) {
  const env = dependencies.env || process.env;
  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const provider = env.EMAIL_PROVIDER || "resend";
  let governedInput;
  try {
    governedInput = applyTransactionalEmailPolicy(input, env);
  } catch (error) {
    const warning = `Email skipped: ${cleanText(error.code) || "email_policy_rejected"}`;
    const rejectedLog = await safeCreateLog({ ...input, provider: "resend", status: "failed", errorCode: error.code, errorMessage: warning });
    await safeUpdateLog(rejectedLog?.id, { status: "failed", errorCode: error.code, errorMessage: warning });
    if (!input.suppressTimelineEvent) await safeCreateActivity(emailActivityEvent(input, { logId: rejectedLog?.id || "", warning, failed: true }));
    return { sent: false, warning, errorCode: error.code, retryable: false, ambiguous: false, logId: rejectedLog?.id || "" };
  }
  const from = governedInput.from;
  const payload = {
    ...governedInput,
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      deliveryConfiguration: governedInput.deliveryConfiguration,
    },
    from,
    provider: "resend",
    status: "pending",
  };

  const log = await safeCreateLog(payload);

  if (provider !== "resend") {
    const warning = `Email skipped: unsupported EMAIL_PROVIDER ${provider}`;
    await safeUpdateLog(log?.id, {
      status: "failed",
      errorCode: "unsupported_provider",
      errorMessage: warning,
    });
    if (!governedInput.suppressTimelineEvent) await safeCreateActivity(emailActivityEvent(governedInput, { logId: log?.id || "", warning, failed: true }));
    console.log(warning);
    return { sent: false, warning, logId: log?.id || "" };
  }

  if (!env.RESEND_API_KEY) {
    const warning = "Email skipped: RESEND_API_KEY missing";
    await safeUpdateLog(log?.id, {
      status: "failed",
      errorCode: "missing_resend_api_key",
      errorMessage: warning,
    });
    if (!governedInput.suppressTimelineEvent) await safeCreateActivity(emailActivityEvent(governedInput, { logId: log?.id || "", warning, failed: true }));
    console.log(warning);
    return { sent: false, warning, logId: log?.id || "" };
  }

  try {
    const idempotencyKey = normalizeIdempotencyKey(governedInput.idempotencyKey);
    const timeoutMs = boundedTimeout(governedInput.timeoutMs);
    const response = await fetchWithTimeout(fetchImpl, "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: governedInput.to,
        bcc: governedInput.bcc,
        reply_to: governedInput.replyTo,
        subject: governedInput.subject,
        html: governedInput.html,
        text: governedInput.text,
        attachments: governedInput.attachments || [],
      }),
    }, timeoutMs);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = cleanText(data.message || data.name || "Unknown Resend error");
      console.error("Email failed", { status: response.status, message });
      await safeUpdateLog(log?.id, {
        status: "failed",
        errorCode: cleanText(data.name) || `resend_${response.status}`,
        errorMessage: safeProviderError(message),
      });
      if (!governedInput.suppressTimelineEvent) await safeCreateActivity(emailActivityEvent(governedInput, { logId: log?.id || "", warning: message, failed: true }));
      return {
        sent: false,
        warning: "Email failed: Resend rejected the message",
        logId: log?.id || "",
        statusCode: response.status,
        errorCode: cleanText(data.name) || `resend_${response.status}`,
        retryable: response.status === 429 || response.status >= 500 || cleanText(data.name) === "concurrent_idempotent_requests",
        ambiguous: false,
      };
    }

    await safeUpdateLog(log?.id, {
      status: "sent",
      providerMessageId: cleanText(data.id),
      errorMessage: "",
      errorCode: "",
    });
    if (!governedInput.suppressTimelineEvent) {
      await safeCreateActivity(emailActivityEvent(governedInput, { logId: log?.id || "", providerMessageId: cleanText(data.id) }));
    }

    return { sent: true, id: cleanText(data.id), logId: log?.id || "", statusCode: response.status, providerResult: "accepted" };
  } catch (error) {
    const timedOut = error?.name === "AbortError" || error?.code === "PROVIDER_TIMEOUT";
    const errorCode = timedOut ? "provider_timeout" : "provider_request_error";
    console.error("Email failed", { code: errorCode });
    await safeUpdateLog(log?.id, {
      status: "failed",
      errorCode,
      errorMessage: errorCode,
    });
    if (!governedInput.suppressTimelineEvent) await safeCreateActivity(emailActivityEvent(governedInput, { logId: log?.id || "", warning: error.message, failed: true }));
    return {
      sent: false,
      warning: "Email failed: provider request error",
      logId: log?.id || "",
      errorCode,
      retryable: true,
      ambiguous: true,
    };
  }
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  if (typeof fetchImpl !== "function") throw Object.assign(new Error("Mailprovider is niet beschikbaar."), { code: "provider_request_error" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...options, signal: controller.signal }); }
  catch (error) { if (error?.name === "AbortError") error.code = "PROVIDER_TIMEOUT"; throw error; }
  finally { clearTimeout(timer); }
}

function normalizeIdempotencyKey(value) {
  const key = cleanText(value);
  return key && key.length <= 256 && /^[A-Za-z0-9._:/-]+$/.test(key) ? key : "";
}

function boundedTimeout(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(500, Math.min(10000, Math.floor(number))) : 8000;
}

async function safeCreateLog(input) {
  try {
    return await createEmailLog(input);
  } catch (error) {
    console.error("Email log create failed", { message: error.message, status: error.status || 0 });
    return null;
  }
}

async function safeUpdateLog(id, patch) {
  if (!id) return null;
  try {
    return await updateEmailLog(id, patch);
  } catch (error) {
    console.error("Email log update failed", { message: error.message, status: error.status || 0 });
    return null;
  }
}

async function safeCreateActivity(input) {
  try {
    return await createActivityEvent(input);
  } catch (error) {
    console.error("Activity event create failed", { message: error.message, status: error.status || 0 });
    return null;
  }
}

function emailActivityEvent(input = {}, context = {}) {
  const templateKey = cleanText(input.templateKey || input.template_key);
  const failed = Boolean(context.failed);
  const subject = cleanText(input.subject);

  return {
    customerId: input.customerId || input.customer_id,
    leadId: input.leadId || input.lead_id,
    invoiceId: input.invoiceId || input.invoice_id,
    emailLogId: context.logId,
    eventType: failed ? "email_failed" : "email_sent",
    title: failed ? "E-mail mislukt" : cleanText(input.templateName || input.template_name) || "E-mail verzonden",
    description: failed
      ? cleanText(context.warning || "E-mail kon niet worden verzonden.")
      : subject ? `E-mail verzonden: ${subject}` : "Een e-mail is succesvol verzonden.",
    module: "email",
    referenceType: "email_log",
    referenceId: context.logId,
    relatedType: "email_log",
    relatedId: context.logId,
    actorName: "Max CRM",
    icon: "📧",
    severity: failed ? "error" : "success",
    metadata: {
      dedupeKey: context.logId ? `email:${failed ? "failed" : "sent"}:${context.logId}` : "",
      providerMessageId: context.providerMessageId || "",
      templateKey,
      templateName: cleanText(input.templateName || input.template_name),
      subject,
      to: Array.isArray(input.to) ? input.to.map(cleanText).filter(Boolean) : cleanText(input.to),
    },
  };
}

function safeProviderError(value) {
  return cleanText(value).slice(0, 500);
}

function cleanText(value) {
  return String(value || "").trim();
}

module.exports = {
  sendTrackedEmail,
  _private: { boundedTimeout, fetchWithTimeout, normalizeIdempotencyKey },
};
