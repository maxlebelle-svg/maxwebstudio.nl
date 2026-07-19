const { getCompanySettings } = require("../company-settings");
const { createEmailLog, updateEmailLog } = require("./mailLogService");
const { createActivityEvent } = require("./timelineService");

async function sendTrackedEmail(input = {}) {
  const companySettings = getCompanySettings();
  const provider = process.env.EMAIL_PROVIDER || "resend";
  const from = input.from || process.env.FROM_EMAIL || companySettings.primaryEmail;
  const payload = {
    ...input,
    from,
    provider: "resend",
    status: "pending",
  };

  const log = input.suppressEmailLog ? null : await safeCreateLog(payload);

  if (provider !== "resend") {
    const warning = `Email skipped: unsupported EMAIL_PROVIDER ${provider}`;
    await safeUpdateLog(log?.id, {
      status: "failed",
      errorCode: "unsupported_provider",
      errorMessage: warning,
    });
    if (!input.suppressTimelineEvent) await safeCreateActivity(emailActivityEvent(input, { logId: log?.id || "", warning, failed: true }));
    console.log(warning);
    return { sent: false, deliveryUnknown: false, errorCode: "unsupported_provider", warning, logId: log?.id || "" };
  }

  if (!process.env.RESEND_API_KEY) {
    const warning = "Email skipped: RESEND_API_KEY missing";
    await safeUpdateLog(log?.id, {
      status: "failed",
      errorCode: "missing_resend_api_key",
      errorMessage: warning,
    });
    if (!input.suppressTimelineEvent) await safeCreateActivity(emailActivityEvent(input, { logId: log?.id || "", warning, failed: true }));
    console.log(warning);
    return { sent: false, deliveryUnknown: false, errorCode: "missing_resend_api_key", warning, logId: log?.id || "" };
  }

  try {
    const providerFetch = typeof input.providerFetch === "function" ? input.providerFetch : fetch;
    const response = await providerFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(cleanText(input.idempotencyKey) ? { "Idempotency-Key": cleanText(input.idempotencyKey) } : {}),
      },
      body: JSON.stringify({
        from,
        to: input.to,
        bcc: input.bcc,
        reply_to: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments || [],
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = cleanText(data.message || data.name || "Unknown Resend error");
      console.error("Email failed", { status: response.status, message });
      await safeUpdateLog(log?.id, {
        status: "failed",
        errorCode: cleanText(data.name) || `resend_${response.status}`,
        errorMessage: safeProviderError(message),
      });
      if (!input.suppressTimelineEvent) await safeCreateActivity(emailActivityEvent(input, { logId: log?.id || "", warning: message, failed: true }));
      return {
        sent: false,
        deliveryUnknown: false,
        errorCode: cleanText(data.name) || `resend_${response.status}`,
        warning: "Email failed: Resend rejected the message",
        logId: log?.id || "",
      };
    }

    await safeUpdateLog(log?.id, {
      status: "sent",
      providerMessageId: cleanText(data.id),
      errorMessage: "",
      errorCode: "",
    });
    if (!input.suppressTimelineEvent) {
      await safeCreateActivity(emailActivityEvent(input, { logId: log?.id || "", providerMessageId: cleanText(data.id) }));
    }

    return { sent: true, deliveryUnknown: false, id: cleanText(data.id), logId: log?.id || "" };
  } catch (error) {
    console.error("Email failed", { message: error.message });
    await safeUpdateLog(log?.id, {
      status: "failed",
      errorCode: "provider_request_error",
      errorMessage: safeProviderError(error.message),
    });
    if (!input.suppressTimelineEvent) await safeCreateActivity(emailActivityEvent(input, { logId: log?.id || "", warning: error.message, failed: true }));
    return {
      sent: false,
      deliveryUnknown: true,
      errorCode: "provider_request_ambiguous",
      warning: "Email failed: provider request error",
      logId: log?.id || "",
    };
  }
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
};
