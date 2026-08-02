const crypto = require("node:crypto");

const SITE_URL = "https://maxwebstudio.nl";

const DOCUMENTS = Object.freeze([
  template("quote", "Offerteweergave", "offer-view-2026-07", "offer-view-v1", "Max Webstudio offerteweergave v1: relatie, regels, btw, betaling en geldigheid.", true),
  template("agreement", "Overeenkomsttemplate", "commercial-agreement-2026-07", "commercial-agreement-v1", "Max Webstudio commerciële overeenkomst v1: scope, levering, betaling en toepasselijke voorwaarden.", true),
  published("general_terms", "Algemene voorwaarden", "algemene-voorwaarden-2026-08-b2b", `${SITE_URL}/algemene-voorwaarden.html`, "c5056d92262129818f8b0f3c0aa6e68472fc31223f8eec961b10d1dc239e6616", true, false, "2026-08-02"),
  published("hosting_maintenance_terms", "Hosting- en onderhoudsvoorwaarden", "hosting-onderhoud-2026-08", `${SITE_URL}/hosting-onderhoud-voorwaarden.html`, "2799b1b442d3759377beeaa09f7b35048a3810039fcd11aed59badebc39593b5", false, true, "2026-08-02"),
  published("privacy_policy", "Privacyverklaring", "privacyverklaring-2026-07", `${SITE_URL}/privacyverklaring.html`, "bf9d304f1dbff5dabf08af716751d78c11605a199ba39a8482fb1d16fc85b0f0", true),
]);

function template(documentType, name, versionCode, templateCode, canonicalTemplate, required) {
  return Object.freeze({
    documentType,
    name,
    versionCode,
    templateCode,
    effectiveFrom: "2026-07-30",
    checksumSha256: sha(canonicalTemplate),
    checksumStatus: "verified",
    storageBucket: "commercial-templates",
    storagePath: `${templateCode}/${versionCode}`,
    sourceUrl: null,
    required,
    requiredWhenRecurring: false,
  });
}

function published(documentType, name, versionCode, sourceUrl, checksumSha256, required, requiredWhenRecurring = false, effectiveFrom = "2026-07-30") {
  return Object.freeze({ documentType, name, versionCode, templateCode: null, effectiveFrom, checksumSha256, checksumStatus: "verified", storageBucket: null, storagePath: null, sourceUrl, required, requiredWhenRecurring });
}

function documentsForSnapshot(snapshot = {}) {
  const recurring = Number(snapshot.recurringExVatCents || 0) > 0;
  return DOCUMENTS.map((document) => ({ ...document, required: document.required || (document.requiredWhenRecurring && recurring) }));
}

function validateReadyDocuments(snapshot = {}, bindings = []) {
  const expected = documentsForSnapshot(snapshot).filter((document) => document.required);
  const byType = new Map((bindings || []).map((binding) => [binding.documentType || binding.document_type, binding]));
  const missing = expected.filter((document) => {
    const binding = byType.get(document.documentType);
    const checksum = binding?.checksumSha256 || binding?.checksum_sha256;
    const versionCode = binding?.versionCode ?? binding?.version_code;
    return !binding || versionCode !== document.versionCode || checksum !== document.checksumSha256;
  });
  return { ready: missing.length === 0, missing: missing.map((document) => document.documentType), expected };
}

function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

module.exports = { DOCUMENTS, documentsForSnapshot, validateReadyDocuments };
