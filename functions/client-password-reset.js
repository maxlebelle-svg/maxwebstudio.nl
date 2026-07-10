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
    return { status: actionLink ? "generated" : "not_generated", actionLink, redirectTo };
  } catch (error) {
    console.error("Supabase reset link request failed", { message: error.message });
    return { status: "request_failed", actionLink: "", redirectTo };
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
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(mailPreview.subject)}</title></head><body style="margin:0;background:#061626;color:#ffffff;font-family:Inter,Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#061626;padding:28px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#102a3d;border:1px solid rgba(68,180,255,.26);border-radius:24px;overflow:hidden;"><tr><td style="padding:32px 30px 18px;"><div style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#27c7ff;font-weight:800;">${escapeHtml(companySettings.companyName)}</div><h1 style="margin:14px 0 10px;font-size:32px;line-height:1.12;color:#ffffff;">Nieuw wachtwoord instellen.</h1><p style="margin:0;color:#c9d7e8;font-size:16px;line-height:1.7;">We hebben een aanvraag ontvangen om het wachtwoord voor <strong style="color:#ffffff;">${escapeHtml(email)}</strong> opnieuw in te stellen.</p></td></tr><tr><td style="padding:0 30px 24px;"><p style="margin:0 0 18px;color:#c9d7e8;font-size:16px;line-height:1.7;">Gebruik onderstaande knop om veilig een nieuw wachtwoord te kiezen. Heb jij dit niet aangevraagd? Dan hoef je niets te doen.</p><a href="${actionLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800;border-radius:14px;padding:14px 20px;">${buttonLabel}</a><p style="margin:18px 0 0;color:#91a6bc;font-size:13px;line-height:1.6;">Werkt de knop niet? Open dan deze link:<br /><a href="${actionLink}" style="color:#7dd3fc;">${actionLink}</a></p></td></tr><tr><td style="padding:22px 30px;background:rgba(255,255,255,.05);color:#aabbd0;font-size:13px;line-height:1.6;">Heb je vragen? Reageer op deze mail of mail naar <a href="${escapeAttribute(getMailtoLink(companySettings, "Vraag over wachtwoord reset"))}" style="color:#7dd3fc;">${escapeHtml(companySettings.primaryEmail)}</a>.</td></tr></table></td></tr></table></body></html>`;
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
