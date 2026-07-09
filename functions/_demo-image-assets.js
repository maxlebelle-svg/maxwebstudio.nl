const DEMO_IMAGE_BASE = "/assets/demo-images/library";
const DEMO_IMAGE_ROLES = Object.freeze([
  "hero",
  "service",
  "team",
  "project",
  "contact",
  "service-alt",
  "project-alt",
  "detail",
  "review",
  "background",
]);

const roleLabels = Object.freeze({
  hero: "hero",
  service: "diensten",
  team: "team en werkwijze",
  project: "project of resultaat",
  contact: "contact en aanvraag",
  "service-alt": "extra dienst",
  "project-alt": "extra project",
  detail: "detail",
  review: "review en vertrouwen",
  background: "achtergrond",
});

const demoImageGroups = Object.freeze([
  group("installatiebedrijf", "Installatiebedrijf", ["installatiebedrijf-demo"], ["installatie", "verduurzaming", "zonnepanelen", "warmtepomp", "airco", "laadpaal", "thuisbatterij"]),
  group("bouwbedrijf", "Bouwbedrijf", ["bouwbedrijf-demo"], ["bouw", "bouwbedrijf", "aannemer", "renovatie", "timmer", "nieuwbouw", "aanbouw"]),
  group("restaurant", "Restaurant", ["restaurant-demo"], ["horeca", "restaurant", "lunchroom", "eetcafe", "menu", "reserveren"]),
  group("sportschool", "Sportschool", ["sportschool-demo"], ["fitness", "sportschool", "personal trainer", "proefles", "rooster", "membership"]),
  group("advocaat", "Advocaat", ["advocaat-demo"], ["advocaat", "advocatuur", "juridisch", "jurist", "recht", "intake"]),
  customGroup("rijschool", "Rijschool", ["rijschool-demo"], ["rijschool", "verkeersschool", "rijles", "autorijles", "scooter", "scooterrijbewijs", "bromfiets", "examengarantie", "praktijkexamen", "theorie", "cbr"], {
    hero: "scooterles-hero.png",
    service: "scooterles-kruispunt.png",
    team: "instructeur-briefing.png",
    project: "auto-interieur-les.png",
    contact: "rijschool-voertuigen.png",
    "service-alt": "theorieles.png",
    "project-alt": "geslaagd-moment.png",
    detail: "parkeeroefening.png",
    review: "geslaagd-moment.png",
    background: "scooterles-hero.png",
  }),
  group("autobedrijf", "Autobedrijf", ["autobedrijf-demo"], ["automotive", "autobedrijf", "garage", "showroom", "occasions", "apk", "onderhoud", "autoairco", "auto-airco", "auto airco", "autoservice", "diagnose", "reparatie"]),
  group("kapsalon", "Kapsalon", ["kapsalon-demo"], ["kapsalon", "kapper", "barber", "barbershop", "knippen", "kleuren", "styling"]),
  group("tandarts", "Tandarts", ["tandarts-demo"], ["tandarts", "mondzorg", "zorg", "controle", "preventie", "esthetiek", "spoed"]),
  group("elektricien", "Elektricien", ["elektricien-demo"], ["elektricien", "elektra", "groepenkast", "storing", "storingen", "laadpaal"]),
  group("loodgieter", "Loodgieter", ["loodgieter-demo"], ["loodgieter", "lekkage", "cv", "sanitair", "leiding", "onderhoud"]),
  group("hovenier", "Hovenier", ["hovenier-demo"], ["hovenier", "tuin", "tuinaanleg", "tuinontwerp", "groen", "onderhoud"]),
  group("schoonmaakbedrijf", "Schoonmaakbedrijf", ["schoonmaakbedrijf-demo"], ["schoonmaak", "schoonmaakbedrijf", "kantoor", "vve", "oplevering", "contracten"]),
  group("verhuisbedrijf", "Verhuisbedrijf", ["verhuisbedrijf-demo"], ["verhuisbedrijf", "verhuizen", "transport", "opslag", "planning", "logistiek"]),
  group("dierenarts", "Dierenarts", ["dierenarts-demo"], ["dierenarts", "dierenzorg", "kliniek", "consult", "vaccinatie", "huisdieren"]),
  group("schoonheidssalon", "Schoonheidssalon", ["schoonheidssalon-demo"], ["schoonheidssalon", "beauty", "wellness", "facials", "massage", "huidverbetering"]),
  customGroup("holistisch", "Holistische praktijk", ["holistisch-demo"], ["holistisch", "spiritueel", "zweverig", "healing", "healer", "energie", "energetisch", "ademwerk", "bewustzijn", "rituelen", "ceremonie"], {
    hero: { fileName: "hero.png", sourceGroupSlug: "schoonheidssalon" },
    service: { fileName: "service.png", sourceGroupSlug: "schoonheidssalon" },
    team: { fileName: "team.png", sourceGroupSlug: "schoonheidssalon" },
    project: { fileName: "project.png", sourceGroupSlug: "schoonheidssalon" },
    contact: { fileName: "contact.png", sourceGroupSlug: "schoonheidssalon" },
    "service-alt": { fileName: "service-alt.png", sourceGroupSlug: "schoonheidssalon" },
    "project-alt": { fileName: "project-alt.png", sourceGroupSlug: "schoonheidssalon" },
    detail: { fileName: "detail.png", sourceGroupSlug: "schoonheidssalon" },
    review: { fileName: "review.png", sourceGroupSlug: "schoonheidssalon" },
    background: { fileName: "background.png", sourceGroupSlug: "schoonheidssalon" },
  }),
  group("makelaar", "Makelaar", ["makelaar-demo"], ["vastgoed", "makelaar", "woning", "taxatie", "waardebepaling", "bezichtiging"]),
  group("hotel", "Hotel", ["hotel-demo"], ["hotel", "b&b", "bed and breakfast", "hospitality", "kamers", "boeken", "verblijf"]),
  group("financieel-adviseur", "Financieel adviseur", ["financieel-adviseur-demo"], ["financieel", "financieel advies", "hypotheek", "accountant", "belasting", "advies"]),
  group("fysiotherapie", "Fysiotherapie", ["fysiotherapie-demo"], ["fysiotherapie", "fysiotherapeut", "revalidatie", "herstel", "sportzorg", "pijnklachten"]),
  group("kinderopvang", "Kinderopvang", ["kinderopvang-demo"], ["kinderopvang", "bso", "peuteropvang", "opvang", "rondleiding", "aanmelden"]),
]);

