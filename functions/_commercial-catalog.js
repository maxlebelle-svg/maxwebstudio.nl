const crypto = require("node:crypto");

const CATALOG_KEY = "maxwebstudio-commercial";
const CATALOG_VERSION = "2026-07-30.1";
const CURRENCY = "EUR";
const VAT_RATE = 21;

const CLASSIFICATIONS = Object.freeze({
  FIXED: "fixed",
  STARTING_AT: "starting_at",
  ON_REQUEST: "on_request",
});

const COMPONENT_TYPES = Object.freeze({
  ONE_TIME: "one_time",
  RECURRING: "recurring",
});

function component(code, type, amountExVatCents, options = {}) {
  return {
    code,
    type,
    billingInterval: type === COMPONENT_TYPES.RECURRING ? (options.billingInterval || "monthly") : null,
    amountExVatCents: Number.isInteger(amountExVatCents) ? amountExVatCents : null,
    startingAmountExVatCents: Number.isInteger(options.startingAmountExVatCents) ? options.startingAmountExVatCents : null,
  };
}

function fixed(id, code, name, description, category, components, options = {}) {
  return product(id, code, name, description, category, CLASSIFICATIONS.FIXED, components, options);
}

function starting(id, code, name, description, category, components, options = {}) {
  return product(id, code, name, description, category, CLASSIFICATIONS.STARTING_AT, components, options);
}

function onRequest(id, code, name, description, category, options = {}) {
  return product(id, code, name, description, category, CLASSIFICATIONS.ON_REQUEST, [], options);
}

function product(id, code, name, description, category, classification, components, options = {}) {
  return {
    id,
    code,
    name,
    description,
    category,
    classification,
    components,
    fixedDepositExVatCents: Number.isInteger(options.fixedDepositExVatCents) ? options.fixedDepositExVatCents : null,
    dependencies: options.dependencies || [],
    minQuantity: options.minQuantity ?? 0,
    maxQuantity: options.maxQuantity ?? 1,
    active: options.active !== false,
    publicVisible: options.publicVisible !== false,
    publicCheckout: options.publicCheckout !== false,
    adminSelectable: options.adminSelectable !== false,
    sort: options.sort || 0,
  };
}

