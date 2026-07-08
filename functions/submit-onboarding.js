const crypto = require("crypto");
const { sendEmail } = require("./email");
const { getCompanySettings, getMailtoLink } = require("./company-settings");
const { saveIntake } = require("./intake-storage");
const { createTimelineEvent } = require("./services/timelineService");

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

  const intake = buildIntake(clean);

  await saveIntake(withoutUploads(intake));
  await safeCreateTimeline({
    eventType: "onboarding_submitted",
    title: `Onboarding ingestuurd: ${intake.companyName}`,
    description: `${intake.contactName} heeft de project intake ingestuurd.`,
    module: "onboarding",
    referenceType: "intake",
    referenceId: intake.id,
    actorName: intake.contactName,
    actorRole: "customer",
    icon: "✅",
    severity: "success",
    metadata: {
      dedupeKey: `onboarding_submitted:${intake.id}`,
      companyName: intake.companyName,
      customerEmail: intake.email,
      websitePackage: intake.metadata.website || "",
      carePackage: intake.metadata.care || "",
    },
  });

  const emailResults = await sendIntakeEmails(intake);
  const warning = emailResults.find((result) => result.warning)?.warning || "";

  return jsonResponse(200, {
    success: true,
    intakeId: intake.id,
    warning: warning || undefined,
  });
};

async function safeCreateTimeline(input) {
  try {
    return await createTimelineEvent(input);
  } catch (error) {
    console.error("Onboarding timeline event failed", { message: error.message });
    return null;
  }
}

function buildIntake(clean) {
  const upsells = toArray(clean.upsells).map((item) => ({
    name: cleanText(item.name),
    priceExVat: Number(item.priceExVat || 0),
  }));
  const uploadAttachments = prepareAttachments(clean.uploadAttachments);
  const { uploadAttachments: _removedUploads, ...allWizardAnswers } = clean;

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    companyName: clean.companyName,
    contactName: clean.contactName,
    email: clean.businessEmail.toLowerCase(),
    businessEmail: clean.businessEmail.toLowerCase(),
    phone: clean.phone,
    industry: clean.industry,
    businessDescription: clean.businessDescription,
    website: clean.website || "",
    socialLinks: clean.socialLinks || "",
    city: clean.city,
    metadata: clean.metadata || {},
    logoChoice: clean.logoChoice || "",
    logoService: Boolean(clean.logoService),
    logoDescription: clean.logoDescription || "",
    logoCompanyName: clean.logoCompanyName || "",
    logoSlogan: clean.logoSlogan || "",
    logoColors: clean.logoColors || "",
    logoStyle: clean.logoStyle || "",
    logoInspiration: clean.logoInspiration || "",
    logoFiles: toArray(clean.logoFiles),
    brandStyle: toArray(clean.brandStyle),
    favoriteColors: clean.favoriteColors || "",
    blockedColors: clean.blockedColors || "",
    inspirationWebsites: clean.inspirationWebsites || "",
    dislikedWebsites: clean.dislikedWebsites || "",
    styleNotes: clean.styleNotes || "",
    pages: toArray(clean.pages),
    extraPagesCount: Number(clean.extraPagesCount || 0),
    extraPagesDescription: clean.extraPagesDescription || "",
    textChoice: clean.textChoice || "",
    copywritingService: Boolean(clean.copywritingService),
    mainServices: clean.mainServices || "",
    targetAudience: clean.targetAudience || "",
    uniqueSellingPoints: clean.uniqueSellingPoints || "",
    toneOfVoice: clean.toneOfVoice || "",
    photoChoice: clean.photoChoice || "",
    photographyService: Boolean(clean.photographyService),
    photoFiles: uploadAttachments.map((attachment) => attachment.filename),
    photoWishes: clean.photoWishes || "",
    photoLocation: clean.photoLocation || "",
    mediaInspiration: clean.mediaInspiration || "",
    extraFeatures: toArray(clean.extraFeatures),
    extraFeatureUpsells: toArray(clean.extraFeatureUpsells),
    upsells,
    estimatedExtraValueExVat: Number(clean.estimatedExtraValueExVat || upsells.reduce((total, item) => total + item.priceExVat, 0)),
    planning: {
      desiredStartDate: clean.planning?.desiredStartDate || clean.desiredStartDate || "",
      desiredLaunchDate: clean.planning?.desiredLaunchDate || clean.desiredLaunchDate || "",
      urgency: clean.planning?.urgency || clean.urgency || "",
      bestContactMoment: clean.planning?.bestContactMoment || clean.bestContactMoment || "",
      wantsIntakeCall: clean.planning?.wantsIntakeCall || clean.wantsIntakeCall || "",
    },
    notes: clean.notes || "",
    allWizardAnswers,
    uploadAttachments,
    status: "new_intake",
  };
}

