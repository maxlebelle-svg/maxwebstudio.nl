const crypto = require("crypto");
const { normalizePreviewSource, PREVIEW_SOURCES } = require("./_demo-preview-source");

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIVE_STATUSES = new Set(["active", "opened"]);

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return clean(value).toLowerCase();
}

function firstName(value = "") {
  return clean(value).split(/\s+/)[0] || "daar";
}

function previewSourceFromJourney(journey = {}) {
  const previewPackage = journey.preview_package && typeof journey.preview_package === "object" ? journey.preview_package : {};
  const saved = previewPackage.savedDemoSite || previewPackage.saved_demo_site || {};
  return normalizePreviewSource(saved.previewSource || saved.preview_source || previewPackage.activePreviewSource || previewPackage.previewSource);
}

function invitationStatus(link = null, invitation = null, now = Date.now()) {
  if (!link?.id) return "niet_uitgenodigd";
  if (link.status === "activated" || invitation?.status === "activated") return "geactiveerd";
  if (link.status === "revoked" || link.status === "rotated" || invitation?.status === "revoked") return "ingetrokken";
  if (link.status === "expired" || new Date(link.expires_at).getTime() <= now) return "verlopen";
  if (link.status === "opened" || link.opened_at) return "geopend";
  return "gereed";
}

function assertEligibility({ journey, lead, preview, publication, customer, project, profile, email }) {
  if (!journey?.id || !lead?.id || clean(journey.lead_id) !== clean(lead.id)) throw eligibilityError("LEAD_JOURNEY_MISMATCH", "Deze demo is niet eenduidig aan een lead gekoppeld.");
  const normalizedEmail = normalizeEmail(email || journey.email || lead.email);
  if (!EMAIL_PATTERN.test(normalizedEmail)) throw eligibilityError("INVALID_EMAIL", "Vul een geldig e-mailadres in.");
  if (normalizeEmail(lead.email || journey.email) !== normalizedEmail) throw eligibilityError("EMAIL_OWNERSHIP_MISMATCH", "Het e-mailadres hoort niet eenduidig bij deze lead.");
  if (!preview?.id || clean(preview.demo_journey_id) !== clean(journey.id)) throw eligibilityError("PREVIEW_JOURNEY_MISMATCH", "De previewversie hoort niet bij deze demo.");
  if (!publication?.id || publication.enabled !== true || publication.revoked_at) throw eligibilityError("PUBLICATION_INACTIVE", "Er is geen actieve previewpublicatie voor deze demo.");
  if (clean(publication.preview_version_id) !== clean(preview.id)) throw eligibilityError("PUBLICATION_PREVIEW_MISMATCH", "De publicatie wijst niet naar de gekozen previewversie.");
  const source = previewSourceFromJourney(journey);
  if (![PREVIEW_SOURCES.MANUAL, PREVIEW_SOURCES.FACTORY].includes(source)) throw eligibilityError("PREVIEW_SOURCE_UNPROVEN", "Kies aantoonbaar een ZIP- of Factory-preview.");

  const convertedCustomerId = clean(lead.converted_customer_id);
  if (clean(preview.project_id) && !project?.id) throw eligibilityError("PROJECT_ORPHAN", "Het gekoppelde previewproject bestaat niet.");
  if (convertedCustomerId) {
    if (!customer?.id || clean(customer.id) !== convertedCustomerId) throw eligibilityError("CUSTOMER_MISMATCH", "De geconverteerde klantrelatie is niet eenduidig.");
    if (clean(journey.customer_id) && clean(journey.customer_id) !== convertedCustomerId) throw eligibilityError("JOURNEY_CUSTOMER_MISMATCH", "De demo hoort bij een andere klant.");
    if (clean(preview.customer_id) && clean(preview.customer_id) !== convertedCustomerId) throw eligibilityError("PREVIEW_CUSTOMER_MISMATCH", "De preview hoort bij een andere klant.");
    if (project?.id && clean(project.customer_id) !== convertedCustomerId) throw eligibilityError("PROJECT_CUSTOMER_MISMATCH", "Het project hoort bij een andere klant.");
    if (publication.relationship_type !== "customer" || clean(publication.relationship_id) !== convertedCustomerId) throw eligibilityError("PUBLICATION_CUSTOMER_MISMATCH", "De publicatie hoort niet bij de geconverteerde klant.");
  } else {
    if (clean(journey.customer_id) || clean(preview.customer_id) || publication.relationship_type !== "lead" || clean(publication.relationship_id) !== clean(lead.id)) {
      throw eligibilityError("AMBIGUOUS_OWNERSHIP", "De ownership van deze lead-demo is niet eenduidig.");
    }
    if (profile && clean(profile.role) !== "demo_user") throw eligibilityError("PROVISIONAL_PROFILE_MISMATCH", "Een nieuwe lead vereist een geïsoleerd demo-profiel.");
  }
  return { normalizedEmail, source, customerId: convertedCustomerId, projectId: clean(preview.project_id || project?.id) };
}

function activationUrl(origin, path) {
  const safeOrigin = clean(origin).replace(/\/$/, "");
  if (!safeOrigin || !/^https?:\/\//i.test(safeOrigin) || !/^\/start\/[0-9a-f]{64}$/.test(clean(path))) return "";
  return `${safeOrigin}${path}`;
}

function whatsappMessage({ contactName, companyName, activationUrl: url }) {
  return [
    `Hoi ${firstName(contactName)}! 👋`,
    "",
    `Bedankt voor het leuke gesprek. Ik heb speciaal voor ${clean(companyName) || "jouw bedrijf"} een persoonlijke website gemaakt.`,
    "",
    "Via onderstaande link kun je jouw website bekijken en jouw persoonlijke omgeving openen:",
    "",
    clean(url),
    "",
    "Ik ben benieuwd wat je ervan vindt!",
    "",
    "Groet,",
    "Max Webstudio",
  ].join("\n");
}

function whatsappUrl(phone, message) {
  const number = clean(phone).replace(/\D/g, "").replace(/^0/, "31");
  if (!number || !clean(message)) return "";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function correlationId() {
  return crypto.randomUUID();
}

function eligibilityError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  return error;
}

module.exports = {
  EMAIL_PATTERN,
  LIVE_STATUSES,
  TOKEN_PATTERN,
  activationUrl,
  assertEligibility,
  clean,
  correlationId,
  firstName,
  invitationStatus,
  normalizeEmail,
  previewSourceFromJourney,
  whatsappMessage,
  whatsappUrl,
};
