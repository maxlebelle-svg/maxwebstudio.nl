const DEMO_IMAGE_BASE = "assets/demo-images/library";
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

const branchImageGroups = Object.freeze([
  group("installatiebedrijf", "Installatiebedrijf", ["installatiebedrijf-demo"], ["installatie", "verduurzaming", "zonnepanelen", "warmtepomp", "airco", "laadpaal", "thuisbatterij"]),
  group("bouwbedrijf", "Bouwbedrijf", ["bouwbedrijf-demo"], ["bouw", "bouwbedrijf", "aannemer", "renovatie", "timmer", "nieuwbouw", "aanbouw"]),
  group("restaurant", "Restaurant", ["restaurant-demo"], ["horeca", "restaurant", "lunchroom", "eetcafe", "menu", "reserveren"]),
  group("sportschool", "Sportschool", ["sportschool-demo"], ["fitness", "sportschool", "personal trainer", "proefles", "rooster", "membership"]),
  group("advocaat", "Advocaat", ["advocaat-demo"], ["advocaat", "advocatuur", "juridisch", "jurist", "recht", "intake"]),
  group("autobedrijf", "Autobedrijf", ["autobedrijf-demo"], ["automotive", "autobedrijf", "garage", "showroom", "occasions", "apk", "onderhoud"]),
  customGroup("rijschool", "Rijschool en scooterles", ["rijschool-demo"], ["rijschool", "verkeersschool", "rijles", "autorijles", "scooter", "scooterrijbewijs", "bromfiets", "examengarantie", "praktijkexamen", "theorie", "cbr"], {
    hero: customAsset("rijschool", "Rijschool en scooterles", "hero", "autorijles-hero.png", "Rijschool autorijles hero afbeelding voor demo website"),
    service: customAsset("rijschool", "Rijschool en scooterles", "service", "motorles-hero.png", "Rijschool motorles afbeelding voor pakketten en diensten"),
    project: customAsset("rijschool", "Rijschool en scooterles", "project", "scooterles-hero.png", "Rijschool scooterles afbeelding voor campagne of projectblok"),
  }),
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
    hero: customAsset("holistisch", "Holistische praktijk", "hero", "hero.png", "Holistische praktijk hero afbeelding voor demo website", "schoonheidssalon"),
    service: customAsset("holistisch", "Holistische praktijk", "service", "service.png", "Holistische praktijk diensten afbeelding voor demo website", "schoonheidssalon"),
    team: customAsset("holistisch", "Holistische praktijk", "team", "team.png", "Holistische praktijk team en werkwijze afbeelding voor demo website", "schoonheidssalon"),
    project: customAsset("holistisch", "Holistische praktijk", "project", "project.png", "Holistische praktijk sessie afbeelding voor demo website", "schoonheidssalon"),
    contact: customAsset("holistisch", "Holistische praktijk", "contact", "contact.png", "Holistische praktijk contact afbeelding voor demo website", "schoonheidssalon"),
    "service-alt": customAsset("holistisch", "Holistische praktijk", "service-alt", "service-alt.png", "Holistische praktijk extra dienst afbeelding voor demo website", "schoonheidssalon"),
    "project-alt": customAsset("holistisch", "Holistische praktijk", "project-alt", "project-alt.png", "Holistische praktijk extra sessie afbeelding voor demo website", "schoonheidssalon"),
    detail: customAsset("holistisch", "Holistische praktijk", "detail", "detail.png", "Holistische praktijk detail afbeelding voor demo website", "schoonheidssalon"),
    review: customAsset("holistisch", "Holistische praktijk", "review", "review.png", "Holistische praktijk review en vertrouwen afbeelding voor demo website", "schoonheidssalon"),
    background: customAsset("holistisch", "Holistische praktijk", "background", "background.png", "Holistische praktijk achtergrond afbeelding voor demo website", "schoonheidssalon"),
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

function customGroup(slug, label, demoSiteIds, keywords, assets) {
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

function customAsset(groupSlug, groupLabel, role, filename, alt, sourceGroupSlug = groupSlug) {
  return Object.freeze({
    slug: `${groupSlug}-${role}`,
    groupSlug,
    role,
    type: role,
    src: `${DEMO_IMAGE_BASE}/${sourceGroupSlug}/${filename}`,
    alt: alt || `${groupLabel} ${roleLabels[role] || role} afbeelding voor demo website`,
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

export function listDemoImageGroups() {
  return [...branchImageGroups];
}

export function listDemoImageAssets() {
  return branchImageGroups.flatMap((groupItem) => DEMO_IMAGE_ROLES.map((role) => groupItem.assets[role]));
}

export function resolveDemoImageGroup(input = {}) {
  const scored = branchImageGroups
    .map((groupItem) => ({ groupItem, score: scoreGroup(groupItem, input) }))
    .sort((left, right) => right.score - left.score);
  return scored[0]?.score > 0 ? scored[0].groupItem : branchImageGroups[0];
}

export function resolveDemoImageAssetSet(input = {}) {
  return resolveDemoImageGroup(input).assets;
}

export function resolveDemoImageAsset(input = {}, role = "hero") {
  const assets = resolveDemoImageAssetSet(input);
  return assets[role] || assets.hero;
}
