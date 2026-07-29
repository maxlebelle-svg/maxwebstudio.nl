const FACTORY_BLUEPRINTS = Object.freeze([
  Object.freeze({
    key: "website-service-v1",
    factoryType: "website",
    version: 1,
    name: "Website voor dienstverleners",
    shortName: "Website Factory",
    description: "Van klantbriefing naar merk, content, preview, feedback en livegang.",
    reference: "De bestaande Max Webstudio Website Factory",
    modules: Object.freeze(["Merk & huisstijl", "Pagina-opbouw", "Content & SEO", "Preview & feedback", "Domein & livegang"]),
    stages: Object.freeze(["intake", "branding", "build", "review", "launch"]),
    launchPath: "admin-website-factory.html",
    accent: "#3b82f6",
  }),
  Object.freeze({
    key: "webshop-commerce-v1",
    factoryType: "webshop",
    version: 1,
    name: "Webshop basisformule",
    shortName: "Webshop Factory",
    description: "Een herhaalbare commerce-opzet voor assortiment, checkout en beheer.",
    reference: "Website Factory met commerce-briefing",
    modules: Object.freeze(["Merk & storefront", "Productcatalogus", "Winkelmand & checkout", "Betaling & verzending", "Orders & beheer"]),
    stages: Object.freeze(["intake", "catalog", "build", "checkout", "launch"]),
    launchPath: "admin-website-factory.html",
    accent: "#a855f7",
  }),
  Object.freeze({
    key: "food-pickup-v1",
    factoryType: "food",
    version: 1,
    name: "Food bestellen & afhalen",
    shortName: "Food Factory",
    description: "Het bewezen Silverado-concept als herhaalbare restaurantformule.",
    reference: "Silverado Roti Shop, Emmeloord",
    modules: Object.freeze(["Restaurantbranding", "Menukaart", "Afhalen & openingstijden", "Bestellingen & keuken", "Betaling & integraties"]),
    stages: Object.freeze(["intake", "menu", "storefront", "operations", "launch"]),
    launchPath: "admin-demo-sites.html",
    accent: "#22c55e",
  }),
]);

function getFactoryBlueprint(key = "") {
  return FACTORY_BLUEPRINTS.find((blueprint) => blueprint.key === String(key || "").trim()) || null;
}

function publicFactoryBlueprints() {
  return FACTORY_BLUEPRINTS.map((blueprint) => ({ ...blueprint, modules: [...blueprint.modules], stages: [...blueprint.stages] }));
}

module.exports = { FACTORY_BLUEPRINTS, getFactoryBlueprint, publicFactoryBlueprints };
