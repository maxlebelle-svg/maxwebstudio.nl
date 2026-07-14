const { sendEmail } = require("./email");
const { getCompanySettings, getWhatsappLink } = require("./company-settings");
const { createTimelineEvent } = require("./services/timelineService");
const { persistPublicLead } = require("./services/publicLeadService");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createHandler(dependencies = {}) {
  const persist = dependencies.persistPublicLead || persistPublicLead;
  const deliverEmail = dependencies.sendEmail || sendEmail;
  const createEvent = dependencies.createTimelineEvent || createTimelineEvent;
  return async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { success: false, error: "Ongeldige JSON body." });
  }

  const lead = sanitizeLead(payload);
  const validationError = validateLead(lead);

  if (validationError) {
    return jsonResponse(400, { success: false, error: validationError });
  }

  try {
    const persisted = await persist(lead);
    const leadId = persisted.lead?.id;
    if (!leadId) throw new Error("Leadopslag gaf geen geldige lead-ID terug.");
    await safeCreateTimeline({
      createEvent,
      leadId,
      eventType: "lead_created",
      title: `Nieuwe lead ontvangen: ${lead.name}`,
      description: lead.company ? `${lead.company} heeft een aanvraag ingestuurd.` : "Er is een nieuwe aanvraag ingestuurd.",
      module: "sales",
      referenceType: "lead",
      referenceId: leadId,
      actorName: lead.name,
      actorRole: "lead",
      icon: "🔔",
      severity: "info",
      metadata: {
        dedupeKey: `lead_created:${lead.email}:${lead.submittedAt}`,
        publicRequestId: persisted.requestId,
        leadEmail: lead.email,
        leadName: lead.name,
        company: lead.company,
        packageInterest: lead.packageInterest,
      },
    });
    const companySettings = getCompanySettings();
    const result = await deliverEmail({
      to: process.env.LEAD_TO_EMAIL || process.env.ADMIN_EMAIL || companySettings.primaryEmail,
      from: process.env.LEAD_FROM_EMAIL || process.env.FROM_EMAIL || undefined,
      replyTo: lead.email,
      subject: `Nieuwe aanvraag Max Webstudio - ${lead.packageInterest} - ${lead.name}`,
      html: buildLeadHtml(lead),
      text: buildLeadText(lead),
      templateKey: "lead_notification",
      templateName: "Nieuwe lead notificatie",
      triggeredBy: "homepage_contact_form",
      leadId,
      idempotencyKey: `public-lead-notification:${persisted.requestId}`,
      metadata: {
        leadEmail: lead.email,
        leadName: lead.name,
        company: lead.company,
        source: lead.source,
        packageInterest: lead.packageInterest,
      },
    });

    if (!result.sent) {
      return jsonResponse(502, {
        success: false,
        error: "Aanvraag is opgeslagen, maar de interne e-mail kon niet worden verzonden.",
        warning: result.warning,
      });
    }

    const confirmation = await sendCustomerConfirmation(lead, { leadId, requestId: persisted.requestId, deliverEmail });
    const confirmationWarning = confirmation.warning || "";

    return jsonResponse(200, {
      success: true,
      confirmationSent: Boolean(confirmation.sent),
      leadId,
      created: persisted.created,
      warning: confirmationWarning || undefined,
    });
  } catch (error) {
    console.error("Lead request failed", { message: error.message });
    return jsonResponse(error.status || 500, { success: false, error: "Aanvraag kon niet veilig worden opgeslagen." });
  }
  };
}

exports.handler = createHandler();

function sanitizeLead(payload) {
  return {
    id: cleanText(payload.id || payload.requestId),
    name: cleanText(payload.name),
    company: cleanText(payload.company),
    email: cleanText(payload.email).toLowerCase(),
    phone: cleanText(payload.phone),
    packageInterest: cleanText(payload.packageInterest || payload.package),
    carePackage: cleanText(payload.carePackage),
    termsAccepted: Boolean(payload.termsAccepted),
    message: cleanText(payload.message, 3000),
    source: cleanText(payload.source || "homepage-contact-form"),
    submittedAt: cleanText(payload.createdAt) || new Date().toISOString(),
  };
}

async function safeCreateTimeline(input) {
  const createEvent = input.createEvent || createTimelineEvent;
  try {
    const { createEvent: _ignored, ...event } = input;
    return await createEvent(event);
  } catch (error) {
    console.error("Lead timeline event failed", { message: error.message });
    return null;
  }
}

