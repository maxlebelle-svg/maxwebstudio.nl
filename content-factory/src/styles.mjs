export const STYLE_PROFILES = Object.freeze([
  {
    id: "betrouwbaar-vakmanschap",
    aliases: ["zakelijk", "business", "betrouwbaar"],
    name: "Betrouwbaar vakmanschap",
    description: "Rustig, degelijk en herkenbaar; gericht op vertrouwen, duidelijkheid en lokale dienstverlening.",
    mood: ["betrouwbaar", "helder", "vakkundig", "toegankelijk"],
    layout: { density: "comfortable", hero: "split", corners: "medium", shadows: "subtle", navigation: "classic" },
    typography: { heading: null, body: null, scale: "balanced" },
    colors: { ink: null, primary: null, secondary: null, surface: null },
    icon_style: "rounded-outline",
    photography: {
      style: "authentieke Nederlandse bedrijfsfotografie met echte medewerkers en geloofwaardige werksituaties",
      lighting: "zacht natuurlijk daglicht met gecontroleerd contrast",
      composition: "heldere editorial compositie, zichtbaar vakwerk en voldoende rustige ruimte voor webtekst",
      camera: "full-frame camera, 35mm lens, realistisch perspectief en natuurlijke scherptediepte",
      treatment: "natuurlijke kleuren, realistische huid- en materiaaltinten, subtiele contrastcurve"
    }
  },
  {
    id: "modern-scherp",
    aliases: ["modern", "digitaal", "tech"],
    name: "Modern & scherp",
    description: "Strak digitaal ontwerp met krachtige hiërarchie, veel contrast en een vooruitstrevende uitstraling.",
    mood: ["modern", "slim", "scherp", "efficiënt"],
    layout: { density: "compact", hero: "asymmetric", corners: "small", shadows: "crisp", navigation: "minimal" },
    typography: { heading: "Space Grotesk", body: "Inter", scale: "high-contrast" },
    colors: { ink: "#0B1220", primary: null, secondary: null, surface: "#F8FAFC" },
    icon_style: "geometric-outline",
    photography: {
      style: "moderne commerciële reportagefotografie met strakke lijnen, tastbare details en subtiele technologische accenten",
      lighting: "helder directioneel daglicht met koele highlights en diep maar realistisch contrast",
      composition: "grafische uitsnede, asymmetrische derdeverdeling en duidelijke negatieve ruimte",
      camera: "full-frame camera, 28mm of 50mm lens, hoge microcontrastweergave",
      treatment: "neutrale witbalans, koele schaduwen, heldere details, geen overdreven HDR"
    }
  },
  {
    id: "premium-editorial",
    aliases: ["premium", "luxe", "editorial"],
    name: "Premium editorial",
    description: "Verfijnde merkuitstraling met redactionele typografie, royale witruimte en hoogwaardige fotografie.",
    mood: ["premium", "verfijnd", "rustig", "exclusief"],
    layout: { density: "spacious", hero: "full-bleed", corners: "small", shadows: "soft", navigation: "editorial" },
    typography: { heading: "Playfair Display", body: "DM Sans", scale: "editorial" },
    colors: { ink: "#181716", primary: null, secondary: null, surface: "#FAF7F2" },
    icon_style: "fine-line",
    photography: {
      style: "high-end editorial merkfotografie, verfijnde styling, authentieke mensen en tactiele details",
      lighting: "zacht raamlicht met subtiele highlights en diepe gecontroleerde schaduwen",
      composition: "cinematisch kader, royale negatieve ruimte, gelaagd voor- en achtergrondbeeld",
      camera: "medium-format look, 50mm of 85mm lens, elegante geringe scherptediepte",
      treatment: "warme filmische kleurgradatie, ingetogen verzadiging, rijke huid- en materiaaltinten"
    }
  },
  {
    id: "warm-persoonlijk",
    aliases: ["warm", "persoonlijk", "menselijk"],
    name: "Warm & persoonlijk",
    description: "Menselijke, uitnodigende stijl die nabijheid, aandacht en persoonlijke service centraal zet.",
    mood: ["warm", "menselijk", "persoonlijk", "uitnodigend"],
    layout: { density: "comfortable", hero: "portrait-led", corners: "large", shadows: "soft", navigation: "friendly" },
    typography: { heading: "Lora", body: "Manrope", scale: "gentle" },
    colors: { ink: "#2D2522", primary: null, secondary: null, surface: "#FFF9F4" },
    icon_style: "soft-rounded",
    photography: {
      style: "warme documentaire lifestylefotografie met echte interactie, aandacht en spontane momenten",
      lighting: "warm natuurlijk ochtend- of namiddaglicht met zachte schaduwen",
      composition: "nabij menselijk perspectief, ontspannen kadrering en zichtbare interactie",
      camera: "full-frame camera, 50mm lens, f/2.8, ooghoogte en natuurlijke achtergrondonscherpte",
      treatment: "warme huidtinten, zachte contrasten, subtiele textuur en rustige achtergronden"
    }
  },
  {
    id: "minimalistisch-licht",
    aliases: ["minimalistisch", "minimal", "licht"],
    name: "Minimalistisch licht",
    description: "Licht, precies en overzichtelijk ontwerp waarin inhoud en conversie zonder visuele ruis centraal staan.",
    mood: ["minimalistisch", "licht", "precies", "overzichtelijk"],
    layout: { density: "spacious", hero: "centered", corners: "none", shadows: "none", navigation: "minimal" },
    typography: { heading: "Inter", body: "Inter", scale: "restrained" },
    colors: { ink: "#111827", primary: null, secondary: null, surface: "#FFFFFF" },
    icon_style: "monoline",
    photography: {
      style: "minimalistische editorial fotografie met één helder onderwerp, precieze vormen en bijna geen visuele ruis",
      lighting: "diffuus daglicht, zachte schaduwen en helder wit zonder uitgebeten hooglichten",
      composition: "één dominant onderwerp, veel negatieve ruimte en geometrisch uitgebalanceerde plaatsing",
      camera: "full-frame camera, 50mm lens, f/5.6, recht perspectief en scherpe details",
      treatment: "neutrale kleuren, lage verzadiging, schoon witpunt en subtiele materiaaltextuur"
    }
  },
  {
    id: "krachtig-conversie",
    aliases: ["industrieel", "krachtig", "conversie"],
    name: "Krachtig conversiegericht",
    description: "Energieke commerciële stijl met duidelijke CTA’s, sterke contrasten en bewijsgerichte secties.",
    mood: ["krachtig", "direct", "energiek", "resultaatgericht"],
    layout: { density: "compact", hero: "action-led", corners: "medium", shadows: "strong", navigation: "conversion" },
    typography: { heading: "Barlow Condensed", body: "Inter", scale: "bold" },
    colors: { ink: "#101820", primary: null, secondary: null, surface: "#F4F7F9" },
    icon_style: "bold-outline",
    photography: {
      style: "dynamische commerciële actiefotografie met zichtbaar resultaat, daadkracht en directe klantwaarde",
      lighting: "krachtig directioneel licht met duidelijke contouren en realistische highlights",
      composition: "laag of dichtbij camerastandpunt, sterke diagonalen en actie op het beslissende moment",
      camera: "full-frame camera, 24-70mm lens, snelle sluitertijd en scherpe onderwerpweergave",
      treatment: "krachtig contrast, diepe neutrale tonen en doelgerichte merkaccenten zonder oververzadiging"
    }
  },
  {
    id: "natuurlijk-duurzaam",
    aliases: ["scandinavisch", "natuurlijk", "duurzaam"],
    name: "Natuurlijk & duurzaam",
    description: "Aards, transparant en rustig, met aandacht voor materialen, omgeving en duurzame keuzes.",
    mood: ["natuurlijk", "duurzaam", "eerlijk", "rustig"],
    layout: { density: "comfortable", hero: "organic", corners: "large", shadows: "ambient", navigation: "calm" },
    typography: { heading: "Source Serif 4", body: "Manrope", scale: "organic" },
    colors: { ink: "#1F2A24", primary: "#315B45", secondary: "#B8864B", surface: "#F5F3EA" },
    icon_style: "organic-line",
    photography: {
      style: "authentieke documentaire fotografie met natuurlijke materialen, lokale omgeving en aantoonbaar duurzame handelingen",
      lighting: "zacht bewolkt daglicht of warm laag zonlicht met natuurlijke schaduwen",
      composition: "organische lagen, tastbare details, mens en omgeving in evenwicht",
      camera: "full-frame camera, 35mm lens, natuurlijk perspectief en subtiele scherptediepte",
      treatment: "aardse groenen en warme neutrals, filmische korrel, behoud van echte materiaalstructuur"
    }
  },
  {
    id: "speels-toegankelijk",
    aliases: ["speels", "jong", "toegankelijk"],
    name: "Speels & toegankelijk",
    description: "Vriendelijke, frisse stijl met zachte vormen en herkenbare beelden voor een brede doelgroep.",
    mood: ["vriendelijk", "fris", "speels", "toegankelijk"],
    layout: { density: "comfortable", hero: "modular", corners: "pill", shadows: "color-soft", navigation: "friendly" },
    typography: { heading: "Nunito Sans", body: "Inter", scale: "friendly" },
    colors: { ink: "#172033", primary: null, secondary: null, surface: "#F7FAFF" },
    icon_style: "duotone-rounded",
    photography: {
      style: "frisse toegankelijke lifestylefotografie met echte mensen, optimistische energie en herkenbare situaties",
      lighting: "helder zacht daglicht met levendige maar natuurlijke kleuren",
      composition: "open kadrering, vriendelijke ooghoogte, subtiele beweging en ruimte voor grafische vormen",
      camera: "full-frame camera, 35mm of 50mm lens, ontspannen perspectief en scherpe gezichten",
      treatment: "frisse kleurtoon, lichte schaduwen, natuurlijke huidtinten en subtiele merkaccenten"
    }
  }
]);

export const DEFAULT_STYLE_ID = STYLE_PROFILES[0].id;

export function resolveStyleProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return STYLE_PROFILES[0];
  return STYLE_PROFILES.find((style) => style.id === normalized || style.aliases.includes(normalized)) || null;
}
