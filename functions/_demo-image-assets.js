const DEMO_IMAGE_BASE = "/assets/demo-images";

const demoImageAssets = Object.freeze([
  asset("installatie", "Moderne duurzame installatie met zonnepanelen en energieoplossingen", ["installatie", "verduurzaming", "zonnepanelen", "warmtepomp", "airco", "laadpaal", "thuisbatterij"], "demo-hero-installatie.jpg"),
  asset("bouw", "Professioneel bouwproject met vakwerk en moderne materialen", ["bouw", "bouwbedrijf", "aannemer", "renovatie", "timmer", "nieuwbouw", "aanbouw"], "demo-hero-bouw.jpg"),
  asset("horeca", "Sfeervol restaurantinterieur voor horeca websites", ["horeca", "restaurant", "lunchroom", "eetcafe", "menu", "reserveren"], "demo-hero-horeca.jpg"),
  asset("fitness", "Moderne fitnessstudio met professionele trainingsruimte", ["fitness", "sportschool", "personal trainer", "proefles", "rooster", "membership"], "industries/demo-hero-fitness.png"),
  asset("advocaat", "Zakelijke juridische bespreking in een modern advocatenkantoor", ["advocaat", "advocatuur", "juridisch", "jurist", "recht", "intake"], "industries/demo-hero-advocaat.png"),
  asset("automotive", "Premium automotive showroom voor autobedrijf websites", ["automotive", "autobedrijf", "garage", "showroom", "occasions", "apk", "onderhoud"], "demo-hero-automotive.jpg"),
  asset("kapsalon", "Stijlvolle kapsalon met warme salonuitstraling", ["kapsalon", "kapper", "barber", "barbershop", "knippen", "kleuren", "styling"], "demo-hero-kapsalon.jpg"),
  asset("tandarts", "Rustige zorgomgeving voor tandarts en praktijk websites", ["tandarts", "mondzorg", "zorg", "controle", "preventie", "esthetiek", "spoed"], "demo-hero-zorg.jpg"),
  asset("elektricien", "Elektricien bij een moderne meterkast in een nette woning", ["elektricien", "elektra", "groepenkast", "storing", "storingen", "laadpaal"], "industries/demo-hero-elektricien.png"),
  asset("loodgieter", "Loodgieter werkt aan schoon sanitair en leidingwerk", ["loodgieter", "lekkage", "cv", "sanitair", "leiding", "onderhoud"], "industries/demo-hero-loodgieter.png"),
  asset("hovenier", "Aangelegde tuin met groenontwerp en professioneel hovenierswerk", ["hovenier", "tuin", "tuinaanleg", "tuinontwerp", "groen", "onderhoud"], "industries/demo-hero-hovenier.png"),
  asset("schoonmaak", "Professionele schoonmaak in een lichte zakelijke kantooromgeving", ["schoonmaak", "schoonmaakbedrijf", "kantoor", "vve", "oplevering", "contracten"], "industries/demo-hero-schoonmaak.png"),
  asset("verhuisbedrijf", "Verhuisteam bij een bestelwagen in een nette woonstraat", ["verhuisbedrijf", "verhuizen", "transport", "opslag", "planning", "logistiek"], "industries/demo-hero-verhuisbedrijf.png"),
  asset("dierenarts", "Dierenarts onderzoekt een huisdier in een moderne praktijkruimte", ["dierenarts", "dierenzorg", "kliniek", "consult", "vaccinatie", "huisdieren"], "industries/demo-hero-dierenarts.png"),
  asset("schoonheidssalon", "Luxe schoonheidssalon met ontspannen wellness behandeling", ["schoonheidssalon", "beauty", "wellness", "facials", "massage", "huidverbetering"], "industries/demo-hero-schoonheidssalon.png"),
  asset("vastgoed", "Premium vastgoedpresentatie voor makelaar websites", ["vastgoed", "makelaar", "woning", "taxatie", "waardebepaling", "bezichtiging"], "demo-hero-vastgoed.jpg"),
  asset("hotel", "Boutique hotelkamer met warme hospitality uitstraling", ["hotel", "b&b", "bed and breakfast", "hospitality", "kamers", "boeken", "verblijf"], "industries/demo-hero-hotel.png"),
  asset("financieel-adviseur", "Financieel adviesgesprek in een professioneel kantoor", ["financieel", "financieel advies", "hypotheek", "accountant", "belasting", "advies"], "industries/demo-hero-financieel-adviseur.png"),
  asset("fysiotherapie", "Fysiotherapeut begeleidt een herstelgerichte oefening in de praktijk", ["fysiotherapie", "fysiotherapeut", "revalidatie", "herstel", "sportzorg", "pijnklachten"], "industries/demo-hero-fysiotherapie.png"),
  asset("kinderopvang", "Warme kinderopvangruimte met begeleide activiteit", ["kinderopvang", "bso", "peuteropvang", "opvang", "rondleiding", "aanmelden"], "industries/demo-hero-kinderopvang.png"),
  asset("coaching", "Professionele coaching setting voor adviseur of consultant websites", ["coaching", "coach", "consultant", "advies", "training"], "demo-hero-coaching.jpg"),
  asset("ecommerce", "Moderne e-commerce productpresentatie voor webshops", ["ecommerce", "webshop", "winkel", "producten", "online verkoop"], "demo-hero-ecommerce.jpg"),
]);

function asset(slug, alt, keywords, filename) {
  return Object.freeze({
    slug,
    type: "hero",
    src: `${DEMO_IMAGE_BASE}/${filename}`,
    alt,
    keywords: Object.freeze(keywords),
  });
}

function resolveDemoImageAsset(input = {}) {
  const text = [
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
  const scored = demoImageAssets
    .map((item) => ({
      asset: item,
      score: item.keywords.reduce((total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score);
  return scored[0]?.score > 0 ? scored[0].asset : demoImageAssets[0];
}

module.exports = {
  demoImageAssets,
  resolveDemoImageAsset,
};
