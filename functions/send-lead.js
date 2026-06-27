const { sendEmail } = require("./email");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
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
    const result = await sendEmail({
      to: process.env.LEAD_TO_EMAIL || process.env.ADMIN_EMAIL || "info@maxwebstudio.nl",
      from: process.env.LEAD_FROM_EMAIL || process.env.FROM_EMAIL || undefined,
      replyTo: lead.email,
      subject: `Nieuwe aanvraag Max Webstudio - ${lead.packageInterest} - ${lead.name}`,
      html: buildLeadHtml(lead),
      text: buildLeadText(lead),
    });

    if (!result.sent) {
      return jsonResponse(502, {
        success: false,
        error: "Aanvraag is ontvangen, maar e-mail kon niet worden verzonden.",
        warning: result.warning,
      });
    }

    return jsonResponse(200, { success: true });
  } catch (error) {
    console.error("Lead email failed", { message: error.message });
    return jsonResponse(500, { success: false, error: "Aanvraag kon niet worden verzonden." });
  }
};

function sanitizeLead(payload) {
  return {
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