function group(slug, label, demoSiteIds, keywords) {
  const assets = Object.fromEntries(DEMO_IMAGE_ROLES.map((role) => [role, asset(slug, label, role)]));
  return Object.freeze({
    slug,
    label,
    demoSiteIds: Object.freeze(demoSiteIds),
    keywords: Object.freeze(keywords),
    assets: Object.freeze(assets),
  });
}

function customGroup(slug, label, demoSiteIds, keywords, roleFiles = {}) {
  const assets = Object.fromEntries(DEMO_IMAGE_ROLES.map((role) => [role, customAsset(slug, label, role, roleFiles[role] || roleFiles.hero)]));
  return Object.freeze({
    slug,
    label,
    demoSiteIds: Object.freeze(demoSiteIds),
    keywords: Object.freeze(keywords),
    assets: Object.freeze(assets),
  });
}

function asset(groupSlug, groupLabel, role) {
  return Object.freeze({
    slug: `${groupSlug}-${role}`,
    groupSlug,
    role,
    type: role,
    src: `${DEMO_IMAGE_BASE}/${groupSlug}/${role}.png`,
    alt: `${groupLabel} ${roleLabels[role]} afbeelding voor demo website`,
  });
}

function customAsset(groupSlug, groupLabel, role, fileConfig) {
  const fileName = typeof fileConfig === "string" ? fileConfig : fileConfig?.fileName;
  const sourceGroupSlug = typeof fileConfig === "string" ? groupSlug : fileConfig?.sourceGroupSlug || groupSlug;
  return Object.freeze({
    slug: `${groupSlug}-${role}`,
    groupSlug,
    role,
    type: role,
    src: `${DEMO_IMAGE_BASE}/${sourceGroupSlug}/${fileName}`,
    alt: `${groupLabel} ${roleLabels[role]} afbeelding voor demo website`,
  });
}

function textForMatch(input = {}) {
  return [
    input.id,
    input.name,
    input.businessName,
    input.industry,
    input.branche,
    input.doelgroep,
    input.briefing,
    input.customerWishes,
    ...(input.highlights || []),
    ...(input.services || []),
    ...(input.tags || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function scoreGroup(groupItem, input = {}) {
  const text = textForMatch(input);
  const id = String(input.id || "").toLowerCase();
  const idScore = groupItem.demoSiteIds.some((demoSiteId) => demoSiteId.toLowerCase() === id) ? 100 : 0;
  const slugScore = text.includes(groupItem.slug) ? 10 : 0;
  const keywordScore = groupItem.keywords.reduce((total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0);
  return idScore + slugScore + keywordScore;
}

function resolveDemoImageGroup(input = {}) {
  const scored = demoImageGroups
    .map((groupItem) => ({ groupItem, score: scoreGroup(groupItem, input) }))
    .sort((left, right) => right.score - left.score);
  return scored[0]?.score > 0 ? scored[0].groupItem : demoImageGroups[0];
}

function resolveDemoImageAssetSet(input = {}) {
  return resolveDemoImageGroup(input).assets;
}

function resolveDemoImageAsset(input = {}, role = "hero") {
  const assets = resolveDemoImageAssetSet(input);
  return assets[role] || assets.hero;
}

module.exports = {
  DEMO_IMAGE_ROLES,
  demoImageGroups,
  resolveDemoImageAsset,
  resolveDemoImageAssetSet,
  resolveDemoImageGroup,
};
