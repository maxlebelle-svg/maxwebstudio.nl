const crypto = require("crypto");
const { resolveDemoImageAsset } = require("./_demo-image-assets");
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
  const industry = extractField(combinedBriefing, ["Branche/regio", "Branche"]) || inferIndustry(combinedBriefing, businessName);
  const industryProfile = resolveIndustryProfile({ industry, briefing: combinedBriefing, businessName });
  const services = mergeUnique(industryProfile.services, extractServices(combinedBriefing, industry)).slice(0, 6);
  const benefits = inferBenefits(industry, industryProfile);
  const processSteps = inferProcessSteps(industry, industryProfile);
  const cta = inferCta(combinedBriefing, industryProfile);
  const colors = inferColors(industry, industryProfile);
  const style = inferStyle(combinedBriefing);
  const packageType = normalizePackageType(journey.packageType || journey.package_type || journey.package || journey.packageName || journey.package_name || extractField(combinedBriefing, ["Websitepakket", "Pakket"]));
  const factoryConfig = resolveFactoryConfig({ packageType, industry: `${industry} ${combinedBriefing} ${businessName}` });
  const packageRules = resolvePackageRules(factoryConfig.package.id || packageType);
  const heroImage = resolveDemoImageAsset({ businessName, industry, services, briefing: combinedBriefing });
  const inputSignals = [combinedBriefing, websiteUrl, email, phone].filter((value) => cleanText(value).length > 12).length;
  const lowInputWarning = inputSignals < 2;
  const templateSections = packageRules.sections;
  const pages = packageRules.pages;
  const siteUrl = normalizeSiteUrl(websiteUrl, businessName);
  const projectSlug = slugifySite(businessName || websiteUrl || "website-preview");
  const title = `${businessName} - ${industryProfile.label}`;
  const description = `${businessName} presenteert ${industryProfile.label.toLowerCase()} met een premium uitstraling, duidelijke actieknoppen en een route naar contact.`;
  const siteAssets = buildSiteAssets({ businessName, industryProfile, services, colors, heroImage, projectSlug });
  const html = renderHtml({ businessName, contactName, email, phone, websiteUrl, siteUrl, industry, industryProfile, services, benefits, processSteps, cta, colors, style, title, description, lowInputWarning, packageType, packageRules, heroImage, siteAssets });
  const css = renderCss(colors);
  const script = renderScript({ businessName, email, services });
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
      type: "generated-local-asset",
      promptReady: true,
      slug: heroImage.slug,
      src: "assets/hero.svg",
      alt: heroImage.alt,
      subject: `${businessName} ${industry}`,
    },
    serviceVisuals: services.map((service, index) => ({
      service,
      type: "generated-local-asset",
      src: siteAssets.find((asset) => asset.service === service)?.path || `assets/service-${index + 1}.svg`,
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
      content: renderSubPage({ page, businessName, contactName, email, phone, websiteUrl, siteUrl, industry, industryProfile, services, benefits, processSteps, cta, colors, packageRules, heroImage, siteAssets }),
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
      ...siteAssets.map(({ path, content }) => ({ path, content })),
      { path: "assets-map.json", content: JSON.stringify(assetsMap, null, 2) },
      { path: "briefing.json", content: JSON.stringify(briefingJson, null, 2) },
      { path: "README.md", content: readme },
    ],
    meta: briefingJson,
  };
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

function extractServices(text = "", industry = "") {
  const normalized = `${text} ${industry}`.toLowerCase();
  if (/bouw|timmer|renovatie|aannemer/.test(normalized)) return ["Renovatie", "Maatwerk", "Projectbegeleiding"];
  if (/restaurant|horeca|cafe|catering/.test(normalized)) return ["Menu", "Reserveren", "Catering"];
  if (/sportschool|fitness|personal trainer/.test(normalized)) return ["Proefles", "Rooster", "Membership"];
  if (/advocaat|advocatuur|juridisch|jurist/.test(normalized)) return ["Arbeidsrecht", "Ondernemingsrecht", "Intake"];
  if (/autobedrijf|garage|automotive|occasion|apk/.test(normalized)) return ["Occasions", "APK", "Onderhoud"];
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
  if (/bouw|timmer|renovatie|aannemer/.test(normalized)) return "bouw en renovatie";
  if (/restaurant|horeca|cafe/.test(normalized)) return "horeca";
  if (/sportschool|fitness|personal trainer/.test(normalized)) return "fitness";
  if (/advocaat|advocatuur|juridisch|jurist/.test(normalized)) return "advocatuur";
  if (/autobedrijf|garage|automotive|occasion|apk/.test(normalized)) return "automotive";
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

function extractLocationText(value = "") {
  const text = cleanText(value);
  const parts = text.split(/[|,/]/).map((item) => cleanText(item)).filter(Boolean);
  return parts.find((part) => /regio|plaats|omgeving|nederland|amsterdam|rotterdam|utrecht|almere|breda|den haag|eindhoven|alkmaar|haarlem/i.test(part)) || "Regio";
}

function inferCta(text = "", profile = null) {
  const normalized = text.toLowerCase();
  if (/offerte/.test(normalized)) return "Vraag een offerte aan";
  if (/afspraak|bel/.test(normalized)) return "Plan een kennismaking";
  if (/reserver/.test(normalized)) return "Reserveer direct";
  return profile?.cta || "Neem contact op";
}

function inferColors(industry = "", profile = null) {
  if (profile?.colors) return profile.colors;
  const normalized = industry.toLowerCase();
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

function buildSiteAssets({ businessName, industryProfile, services, colors, heroImage, projectSlug }) {
  const palette = {
    ink: colors.ink || "#111827",
    brand: colors.brand || "#24382f",
    accent: colors.accent || "#c99a45",
    soft: colors.soft || "#f3efe8",
    dark: colors.dark || colors.brand || "#1f332a",
  };
  const serviceAssets = services.slice(0, 6).map((service, index) => ({
    path: `assets/service-${index + 1}-${slugifySite(service)}.svg`,
    kind: "service",
    service,
    content: renderVisualSvg({
      title: service,
      subtitle: industryProfile.label,
      colors: palette,
      variant: index + 1,
    }),
  }));
  return [
    { path: "assets/logo.svg", kind: "logo", content: renderLogoSvg({ businessName, colors: palette }) },
    { path: "assets/favicon.svg", kind: "favicon", content: renderFaviconSvg({ businessName, colors: palette }) },
    { path: "assets/og-image.svg", kind: "og", content: renderOgSvg({ businessName, industryProfile, colors: palette }) },
    {
      path: "assets/hero.svg",
      kind: "hero",
      sourceSlug: heroImage.slug,
      content: renderVisualSvg({
        title: industryProfile.hero || businessName,
        subtitle: businessName,
        colors: palette,
        variant: 0,
        wide: true,
      }),
    },
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

function navigationLinks(packageRules = PACKAGE_RULES.starter) {
  if (packageRules.navigation === "scroll") {
    return [
      { href: "#diensten", label: "Diensten" },
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

function renderHtml({ businessName, contactName, email, phone, websiteUrl, siteUrl, industry, industryProfile, services, benefits, processSteps, cta, colors, style, title, description, lowInputWarning, packageRules, heroImage, siteAssets }) {
  const profile = industryProfile || resolveIndustryProfile({ industry, businessName });
  const navLinks = navigationLinks(packageRules).map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("");
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
  const contactLine = [phone ? `Telefoon: ${phone}` : "", email ? `E-mail: ${email}` : ""].filter(Boolean).join(" | ");
  const websiteLine = websiteUrl ? `Huidige website: ${websiteUrl}` : "Website-informatie kan later worden aangevuld.";
  const statLabel = packageRules.pages.length >= 7 ? "premium pagina's" : packageRules.pages.length >= 4 ? "websitepagina's" : "onepage flow";
  const premiumSections = packageRules.pages.length >= 7 ? `
      <section class="section-band gallery-section" id="projecten">
        <div>
          <span class="eyebrow">Projecten</span>
          <h2>Bewijs dat kwaliteit meteen zichtbaar maakt.</h2>
          <p>De premium preview is voorbereid op projectcases, voor-na beelden en resultaatgerichte verhalen.</p>
        </div>
        <div class="gallery-grid">
          ${services.slice(0, 4).map((service) => `<article><img src="${escapeHtml(serviceAssetPath(siteAssets, service, heroAsset))}" alt="${escapeHtml(service)}" loading="lazy" /><strong>${escapeHtml(service)}</strong></article>`).join("")}
        </div>
      </section>
      <section class="section-band premium-offer" id="offerte">
        <span class="eyebrow">Offerte</span>
        <h2>Een aanvraagroute die voelt als een professioneel verkoopgesprek.</h2>
        <p>Extra conversieblokken, projectbewijs en vertrouwen zorgen dat de bezoeker sneller de stap naar contact zet.</p>
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
        <a href="#contact"><strong>Afspraak inplannen</strong><span>Stuur meteen een verzoek</span></a>
        <a href="#contact"><strong>Contactformulier</strong><span>Vertel kort wat u wilt laten maken</span></a>
      </section>

      <section class="section-band services-section" id="diensten">
        <span class="eyebrow">Waarmee kunnen we helpen?</span>
        <h2>Kies uw project en bekijk verschillende oplossingen.</h2>
        <div class="service-grid">${serviceTiles}</div>
      </section>

      <section class="portfolio-panel section-band" id="portfolio" hidden>
        <div>
          <span class="eyebrow">Projectbeeld</span>
          <h2 id="portfolioTitle">Bekijk de aanpak per dienst.</h2>
          <p id="portfolioCopy">Kies hierboven een dienst om een passende projectpresentatie te tonen.</p>
        </div>
        <div class="portfolio-gallery" id="portfolioGallery"></div>
      </section>

      <section class="section-band benefits-section">
        <div>
          <span class="eyebrow">Voordelen</span>
          <h2>Waarom klanten vertrouwen krijgen.</h2>
          <p>De pagina legt de nadruk op duidelijkheid, betrouwbaarheid en een laagdrempelige route naar contact.</p>
        </div>
        <div class="benefit-grid">${benefitCards}</div>
      </section>

      <section class="process-section" id="werkwijze">
        <div class="section-band">
        <span class="eyebrow">Zo werkt het</span>
        <h2>Van eerste idee naar een resultaat dat klaar voelt.</h2>
        <div class="process-grid">${processCards}</div>
        </div>
      </section>

      <section class="section-band reviews-section" id="reviews">
        <div>
          <span class="eyebrow">Vertrouwen</span>
          <h2>Gericht op een sterke eerste indruk.</h2>
        </div>
        <article class="review-card">
          <strong>"Duidelijk, professioneel en makkelijk om contact op te nemen."</strong>
          <p>Klanten zien direct waar ze aan toe zijn en kunnen zonder zoeken de volgende stap zetten.</p>
        </article>
        <article class="review-card">
          <strong>"De belangrijkste informatie staat meteen goed op volgorde."</strong>
          <p>De combinatie van beeld, diensten en contactmomenten geeft vertrouwen vanaf de eerste klik.</p>
        </article>
      </section>
      ${premiumSections}

      <section class="contact-section section-band" id="contact">
        <div>
          <span class="eyebrow">Vrijblijvende aanvraag</span>
          <h2>Maak het makkelijk: vertel wat u wilt en ontvang snel reactie.</h2>
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
          <label class="wide">Project<select name="project">${services.slice(0, 5).map((service) => `<option>${escapeHtml(service)}</option>`).join("")}</select></label>
          <label class="wide">Wat wilt u laten doen?<textarea name="bericht" placeholder="Vertel kort wat u wilt laten maken, wanneer u wilt starten en waar het project is."></textarea></label>
          <button type="submit">${escapeHtml(cta)}</button>
          <small>Na klikken opent uw mailprogramma met de aanvraag klaar om te versturen.</small>
        </form>
      </section>
    </main>
    <footer class="site-footer"><strong>${escapeHtml(businessName)}</strong><span>${escapeHtml(packageRules.label)}</span></footer>
    <script src="script.js"></script>
  </body>
</html>`;
}

function renderSubPage({ page, businessName, contactName, email, phone, websiteUrl, siteUrl, industry, industryProfile, services, benefits, processSteps, cta, colors, packageRules, heroImage, siteAssets }) {
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
  const logoAsset = assetPath(siteAssets, "logo", "");
  const faviconAsset = assetPath(siteAssets, "favicon", "");
  const heroAsset = assetPath(siteAssets, "hero", heroImage.src);
  const body = page === "diensten.html"
    ? services.map((service) => `<article class="service-card"><img src="${escapeHtml(serviceAssetPath(siteAssets, service, heroAsset))}" alt="${escapeHtml(service)}" loading="lazy" /><h3>${escapeHtml(service)}</h3><p>${escapeHtml(serviceText(service, profile))}</p></article>`).join("")
    : page === "reviews.html"
      ? benefits.map((benefit) => `<article class="review-card"><strong>${escapeHtml(benefit.title)}</strong><p>${escapeHtml(benefit.text)}</p></article>`).join("")
      : page === "projecten.html"
        ? processSteps.map((step) => `<article class="service-card"><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p></article>`).join("")
        : `<article class="service-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(businessName)} presenteert hier extra informatie passend bij ${escapeHtml(packageRules.label)}.</p></article>`;
  const contact = [email ? `E-mail: ${email}` : "", phone ? `Telefoon: ${phone}` : ""].filter(Boolean).join(" | ");
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex,nofollow" /><title>${escapeHtml(title)} - ${escapeHtml(businessName)}</title><meta name="description" content="${escapeHtml(title)} van ${escapeHtml(businessName)}." /><link rel="canonical" href="${escapeHtml(siteUrl)}/${escapeHtml(page)}" />${faviconAsset ? `<link rel="icon" href="${escapeHtml(faviconAsset)}" type="image/svg+xml" />` : ""}<link rel="stylesheet" href="styles.css" /></head><body style="--brand:${escapeHtml(colors.brand)};--accent:${escapeHtml(colors.accent)};--ink:${escapeHtml(colors.ink)};--soft:${escapeHtml(colors.soft)};--dark:${escapeHtml(colors.dark || colors.ink)}"><header class="site-header"><a class="brand" href="index.html">${logoAsset ? `<img src="${escapeHtml(logoAsset)}" alt="${escapeHtml(businessName)} logo" />` : ""}<span>${escapeHtml(businessName)}</span></a><nav>${navigationLinks(packageRules).map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("")}</nav><a class="nav-cta" href="contact.html">${escapeHtml(cta)}</a></header><main><section class="sub-hero"><img src="${escapeHtml(heroAsset)}" alt="${escapeHtml(heroImage.alt)}" /><div><span class="eyebrow">${escapeHtml(packageRules.label)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(profile.intro)} ${escapeHtml(contactName)} kan deze pagina later aanvullen met echte cases, foto's en klantreacties.</p></div></section><section class="section-band section-heading"><div class="service-grid">${body}</div></section><section class="contact-section section-band"><div><span class="eyebrow">Contact</span><h2>${escapeHtml(cta)}</h2><p>${escapeHtml(contact || "Contactgegevens kunnen later worden aangevuld.")}</p><p>${escapeHtml(websiteUrl || "Website-informatie kan later worden aangevuld.")}</p></div><a class="button" href="${email ? `mailto:${escapeHtml(email)}` : "#"}">${escapeHtml(cta)}</a></section></main><footer class="site-footer"><strong>${escapeHtml(businessName)}</strong><span>${escapeHtml(packageRules.label)}</span></footer><script src="script.js"></script></body></html>`;
}

function renderCss() {
  return `:root{color-scheme:light;--paper:#f5f1ea;--line:rgba(17,24,39,.14);--muted:#5f6673;--shadow:0 30px 90px rgba(17,24,39,.18)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--paper);color:var(--ink)}a{color:inherit}.site-header{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:auto 1fr auto auto;gap:28px;align-items:center;padding:20px clamp(22px,4vw,64px);color:#fff;background:linear-gradient(180deg,rgba(17,24,20,.84),rgba(17,24,20,.68));backdrop-filter:blur(18px)}.brand{display:flex;align-items:center;gap:14px;text-decoration:none;font-size:20px;font-weight:900}.brand img{width:54px;height:54px;object-fit:contain}.site-header nav{display:flex;justify-content:center;gap:28px}.site-header nav a,.nav-phone{text-decoration:none;font-size:15px;font-weight:850;color:rgba(255,255,255,.86)}.nav-cta{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border-radius:3px;background:var(--accent);color:#fff;text-decoration:none;font-weight:950}.section-band{width:min(1160px,calc(100% - 44px));margin:0 auto}.hero{position:relative;display:grid;align-items:center;min-height:calc(100vh - 86px);padding:clamp(64px,8vw,120px) clamp(22px,4vw,84px);overflow:hidden;color:#fff;background:#111}.hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.76),rgba(0,0,0,.42) 45%,rgba(0,0,0,.16)),linear-gradient(0deg,rgba(0,0,0,.38),rgba(0,0,0,.08))}.hero-copy{position:relative;z-index:1;max-width:860px}.eyebrow{display:block;margin-bottom:20px;color:var(--accent);font-size:13px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}h1,h2,h3,p{letter-spacing:0}h1{max-width:920px;margin:0 0 24px;font-size:clamp(48px,7.4vw,104px);line-height:.94;font-weight:950}h2{max-width:850px;margin:0 0 22px;font-size:clamp(34px,5vw,66px);line-height:1;font-weight:950}h3{margin:0 0 10px;font-size:clamp(22px,2vw,30px);line-height:1.08}.hero p{max-width:760px;color:rgba(255,255,255,.88);font-size:clamp(19px,2vw,24px);line-height:1.6}.button{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:15px 24px;border:1px solid transparent;border-radius:3px;background:var(--accent);color:#fff;text-decoration:none;font-weight:950;box-shadow:0 18px 42px color-mix(in srgb,var(--accent) 32%,transparent)}.button.secondary{border-color:rgba(255,255,255,.42);background:rgba(255,255,255,.08);box-shadow:none}.hero-actions,.hero-proof{display:flex;flex-wrap:wrap;gap:14px;margin-top:32px}.hero-proof{margin-top:54px}.hero-proof span{min-width:180px;padding:18px 22px;border-left:1px solid rgba(255,255,255,.28);background:rgba(17,24,39,.42);font-size:15px;font-weight:850;color:rgba(255,255,255,.78)}.hero-proof strong{display:block;color:#fff;font-size:28px}.contact-bar{position:relative;z-index:4;display:grid;grid-template-columns:repeat(3,1fr);width:min(1040px,calc(100% - 44px));margin:-44px auto 80px;background:rgba(255,255,255,.94);box-shadow:var(--shadow)}.contact-bar a{display:grid;gap:5px;min-height:96px;padding:26px 32px;text-decoration:none;border-right:1px solid var(--line)}.contact-bar a:nth-child(2){background:var(--accent);color:#fff}.contact-bar strong{font-size:22px}.contact-bar span{color:var(--muted);font-weight:800}.contact-bar a:nth-child(2) span{color:rgba(255,255,255,.88)}.services-section,.benefits-section,.reviews-section,.gallery-section,.premium-offer,.contact-section,.preview-note,.section-heading,.portfolio-panel{padding:clamp(64px,7vw,110px) 0}.services-section h2{max-width:900px}.service-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:34px}.project-tile{position:relative;min-height:250px;display:flex;flex-direction:column;justify-content:flex-end;padding:20px;overflow:hidden;color:#fff;text-decoration:none;background:#111}.project-tile::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.74),rgba(0,0,0,.08))}.project-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .35s ease}.project-tile:hover img{transform:scale(1.045)}.project-tile span,.project-tile h3,.project-tile p{position:relative;z-index:1}.project-tile span{color:var(--accent);font-weight:950}.project-tile p{margin:0;color:rgba(255,255,255,.82);font-size:14px;line-height:1.5}.portfolio-panel{display:grid;grid-template-columns:.72fr 1.28fr;gap:28px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.portfolio-panel[hidden]{display:none}.portfolio-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.portfolio-item{position:relative;min-height:210px;overflow:hidden;color:#fff;background:#111}.portfolio-item img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.portfolio-item strong{position:absolute;left:18px;right:18px;bottom:18px;z-index:1;font-size:20px}.portfolio-item::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.68),transparent)}.benefits-section{display:grid;grid-template-columns:.85fr 1.15fr;gap:44px}.benefits-section p,.contact-section p,.section-heading p,.premium-offer p,.portfolio-panel p{color:var(--muted);font-size:19px;line-height:1.7}.benefit-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.benefit-card,.review-card,.preview-note,.company-card,.service-card:not(.project-tile){border:1px solid var(--line);background:#fff;box-shadow:0 22px 60px rgba(17,24,39,.07)}.benefit-card{padding:28px}.benefit-card strong{display:block;font-size:24px;margin-bottom:8px}.benefit-card p,.review-card p{margin:0;color:var(--muted);font-size:16px;line-height:1.65}.process-section{padding:clamp(76px,8vw,120px) 0;background:var(--dark);color:#fff}.process-section h2{color:#fff}.process-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:34px}.process-card{min-height:250px;padding:28px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.055)}.process-card span{display:block;margin-bottom:54px;color:var(--accent);font-weight:950}.process-card p{color:rgba(255,255,255,.72);font-size:16px;line-height:1.7}.reviews-section{display:grid;grid-template-columns:.8fr 1fr 1fr;gap:22px}.review-card{padding:32px}.review-card strong{display:block;font-size:26px;line-height:1.15;margin-bottom:22px}.gallery-section{display:grid;grid-template-columns:.75fr 1.25fr;gap:34px}.gallery-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.gallery-grid article{position:relative;min-height:220px;display:flex;align-items:flex-end;padding:22px;overflow:hidden;color:#fff;background:#111}.gallery-grid article::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.68),rgba(0,0,0,.06))}.gallery-grid img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.gallery-grid strong{position:relative;z-index:1;font-size:26px}.premium-offer{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.contact-section{display:grid;grid-template-columns:.88fr 1.12fr;gap:58px;align-items:start}.company-card{display:grid;gap:8px;margin-top:28px;padding:26px;border-top:5px solid var(--accent)}.company-card strong{font-size:32px}.preview-form{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;padding:34px;background:#fff;box-shadow:var(--shadow)}label{display:grid;gap:8px;font-weight:900}.wide{grid-column:1/-1}input,select,textarea{width:100%;min-height:54px;border:1px solid var(--line);background:var(--paper);padding:0 16px;font:inherit;font-weight:750;color:var(--ink)}textarea{min-height:150px;padding-top:14px;resize:vertical}button{min-height:56px;border:0;background:var(--accent);color:#fff;font:inherit;font-weight:950}.preview-form button,.preview-form small{grid-column:1/-1}.preview-form small{color:var(--muted)}.preview-note{padding:24px;margin-bottom:44px}.site-footer{display:flex;justify-content:space-between;gap:20px;padding:34px clamp(22px,4vw,64px);background:var(--dark);color:rgba(255,255,255,.72);font-weight:850}.site-footer strong{color:#fff}.sub-hero{position:relative;min-height:52vh;display:grid;align-items:end;padding:clamp(70px,8vw,120px) clamp(22px,5vw,86px);color:#fff;overflow:hidden;background:#111}.sub-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.sub-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.72),rgba(0,0,0,.18))}.sub-hero>div{position:relative;z-index:1}.section-heading .service-grid{grid-template-columns:repeat(3,1fr)}.section-heading .service-card{padding:28px}.section-heading .service-card img{width:100%;height:190px;object-fit:cover;margin:-28px -28px 24px;width:calc(100% + 56px)}@media(max-width:1100px){.service-grid{grid-template-columns:repeat(2,1fr)}.process-grid{grid-template-columns:repeat(2,1fr)}.site-header{grid-template-columns:1fr auto}.site-header nav,.nav-phone{display:none}.portfolio-panel{grid-template-columns:1fr}.portfolio-gallery{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.hero{min-height:72vh}.contact-bar,.benefits-section,.reviews-section,.gallery-section,.contact-section{grid-template-columns:1fr}.service-grid,.benefit-grid,.process-grid,.gallery-grid,.section-heading .service-grid,.preview-form,.portfolio-gallery{grid-template-columns:1fr}.contact-bar{margin:0 auto 50px}.hero-proof span{width:100%}h1{font-size:clamp(42px,15vw,68px)}}`;
}

function renderScript({ businessName, email, services }) {
  const portfolio = Object.fromEntries(services.slice(0, 6).map((service, index) => [service, {
    title: `${service} helder in beeld`,
    copy: `${service} krijgt een eigen visuele presentatie, korte uitleg en een directe route naar aanvraag of contact.`,
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
  const label = profile.label || "uw branche";
  return `${service} met een duidelijke uitleg, sterke visuele presentatie en een logische route naar aanvraag of contact.`;
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
