const { getCompanySettings } = require("../company-settings");
const { createEmailLog, updateEmailLog } = require("./mailLogService");

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

  const log = await safeCreateLog(payload);

  if (provider !== "resend") {
    const warning = `Email skipped: unsupported EMAIL_PROVIDER ${provider}`;
    await safeUpdateLog(log?.id, {
      status: "failed",
      errorCode: "unsupported_provider",
      errorMessage: warning,
    });
    console.log(warning);
    return { sent: false, warning, logId: log?.id || "" };
  }

  if (!process.env.RESEND_API_KEY) {
    const warning = "Email skipped: RESEND_API_KEY missing";
    await safeUpdateLog(log?.id, {
      status: "failed",
      errorCode: "missing_resend_api_key",
      errorMessage: warning,
    });
    console.log(warning);
    return { sent: false, warning, logId: log?.id || "" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
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
      return {
        sent: false,
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

    return { sent: true, id: cleanText(data.id), logId: log?.id || "" };
  } catch (error) {
    console.error("Email failed", { message: error.message });
    await safeUpdateLog(log?.id, {
      status: "failed",
      errorCode: "provider_request_error",
      errorMessage: safeProviderError(error.message),
    });
    return {
      sent: false,
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

function safeProviderError(value) {
  return cleanText(value).slice(0, 500);
}

function cleanText(value) {
  return String(value || "").trim();
}

module.exports = {
  sendTrackedEmail,
};
