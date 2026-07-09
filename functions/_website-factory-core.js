const crypto = require("crypto");
const { resolveDemoImageAsset, resolveDemoImageAssetSet } = require("./_demo-image-assets");
const { loadWebsiteFactoryManifests } = require("./_website-factory-manifests");
const { resolveFactoryConfig } = require("./website-factory/config-resolver");

const WEBSITE_FACTORY_MANIFESTS = loadWebsiteFactoryManifests();

const BUILD_STATUSES = new Set(["queued", "briefing", "building", "quality_check", "deploying", "completed", "quality_failed", "failed"]);
const PACKAGE_RULES = {
  starter: {
    label: "Starter Website",
    price: 495,
    template: "starter-one-page-v1",
    pages: ["index.html"],
    sections: ["hero", "over-ons", "diensten", "waarom", "cta", "contact", "footer"],
    navigation: "scroll",
  },
  professional: {
    label: "Professional Website",
    price: 995,
    template: "professional-multi-page-v1",
    pages: ["index.html", "over-ons.html", "diensten.html", "contact.html"],
    sections: ["hero", "diensten", "voordelen", "werkwijze", "cta", "contact", "footer"],
    navigation: "multi-page",
  },
  business: {
    label: "Business Website",
    price: 995,
    template: "business-multi-page-v1",
    pages: ["index.html", "over-ons.html", "diensten.html", "contact.html"],
    sections: ["hero", "diensten", "voordelen", "werkwijze", "cta", "contact", "footer"],
    navigation: "multi-page",
  },
  premium: {
    label: "Premium Website",
    price: 1750,
    template: "premium-growth-site-v1",
    pages: ["index.html", "over-ons.html", "diensten.html", "projecten.html", "reviews.html", "contact.html", "offerte.html"],
    sections: ["hero", "diensten", "voordelen", "werkwijze", "projecten", "reviews", "offerte", "contact", "footer"],
    navigation: "premium-multi-page",
  },
};

const INDUSTRY_PROFILES = [
  profile("construction", ["bouw", "timmer", "renovatie", "aannemer", "dak", "badkamer", "kozijn", "dakopbouw", "aanbouw"], {
    label: "Bouw en renovatie",
    colors: { ink: "#111510", brand: "#24382f", accent: "#c99a45", soft: "#f3efe8", dark: "#1f332a" },
    hero: "Woningverbetering met de uitstraling van topklasse bouw.",
    intro: "Voor huiseigenaren die strak vakwerk, duidelijke afspraken en een woning willen die meer waard voelt.",
    eyebrow: "Timmerwerk, verbouw en renovatie",
    cta: "Offerte aanvragen",
    secondaryCta: "Bel direct",
    services: ["Badkamers", "Dakkapellen", "Dakopbouw", "Aanbouw", "Kunststof kozijnen"],
    benefits: [
      ["Strak afgewerkt", "De presentatie legt nadruk op kwaliteit, materiaalkeuze en details die vertrouwen geven."],
      ["Duidelijke afspraken", "Bezoekers zien snel wat de volgende stap is en hoe het traject wordt opgepakt."],
      ["Sterke projectindruk", "Ruimte voor foto's, cases en resultaten maakt het bedrijf direct geloofwaardiger."],
      ["Offertegericht", "Telefoon en aanvraagmomenten blijven zichtbaar zonder opdringerig te worden."],
    ],
    process: [
      ["Aanvraag", "Vertel kort wat u wilt laten maken en voeg belangrijke maten of foto's toe."],
      ["Advies", "Het bedrijf denkt mee over indeling, materiaal, planning en de slimste aanpak."],
      ["Offerte", "U ontvangt een duidelijke offerte zonder vage posten of verrassingen achteraf."],
      ["Realisatie", "De uitvoering gebeurt netjes, professioneel en met oog voor de details."],
    ],
  }),
  profile("driving-school", ["rijschool", "verkeersschool", "rijles", "autorijles", "scooter", "scooterrijbewijs", "bromfiets", "examengarantie", "praktijkexamen", "theorie", "cbr"], {
    label: "Rijschool en scooterles",
    colors: { ink: "#102033", brand: "#1457c8", accent: "#22c55e", soft: "#f3f8ff", dark: "#0f2238" },
    hero: "Snel en zeker richting je rijbewijs.",
    intro: "Voor leerlingen die helder willen weten welke lessen, pakketten en examenstappen bij hen passen.",
    eyebrow: "Rijlessen, examen en vertrouwen",
    cta: "Plan een proefles",
    secondaryCta: "Bekijk pakketten",
    services: ["Scooterrijles", "Autorijles", "Examengarantie", "Theoriebegeleiding", "Praktijkexamen"],
    benefits: [
      ["Duidelijke route naar examen", "Leerlingen zien direct welke stappen nodig zijn richting theorie, lessen en praktijkexamen."],
      ["Vertrouwen voor beginners", "De pagina legt rustig uit hoe de begeleiding werkt en waarom starten laagdrempelig is."],
      ["Pakketten goed vergelijkbaar", "Lespakketten, examengarantie en contactmomenten krijgen een logische plek."],
      ["Snel contact", "Proefles, WhatsApp of bellen blijven zichtbaar zonder dat de pagina druk wordt."],
    ],
    process: [
      ["Kies je pakket", "Bekijk welke rijlessen of scooteropleiding past bij je doel."],
      ["Plan een proefles", "Maak laagdrempelig kennis met de instructeur en aanpak."],
      ["Volg je lessen", "Werk stap voor stap aan verkeersinzicht, voertuigbeheersing en zekerheid."],
      ["Richting examen", "Bereid je gericht voor op theorie, praktijk en CBR-momenten."],
    ],
  }),
  profile("installation", ["installatie", "elektra", "elektricien", "loodgieter", "warmtepomp", "zonnepanelen", "cv", "laadpaal"], {
    label: "Installatie en techniek",
    colors: { ink: "#0d1f2f", brand: "#0f4c81", accent: "#16b8d9", soft: "#eef7fb", dark: "#102b3d" },
    hero: "Techniek die veilig werkt en klaar is voor morgen.",
    intro: "Voor klanten die snel duidelijkheid willen over installatie, onderhoud, storing of verduurzaming.",
    eyebrow: "Installatie, service en onderhoud",
    cta: "Plan service",
    secondaryCta: "Bel een specialist",
    services: ["Storingen", "Onderhoud", "Verduurzaming", "Laadpalen", "Installatie"],
  }),
  profile("automotive", ["automotive", "autobedrijf", "garage", "autoairco", "auto-airco", "auto airco", "apk", "occasion", "autoservice", "onderhoud"], {
    label: "Autobedrijf en autoservice",
    colors: { ink: "#101820", brand: "#24302c", accent: "#17b8a6", soft: "#f4f7f5", dark: "#202c27" },
    hero: "Autoservice die direct betrouwbaar voelt.",
    intro: "Voor autobezitters die snel willen zien welke service beschikbaar is en makkelijk een afspraak willen maken.",
    eyebrow: "Garage, airco service en onderhoud",
    cta: "Vraag een offerte aan",
    secondaryCta: "Bel direct",
    services: ["Airco service", "Onderhoud", "Diagnose", "Reparatie", "APK"],
    benefits: [
      ["Duidelijke service", "Bezoekers zien direct waarvoor ze terechtkunnen en hoe ze een afspraak maken."],
      ["Vertrouwen in vakwerk", "De preview legt nadruk op deskundigheid, nette uitleg en praktische contactmogelijkheden."],
      ["Lokale vindbaarheid", "De pagina is opgebouwd rond diensten en regio zodat zoekende autobezitters sneller contact opnemen."],
      ["Snelle aanvraagroute", "Bellen, WhatsApp en afspraak maken blijven dichtbij zonder de pagina druk te maken."],
    ],
    process: [
      ["Klacht of wens", "Geef kort aan wat er aan de auto moet gebeuren."],
      ["Controle", "De specialist kijkt wat nodig is en licht de aanpak duidelijk toe."],
      ["Uitvoering", "Onderhoud, diagnose of reparatie wordt professioneel uitgevoerd."],
      ["Afspraak rondmaken", "De klant weet direct wanneer de auto klaar is of welke vervolgstap nodig is."],
    ],
  }),
  profile("garden", ["hovenier", "tuin", "tuinaanleg", "groen", "buitenruimte"], {
    label: "Tuin en buitenruimte",
    colors: { ink: "#17231b", brand: "#2f5d45", accent: "#d4a24a", soft: "#f2f4ed", dark: "#243b2d" },
    hero: "Buitenruimte die voelt als verlengstuk van uw woning.",
    intro: "Voor klanten die een tuin willen die klopt in ontwerp, aanleg en onderhoud.",
    eyebrow: "Tuinontwerp, aanleg en onderhoud",
    cta: "Tuinplan aanvragen",
    secondaryCta: "Bekijk mogelijkheden",
    services: ["Tuinontwerp", "Aanleg", "Onderhoud", "Bestrating", "Beplanting"],
  }),
  profile("cleaning", ["schoonmaak", "vve", "oplevering", "kantoor", "reiniging"], {
    label: "Schoonmaak en facility",
    colors: { ink: "#102033", brand: "#1e6f91", accent: "#25c6a0", soft: "#f3f8fa", dark: "#123245" },
    hero: "Een frisse indruk, structureel professioneel geregeld.",
    intro: "Voor bedrijven en VvE's die willen dat schoonmaak betrouwbaar, zichtbaar en controleerbaar is.",
    eyebrow: "Zakelijke schoonmaak en onderhoud",
    cta: "Schoonmaakofferte aanvragen",
    secondaryCta: "Bel direct",
    services: ["Kantoorschoonmaak", "VvE onderhoud", "Oplevering", "Glasbewassing", "Periodiek onderhoud"],
  }),
  profile("beauty", ["kapper", "salon", "beauty", "schoonheid", "wellness", "barber"], {
    label: "Beauty en verzorging",
    colors: { ink: "#211822", brand: "#8b5e6f", accent: "#d9b38c", soft: "#faf5f4", dark: "#2c2028" },
    hero: "Een verzorgde uitstraling begint bij het eerste bezoek online.",
    intro: "Voor klanten die snel sfeer, behandelingen en een makkelijke afspraakknop willen zien.",
    eyebrow: "Salon, behandeling en styling",
    cta: "Afspraak maken",
    secondaryCta: "Bekijk behandelingen",
    services: ["Behandelingen", "Stylingadvies", "Afspraak maken", "Arrangementen", "Verzorging"],
  }),
  profile("hospitality", ["restaurant", "horeca", "cafe", "hotel", "b&b", "reserveren"], {
    label: "Horeca en hospitality",
    colors: { ink: "#201a17", brand: "#6f3429", accent: "#d6a458", soft: "#fbf5ec", dark: "#261b15" },
    hero: "Een eerste indruk die direct zin geeft om te reserveren.",
    intro: "Voor gasten die sfeer willen voelen, aanbod willen bekijken en makkelijk willen boeken.",
    eyebrow: "Sfeer, reserveren en gastvrijheid",
    cta: "Reserveer direct",
    secondaryCta: "Bekijk aanbod",
    services: ["Menu", "Reserveren", "Arrangementen", "Private dining", "Contact"],
  }),
  profile("business", ["advocaat", "juridisch", "consult", "coach", "advies", "financieel", "makelaar", "accountant"], {
    label: "Zakelijke dienstverlening",
    colors: { ink: "#111827", brand: "#1d4ed8", accent: "#8b5cf6", soft: "#f5f7fb", dark: "#111b2e" },
    hero: "Een professionele website die vertrouwen wekt voordat het eerste gesprek begint.",
    intro: "Voor klanten die expertise, rust en een duidelijke route naar advies zoeken.",
    eyebrow: "Advies, intake en vertrouwen",
    cta: "Plan een intake",
    secondaryCta: "Bekijk expertise",
    services: ["Intake", "Advies", "Begeleiding", "Strategie", "Contact"],
  }),
  profile("local", ["dienst", "service", "bedrijf"], {
    label: "Lokale specialist",
    colors: { ink: "#132238", brand: "#2563eb", accent: "#14b8a6", soft: "#f6f8fb", dark: "#102033" },
    hero: "Een lokale specialist die online direct professioneel overkomt.",
    intro: "Voor bezoekers die snel willen begrijpen wat u doet, waarom ze u kunnen vertrouwen en hoe ze contact opnemen.",
    eyebrow: "Service, vertrouwen en contact",
    cta: "Plan een kennismaking",
    secondaryCta: "Bekijk diensten",
    services: ["Advies", "Uitvoering", "Service", "Onderhoud", "Contact"],
  }),
];

function profile(key, keywords, config) {
  return Object.freeze({ key, keywords: Object.freeze(keywords), ...config });
}