const PRODUCTS = {
  starter_site: fixed("starter_site", "WEB-STARTER", "Starter Site", "One-page website met contactformulier, basis SEO en mobiele optimalisatie.", "website", [component("sale", "one_time", 49500)], { fixedDepositExVatCents: 15000, sort: 10 }),
  business_website: fixed("business_website", "WEB-BUSINESS", "Business Website", "Website tot 5 pagina's met portfolio, aanvraagflow en SEO/conversiecopy.", "website", [component("sale", "one_time", 99500)], { fixedDepositExVatCents: 30000, sort: 20 }),
  premium_growth: fixed("premium_growth", "WEB-PREMIUM", "Premium Growth", "Uitgebreide website met strategie, funnels, analytics en groeiplan.", "website", [component("sale", "one_time", 175000)], { fixedDepositExVatCents: 50000, sort: 30 }),

  logo_design: starting("logo_design", "BRAND-LOGO", "Logo laten ontwerpen", "Professioneel basislogo met bestanden voor website, socials en drukwerk.", "branding", [component("design", "one_time", null, { startingAmountExVatCents: 35000 })], { sort: 110 }),
  brand_identity: starting("brand_identity", "BRAND-HUISSTIJL", "Complete huisstijl", "Logo-uitwerking, kleuren, typografie en een compacte huisstijlhandleiding.", "branding", [component("design", "one_time", null, { startingAmountExVatCents: 89500 })], { sort: 120 }),
  social_profile_set: fixed("social_profile_set", "BRAND-SOCIAL", "Socialmedia-profielset", "Profiel- en omslagbeelden voor zakelijke social kanalen.", "branding", [component("design", "one_time", 14500)], { sort: 130 }),
  email_signature: fixed("email_signature", "BRAND-SIGNATURE", "E-mailhandtekening", "Zakelijke e-mailhandtekening in de huisstijl.", "branding", [component("design", "one_time", 9500)], { sort: 140 }),
  business_card_design: fixed("business_card_design", "BRAND-CARD", "Visitekaartje-ontwerp", "Drukklaar ontwerp, exclusief drukwerkkosten.", "branding", [component("design", "one_time", 9500)], { sort: 150 }),

  domain_registration: starting("domain_registration", "DOMAIN-NEW", "Nieuwe domeinnaam registreren", "Beschikbaarheidscheck, registratie en basiskoppeling.", "domain_email", [component("registration", "one_time", null, { startingAmountExVatCents: 4900 })], { sort: 210 }),
  domain_transfer: starting("domain_transfer", "DOMAIN-MOVE", "Bestaand domein verhuizen", "Technische verhuizing en basiscontrole.", "domain_email", [component("transfer", "one_time", null, { startingAmountExVatCents: 9500 })], { sort: 220 }),
  business_mailbox: fixed("business_mailbox", "MAIL-BOX", "Zakelijke mailbox", "Professionele mailbox op het eigen domein.", "domain_email", [component("subscription", "recurring", 995)], { sort: 230 }),
  extra_mailbox: fixed("extra_mailbox", "MAIL-EXTRA", "Extra mailbox", "Extra mailbox voor collega of afdeling.", "domain_email", [component("subscription", "recurring", 795)], { dependencies: ["business_mailbox"], sort: 240 }),
  dns_email_setup: fixed("dns_email_setup", "MAIL-DNS", "DNS- en e-mailconfiguratie", "Technische inrichting van domein, DNS en e-mailrecords.", "domain_email", [component("setup", "one_time", 9500)], { sort: 250 }),

  phone_085_number: starting("phone_085_number", "TEL-085", "Zakelijk 085-nummer", "Zakelijk nummer en basisgebruiker, onder voorbehoud van beschikbaarheid.", "telephony", [component("subscription", "recurring", null, { startingAmountExVatCents: 1995 })], { sort: 310 }),
  phone_extra_user: fixed("phone_extra_user", "TEL-USER", "Extra telefoniegebruiker", "Extra gebruiker voor zakelijke telefonie.", "telephony", [component("subscription", "recurring", 795)], { dependencies: ["phone_085_number"], sort: 320 }),
  phone_setup: fixed("phone_setup", "TEL-SETUP", "Installatie of configuratie", "Inrichting van doorschakeling, toestel of gebruikers.", "telephony", [component("setup", "one_time", 9500)], { dependencies: ["phone_085_number"], sort: 330 }),

  extra_page: fixed("extra_page", "WEB-PAGE", "Extra pagina", "Aanvullende pagina voor de website.", "website_expansion", [component("page", "one_time", 9500)], { dependencies: ["starter_site", "business_website", "premium_growth"], maxQuantity: 20, sort: 410 }),
  webshop: starting("webshop", "WEB-SHOP", "Webshop", "Basiswebshop; definitieve prijs hangt af van producten, verzending en koppelingen.", "website_expansion", [component("build", "one_time", null, { startingAmountExVatCents: 199500 })], { sort: 420 }),
  booking_module: starting("booking_module", "WEB-BOOKING", "Boekingsmodule", "Prijs afhankelijk van agenda's, locaties, medewerkers en betalingen.", "website_expansion", [component("build", "one_time", null, { startingAmountExVatCents: 49500 })], { sort: 430 }),
  payment_module: starting("payment_module", "WEB-PAYMENT", "Betaalmodule", "Standaard betaalflow; extra methoden en maatwerk worden apart afgestemd.", "website_expansion", [component("build", "one_time", null, { startingAmountExVatCents: 39500 })], { sort: 440 }),
  multilingual_site: starting("multilingual_site", "WEB-MULTI", "Meertalige website", "Technische inrichting per extra taal; vertalingen niet inbegrepen.", "website_expansion", [component("language", "one_time", null, { startingAmountExVatCents: 29500 })], { sort: 450 }),
  external_integration: starting("external_integration", "WEB-INTEGRATION", "Koppeling met externe software", "API- of webhookkoppeling na technische inventarisatie.", "website_expansion", [component("integration", "one_time", null, { startingAmountExVatCents: 49500 })], { sort: 460 }),
  extra_form: fixed("extra_form", "WEB-FORM", "Extra formulier", "Extra aanvraag-, intake- of contactformulier.", "website_expansion", [component("form", "one_time", 14500)], { dependencies: ["starter_site", "business_website", "premium_growth"], sort: 470 }),
  customer_portal: starting("customer_portal", "WEB-PORTAL", "Klantenportaal", "Afgeschermde klantomgeving; rollen en koppelingen worden apart afgestemd.", "website_expansion", [component("build", "one_time", null, { startingAmountExVatCents: 149500 })], { sort: 480 }),
  custom_feature: starting("custom_feature", "WEB-CUSTOM", "Maatwerkfunctie", "Duidelijk afgebakende maatwerkfunctie na inventarisatie.", "website_expansion", [component("build", "one_time", null, { startingAmountExVatCents: 39500 })], { sort: 490 }),

  seo_starter: fixed("seo_starter", "MKT-SEO-START", "SEO-startpakket", "Basisoptimalisatie en praktische vindbaarheidscheck.", "marketing", [component("setup", "one_time", 19500)], { sort: 510 }),
  monthly_seo: fixed("monthly_seo", "MKT-SEO-MONTH", "Maandelijkse SEO", "Doorlopende SEO-verbeteringen en monitoring.", "marketing", [component("management", "recurring", 24900)], { sort: 520 }),
  google_business_profile: fixed("google_business_profile", "MKT-GBP", "Google Bedrijf instellen", "Profiel, diensten, foto's, openingstijden en eerste optimalisatie.", "marketing", [component("setup", "one_time", 19500)], { sort: 530 }),
  meta_ads: fixed("meta_ads", "MKT-META-ADS", "Meta advertenties", "Campagnes voor Facebook en Instagram; mediabudget niet inbegrepen.", "marketing", [component("setup", "one_time", 35000), component("management", "recurring", 24900)], { sort: 535 }),
  google_ads_setup: fixed("google_ads_setup", "MKT-GOOGLE-ADS", "Google Ads", "Zoekcampagnes met setup en maandelijkse optimalisatie; mediabudget niet inbegrepen.", "marketing", [component("setup", "one_time", 45000), component("management", "recurring", 29900)], { sort: 540 }),
  social_setup: fixed("social_setup", "MKT-SOCIAL-SETUP", "Socialmedia-inrichting", "Zakelijke basisinrichting voor social kanalen.", "marketing", [component("setup", "one_time", 19500)], { sort: 550 }),
  social_media: starting("social_media", "MKT-SOCIAL-MONTH", "Social media", "Posts, planning en eenvoudige contentkalender.", "marketing", [component("management", "recurring", null, { startingAmountExVatCents: 29900 })], { sort: 560 }),
  monthly_content: starting("monthly_content", "MKT-CONTENT-LEGACY", "Maandelijkse contentservice (historisch)", "Historische catalogusregel; niet beschikbaar voor nieuwe voorstellen.", "marketing", [component("management", "recurring", null, { startingAmountExVatCents: 49500 })], { active: false, publicVisible: false, publicCheckout: false, adminSelectable: false, sort: 565 }),
  automation: starting("automation", "MKT-AUTOMATION", "Automatisering", "Forms, opvolgmails en CRM-koppelingen.", "marketing", [component("build", "one_time", null, { startingAmountExVatCents: 39500 })], { sort: 570 }),

  web_copy: fixed("web_copy", "CONTENT-COPY", "Webteksten", "SEO-teksten of herschrijven van bestaande teksten.", "content", [component("copy", "one_time", 19500)], { sort: 610 }),
  photography: starting("photography", "CONTENT-PHOTO", "Fotografie", "Bedrijfsshoot; reis-, locatie- en studiokosten kunnen apart gelden.", "content", [component("shoot", "one_time", null, { startingAmountExVatCents: 49500 })], { sort: 620 }),
  company_video: starting("company_video", "CONTENT-VIDEO", "Bedrijfsvideo", "Bedrijfsfilm; definitieve prijs afhankelijk van draaiduur en productieniveau.", "content", [component("production", "one_time", null, { startingAmountExVatCents: 125000 })], { sort: 630 }),
  product_photos: starting("product_photos", "CONTENT-PRODUCT", "Productfoto's", "Serie productfoto's na afstemming van studio, styling en nabewerking.", "content", [component("shoot", "one_time", null, { startingAmountExVatCents: 39500 })], { sort: 640 }),
  blog_article: fixed("blog_article", "CONTENT-BLOG", "Blogartikel", "Professioneel blogartikel voor de website.", "content", [component("copy", "one_time", 14500)], { sort: 650 }),

  hosting: fixed("hosting", "CARE-HOST", "Hosting", "Hosting voor de website.", "care", [component("subscription", "recurring", 1995)], { sort: 710 }),
  care_basic: fixed("care_basic", "CARE-BASIC", "Care Basic", "Hosting, SSL, back-up en technische monitoring.", "care", [component("subscription", "recurring", 1995)], { dependencies: ["starter_site", "business_website", "premium_growth"], sort: 720 }),
  care_plus: fixed("care_plus", "CARE-PLUS", "Care Plus", "Care Basic plus kleine maandelijkse wijzigingen.", "care", [component("subscription", "recurring", 4900)], { dependencies: ["starter_site", "business_website", "premium_growth"], sort: 730 }),
  care_growth: fixed("care_growth", "CARE-GROWTH", "Care Growth", "Care Plus plus maandelijkse check en conversieadvies.", "care", [component("subscription", "recurring", 9900)], { dependencies: ["starter_site", "business_website", "premium_growth"], sort: 740 }),
  monitoring: fixed("monitoring", "CARE-MONITOR", "Technische monitoring", "Extra technische monitoring en rapportage.", "care", [component("subscription", "recurring", 1500)], { sort: 750 }),
  monthly_change_hours: starting("monthly_change_hours", "CARE-HOURS", "Maandelijkse wijzigingsuren", "Gereserveerde wijzigingsuren per maand.", "care", [component("subscription", "recurring", null, { startingAmountExVatCents: 19500 })], { sort: 760 }),
  strippenkaart: onRequest("strippenkaart", "CARE-STRIP", "Strippenkaart websitewijzigingen", "Bundel van 5 of 10 wijzigingen; prijs wordt vooraf bevestigd.", "care", { sort: 770 }),
  custom_request: onRequest("custom_request", "CUSTOM-WISH", "Andere wens", "Persoonlijke prijs na beoordeling.", "custom", { sort: 810 }),
};

