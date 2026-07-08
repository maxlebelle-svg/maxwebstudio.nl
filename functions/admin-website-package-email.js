const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");
const { getCompanySettings, getMailtoLink } = require("./company-settings");
const { createTimelineEvent } = require("./services/timelineService");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse);
    if (!adminCheck.success) return adminCheck.response;

    const payload = parsePayload(event.body);
    const action = cleanText(payload.action || "preview").toLowerCase();
    const input = validatePayload(payload);
    const mailPreview = buildPackageChangeEmail(input);

    if (action === "preview") {
      return jsonResponse(200, {
        success: true,
        email: { requested: true, sent: false, previewOnly: true },
        mailPreview,
      });
    }

    if (action !== "send") {
      return jsonResponse(400, { success: false, error: "Kies preview of send." });
    }

    const result = await sendEmail({
      to: input.customerEmail,
      from: cleanText(process.env.CUSTOMER_UPDATE_FROM_EMAIL) || cleanText(process.env.FROM_EMAIL) || undefined,
      bcc: cleanText(process.env.ADMIN_EMAIL) || undefined,
      replyTo: cleanText(process.env.REPLY_TO_EMAIL) || cleanText(process.env.FROM_EMAIL) || undefined,
      subject: mailPreview.subject,
      html: mailPreview.html,
      text: mailPreview.text,
      templateKey: "website_package_change",
      templateName: "Website pakketwijziging",
      triggeredBy: "admin_website_package_email",
      triggeredByUserId: adminCheck.admin?.id,
      suppressTimelineEvent: true,
      metadata: {
        customerCompany: input.customerCompany,
        websiteName: input.websiteName,
        websiteDomain: input.websiteDomain,
        timing: input.timing,
        effectiveDate: input.effectiveDate,
      },
    });

    if (!result.sent) {
      return jsonResponse(502, {
        success: false,
        error: "Klantmail kon niet worden verzonden.",
        warning: cleanText(result.warning),
        mailPreview,
      });
    }
    await safeCreateTimeline({
      eventType: "website_package_email_sent",
      title: "Websitepakket-update verzonden",
      description: `Pakketupdate verzonden voor ${input.websiteDomain || input.websiteName}.`,
      module: "production",
      referenceType: "website_package_email",
      referenceId: result.logId || result.id || "",
      actorName: adminCheck.admin?.email || "Max CRM",
      actorRole: adminCheck.admin?.role || "admin",
      icon: "🌐",
      severity: "success",
      metadata: {
        dedupeKey: `website_package_email:${result.logId || result.id || input.customerEmail}:${Date.now()}`,
        customerCompany: input.customerCompany,
        customerEmail: input.customerEmail,
        websiteName: input.websiteName,
        websiteDomain: input.websiteDomain,
      },
    });

    return jsonResponse(200, {
      success: true,
      email: {
        requested: true,
        sent: true,
        id: cleanText(result.id),
      },
      mailPreview,
    });
  } catch (error) {
    console.error("Website package email failed", { message: error.message });
    return jsonResponse(error.statusCode || 500, {
      success: false,
      error: error.statusCode ? error.message : "Pakketmail kon niet veilig worden voorbereid.",
    });
  }
};

async function safeCreateTimeline(input) {
  try {
    return await createTimelineEvent(input);
  } catch (error) {
    console.error("Website package timeline event failed", { message: error.message });
    return null;
  }
}

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
    customerName: cleanText(payload.customerName || payload.name) || "klant",
    customerCompany: cleanText(payload.customerCompany || payload.company),
    customerEmail: cleanText(payload.customerEmail || payload.email).toLowerCase(),
    websiteName: cleanText(payload.websiteName || payload.websiteTitle || payload.domain),
    websiteDomain: cleanText(payload.websiteDomain || payload.domain),
    currentHostingPackage: packageLabel(payload.currentHostingPackage),
    newHostingPackage: packageLabel(payload.newHostingPackage),
    currentCarePackage: packageLabel(payload.currentCarePackage),
    newCarePackage: packageLabel(payload.newCarePackage),
    timing: cleanText(payload.timing || "now").toLowerCase() === "scheduled" ? "scheduled" : "now",
    effectiveDate: cleanText(payload.effectiveDate),
    note: cleanText(payload.note),
  };
  if (!input.customerCompany) input.customerCompany = input.customerName;
  if (!emailPattern.test(input.customerEmail)) throwValidation("Geen geldig klant e-mailadres gevonden.");
  if (!input.websiteName && !input.websiteDomain) throwValidation("Selecteer eerst een website.");
  if (!input.newHostingPackage) throwValidation("Kies een hostingpakket.");
  if (!input.newCarePackage) throwValidation("Kies een onderhoudspakket.");
  if (input.timing === "scheduled" && !input.effectiveDate) throwValidation("Kies een ingangsdatum voor de geplande wijziging.");
  return input;
}