function buildWebsitePackage({ journey = {}, briefing = "", version = 1 }) {
  const businessName = cleanText(journey.businessName || journey.business_name) || "Demo bedrijf";
  const contactName = cleanText(journey.contactName || journey.contact_name) || "Contactpersoon";
  const email = cleanText(journey.email).toLowerCase();
  const phone = cleanText(journey.phone);
  const websiteUrl = cleanText(journey.websiteUrl || journey.website_url);
  const internalNotes = cleanText(journey.internalNotes || journey.internal_notes);
  const combinedBriefing = cleanText(briefing || journey.generatedBriefing || journey.generated_briefing || internalNotes);
  const websiteAnalysis = journey.websiteAnalysis && typeof journey.websiteAnalysis === "object" ? journey.websiteAnalysis : null;
  const currentWebsite = normalizeCurrentWebsiteSnapshot(websiteAnalysis?.currentWebsite || journey.currentWebsite || journey.current_website);
  const googleReviews = normalizeGoogleReviews(journey.googleReviews || journey.google_reviews || journey.googleBusiness?.reviews || journey.google_business?.reviews);
  const googleRating = cleanText(journey.googleRating || journey.google_rating || journey.googleBusiness?.rating || journey.google_business?.rating);
  const googleRatingTotal = cleanText(journey.googleRatingTotal || journey.google_rating_total || journey.googleBusiness?.ratingTotal || journey.google_business?.rating_total);
  const googleMapsUrl = cleanText(journey.googleMapsUrl || journey.google_maps_url || journey.googleBusiness?.mapsUrl || journey.google_business?.maps_url);
  const industrySignals = [combinedBriefing, websiteUrl, businessName].filter(Boolean).join("\n");
  const industry = extractField(combinedBriefing, ["Branche/regio", "Branche"]) || inferIndustry(industrySignals, businessName);
  const industryProfile = resolveIndustryProfile({ industry, briefing: industrySignals, businessName });
  const currentWebsiteText = [
    currentWebsite.title,
    currentWebsite.metaDescription,
    currentWebsite.h1,
    ...(currentWebsite.headings || []),
    ...(currentWebsite.paragraphs || []),
  ].filter(Boolean).join("\n");
  const extractedServices = extractServices([industrySignals, currentWebsiteText].filter(Boolean).join("\n"), industry);
  const services = mergeUnique(extractedServices, industryProfile.services).filter(isUsableServiceLabel).slice(0, 6);
  const pricingPackages = extractPricingPackages({
    currentWebsite,
    briefing: combinedBriefing,
    services,
    industryProfile,
  });
  const benefits = inferBenefits(industry, industryProfile);
  const processSteps = inferProcessSteps(industry, industryProfile);
  const cta = inferCta(industrySignals, industryProfile);
  const colors = inferColors(industry, industryProfile);
  const style = inferStyle(combinedBriefing);
  const packageType = normalizePackageType(journey.packageType || journey.package_type || journey.package || journey.packageName || journey.package_name || extractField(combinedBriefing, ["Websitepakket", "Pakket"]));
  const factoryConfig = resolveFactoryConfig({ packageType, industry: `${industry} ${industrySignals} ${businessName}` });
  const packageRules = resolvePackageRules(factoryConfig.package.id || packageType);
  const demoImageAssets = resolveDemoImageAssetSet({ businessName, industry, services, briefing: industrySignals });
  const heroImage = demoImageAssets.hero || resolveDemoImageAsset({ businessName, industry, services, briefing: industrySignals });
  const inputSignals = [combinedBriefing, websiteUrl, email, phone].filter((value) => cleanText(value).length > 12).length;
  const lowInputWarning = inputSignals < 2;
  const templateSections = packageRules.sections;
  const pages = packageRules.pages;
  const siteUrl = normalizeSiteUrl(websiteUrl, businessName);
  const projectSlug = slugifySite(businessName || websiteUrl || "website-preview");
  const title = `${businessName} - ${industryProfile.label}`;
  const description = `${businessName} presenteert ${industryProfile.label.toLowerCase()} met een premium uitstraling, duidelijke actieknoppen en een route naar contact.`;
  const siteAssets = buildSiteAssets({ businessName, industryProfile, services, colors, heroImage, demoImageAssets, projectSlug });
  const html = renderHtml({ businessName, contactName, email, phone, websiteUrl, siteUrl, industry, industryProfile, services, pricingPackages, benefits, processSteps, cta, colors, style, title, description, lowInputWarning, packageType, packageRules, heroImage, siteAssets, currentWebsite, googleReviews, googleRating, googleRatingTotal, googleMapsUrl });
  const css = renderCss(colors);
  const script = renderScript({ businessName, email, services, industryProfile });
  const sitemap = renderSitemap({ siteUrl, pages });
  const robots = renderRobots({ siteUrl });
  const htaccess = renderHtaccess();
  const briefingJson = {
    businessName,
    contactName,
    email,
    phone,
    websiteUrl,
    industry,
    industryProfile: industryProfile.key,
    industryProfileLabel: industryProfile.label,
    projectSlug,
    siteUrl,
    style,
    colors,
    services,
    pricingPackages,
    pricingSource: pricingPackages.length ? pricingPackages[0].source || "website_scan_or_intake" : "",
    benefits,
    processSteps,
    factoryConfig,
    packageType,
    packageId: factoryConfig.package.id,
    packageName: factoryConfig.package.name,
    packagePositioning: factoryConfig.package.positioning,
    packageLabel: packageRules.label,
    packagePrice: packageRules.price,
    packageManifest: factoryConfig.package,
    industryId: factoryConfig.industry.id,
    industryName: factoryConfig.industry.name,
    industryManifest: factoryConfig.industry,
    resolvedRules: factoryConfig.rules,
    resolvedComponents: factoryConfig.components,
    assetRequirements: factoryConfig.assets,
    manifestSources: factoryConfig.sources,
    packageRules,
    heroImage,
    demoImageAssets,
    currentWebsite,
    googleReviews,
    googleRating,
    googleRatingTotal,
    googleMapsUrl,
    websiteAnalysisScore: websiteAnalysis?.ok ? websiteAnalysis.score : null,
    localAssets: siteAssets.map(({ path, kind, service }) => ({ path, kind, service })),
    generatedPages: pages,
    generatedSections: templateSections,
    template: packageRules.template,
    templateUsed: packageRules.template,
    visualDirection: "premium industry landing page",
    templateSections,
    lowInputWarning,
    warnings: lowInputWarning ? ["Weinig klantinput beschikbaar; premium branchecopy en veilige demo-assets gebruikt."] : [],
    customerWishes: combinedBriefing,
    sourceWebsiteContent: currentWebsiteText,
    desiredPages: pages,
    ctaPreference: cta,
    version,
  };
  const assetsMap = {
    logo: siteAssets.find((asset) => asset.kind === "logo")?.path || "text-brand",
    palette: colors,
    industryProfile: industryProfile.key,
    package: {
      id: factoryConfig.package.id,
      name: factoryConfig.package.name,
      positioning: factoryConfig.package.positioning,
      price: factoryConfig.package.price,
      seo: factoryConfig.rules.seo,
      animations: factoryConfig.rules.animations,
      pages: factoryConfig.pages,
      components: factoryConfig.components,
      source: factoryConfig.sources.packageManifest,
    },
    industry: {
      id: factoryConfig.industry.id,
      name: factoryConfig.industry.name,
      tone: factoryConfig.industry.tone,
      colorHints: factoryConfig.industry.colorHints,
      trustSignals: factoryConfig.industry.trustSignals,
      assetKeywords: factoryConfig.industry.assetKeywords,
      source: factoryConfig.sources.industryManifest,
    },
    hero: {
      type: "demo-image-library",
      promptReady: true,
      slug: heroImage.slug,
      src: heroImage.src,
      alt: heroImage.alt,
      subject: `${businessName} ${industry}`,
    },
    roleImages: demoImageAssets,
    serviceVisuals: services.map((service, index) => ({
      service,
      type: "demo-image-library",
      src: siteAssets.find((asset) => asset.service === service)?.path || demoImageAssets.service?.src || heroImage.src,
      alt: `${service} door ${businessName}`,
    })),
    sectionVisuals: [
      "full-width hero image",
      "conversion contact bar",
      "visual service/project tiles",
      "dark premium process band",
      "large contact/offerte panel",
    ],
    futureImageSlots: ["project-gallery", "team-photo", "review-background", "social-preview"],
  };
  const contentFiles = [
    { path: "index.html", content: html },
    ...pages.filter((page) => page !== "index.html").map((page) => ({
      path: page,
      content: renderSubPage({ page, businessName, contactName, email, phone, websiteUrl, siteUrl, industry, industryProfile, services, pricingPackages, benefits, processSteps, cta, colors, packageRules, heroImage, siteAssets }),
    })),
  ];
  const readme = [
    `# ${businessName} preview V${version}`,
    "",
    "Interne website-preview voorbereid door de Website Factory.",
    "",
    "## Inhoud",
    "- index.html",
    "- styles.css",
    "- script.js",
    "- assets-map.json",
    "- briefing.json",
    "- README.md",
    "",
    `Pakket: ${packageRules.label} (€${packageRules.price})`,
    `Positionering: ${factoryConfig.package.positioning || "-"}`,
    `Template: ${packageRules.template}`,
    `Pagina's: ${pages.join(", ")}`,
    pricingPackages.length ? `Gevonden prijzen/pakketten: ${pricingPackages.map((item) => `${item.name} ${item.price}`).join(", ")}` : "Gevonden prijzen/pakketten: geen betrouwbare prijsregels gevonden.",
    `Brancheprofiel: ${industryProfile.label}`,
    `Resolved package: ${factoryConfig.package.id}`,
    `Resolved industry: ${factoryConfig.industry.id}`,
    `SEO niveau: ${factoryConfig.rules.seo}`,
    `Animaties: ${factoryConfig.rules.animations}`,
    lowInputWarning ? "Let op: weinig klantinput beschikbaar; de preview gebruikt premium branchecopy en veilige demo-assets." : "Inputniveau: voldoende voor branchegerichte eerste preview.",
    "",
    "Controleer de preview intern voordat deze naar de klant gaat.",
  ].join("\n");

  return {
    version,
    generatedAt: new Date().toISOString(),
    businessName,
    packageType,
    files: [
      ...contentFiles,
      { path: "styles.css", content: css },
      { path: "script.js", content: script },
      { path: "sitemap.xml", content: sitemap },
      { path: "robots.txt", content: robots },
      { path: ".htaccess", content: htaccess },
      ...siteAssets.filter((asset) => asset.content).map(({ path, content }) => ({ path, content })),
      { path: "assets-map.json", content: JSON.stringify(assetsMap, null, 2) },
      { path: "briefing.json", content: JSON.stringify(briefingJson, null, 2) },
      { path: "README.md", content: readme },
    ],
    meta: briefingJson,
  };
}

function normalizeCurrentWebsiteSnapshot(value = null) {
  const source = value && typeof value === "object" ? value : {};
  const cleanList = (items = [], limit = 8) => Array.isArray(items)
    ? items.map(cleanText).filter(Boolean).slice(0, limit)
    : [];
  const pricingItems = Array.isArray(source.pricingItems || source.prices || source.packages)
    ? (source.pricingItems || source.prices || source.packages).map(normalizePricingPackage).filter(Boolean).slice(0, 8)
    : [];
  return {
    sourceUrl: cleanText(source.sourceUrl || source.finalUrl || source.url),
    title: cleanText(source.title),
    metaDescription: cleanText(source.metaDescription),
    h1: cleanText(source.h1),
    headings: cleanList(source.headings, 10),
    paragraphs: cleanList(source.paragraphs, 8),
    pricingItems,
    imageUrls: cleanList(source.imageUrls || source.images, 8),
    socialUrls: cleanList(source.socialUrls || source.socials, 8),
    extractedAt: cleanText(source.extractedAt),
  };
}

function normalizeGoogleReviews(value = []) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source.map((review) => {
    if (!review || typeof review !== "object") return null;
    const text = cleanText(review.text || review.reviewText || review.body);
    const author = cleanText(review.author || review.authorName || review.author_name || review.displayName || "Google reviewer");
    if (!text || text.length < 12) return null;
    const key = `${author}|${text.slice(0, 80)}`.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      author,
      text: text.slice(0, 280),
      rating: cleanText(review.rating),
      relativeTime: cleanText(review.relativeTime || review.relative_time_description || review.publishTime || review.timeDescription),
      source: "Google Reviews",
    };
  }).filter(Boolean).slice(0, 3);
}

