"use strict";

const WEBSITE_BRIEF_SCHEMA_VERSION = "mws.website-brief.v1";

function buildWebsiteBrief({ journey = {}, briefing = "" } = {}) {
  const supplied = object(journey.websiteBrief || journey.website_brief);
  const suppliedBusiness = object(supplied.business);
  const suppliedBrand = object(supplied.brand);
  const suppliedSite = object(supplied.site);
  const suppliedSeo = object(supplied.seo);
  const suppliedContact = object(supplied.contact);
  const suppliedResearch = object(supplied.research);
  const suppliedLinks = object(supplied.links);
  const websiteAnalysis = cloneObject(suppliedResearch.websiteAnalysis || journey.websiteAnalysis || journey.website_analysis);
  const googleBusiness = cloneObject(suppliedResearch.googleBusiness || journey.googleBusiness || journey.google_business);
  const rawBriefing = text(supplied.source?.rawBriefing || briefing || journey.generatedBriefing || journey.generated_briefing || journey.internalNotes || journey.internal_notes);

  const brief = {
    schemaVersion: WEBSITE_BRIEF_SCHEMA_VERSION,
    source: {
      kind: text(supplied.source?.kind) || (Object.keys(supplied).length ? "structured_intake" : "legacy_briefing"),
      rawBriefing,
      createdAt: text(supplied.source?.createdAt),
    },
    identity: {
      businessName: text(supplied.identity?.businessName || journey.businessName || journey.business_name),
      contactName: text(supplied.identity?.contactName || journey.contactName || journey.contact_name),
    },
    business: {
      industry: text(suppliedBusiness.industry) || extractField(rawBriefing, ["Branche/regio", "Branche"]),
      audience: text(suppliedBusiness.audience),
      region: text(suppliedBusiness.region) || extractField(rawBriefing, ["Regio", "Plaats", "Werkgebied"]),
      services: list(suppliedBusiness.services),
      uniqueValue: text(suppliedBusiness.uniqueValue),
      goals: list(suppliedBusiness.goals),
      toneOfVoice: text(suppliedBusiness.toneOfVoice),
    },
    brand: {
      desiredStyle: text(suppliedBrand.desiredStyle),
      colorPreference: text(suppliedBrand.colorPreference),
      colors: palette(suppliedBrand.colors),
      blockedColors: list(suppliedBrand.blockedColors),
      logoAsset: text(suppliedBrand.logoAsset),
    },
    site: {
      websiteUrl: text(suppliedSite.websiteUrl || journey.websiteUrl || journey.website_url),
      desiredPages: list(suppliedSite.desiredPages),
      primaryCta: text(suppliedSite.primaryCta) || extractField(rawBriefing, ["CTA", "CTA's", "CTA voorkeur", "Call to action"]),
      secondaryCta: text(suppliedSite.secondaryCta),
      packageType: text(suppliedSite.packageType || journey.packageType || journey.package_type || journey.package || journey.packageName || journey.package_name),
    },
    seo: {
      keywords: list(suppliedSeo.keywords),
      serviceArea: text(suppliedSeo.serviceArea || suppliedBusiness.region),
    },
    contact: {
      email: text(suppliedContact.email || journey.email).toLowerCase(),
      phone: text(suppliedContact.phone || journey.phone),
      summary: text(suppliedContact.summary),
    },
    research: {
      competitors: list(suppliedResearch.competitors),
      websiteAnalysis: Object.keys(websiteAnalysis).length ? websiteAnalysis : null,
      googleBusiness: Object.keys(googleBusiness).length ? googleBusiness : null,
    },
    links: {
      customerId: text(suppliedLinks.customerId || journey.customerId || journey.customer_id),
      websiteId: text(suppliedLinks.websiteId || journey.websiteId || journey.website_id),
      projectId: text(suppliedLinks.projectId || journey.projectId || journey.project_id),
    },
    constraints: {
      notes: text(supplied.constraints?.notes),
      forbiddenClaims: list(supplied.constraints?.forbiddenClaims),
    },
  };

  return deepFreeze(brief);
}

function websiteBriefToFactoryBriefing(brief = {}) {
  const source = object(brief);
  const lines = [];
  append(lines, "Branche", source.business?.industry);
  append(lines, "Regio", source.business?.region);
  append(lines, "Doelgroep", source.business?.audience);
  append(lines, "Diensten", list(source.business?.services).join(", "));
  append(lines, "Onderscheidend vermogen", source.business?.uniqueValue);
  append(lines, "Doel", list(source.business?.goals).join(", "));
  append(lines, "Tone of voice", source.business?.toneOfVoice);
  append(lines, "Gewenste stijl", source.brand?.desiredStyle);
  append(lines, "Kleurenvoorkeur", source.brand?.colorPreference);
  append(lines, "Niet gebruiken", list(source.brand?.blockedColors).join(", "));
  append(lines, "Pagina's", list(source.site?.desiredPages).join(", "));
  append(lines, "CTA", source.site?.primaryCta);
  append(lines, "SEO zoekwoorden", list(source.seo?.keywords).join(", "));
  append(lines, "Concurrenten", list(source.research?.competitors).join(", "));
  append(lines, "Notities", source.constraints?.notes);
  const structured = lines.join("\n");
  const raw = text(source.source?.rawBriefing);
  return [structured, raw].filter(Boolean).join("\n\n");
}

function append(lines, label, value) {
  const clean = text(value);
  if (clean) lines.push(`${label}: ${clean}`);
}

function extractField(value = "", labels = []) {
  const lines = String(value || "").split(/\r?\n/);
  for (const label of labels) {
    const match = lines.find((line) => line.trim().toLowerCase().startsWith(String(label).toLowerCase()));
    if (match) return text(match.split(":").slice(1).join(":"));
  }
  return "";
}

function palette(value) {
  const source = object(value);
  const output = {};
  for (const key of ["ink", "brand", "accent", "soft", "dark"]) {
    const color = text(source[key]);
    if (/^#[0-9a-f]{6}$/i.test(color)) output[key] = color;
  }
  return output;
}

function list(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
  const seen = new Set();
  return values.map(text).filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneObject(value) {
  const source = object(value);
  return Object.keys(source).length ? JSON.parse(JSON.stringify(source)) : {};
}

function text(value) {
  return String(value || "").trim();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

module.exports = {
  WEBSITE_BRIEF_SCHEMA_VERSION,
  buildWebsiteBrief,
  websiteBriefToFactoryBriefing,
};
