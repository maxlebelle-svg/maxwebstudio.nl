const { sendEmail } = require("./email");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const categoryLabels = {
  "tekst-aanpassen": "Tekst aanpassen",
  "foto-vervangen": "Foto vervangen",
  "nieuwe-pagina": "Nieuwe pagina",
  "nieuwe-dienst": "Nieuwe dienst",
  "blog-toevoegen": "Blog toevoegen",
  "contactgegevens-wijzigen": "Contactgegevens wijzigen",
  seo: "SEO",
  snelheidsverbetering: "Snelheidsverbetering",
  overig: "Overig",
};

const carePlanLabels = {
  basis: "Basis",
  plus: "Plus",
  premium: "Premium",
};

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

  const clean = sanitizeObject(payload);

  if (clean.websiteUrl) {
    return jsonResponse(200, { success: true, skipped: true });
  }

  const validationError = validate(clean);

  if (validationError) {
    return jsonResponse(400, { success: false, error: validationError });
  }

  const changeRequest = buildChangeRequest(clean);
  const adminResult = await sendAdminEmail(changeRequest);

  if (!adminResult.sent) {
    return jsonResponse(500, {
      success: false,
      error: "Het wijzigingsverzoek kon niet worden verstuurd. Probeer het later opnieuw of neem contact op.",
    });
  }

  const customerResult = await sendCustomerEmail(changeRequest);

  return jsonResponse(200, {
    success: true,
    warning: customerResult.warning || undefined,
  });
};

function buildChangeRequest(clean) {
  const category = categoryLabels[clean.changeCategory] || clean.changeCategory;
  const priority = clean.priority === "hoog" ? "Hoog" : "Normaal";
  const carePlan = carePlanLabels[clean.carePlan] || clean.carePlan;
  const fileNames = toArray(clean.fileNames)
    .map((name) => cleanText(name).slice(0, 180))
    .filter(Boolean)
    .slice(0, 12);

  return {
    submittedAt: new Date().toISOString(),
    firstName: clean.firstName,
    lastName: clean.lastName,
    customerName: `${clean.firstName} ${clean.lastName}`.trim(),
    companyName: clean.companyName,
    email: clean.email.toLowerCase(),
    phone: clean.phone,
    website: clean.website,
    carePlan,
    changeCategory: category,
    priority,
    changeTitle: clean.changeTitle,
    changeDescription: clean.changeDescription,
    fileNames,
    classification: classifyChangeRequest(clean.changeCategory, clean.priority),
  };
}

function classifyChangeRequest(category, priority) {
  if (priority === "hoog" || category === "overig") {
    return "Handmatig beoordelen";
  }

  if (["tekst-aanpassen", "foto-vervangen", "contactgegevens-wijzigen"].includes(category)) {
    return "Waarschijnlijk binnen onderhoud";
  }

  if (["nieuwe-pagina", "nieuwe-dienst", "blog-toevoegen", "seo", "snelheidsverbetering"].includes(category)) {
    return "Waarschijnlijk offerte nodig";
  }

  return "Handmatig beoordelen";
}

async function sendAdminEmail(changeRequest) {
  return sendEmail({
    to: process.env.ADMIN_EMAIL || "info@maxwebstudio.nl",
    subject: "Nieuw wijzigingsverzoek via Max Web Studio",
    html: buildEmailHtml("Nieuw wijzigingsverzoek via Max Web Studio", [
      ["Interne classificatie", changeRequest.classification],
      ["Naam klant", changeRequest.customerName],
      ["Bedrijfsnaam", changeRequest.companyName],
      ["E-mailadres", changeRequest.email],
      ["Telefoonnummer", changeRequest.phone],
      ["Website", changeRequest.website],
      ["Onderhoudspakket", changeRequest.carePlan],
      ["Categorie wijziging", changeRequest.changeCategory],
      ["Prioriteit", changeRequest.priority],
      ["Titel", changeRequest.changeTitle],
      ["Omschrijving", changeRequest.changeDescription],
      ["Bestandsnamen", changeRequest.fileNames.length ? changeRequest.fileNames.join("\n") : "Geen bestanden gekozen"],
      ["Datum/tijd", changeRequest.submittedAt],
    ]),
    text: plainTextSummary(changeRequest),
  });
}