function extractPricingPackages({ currentWebsite = {}, briefing = "", services = [], industryProfile = null } = {}) {
  const fromWebsite = Array.isArray(currentWebsite.pricingItems)
    ? currentWebsite.pricingItems.map((item) => normalizePricingPackage({ ...item, source: "current_website_scan" })).filter(Boolean)
    : [];
  const fromBriefing = extractPricingPackagesFromText(briefing).map((item) => ({ ...item, source: "manual_intake_or_briefing" }));
  const seen = new Set();
  return [...fromWebsite, ...fromBriefing].filter((item) => {
    const normalized = normalizePricingPackage(item, services);
    if (!normalized) return false;
    if (!isTrustedPricingForIndustry(normalized, industryProfile)) return false;
    const key = `${normalized.name}|${normalized.price}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    Object.assign(item, normalized);
    return true;
  }).slice(0, 6);
}

function isTrustedPricingForIndustry(item = {}, industryProfile = null) {
  const text = `${item.name || ""} ${item.description || ""} ${item.sourceText || ""}`.toLowerCase();
  const internalWebsiteSignals = [
    "websitepakket",
    "starter site",
    "business site",
    "premium website",
    "website bouwen",
    "website laten maken",
    "demo focus",
    "preview",
    "cta voorkeur",
    "klinkt best aardig",
    "helemaal compleet",
    "vind je het niks",
    "kleine vergoeding",
    "max webstudio",
  ];
  if (internalWebsiteSignals.some((signal) => text.includes(signal))) return false;
  if (!isDrivingSchoolProfile(industryProfile)) return true;
  const drivingSignals = ["rijles", "rijlessen", "rijschool", "verkeersschool", "scooter", "bromfiets", "auto", "autorijles", "theorie", "examen", "cbr", "proefles", "lespakket", "les"];
  return drivingSignals.some((signal) => text.includes(signal));
}

function normalizePricingPackage(item = {}, services = []) {
  if (!item || typeof item !== "object") return null;
  const serviceList = Array.isArray(services) ? services : [];
  const rawName = cleanText(item.name || item.title || item.label);
  const rawPrice = cleanText(item.price || item.amount || item.tariff || item.tarief);
  const price = normalizePriceText(rawPrice || cleanText(item.sourceText || "").match(pricePattern())?.[0]);
  if (!price) return null;
  const serviceFallback = serviceList.find((service) => cleanText(item.sourceText || item.description || "").toLowerCase().includes(String(service).toLowerCase()));
  const name = cleanText(rawName || serviceFallback || "Pakket").replace(/\s+/g, " ").slice(0, 70);
  const description = cleanText(item.description || item.sourceText || "Prijs gevonden op basis van de huidige website of intake. Controleer voor publicatie.").slice(0, 170);
  return {
    name,
    price,
    description,
    source: cleanText(item.source || "website_scan_or_intake"),
    confidence: cleanText(item.confidence || "medium"),
  };
}

function extractPricingPackagesFromText(text = "") {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => cleanText(line.replace(/^[-*]\s*/, "")))
    .filter(Boolean);
  const items = [];
  const pattern = pricePattern();
  lines.forEach((line, index) => {
    if (!/(prijs|prijzen|pakket|pakketten|tarief|kosten|€|euro|eur|vanaf)/i.test(line)) return;
    const match = line.match(pattern);
    if (!match) return;
    const name = cleanText(line.replace(match[0], "").replace(/^(prijzen?|pakketten?|tarieven?|kosten|productPricing|producten\/pakketten\/prijzen):\s*/i, "").replace(/[:|-]+$/g, "")) || cleanText(lines[index - 1]) || "Pakket";
    items.push({
      name,
      price: normalizePriceText(match[0]),
      description: cleanText(lines[index + 1] || line),
      confidence: "manual",
    });
  });
  return items;
}

function pricePattern() {
  return /(?:vanaf\s*)?(?:€|\beur\b|\beuro\b)\s?\d{1,5}(?:[.,]\d{2})?(?:\s*(?:,-|p\/m|per maand|\/\s?(?:maand|mnd|uur|les|sessie|behandeling|jaar)))?|\d{1,5}(?:[.,]\d{2})?\s*(?:€|euro|eur)(?:\s*(?:p\/m|per maand|\/\s?(?:maand|mnd|uur|les|sessie|behandeling|jaar)))?/i;
}

function normalizePriceText(value = "") {
  const price = cleanText(value).replace(/\beur\b/i, "euro");
  if (!price || !/\d/.test(price)) return "";
  return price.replace(/^euro\s*/i, "€").replace(/\s+/g, " ");
}

function runQualityCheck({ generatedPackage = {}, journey = {} }) {
  const files = Array.isArray(generatedPackage.files) ? generatedPackage.files : [];
  const html = fileContent(files, "index.html");
  const css = fileContent(files, "styles.css");
  const script = fileContent(files, "script.js");
  const businessName = cleanText(generatedPackage.businessName || journey.businessName || journey.business_name);
  const services = generatedPackage.meta?.services || [];
  const packageRules = generatedPackage.meta?.packageRules || resolvePackageRules(generatedPackage.meta?.packageType);
  const packageId = generatedPackage.meta?.packageId || generatedPackage.meta?.packageManifest?.id || generatedPackage.meta?.packageType || "starter";
  const industryId = generatedPackage.meta?.industryId || generatedPackage.meta?.industryManifest?.id || generatedPackage.meta?.industryProfile || "local";
  const sectionCount = (html.match(/<section\b/gi) || []).length;
  const serviceCardCount = (html.match(/class="[^"]*service-card/gi) || []).length;
  const benefitCount = (html.match(/class="[^"]*benefit-card/gi) || []).length;
  const htmlPageCount = files.filter((file) => file.path.endsWith(".html")).length;
  const assetCount = files.filter((file) => file.path.startsWith("assets/")).length;
  const hasFile = (path) => files.some((file) => file.path === path);
  const checks = [
    check("Hero aanwezig", /<header[\s\S]*class="[^"]*hero/i.test(html) || /<section[\s\S]*class="[^"]*hero/i.test(html), 10),
    check("Hero visual aanwezig", /class="[^"]*hero/i.test(html) && /<img[^>]+src=/i.test(html), 12),
    check("Contact direct zichtbaar", /class="[^"]*contact-bar/i.test(html) && /(Direct bellen|Contactformulier|Afspraak)/i.test(html), 10),
    check("CTA aanwezig", /class="[^"]*button/i.test(html) && /(contact|advies|afspraak|kennismaking|offerte)/i.test(html), 10),
    check("Dienstensectie aanwezig", /id="diensten"|Diensten|Onze aanpak/i.test(html), 10),
    check("Minimaal vijf secties", sectionCount >= 5, 10),
    check("Pakket pagina-aantal klopt", htmlPageCount >= packageRules.pages.length, 12),
    check("Minimaal drie diensten", serviceCardCount >= 3, 8),
    check("Minimaal drie voordelen", benefitCount >= 3, 8),
    check("Werkwijze aanwezig", /id="werkwijze"|Zo werkt|Werkwijze/i.test(html), 8),
    check("Reviews of vertrouwen aanwezig", /id="reviews"|review|vertrouwen/i.test(html), 8),
    check("Contactsectie aanwezig", /id="contact"|mailto:|tel:/i.test(html), 10),
    check("Footer aanwezig", /<footer/i.test(html), 8),
    check("Meta title aanwezig", /<title>[^<]{8,}<\/title>/i.test(html), 7),
    check("Meta description aanwezig", /<meta\s+name="description"\s+content="[^"]{20,}"/i.test(html), 7),
    check("Responsive viewport aanwezig", /<meta\s+name="viewport"/i.test(html), 7),
    check("Geen lorem ipsum", !/lorem ipsum|dolor sit amet/i.test(html), 8),
    check("Geen lege placeholders", !/\[placeholder\]|\{\{|\}\}|TODO|Preview wordt voorbereid|Voorbeeldreview|Vervang deze later/i.test(html), 8),
    check("Geen interne AI-termen", !/\bAI\b|Codex/i.test(html), 8),
    check("Bedrijfsnaam aanwezig", businessName && html.toLowerCase().includes(businessName.toLowerCase()), 7),
    check("CTA niet leeg", />\s*(Plan|Vraag|Neem|Bel|Start|Bekijk)[^<]+</i.test(html), 4),
    check("HTML basis klopt", /<!doctype html>/i.test(html) && /<\/html>/i.test(html) && /<\/body>/i.test(html), 6),
    check("Script statisch veilig", script ? !/document\.write|eval\(|fetch\(/i.test(script) : true, 4),
    check("Branche of diensten aanwezig", services.some((service) => html.toLowerCase().includes(String(service).toLowerCase())) || /branche|diensten/i.test(html), 8),
    check("Geen kale preview", css.length > 3500 && html.length > 6000, 10),
    check("CSS aanwezig", css.length > 1200, 6),
    check("Lokale assets aanwezig", assetCount >= 4 && hasFile("assets/hero.svg") && hasFile("assets/logo.svg"), 10),
    check("SEO pakket aanwezig", hasFile("sitemap.xml") && hasFile("robots.txt") && hasFile(".htaccess"), 8),
    check("Favicon en social preview aanwezig", hasFile("assets/favicon.svg") && hasFile("assets/og-image.svg"), 7),
    check("Aanvraagformulier werkt zonder backend", /requestForm/.test(script) && /mailto:/.test(script), 6),
    check("Geen automatische live upload", !/ftp|sftp|netlify\s+deploy|fetch\(|XMLHttpRequest|PUT|POST/i.test(script), 10),
  ];
  const maxScore = checks.reduce((sum, item) => sum + item.weight, 0);
  const earned = checks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
  const score = Math.round((earned / maxScore) * 100);
  return {
    score,
    passed: score >= 70,
    status: score >= 70 ? "completed" : "quality_failed",
    summary: score >= 70 ? "Preview klaar voor interne controle." : "Preview heeft aandacht nodig voordat deze klantklaar is.",
    checks,
    packageId,
    industryId,
    packageChecks: buildPackageChecks({ packageId, generatedPackage, html, files }),
    industryChecks: buildIndustryChecks({ industryId, generatedPackage, html }),
  };
}

function buildPackageChecks({ packageId, generatedPackage, html, files }) {
  const components = generatedPackage.meta?.resolvedComponents || generatedPackage.meta?.packageManifest?.components || {};
  const hasFile = (path) => files.some((file) => file.path === path);
  const assetCount = files.filter((file) => file.path.startsWith("assets/")).length;
  const isBusiness = /business|professional/.test(packageId);
  const isPremium = /premium/.test(packageId);
  return {
    packageId,
    hero: /class="[^"]*hero/i.test(html),
    services: /class="[^"]*service-card/i.test(html),
    contact: /id="contact"|mailto:|tel:/i.test(html),
    cta: /class="[^"]*button/i.test(html),
    portfolioExpected: Boolean(components.portfolio),
    portfolioReady: !components.portfolio || /id="portfolio"|gallery|projecten/i.test(html),
    reviewsExpected: Boolean(components.reviews),
    reviewsReady: !components.reviews || /review|vertrouwen/i.test(html),
    faqExpected: Boolean(components.faq),
    faqPrepared: !components.faq || isBusiness || isPremium,
    premiumGrowthPrepared: !isPremium || Boolean(components.leadMagnet || components.blog || components.landingPages),
    assetRequirementReady: assetCount >= Number(generatedPackage.meta?.assetRequirements?.heroImages || 1),
    seoFilesReady: hasFile("sitemap.xml") && hasFile("robots.txt") && hasFile(".htaccess"),
  };
}

function buildIndustryChecks({ industryId, generatedPackage, html }) {
  const industry = generatedPackage.meta?.industryManifest || {};
  const services = industry.services || generatedPackage.meta?.services || [];
  return {
    industryId,
    branchNamePresent: Boolean(industry.name || industry.label),
    toneConfigured: Boolean(industry.tone || industry.copy?.intro),
    paletteConfigured: Boolean(industry.palette || industry.colors),
    servicesConfigured: services.length >= 3,
    servicesRendered: services.some((service) => html.toLowerCase().includes(String(service).toLowerCase())),
    trustSignalsConfigured: Array.isArray(industry.trustSignals) && industry.trustSignals.length > 0,
    assetKeywordsConfigured: Array.isArray(industry.assetKeywords) && industry.assetKeywords.length > 0,
  };
}

function buildLogs(...entries) {
  return entries.flat().filter(Boolean).map((entry, index) => ({
    index: index + 1,
    at: entry.at || new Date().toISOString(),
    step: entry.step || "factory",
    message: entry.message || String(entry),
  }));
}

function nextPreviewVersion(versions = [], jobs = []) {
  const versionNumbers = [
    ...versions.map((item) => Number(item.version || item.preview_version || 0)),
    ...jobs.map((item) => Number(item.previewVersion || item.preview_version || 0)),
  ].filter(Number.isFinite);
  return Math.max(0, ...versionNumbers) + 1;
}

function previewUrlFor({ journeyId, token }) {
  return `/.netlify/functions/demo-preview?id=${encodeURIComponent(journeyId)}&token=${encodeURIComponent(token)}`;
}

function makePreviewToken() {
  return crypto.randomBytes(18).toString("hex");
}

function normalizeBuildJob(row = {}) {
  return {
    id: cleanText(row.id),
    demoJourneyId: cleanText(row.demo_journey_id),
    leadId: cleanText(row.lead_id),
    customerId: cleanText(row.customer_id),
    status: cleanText(row.status),
    currentStep: cleanText(row.current_step),
    progress: Number(row.progress || 0),
    previewVersion: Number(row.preview_version || 1),
    previewUrl: cleanText(row.preview_url),
    previewToken: cleanText(row.preview_token),
    previewScore: row.preview_score === null || row.preview_score === undefined ? null : Number(row.preview_score),
    qualityReport: row.quality_report && typeof row.quality_report === "object" ? row.quality_report : null,
    generatedPackage: row.generated_package && typeof row.generated_package === "object" ? row.generated_package : null,
    buildLogs: Array.isArray(row.build_logs) ? row.build_logs : [],
    errorMessage: cleanText(row.error_message),
    startedAt: cleanText(row.started_at),
    finishedAt: cleanText(row.finished_at),
    createdBy: cleanText(row.created_by),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function normalizePreviewVersion(row = {}) {
  return {
    id: cleanText(row.id),
    demoJourneyId: cleanText(row.demo_journey_id),
    buildJobId: cleanText(row.build_job_id),
    version: Number(row.version || 1),
    previewUrl: cleanText(row.preview_url),
    previewToken: cleanText(row.preview_token),
    previewScore: row.preview_score === null || row.preview_score === undefined ? null : Number(row.preview_score),
    qualityReport: row.quality_report && typeof row.quality_report === "object" ? row.quality_report : null,
    generatedPackage: row.generated_package && typeof row.generated_package === "object" ? row.generated_package : null,
    isActive: row.is_active !== false,
    createdAt: cleanText(row.created_at),
    createdBy: cleanText(row.created_by),
  };
}

function isBuildStatus(value = "") {
  return BUILD_STATUSES.has(cleanText(value));
}

function check(label, passed, weight) {
  return { label, passed: Boolean(passed), weight };
}

function fileContent(files, path) {
  return String(files.find((file) => file.path === path)?.content || "");
}

function extractField(text = "", labels = []) {
  const lines = String(text || "").split(/\r?\n/);
  for (const label of labels) {
    const line = lines.find((item) => item.toLowerCase().startsWith(label.toLowerCase()));
    if (line) return cleanText(line.split(":").slice(1).join(":"));
  }
  return "";
}

function extractSectionItems(text = "", headings = []) {
  const lines = String(text || "").split(/\r?\n/);
  const normalizedHeadings = headings.map((heading) => heading.toLowerCase());
  const items = [];
  let active = false;
  for (const rawLine of lines) {
    const line = cleanText(rawLine);
    if (!line) {
      if (active && items.length) break;
      continue;
    }
    const lower = line.toLowerCase().replace(/:$/, "");
    const startsSection = normalizedHeadings.some((heading) => lower === heading || lower.startsWith(`${heading}:`));
    if (startsSection) {
      active = true;
      const inlineValue = line.includes(":") ? cleanText(line.split(":").slice(1).join(":")) : "";
      if (inlineValue) items.push(...inlineValue.split(/[,;]/).map(cleanText).filter(Boolean));
      continue;
    }
    if (active && /^[A-Z0-9 /&-]{4,}$/.test(line) && !/^[-*•]/.test(line)) break;
    if (!active) continue;
    const value = line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
    if (value) items.push(...value.split(/[,;]/).map(cleanText).filter(Boolean));
  }
  return mergeUnique(items).slice(0, 8);
}

function extractServices(text = "", industry = "") {
  const normalized = `${text} ${industry}`.toLowerCase();
  const briefingServices = extractSectionItems(text, ["diensten / aanbod", "diensten", "belangrijkste diensten", "services"]);
  if (briefingServices.length) return briefingServices;
  if (/rijschool|verkeersschool|rijles|autorijles|scooter|scooterrijbewijs|bromfiets|examengarantie|praktijkexamen|theorie|cbr/.test(normalized)) return ["Scooterrijles", "Autorijles", "Examengarantie", "Theoriebegeleiding"];
  if (/bouw|timmer|renovatie|aannemer/.test(normalized)) return ["Renovatie", "Maatwerk", "Projectbegeleiding"];
  if (/restaurant|horeca|cafe|catering/.test(normalized)) return ["Menu", "Reserveren", "Catering"];
  if (/sportschool|fitness|personal trainer/.test(normalized)) return ["Proefles", "Rooster", "Membership"];
  if (/advocaat|advocatuur|juridisch|jurist/.test(normalized)) return ["Arbeidsrecht", "Ondernemingsrecht", "Intake"];
  if (/autoairco|auto-airco|auto airco/.test(normalized)) return ["Airco service", "Airco onderhoud", "Diagnose", "Reparatie", "Afspraak maken"];
  if (/autobedrijf|garage|automotive|occasion|apk|autoservice/.test(normalized)) return ["Onderhoud", "APK", "Diagnose", "Reparatie", "Occasions"];
  if (/tandarts|mondzorg/.test(normalized)) return ["Controle", "Preventie", "Esthetiek"];
  if (/elektricien|elektra|groepenkast/.test(normalized)) return ["Storingen", "Groepenkast", "Laadpaal"];
  if (/loodgieter|lekkage|sanitair|cv/.test(normalized)) return ["Lekkage", "CV", "Sanitair"];
  if (/hovenier|tuin|groen/.test(normalized)) return ["Tuinontwerp", "Aanleg", "Onderhoud"];
  if (/schoonmaak|vve|oplevering/.test(normalized)) return ["Kantoor", "VvE", "Oplevering"];
  if (/verhuis|transport|opslag/.test(normalized)) return ["Particulier", "Zakelijk", "Opslag"];
  if (/dierenarts|dierenzorg|kliniek/.test(normalized)) return ["Consult", "Vaccinatie", "Spoed"];
  if (/hotel|b&b|hospitality|kamer/.test(normalized)) return ["Kamers", "Arrangementen", "Boeken"];
  if (/financieel|hypotheek|accountant|belasting/.test(normalized)) return ["Hypotheek", "Financieel plan", "Belasting"];
  if (/fysiotherapie|fysiotherapeut|revalidatie/.test(normalized)) return ["Sport", "Revalidatie", "Pijnklachten"];
  if (/kinderopvang|bso|peuteropvang/.test(normalized)) return ["Dagopvang", "BSO", "Rondleiding"];
  if (/kapper|salon|beauty/.test(normalized)) return ["Behandelingen", "Afspraak maken", "Stylingadvies"];
  if (/installatie|elektra|loodgieter/.test(normalized)) return ["Installatie", "Onderhoud", "Spoedservice"];
  if (/coach|advies|consult/.test(normalized)) return ["Coaching", "Strategie", "Trajecten"];
  return ["Advies", "Uitvoering", "Service"];
}

function inferIndustry(text = "", businessName = "") {
  const normalized = `${text} ${businessName}`.toLowerCase();
  if (/rijschool|verkeersschool|rijles|autorijles|scooter|scooterrijbewijs|bromfiets|examengarantie|praktijkexamen|theorie|cbr/.test(normalized)) return "rijschool";
  if (/bouw|timmer|renovatie|aannemer/.test(normalized)) return "bouw en renovatie";
  if (/restaurant|horeca|cafe/.test(normalized)) return "horeca";
  if (/sportschool|fitness|personal trainer/.test(normalized)) return "fitness";
  if (/advocaat|advocatuur|juridisch|jurist/.test(normalized)) return "advocatuur";
  if (/autoairco|auto-airco|auto airco|autobedrijf|garage|automotive|occasion|apk|autoservice/.test(normalized)) return "automotive";
  if (/tandarts|mondzorg/.test(normalized)) return "tandarts";
  if (/elektricien|elektra|groepenkast/.test(normalized)) return "elektricien";
  if (/loodgieter|lekkage|sanitair|cv/.test(normalized)) return "loodgieter";
  if (/hovenier|tuin|groen/.test(normalized)) return "hovenier";
  if (/schoonmaak|vve|oplevering/.test(normalized)) return "schoonmaak";
  if (/verhuis|transport|opslag/.test(normalized)) return "verhuisbedrijf";
  if (/dierenarts|dierenzorg|kliniek/.test(normalized)) return "dierenarts";
  if (/hotel|b&b|hospitality|kamer/.test(normalized)) return "hotel";
  if (/financieel|hypotheek|accountant|belasting/.test(normalized)) return "financieel advies";
  if (/fysiotherapie|fysiotherapeut|revalidatie/.test(normalized)) return "fysiotherapie";
  if (/kinderopvang|bso|peuteropvang/.test(normalized)) return "kinderopvang";
  if (/kapper|salon|beauty/.test(normalized)) return "beauty en verzorging";
  if (/installatie|elektra|loodgieter/.test(normalized)) return "installatie en onderhoud";
  if (/coach|advies|consult/.test(normalized)) return "advies en coaching";
  return "dienstverlening";
}

function resolveIndustryProfile({ industry = "", briefing = "", businessName = "" } = {}) {
  const text = `${industry} ${briefing} ${businessName}`.toLowerCase();
  const scored = [...WEBSITE_FACTORY_MANIFESTS.industries, ...INDUSTRY_PROFILES]
    .map((item) => ({
      profile: item,
      score: item.keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score);
  return scored[0]?.score > 0 ? scored[0].profile : WEBSITE_FACTORY_MANIFESTS.industries.find((item) => item.key === "local") || INDUSTRY_PROFILES.find((item) => item.key === "local");
}

function mergeUnique(...groups) {
  const seen = new Set();
  return groups.flat().map(cleanText).filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isUsableServiceLabel(value = "") {
  const text = cleanText(value);
  if (!text) return false;
  if (/^https?:\/\//i.test(text) || /^[\w.-]+@[\w.-]+\.[a-z]{2,}$/i.test(text)) return false;
  if (/^(naam|branche|regio|website|contact|telefoon|e-mail|email|bedrijf|doelgroep|output|cta|call to action)\s*:/i.test(text)) return false;
  if (text.length > 70) return false;
  return /[a-zA-ZÀ-ÿ]/.test(text);
}

function extractLocationText(value = "") {
  const text = cleanText(value);
  const parts = text.split(/[|,/]/).map((item) => cleanText(item)).filter(Boolean);
  return parts.find((part) => /regio|plaats|omgeving|nederland|amsterdam|rotterdam|utrecht|almere|breda|den haag|eindhoven|alkmaar|haarlem/i.test(part)) || "Regio";
}

function inferCta(text = "", profile = null) {
  const normalized = text.toLowerCase();
  if (/rijschool|rijles|scooter|scooterrijbewijs|examengarantie|proefles|cbr/.test(normalized)) return "Plan een proefles";
  if (/offerte/.test(normalized)) return "Vraag een offerte aan";
  if (/afspraak|bel/.test(normalized)) return "Plan een kennismaking";
  if (/reserver/.test(normalized)) return "Reserveer direct";
  return profile?.cta || "Neem contact op";
}

function inferColors(industry = "", profile = null) {
  if (profile?.colors) return profile.colors;
  const normalized = industry.toLowerCase();
  if (/rijschool|verkeersschool|rijles|scooter/.test(normalized)) return { ink: "#102033", brand: "#1457c8", accent: "#22c55e", soft: "#f3f8ff", dark: "#0f2238" };
  if (/bouw|installatie/.test(normalized)) return { ink: "#172033", brand: "#1d7c68", accent: "#f1b84b", soft: "#f5f7fb", dark: "#20342b" };
  if (/horeca/.test(normalized)) return { ink: "#201a17", brand: "#9a3f2f", accent: "#e3b261", soft: "#fbf7f2", dark: "#271b15" };
  if (/beauty/.test(normalized)) return { ink: "#241b2f", brand: "#8a5574", accent: "#d6ad8f", soft: "#fbf7fa", dark: "#2c2028" };
  return { ink: "#132238", brand: "#2563eb", accent: "#14b8a6", soft: "#f6f8fb", dark: "#102033" };
}

function inferStyle(text = "") {
  if (/modern|strak|minimal/i.test(text)) return "modern en strak";
  if (/warm|persoonlijk|vertrouwen/i.test(text)) return "warm en betrouwbaar";
  return "premium en conversiegericht";
}

function normalizePackageType(value = "") {
  const text = cleanText(value).toLowerCase();
  if (/premium|1750|uitgebreid|growth|enterprise/.test(text)) return "premium";
  if (/business|995|professional|professioneel|plus|multi/.test(text)) return "business";
  return "starter";
}

function resolvePackageRules(packageType = "starter") {
  const key = cleanText(packageType) || "starter";
  return WEBSITE_FACTORY_MANIFESTS.packages[key]
    || (key === "professional" ? WEBSITE_FACTORY_MANIFESTS.packages.business : null)
    || PACKAGE_RULES[key]
    || PACKAGE_RULES.starter;
}

function slugifySite(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "website-preview";
}

function normalizeSiteUrl(websiteUrl = "", businessName = "") {
  const value = cleanText(websiteUrl);
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  if (value && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(value)) return `https://${value}`.replace(/\/$/, "");
  return `https://${slugifySite(businessName)}.nl`;
}

function assetPath(siteAssets = [], kind = "", fallback = "") {
  return siteAssets.find((asset) => asset.kind === kind)?.path || fallback;
}

function serviceAssetPath(siteAssets = [], service = "", fallback = "assets/hero.svg") {
  return siteAssets.find((asset) => asset.kind === "service" && asset.service === service)?.path || fallback;
}

function serviceSpecificDemoAsset({ service = "", industryProfile = {}, demoImageAssets = {}, heroImage = {} } = {}) {
  const profileKey = String(industryProfile.key || industryProfile.id || industryProfile.label || "").toLowerCase();
  const serviceText = String(service || "").toLowerCase();
  if (/rijschool|driving-school/.test(profileKey)) {
    const source = (fileName, slug) => ({
      src: `/assets/demo-images/library/rijschool/${fileName}`,
      slug: `rijschool-${slug}`,
    });
    if (/scooter|bromfiets/.test(serviceText)) return source("scooterles-kruispunt.png", "scooterles");
    if (/auto|rijles/.test(serviceText)) return source("auto-interieur-les.png", "autorijles");
    if (/theorie/.test(serviceText)) return source("theorieles.png", "theorie");
    if (/examen|garantie|cbr/.test(serviceText)) return source("geslaagd-moment.png", "examengarantie");
    if (/praktijk|begeleiding|instruct/.test(serviceText)) return source("instructeur-briefing.png", "instructeur");
  }
  const role = serviceImageRoleForText(serviceText, profileKey);
  return demoImageAssets[role] || demoImageAssets.service || heroImage;
}

function serviceImageRoleForText(serviceText = "", profileKey = "") {
  const text = `${serviceText} ${profileKey}`;
  if (/contact|bel|whatsapp|afspraak|reserver|boeken|aanmeld|inschrijf|intake|kennismaking|offerte|aanvraag/.test(text)) return "contact";
  if (/advies|consult|controle|diagnose|inspectie|check|taxatie|waardebepaling|huidadvies|strategie|plan/.test(text)) return "detail";
  if (/team|begeleiding|instruct|persoonlijk|coaching|praktijk|behandeling|therapie|mondzorg/.test(text)) return "team";
  if (/project|portfolio|renovatie|aanbouw|dak|kozijn|tuinontwerp|aanleg|nieuwbouw|woning|verkoop/.test(text)) return "project";
  if (/uitvoering|reparatie|onderhoud|apk|airco|installatie|laadpaal|warmtepomp|storing|storingen|lekkage|cv|service|spoed/.test(text)) return "service-alt";
  if (/resultaat|review|vertrouwen|garantie|geslaagd|preventie|nazorg/.test(text)) return "review";
  if (/menu|lunch|diner|arrangement|private dining|kamer|verblijf|interieur|sfeer/.test(text)) return "project-alt";
  return "service";
}

function buildSiteAssets({ businessName, industryProfile, services, colors, heroImage, demoImageAssets = {}, projectSlug }) {
  const palette = {
    ink: colors.ink || "#111827",
    brand: colors.brand || "#24382f",
    accent: colors.accent || "#c99a45",
    soft: colors.soft || "#f3efe8",
    dark: colors.dark || colors.brand || "#1f332a",
  };
  const serviceImageRoles = ["service", "service-alt", "project", "project-alt", "detail", "team", "contact", "review"];
  const usedServiceAssetPaths = new Set();
  const serviceAssets = services.slice(0, 6).map((service, index) => {
    const fallbackAsset = demoImageAssets[serviceImageRoles[index % serviceImageRoles.length]] || demoImageAssets.service || heroImage;
    let selectedAsset = serviceSpecificDemoAsset({ service, industryProfile, demoImageAssets, heroImage }) || fallbackAsset;
    if (selectedAsset?.src && usedServiceAssetPaths.has(selectedAsset.src)) {
      selectedAsset = serviceImageRoles
        .map((role) => demoImageAssets[role])
        .find((assetItem) => assetItem?.src && !usedServiceAssetPaths.has(assetItem.src)) || selectedAsset;
    }
    if (selectedAsset?.src) usedServiceAssetPaths.add(selectedAsset.src);
    return {
      path: selectedAsset.src || fallbackAsset.src,
      kind: "service",
      service,
      sourceSlug: selectedAsset.slug || fallbackAsset.slug,
    };
  });
  return [
    { path: "assets/logo.svg", kind: "logo", content: renderLogoSvg({ businessName, colors: palette }) },
    { path: "assets/favicon.svg", kind: "favicon", content: renderFaviconSvg({ businessName, colors: palette }) },
    { path: "assets/og-image.svg", kind: "og", content: renderOgSvg({ businessName, industryProfile, colors: palette }) },
    {
      path: heroImage.src,
      kind: "hero",
      sourceSlug: heroImage.slug,
    },
    ...["service", "team", "project", "contact", "service-alt", "project-alt", "detail", "review", "background"].map((role) => ({
      path: (demoImageAssets[role] || heroImage).src,
      kind: role,
      sourceSlug: (demoImageAssets[role] || heroImage).slug,
    })),
    ...serviceAssets,
  ];
}

function renderLogoSvg({ businessName, colors }) {
  const initials = cleanText(businessName).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MW";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="${escapeHtml(businessName)} logo"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${escapeHtml(colors.accent)}"/><stop offset="1" stop-color="${escapeHtml(colors.brand)}"/></linearGradient></defs><rect width="240" height="240" rx="18" fill="url(#g)"/><path d="M34 190V50h38l48 66 48-66h38v140h-38V109l-41 55h-14l-41-55v81z" fill="#fff"/></svg>`;
}

function renderFaviconSvg({ businessName, colors }) {
  const initial = (cleanText(businessName)[0] || "M").toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${escapeHtml(colors.brand)}"/><text x="32" y="42" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="900" fill="${escapeHtml(colors.accent)}">${escapeHtml(initial)}</text></svg>`;
}

function renderOgSvg({ businessName, industryProfile, colors }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="bg" x1="0" x2="1"><stop stop-color="${escapeHtml(colors.dark)}"/><stop offset="1" stop-color="${escapeHtml(colors.brand)}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#bg)"/><circle cx="1030" cy="110" r="240" fill="${escapeHtml(colors.accent)}" opacity=".2"/><text x="80" y="205" fill="${escapeHtml(colors.accent)}" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="900" letter-spacing="5">${escapeHtml(industryProfile.label.toUpperCase())}</text><text x="80" y="340" fill="#fff" font-family="Inter,Arial,sans-serif" font-size="86" font-weight="900">${escapeHtml(businessName)}</text><text x="80" y="430" fill="rgba(255,255,255,.78)" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="700">${escapeHtml(industryProfile.hero)}</text></svg>`;
}

function renderVisualSvg({ title, subtitle, colors, variant = 0, wide = false }) {
  const width = wide ? 1600 : 900;
  const height = wide ? 1100 : 700;
  const shapes = [
    `<rect x="${width * 0.48}" y="${height * 0.26}" width="${width * 0.38}" height="${height * 0.46}" fill="rgba(255,255,255,.17)"/><rect x="${width * 0.56}" y="${height * 0.36}" width="${width * 0.24}" height="${height * 0.26}" fill="rgba(0,0,0,.18)"/>`,
    `<circle cx="${width * 0.72}" cy="${height * 0.35}" r="${height * 0.22}" fill="rgba(255,255,255,.16)"/><rect x="${width * 0.2}" y="${height * 0.48}" width="${width * 0.58}" height="${height * 0.18}" fill="rgba(0,0,0,.18)"/>`,
    `<path d="M${width * 0.1} ${height * 0.68} L${width * 0.36} ${height * 0.36} L${width * 0.62} ${height * 0.68} Z" fill="rgba(255,255,255,.18)"/><path d="M${width * 0.42} ${height * 0.68} L${width * 0.68} ${height * 0.32} L${width * 0.92} ${height * 0.68} Z" fill="rgba(0,0,0,.14)"/>`,
  ][variant % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${escapeHtml(colors.dark)}"/><stop offset=".55" stop-color="${escapeHtml(colors.brand)}"/><stop offset="1" stop-color="${escapeHtml(colors.accent)}"/></linearGradient><radialGradient id="glow" cx="78%" cy="22%" r="55%"><stop stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="${width}" height="${height}" fill="url(#bg)"/><rect width="${width}" height="${height}" fill="url(#glow)"/><g opacity=".9">${shapes}</g><path d="M0 ${height * 0.82} C ${width * 0.25} ${height * 0.7}, ${width * 0.48} ${height}, ${width} ${height * 0.78} L ${width} ${height} L0 ${height}Z" fill="rgba(0,0,0,.25)"/><text x="${width * 0.075}" y="${height * 0.68}" fill="rgba(255,255,255,.76)" font-family="Inter,Arial,sans-serif" font-size="${wide ? 42 : 34}" font-weight="800">${escapeHtml(subtitle)}</text><text x="${width * 0.075}" y="${height * 0.76}" fill="#fff" font-family="Inter,Arial,sans-serif" font-size="${wide ? 72 : 56}" font-weight="950">${escapeHtml(title).slice(0, 42)}</text></svg>`;
}

function renderSitemap({ siteUrl, pages }) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((page) => `  <url><loc>${escapeHtml(siteUrl)}/${page === "index.html" ? "" : page}</loc></url>`).join("\n")}\n</urlset>\n`;
}

function renderRobots({ siteUrl }) {
  return `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

function renderHtaccess() {
  return `Options -Indexes\n<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteCond %{HTTPS} !=on\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]\n</IfModule>\n<IfModule mod_headers.c>\nHeader set X-Content-Type-Options "nosniff"\nHeader set Referrer-Policy "strict-origin-when-cross-origin"\n</IfModule>\n`;
}

function isDrivingSchoolProfile(profile = {}) {
  const text = `${profile?.key || ""} ${profile?.label || ""}`.toLowerCase();
  return text.includes("driving-school") || text.includes("rijschool") || text.includes("scooterles");
}

function demoCopyForIndustry(profile = {}, packageRules = PACKAGE_RULES.starter) {
  const defaults = {
    quickActionTitle: "Afspraak inplannen",
    quickActionText: "Stuur meteen een verzoek",
    contactActionTitle: "Contactformulier",
    contactActionText: "Vertel kort wat u wilt laten maken",
    servicesEyebrow: "Waarmee kunnen we helpen?",
    servicesTitle: "Kies uw project en bekijk verschillende oplossingen.",
    pricingEyebrow: "Pakketten & prijzen",
    pricingTitle: "Herkenbare prijzen direct meegenomen uit de huidige situatie.",
    pricingText: "Deze bedragen zijn voorbereid op basis van de bestaande website of intake. Controleer ze voor publicatie, zodat de nieuwe website precies aansluit op het actuele aanbod.",
    portfolioEyebrow: "Projectbeeld",
    portfolioTitle: "Bekijk de aanpak per dienst.",
    portfolioCopy: "Kies hierboven een dienst om een passende projectpresentatie te tonen.",
    benefitsEyebrow: "Voordelen",
    benefitsTitle: "Waarom klanten vertrouwen krijgen.",
    benefitsText: "De pagina legt de nadruk op duidelijkheid, betrouwbaarheid en een laagdrempelige route naar contact.",
    sourceEyebrow: "Bestaande website verbeterd",
    sourceTitle: "Herkenbare inhoud, sterker gepresenteerd.",
    sourceText: "Deze preview gebruikt de bestaande website als vertrekpunt en zet teksten, contactmomenten en beelden om naar een duidelijkere verkooproute.",
    premiumEyebrow: "Projecten",
    premiumTitle: "Bewijs dat kwaliteit meteen zichtbaar maakt.",
    premiumText: "De premium preview is voorbereid op projectcases, voor-na beelden en resultaatgerichte verhalen.",
    offerEyebrow: "Offerte",
    offerTitle: "Een aanvraagroute die voelt als een professioneel verkoopgesprek.",
    offerText: "Extra conversieblokken, projectbewijs en vertrouwen zorgen dat de bezoeker sneller de stap naar contact zet.",
    processEyebrow: "Zo werkt het",
    processTitle: "Van eerste idee naar een resultaat dat klaar voelt.",
    reviewsEyebrow: "Vertrouwen",
    reviewsTitle: "Gericht op een sterke eerste indruk.",
    reviewOneTitle: "\"Duidelijk, professioneel en makkelijk om contact op te nemen.\"",
    reviewOneText: "Klanten zien direct waar ze aan toe zijn en kunnen zonder zoeken de volgende stap zetten.",
    reviewTwoTitle: "\"De belangrijkste informatie staat meteen goed op volgorde.\"",
    reviewTwoText: "De combinatie van beeld, diensten en contactmomenten geeft vertrouwen vanaf de eerste klik.",
    contactEyebrow: "Vrijblijvende aanvraag",
    contactTitle: "Maak het makkelijk: vertel wat u wilt en ontvang snel reactie.",
    projectLabel: "Project",
    messageLabel: "Wat wilt u laten doen?",
    messagePlaceholder: "Vertel kort wat u wilt laten maken, wanneer u wilt starten en waar het project is.",
    subPageEyebrow: packageRules.label,
    subPageText: "presenteert hier extra informatie passend bij de gekozen website.",
    subPageIntro: "kan deze pagina later aanvullen met echte cases, foto's en klantreacties.",
    footerLabel: packageRules.label,
  };
  if (!isDrivingSchoolProfile(profile)) return defaults;
  return {
    ...defaults,
    quickActionTitle: "Proefles plannen",
    quickActionText: "Kies een passend moment",
    contactActionTitle: "Pakketadvies",
    contactActionText: "Vraag welke opleiding past",
    servicesEyebrow: "Rijlessen en pakketten",
    servicesTitle: "Kies je rijlespakket en bekijk de opties.",
    pricingEyebrow: "Lespakketten & prijzen",
    pricingTitle: "Lesprijzen en pakketten helder naast elkaar.",
    pricingText: "Gebruik alleen prijzen die bij de rijschool horen: scooter, auto, theorie, proefles of examengarantie. Controleer deze bedragen voor publicatie met het actuele aanbod.",
    portfolioEyebrow: "Opleiding per onderdeel",
    portfolioTitle: "Bekijk de aanpak per rijlespakket.",
    portfolioCopy: "Kies een lespakket om beeld, uitleg en vervolgstap te zien.",
    benefitsEyebrow: "Waarom deze rijschool",
    benefitsTitle: "Waarom leerlingen met vertrouwen starten.",
    benefitsText: "De pagina maakt duidelijk welke opleiding past, hoe de begeleiding werkt en hoe je snel een proefles plant.",
    sourceEyebrow: "Bestaande rijschoolwebsite verbeterd",
    sourceTitle: "Rijschoolinformatie sterker gepresenteerd.",
    sourceText: "Deze preview gebruikt de bestaande rijschoolwebsite als vertrekpunt en zet lessen, pakketten, exameninformatie en contactmomenten duidelijker neer.",
    premiumEyebrow: "Rijschool in beeld",
    premiumTitle: "Laat lessen, voertuigen en begeleiding direct vertrouwen geven.",
    premiumText: "De premium preview is voorbereid op lespakketten, leerlingervaringen, voertuigen en duidelijke examenroutes.",
    offerEyebrow: "Proefles aanvragen",
    offerTitle: "Een aanvraagroute die voelt als een heldere intake voor rijles.",
    offerText: "Leerlingen kiezen snel hun opleiding, laten gegevens achter en weten wat de volgende stap is.",
    processEyebrow: "Zo werkt rijles",
    processTitle: "Van proefles naar examen met duidelijke stappen.",
    reviewsEyebrow: "Vertrouwen",
    reviewsTitle: "Een eerste indruk die leerlingen geruststelt.",
    reviewOneTitle: "\"Ik zie meteen welke opleiding bij mij past.\"",
    reviewOneText: "Pakketten, proefles en exameninformatie staan duidelijk bij elkaar.",
    reviewTwoTitle: "\"Contact opnemen voelt makkelijk en laagdrempelig.\"",
    reviewTwoText: "De route naar proefles, WhatsApp of bellen blijft zichtbaar zonder te zoeken.",
    contactEyebrow: "Proefles of rijlespakket",
    contactTitle: "Plan een proefles of vraag welk pakket bij je past.",
    projectLabel: "Rijlespakket",
    messageLabel: "Waar wil je mee starten?",
    messagePlaceholder: "Vertel kort of je scooter, auto, theorie of examengarantie zoekt en wanneer je wilt starten.",
    subPageEyebrow: "Rijschoolinformatie",
    subPageText: "presenteert hier extra informatie over rijlessen, pakketten, proeflessen en examenbegeleiding.",
    subPageIntro: "kan deze pagina later aanvullen met echte lespakketten, slagingsinformatie, foto's en leerlingreviews.",
    footerLabel: "Rijlessen, proeflessen en examenbegeleiding",
  };
}

function navigationLinks(packageRules = PACKAGE_RULES.starter, profile = {}) {
  if (packageRules.navigation === "scroll") {
    if (isDrivingSchoolProfile(profile)) {
      return [
        { href: "#diensten", label: "Rijlessen" },
        { href: "#werkwijze", label: "Werkwijze" },
        { href: "#contact", label: "Proefles" },
      ];
    }
    return [
      { href: "#diensten", label: "Diensten" },
      { href: "#werkwijze", label: "Werkwijze" },
      { href: "#contact", label: "Contact" },
    ];
  }
  const links = [
    { href: "index.html", label: "Home" },
    { href: "over-ons.html", label: "Over ons" },
    { href: "diensten.html", label: "Diensten" },
  ];
  if (packageRules.pages.includes("projecten.html")) links.push({ href: "projecten.html", label: "Projecten" });
  if (packageRules.pages.includes("reviews.html")) links.push({ href: "reviews.html", label: "Reviews" });
  if (packageRules.pages.includes("offerte.html")) links.push({ href: "offerte.html", label: "Offerte" });
  links.push({ href: "contact.html", label: "Contact" });
  return links;
}

function renderHtml({ businessName, contactName, email, phone, websiteUrl, siteUrl, industry, industryProfile, services, pricingPackages = [], benefits, processSteps, cta, colors, style, title, description, lowInputWarning, packageRules, heroImage, siteAssets, currentWebsite = {}, googleReviews = [], googleRating = "", googleRatingTotal = "", googleMapsUrl = "" }) {
  const profile = industryProfile || resolveIndustryProfile({ industry, businessName });
  const demoCopy = demoCopyForIndustry(profile, packageRules);
  const navLinks = navigationLinks(packageRules, profile).map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("");
  const phoneHref = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : "#contact";
  const emailHref = email ? `mailto:${escapeHtml(email)}` : "#contact";
  const cityLine = extractLocationText(industry) || "uw regio";
  const logoAsset = assetPath(siteAssets, "logo", "");
  const faviconAsset = assetPath(siteAssets, "favicon", "");
  const ogAsset = assetPath(siteAssets, "og", "");
  const heroAsset = assetPath(siteAssets, "hero", heroImage.src);
  const serviceTiles = services.slice(0, packageRules.pages.length >= 7 ? 6 : 5).map((service, index) => `
        <a class="project-tile service-card" href="#portfolio" data-service="${escapeHtml(service)}">
          <img src="${escapeHtml(serviceAssetPath(siteAssets, service, heroAsset))}" alt="${escapeHtml(service)} door ${escapeHtml(businessName)}" loading="lazy" />
          <span>${String(index + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(service)}</h3>
          <p>${escapeHtml(serviceText(service, profile))}</p>
        </a>`).join("");
  const pricingCards = pricingPackages.map((item) => `
        <article class="pricing-card">
          <span>${escapeHtml(item.confidence === "manual" ? "Aangeleverd" : "Gevonden op huidige website")}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <strong>${escapeHtml(item.price)}</strong>
          <p>${escapeHtml(item.description)}</p>
        </article>`).join("");
  const pricingSection = pricingPackages.length ? `
      <section class="section-band pricing-section" id="prijzen">
        <div>
          <span class="eyebrow">${escapeHtml(demoCopy.pricingEyebrow)}</span>
          <h2>${escapeHtml(demoCopy.pricingTitle)}</h2>
          <p>${escapeHtml(demoCopy.pricingText)}</p>
        </div>
        <div class="pricing-card-grid">${pricingCards}</div>
      </section>` : "";
  const benefitCards = benefits.map((benefit) => `
        <article class="benefit-card">
          <strong>${escapeHtml(benefit.title)}</strong>
          <p>${escapeHtml(benefit.text)}</p>
        </article>`).join("");
  const processCards = processSteps.map((step, index) => `
        <article class="process-card">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(step.title)}</h3>
          <p>${escapeHtml(step.text)}</p>
        </article>`).join("");
  const reviewCards = googleReviews.length
    ? googleReviews.slice(0, 2).map((review) => `
        <article class="review-card">
          <strong>"${escapeHtml(review.text)}"</strong>
          <p>${escapeHtml([review.author, review.rating ? `${review.rating}/5` : "", review.relativeTime].filter(Boolean).join(" · "))}</p>
        </article>`).join("")
    : `
        <article class="review-card">
          <strong>${escapeHtml(demoCopy.reviewOneTitle)}</strong>
          <p>${escapeHtml(demoCopy.reviewOneText)}</p>
        </article>
        <article class="review-card">
          <strong>${escapeHtml(demoCopy.reviewTwoTitle)}</strong>
          <p>${escapeHtml(demoCopy.reviewTwoText)}</p>
        </article>`;
  const reviewIntro = googleReviews.length
    ? [
        googleRating ? `${googleRating}/5 op Google` : "Google reviews",
        googleRatingTotal ? `${googleRatingTotal} beoordelingen` : "",
      ].filter(Boolean).join(" · ")
    : "";
  const reviewSourceLink = googleReviews.length && googleMapsUrl
    ? `<a class="review-source-link" href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener">Bekijk op Google</a>`
    : "";
  const contactLine = [phone ? `Telefoon: ${phone}` : "", email ? `E-mail: ${email}` : ""].filter(Boolean).join(" | ");
  const websiteLine = websiteUrl ? `Huidige website: ${websiteUrl}` : "Website-informatie kan later worden aangevuld.";
  const statLabel = packageRules.pages.length >= 7 ? "premium pagina's" : packageRules.pages.length >= 4 ? "websitepagina's" : "onepage flow";
  const sourceHighlights = [
    currentWebsite.h1 || currentWebsite.title,
    currentWebsite.metaDescription,
    ...(currentWebsite.headings || []).slice(0, 3),
    ...(currentWebsite.paragraphs || []).slice(0, 2),
  ].map(cleanText).filter(Boolean).slice(0, 6);
  const sourceImages = (currentWebsite.imageUrls || []).slice(0, 3);
  const sourceWebsiteSection = sourceHighlights.length || sourceImages.length ? `
      <section class="section-band source-website-section" id="bestaande-website">
        <div>
          <span class="eyebrow">${escapeHtml(demoCopy.sourceEyebrow)}</span>
          <h2>${escapeHtml(demoCopy.sourceTitle)}</h2>
          <p>${escapeHtml(demoCopy.sourceText)}</p>
        </div>
        ${sourceHighlights.length ? `<ul class="source-highlights">${sourceHighlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        ${sourceImages.length ? `<div class="source-image-strip">${sourceImages.map((url, index) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(`${businessName} bestaand beeld ${index + 1}`)}" loading="lazy" referrerpolicy="no-referrer" />`).join("")}</div>` : ""}
      </section>` : "";
  const premiumSections = packageRules.pages.length >= 7 ? `
      <section class="section-band gallery-section" id="projecten">
        <div>
          <span class="eyebrow">${escapeHtml(demoCopy.premiumEyebrow)}</span>
          <h2>${escapeHtml(demoCopy.premiumTitle)}</h2>
          <p>${escapeHtml(demoCopy.premiumText)}</p>
        </div>
        <div class="gallery-grid">
          ${services.slice(0, 4).map((service) => `<article><img src="${escapeHtml(serviceAssetPath(siteAssets, service, heroAsset))}" alt="${escapeHtml(service)}" loading="lazy" /><strong>${escapeHtml(service)}</strong></article>`).join("")}
        </div>
      </section>
      <section class="section-band premium-offer" id="offerte">
        <span class="eyebrow">${escapeHtml(demoCopy.offerEyebrow)}</span>
        <h2>${escapeHtml(demoCopy.offerTitle)}</h2>
        <p>${escapeHtml(demoCopy.offerText)}</p>
      </section>` : "";
  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="theme-color" content="${escapeHtml(colors.brand)}" />
    <link rel="canonical" href="${escapeHtml(siteUrl)}" />
    ${faviconAsset ? `<link rel="icon" href="${escapeHtml(faviconAsset)}" type="image/svg+xml" />` : ""}
    ${logoAsset ? `<link rel="preload" href="${escapeHtml(logoAsset)}" as="image" />` : ""}
    <link rel="preload" href="${escapeHtml(heroAsset)}" as="image" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(siteUrl)}" />
    ${ogAsset ? `<meta property="og:image" content="${escapeHtml(siteUrl)}/${escapeHtml(ogAsset)}" />` : ""}
    <link rel="stylesheet" href="styles.css" />
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: businessName,
      url: siteUrl,
      telephone: phone || undefined,
      email: email || undefined,
      contactPoint: contactName ? { "@type": "ContactPoint", name: contactName, contactType: "customer service" } : undefined,
      areaServed: cityLine,
    }).replace(/</g, "\\u003c")}</script>
  </head>
  <body style="--brand:${escapeHtml(colors.brand)};--accent:${escapeHtml(colors.accent)};--ink:${escapeHtml(colors.ink)};--soft:${escapeHtml(colors.soft)};--dark:${escapeHtml(colors.dark || colors.ink)}">
    <header class="site-header">
      <a class="brand" href="#top">${logoAsset ? `<img src="${escapeHtml(logoAsset)}" alt="${escapeHtml(businessName)} logo" />` : ""}<span>${escapeHtml(businessName)}</span></a>
      <nav aria-label="Hoofdnavigatie">
        ${navLinks}
      </nav>
      <a class="nav-phone" href="${escapeHtml(phoneHref)}">${escapeHtml(phone || cta)}</a>
      <a class="nav-cta" href="#contact">${escapeHtml(cta)}</a>
    </header>
    <main id="top">
      <section class="hero">
        <img src="${escapeHtml(heroAsset)}" alt="${escapeHtml(heroImage.alt)}" />
        <div class="hero-shade"></div>
        <div class="hero-copy">
          <span class="eyebrow">${escapeHtml(profile.eyebrow || style)}</span>
          <h1>${escapeHtml(profile.hero)}</h1>
          <p>${escapeHtml(profile.intro || description)}</p>
          <div class="hero-actions">
            <a class="button" href="#contact">${escapeHtml(cta)}</a>
            <a class="button secondary" href="${escapeHtml(phoneHref)}">${escapeHtml(profile.secondaryCta || "Bel direct")}</a>
          </div>
          <div class="hero-proof">
            <span><strong>${services.length}</strong> specialisaties</span>
            <span><strong>${packageRules.pages.length}</strong> ${escapeHtml(statLabel)}</span>
            <span><strong>${escapeHtml(cityLine)}</strong> werkgebied</span>
          </div>
        </div>
      </section>

      <section class="contact-bar" aria-label="Snelle contactacties">
        <a href="${escapeHtml(phoneHref)}"><strong>Direct bellen</strong><span>${escapeHtml(phone || "Telefoon toevoegen")}</span></a>
        <a href="#contact"><strong>${escapeHtml(demoCopy.quickActionTitle)}</strong><span>${escapeHtml(demoCopy.quickActionText)}</span></a>
        <a href="#contact"><strong>${escapeHtml(demoCopy.contactActionTitle)}</strong><span>${escapeHtml(demoCopy.contactActionText)}</span></a>
      </section>

      <section class="section-band services-section" id="diensten">
        <span class="eyebrow">${escapeHtml(demoCopy.servicesEyebrow)}</span>
        <h2>${escapeHtml(demoCopy.servicesTitle)}</h2>
        <div class="service-grid">${serviceTiles}</div>
      </section>
      ${pricingSection}

      <section class="portfolio-panel section-band" id="portfolio" hidden>
        <div>
          <span class="eyebrow">${escapeHtml(demoCopy.portfolioEyebrow)}</span>
          <h2 id="portfolioTitle">${escapeHtml(demoCopy.portfolioTitle)}</h2>
          <p id="portfolioCopy">${escapeHtml(demoCopy.portfolioCopy)}</p>
        </div>
        <div class="portfolio-gallery" id="portfolioGallery"></div>
      </section>

      <section class="section-band benefits-section">
        <div>
          <span class="eyebrow">${escapeHtml(demoCopy.benefitsEyebrow)}</span>
          <h2>${escapeHtml(demoCopy.benefitsTitle)}</h2>
          <p>${escapeHtml(demoCopy.benefitsText)}</p>
        </div>
        <div class="benefit-grid">${benefitCards}</div>
      </section>
      ${sourceWebsiteSection}

      <section class="process-section" id="werkwijze">
        <div class="section-band">
        <span class="eyebrow">${escapeHtml(demoCopy.processEyebrow)}</span>
        <h2>${escapeHtml(demoCopy.processTitle)}</h2>
        <div class="process-grid">${processCards}</div>
        </div>
      </section>

      <section class="section-band reviews-section" id="reviews">
        <div>
          <span class="eyebrow">${escapeHtml(demoCopy.reviewsEyebrow)}</span>
          <h2>${escapeHtml(demoCopy.reviewsTitle)}</h2>
          ${reviewIntro ? `<p>${escapeHtml(reviewIntro)}</p>${reviewSourceLink}` : ""}
        </div>
        ${reviewCards}
      </section>
      ${premiumSections}

      <section class="contact-section section-band" id="contact">
        <div>
          <span class="eyebrow">${escapeHtml(demoCopy.contactEyebrow)}</span>
          <h2>${escapeHtml(demoCopy.contactTitle)}</h2>
          <p>Liever direct contact? ${escapeHtml(contactLine || "Voeg telefoon en e-mail toe voor directe contactopties.")}</p>
          <div class="company-card">
            <strong>${escapeHtml(businessName)}</strong>
            <span>${escapeHtml(contactName)}</span>
            <span>${escapeHtml(websiteLine)}</span>
          </div>
        </div>
        <form class="preview-form" id="requestForm" action="${emailHref}" method="get">
          <label>Naam<input name="naam" placeholder="Uw naam" /></label>
          <label>Telefoonnummer<input name="telefoon" placeholder="Bijv. 06 12345678" /></label>
          <label>E-mailadres<input name="email" placeholder="uw@email.nl" /></label>
          <label>Gewenst contactmoment<input name="contactmoment" placeholder="Bijv. morgenmiddag" /></label>
          <label class="wide">${escapeHtml(demoCopy.projectLabel)}<select name="project">${services.slice(0, 5).map((service) => `<option>${escapeHtml(service)}</option>`).join("")}</select></label>
          <label class="wide">${escapeHtml(demoCopy.messageLabel)}<textarea name="bericht" placeholder="${escapeHtml(demoCopy.messagePlaceholder)}"></textarea></label>
          <button type="submit">${escapeHtml(cta)}</button>
          <small>Na klikken opent uw mailprogramma met de aanvraag klaar om te versturen.</small>
        </form>
      </section>
    </main>
    <footer class="site-footer"><div><strong>${escapeHtml(businessName)}</strong><span>${escapeHtml(demoCopy.footerLabel)}</span></div><nav>${navLinks}</nav></footer>
    <script src="script.js"></script>
  </body>
