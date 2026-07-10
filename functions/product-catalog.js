const VAT_RATE = 21;

const PRODUCTS = {
  starter_site: {
    id: "starter_site",
    code: "WEB-STARTER",
    name: "Starter Site",
    description: "One-page website met contactformulier, basis SEO en mobiele optimalisatie.",
    category: "website",
    type: "one_time",
    priceExVatCents: 49500,
    depositExVatCents: 15000,
    vatRate: VAT_RATE,
    active: true,
    publicCheckout: true,
    manualConfirmation: false,
    dependencies: [],
    minQuantity: 0,
    maxQuantity: 1,
    sort: 10,
  },
  business_website: {
    id: "business_website",
    code: "WEB-BUSINESS",
    name: "Business Website",
    description: "Website tot 5 pagina's met portfolio, aanvraagflow en SEO/conversiecopy.",
    category: "website",
    type: "one_time",
    priceExVatCents: 99500,
    depositExVatCents: 30000,
    vatRate: VAT_RATE,
    active: true,
    publicCheckout: true,
    manualConfirmation: false,
    dependencies: [],
    minQuantity: 0,
    maxQuantity: 1,
    sort: 20,
  },
  premium_growth: {
    id: "premium_growth",
    code: "WEB-PREMIUM",
    name: "Premium Growth",
    description: "Uitgebreide website met strategie, funnels, analytics en groeiplan.",
    category: "website",
    type: "one_time",
    priceExVatCents: 175000,
    depositExVatCents: 50000,
    vatRate: VAT_RATE,
    active: true,
    publicCheckout: true,
    manualConfirmation: false,
    dependencies: [],
    minQuantity: 0,
    maxQuantity: 1,
    sort: 30,
  },
  logo_design: direct("BRAND-LOGO", "Logo laten ontwerpen", "Professioneel basislogo met bestanden voor website, socials en drukwerk.", "branding", 29500, 110),
  brand_identity: manual("BRAND-HUISSTIJL", "Complete huisstijl", "Kleuren, typografie en basiselementen voor een consistente uitstraling.", "branding", 120),
  social_profile_set: direct("BRAND-SOCIAL", "Socialmedia-profielset", "Profiel- en omslagbeelden voor je belangrijkste social kanalen.", "branding", 14500, 130),
  email_signature: direct("BRAND-SIGNATURE", "E-mailhandtekening", "Nette zakelijke e-mailhandtekening in je huisstijl.", "branding", 9500, 140),
  business_card_design: direct("BRAND-CARD", "Visitekaartje-ontwerp", "Drukklaar ontwerp, exclusief drukwerkkosten.", "branding", 9500, 150),
  domain_registration: manual("DOMAIN-NEW", "Nieuwe domeinnaam registreren", "We controleren beschikbaarheid en leggen de domeinnaam vast na bevestiging.", "domain_email", 210),
  domain_transfer: manual("DOMAIN-MOVE", "Bestaand domein verhuizen", "We begeleiden de verhuizing en technische controle.", "domain_email", 220),
  business_mailbox: direct("MAIL-BOX", "Zakelijke mailbox", "Een professionele mailbox op je eigen domein.", "domain_email", 0, 230, { monthlyExVatCents: 995 }),
  extra_mailbox: direct("MAIL-EXTRA", "Extra mailbox", "Extra mailbox voor collega of afdeling.", "domain_email", 0, 240, { monthlyExVatCents: 795, dependencies: ["business_mailbox"] }),
  dns_email_setup: direct("MAIL-DNS", "DNS- en e-mailconfiguratie", "Technische inrichting van domein, DNS en e-mailrecords.", "domain_email", 9500, 250),
  phone_085_number: manual("TEL-085", "Zakelijk 085-nummer", "Aanvraag met beschikbaarheidscontrole en persoonlijke bevestiging.", "telephony", 310, { monthlyExVatCents: 1495 }),
  phone_extra_user: direct("TEL-USER", "Extra telefoniegebruiker", "Extra gebruiker voor zakelijke telefonie.", "telephony", 0, 320, { monthlyExVatCents: 795, dependencies: ["phone_085_number"] }),
  phone_setup: direct("TEL-SETUP", "Installatie of configuratie", "Inrichting van doorschakeling, toestel of gebruikers.", "telephony", 9500, 330, { dependencies: ["phone_085_number"] }),
  extra_page: direct("WEB-PAGE", "Extra pagina", "Aanvullende pagina voor je website.", "website_expansion", 9500, 410, { dependencies: ["starter_site", "business_website", "premium_growth"], maxQuantity: 20 }),
  webshop: manual("WEB-SHOP", "Webshop", "Webshopfunctionaliteit met producten, checkout en beheer.", "website_expansion", 420),
  booking_module: manual("WEB-BOOKING", "Boekingsmodule", "Online afspraken of reserveringen passend bij je bedrijf.", "website_expansion", 430),
  payment_module: manual("WEB-PAYMENT", "Betaalmodule", "Betaalflow of betaalverzoekintegratie voor je website.", "website_expansion", 440),
  multilingual_site: manual("WEB-MULTI", "Meertalige website", "Structuur en inrichting voor meerdere talen.", "website_expansion", 450),
  external_integration: manual("WEB-INTEGRATION", "Koppeling met externe software", "Koppeling met CRM, agenda, boekhouding of andere software.", "website_expansion", 460),
  extra_form: direct("WEB-FORM", "Extra formulier", "Extra aanvraag-, intake- of contactformulier.", "website_expansion", 14500, 470, { dependencies: ["starter_site", "business_website", "premium_growth"] }),
  customer_portal: manual("WEB-PORTAL", "Klantenportaal", "Portaalfunctie voor klanten, documenten of aanvragen.", "website_expansion", 480),
  custom_feature: manual("WEB-CUSTOM", "Maatwerkfunctie", "Specifieke functie op basis van jouw wens.", "website_expansion", 490),
  seo_starter: direct("MKT-SEO-START", "SEO-startpakket", "Basisoptimalisatie en praktische vindbaarheidscheck.", "marketing", 19500, 510),
  monthly_seo: direct("MKT-SEO-MONTH", "Maandelijkse SEO", "Doorlopende SEO-verbeteringen en monitoring.", "marketing", 0, 520, { monthlyExVatCents: 24900 }),
  google_business_profile: direct("MKT-GBP", "Google Bedrijfsprofiel", "Optimalisatie van je Google Bedrijfsprofiel.", "marketing", 14900, 530),
  google_ads_setup: manual("MKT-ADS", "Google Ads-inrichting", "Campagne-inrichting, exclusief mediabudget.", "marketing", 540),
  social_setup: direct("MKT-SOCIAL", "Socialmedia-inrichting", "Zakelijke basisinrichting voor social kanalen.", "marketing", 19500, 550),
  monthly_content: manual("MKT-CONTENT-MONTH", "Maandelijkse contentservice", "Doorlopende contentplanning en creatie.", "marketing", 560),
  web_copy: direct("CONTENT-COPY", "Webteksten", "SEO-teksten of herschrijven van bestaande teksten.", "content", 19500, 610),
  photography: manual("CONTENT-PHOTO", "Fotografie", "Fotografie op aanvraag, vanafprijs na afstemming.", "content", 620),
  company_video: manual("CONTENT-VIDEO", "Bedrijfsvideo", "Videoproductie op aanvraag.", "content", 630),
  product_photos: manual("CONTENT-PRODUCT", "Productfoto's", "Productfotografie op aanvraag.", "content", 640),
  blog_article: direct("CONTENT-BLOG", "Blogartikel", "Een professioneel blogartikel voor je website.", "content", 14500, 650),
  hosting: direct("CARE-HOST", "Hosting", "Hosting voor je website.", "care", 0, 710, { monthlyExVatCents: 1995 }),
  care_basic: direct("CARE-BASIC", "Basis onderhoud", "Hosting, SSL, back-up en technische monitoring.", "care", 0, 720, { monthlyExVatCents: 1995, dependencies: ["starter_site", "business_website", "premium_growth"] }),
  care_plus: direct("CARE-PLUS", "Plus onderhoud", "Care Basic plus kleine maandelijkse wijzigingen.", "care", 0, 730, { monthlyExVatCents: 4900, dependencies: ["starter_site", "business_website", "premium_growth"] }),
  care_growth: direct("CARE-GROWTH", "Groei onderhoud", "Care Plus plus maandelijkse check en conversieadvies.", "care", 0, 740, { monthlyExVatCents: 9900, dependencies: ["starter_site", "business_website", "premium_growth"] }),
  monitoring: direct("CARE-MONITOR", "Technische monitoring", "Extra technische monitoring en rapportage.", "care", 0, 750, { monthlyExVatCents: 1500 }),
  monthly_change_hours: manual("CARE-HOURS", "Maandelijkse wijzigingsuren", "Bundel wijzigingsuren op maat.", "care", 760),
  custom_request: manual("CUSTOM-WISH", "Ik heb een andere wens", "Beschrijf je wens; Max Webstudio bevestigt prijs en haalbaarheid persoonlijk.", "custom", 810),
};

