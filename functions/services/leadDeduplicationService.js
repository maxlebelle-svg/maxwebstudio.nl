const COMPANY_SUFFIX_PATTERN = /\b(b\.?v\.?|vof|v\.?o\.?f\.?|eenmanszaak|holding|nederland)\b/gi;

function cleanText(value = "") {
  return String(value || "").trim();
}

function normalizeDomain(value = "") {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .replace(/\.$/, "");
  }
}

function normalizePhone(value = "") {
  let phone = cleanText(value).replace(/[^\d+]/g, "");
  if (!phone) return "";
  if (phone.startsWith("0031")) phone = `31${phone.slice(4)}`;
  if (phone.startsWith("+31")) phone = `31${phone.slice(3)}`;
  if (phone.startsWith("310")) phone = `31${phone.slice(3)}`;
  if (phone.startsWith("0") && phone.length >= 10) phone = `31${phone.slice(1)}`;
  return phone.replace(/[^\d]/g, "");
}

function normalizeEmail(value = "") {
  return cleanText(value).toLowerCase();
}

function normalizeCompanyName(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(COMPANY_SUFFIX_PATTERN, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePostalCode(value = "") {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

function normalizeCity(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedLeadIdentifiers(lead = {}) {
  const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
  const website = lead.websiteUrl || lead.website_url || lead.website || lead.interest || metadata.websiteUrl || metadata.website;
  const phone = lead.phone || metadata.phone;
  const email = lead.email || metadata.email;
  const company = lead.companyName || lead.company_name || lead.company || lead.businessName || metadata.companyName || metadata.company;
  const postalCode = lead.postalCode || lead.postal_code || metadata.postalCode || metadata.postal_code || metadata.postcode;
  const city = lead.region || lead.city || lead.plaats || metadata.region || metadata.city || metadata.plaats;
  return {
    kvkNumber: cleanText(lead.kvkNumber || lead.kvk_number || metadata.kvkNumber || metadata.kvk_number),
    externalSourceId: cleanText(lead.externalSourceId || lead.external_source_id || lead.googlePlaceId || lead.google_place_id || metadata.externalSourceId || metadata.external_source_id || metadata.googlePlaceId || metadata.google_place_id),
    normalizedDomain: normalizeDomain(website),
    normalizedPhone: normalizePhone(phone),
    normalizedEmail: normalizeEmail(email),
    normalizedCompanyName: normalizeCompanyName(company),
    normalizedPostalCode: normalizePostalCode(postalCode),
    normalizedCity: normalizeCity(city),
  };
}

function mergeMissingLeadValues(existing = {}, incoming = {}) {
  const merged = { ...incoming };
  Object.entries(incoming).forEach(([key, value]) => {
    if (value === "" || value === undefined || value === null || Number.isNaN(value)) delete merged[key];
  });
  ["company_name", "contact_name", "email", "phone", "website", "notes"].forEach((key) => {
    if (existing[key] && !merged[key]) delete merged[key];
  });
  return merged;
}

module.exports = {
  normalizeDomain,
  normalizePhone,
  normalizeEmail,
  normalizeCompanyName,
  normalizePostalCode,
  normalizeCity,
  normalizedLeadIdentifiers,
  mergeMissingLeadValues,
};
