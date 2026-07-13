export const BRAND_VOICE_SCHEMA_VERSION = 1;

export const MAX_WEBSTUDIO_BRAND_VOICE = Object.freeze({
  schemaVersion: BRAND_VOICE_SCHEMA_VERSION,
  scopeId: "internal:max-webstudio",
  brandName: "Max Webstudio",
  shortDescription: "Premium websites, branding en slimme automatisering voor ambitieuze ondernemers.",
  mission: "Ondernemers helpen groeien met digitale oplossingen die professioneel ogen en begrijpelijk blijven.",
  targetAudience: "Nederlandse mkb-ondernemers en lokale dienstverleners die professioneel willen groeien.",
  services: ["Websites", "Branding", "Automatisering", "Websiteadvies"],
  products: ["Websitepakketten", "Care-abonnementen", "Gratis preview"],
  usps: ["Premium maar begrijpelijk", "Direct persoonlijk contact", "Focus op gebruiksgemak en groei"],
  toneOfVoice: ["premium", "ondernemend", "direct", "betrouwbaar", "innovatief", "klantgericht"],
  formality: "informeel-professioneel",
  addressForm: "je/jij",
  preferredWords: ["helder", "professioneel", "groei", "gebruiksgemak", "persoonlijk"],
  forbiddenWords: ["baanbrekend", "gegarandeerd succes", "de allerbeste"],
  riskyClaims: ["absolute garanties", "onbewezen omzetclaims", "resultaten zonder bron"],
  emojiUsage: "spaarzaam",
  humorStyle: "licht en menselijk, nooit ten koste van vertrouwen",
  standardCtas: ["Vraag een gratis preview aan", "Plan websiteadvies", "Plan een kennismaking", "Vraag een offerte aan"],
  standardHashtags: ["#maxwebstudio", "#webdesign", "#ondernemen", "#branding"],
  localRegion: "Nederland",
  contactDetails: { website: "https://maxwebstudio.nl", email: "info@maxwebstudio.nl", phone: "" },
  keyMessages: ["Een goede website maakt kiezen makkelijker", "Techniek moet groei ondersteunen", "Premium hoeft niet ingewikkeld te zijn"],
  competitivePosition: "Persoonlijke premium webstudio die strategie, ontwerp en automatisering combineert.",
  visualDirection: "Donker marineblauw, helder wit, krachtige blauwe en cyan-accenten, rustig en premium.",
  contentPillars: ["Websites", "Branding", "Automatisering", "Groei", "Gebruiksgemak", "Ondernemerschap"],
  goodExamples: ["Duidelijke uitleg met één concreet inzicht en een rustige CTA."],
  unwantedExamples: ["Harde verkooppraat, overdreven superlatieven of claims zonder bewijs."],
  provenance: {},
});

const ARRAY_FIELDS = new Set([
  "services", "products", "usps", "toneOfVoice", "preferredWords", "forbiddenWords", "riskyClaims",
  "standardCtas", "standardHashtags", "keyMessages", "contentPillars", "goodExamples", "unwantedExamples",
]);

export const BRAND_VOICE_FIELDS = Object.freeze([
  ["brandName", "Merknaam", "text"], ["shortDescription", "Korte merkbeschrijving", "textarea"],
  ["mission", "Missie", "textarea"], ["targetAudience", "Doelgroep", "textarea"],
  ["services", "Belangrijkste diensten", "list"], ["products", "Belangrijkste producten", "list"],
  ["usps", "USP's", "list"], ["toneOfVoice", "Tone of voice", "list"],
  ["formality", "Formeel of informeel", "text"], ["addressForm", "Aanspreekvorm", "text"],
  ["preferredWords", "Gewenste woorden", "list"], ["forbiddenWords", "Verboden woorden", "list"],
  ["riskyClaims", "Verboden of risicovolle claims", "list"], ["emojiUsage", "Emoji-gebruik", "text"],
  ["humorStyle", "Humorstijl", "text"], ["standardCtas", "Standaard-CTA's", "list"],
  ["standardHashtags", "Standaard-hashtags", "list"], ["localRegion", "Lokale regio", "text"],
  ["keyMessages", "Kernboodschappen", "list"], ["competitivePosition", "Concurrentiepositie", "textarea"],
  ["visualDirection", "Visuele richting", "textarea"], ["contentPillars", "Contentpijlers", "list"],
  ["goodExamples", "Voorbeelden van goede teksten", "list"], ["unwantedExamples", "Voorbeelden van ongewenste teksten", "list"],
]);