const WEBSITE_PRODUCT_IDS = Object.freeze(["starter_site", "business_website", "premium_growth"]);
const CARE_PRODUCT_IDS = Object.freeze(["care_basic", "care_plus", "care_growth"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stable(value[key]);
    return result;
  }, {});
}

function catalogSnapshot() {
  return stable({
    catalogKey: CATALOG_KEY,
    version: CATALOG_VERSION,
    currency: CURRENCY,
    vatRate: VAT_RATE,
    validFrom: "2026-07-30",
    products: Object.values(PRODUCTS).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)),
  });
}

function catalogChecksum(snapshot = catalogSnapshot()) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(snapshot))).digest("hex");
}

function assertCatalogIntegrity() {
  const ids = new Set();
  const codes = new Set();
  for (const [id, item] of Object.entries(PRODUCTS)) {
    if (item.id !== id || ids.has(id) || codes.has(item.code)) throw new Error(`Ongeldige catalogusidentiteit: ${id}`);
    ids.add(id); codes.add(item.code);
    if (!Object.values(CLASSIFICATIONS).includes(item.classification)) throw new Error(`Ongeldige prijsclassificatie: ${id}`);
    if (item.classification === CLASSIFICATIONS.FIXED && (!item.components.length || item.components.some((entry) => !Number.isInteger(entry.amountExVatCents) || entry.amountExVatCents < 0))) throw new Error(`Vaste prijs ontbreekt: ${id}`);
    if (item.classification !== CLASSIFICATIONS.FIXED && item.components.some((entry) => entry.amountExVatCents !== null)) throw new Error(`Niet-bindende prijs bevat een vast bedrag: ${id}`);
    if (item.fixedDepositExVatCents !== null) {
      const oneTime = item.components.filter((entry) => entry.type === "one_time").reduce((sum, entry) => sum + Number(entry.amountExVatCents || 0), 0);
      if (!WEBSITE_PRODUCT_IDS.includes(id) || item.fixedDepositExVatCents <= 0 || item.fixedDepositExVatCents > oneTime) throw new Error(`Ongeldige vaste aanbetaling: ${id}`);
    }
  }
  return true;
}

