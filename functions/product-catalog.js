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
  brand_identity: manual("BRAND-HUISSTIJL", "Complete huisstijl", "Logo-uitwerking, kleuren, typografie, stijlelementen en compacte huisstijlhandleiding. Definitieve prijs na afstemming van toepassingen en omvang.", "branding", 120, { startingPriceExVatCents: 89500 }),
  social_profile_set: direct("BRAND-SOCIAL", "Socialmedia-profielset", "Profiel- en omslagbeelden voor je belangrijkste social kanalen.", "branding", 14500, 130),
  email_signature: direct("BRAND-SIGNATURE", "E-mailhandtekening", "Nette zakelijke e-mailhandtekening in je huisstijl.", "branding", 9500, 140),
  business_card_design: direct("BRAND-CARD", "Visitekaartje-ontwerp", "Drukklaar ontwerp, exclusief drukwerkkosten.", "branding", 9500, 150),
  domain_registration: manual("DOMAIN-NEW", "Nieuwe domeinnaam registreren", "Beschikbaarheidscheck, registratie en basiskoppeling. Jaarlijkse registratie- en verlengingskosten kunnen per domein verschillen.", "domain_email", 210, { startingPriceExVatCents: 4900 }),
  domain_transfer: manual("DOMAIN-MOVE", "Bestaand domein verhuizen", "Technische verhuizing en basiscontrole. Complex DNS- of e-mailherstel wordt apart afgestemd.", "domain_email", 220, { startingPriceExVatCents: 9500 }),
  business_mailbox: direct("MAIL-BOX", "Zakelijke mailbox", "Een professionele mailbox op je eigen domein.", "domain_email", 0, 230, { monthlyExVatCents: 995 }),
  extra_mailbox: direct("MAIL-EXTRA", "Extra mailbox", "Extra mailbox voor collega of afdeling.", "domain_email", 0, 240, { monthlyExVatCents: 795, dependencies: ["business_mailbox"] }),
  dns_email_setup: direct("MAIL-DNS", "DNS- en e-mailconfiguratie", "Technische inrichting van domein, DNS en e-mailrecords.", "domain_email", 9500, 250),
  phone_085_number: manual("TEL-085", "Zakelijk 085-nummer", "Eén zakelijk nummer en basisgebruiker. Beschikbaarheid wordt vooraf gecontroleerd. Installatie of configuratie wordt apart gerekend.", "telephony", 310, { startingMonthlyExVatCents: 1995 }),
  phone_extra_user: direct("TEL-USER", "Extra telefoniegebruiker", "Extra gebruiker voor zakelijke telefonie.", "telephony", 0, 320, { monthlyExVatCents: 795, dependencies: ["phone_085_number"] }),
  phone_setup: direct("TEL-SETUP", "Installatie of configuratie", "Inrichting van doorschakeling, toestel of gebruikers.", "telephony", 9500, 330, { dependencies: ["phone_085_number"] }),
  extra_page: direct("WEB-PAGE", "Extra pagina", "Aanvullende pagina voor je website.", "website_expansion", 9500, 410, { dependencies: ["starter_site", "business_website", "premium_growth"], maxQuantity: 20 }),
  webshop: manual("WEB-SHOP", "Webshop", "Basiswebshop met producten, winkelmand, checkout en standaard betaalintegratie. Definitieve prijs is afhankelijk van producten, verzending, betaalmethoden en koppelingen.", "website_expansion", 420, { startingPriceExVatCents: 199500 }),
  booking_module: manual("WEB-BOOKING", "Boekingsmodule", "Afhankelijk van agenda’s, locaties, medewerkers, betalingen en automatische berichten.", "website_expansion", 430, { startingPriceExVatCents: 49500 }),
  payment_module: manual("WEB-PAYMENT", "Betaalmodule", "Standaard betaalflow met één betaalprovider. Extra betaalmethoden of maatwerk worden apart afgestemd.", "website_expansion", 440, { startingPriceExVatCents: 39500 }),
  multilingual_site: manual("WEB-MULTI", "Meertalige website", "Technische inrichting per extra taal. Vertalingen zijn niet inbegrepen.", "website_expansion", 450, { startingPriceExVatCents: 29500, startingPriceSuffix: "per extra taal" }),
  external_integration: manual("WEB-INTEGRATION", "Koppeling met externe software", "Eenvoudige standaard API- of webhookkoppeling. Definitieve prijs is afhankelijk van de externe software en documentatie.", "website_expansion", 460, { startingPriceExVatCents: 49500 }),
  extra_form: direct("WEB-FORM", "Extra formulier", "Extra aanvraag-, intake- of contactformulier.", "website_expansion", 14500, 470, { dependencies: ["starter_site", "business_website", "premium_growth"] }),
  customer_portal: manual("WEB-PORTAL", "Klantenportaal", "Basis klantomgeving met veilige login en afgeschermde gegevens. Rollen, documenten, betalingen en koppelingen worden apart afgestemd.", "website_expansion", 480, { startingPriceExVatCents: 149500 }),
  custom_feature: manual("WEB-CUSTOM", "Maatwerkfunctie", "Voor een kleine, duidelijk afgebakende maatwerkfunctie. Definitieve prijs na functionele inventarisatie.", "website_expansion", 490, { startingPriceExVatCents: 39500 }),
  seo_starter: direct("MKT-SEO-START", "SEO-startpakket", "Basisoptimalisatie en praktische vindbaarheidscheck.", "marketing", 19500, 510),
  monthly_seo: direct("MKT-SEO-MONTH", "Maandelijkse SEO", "Doorlopende SEO-verbeteringen en monitoring.", "marketing", 0, 520, { monthlyExVatCents: 24900 }),
  google_business_profile: direct("MKT-GBP", "Google Bedrijfsprofiel", "Optimalisatie van je Google Bedrijfsprofiel.", "marketing", 14900, 530),
  google_ads_setup: manual("MKT-ADS", "Google Ads-inrichting", "Accountstructuur, conversiemeting en één campagne. Mediabudget is niet inbegrepen.", "marketing", 540, { startingPriceExVatCents: 39500 }),
  social_setup: direct("MKT-SOCIAL", "Socialmedia-inrichting", "Zakelijke basisinrichting voor social kanalen.", "marketing", 19500, 550),
  monthly_content: manual("MKT-CONTENT-MONTH", "Maandelijkse contentservice", "Planning, teksten en vormgeving voor een compact maandelijks contentpakket. Aantal kanalen, berichten en video’s wordt persoonlijk afgestemd.", "marketing", 560, { startingMonthlyExVatCents: 49500 }),
  web_copy: direct("CONTENT-COPY", "Webteksten", "SEO-teksten of herschrijven van bestaande teksten.", "content", 19500, 610),
  photography: manual("CONTENT-PHOTO", "Fotografie", "Korte bedrijfsshoot op één locatie, inclusief basisselectie en nabewerking. Reis-, locatie- en studiokosten kunnen apart gelden.", "content", 620, { startingPriceExVatCents: 49500 }),
  company_video: manual("CONTENT-VIDEO", "Bedrijfsvideo", "Korte bedrijfsfilm met opname en montage. Definitieve prijs afhankelijk van draaiduur, locaties en productieniveau.", "content", 630, { startingPriceExVatCents: 125000 }),
  product_photos: manual("CONTENT-PRODUCT", "Productfoto's", "Kleine serie eenvoudige productfoto’s. Studio, modellen, styling en complexe nabewerking worden apart afgestemd.", "content", 640, { startingPriceExVatCents: 39500 }),
  blog_article: direct("CONTENT-BLOG", "Blogartikel", "Een professioneel blogartikel voor je website.", "content", 14500, 650),
  hosting: direct("CARE-HOST", "Hosting", "Hosting voor je website.", "care", 0, 710, { monthlyExVatCents: 1995 }),
  care_basic: direct("CARE-BASIC", "Basis onderhoud", "Hosting, SSL, back-up en technische monitoring.", "care", 0, 720, { monthlyExVatCents: 1995, dependencies: ["starter_site", "business_website", "premium_growth"] }),
  care_plus: direct("CARE-PLUS", "Plus onderhoud", "Care Basic plus kleine maandelijkse wijzigingen.", "care", 0, 730, { monthlyExVatCents: 4900, dependencies: ["starter_site", "business_website", "premium_growth"] }),
  care_growth: direct("CARE-GROWTH", "Groei onderhoud", "Care Plus plus maandelijkse check en conversieadvies.", "care", 0, 740, { monthlyExVatCents: 9900, dependencies: ["starter_site", "business_website", "premium_growth"] }),
  monitoring: direct("CARE-MONITOR", "Technische monitoring", "Extra technische monitoring en rapportage.", "care", 0, 750, { monthlyExVatCents: 1500 }),
  monthly_change_hours: manual("CARE-HOURS", "Maandelijkse wijzigingsuren", "Bundel vanaf twee gereserveerde wijzigingsuren per maand. Grotere bundels worden persoonlijk afgestemd.", "care", 760, { startingMonthlyExVatCents: 19500 }),
  custom_request: manual("CUSTOM-WISH", "Ik heb een andere wens", "Beschrijf je wens. Je ontvangt een persoonlijke prijsindicatie na beoordeling.", "custom", 810, { priceLabel: "Persoonlijke prijsindicatie" }),
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
    startingPriceExVatCents: extra.startingPriceExVatCents || 0,
    startingMonthlyExVatCents: extra.startingMonthlyExVatCents || 0,
    startingPriceSuffix: extra.startingPriceSuffix || "",
    priceLabel: extra.priceLabel || "",
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
