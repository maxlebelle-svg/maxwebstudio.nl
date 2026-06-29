export const DEMO_SITE_STATUS = Object.freeze({
  PREPARED: "prepared",
  PLANNED: "planned",
  LIVE: "live",
});

export const demoSites = Object.freeze([
  {
    id: "bouwbedrijf-demo",
    name: "Bouwbedrijf Demo",
    industry: "Bouwbedrijf",
    description: "Voor vakbedrijven die vertrouwen, projecten en offerteaanvragen professioneel willen presenteren.",
    status: DEMO_SITE_STATUS.PREPARED,
    accentColor: "#155eef",
    desktopThumbnail: "",
    mobileThumbnail: "",
    demoUrl: "",
    detailsUrl: "",
    tags: ["Offerte aanvragen", "Projecten", "Mobiel"],
    ctaLabel: "Bekijk live demo",
  },
  {
    id: "restaurant-demo",
    name: "Restaurant Demo",
    industry: "Horeca",
    description: "Voor restaurants en eetcafes waar sfeer, menu en reserveren centraal staan.",
    status: DEMO_SITE_STATUS.PLANNED,
    accentColor: "#b45309",
    desktopThumbnail: "",
    mobileThumbnail: "",
    demoUrl: "",
    detailsUrl: "",
    tags: ["Reserveren", "Menu", "Lokaal"],
    ctaLabel: "Bekijk live demo",
  },
  {
    id: "sportschool-demo",
    name: "Sportschool Demo",
    industry: "Fitness",
    description: "Voor sportscholen en personal trainers die proeflessen en abonnementen helder willen verkopen.",
    status: DEMO_SITE_STATUS.PLANNED,
    accentColor: "#0f172a",
    desktopThumbnail: "",
    mobileThumbnail: "",
    demoUrl: "",
    detailsUrl: "",
    tags: ["Proefles", "Rooster", "Membership"],
    ctaLabel: "Bekijk live demo",
  },
]);

export function listDemoSites() {
  return [...demoSites];
}

export function getDemoSiteById(id) {
  return demoSites.find((demoSite) => demoSite.id === id) || null;
}