</html>`;
}

function renderSubPage({ page, businessName, contactName, email, phone, websiteUrl, siteUrl, industry, industryProfile, services, pricingPackages = [], benefits, processSteps, cta, colors, packageRules, heroImage, siteAssets }) {
  const titleMap = {
    "over-ons.html": "Over ons",
    "diensten.html": "Diensten",
    "projecten.html": "Projecten",
    "reviews.html": "Reviews",
    "contact.html": "Contact",
    "offerte.html": "Offerte aanvragen",
  };
  const title = titleMap[page] || "Pagina";
  const profile = industryProfile || resolveIndustryProfile({ industry, businessName });
  const demoCopy = demoCopyForIndustry(profile, packageRules);
  const logoAsset = assetPath(siteAssets, "logo", "");
  const faviconAsset = assetPath(siteAssets, "favicon", "");
  const heroAsset = assetPath(siteAssets, "hero", heroImage.src);
  const serviceBody = services.map((service) => `<article class="service-card"><img src="${escapeHtml(serviceAssetPath(siteAssets, service, heroAsset))}" alt="${escapeHtml(service)}" loading="lazy" /><h3>${escapeHtml(service)}</h3><p>${escapeHtml(serviceText(service, profile))}</p></article>`).join("");
  const pricingBody = pricingPackages.map((item) => `<article class="pricing-card"><span>${escapeHtml(item.confidence === "manual" ? "Aangeleverd" : "Gevonden op huidige website")}</span><h3>${escapeHtml(item.name)}</h3><strong>${escapeHtml(item.price)}</strong><p>${escapeHtml(item.description)}</p></article>`).join("");
  const body = page === "diensten.html"
    ? `${serviceBody}${pricingBody}`
    : page === "reviews.html"
      ? benefits.map((benefit) => `<article class="review-card"><strong>${escapeHtml(benefit.title)}</strong><p>${escapeHtml(benefit.text)}</p></article>`).join("")
      : page === "projecten.html"
        ? processSteps.map((step) => `<article class="service-card"><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p></article>`).join("")
        : `<article class="service-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(businessName)} ${escapeHtml(demoCopy.subPageText)}</p></article>`;
  const contact = [email ? `E-mail: ${email}` : "", phone ? `Telefoon: ${phone}` : ""].filter(Boolean).join(" | ");
  const navLinks = navigationLinks(packageRules, profile).map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("");
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex,nofollow" /><title>${escapeHtml(title)} - ${escapeHtml(businessName)}</title><meta name="description" content="${escapeHtml(title)} van ${escapeHtml(businessName)}." /><link rel="canonical" href="${escapeHtml(siteUrl)}/${escapeHtml(page)}" />${faviconAsset ? `<link rel="icon" href="${escapeHtml(faviconAsset)}" type="image/svg+xml" />` : ""}<link rel="stylesheet" href="styles.css" /></head><body style="--brand:${escapeHtml(colors.brand)};--accent:${escapeHtml(colors.accent)};--ink:${escapeHtml(colors.ink)};--soft:${escapeHtml(colors.soft)};--dark:${escapeHtml(colors.dark || colors.ink)}"><header class="site-header"><a class="brand" href="index.html">${logoAsset ? `<img src="${escapeHtml(logoAsset)}" alt="${escapeHtml(businessName)} logo" />` : ""}<span>${escapeHtml(businessName)}</span></a><nav>${navLinks}</nav><a class="nav-cta" href="contact.html">${escapeHtml(cta)}</a></header><main><section class="sub-hero"><img src="${escapeHtml(heroAsset)}" alt="${escapeHtml(heroImage.alt)}" /><div><span class="eyebrow">${escapeHtml(demoCopy.subPageEyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(profile.intro)} ${escapeHtml(contactName)} ${escapeHtml(demoCopy.subPageIntro)}</p></div></section><section class="section-band section-heading"><div class="service-grid">${body}</div></section><section class="contact-section section-band"><div><span class="eyebrow">${escapeHtml(demoCopy.contactEyebrow)}</span><h2>${escapeHtml(cta)}</h2><p>${escapeHtml(contact || "Contactgegevens kunnen later worden aangevuld.")}</p><p>${escapeHtml(websiteUrl || "Website-informatie kan later worden aangevuld.")}</p></div><a class="button" href="${email ? `mailto:${escapeHtml(email)}` : "#"}">${escapeHtml(cta)}</a></section></main><footer class="site-footer"><div><strong>${escapeHtml(businessName)}</strong><span>${escapeHtml(demoCopy.footerLabel)}</span></div><nav>${navLinks}</nav></footer><script src="script.js"></script></body></html>`;
}

