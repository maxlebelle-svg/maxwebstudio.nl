const DEMO_IMAGE_BASE = "assets/demo-images";

const demoImageAssets = Object.freeze([
  createAsset({
    slug: "installatie",
    src: `${DEMO_IMAGE_BASE}/demo-hero-installatie.jpg`,
    alt: "Moderne duurzame installatie met zonnepanelen en energieoplossingen",
    keywords: ["installatie", "verduurzaming", "zonnepanelen", "warmtepomp", "airco", "laadpaal", "thuisbatterij"],
  }),
  createAsset({
    slug: "bouw",
    src: `${DEMO_IMAGE_BASE}/demo-hero-bouw.jpg`,
    alt: "Professioneel bouwproject met vakwerk en moderne materialen",
    keywords: ["bouw", "bouwbedrijf", "aannemer", "renovatie", "timmer", "nieuwbouw", "aanbouw"],
  }),
  createAsset({
    slug: "horeca",
    src: `${DEMO_IMAGE_BASE}/demo-hero-horeca.jpg`,
    alt: "Sfeervol restaurantinterieur voor horeca websites",
    keywords: ["horeca", "restaurant", "lunchroom", "eetcafe", "menu", "reserveren"],
  }),
  createAsset({
    slug: "fitness",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-fitness.png`,
    alt: "Moderne fitnessstudio met professionele trainingsruimte",
    keywords: ["fitness", "sportschool", "personal trainer", "proefles", "rooster", "membership"],
  }),
  createAsset({
    slug: "advocaat",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-advocaat.png`,
    alt: "Zakelijke juridische bespreking in een modern advocatenkantoor",
    keywords: ["advocaat", "advocatuur", "juridisch", "jurist", "recht", "intake"],
  }),
  createAsset({
    slug: "automotive",
    src: `${DEMO_IMAGE_BASE}/demo-hero-automotive.jpg`,
    alt: "Premium automotive showroom voor autobedrijf websites",
    keywords: ["automotive", "autobedrijf", "garage", "showroom", "occasions", "apk", "onderhoud"],
  }),
  createAsset({
    slug: "kapsalon",
    src: `${DEMO_IMAGE_BASE}/demo-hero-kapsalon.jpg`,
    alt: "Stijlvolle kapsalon met warme salonuitstraling",
    keywords: ["kapsalon", "kapper", "barber", "barbershop", "knippen", "kleuren", "styling"],
  }),
  createAsset({
    slug: "tandarts",
    src: `${DEMO_IMAGE_BASE}/demo-hero-zorg.jpg`,
    alt: "Rustige zorgomgeving voor tandarts en praktijk websites",
    keywords: ["tandarts", "mondzorg", "zorg", "controle", "preventie", "esthetiek", "spoed"],
  }),
  createAsset({
    slug: "elektricien",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-elektricien.png`,
    alt: "Elektricien bij een moderne meterkast in een nette woning",
    keywords: ["elektricien", "elektra", "groepenkast", "storing", "storingen", "laadpaal"],
  }),
  createAsset({
    slug: "loodgieter",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-loodgieter.png`,
    alt: "Loodgieter werkt aan schoon sanitair en leidingwerk",
    keywords: ["loodgieter", "lekkage", "cv", "sanitair", "leiding", "onderhoud"],
  }),
  createAsset({
    slug: "hovenier",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-hovenier.png`,
    alt: "Aangelegde tuin met groenontwerp en professioneel hovenierswerk",
    keywords: ["hovenier", "tuin", "tuinaanleg", "tuinontwerp", "groen", "onderhoud"],
  }),
  createAsset({
    slug: "schoonmaak",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-schoonmaak.png`,
    alt: "Professionele schoonmaak in een lichte zakelijke kantooromgeving",
    keywords: ["schoonmaak", "schoonmaakbedrijf", "kantoor", "vve", "oplevering", "contracten"],
  }),
  createAsset({
    slug: "verhuisbedrijf",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-verhuisbedrijf.png`,
    alt: "Verhuisteam bij een bestelwagen in een nette woonstraat",
    keywords: ["verhuisbedrijf", "verhuizen", "transport", "opslag", "planning", "logistiek"],
  }),
  createAsset({
    slug: "dierenarts",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-dierenarts.png`,
    alt: "Dierenarts onderzoekt een huisdier in een moderne praktijkruimte",
    keywords: ["dierenarts", "dierenzorg", "kliniek", "consult", "vaccinatie", "huisdieren"],
  }),
  createAsset({
    slug: "schoonheidssalon",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-schoonheidssalon.png`,
    alt: "Luxe schoonheidssalon met ontspannen wellness behandeling",
    keywords: ["schoonheidssalon", "beauty", "wellness", "facials", "massage", "huidverbetering"],
  }),
  createAsset({
    slug: "vastgoed",
    src: `${DEMO_IMAGE_BASE}/demo-hero-vastgoed.jpg`,
    alt: "Premium vastgoedpresentatie voor makelaar websites",
    keywords: ["vastgoed", "makelaar", "woning", "taxatie", "waardebepaling", "bezichtiging"],
  }),
  createAsset({
    slug: "hotel",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-hotel.png`,
    alt: "Boutique hotelkamer met warme hospitality uitstraling",
    keywords: ["hotel", "b&b", "bed and breakfast", "hospitality", "kamers", "boeken", "verblijf"],
  }),
  createAsset({
    slug: "financieel-adviseur",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-financieel-adviseur.png`,
    alt: "Financieel adviesgesprek in een professioneel kantoor",
    keywords: ["financieel", "financieel advies", "hypotheek", "accountant", "belasting", "advies"],
  }),
  createAsset({
    slug: "fysiotherapie",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-fysiotherapie.png`,
    alt: "Fysiotherapeut begeleidt een herstelgerichte oefening in de praktijk",
    keywords: ["fysiotherapie", "fysiotherapeut", "revalidatie", "herstel", "sportzorg", "pijnklachten"],
  }),
  createAsset({
    slug: "kinderopvang",
    src: `${DEMO_IMAGE_BASE}/industries/demo-hero-kinderopvang.png`,
    alt: "Warme kinderopvangruimte met begeleide activiteit",
    keywords: ["kinderopvang", "bso", "peuteropvang", "opvang", "rondleiding", "aanmelden"],
  }),
  createAsset({
    slug: "coaching",
    src: `${DEMO_IMAGE_BASE}/demo-hero-coaching.jpg`,
    alt: "Professionele coaching setting voor adviseur of consultant websites",
    keywords: ["coaching", "coach", "consultant", "advies", "training"],
  }),
  createAsset({
    slug: "ecommerce",
    src: `${DEMO_IMAGE_BASE}/demo-hero-ecommerce.jpg`,
    alt: "Moderne e-commerce productpresentatie voor webshops",
    keywords: ["ecommerce", "webshop", "winkel", "producten", "online verkoop"],
  }),
]);

function createAsset(asset) {
  return Object.freeze({
    type: "hero",
    ...asset,
    keywords: Object.freeze(asset.keywords || []),
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

export function listDemoImageAssets() {
  return [...demoImageAssets];
}

export function resolveDemoImageAsset(input = {}) {
  const text = textForMatch(input);
  const scored = demoImageAssets
    .map((asset) => ({
      asset,
      score: asset.keywords.reduce((total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score);
  return scored[0]?.score > 0 ? scored[0].asset : demoImageAssets[0];
}
