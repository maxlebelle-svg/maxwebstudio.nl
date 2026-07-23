export const BRAND_PERSONALITIES = Object.freeze([
  {
    id: "familiebedrijf",
    name: "Familiebedrijf",
    voice: ["betrokken", "betrouwbaar", "nuchter", "continuïteit"],
    story_angle: "Generaties vakkennis, korte lijnen en langdurige klantrelaties.",
    proof_priorities: ["ervaring", "vast team", "lokale reputatie", "nazorg"],
    cta_style: "persoonlijk en laagdrempelig",
    photography_modifier: "toon meerdere generaties of een hecht vast team, oprechte samenwerking en herkenbare bedrijfstrots",
    content_priorities: ["about", "team", "reviews", "projects"]
  },
  {
    id: "innovatief",
    name: "Innovatief",
    voice: ["vooruitstrevend", "slim", "helder", "nieuwsgierig"],
    story_angle: "Een moderne aanpak die technologie en expertise omzet in aantoonbare klantwaarde.",
    proof_priorities: ["methode", "technologie", "efficiëntie", "meetbaar resultaat"],
    cta_style: "actief en ontdekkend",
    photography_modifier: "toon moderne hulpmiddelen, slimme processen en echte samenwerking zonder generieke sciencefictionbeelden",
    content_priorities: ["hero", "services", "projects", "seo"]
  },
  {
    id: "jong",
    name: "Jong bedrijf",
    voice: ["energiek", "direct", "fris", "toegankelijk"],
    story_angle: "Nieuwe energie, snelle communicatie en een eigentijdse klantbeleving.",
    proof_priorities: ["snelheid", "bereikbaarheid", "frisse aanpak", "transparantie"],
    cta_style: "kort en actiegericht",
    photography_modifier: "toon een divers jong team in beweging, spontane interactie en frisse herkenbare werksituaties",
    content_priorities: ["hero", "social", "team", "cta"]
  },
  {
    id: "traditioneel",
    name: "Traditioneel vakbedrijf",
    voice: ["ervaren", "zorgvuldig", "degelijk", "formeel"],
    story_angle: "Bewezen werkwijzen, ambacht en kwaliteit die de tand des tijds doorstaan.",
    proof_priorities: ["vakmanschap", "materialen", "ervaring", "garantie zonder verzonnen claims"],
    cta_style: "respectvol en adviserend",
    photography_modifier: "toon ambachtelijke details, ervaren handen, duurzame materialen en een ordelijke authentieke werkomgeving",
    content_priorities: ["about", "services", "projects", "faq"]
  },
  {
    id: "lokaal",
    name: "Lokaal betrokken",
    voice: ["nabij", "praktisch", "vriendelijk", "herkenbaar"],
    story_angle: "Dichtbij, goed bereikbaar en zichtbaar verbonden met klanten en omgeving.",
    proof_priorities: ["regio", "bereikbaarheid", "lokale projecten", "persoonlijk contact"],
    cta_style: "nabij en concreet",
    photography_modifier: "toon herkenbare Nederlandse lokale context zonder leesbare adressen of toevallige merknamen",
    content_priorities: ["hero", "projects", "google_business_profile", "seo"]
  },
  {
    id: "persoonlijk",
    name: "Persoonlijk expertmerk",
    voice: ["menselijk", "aandachtig", "deskundig", "open"],
    story_angle: "Eén herkenbare expert, oprechte aandacht en begeleiding die bij de klant past.",
    proof_priorities: ["expertise", "werkwijze", "persoonlijke begeleiding", "vertrouwen"],
    cta_style: "uitnodigend en adviserend",
    photography_modifier: "toon de ondernemer als toegankelijke expert op ooghoogte, met echte interactie en ontspannen lichaamstaal",
    content_priorities: ["hero", "about", "team", "faq"]
  },
  {
    id: "corporate",
    name: "Corporate organisatie",
    voice: ["professioneel", "consistent", "zeker", "gestructureerd"],
    story_angle: "Schaalbare dienstverlening, duidelijke processen en voorspelbare kwaliteit.",
    proof_priorities: ["proces", "capaciteit", "compliance", "continuïteit"],
    cta_style: "formeel en resultaatgericht",
    photography_modifier: "toon professionele teams, gestructureerde samenwerking en hoogwaardige zakelijke omgevingen zonder steriele stockfoto-uitstraling",
    content_priorities: ["services", "projects", "faq", "contact"]
  }
]);

export const DEFAULT_PERSONALITY_ID = "persoonlijk";

export function resolveBrandPersonality(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return BRAND_PERSONALITIES.find((personality) => personality.id === normalized) || (normalized ? null : BRAND_PERSONALITIES.find((personality) => personality.id === DEFAULT_PERSONALITY_ID));
}

