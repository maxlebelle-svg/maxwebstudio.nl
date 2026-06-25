const crypto = require("crypto");
const { sendEmail } = require("./email");
const { saveIntake } = require("./intake-storage");

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

  const clean = sanitizeObject(payload);
  const validationError = validate(clean);

  if (validationError) {
    return jsonResponse(400, { success: false, error: validationError });
  }

  const intake = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    companyName: clean.companyName,
    contactName: clean.contactName,
    email: clean.email.toLowerCase(),
    phone: clean.phone,
    website: clean.website || "",
    industry: clean.industry,
    city: clean.city,
    goals: toArray(clean.goals),
    goalExplanation: clean.goalExplanation || "",
    pages: toArray(clean.pages),
    stylePreferences: toArray(clean.stylePreferences),
    colorPreference: clean.colorPreference || "",
    inspirationWebsites: clean.inspirationWebsites || "",
    dislikedWebsites: clean.dislikedWebsites || "",
    styleNotes: clean.styleNotes || "",
    logoStatus: clean.logoStatus || "",
    photoStatus: clean.photoStatus || "",
    textStatus: clean.textStatus || "",
    contentNotes: clean.contentNotes || "",
    desiredStartDate: clean.desiredStartDate || "",
    desiredLaunchDate: clean.desiredLaunchDate || "",
    urgency: clean.urgency || "",
    bestContactMoment: clean.bestContactMoment || "",
    notes: clean.notes || "",
    metadata: clean.metadata || {},
    status: "new_intake",
  };

  await saveIntake(intake);

  const emailResults = await sendIntakeEmails(intake);
  const warning = emailResults.find((result) => result.warning)?.warning || "";

  return jsonResponse(200, {
    success: true,
    intakeId: intake.id,
    warning: warning || undefined,
  });
};

async function sendIntakeEmails(intake) {
  const adminEmail = process.env.ADMIN_EMAIL || "info@maxwebstudio.nl";
  const adminHtml = buildEmailHtml(`Nieuwe project intake - ${intake.companyName}`, [
    ["Contactpersoon", intake.contactName],
    ["Bedrijfsnaam", intake.companyName],
    ["E-mail", intake.email],
    ["Telefoon", intake.phone],
    ["Websitepakket", intake.metadata.website || "Niet meegegeven"],
    ["Onderhoudskeuze", intake.metadata.care || "Niet meegegeven"],
    ["Branche", intake.industry],
    ["Vestigingsplaats", intake.city],
    ["Huidige website", intake.website],
    ["Doelen", intake.goals.join(", ")],
    ["Toelichting doel", intake.goalExplanation],
    ["Pagina’s", intake.pages.join(", ")],
    ["Stijl", intake.stylePreferences.join(", ")],
    ["Kleurenvoorkeur", intake.colorPreference],
    ["Inspiratie websites", intake.inspirationWebsites],
    ["Niet mooi", intake.dislikedWebsites],
    ["Logo", intake.logoStatus],
    ["Foto’s", intake.photoStatus],
    ["Teksten", intake.textStatus],
    ["Content toelichting", intake.contentNotes],
    ["Gewenste startdatum", intake.desiredStartDate],
    ["Gewenste livegang", intake.desiredLaunchDate],
    ["Urgentie", intake.urgency],
    ["Beste contactmoment", intake.bestContactMoment],
    ["Extra opmerkingen", intake.notes],
    ["Datum/tijd inzending", intake.createdAt],
  ]);

  const customerHtml = buildCustomerEmail(intake);

  const adminResult = await sendEmail({
    to: adminEmail,
    subject: `Nieuwe project intake - ${intake.companyName}`,
    html: adminHtml,
    text: plainTextSummary(intake),
  });

  const customerResult = await sendEmail({
    to: intake.email,
    subject: "Project intake ontvangen - Max Webstudio",
    html: customerHtml,
    text: `Beste ${intake.contactName},\n\nBedankt voor je project intake. Max Webstudio heeft je gegevens ontvangen en neemt zo snel mogelijk contact met je op.\n\n${plainTextSummary(intake)}\n\nVragen? Mail naar info@maxwebstudio.nl.\n\nMet vriendelijke groet,\nMax Webstudio`,
  });

  return [adminResult, customerResult];
}

function buildCustomerEmail(intake) {
  return buildEmailHtml("Project intake ontvangen - Max Webstudio", [
    ["Bericht", `Beste ${intake.contactName},\n\nBedankt voor je intake. We hebben je projectinformatie ontvangen en nemen zo snel mogelijk contact met je op.`],
    ["Bedrijfsnaam", intake.companyName],
    ["Websitepakket", intake.metadata.website || "Niet meegegeven"],
    ["Onderhoudskeuze", intake.metadata.care || "Niet meegegeven"],
    ["Doelen", intake.goals.join(", ")],
    ["Pagina’s", intake.pages.join(", ")],
    ["Stijl", intake.stylePreferences.join(", ")],
    ["Planning", `${intake.desiredStartDate || "Geen startdatum"} / ${intake.desiredLaunchDate || "Geen livegang"}`],
    ["Contact", "Vragen? Mail naar info@maxwebstudio.nl."],
    ["Afsluiting", "Met vriendelijke groet,\nMax Webstudio"],
  ]);
}

function buildEmailHtml(title, rows) {
  const bodyRows = rows
    .map(([label, value]) => `<tr><th style="vertical-align:top;text-align:left;width:210px;padding:10px 12px;border-top:1px solid #dce4ed;color:#5b6573;">${escapeHtml(label)}</th><td style="padding:10px 12px;border-top:1px solid #dce4ed;white-space:pre-line;">${escapeHtml(value || "Niet ingevuld")}</td></tr>`)
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f6f8fb;font-family:Inter,Arial,sans-serif;color:#06121f;">
    <div style="max-width:720px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid #dce4ed;border-radius:12px;padding:28px;">
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.1;">${escapeHtml(title)}</h1>
        <table style="width:100%;border-collapse:collapse;">${bodyRows}</table>
      </div>
    </div>
  </body></html>`;
}

function plainTextSummary(intake) {
  return [
    `Contactpersoon: ${intake.contactName}`,
    `Bedrijfsnaam: ${intake.companyName}`,
    `E-mail: ${intake.email}`,
    `Telefoon: ${intake.phone}`,
    `Websitepakket: ${intake.metadata.website || "Niet meegegeven"}`,
    `Onderhoudskeuze: ${intake.metadata.care || "Niet meegegeven"}`,
    `Doelen: ${intake.goals.join(", ")}`,
    `Pagina's: ${intake.pages.join(", ")}`,
    `Stijl: ${intake.stylePreferences.join(", ")}`,
    `Ingezonden: ${intake.createdAt}`,
  ].join("\n");
}

function validate(payload) {
  if (!payload.companyName) return "Vul de bedrijfsnaam in.";
  if (!payload.contactName) return "Vul de contactpersoon in.";
  if (!emailPattern.test(payload.email || "")) return "Vul een geldig e-mailadres in.";
  if (!payload.phone) return "Vul het telefoonnummer in.";
  if (!payload.industry) return "Vul de branche in.";
  if (!payload.city) return "Vul de vestigingsplaats in.";
  if (!payload.confirmed) return "Bevestig dat Max Webstudio deze gegevens mag gebruiken.";
  return "";
}

function sanitizeObject(value) {
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeObject(item)]));
  }
  return typeof value === "string" ? value.trim().slice(0, 3000) : value;
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
