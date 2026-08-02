const crypto = require("node:crypto");

const SITE_URL = "https://maxwebstudio.nl";
const AGREEMENT_TEMPLATE_V2 = [
  "Max Webstudio commerciële overeenkomst v2 B2B",
  "partijen en zakelijk karakter",
  "immutable voorstelversie en checksum",
  "scope, prijzen, btw, betaling en geldigheid",
  "start, planning, medewerking, oplevering en feedback",
  "wijzigingen, meerwerk, doorlopende diensten en beëindiging",
  "intellectueel eigendom, privacy, aansprakelijkheid en overmacht",
  "documentvolgorde, digitale aanvaarding en acceptatiebewijs",
].join("\n");
const OFFER_VIEW_V2 = [
  "Max Webstudio offerteweergave v2 B2B",
  "relatie, offertenummer en onveranderlijke voorstelreferentie",
  "scope, aantallen en bindende offertregels",
  "eenmalige en terugkerende bedragen exclusief en inclusief btw",
  "betaalafspraak, bedrag nu en resterend bedrag",
  "geldigheid, versie en checksum",
  "gekoppelde voorwaarden en documentvolgorde",
  "zakelijke acceptatie en controleerbaar akkoordbewijs",
].join("\n");

const DOCUMENTS = Object.freeze([
  template("quote", "Offerteweergave", "offer-view-2026-08-b2b", "offer-view-v2", OFFER_VIEW_V2, true, "2026-08-02"),
  template("agreement", "Overeenkomsttemplate", "commercial-agreement-2026-08-b2b", "commercial-agreement-v2", AGREEMENT_TEMPLATE_V2, true, "2026-08-02"),
  published("general_terms", "Algemene voorwaarden", "algemene-voorwaarden-2026-08-b2b", `${SITE_URL}/algemene-voorwaarden.html`, "c5056d92262129818f8b0f3c0aa6e68472fc31223f8eec961b10d1dc239e6616", true, false, "2026-08-02"),
  published("hosting_maintenance_terms", "Hosting- en onderhoudsvoorwaarden", "hosting-onderhoud-2026-08", `${SITE_URL}/hosting-onderhoud-voorwaarden.html`, "2799b1b442d3759377beeaa09f7b35048a3810039fcd11aed59badebc39593b5", false, true, "2026-08-02"),
  published("privacy_policy", "Privacyverklaring", "privacyverklaring-2026-08", `${SITE_URL}/privacyverklaring.html`, "ce05bdd9beb453af58e57be890d433c48f1d6865c6a403924961d77e7694f0f2", true, false, "2026-08-02"),
]);

function template(documentType, name, versionCode, templateCode, canonicalTemplate, required, effectiveFrom = "2026-07-30") {
  return Object.freeze({
    documentType,
    name,
    versionCode,
    templateCode,
    effectiveFrom,
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
