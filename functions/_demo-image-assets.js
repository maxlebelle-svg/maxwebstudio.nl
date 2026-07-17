const DEMO_IMAGE_BASE = "/assets/demo-images/library";
const { selectPhotoAssetGroup, selectPhotoAssetsForSlots } = require("./industry-intelligence/photo-selection-policy");
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

const HOLISTIC_ASSET_CATALOG = Object.freeze([
  holisticAsset("natuur-coaching.png", "738b4556db3740f817ebec634e38ccab9c71bbbbebaf35e9d2ab5995dcdfa020", ["holistic", "nature", "calm", "coaching", "personal-growth", "walking", "connection", "16:9"]),
  holisticAsset("intake-gesprek.png", "62469f59bd29b112293e55944b0a1e6c446e766c409da2be5ebd295a9f9b7e25", ["holistic", "conversation", "coaching", "consultation", "guidance", "personal-guidance", "16:9"]),
  holisticAsset("behandelruimte.png", "393df479022a4af73832cf07f6f483d785ce37d4ca4a8f0cec8872fdfbf92dce", ["holistic", "treatment-room", "wellness", "session", "calm", "interior", "16:9"]),
  holisticAsset("meditatie-moment.png", "40aab94edf279ddb6690bc53526758d6776313103552a06c1e76f5793918e995", ["holistic", "meditation", "mindfulness", "relaxation", "nature", "calm"], "5:3"),
  holisticAsset("wellness-details.png", "74438384500f30490d4609ad4d98e9e77c054873f3ffda35b23dc15b883208ad", ["holistic", "energy-work", "holistic-treatment", "hands", "peaceful", "wellness", "16:9"]),
  holisticAsset("ademwerk-groep.png", "e342c1651d560f85a4f09f0bd2e114ea6103c033614bdb63ced205a5a62f5a42", ["holistic", "energy-work", "breathwork", "session", "connection", "peaceful", "16:9"]),
  holisticAsset("journaling-begeleiding.png", "b1fc4d3043a9bb355e4e7cfced11c4c8d43b10e05349b84a8b9f25a6ddd0bb86", ["holistic", "personal-guidance", "journaling", "reflection", "coaching", "personal-growth", "calm", "16:9"]),
  holisticAsset("ontspanning-sessie.png", "e19a44a040762889afb3c475d8442a077a690f09c069f5fbad44d07b6e50ab29", ["holistic", "relaxation", "wellness", "session", "calm", "16:9"]),
  holisticAsset("thee-wachtruimte.png", "f0040d19ef49dc7827b7d53d664ace615c71791aac9bb7740079ae4958f1fd1b", ["holistic", "welcoming", "calm", "wellness", "interior", "connection", "16:9"]),
  holisticAsset("sessie-voorbereiden.png", "0a8f03fc6bef6c522758f68a4216f8875ab9d2ba1a36cfb6646359e6fc9dfcc3", ["holistic", "authentic", "personal-guidance", "session", "treatment-room", "calm", "16:9"]),
]);

const SLOT_TO_LEGACY_ROLE = Object.freeze({
  hero: "hero",
  introduction: "background",
  service_1: "detail",
  service_2: "team",
  service_3: "service",
  service_4: "service-alt",
  service_5: "project",
  about: "project-alt",
  contact: "contact",
  testimonial: "review",
});

const ACTIVE_LEGACY_IMAGE_SLOTS = Object.freeze([
  "hero",
  "service_1",
  "service_2",
  "service_3",
  "service_4",
  "service_5",
]);