function renderCss() {
  const css = `:root{color-scheme:light;--paper:#f5f1ea;--line:rgba(17,24,39,.14);--muted:#5f6673;--shadow:0 30px 90px rgba(17,24,39,.18)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--paper);color:var(--ink)}a{color:inherit}.site-header{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:auto 1fr auto auto;gap:20px;align-items:center;padding:12px clamp(20px,3.4vw,52px);color:#fff;background:linear-gradient(180deg,rgba(17,24,20,.84),rgba(17,24,20,.68));backdrop-filter:blur(18px)}.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-size:19px;font-weight:900}.brand img{width:46px;height:46px;object-fit:contain}.site-header nav{display:flex;justify-content:center;flex-wrap:wrap;gap:8px 18px}.site-header nav a,.nav-phone{text-decoration:none;font-size:14px;font-weight:850;color:rgba(255,255,255,.86)}.nav-cta{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 18px;border-radius:3px;background:var(--accent);color:#fff;text-decoration:none;font-weight:950}.section-band{width:min(1160px,calc(100% - 44px));margin:0 auto}.hero{position:relative;display:grid;align-items:center;min-height:calc(100vh - 70px);padding:clamp(64px,8vw,120px) clamp(22px,4vw,84px);overflow:hidden;color:#fff;background:#111}.hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.76),rgba(0,0,0,.42) 45%,rgba(0,0,0,.16)),linear-gradient(0deg,rgba(0,0,0,.38),rgba(0,0,0,.08))}.hero-copy{position:relative;z-index:1;max-width:860px}.eyebrow{display:block;margin-bottom:20px;color:var(--accent);font-size:13px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}h1,h2,h3,p{letter-spacing:0}h1{max-width:920px;margin:0 0 24px;font-size:clamp(48px,7.4vw,104px);line-height:.94;font-weight:950}h2{max-width:850px;margin:0 0 22px;font-size:clamp(34px,5vw,66px);line-height:1;font-weight:950}h3{margin:0 0 10px;font-size:clamp(22px,2vw,30px);line-height:1.08}.hero p{max-width:760px;color:rgba(255,255,255,.88);font-size:clamp(19px,2vw,24px);line-height:1.6}.button{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:15px 24px;border:1px solid transparent;border-radius:3px;background:var(--accent);color:#fff;text-decoration:none;font-weight:950;box-shadow:0 18px 42px color-mix(in srgb,var(--accent) 32%,transparent)}.button.secondary{border-color:rgba(255,255,255,.42);background:rgba(255,255,255,.08);box-shadow:none}.hero-actions,.hero-proof{display:flex;flex-wrap:wrap;gap:14px;margin-top:32px}.hero-proof{margin-top:54px}.hero-proof span{min-width:180px;padding:18px 22px;border-left:1px solid rgba(255,255,255,.28);background:rgba(17,24,39,.42);font-size:15px;font-weight:850;color:rgba(255,255,255,.78)}.hero-proof strong{display:block;color:#fff;font-size:28px}.contact-bar{position:relative;z-index:4;display:grid;grid-template-columns:repeat(3,1fr);width:min(1040px,calc(100% - 44px));margin:-44px auto 80px;background:rgba(255,255,255,.94);box-shadow:var(--shadow)}.contact-bar a{display:grid;gap:5px;min-height:96px;padding:26px 32px;text-decoration:none;border-right:1px solid var(--line)}.contact-bar a:nth-child(2){background:var(--accent);color:#fff}.contact-bar strong{font-size:22px}.contact-bar span{color:var(--muted);font-weight:800}.contact-bar a:nth-child(2) span{color:rgba(255,255,255,.88)}.services-section,.pricing-section,.benefits-section,.reviews-section,.gallery-section,.premium-offer,.contact-section,.preview-note,.section-heading,.portfolio-panel{padding:clamp(64px,7vw,110px) 0}.services-section h2{max-width:900px}.service-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:34px}.project-tile{position:relative;min-height:250px;display:flex;flex-direction:column;justify-content:flex-end;padding:20px;overflow:hidden;color:#fff;text-decoration:none;background:#111}.project-tile::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.74),rgba(0,0,0,.08))}.project-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .35s ease}.project-tile:hover img{transform:scale(1.045)}.project-tile span,.project-tile h3,.project-tile p{position:relative;z-index:1}.project-tile span{color:var(--accent);font-weight:950}.project-tile p{margin:0;color:rgba(255,255,255,.82);font-size:14px;line-height:1.5}.pricing-section{display:grid;grid-template-columns:.78fr 1.22fr;gap:38px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.pricing-card-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.pricing-card{display:grid;gap:12px;padding:26px;border:1px solid var(--line);background:#fff;box-shadow:0 22px 60px rgba(17,24,39,.07)}.pricing-card span{color:var(--accent);font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.pricing-card strong{font-size:clamp(34px,4vw,54px);line-height:1;color:var(--ink)}.pricing-card p{margin:0;color:var(--muted);font-size:16px;line-height:1.65}.portfolio-panel{display:grid;grid-template-columns:.72fr 1.28fr;gap:28px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.portfolio-panel[hidden]{display:none}.portfolio-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.portfolio-item{position:relative;min-height:210px;overflow:hidden;color:#fff;background:#111}.portfolio-item img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.portfolio-item strong{position:absolute;left:18px;right:18px;bottom:18px;z-index:1;font-size:20px}.portfolio-item::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.68),transparent)}.benefits-section{display:grid;grid-template-columns:.85fr 1.15fr;gap:44px}.benefits-section p,.contact-section p,.section-heading p,.premium-offer p,.portfolio-panel p,.pricing-section p{color:var(--muted);font-size:19px;line-height:1.7}.benefit-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.benefit-card,.review-card,.preview-note,.company-card,.service-card:not(.project-tile){border:1px solid var(--line);background:#fff;box-shadow:0 22px 60px rgba(17,24,39,.07)}.benefit-card{padding:28px}.benefit-card strong{display:block;font-size:24px;margin-bottom:8px}.benefit-card p,.review-card p{margin:0;color:var(--muted);font-size:16px;line-height:1.65}.source-website-section{display:grid;grid-template-columns:.8fr 1.2fr;gap:28px;padding:clamp(64px,7vw,110px) 0;border-top:1px solid var(--line)}.source-highlights{margin:0;padding:0;list-style:none;display:grid;gap:12px}.source-highlights li{padding:18px 20px;background:#fff;border-left:4px solid var(--accent);box-shadow:0 16px 40px rgba(17,24,39,.06);font-weight:800;line-height:1.5}.source-image-strip{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.source-image-strip img{width:100%;height:260px;object-fit:cover;background:#111}.process-section{padding:clamp(76px,8vw,120px) 0;background:var(--dark);color:#fff}.process-section h2{color:#fff}.process-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:34px}.process-card{min-height:250px;padding:28px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.055)}.process-card span{display:block;margin-bottom:54px;color:var(--accent);font-weight:950}.process-card p{color:rgba(255,255,255,.72);font-size:16px;line-height:1.7}.reviews-section{display:grid;grid-template-columns:.8fr 1fr 1fr;gap:22px}.review-source-link{display:inline-flex;margin-top:14px;color:var(--accent);font-weight:950;text-decoration:none}.review-card{padding:32px}.review-card strong{display:block;font-size:26px;line-height:1.15;margin-bottom:22px}.gallery-section{display:grid;grid-template-columns:.75fr 1.25fr;gap:34px}.gallery-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.gallery-grid article{position:relative;min-height:220px;display:flex;align-items:flex-end;padding:22px;overflow:hidden;color:#fff;background:#111}.gallery-grid article::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.68),rgba(0,0,0,.06))}.gallery-grid img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.gallery-grid strong{position:relative;z-index:1;font-size:26px}.premium-offer{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.contact-section{display:grid;grid-template-columns:.88fr 1.12fr;gap:58px;align-items:start}.company-card{display:grid;gap:8px;margin-top:28px;padding:26px;border-top:5px solid var(--accent)}.company-card strong{font-size:32px}.preview-form{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;padding:34px;background:#fff;box-shadow:var(--shadow)}label{display:grid;gap:8px;font-weight:900}.wide{grid-column:1/-1}input,select,textarea{width:100%;min-height:54px;border:1px solid var(--line);background:var(--paper);padding:0 16px;font:inherit;font-weight:750;color:var(--ink)}textarea{min-height:150px;padding-top:14px;resize:vertical}button{min-height:56px;border:0;background:var(--accent);color:#fff;font:inherit;font-weight:950}.preview-form button,.preview-form small{grid-column:1/-1}.preview-form small{color:var(--muted)}.preview-note{padding:24px;margin-bottom:44px}.site-footer{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:34px clamp(22px,4vw,64px);background:var(--dark);color:rgba(255,255,255,.72);font-weight:850}.site-footer div{display:grid;gap:6px}.site-footer strong{color:#fff}.site-footer nav{display:flex;flex-wrap:wrap;gap:12px 18px}.site-footer nav a{color:rgba(255,255,255,.74);text-decoration:none}.sub-hero{position:relative;min-height:52vh;display:grid;align-items:end;padding:clamp(70px,8vw,120px) clamp(22px,5vw,86px);color:#fff;overflow:hidden;background:#111}.sub-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.sub-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.72),rgba(0,0,0,.18))}.sub-hero>div{position:relative;z-index:1}.section-heading .service-grid{grid-template-columns:repeat(3,1fr)}.section-heading .service-card,.section-heading .pricing-card{padding:28px}.section-heading .service-card img{width:100%;height:190px;object-fit:cover;margin:-28px -28px 24px;width:calc(100% + 56px)}@media(max-width:1100px){.service-grid,.pricing-card-grid{grid-template-columns:repeat(2,1fr)}.process-grid{grid-template-columns:repeat(2,1fr)}.site-header{grid-template-columns:auto 1fr auto;padding:10px clamp(18px,3vw,42px)}.site-header nav{justify-content:flex-end}.nav-phone{display:none}.portfolio-panel,.pricing-section{grid-template-columns:1fr}.portfolio-gallery{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.hero{min-height:72vh}.contact-bar,.benefits-section,.reviews-section,.gallery-section,.contact-section,.source-website-section{grid-template-columns:1fr}.service-grid,.pricing-card-grid,.benefit-grid,.process-grid,.gallery-grid,.section-heading .service-grid,.preview-form,.portfolio-gallery,.source-image-strip{grid-template-columns:1fr}.site-header{grid-template-columns:1fr auto}.brand img{width:40px;height:40px}.site-header nav{grid-column:1/-1;overflow-x:auto;flex-wrap:nowrap;justify-content:flex-start;padding-bottom:2px}.contact-bar{margin:0 auto 50px}.hero-proof span{width:100%}.site-footer{display:grid}h1{font-size:clamp(42px,15vw,68px)}}`;
  return css;
}

