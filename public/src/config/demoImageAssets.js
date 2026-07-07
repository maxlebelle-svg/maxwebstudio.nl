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
  customGroup("quantumbouw", "Quantumbouw.nl", ["quantumbouw-production"], ["quantumbouw", "quantum bouw", "bouw", "renovatie", "aanbouw", "dakopbouw", "dakkapel", "badkamer", "kozijnen", "busbestickering"], {
    hero: customAsset("quantumbouw", "Quantumbouw.nl", "hero", "hero-renovatie.jpg", "Quantumbouw.nl hero afbeelding voor website, social media en drukwerk"),
    service: customAsset("quantumbouw", "Quantumbouw.nl", "service", "aanbouw.jpg", "Quantumbouw.nl aanbouw afbeelding voor diensten en website"),
    team: customAsset("quantumbouw", "Quantumbouw.nl", "team", "quantumbouw-logo-original.jpeg", "Quantumbouw.nl logo afbeelding voor klantprofiel en branding"),
    project: customAsset("quantumbouw", "Quantumbouw.nl", "project", "badkamer.jpg", "Quantumbouw.nl badkamer projectafbeelding voor website en portfolio"),
    contact: customAsset("quantumbouw", "Quantumbouw.nl", "contact", "quantumbouw-logo.jpg", "Quantumbouw.nl contact en logo afbeelding voor website en drukwerk"),
    "service-alt": customAsset("quantumbouw", "Quantumbouw.nl", "service-alt", "dakopbouw.jpg", "Quantumbouw.nl dakopbouw afbeelding voor diensten en website"),
    "project-alt": customAsset("quantumbouw", "Quantumbouw.nl", "project-alt", "dakkapel.jpg", "Quantumbouw.nl dakkapel projectafbeelding voor website en portfolio"),
    detail: customAsset("quantumbouw", "Quantumbouw.nl", "detail", "kozijnen.jpg", "Quantumbouw.nl kozijnen detailafbeelding voor website en drukwerk"),
    review: customAsset("quantumbouw", "Quantumbouw.nl", "review", "og-image.jpg", "Quantumbouw.nl social preview afbeelding voor vertrouwen en deelmomenten"),
    background: customAsset("quantumbouw", "Quantumbouw.nl", "background", "aanbouw-baksteen.jpg", "Quantumbouw.nl achtergrondafbeelding voor website en social media"),
    "aanbouw-baksteen": customAsset("quantumbouw", "Quantumbouw.nl", "aanbouw-baksteen", "aanbouw-baksteen.jpg", "Quantumbouw.nl Aanbouw Baksteen klantafbeelding voor website, social media en drukwerk"),
    "aanbouw-stuc": customAsset("quantumbouw", "Quantumbouw.nl", "aanbouw-stuc", "aanbouw-stuc.jpg", "Quantumbouw.nl Aanbouw Stuc klantafbeelding voor website, social media en drukwerk"),
    "aanbouw-villa": customAsset("quantumbouw", "Quantumbouw.nl", "aanbouw-villa", "aanbouw-villa.jpg", "Quantumbouw.nl Aanbouw Villa klantafbeelding voor website, social media en drukwerk"),
    "aanbouw": customAsset("quantumbouw", "Quantumbouw.nl", "aanbouw", "aanbouw.jpg", "Quantumbouw.nl Aanbouw klantafbeelding voor website, social media en drukwerk"),
    "badkamer-donker": customAsset("quantumbouw", "Quantumbouw.nl", "badkamer-donker", "badkamer-donker.jpg", "Quantumbouw.nl Badkamer Donker klantafbeelding voor website, social media en drukwerk"),
    "badkamer-licht": customAsset("quantumbouw", "Quantumbouw.nl", "badkamer-licht", "badkamer-licht.jpg", "Quantumbouw.nl Badkamer Licht klantafbeelding voor website, social media en drukwerk"),
    "badkamer-natuursteen": customAsset("quantumbouw", "Quantumbouw.nl", "badkamer-natuursteen", "badkamer-natuursteen.jpg", "Quantumbouw.nl Badkamer Natuursteen klantafbeelding voor website, social media en drukwerk"),
    "badkamer": customAsset("quantumbouw", "Quantumbouw.nl", "badkamer", "badkamer.jpg", "Quantumbouw.nl Badkamer klantafbeelding voor website, social media en drukwerk"),
    "dakkapel-antraciet": customAsset("quantumbouw", "Quantumbouw.nl", "dakkapel-antraciet", "dakkapel-antraciet.jpg", "Quantumbouw.nl Dakkapel Antraciet klantafbeelding voor website, social media en drukwerk"),
    "dakkapel-klassiek": customAsset("quantumbouw", "Quantumbouw.nl", "dakkapel-klassiek", "dakkapel-klassiek.jpg", "Quantumbouw.nl Dakkapel Klassiek klantafbeelding voor website, social media en drukwerk"),
    "dakkapel-traditioneel": customAsset("quantumbouw", "Quantumbouw.nl", "dakkapel-traditioneel", "dakkapel-traditioneel.jpg", "Quantumbouw.nl Dakkapel Traditioneel klantafbeelding voor website, social media en drukwerk"),
    "dakkapel": customAsset("quantumbouw", "Quantumbouw.nl", "dakkapel", "dakkapel.jpg", "Quantumbouw.nl Dakkapel klantafbeelding voor website, social media en drukwerk"),
    "dakopbouw-hout": customAsset("quantumbouw", "Quantumbouw.nl", "dakopbouw-hout", "dakopbouw-hout.jpg", "Quantumbouw.nl Dakopbouw Hout klantafbeelding voor website, social media en drukwerk"),
    "dakopbouw-licht": customAsset("quantumbouw", "Quantumbouw.nl", "dakopbouw-licht", "dakopbouw-licht.jpg", "Quantumbouw.nl Dakopbouw Licht klantafbeelding voor website, social media en drukwerk"),
    "dakopbouw-stad": customAsset("quantumbouw", "Quantumbouw.nl", "dakopbouw-stad", "dakopbouw-stad.jpg", "Quantumbouw.nl Dakopbouw Stad klantafbeelding voor website, social media en drukwerk"),
    "dakopbouw": customAsset("quantumbouw", "Quantumbouw.nl", "dakopbouw", "dakopbouw.jpg", "Quantumbouw.nl Dakopbouw klantafbeelding voor website, social media en drukwerk"),
    favicon: customAsset("quantumbouw", "Quantumbouw.nl", "favicon", "favicon.png", "Quantumbouw.nl favicon voor website en herkenning"),
    "hero-renovatie": customAsset("quantumbouw", "Quantumbouw.nl", "hero-renovatie", "hero-renovatie.jpg", "Quantumbouw.nl Hero Renovatie klantafbeelding voor website, social media en drukwerk"),
    "kozijnen-jaren30": customAsset("quantumbouw", "Quantumbouw.nl", "kozijnen-jaren30", "kozijnen-jaren30.jpg", "Quantumbouw.nl Kozijnen Jaren30 klantafbeelding voor website, social media en drukwerk"),
    "kozijnen-schuifpui": customAsset("quantumbouw", "Quantumbouw.nl", "kozijnen-schuifpui", "kozijnen-schuifpui.jpg", "Quantumbouw.nl Kozijnen Schuifpui klantafbeelding voor website, social media en drukwerk"),
    "kozijnen-wit": customAsset("quantumbouw", "Quantumbouw.nl", "kozijnen-wit", "kozijnen-wit.jpg", "Quantumbouw.nl Kozijnen Wit klantafbeelding voor website, social media en drukwerk"),
    kozijnen: customAsset("quantumbouw", "Quantumbouw.nl", "kozijnen", "kozijnen.jpg", "Quantumbouw.nl Kozijnen klantafbeelding voor website, social media en drukwerk"),
    "og-image": customAsset("quantumbouw", "Quantumbouw.nl", "og-image", "og-image.jpg", "Quantumbouw.nl social preview afbeelding voor website en social media"),
    "quantumbouw-logo-original": customAsset("quantumbouw", "Quantumbouw.nl", "quantumbouw-logo-original", "quantumbouw-logo-original.jpeg", "Quantumbouw.nl origineel logo voor drukwerk, busbestickering en branding"),
    "quantumbouw-logo": customAsset("quantumbouw", "Quantumbouw.nl", "quantumbouw-logo", "quantumbouw-logo.jpg", "Quantumbouw.nl web logo voor website, social media en drukwerk"),
  }),
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
    hero: customAsset("holistisch", "Holistische praktijk", "hero", "intake-gesprek.png", "Holistische praktijk intakegesprek afbeelding voor demo website"),
    service: customAsset("holistisch", "Holistische praktijk", "service", "ontspanning-sessie.png", "Holistische praktijk ontspanningssessie afbeelding voor demo website"),
    team: customAsset("holistisch", "Holistische praktijk", "team", "journaling-begeleiding.png", "Holistische praktijk begeleiding afbeelding voor demo website"),
    project: customAsset("holistisch", "Holistische praktijk", "project", "ademwerk-groep.png", "Holistische praktijk ademwerk afbeelding voor demo website"),
    contact: customAsset("holistisch", "Holistische praktijk", "contact", "behandelruimte.png", "Holistische praktijk behandelruimte afbeelding voor demo website"),
    "service-alt": customAsset("holistisch", "Holistische praktijk", "service-alt", "meditatie-moment.png", "Holistische praktijk meditatie afbeelding voor demo website"),
    "project-alt": customAsset("holistisch", "Holistische praktijk", "project-alt", "natuur-coaching.png", "Holistische praktijk natuurcoaching afbeelding voor demo website"),
    detail: customAsset("holistisch", "Holistische praktijk", "detail", "wellness-details.png", "Holistische praktijk detail afbeelding voor demo website"),
    review: customAsset("holistisch", "Holistische praktijk", "review", "thee-wachtruimte.png", "Holistische praktijk vertrouwen afbeelding voor demo website"),
    background: customAsset("holistisch", "Holistische praktijk", "background", "sessie-voorbereiden.png", "Holistische praktijk achtergrond afbeelding voor demo website"),
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
  const assets = branchImageGroups.flatMap((groupItem) => Object.values(groupItem.assets || {}));
  return assets.filter((assetItem, index) => assets.findIndex((item) => item.src === assetItem.src) === index);
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
