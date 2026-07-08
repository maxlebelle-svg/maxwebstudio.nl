const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");
const { getCompanySettings, getMailtoLink } = require("./company-settings");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  }

  const adminCheck = await verifyAdmin(event, jsonResponse);
  if (!adminCheck.success) return adminCheck.response;

  try {
    const input = validatePayload(parsePayload(event.body));
    const setupLink = await createInviteOrResetLink(input.email);
    const mailPreview = buildMailPreview(input, setupLink);
    const shouldSend = process.env.EMAIL_PROVIDER === "resend" && Boolean(process.env.RESEND_API_KEY);

    if (!shouldSend) {
      return jsonResponse(200, {
        success: true,
        email: {
          requested: true,
          sent: false,
          warning: "Welkomstmail preview klaargezet. Resend is niet geconfigureerd in deze omgeving.",
        },
        mailPreview,
      });
    }

    const result = await sendEmail({
      to: input.email,
      from: cleanText(process.env.CUSTOMER_INVITE_FROM_EMAIL) || cleanText(process.env.FROM_EMAIL) || undefined,
      bcc: cleanText(process.env.ADMIN_EMAIL) || undefined,
      subject: mailPreview.subject,
      html: buildWelcomeEmailHtml(input, mailPreview),
      text: mailPreview.text,
      templateKey: "customer_welcome",
      templateName: "Welkomstmail klantportaal",
      customerId: input.customerId,
      triggeredBy: "admin_customer_welcome_email",
      triggeredByUserId: adminCheck.admin?.id,
      metadata: {
        company: input.company,
        website: input.website,
        package: input.package,
      },
    });

    return jsonResponse(200, {
      success: true,
      email: {
        requested: true,
        sent: Boolean(result.sent),
        id: cleanText(result.id),
        warning: cleanText(result.warning),
      },
      mailPreview,
    });
  } catch (error) {
    console.error("Customer welcome email failed", { message: error.message });
    return jsonResponse(error.statusCode || 500, {
      success: false,
      error: error.statusCode ? error.message : "Welkomstmail kon niet veilig worden voorbereid.",
    });
  }
};

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Ongeldige JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

function validatePayload(payload = {}) {
  const input = {
    customerId: cleanText(payload.customerId || payload.id),
    name: cleanText(payload.name || payload.contactName),
    company: cleanText(payload.company || payload.companyName),
    email: cleanText(payload.email).toLowerCase(),
    website: cleanText(payload.website || payload.domain),
    package: cleanText(payload.package || payload.packageName || "Basis"),
  };
  if (!input.name) input.name = input.company || "klant";
  if (!input.company) throwValidation("Vul een bedrijfsnaam in.");
  if (!emailPattern.test(input.email)) throwValidation("Vul een geldig e-mailadres in.");
  return input;
}

async function createInviteOrResetLink(email) {
  const companySettings = getCompanySettings();
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const redirectTo = cleanText(process.env.CLIENT_PORTAL_REDIRECT_URL) || `${companySettings.websiteUrl}/login.html`;
  if (!supabaseUrl || !serviceRoleKey) {
    return { status: "manual_required", actionLink: "", redirectTo };
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
    if (!response.ok) return { status: "manual_required", actionLink: "", redirectTo };
    const actionLink = cleanText(data.action_link || data.actionLink || data.properties?.action_link || data.properties?.actionLink);
    return { status: actionLink ? "generated" : "manual_required", actionLink, redirectTo };
  } catch {
    return { status: "manual_required", actionLink: "", redirectTo };
  }
}

function buildMailPreview(input, setupLink = {}) {
  const companySettings = getCompanySettings();
  const loginLink = cleanText(setupLink.actionLink) || cleanText(setupLink.redirectTo) || `${companySettings.websiteUrl}/login.html`;
  const setupInstruction = setupLink.status === "generated"
    ? "Via onderstaande knop kun je veilig je account activeren en zelf je wachtwoord instellen."
    : "Open de loginpagina en kies wachtwoord opnieuw instellen om veilig je eigen wachtwoord te maken.";
  const subject = `Welkom bij ${companySettings.companyName} – klantportaal voor ${input.company}`;
  const text = [
    `Hoi ${input.name},`,
    "",
    `Je klantportaal voor ${input.company} staat klaar bij ${companySettings.companyName}.`,
    input.website ? `Gekoppelde website: ${input.website}` : "",
    input.package ? `Onderhoudspakket: ${input.package}` : "",
    "",
    setupInstruction,
    "",
    `Account openen: ${loginLink}`,
    "",
    "Er worden geen wachtwoorden per mail verstuurd. Je stelt je wachtwoord zelf veilig in.",
    "",
    `Vragen? Mail naar ${companySettings.primaryEmail}.`,
    "",
    "Met vriendelijke groet,",
    companySettings.companyName,
  ].filter(Boolean).join("\n");
  return { subject, loginLink, buttonLabel: setupLink.status === "generated" ? "Account activeren" : "Login openen", text };
}

function buildWelcomeEmailHtml(input, mailPreview) {
  const companySettings = getCompanySettings();
  const name = escapeHtml(input.name);
  const company = escapeHtml(input.company);
  const website = escapeHtml(input.website);
  const packageName = escapeHtml(input.package);
  const actionLink = escapeHtml(mailPreview.loginLink);
  const buttonLabel = escapeHtml(mailPreview.buttonLabel);
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(mailPreview.subject)}</title></head><body style="margin:0;background:#061626;color:#ffffff;font-family:Inter,Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#061626;padding:28px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#102a3d;border:1px solid rgba(68,180,255,.26);border-radius:24px;overflow:hidden;"><tr><td style="padding:32px 30px 18px;"><div style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#27c7ff;font-weight:800;">${escapeHtml(companySettings.companyName)}</div><h1 style="margin:14px 0 10px;font-size:32px;line-height:1.12;color:#ffffff;">Je klantportaal staat klaar.</h1><p style="margin:0;color:#c9d7e8;font-size:16px;line-height:1.7;">Hoi ${name}, je klantportaal voor <strong style="color:#ffffff;">${company}</strong> is klaargezet.</p></td></tr><tr><td style="padding:0 30px 24px;"><p style="margin:0 0 18px;color:#c9d7e8;font-size:16px;line-height:1.7;">${website ? `Website: <strong style="color:#ffffff;">${website}</strong><br />` : ""}${packageName ? `Onderhoudspakket: <strong style="color:#ffffff;">${packageName}</strong>` : ""}</p><p style="margin:0 0 18px;color:#c9d7e8;font-size:16px;line-height:1.7;">Er worden geen wachtwoorden per mail verstuurd. Je stelt je wachtwoord zelf veilig in.</p><a href="${actionLink}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800;border-radius:14px;padding:14px 20px;">${buttonLabel}</a><p style="margin:18px 0 0;color:#91a6bc;font-size:13px;line-height:1.6;">Werkt de knop niet? Open dan deze link:<br /><a href="${actionLink}" style="color:#7dd3fc;">${actionLink}</a></p></td></tr><tr><td style="padding:22px 30px;background:rgba(255,255,255,.05);color:#aabbd0;font-size:13px;line-height:1.6;">Heb je vragen? Reageer op deze mail of mail naar <a href="${escapeAttribute(getMailtoLink(companySettings, "Vraag over klantportaal"))}" style="color:#7dd3fc;">${escapeHtml(companySettings.primaryEmail)}</a>.</td></tr></table></td></tr></table></body></html>`;
}

function throwValidation(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
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