async function sendIntakeEmails(intake) {
  const companySettings = getCompanySettings();
  const adminEmail = process.env.ADMIN_EMAIL || companySettings.primaryEmail;
  const adminHtml = buildAdminEmail(intake);
  const customerHtml = buildCustomerEmail(intake);

  const adminResult = await sendEmail({
    to: adminEmail,
    subject: `Nieuwe project intake - ${intake.companyName}`,
    html: adminHtml,
    text: plainTextSummary(intake),
    attachments: intake.uploadAttachments,
    templateKey: "project_intake_admin",
    templateName: "Project intake adminnotificatie",
    triggeredBy: "onboarding_form",
    metadata: {
      intakeId: intake.id,
      companyName: intake.companyName,
      contactName: intake.contactName,
      customerEmail: intake.email,
      websitePackage: intake.metadata.website || "",
      carePackage: intake.metadata.care || "",
    },
  });

  const customerResult = await sendEmail({
    to: intake.email,
    subject: "Project intake ontvangen - Max Webstudio",
    html: customerHtml,
    text: `Beste ${intake.contactName},\n\nBedankt voor je project intake. ${companySettings.companyName} heeft je gegevens ontvangen en neemt zo snel mogelijk contact met je op.\n\nExtra opties worden nog niet automatisch afgerekend. We stemmen dit netjes met je af.\n\n${plainTextSummary(intake)}\n\nVragen? Mail naar ${companySettings.primaryEmail}.\n\nMet vriendelijke groet,\n${companySettings.companyName}`,
    templateKey: "project_intake_customer_confirmation",
    templateName: "Project intake klantbevestiging",
    triggeredBy: "onboarding_form",
    metadata: {
      intakeId: intake.id,
      companyName: intake.companyName,
      contactName: intake.contactName,
      websitePackage: intake.metadata.website || "",
      carePackage: intake.metadata.care || "",
    },
  });

  return [adminResult, customerResult];
}

function buildAdminEmail(intake) {
  return buildEmailHtml(`Nieuwe project intake - ${intake.companyName}`, [
    ["Snelle samenvatting", adminSummary(intake)],
    ["Geschatte extra waarde", `€${intake.estimatedExtraValueExVat} excl. btw`],
    ["Gekozen upsells", formatUpsells(intake.upsells)],
    ["Contactpersoon", intake.contactName],
    ["Bedrijfsnaam", intake.companyName],
    ["E-mail", intake.email],
    ["Telefoon", intake.phone],
    ["Websitepakket", intake.metadata.website || "Niet meegegeven"],
    ["Onderhoudskeuze", intake.metadata.care || "Niet meegegeven"],
    ["Branche", intake.industry],
    ["Vestigingsplaats", intake.city],
    ["Bedrijfsomschrijving", intake.businessDescription],
    ["Huidige website", intake.website],
    ["Social links", intake.socialLinks],
    ["Logo keuze", intake.logoChoice],
    ["Logo service", intake.logoService ? "Ja, nieuw logo ontwerpen" : "Nee"],
    ["Logo omschrijving", intake.logoDescription],
    ["Logo details", [intake.logoCompanyName, intake.logoSlogan, intake.logoColors, intake.logoStyle, intake.logoInspiration].filter(Boolean).join("\n")],
    ["Logo bestandnamen", intake.logoFiles.join(", ")],
    ["Huisstijl", intake.brandStyle.join(", ")],
    ["Kleuren", `Favoriet: ${intake.favoriteColors || "-"}\nNiet gebruiken: ${intake.blockedColors || "-"}`],
    ["Inspiratie websites", intake.inspirationWebsites],
    ["Niet mooi", intake.dislikedWebsites],
    ["Stijl opmerkingen", intake.styleNotes],
    ["Pagina's", intake.pages.join(", ")],
    ["Extra pagina's", `${intake.extraPagesCount} - ${intake.extraPagesDescription || ""}`],
    ["Teksten", intake.textChoice],
    ["Copywriting service", intake.copywritingService ? "Ja" : "Nee"],
    ["Diensten/doelgroep/USP", [intake.mainServices, intake.targetAudience, intake.uniqueSellingPoints, intake.toneOfVoice].filter(Boolean).join("\n")],
    ["Foto's", intake.photoChoice],
    ["Geüploade foto's", intake.photoFiles.join(", ")],
    ["Fotografie service", intake.photographyService ? "Ja" : "Nee"],
    ["Fotowensen", [intake.photoWishes, intake.photoLocation, intake.mediaInspiration].filter(Boolean).join("\n")],
    ["Extra functies", intake.extraFeatures.join(", ")],
    ["Planning", formatPlanning(intake.planning)],
    ["Extra opmerkingen", intake.notes],
    ["Datum/tijd inzending", intake.createdAt],
  ]);
}

