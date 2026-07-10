const { sendEmail } = require("./email");
const { getCompanySettings, getMailtoLink } = require("./company-settings");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = validatePayload(parsePayload(event.body));
    const resetLink = await createPasswordResetLink(input.email);

    if (resetLink.status === "generated") {
      const mailPreview = buildMailPreview(input.email, resetLink);
      const result = await sendEmail({
        to: input.email,
        subject: mailPreview.subject,
        html: buildPasswordResetEmailHtml(input.email, mailPreview),
        text: mailPreview.text,
        templateKey: "client-password-reset",
        templateName: "Klant wachtwoord reset",
        suppressTimelineEvent: true,
        metadata: {
          source: "client_login_password_reset",
        },
      });

      if (!result.sent) {
        console.error("Client password reset mail was not sent", { warning: result.warning || "" });
      }
    } else {
      console.info("Client password reset link not generated", { email: redactEmail(input.email), status: resetLink.status });
    }

    return jsonResponse(200, {
      success: true,
      message: "Als dit e-mailadres bekend is, wordt er een resetlink verstuurd.",
    });
  } catch (error) {
    console.error("Client password reset failed", { message: error.message });
    return jsonResponse(error.statusCode || 500, {
      success: false,
      error: error.statusCode === 400 ? error.message : "Resetlink aanvragen is niet gelukt.",
    });
  }
};

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
}

function validatePayload(payload = {}) {
  const email = cleanText(payload.email).toLowerCase();
  if (!emailPattern.test(email)) {
    const error = new Error("Vul een geldig e-mailadres in.");
    error.statusCode = 400;
    throw error;
  }
  return { email };
}

async function createPasswordResetLink(email) {
  const companySettings = getCompanySettings();
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const redirectTo = cleanText(process.env.CLIENT_PORTAL_REDIRECT_URL) || `${companySettings.websiteUrl}/login.html?type=recovery`;
  if (!supabaseUrl || !serviceRoleKey) {
    return { status: "config_missing", actionLink: "", redirectTo };
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ type: "recovery", email, redirect_to: redirectTo }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.info("Supabase reset link generation failed", {
        status: response.status,
        message: cleanText(data.message || data.error || ""),
      });
      return { status: "not_generated", actionLink: "", redirectTo };
    }
    const actionLink = cleanText(data.action_link || data.actionLink || data.properties?.action_link || data.properties?.actionLink);
    const tokenHash = cleanText(data.hashed_token || data.hashedToken || data.token_hash || data.tokenHash || data.properties?.hashed_token || data.properties?.hashedToken || data.properties?.token_hash || data.properties?.tokenHash);
    const recoveryLink = buildRecoveryLink(redirectTo, tokenHash);
    return { status: recoveryLink || actionLink ? "generated" : "not_generated", actionLink: recoveryLink || actionLink, redirectTo };
  } catch (error) {
    console.error("Supabase reset link request failed", { message: error.message });
    return { status: "request_failed", actionLink: "", redirectTo };
  }
}

function buildRecoveryLink(redirectTo, tokenHash) {
  if (!tokenHash) return "";
  try {
    const url = new URL(redirectTo);
    url.searchParams.set("type", "recovery");
    url.searchParams.set("token_hash", tokenHash);
    return url.toString();
  } catch {
    return "";
  }
}

function buildMailPreview(email, resetLink = {}) {
  const companySettings = getCompanySettings();
  const actionLink = cleanText(resetLink.actionLink) || `${companySettings.websiteUrl}/login.html`;
  const subject = "Stel je Max Webstudio wachtwoord opnieuw in";
  const text = [
    "Hoi,",
    "",
    "We hebben een aanvraag ontvangen om je Max Webstudio wachtwoord opnieuw in te stellen.",
    "",
    `Nieuw wachtwoord kiezen: ${actionLink}`,
    "",
    "Heb jij dit niet aangevraagd? Dan hoef je niets te doen.",
    "",
    `Vragen? Mail naar ${companySettings.primaryEmail}.`,
    "",
    "Met vriendelijke groet,",
    companySettings.companyName,
  ].join("\n");

  return { subject, actionLink, buttonLabel: "Nieuw wachtwoord kiezen", text, email };
}

function buildPasswordResetEmailHtml(email, mailPreview) {
  const companySettings = getCompanySettings();
  const actionLink = escapeHtml(mailPreview.actionLink);
  const buttonLabel = escapeHtml(mailPreview.buttonLabel);
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(mailPreview.subject)}</title></head><body style="margin:0;background:#07111f;color:#eaf1ff;font-family:Arial,sans-serif;"><div style="max-width:640px;margin:0 auto;padding:32px 20px;"><div style="border:1px solid rgba(255,255,255,0.12);border-radius:18px;background:#0b1728;padding:28px;"><p style="margin:0 0 10px;color:#7db7ff;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(companySettings.companyName)}</p><h1 style="margin:0 0 20px;color:#ffffff;font-size:28px;line-height:1.2;">Nieuw wachtwoord instellen</h1><p style="margin:0 0 14px;color:#d7e3f7;font-size:15px;line-height:1.7;">We hebben een aanvraag ontvangen om het wachtwoord voor <strong style="color:#ffffff;">${escapeHtml(email)}</strong> opnieuw in te stellen.</p><p style="margin:0 0 14px;color:#d7e3f7;font-size:15px;line-height:1.7;">Gebruik onderstaande knop om veilig een nieuw wachtwoord te kiezen. Heb jij dit niet aangevraagd? Dan hoef je niets te doen.</p><p style="margin:24px 0 0;"><a href="${actionLink}" style="display:inline-block;background:#2f8cff;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700;">${buttonLabel}</a></p><p style="margin:18px 0 0;color:#91a6bc;font-size:13px;line-height:1.6;">Werkt de knop niet? Open dan deze link:<br /><a href="${actionLink}" style="color:#7db7ff;">${actionLink}</a></p><p style="margin:24px 0 0;color:#d7e3f7;font-size:15px;line-height:1.7;">Vragen? Mail naar <a href="${escapeAttribute(getMailtoLink(companySettings, "Vraag over wachtwoord reset"))}" style="color:#7db7ff;">${escapeHtml(companySettings.primaryEmail)}</a>.</p></div></div></body></html>`;
}

function cleanText(value) {
  return String(value || "").trim();
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
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function redactEmail(email = "") {
  const [name, domain] = cleanText(email).split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 2)}***@${domain}`;
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