const demoImageGroups = Object.freeze([
  group("installatiebedrijf", "Installatiebedrijf", ["installatiebedrijf-demo"], ["installatie", "verduurzaming", "zonnepanelen", "warmtepomp", "airco", "laadpaal", "thuisbatterij"]),
  customGroup("tegelzetbedrijf", "Tegelzetbedrijf", ["tegelzetbedrijf-demo"], ["tegel", "tegelzet", "tegelzetter", "tegelwerk", "vloertegel", "wandtegel", "badkamertegel", "natuursteen", "voegwerk", "kitwerk"], {
    hero: { fileName: "badkamer-natuursteen.jpg", sourceGroupSlug: "quantumbouw" },
    service: { fileName: "badkamer-licht.jpg", sourceGroupSlug: "quantumbouw" },
    team: { fileName: "badkamer.jpg", sourceGroupSlug: "quantumbouw" },
    project: { fileName: "badkamer-donker.jpg", sourceGroupSlug: "quantumbouw" },
    contact: { fileName: "badkamer-licht.jpg", sourceGroupSlug: "quantumbouw" },
    "service-alt": { fileName: "badkamer.jpg", sourceGroupSlug: "quantumbouw" },
    "project-alt": { fileName: "badkamer-natuursteen.jpg", sourceGroupSlug: "quantumbouw" },
    detail: { fileName: "badkamer-natuursteen.jpg", sourceGroupSlug: "quantumbouw" },
    review: { fileName: "badkamer-licht.jpg", sourceGroupSlug: "quantumbouw" },
    background: { fileName: "badkamer-donker.jpg", sourceGroupSlug: "quantumbouw" },
  }),
  customGroup("timmerwerk", "Timmerwerk", ["timmerwerk-demo"], ["timmer", "timmerwerk", "timmerwerken", "timmerbedrijf", "timmerman", "maatwerk", "zolder", "dakkapel", "vliering", "overkapping", "tuinhuis", "gevelbekleding", "houtwerk", "kozijn", "kozijnen"], {
    hero: { fileName: "hero.png", sourceGroupSlug: "bouwbedrijf" },
    service: { fileName: "service.png", sourceGroupSlug: "bouwbedrijf" },
    team: { fileName: "team.png", sourceGroupSlug: "bouwbedrijf" },
    project: { fileName: "project.png", sourceGroupSlug: "bouwbedrijf" },
    contact: { fileName: "contact.png", sourceGroupSlug: "bouwbedrijf" },
    "service-alt": { fileName: "service-alt.png", sourceGroupSlug: "bouwbedrijf" },
    "project-alt": { fileName: "project-alt.png", sourceGroupSlug: "bouwbedrijf" },
    detail: { fileName: "detail.png", sourceGroupSlug: "bouwbedrijf" },
    review: { fileName: "review.png", sourceGroupSlug: "bouwbedrijf" },
    background: { fileName: "background.png", sourceGroupSlug: "bouwbedrijf" },
  }),
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
  holisticGroup(),
  group("makelaar", "Makelaar", ["makelaar-demo"], ["vastgoed", "makelaar", "woning", "taxatie", "waardebepaling", "bezichtiging"]),
  group("hotel", "Hotel", ["hotel-demo"], ["hotel", "b&b", "bed and breakfast", "hospitality", "kamers", "boeken", "verblijf"]),
  group("financieel-adviseur", "Financieel adviseur", ["financieel-adviseur-demo"], ["financieel", "financieel advies", "hypotheek", "accountant", "belasting", "advies"]),
  group("fysiotherapie", "Fysiotherapie", ["fysiotherapie-demo"], ["fysiotherapie", "fysiotherapeut", "revalidatie", "herstel", "sportzorg", "pijnklachten"]),
  group("kinderopvang", "Kinderopvang", ["kinderopvang-demo"], ["kinderopvang", "bso", "peuteropvang", "opvang", "rondleiding", "aanmelden"]),
  customGroup("neutral-professional", "Neutrale professionele dienstverlening", [], ["neutral", "professional", "local service"], Object.fromEntries(DEMO_IMAGE_ROLES.map((role) => [role, { fileName: `${role}.png`, sourceGroupSlug: "financieel-adviseur" }]))),
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

function holisticGroup() {
  const assets = Object.fromEntries(ACTIVE_LEGACY_IMAGE_SLOTS.map((slot, index) => {
    const role = SLOT_TO_LEGACY_ROLE[slot];
    return [role, roleAssetFromSelection(HOLISTIC_ASSET_CATALOG[index], role, slot)];
  }));
  return Object.freeze({
    slug: "holistisch",
    label: "Holistische praktijk",
    demoSiteIds: Object.freeze(["holistisch-demo"]),
    keywords: Object.freeze(["holistisch", "spiritueel", "healing", "healer", "energie", "energetisch", "ademwerk", "bewustzijn", "rituelen", "ceremonie"]),
    assets: Object.freeze(assets),
    assetCatalog: HOLISTIC_ASSET_CATALOG,
  });
}

function holisticAsset(fileName, checksum, tags, aspectRatio = "16:9") {
  const name = fileName.replace(/\.[^.]+$/, "");
  return Object.freeze({
    assetId: `holistisch:${name}`,
    slug: `holistisch-${name}`,
    groupSlug: "holistisch",
    src: `${DEMO_IMAGE_BASE}/holistisch/${fileName}`,
    checksum,
    tags: Object.freeze(tags),
    aspectRatio,
    imageType: "photo",
    visualSuitability: 1,
    alt: `Holistische praktijk ${name.replace(/-/g, " ")}`,
  });
}

function roleAssetFromSelection(selected = {}, role = "service", slot = "introduction") {
  return Object.freeze({
    ...selected,
    role,
    type: role,
    selectionSlot: slot,
    alt: selected.alt || `Holistische praktijk ${roleLabels[role]} afbeelding voor demo website`,
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
  return scored[0]?.score > 0 ? scored[0].groupItem : demoImageGroups.find((item) => item.slug === "neutral-professional");
}

function resolveDemoImageAssetSetForProfile(profile, input = {}) {
  const selection = selectPhotoAssetGroup(profile, demoImageGroups);
  const groupItem = selection.group || demoImageGroups.find((item) => item.slug === "neutral-professional");
  if (Array.isArray(groupItem.assetCatalog) && groupItem.assetCatalog.length) {
    const slotSelection = selectPhotoAssetsForSlots(profile, groupItem.assetCatalog);
    const assets = Object.fromEntries(ACTIVE_LEGACY_IMAGE_SLOTS.map((slot) => {
      const role = SLOT_TO_LEGACY_ROLE[slot];
      return [role, roleAssetFromSelection(slotSelection.slots[slot], role, slot)];
    }));
    const slots = Object.fromEntries(Object.entries(slotSelection.slots).map(([slot, selected]) => [slot, selected ? {
      selectedAssetId: selected.selectedAssetId,
      checksum: selected.checksum,
      score: selected.score,
      slot: selected.slot,
      duplicateAvoided: selected.duplicateAvoided,
      fallbackReason: selected.fallbackReason,
      reusedAsset: selected.reusedAsset,
    } : null]));
    return {
      assets,
      selection: {
        ...selection,
        group: undefined,
        groupSlug: groupItem.slug,
        fallbackGroupUsed: !selection.group,
        slots,
        uniqueAssetCount: slotSelection.uniqueAssetCount,
        uniqueChecksumCount: slotSelection.uniqueChecksumCount,
        fallbackCount: slotSelection.fallbackCount,
      },
    };
  }
  return { assets: groupItem.assets, selection: { ...selection, group: undefined, groupSlug: groupItem.slug, fallbackGroupUsed: !selection.group } };
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
  HOLISTIC_ASSET_CATALOG,
  demoImageGroups,
  resolveDemoImageAsset,
  resolveDemoImageAssetSet,
  resolveDemoImageAssetSetForProfile,
  resolveDemoImageGroup,
};