const WEBSITE_PRODUCT_IDS = ["starter_site", "business_website", "premium_growth"];
const CARE_PRODUCT_IDS = ["care_basic", "care_plus", "care_growth"];

function direct(code, name, description, category, priceExVatCents, sort, extra = {}) {
  return product(code, name, description, category, false, priceExVatCents, sort, extra);
}

function manual(code, name, description, category, sort, extra = {}) {
  return product(code, name, description, category, true, 0, sort, extra);
}

function product(code, name, description, category, manualConfirmation, priceExVatCents, sort, extra = {}) {
  return {
    id: "",
    code,
    name,
    description,
    category,
    type: extra.monthlyExVatCents ? "recurring" : "one_time",
    priceExVatCents,
    monthlyExVatCents: extra.monthlyExVatCents || 0,
    setupExVatCents: extra.setupExVatCents || 0,
    vatRate: VAT_RATE,
    active: true,
    publicCheckout: true,
    manualConfirmation,
    dependencies: extra.dependencies || [],
    minQuantity: extra.minQuantity || 0,
    maxQuantity: extra.maxQuantity || 1,
    sort,
  };
}

for (const [id, item] of Object.entries(PRODUCTS)) item.id = id;

function centsToEuro(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

function euroToMollieValue(euro) {
  return Number(euro || 0).toFixed(2);
}

function withVatCents(exVatCents, vatRate = VAT_RATE) {
  return Math.round(Number(exVatCents || 0) * (1 + vatRate / 100));
}

module.exports = {
  VAT_RATE,
  PRODUCTS,
  WEBSITE_PRODUCT_IDS,
  CARE_PRODUCT_IDS,
  centsToEuro,
  euroToMollieValue,
  withVatCents,
};