function legacyProductProjection(item) {
  const oneTime = item.components.find((entry) => entry.type === "one_time");
  const recurring = item.components.find((entry) => entry.type === "recurring");
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    category: item.category,
    type: oneTime && recurring ? "hybrid" : recurring ? "recurring" : "one_time",
    priceExVatCents: oneTime?.amountExVatCents || 0,
    monthlyExVatCents: recurring?.amountExVatCents || 0,
    startingPriceExVatCents: oneTime?.startingAmountExVatCents || 0,
    startingMonthlyExVatCents: recurring?.startingAmountExVatCents || 0,
    setupExVatCents: 0,
    vatRate: VAT_RATE,
    active: item.active,
    publicCheckout: item.publicCheckout,
    manualConfirmation: item.classification !== CLASSIFICATIONS.FIXED,
    pricingClassification: item.classification,
    dependencies: [...item.dependencies],
    minQuantity: item.minQuantity,
    maxQuantity: item.maxQuantity,
    depositExVatCents: item.fixedDepositExVatCents || 0,
    sort: item.sort,
  };
}

function legacyProducts() {
  return Object.fromEntries(Object.entries(PRODUCTS).map(([id, item]) => [id, legacyProductProjection(item)]));
}

function publicCatalog() {
  const snapshot = catalogSnapshot();
  return {
    ...snapshot,
    checksum: catalogChecksum(snapshot),
    products: snapshot.products.filter((item) => item.active && item.publicVisible).map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      category: item.category,
      classification: item.classification,
      components: item.components,
      fixedDepositExVatCents: item.fixedDepositExVatCents,
      dependencies: item.dependencies,
      minQuantity: item.minQuantity,
      maxQuantity: item.maxQuantity,
      sort: item.sort,
    })),
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

assertCatalogIntegrity();
deepFreeze(PRODUCTS);

module.exports = {
  CATALOG_KEY,
  CATALOG_VERSION,
  CURRENCY,
  VAT_RATE,
  CLASSIFICATIONS,
  COMPONENT_TYPES,
  PRODUCTS,
  WEBSITE_PRODUCT_IDS,
  CARE_PRODUCT_IDS,
  assertCatalogIntegrity,
  catalogChecksum,
  catalogSnapshot,
  legacyProducts,
  publicCatalog,
  stable,
};