function renderScript({ businessName, email, services, industryProfile = null }) {
  const portfolioCopy = isDrivingSchoolProfile(industryProfile)
    ? (service) => `${service} krijgt eigen uitleg, passend beeld en een directe route naar proefles of pakketadvies.`
    : (service) => `${service} krijgt een eigen visuele presentatie, korte uitleg en een directe route naar aanvraag of contact.`;
  const portfolio = Object.fromEntries(services.slice(0, 6).map((service, index) => [service, {
    title: `${service} helder in beeld`,
    copy: portfolioCopy(service),
    images: [
      `assets/service-${index + 1}-${slugifySite(service)}.svg`,
      "assets/hero.svg",
      "assets/og-image.svg",
    ],
  }]));
  return `document.documentElement.classList.add("preview-ready");
const portfolioData = ${JSON.stringify(portfolio)};
const portfolioPanel = document.getElementById("portfolio");
const portfolioTitle = document.getElementById("portfolioTitle");
const portfolioCopy = document.getElementById("portfolioCopy");
const portfolioGallery = document.getElementById("portfolioGallery");
document.querySelectorAll("[data-service]").forEach((card) => {
  card.addEventListener("click", (event) => {
    event.preventDefault();
    const service = card.getAttribute("data-service");
    const data = portfolioData[service];
    if (!data || !portfolioPanel || !portfolioGallery) return;
    portfolioTitle.textContent = data.title;
    portfolioCopy.textContent = data.copy;
    portfolioGallery.innerHTML = data.images.map((src, index) => '<article class="portfolio-item"><img src="' + src + '" alt="' + service + ' voorbeeld ' + (index + 1) + '"><strong>' + service + '</strong></article>').join("");
    portfolioPanel.hidden = false;
    portfolioPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    const projectSelect = document.querySelector('select[name="project"]');
    if (projectSelect) projectSelect.value = service;
  });
});
const form = document.getElementById("requestForm");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const subject = "Aanvraag via ${escapeJs(businessName)}";
    const body = [
      "Naam: " + (data.get("naam") || ""),
      "Telefoon: " + (data.get("telefoon") || ""),
      "E-mail: " + (data.get("email") || ""),
      "Contactmoment: " + (data.get("contactmoment") || ""),
      "Project: " + (data.get("project") || ""),
      "",
      "Bericht:",
      data.get("bericht") || ""
    ].join("\\n");
    window.location.href = "mailto:${escapeJs(email || "")}?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  });
}`;
}

