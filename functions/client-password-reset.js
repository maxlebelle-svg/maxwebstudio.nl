const { sendEmail } = require("./email");
const { getCompanySettings, getMailtoLink } = require("./company-settings");
const { verifyAdmin } = require("./_admin-auth");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(event.body);
    let input;
    if (payload.relationshipType || payload.relationshipId) {
      const adminCheck = await verifyAdmin(event, jsonResponse, { module: "mail_studio", action: "password_reset", allowedRoles: ["super_admin", "admin", "developer"] });
      if (!adminCheck.success) return adminCheck.response;
      input = await resolveRelationshipEmail(payload);
    } else {
      input = validatePayload(payload);
    }
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

async function resolveRelationshipEmail(payload = {}) {
  const relationshipType = cleanText(payload.relationshipType).toLowerCase();
  const relationshipId = cleanText(payload.relationshipId);
  if (!["lead", "customer"].includes(relationshipType) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(relationshipId)) {
    const error = new Error("Kies een geldige lead of klant.");
    error.statusCode = 400;
    throw error;
  }
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("Ontvangercontrole is tijdelijk niet beschikbaar.");
    error.statusCode = 503;
    throw error;
  }
  const table = relationshipType === "lead" ? "leads" : "customers";
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&id=eq.${encodeURIComponent(relationshipId)}&limit=1`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Accept: "application/json" },
  });
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const unavailable = !row || row.archived_at || row.deleted_at || row.is_demo || row.is_test || metadata.archivedAt || metadata.deletedAt || metadata.isDemo || metadata.isTest
    || ["archived", "deleted", "inactive"].includes(cleanText(row?.status || row?.portal_status).toLowerCase())
    || ["demo", "test"].includes(cleanText(row?.environment || metadata.environment).toLowerCase());
  if (!response.ok || unavailable || !emailPattern.test(cleanText(row?.email))) {
    const error = new Error("Deze relatie bestaat niet meer of is niet mailbaar.");
    error.statusCode = response.ok ? 422 : 503;
    throw error;
  }
  return { email: cleanText(row.email).toLowerCase() };
}

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
  const redirectTo = cleanText(process.env.CLIENT_PASSWORD_RESET_REDIRECT_URL) || `${companySettings.websiteUrl}/wachtwoord-instellen.html?type=recovery`;
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
  const actionLink = cleanText(resetLink.actionLink) || `${companySettings.websiteUrl}/wachtwoord-instellen.html?type=recovery`;
  const template = passwordResetTemplate();
  const data = {
    klant_naam: "klant",
    email,
    reset_url: actionLink,
    login_url: `${companySettings.websiteUrl}/login.html`,
    contactpersoon: "Max",
    bedrijf_naam: companySettings.companyName,
  };
  const subject = renderTemplateText(template.subject, data);
  const preheader = renderTemplateText(template.preheader, data);
  const bodyText = renderTemplateText(template.body, data);
  const text = [
    bodyText,
    "",
    `${template.ctaLabel}: ${actionLink}`,
  ].join("\n");

  return { subject, preheader, bodyText, actionLink, buttonLabel: template.ctaLabel, text, email };
}

function buildPasswordResetEmailHtml(email, mailPreview) {
  const companySettings = getCompanySettings();
  const actionLink = escapeHtml(mailPreview.actionLink);
  const buttonLabel = escapeHtml(mailPreview.buttonLabel);
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="dark" /><meta name="supported-color-schemes" content="dark" /><title>${escapeHtml(mailPreview.subject)}</title></head><body style="margin:0;background:#061626;color:#ffffff;font-family:Inter,Arial,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(mailPreview.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#061626;padding:28px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#0d2235;border:1px solid rgba(68,180,255,.28);border-radius:24px;overflow:hidden;"><tr><td style="padding:32px 30px 18px;"><div style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#27c7ff;font-weight:800;">${escapeHtml(companySettings.companyName)}</div><h1 style="margin:14px 0 10px;font-size:32px;line-height:1.12;color:#ffffff;">${escapeHtml(mailPreview.subject)}</h1></td></tr><tr><td style="padding:0 30px 24px;">${textToEmailHtml(mailPreview.bodyText)}<a href="${actionLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800;border-radius:14px;padding:14px 20px;">${buttonLabel}</a><p style="margin:18px 0 0;color:#91a6bc;font-size:13px;line-height:1.6;">Werkt de knop niet? Open dan deze link:<br /><a href="${actionLink}" style="color:#7dd3fc;">${actionLink}</a></p></td></tr><tr><td style="padding:22px 30px;background:#102a3d;color:#aabbd0;font-size:13px;line-height:1.6;">Heb je vragen? Reageer op deze mail of mail naar <a href="${escapeAttribute(getMailtoLink(companySettings, "Vraag over wachtwoord reset"))}" style="color:#7dd3fc;">${escapeHtml(companySettings.primaryEmail)}</a>.</td></tr></table></td></tr></table></body></html>`;
}

function passwordResetTemplate() {
  return {
    subject: "Nieuw wachtwoord instellen",
    preheader: "Gebruik de beveiligde link om je wachtwoord opnieuw te kiezen.",
    ctaLabel: "Nieuw wachtwoord kiezen",
    body: "Hallo {{klant_naam}},\n\nWe hebben een aanvraag ontvangen om het wachtwoord voor {{email}} opnieuw in te stellen.\n\nGebruik onderstaande knop om veilig een nieuw wachtwoord te kiezen. Heb jij dit niet aangevraagd? Dan hoef je niets te doen.\n\nMet vriendelijke groet,\n{{contactpersoon}}\nMax Webstudio",
  };
}

function renderTemplateText(value, data = {}) {
  return cleanText(value).replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const cleanKey = cleanText(key);
    return Object.prototype.hasOwnProperty.call(data, cleanKey) ? cleanText(data[cleanKey]) : match;
  });
}

function textToEmailHtml(value = "") {
  return cleanText(value)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 18px;color:#c9d7e8;font-size:16px;line-height:1.7;">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
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