function buildPackageChangeEmail(input) {
  const companySettings = getCompanySettings();
  const company = input.customerCompany || input.customerName;
  const website = input.websiteDomain || input.websiteName;
  const effectiveText = input.timing === "scheduled"
    ? `vanaf ${formatDate(input.effectiveDate)}`
    : "per direct";
  const subject = `Update voor ${website}: pakketwijziging ${effectiveText}`;
  const changes = [
    input.currentHostingPackage !== input.newHostingPackage
      ? `Hostingpakket: ${input.currentHostingPackage || "-"} → ${input.newHostingPackage}`
      : "",
    input.currentCarePackage !== input.newCarePackage
      ? `Onderhoudspakket: ${input.currentCarePackage || "-"} → ${input.newCarePackage}`
      : "",
  ].filter(Boolean);
  const text = [
    `Hoi ${input.customerName},`,
    "",
    `We hebben een pakketupdate klaargezet voor ${company}.`,
    `Website: ${website}.`,
    `Ingang: ${effectiveText}.`,
    "",
    "Wijziging:",
    ...changes.map((line) => `- ${line}`),
    input.note ? "" : "",
    input.note ? `Opmerking: ${input.note}` : "",
    "",
    input.timing === "scheduled"
      ? "Tot de ingangsdatum blijft je huidige pakket actief. Op de afgesproken datum voeren we de wijziging administratief door."
      : "De wijziging is verwerkt in je klantomgeving.",
    "",
    `Heb je vragen over deze wijziging? Reageer gerust op deze mail of mail naar ${companySettings.primaryEmail}.`,
    "",
    "Met vriendelijke groet,",
    companySettings.companyName,
  ].filter((line) => line !== "").join("\n");
  return {
    subject,
    text,
    html: renderPackageEmailHtml(input, { subject, changes, effectiveText }),
  };
}

function renderPackageEmailHtml(input, preview) {
  const companySettings = getCompanySettings();
  const company = escapeHtml(input.customerCompany || input.customerName);
  const name = escapeHtml(input.customerName);
  const website = escapeHtml(input.websiteDomain || input.websiteName);
  const effectiveText = escapeHtml(preview.effectiveText);
  const note = escapeHtml(input.note);
  const portalUrl = escapeAttribute(absoluteUrl("/client-dashboard.html"));
  const changeRows = preview.changes.length
    ? preview.changes.map((line) => `<tr><td style="padding:12px 0;border-top:1px solid rgba(255,255,255,.1);color:#dce9ff;font-size:15px;line-height:1.5;">${escapeHtml(line)}</td></tr>`).join("")
    : `<tr><td style="padding:12px 0;border-top:1px solid rgba(255,255,255,.1);color:#dce9ff;font-size:15px;line-height:1.5;">Geen pakketverschil gevonden; je gegevens zijn gecontroleerd.</td></tr>`;

  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(preview.subject)}</title></head><body style="margin:0;background:#061626;color:#ffffff;font-family:Inter,Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#061626;padding:28px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#0d2235;border:1px solid rgba(68,180,255,.28);border-radius:22px;overflow:hidden;"><tr><td style="padding:30px 30px 12px;"><table role="presentation" width="100%"><tr><td><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:44px;height:44px;border-radius:12px;background:#07111f;color:#ffffff;font-weight:900;font-size:24px;text-align:center;vertical-align:middle;">M</td><td style="padding-left:12px;"><div style="font-size:18px;color:#ffffff;font-weight:900;">${escapeHtml(companySettings.companyName)}</div><div style="font-size:12px;color:#27c7ff;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Website update</div></td></tr></table></td></tr></table></td></tr><tr><td style="padding:8px 30px 24px;"><h1 style="margin:0 0 12px;font-size:30px;line-height:1.15;color:#ffffff;">Je websitepakket is bijgewerkt.</h1><p style="margin:0;color:#c9d7e8;font-size:16px;line-height:1.7;">Hoi ${name}, we hebben een pakketupdate klaargezet voor <strong style="color:#ffffff;">${company}</strong>.</p></td></tr><tr><td style="padding:0 30px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:4px 18px;"><tr><td style="padding:14px 0;color:#92a8bf;font-size:13px;text-transform:uppercase;font-weight:800;letter-spacing:.08em;">Website</td><td align="right" style="padding:14px 0;color:#ffffff;font-size:15px;font-weight:800;">${website}</td></tr><tr><td style="padding:14px 0;border-top:1px solid rgba(255,255,255,.1);color:#92a8bf;font-size:13px;text-transform:uppercase;font-weight:800;letter-spacing:.08em;">Ingang</td><td align="right" style="padding:14px 0;border-top:1px solid rgba(255,255,255,.1);color:#ffffff;font-size:15px;font-weight:800;">${effectiveText}</td></tr></table></td></tr><tr><td style="padding:0 30px 24px;"><h2 style="margin:0 0 10px;color:#ffffff;font-size:18px;">Wijziging</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${changeRows}</table>${note ? `<p style="margin:18px 0 0;color:#c9d7e8;font-size:15px;line-height:1.7;"><strong style="color:#ffffff;">Opmerking:</strong> ${note}</p>` : ""}<p style="margin:18px 0 0;color:#c9d7e8;font-size:15px;line-height:1.7;">${input.timing === "scheduled" ? "Tot de ingangsdatum blijft je huidige pakket actief. Op de afgesproken datum voeren we de wijziging administratief door." : "De wijziging is verwerkt in je klantomgeving."}</p><p style="margin:22px 0 0;"><a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800;border-radius:12px;padding:13px 18px;">Open klantportaal</a></p></td></tr><tr><td style="padding:22px 30px;background:rgba(255,255,255,.05);color:#aabbd0;font-size:13px;line-height:1.6;">Heb je vragen over deze wijziging? Reageer gerust op deze mail of mail naar <a href="${escapeAttribute(getMailtoLink(companySettings, "Vraag over websitepakket"))}" style="color:#7dd3fc;">${escapeHtml(companySettings.primaryEmail)}</a>.</td></tr></table></td></tr></table></body></html>`;
}

function packageLabel(value) {
  const label = cleanText(value);
  if (!label || label.toLowerCase() === "none") return "Geen";
  return label;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value);
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(date);
}

function absoluteUrl(path) {
  const siteUrl = cleanText(process.env.SITE_URL || getCompanySettings().websiteUrl).replace(/\/$/, "");
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
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

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
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