async function sendCustomerEmail(changeRequest) {
  return sendEmail({
    to: changeRequest.email,
    subject: "Wijzigingsverzoek ontvangen - Max Webstudio",
    html: buildEmailHtml("Wijzigingsverzoek ontvangen - Max Webstudio", [
      ["Bericht", `Beste ${changeRequest.firstName},\n\nWe hebben je wijzigingsverzoek ontvangen. Max Web Studio bekijkt de aanvraag en neemt indien nodig contact met je op.`],
      ["Bedrijfsnaam", changeRequest.companyName],
      ["Website", changeRequest.website],
      ["Categorie", changeRequest.changeCategory],
      ["Prioriteit", changeRequest.priority],
      ["Titel", changeRequest.changeTitle],
      ["Bestandsnamen", changeRequest.fileNames.length ? changeRequest.fileNames.join("\n") : "Geen bestanden gekozen"],
      ["Belangrijk", "Bestanden worden in deze eerste versie nog niet meegestuurd. De gekozen bestandsnamen zijn wel vastgelegd in je aanvraag."],
      ["Contact", "Vragen? Mail naar info@maxwebstudio.nl."],
    ]),
    text: `Beste ${changeRequest.firstName},\n\nWe hebben je wijzigingsverzoek ontvangen.\n\n${plainTextSummary(changeRequest)}\n\nBestanden worden in deze eerste versie nog niet meegestuurd. De gekozen bestandsnamen zijn wel vastgelegd in je aanvraag.\n\nMet vriendelijke groet,\nMax Webstudio`,
  });
}

function plainTextSummary(changeRequest) {
  return [
    `Interne classificatie: ${changeRequest.classification}`,
    `Naam klant: ${changeRequest.customerName}`,
    `Bedrijfsnaam: ${changeRequest.companyName}`,
    `E-mailadres: ${changeRequest.email}`,
    `Telefoonnummer: ${changeRequest.phone}`,
    `Website: ${changeRequest.website}`,
    `Onderhoudspakket: ${changeRequest.carePlan}`,
    `Categorie wijziging: ${changeRequest.changeCategory}`,
    `Prioriteit: ${changeRequest.priority}`,
    `Titel: ${changeRequest.changeTitle}`,
    `Omschrijving: ${changeRequest.changeDescription}`,
    `Bestandsnamen: ${changeRequest.fileNames.length ? changeRequest.fileNames.join(", ") : "Geen bestanden gekozen"}`,
    `Datum/tijd: ${changeRequest.submittedAt}`,
  ].join("\n");
}

function buildEmailHtml(title, rows) {
  const bodyRows = rows
    .map(([label, value]) => `<tr><th style="vertical-align:top;text-align:left;width:220px;padding:10px 12px;border-top:1px solid #dce4ed;color:#5b6573;">${escapeHtml(label)}</th><td style="padding:10px 12px;border-top:1px solid #dce4ed;white-space:pre-line;">${escapeHtml(value || "Niet ingevuld")}</td></tr>`)
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f6f8fb;font-family:Inter,Arial,sans-serif;color:#06121f;">
    <div style="max-width:760px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid #dce4ed;border-radius:12px;padding:28px;">
        <p style="margin:0 0 10px;color:#155eef;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">Max Webstudio</p>
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.1;">${escapeHtml(title)}</h1>
        <table style="width:100%;border-collapse:collapse;">${bodyRows}</table>
      </div>
    </div>
  </body></html>`;
}

function validate(payload) {
  if (!payload.firstName) return "Vul je voornaam in.";
  if (!payload.lastName) return "Vul je achternaam in.";
  if (!payload.companyName) return "Vul je bedrijfsnaam in.";
  if (!emailPattern.test(payload.email || "")) return "Vul een geldig e-mailadres in.";
  if (!payload.phone) return "Vul je telefoonnummer in.";
  if (!payload.website) return "Vul je website in.";
  if (!payload.carePlan || !carePlanLabels[payload.carePlan]) return "Kies een geldig onderhoudspakket.";
  if (!payload.changeCategory || !categoryLabels[payload.changeCategory]) return "Kies een geldige categorie.";
  if (!["normaal", "hoog"].includes(payload.priority)) return "Kies een geldige prioriteit.";
  if (!payload.changeTitle) return "Vul de titel van de wijziging in.";
  if (!payload.changeDescription) return "Vul de omschrijving van de wijziging in.";
  if (!payload.confirmed) return "Bevestig dat de informatie correct is.";
  return "";
}

function sanitizeObject(value) {
  if (Array.isArray(value)) return value.map(sanitizeObject).slice(0, 20);
  if (value && typeof value === "object") {
    const allowedKeys = new Set([
      "firstName",
      "lastName",
      "companyName",
      "email",
      "phone",
      "website",
      "carePlan",
      "changeCategory",
      "priority",
      "changeTitle",
      "changeDescription",
      "fileNames",
      "confirmed",
      "websiteUrl",
    ]);

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => allowedKeys.has(key))
        .map(([key, item]) => [key, sanitizeObject(item)])
    );
  }
  return typeof value === "string" ? value.trim().slice(0, 5000) : value;
}

function cleanText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