function validateLead(lead) {
  if (!lead.name) return "Vul je naam in.";
  if (!emailPattern.test(lead.email)) return "Vul een geldig e-mailadres in.";
  if (!lead.message) return "Vul je bericht of wensen in.";
  if (!lead.termsAccepted) return "Akkoord met de voorwaarden is nodig.";
  return "";
}

function buildLeadHtml(lead) {
  const rows = [
    ["Naam", lead.name],
    ["Bedrijfsnaam", lead.company || "-"],
    ["E-mailadres", lead.email],
    ["Telefoonnummer", lead.phone || "-"],
    ["Pakket / interesse", lead.packageInterest || "-"],
    ["Hosting & onderhoud", lead.carePackage || "-"],
    ["Akkoord voorwaarden", lead.termsAccepted ? "Ja" : "Nee"],
    ["Bron", lead.source],
    ["Datum/tijd", lead.submittedAt],
  ];

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.6">
      <h1 style="margin:0 0 16px;font-size:24px">Nieuwe aanvraag via Max Webstudio</h1>
      <p style="margin:0 0 22px">Er is een nieuwe aanvraag binnengekomen via het homepageformulier.</p>
      <table style="width:100%;border-collapse:collapse">
        <tbody>
          ${rows
            .map(
              ([label, value]) => `
                <tr>
                  <td style="padding:10px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;width:190px">${escapeHtml(label)}</td>
                  <td style="padding:10px 12px;border:1px solid #e2e8f0">${escapeHtml(value)}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <h2 style="margin:24px 0 8px;font-size:18px">Bericht</h2>
      <p style="white-space:pre-line;margin:0;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">${escapeHtml(lead.message)}</p>
    </div>
  `;
}

function buildLeadText(lead) {
  return [
    "Nieuwe aanvraag via Max Webstudio",
    "",
    `Naam: ${lead.name}`,
    `Bedrijfsnaam: ${lead.company || "-"}`,
    `E-mailadres: ${lead.email}`,
    `Telefoonnummer: ${lead.phone || "-"}`,
    `Pakket / interesse: ${lead.packageInterest || "-"}`,
    `Hosting & onderhoud: ${lead.carePackage || "-"}`,
    `Akkoord voorwaarden: ${lead.termsAccepted ? "Ja" : "Nee"}`,
    `Bron: ${lead.source}`,
    `Datum/tijd: ${lead.submittedAt}`,
    "",
    "Bericht:",
    lead.message,
  ].join("\n");
}

async function sendCustomerConfirmation(lead, context = {}) {
  try {
    const result = await (context.deliverEmail || sendEmail)({
      to: lead.email,
      from: process.env.LEAD_FROM_EMAIL || process.env.FROM_EMAIL || undefined,
      subject: "Bedankt voor je aanvraag bij Max Webstudio",
      html: buildCustomerConfirmationHtml(lead),
      text: buildCustomerConfirmationText(lead),
      templateKey: "lead_customer_confirmation",
      templateName: "Lead klantbevestiging",
      triggeredBy: "homepage_contact_form",
      leadId: context.leadId,
      idempotencyKey: `public-lead-confirmation:${context.requestId}`,
      metadata: {
        leadName: lead.name,
        company: lead.company,
        source: lead.source,
        packageInterest: lead.packageInterest,
      },
    });

    if (!result.sent) {
      console.error("Lead customer confirmation skipped", {
        email: lead.email,
        warning: result.warning || "Unknown email warning",
      });
    }

    return result;
  } catch (error) {
    console.error("Lead customer confirmation failed", {
      email: lead.email,
      message: error.message,
    });
    return { sent: false, warning: "Klantbevestiging kon niet worden verzonden." };
  }
}

exports.createHandler = createHandler;
exports._test = { sanitizeLead, validateLead };

function buildCustomerConfirmationHtml(lead) {
  const companySettings = getCompanySettings();
  const whatsappLink = getWhatsappLink(companySettings);
  const rows = [
    ["Naam", lead.name],
    ["Bedrijf", lead.company || "-"],
    ["E-mailadres", lead.email],
    ["Telefoonnummer", lead.phone || "-"],
    ["Gekozen pakket", lead.packageInterest || "-"],
    ["Hosting & onderhoud", lead.carePackage || "-"],
    ["Bericht", lead.message],
  ];

  return `
    <!doctype html>
    <html lang="nl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Bedankt voor je aanvraag bij Max Webstudio</title>
      </head>
      <body style="margin:0;padding:0;background:#f3f7fc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f7fc;">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;">
                <tr>
                  <td style="padding:0 0 18px;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:48px;height:48px;border-radius:14px;background:#06121f;text-align:center;vertical-align:middle;">
                          ${buildEmailLogo()}
                        </td>
                        <td style="padding-left:12px;font-size:18px;font-weight:900;color:#06121f;">Max Webstudio</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="border-radius:28px;background:#ffffff;border:1px solid #dbeafe;box-shadow:0 20px 60px rgba(15,23,42,0.10);overflow:hidden;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:34px 34px 24px;background:linear-gradient(135deg,#0b5cff,#19c2ff);color:#ffffff;">
                          <p style="margin:0 0 10px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-weight:900;">Aanvraag ontvangen</p>
                          <h1 style="margin:0;font-size:32px;line-height:1.08;">Bedankt voor je aanvraag!</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:30px 34px 10px;font-size:16px;line-height:1.7;color:#334155;">
                          <p style="margin:0 0 16px;">Hi ${escapeHtml(lead.name)},</p>
                          <p style="margin:0 0 16px;">Bedankt voor je aanvraag bij Max Webstudio.</p>
                          <p style="margin:0 0 16px;">We hebben jouw aanvraag goed ontvangen en nemen meestal binnen 24 uur persoonlijk contact met je op.</p>
                          <p style="margin:0;">Ondertussen kun je alvast onze demo-websites bekijken of ons direct een WhatsApp-bericht sturen.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:20px 34px 6px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #dbeafe;border-radius:18px;overflow:hidden;">
                            ${rows
                              .map(
                                ([label, value]) => `
                                  <tr>
                                    <td style="padding:13px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:900;width:190px;">${escapeHtml(label)}</td>
                                    <td style="padding:13px 16px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(value)}</td>
                                  </tr>`
                              )
                              .join("")}
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:24px 34px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="padding:0 12px 12px 0;">
                                <a href="https://maxwebstudio.nl/#projecten" style="display:inline-block;padding:14px 18px;border-radius:999px;background:#155eef;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;">Bekijk onze demo-websites</a>
                              </td>
                              <td style="padding:0 0 12px;">
                                <a href="${escapeHtml(whatsappLink)}" style="display:inline-block;padding:14px 18px;border-radius:999px;background:#ecfdf3;color:#047857;text-decoration:none;font-size:14px;font-weight:900;">WhatsApp Max Webstudio</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:18px 34px 34px;color:#334155;font-size:15px;line-height:1.7;">
                          <p style="margin:0;">Met vriendelijke groet,</p>
                          <p style="margin:8px 0 0;font-weight:900;color:#0f172a;">Max Webstudio</p>
                          <p style="margin:4px 0 0;color:#64748b;">Professionele websites sinds 2018.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function buildCustomerConfirmationText(lead) {
  const companySettings = getCompanySettings();
  return [
    "Bedankt voor je aanvraag!",
    "",
    `Hi ${lead.name},`,
    "",
    "Bedankt voor je aanvraag bij Max Webstudio.",
    "We hebben jouw aanvraag goed ontvangen en nemen meestal binnen 24 uur persoonlijk contact met je op.",
    "Ondertussen kun je alvast onze demo-websites bekijken of ons direct een WhatsApp-bericht sturen.",
    "",
    `Naam: ${lead.name}`,
    `Bedrijf: ${lead.company || "-"}`,
    `E-mailadres: ${lead.email}`,
    `Telefoonnummer: ${lead.phone || "-"}`,
    `Gekozen pakket: ${lead.packageInterest || "-"}`,
    `Hosting & onderhoud: ${lead.carePackage || "-"}`,
    "",
    "Bericht:",
    lead.message,
    "",
    "Demo-websites: https://maxwebstudio.nl/#projecten",
    `WhatsApp Max Webstudio: ${getWhatsappLink(companySettings)}`,
    "",
    "Met vriendelijke groet,",
    "Max Webstudio",
    "Professionele websites sinds 2018.",
  ].join("\n");
}

function buildEmailLogo() {
  return `
    <svg width="32" height="32" viewBox="0 0 80 80" role="img" aria-label="Max Webstudio logo" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="68" height="68" rx="18" fill="#06121f"/>
      <path d="M22 53V27h7.3L40 42.2 50.7 27H58v26h-8.1V39.1l-7.5 10.2h-4.8l-7.5-10.2V53H22Z" fill="#ffffff"/>
      <path d="M58 25h9v9" fill="none" stroke="#19c2ff" stroke-width="4" stroke-linecap="round"/>
    </svg>
  `;
}

function cleanText(value, maxLength = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