function serviceText(service, profile = {}) {
  const text = String(service || "").toLowerCase();
  if (/airco/.test(text)) return "Laat direct zien wat de aircoservice inhoudt, wanneer klanten moeten langskomen en hoe ze snel een afspraak maken.";
  if (/diagnose|controle|inspectie|check/.test(text)) return "Geeft bezoekers vertrouwen door duidelijk te maken hoe de controle werkt en welke vervolgstap logisch is.";
  if (/reparatie|uitvoering|onderhoud|apk|service|storing|spoed/.test(text)) return "Maakt praktisch duidelijk wat er gebeurt, hoe snel klanten geholpen worden en hoe ze contact opnemen.";
  if (/contact|bel|whatsapp|afspraak|offerte|reserver|boek/.test(text)) return "Zet de belangrijkste actie centraal zodat bezoekers zonder zoeken kunnen bellen, appen of aanvragen.";
  if (/advies|intake|strategie|plan|waardebepaling|taxatie/.test(text)) return "Presenteert deskundigheid rustig en concreet, zodat bezoekers sneller vertrouwen krijgen in het eerste gesprek.";
  if (/menu|lunch|diner|arrangement|kamer|verblijf/.test(text)) return "Laat sfeer en aanbod samenkomen, met een duidelijke route naar reserveren of boeken.";
  if (/behandeling|styling|massage|coaching|therapie/.test(text)) return "Laat de ervaring, aanpak en voordelen duidelijk voelen voordat iemand een afspraak maakt.";
  return `${service} met een duidelijke uitleg, passende visuele presentatie en een logische route naar aanvraag of contact.`;
}