function buildCustomerEmail(intake) {
  const companySettings = getCompanySettings();
  return buildEmailHtml("Project intake ontvangen - Max Webstudio", [
    ["Bericht", `Beste ${intake.contactName},\n\nBedankt voor je intake. We hebben je projectinformatie ontvangen en nemen zo snel mogelijk contact met je op.`],
    ["Bedrijfsnaam", intake.companyName],
    ["Websitepakket", intake.metadata.website || "Niet meegegeven"],
    ["Onderhoudskeuze", intake.metadata.care || "Niet meegegeven"],
    ["Logo keuze", intake.logoChoice],
    ["Huisstijl", intake.brandStyle.join(", ")],
    ["Pagina's", intake.pages.join(", ")],
    ["Teksten", intake.textChoice],
    ["Foto's", intake.photoChoice],
    ["Geüploade foto's", intake.photoFiles.join(", ")],
    ["Extra functies", intake.extraFeatures.join(", ")],
    ["Extra opties", formatUpsells(intake.upsells)],
    ["Geschatte extra waarde", `€${intake.estimatedExtraValueExVat} excl. btw`],
    ["Belangrijk", `Extra opties worden nog niet automatisch afgerekend. ${companySettings.companyName} neemt deze mee in de definitieve projectafstemming.`],
    ["Planning", formatPlanning(intake.planning)],
    ["Contact", `Vragen? Mail naar ${companySettings.primaryEmail} of gebruik ${getMailtoLink(companySettings, "Vraag over project intake")}.`],
    ["Afsluiting", `Met vriendelijke groet,\n${companySettings.companyName}`],
  ]);
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

function adminSummary(intake) {
  return [
    `${intake.companyName} uit ${intake.city}`,
    `Pakket: ${intake.metadata.website || "Niet meegegeven"}`,
    `Onderhoud: ${intake.metadata.care || "Niet meegegeven"}`,
    `Upsells: ${intake.upsells.length ? intake.upsells.length : "geen"}`,
    `Extra waarde: €${intake.estimatedExtraValueExVat} excl. btw`,
  ].join("\n");
}

function plainTextSummary(intake) {
  return [
    `Contactpersoon: ${intake.contactName}`,
    `Bedrijfsnaam: ${intake.companyName}`,
    `E-mail: ${intake.email}`,
    `Telefoon: ${intake.phone}`,
    `Websitepakket: ${intake.metadata.website || "Niet meegegeven"}`,
    `Onderhoudskeuze: ${intake.metadata.care || "Niet meegegeven"}`,
    `Logo keuze: ${intake.logoChoice}`,
    `Huisstijl: ${intake.brandStyle.join(", ")}`,
    `Pagina's: ${intake.pages.join(", ")}`,
    `Extra functies: ${intake.extraFeatures.join(", ")}`,
    `Upsells: ${formatUpsells(intake.upsells)}`,
    `Geschatte extra waarde: €${intake.estimatedExtraValueExVat} excl. btw`,
    `Ingezonden: ${intake.createdAt}`,
  ].join("\n");
}

function formatUpsells(upsells) {
  if (!upsells.length) return "Geen extra opties gekozen";
  return upsells.map((upsell) => `${upsell.name} (€${upsell.priceExVat} excl. btw)`).join("\n");
}

function formatPlanning(planning) {
  return [
    `Startdatum: ${planning.desiredStartDate || "Niet ingevuld"}`,
    `Livegang: ${planning.desiredLaunchDate || "Niet ingevuld"}`,
    `Urgentie: ${planning.urgency || "Niet ingevuld"}`,
    `Contactmoment: ${planning.bestContactMoment || "Niet ingevuld"}`,
    `Intakegesprek: ${planning.wantsIntakeCall || "Niet ingevuld"}`,
  ].join("\n");
}

function prepareAttachments(value) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  return toArray(value)
    .slice(0, 5)
    .filter((item) => item && allowedTypes.has(item.contentType) && Number(item.size || 0) <= 2.5 * 1024 * 1024)
    .map((item) => ({
      filename: cleanText(item.filename).slice(0, 180) || "foto-upload",
      content: cleanText(item.content),
      content_type: item.contentType,
    }))
    .filter((item) => item.content);
}

function withoutUploads(intake) {
  const { uploadAttachments: _removedUploads, ...safeIntake } = intake;
  return safeIntake;
}

function validate(payload) {
  if (!payload.companyName) return "Vul de bedrijfsnaam in.";
  if (!payload.contactName) return "Vul de contactpersoon in.";
  if (!emailPattern.test(payload.businessEmail || payload.email || "")) return "Vul een geldig zakelijk e-mailadres in.";
  if (!payload.phone) return "Vul het telefoonnummer in.";
  if (!payload.industry) return "Vul de branche in.";
  if (!payload.city) return "Vul de vestigingsplaats in.";
  if (!payload.businessDescription) return "Vul een korte bedrijfsomschrijving in.";
  if (!payload.logoChoice) return "Kies een logo-optie.";
  if (!payload.textChoice) return "Kies een tekstoptie.";
  if (!payload.photoChoice) return "Kies een foto-optie.";
  if (!payload.confirmed) return "Bevestig dat Max Webstudio deze gegevens mag gebruiken.";
  return "";
}

function sanitizeObject(value) {
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeObject(item)]));
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