function clean(value) {
  return String(value || "").trim();
}

function list(value) {
  if (Array.isArray(value)) return [...new Set(value.map(clean).filter(Boolean))];
  return [...new Set(clean(value).split(/[\n,]+/).map(clean).filter(Boolean))];
}

export function normalizeBrandVoice(input = {}, options = {}) {
  const requestedScope = clean(input.scopeId || options.scopeId);
  const fallback = options.fallback || (requestedScope === "internal:max-webstudio" || !requestedScope ? MAX_WEBSTUDIO_BRAND_VOICE : { scopeId: requestedScope });
  const normalized = {
    schemaVersion: BRAND_VOICE_SCHEMA_VERSION,
    scopeId: clean(input.scopeId || options.scopeId || fallback.scopeId || "internal:max-webstudio"),
  };
  for (const [field] of BRAND_VOICE_FIELDS) {
    normalized[field] = ARRAY_FIELDS.has(field)
      ? list(input[field] ?? fallback[field])
      : clean(input[field] ?? fallback[field]);
  }
  const contact = input.contactDetails || fallback.contactDetails || {};
  normalized.contactDetails = {
    website: clean(contact.website), email: clean(contact.email), phone: clean(contact.phone),
  };
  normalized.provenance = { ...(fallback.provenance || {}), ...(input.provenance || {}) };
  normalized.updatedAt = clean(input.updatedAt) || new Date().toISOString();
  return normalized;
}

export function mergeBrandVoiceSources({ scopeId, centralRelationship = {}, centralBranding = {}, localExtensions = {} } = {}) {
  centralRelationship = centralRelationship || {};
  centralBranding = centralBranding || {};
  localExtensions = localExtensions || {};
  const internal = scopeId === "internal:max-webstudio";
  const fallback = internal ? MAX_WEBSTUDIO_BRAND_VOICE : normalizeBrandVoice({ scopeId }, { fallback: { scopeId } });
  const central = {
    brandName: centralRelationship.companyName || centralBranding.companyName,
    shortDescription: centralBranding.briefing?.shortDescription,
    mission: centralBranding.briefing?.mission,
    targetAudience: centralBranding.briefing?.audience,
    toneOfVoice: centralBranding.briefing?.toneOfVoice,
    services: centralBranding.briefing?.services,
    localRegion: centralBranding.briefing?.region,
    visualDirection: centralBranding.briefing?.desiredStyle,
    contactDetails: {
      website: centralRelationship.websiteUrl,
      email: centralRelationship.email,
      phone: centralRelationship.phone,
    },
  };
  const merged = normalizeBrandVoice({ ...fallback, ...localExtensions, ...Object.fromEntries(Object.entries(central).filter(([, value]) => value && (typeof value !== "object" || Object.values(value).some(Boolean)))), scopeId }, { fallback });
  merged.provenance = Object.fromEntries(BRAND_VOICE_FIELDS.map(([field]) => [field, central[field] ? "central" : localExtensions[field] ? "social-studio-extension" : internal ? "max-webstudio-default" : "empty"]));
  merged.provenance.contactDetails = Object.values(central.contactDetails).some(Boolean) ? "central" : localExtensions.contactDetails ? "social-studio-extension" : "empty";
  return merged;
}

export class BrandVoiceRepository {
  constructor(storage, key = "mws_social_studio_brand_voice_v1") {
    this.storage = storage;
    this.key = key;
  }
  readAll() {
    try { return JSON.parse(this.storage.getItem(this.key) || "{}"); } catch { return {}; }
  }
  load(scopeId) {
    const stored = this.readAll()[scopeId];
    return stored ? normalizeBrandVoice(stored, { scopeId }) : null;
  }
  save(scopeId, voice) {
    const rows = this.readAll();
    rows[scopeId] = normalizeBrandVoice({ ...voice, scopeId }, { scopeId });
    this.storage.setItem(this.key, JSON.stringify(rows));
    return rows[scopeId];
  }
}