function inferBenefits(industry = "", profile = null) {
  if (Array.isArray(profile?.benefits)) {
    return profile.benefits.map(([title, text]) => ({ title, text }));
  }
  const normalized = industry.toLowerCase();
  if (/bouw|renovatie|installatie/.test(normalized)) {
    return [
      { title: "Duidelijke afspraken", text: "Bezoekers zien direct hoe het traject wordt opgepakt en wat ze kunnen verwachten." },
      { title: "Vertrouwen in vakwerk", text: "De opbouw geeft ruimte aan projecten, garanties en praktische informatie." },
      { title: "Snel contact", text: "Telefoon en aanvraagmomenten staan logisch verspreid over de pagina." },
      { title: "Professionele indruk", text: "Rustige vormgeving helpt om kwaliteit en betrouwbaarheid uit te stralen." },
    ];
  }
  if (/horeca/.test(normalized)) {
    return [
      { title: "Sfeer snel voelbaar", text: "De preview geeft ruimte aan menu, reserveren en een warme eerste indruk." },
      { title: "Reserveren centraal", text: "Bezoekers worden subtiel naar de belangrijkste actie geleid." },
      { title: "Aanbod overzichtelijk", text: "Diensten en arrangementen zijn makkelijk scanbaar." },
      { title: "Mobiel sterk", text: "De structuur werkt goed voor bezoekers die onderweg zoeken." },
    ];
  }
  return [
    { title: "Heldere positionering", text: "Bezoekers begrijpen snel wat het bedrijf doet en voor wie." },
    { title: "Meer vertrouwen", text: "Voordelen, werkwijze en reviews ondersteunen de eerste indruk." },
    { title: "Betere conversie", text: "Elke sectie stuurt rustig richting contact of afspraak." },
    { title: "Uitbreidbaar ontwerp", text: "De preview is klaar voor echte beelden, cases en klantreviews." },
  ];
}

function inferProcessSteps(industry = "", profile = null) {
  if (Array.isArray(profile?.process)) {
    return profile.process.map(([title, text]) => ({ title, text }));
  }
  const normalized = industry.toLowerCase();
  if (/horeca/.test(normalized)) {
    return [
      { title: "Bekijk het aanbod", text: "Gasten zien snel wat er mogelijk is." },
      { title: "Neem contact op", text: "Reserveren of aanvragen kan zonder zoeken." },
      { title: "Ontvang bevestiging", text: "De volgende stap is duidelijk en laagdrempelig." },
    ];
  }
  return [
    { title: "Vraag of wens bespreken", text: "De bezoeker legt kort uit waar hij hulp bij zoekt." },
    { title: "Advies of voorstel ontvangen", text: "Het bedrijf reageert met een passende aanpak." },
    { title: "Samen plannen", text: "Daarna worden timing, inhoud en vervolgstappen afgestemd." },
  ];
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function escapeHtml(value = "") {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function escapeJs(value = "") {
  return String(value || "").replace(/[\\`$]/g, (character) => `\\${character}`).replace(/\r?\n/g, "\\n");
}

module.exports = {
  BUILD_STATUSES,
  buildLogs,
  buildWebsitePackage,
  isBuildStatus,
  makePreviewToken,
  nextPreviewVersion,
  normalizeBuildJob,
  normalizePreviewVersion,
  previewUrlFor,
  runQualityCheck,
};
