import {
  CONTENT_STATUSES,
  createWorkspaceEnvelope,
  normalizeContentItem,
  normalizeStatus as normalizeContentStatus,
} from "./social-studio/core.mjs";
import { LocalSocialStudioRepository } from "./social-studio/local-repository.mjs";
import {
  BRAND_VOICE_FIELDS,
  BrandVoiceRepository,
  mergeBrandVoiceSources,
} from "./social-studio/brand-voice.mjs";
import {
  buildRelationshipContext,
  contextChips,
  loadRelationshipWorkspace,
  readCentralBranding,
  relationshipScope,
} from "./social-studio/relationship-context.mjs";

(function () {
  "use strict";

  const storageKeys = {
    draft: "mws_social_media_studio_draft_v2",
    variants: "mws_social_media_studio_variants_v2",
    context: "mws_social_media_studio_context_v2",
    legacyDraft: "mws_social_media_studio_draft",
    legacyVariants: "mws_social_media_studio_variants",
  };

  const repository = new LocalSocialStudioRepository(window.localStorage, storageKeys);
  const brandVoiceRepository = new BrandVoiceRepository(window.localStorage);

  const platformLabels = {
    facebook: "Facebook",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    google: "Google Bedrijfspost",
    ad: "Advertentie",
    blog: "Blog",
    email: "E-mailcampagne",
  };

  const statusLabels = Object.fromEntries(CONTENT_STATUSES.map(({ id, label }) => [id, label]));

  const statusOrder = Object.keys(statusLabels);

  const platformRules = {
    facebook: { max: 63206, ideal: 280, hashtagMin: 0, hashtagMax: 5, visual: "Liggend of vierkant" },
    instagram: { max: 2200, ideal: 180, hashtagMin: 3, hashtagMax: 12, visual: "Vierkant of staand" },
    linkedin: { max: 3000, ideal: 420, hashtagMin: 1, hashtagMax: 5, visual: "Liggend of vierkant" },
    google: { max: 1500, ideal: 300, hashtagMin: 0, hashtagMax: 3, visual: "Liggend of vierkant" },
    ad: { max: 500, ideal: 140, hashtagMin: 0, hashtagMax: 2, visual: "Campagnevisual" },
    blog: { max: 12000, ideal: 900, hashtagMin: 0, hashtagMax: 3, visual: "Uitgelichte afbeelding" },
    email: { max: 10000, ideal: 500, hashtagMin: 0, hashtagMax: 0, visual: "Header of productbeeld" },
  };

  const platformFallbacks = {
    facebook: {
      title: "Nieuwe update voor onze klanten",
      caption: "We hebben iets nieuws klaarstaan voor ondernemers die online sterker zichtbaar willen zijn.",
      cta: "Bekijk de update",
      hashtags: "#facebook #lokaal #maxwebstudio",
    },
    instagram: {
      title: "Visual campagne",
      caption: "Een sterke uitstraling begint bij een website en merkverhaal dat direct klopt.",
      cta: "Ontdek meer",
      hashtags: "#instagram #content #branding",
    },
    linkedin: {
      title: "Zakelijke update",
      caption: "Een goede website is geen online visitekaartje meer, maar een commerciële basis voor groei.",
      cta: "Plan een gesprek",
      hashtags: "#linkedin #expertise #groei",
    },
    google: {
      title: "Lokale bedrijfspost",
      caption: "Op zoek naar een professionele website die lokaal vertrouwen wekt en meer aanvragen oplevert?",
      cta: "Bel vandaag",
      hashtags: "#googlebedrijf #lokaal",
    },
    ad: {
      title: "Advertentiecampagne",
      caption: "Meer aanvragen uit je website? Laat Max Webstudio een snelle, professionele site bouwen.",
      cta: "Vraag offerte aan",
      hashtags: "#advertentie #campagne",
    },
    blog: {
      title: "Eén helder inzicht voor ondernemers",
      caption: "Werk het onderwerp uit met een sterke opening, praktische voorbeelden en een concrete conclusie.",
      cta: "Lees verder",
      hashtags: "",
    },
    email: {
      title: "Een onderwerpregel die nieuwsgierig maakt",
      caption: "Open persoonlijk, maak de waarde snel duidelijk en eindig met één heldere vervolgstap.",
      cta: "Bekijk de update",
      hashtags: "",
    },
  };

  const contentTypes = [
    ["instagram-post", "Instagram Post", "Een sterk beeld met een scherpe caption", "image", "instagram", "square"],
    ["instagram-reel", "Instagram Reel", "Hook, scènes en caption voor korte video", "video", "instagram", "portrait"],
    ["instagram-story", "Instagram Story", "Kort, direct en ontworpen voor actie", "story", "instagram", "story"],
    ["linkedin-post", "LinkedIn Post", "Expertise met een menselijke invalshoek", "briefcase", "linkedin", "landscape"],
    ["facebook-post", "Facebook Post", "Lokale update, verhaal of aanbieding", "message", "facebook", "landscape"],
    ["carousel", "Carousel", "Eén idee verdeeld over heldere slides", "layers", "instagram", "square"],
    ["behind-scenes", "Behind the Scenes", "Laat proces, mensen en vakmanschap zien", "eye", "instagram", "portrait"],
    ["client-case", "Klantcase", "Van uitdaging naar zichtbaar resultaat", "case", "linkedin", "landscape"],
    ["before-after", "Website Before / After", "Maak de transformatie direct voelbaar", "compare", "instagram", "square"],
    ["website-tip", "Website Tip", "Praktisch inzicht dat meteen waarde geeft", "bulb", "linkedin", "square"],
    ["ai-news", "AI Nieuws", "Duiding zonder hype of vakjargon", "sparkles", "linkedin", "landscape"],
    ["blog", "Blog", "Verdieping met structuur en zoekintentie", "document", "blog", "landscape"],
    ["advertisement", "Advertentie", "Eén boodschap, één doelgroep, één actie", "target", "ad", "landscape"],
    ["email-campaign", "E-mailcampagne", "Persoonlijk, relevant en conversiegericht", "mail", "email", "landscape"],
  ].map(([id, label, description, icon, platform, visualFormat]) => ({ id, label, description, icon, platform, visualFormat }));

  const contentTypeSeeds = {
    "instagram-post": ["Stop met posten om zichtbaar te zijn", "De beste content begint niet bij het algoritme, maar bij één herkenbaar probleem van je klant.", "Bewaar deze post", "#content #ondernemen #zichtbaarheid"],
    "instagram-reel": ["Dit kost je website elke week aanvragen", "Open met het probleem, laat in drie korte scènes de oplossing zien en eindig met het resultaat.", "Bekijk de volledige aanpak", "#reels #webdesign #groei"],
    "instagram-story": ["Snelle vraag voor ondernemers", "Maak de keuze eenvoudig en stuur in maximaal drie frames naar één actie.", "Stuur ons een bericht", "#story #ondernemen"],
    "linkedin-post": ["Een professionele website is geen eindproduct", "De echte waarde ontstaat wanneer strategie, inhoud en opvolging als één systeem samenwerken.", "Hoe kijk jij hiernaar?", "#webstrategie #ondernemen #groei"],
    "facebook-post": ["Een mooie nieuwe stap voor onze klant", "Vertel wat er is veranderd, waarom dat belangrijk is en wat klanten er nu van merken.", "Bekijk het resultaat", "#lokaal #ondernemen #website"],
    carousel: ["7 signalen dat je website toe is aan vernieuwing", "Bouw elke slide rond één helder inzicht en eindig met een concrete samenvatting.", "Sla de carousel op", "#carousel #websitetips #marketing"],
    "behind-scenes": ["Wat je niet ziet achter een sterke website", "Neem de lezer mee in een echt moment uit het proces en leg uit waarom dit detail verschil maakt.", "Kijk mee achter de schermen", "#behindthescenes #vakmanschap #webdesign"],
    "client-case": ["Van losse uitstraling naar één sterk merkverhaal", "Schets de startsituatie, de gekozen aanpak en het concrete resultaat voor de klant.", "Bekijk de klantcase", "#klantcase #resultaat #webdesign"],
    "before-after": ["Dezelfde onderneming. Een compleet andere eerste indruk.", "Vergelijk structuur, uitstraling en conversie vóór en na de nieuwe website.", "Bekijk de transformatie", "#beforeafter #website #branding"],
    "website-tip": ["Je belangrijkste knop is waarschijnlijk te vaag", "Leg één praktisch verbeterpunt uit dat een ondernemer vandaag nog kan toepassen.", "Controleer je eigen website", "#websitetip #conversie #ondernemen"],
    "ai-news": ["AI verandert niet wat goed ondernemerschap is", "Duid één actuele ontwikkeling, maak de impact concreet en scheid kans van hype.", "Volg voor nuchtere AI-updates", "#ai #innovatie #ondernemen"],
    blog: ["Waarom een snelle website alleen niet genoeg is", "Bouw het artikel op rond zoekintentie, een herkenbare uitdaging en praktische vervolgstappen.", "Plan een kennismaking", ""],
    advertisement: ["Meer aanvragen uit je website", "Benoem het gewenste resultaat, verlaag de drempel en stuur naar één duidelijke actie.", "Vraag een vrijblijvende scan aan", ""],
    "email-campaign": ["Een kleine verbetering met groot effect", "Open persoonlijk, deel één waardevol inzicht en maak de vervolgstap moeiteloos.", "Bekijk wat er mogelijk is", ""],
  };

  const templateContent = {
    promotion: {
      title: "Tijdelijke actie voor nieuwe klanten",
      caption: "Wil je deze maand meer aanvragen uit je website halen? We helpen lokale ondernemers met een professionele website die snel laadt, vertrouwen wekt en bezoekers richting contact stuurt.",
      cta: "Plan een gratis kennismaking",
      hashtags: "#website #actie #ondernemen",
    },
    case: {
      title: "Nieuwe klantcase live",
      caption: "Voor een lokale ondernemer hebben we een frisse website voorbereid met een duidelijke structuur, sterke call-to-actions en een uitstraling die past bij het bedrijf.",
      cta: "Bekijk de case",
      hashtags: "#webdesign #klantcase #groei",
    },
    review: {
      title: "Klant aan het woord",
      caption: "Mooi om te zien hoe een heldere website direct rust geeft in de presentatie van een bedrijf. Dit soort feedback laat zien waarom strategie en design samen horen.",
      cta: "Lees meer ervaringen",
      hashtags: "#review #vertrouwen #maxwebstudio",
    },
    local: {
      title: "Lokale ondernemers update",
      caption: "Ook lokaal begint vertrouwen vaak online. Met een professionele website maak je meteen duidelijk wie je bent, wat je doet en waarom klanten voor jou kiezen.",
      cta: "Ontdek de mogelijkheden",
      hashtags: "#lokaal #ondernemer #website",
    },
    vacancy: {
      title: "Nieuwe collega gezocht",
      caption: "Groei vraagt om goede mensen. Zet je vacature krachtig neer met een duidelijke landingspagina, sterke boodschap en campagne die past bij je doelgroep.",
      cta: "Bekijk de vacature",
      hashtags: "#vacature #team #werkenbij",
    },
  };

  const moreWorkOffers = [
    {
      id: "care-basic",
      title: "Care Basic",
      price: "€19,95 / maand",
      platform: "google",
      goal: "Reviews en vertrouwen",
      cta: "Kies Care Basic",
      hashtags: "#onderhoud #hosting #website",
      copy: "Houd je website veilig, snel en online met Care Basic. Voor €19,95 per maand regelen wij hosting, SSL, back-ups, technische monitoring en de controle of alles blijft werken.",
      note: "Onderhoud, hosting en technische rust voor klanten na livegang.",
    },
    {
      id: "logo",
      title: "Logo ontwerpen",
      price: "vanaf €350 eenmalig",
      platform: "instagram",
      goal: "Naamsbekendheid",
      cta: "Vraag een logo aan",
      hashtags: "#logo #branding #huisstijl",
      copy: "Een professionele website werkt sterker met een herkenbare uitstraling. We ontwerpen een helder basislogo met bestanden voor je website, socials en drukwerk.",
      note: "Handig voor klanten zonder sterk logo of herkenbare huisstijl.",
    },
    {
      id: "google-business",
      title: "Google Bedrijf instellen",
      price: "€195 eenmalig",
      platform: "google",
      goal: "Websitebezoek",
      cta: "Laat Google Bedrijf instellen",
      hashtags: "#googlebedrijf #lokaal #vindbaarheid",
      copy: "Beter lokaal zichtbaar worden? We richten je Google Bedrijfsprofiel professioneel in met diensten, foto's, openingstijden en de eerste optimalisatie.",
      note: "Voor lokale bedrijven die beter gevonden willen worden.",
    },
    {
      id: "meta-ads",
      title: "Meta advertenties",
      price: "€350 setup + €249 / maand",
      platform: "ad",
      goal: "Meer aanvragen",
      cta: "Start Meta advertenties",
      hashtags: "#facebookads #instagramads #campagne",
      copy: "Bereik nieuwe klanten via Facebook en Instagram. We zetten de campagne klaar, schrijven de advertentieteksten en optimaliseren maandelijks op aanvragen.",
      note: "Voor Facebook- en Instagram-campagnes rond acties of aanvragen.",
    },
    {
      id: "google-ads",
      title: "Google Ads",
      price: "€450 setup + €299 / maand",
      platform: "ad",
      goal: "Meer aanvragen",
      cta: "Start Google Ads",
      hashtags: "#googleads #leads #groei",
      copy: "Wil je gevonden worden op het moment dat klanten zoeken? We zetten Google Ads campagnes op voor offerte-aanvragen, telefoontjes en websitebezoek.",
      note: "Voor zoekcampagnes met commerciële intentie.",
    },
    {
      id: "automation",
      title: "Automatisering",
      price: "vanaf €395 eenmalig",
      platform: "linkedin",
      goal: "Meer aanvragen",
      cta: "Automatiseer mijn opvolging",
      hashtags: "#automatisering #crm #opvolging",
      copy: "Bespaar tijd met slimme automatisering voor formulieren, opvolgmails en CRM-koppelingen. Zo raakt een aanvraag minder snel kwijt.",
      note: "Voor formulieren, opvolgmails en CRM-processen.",
    },
    {
      id: "social-media",
      title: "Social media",
      price: "vanaf €299 / maand",
      platform: "instagram",
      goal: "Naamsbekendheid",
      cta: "Plan social media content",
      hashtags: "#socialmedia #content #zichtbaarheid",
      copy: "Blijf zichtbaar na livegang met social media content. We helpen met posts, planning en een eenvoudige contentkalender die past bij je bedrijf.",
      note: "Voor klanten die na de website actief zichtbaar willen blijven.",
    },
  ];

  const visualFormatLabels = {
    square: "Vierkant 1:1",
    portrait: "Staand 4:5",
    landscape: "Liggend 1.91:1",
    story: "Story 9:16",
  };

  const contentIcons = {
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/>',
    video: '<rect x="3" y="5" width="14" height="14" rx="3"/><path d="m17 10 4-2v8l-4-2z"/><path d="m9 9 4 3-4 3z"/>',
    story: '<rect x="6" y="2" width="12" height="20" rx="4"/><path d="M9 6h6M10 18h4"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
    case: '<path d="M4 19h16V7l-4-4H4z"/><path d="M16 3v5h4M8 12h8M8 16h5"/>',
    compare: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16M8 9l-3 3 3 3M16 9l3 3-3 3"/>',
    bulb: '<path d="M9 18h6M10 22h4M8.5 15.5A7 7 0 1 1 15.5 15.5L15 18H9z"/>',
    sparkles: '<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7zM5 13l.7 2.3L8 16l-2.3.7L5 19l-.7-2.3L2 16l2.3-.7z"/>',
    document: '<path d="M5 2h10l4 4v16H5z"/><path d="M15 2v5h4M8 12h8M8 16h8"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  };

  const state = {
    platform: "facebook",
    contentType: "social-post",
    scopeId: "internal:max-webstudio",
    brandVoice: null,
    relationshipContext: null,
    variants: [],
    variantQuery: "",
    variantFilter: "all",
    statusFilter: "all",
  };

  let autosaveTimer = null;

  const elements = {
    platformButtons: Array.from(document.querySelectorAll(".social-studio-platform[data-platform]")),
    templateButtons: Array.from(document.querySelectorAll("[data-template]")),
    client: document.getElementById("social-client"),
    start: document.getElementById("social-studio-start"),
    stage: document.getElementById("social-studio-stage"),
    skeleton: document.getElementById("social-studio-skeleton"),
    workbench: document.getElementById("social-studio-workbench"),
    contentTypeGrid: document.getElementById("social-content-type-grid"),
    backButton: document.getElementById("social-studio-back"),
    selectedType: document.getElementById("social-selected-type"),
    autosave: document.getElementById("social-autosave"),
    editorFormat: document.getElementById("social-editor-format"),
    brandSource: document.getElementById("social-brand-source"),
    contextChips: document.getElementById("social-context-chips"),
    brandSummary: document.getElementById("social-brand-summary"),
    contextMessage: document.getElementById("social-context-message"),
    editBrandVoice: document.getElementById("edit-brand-voice"),
    brandVoiceDialog: document.getElementById("brand-voice-dialog"),
    brandVoiceForm: document.getElementById("brand-voice-form"),
    brandVoiceFields: document.getElementById("brand-voice-fields"),
    closeBrandVoice: document.getElementById("close-brand-voice"),
    cancelBrandVoice: document.getElementById("cancel-brand-voice"),
    campaign: document.getElementById("social-campaign"),
    goal: document.getElementById("social-goal"),
    date: document.getElementById("social-date"),
    time: document.getElementById("social-time"),
    status: document.getElementById("social-status"),
    visualFormat: document.getElementById("social-visual-format"),
    variantSearch: document.getElementById("variant-search"),
    variantFilter: document.getElementById("variant-platform-filter"),
    statusFilter: document.getElementById("variant-status-filter"),
    jsonFile: document.getElementById("social-json-file"),
    title: document.getElementById("social-title"),
    caption: document.getElementById("social-caption"),
    imagePrompt: document.getElementById("social-image-prompt"),
    cta: document.getElementById("social-cta"),
    link: document.getElementById("social-link"),
    hashtags: document.getElementById("social-hashtags"),
    tone: document.getElementById("social-tone"),
    message: document.getElementById("social-studio-message"),
    heroCount: document.getElementById("social-hero-count"),
    heroDetail: document.getElementById("social-hero-detail"),
    captionCounter: document.getElementById("caption-counter"),
    captionGuidance: document.getElementById("caption-guidance"),
    hashtagCounter: document.getElementById("hashtag-counter"),
    platformRule: document.getElementById("platform-rule"),
    previewCard: document.getElementById("social-preview-card"),
    previewHeading: document.getElementById("preview-heading"),
    previewAvatar: document.getElementById("preview-avatar"),
    previewClient: document.getElementById("preview-client"),
    previewPlatform: document.getElementById("preview-platform"),
    previewDate: document.getElementById("preview-date"),
    previewVisual: document.getElementById("preview-visual"),
    previewTitle: document.getElementById("preview-title"),
    previewCaption: document.getElementById("preview-caption"),
    previewCta: document.getElementById("preview-cta"),
    previewLink: document.getElementById("preview-link"),
    previewHashtags: document.getElementById("preview-hashtags"),
    previewTone: document.getElementById("preview-tone"),
    platformChecks: document.getElementById("platform-checks"),
    pipelineGrid: document.getElementById("social-pipeline-grid"),
    scheduleList: document.getElementById("social-schedule-list"),
    variantList: document.getElementById("variant-list"),
    saveDraft: document.getElementById("save-draft"),
    saveVariant: document.getElementById("save-variant"),
    copyText: document.getElementById("copy-text"),
    resetEditor: document.getElementById("reset-editor"),
    generateButton: document.getElementById("generate-social-content"),
    publishButton: document.getElementById("publish-social-post"),
    sampleButton: document.getElementById("load-sample-social"),
    importButton: document.getElementById("import-social-json"),
    exportButton: document.getElementById("export-social-json"),
    clearButton: document.getElementById("clear-social-storage"),
    copyAllButton: document.getElementById("copy-all-variants"),
    platformExportButton: document.getElementById("download-selected-platform"),
    moreWorkList: document.getElementById("social-morework-list"),
    moreWorkSummary: document.getElementById("social-morework-summary"),
    copyMoreWorkOffer: document.getElementById("copy-morework-offer"),
  };

  function readJson(key, fallback) {
    return repository.read(key, fallback);
  }

  function writeJson(key, value) {
    return repository.write(key, value);
  }

  function fillPlatformFilter() {
    elements.variantFilter.replaceChildren();
    const options = [["all", "Alle platformen"], ...Object.entries(platformLabels)];
    options.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      elements.variantFilter.append(option);
    });
  }

  function renderContentTypes() {
    elements.contentTypeGrid.replaceChildren(...contentTypes.map((type) => {
      const button = document.createElement("button");
      button.className = "social-studio-content-card";
      button.type = "button";
      button.dataset.contentType = type.id;
      const icon = document.createElement("span");
      icon.className = "social-studio-content-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = `<svg viewBox="0 0 24 24">${contentIcons[type.icon] || contentIcons.document}</svg>`;

      const copy = document.createElement("span");
      const title = document.createElement("strong");
      const description = document.createElement("small");
      title.textContent = type.label;
      description.textContent = type.description;
      copy.append(title, description);
      button.append(icon, copy);
      button.addEventListener("click", () => openContentWorkflow(type.id));
      return button;
    }));
  }

  function fillStatusFilter() {
    elements.statusFilter.replaceChildren();
    [["all", "Alle statussen"], ...Object.entries(statusLabels)].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      elements.statusFilter.append(option);
    });
  }

  function activeRelationship() {
    return window.ActiveRelationship?.getActiveRelationship?.() || null;
  }

  function renderContextChipRows(context) {
    elements.contextChips.replaceChildren(...contextChips(context).map((chip) => {
      const item = document.createElement("span");
      item.className = "social-studio-context-chip";
      const label = document.createElement("span");
      const value = document.createElement("strong");
      label.textContent = `${chip.label}:`;
      value.textContent = chip.value;
      item.append(label, value);
      return item;
    }));
  }

  function renderBrandSummary(voice) {
    const rows = [
      ["Merk", voice.brandName || "Nog niet ingevuld"],
      ["Tone", voice.toneOfVoice?.join(" · ") || "Nog niet ingevuld"],
      ["Doelgroep", voice.targetAudience || "Nog niet ingevuld"],
      ["Contentpijlers", voice.contentPillars?.join(" · ") || "Nog niet ingevuld"],
      ["CTA", voice.standardCtas?.[0] || "Nog niet ingevuld"],
      ["Claims", voice.riskyClaims?.join(" · ") || "Geen aanvullende claimregels"],
    ];
    elements.brandSummary.replaceChildren(...rows.map(([label, value]) => {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      wrapper.append(term, detail);
      return wrapper;
    }));
  }

  function renderBrandContext() {
    const context = state.relationshipContext || { brand: { brandName: "Max Webstudio" } };
    elements.brandSource.textContent = context.source === "secured-relationship-workspace"
      ? `Beveiligde relatiecontext · ${context.brand?.brandName || "Relatie"}`
      : context.source === "active-relationship-summary"
        ? `Beperkte relatiecontext · ${context.brand?.brandName || "Relatie"}`
        : "Intern Max Webstudio-profiel";
    renderContextChipRows(context);
    renderBrandSummary(state.brandVoice || {});
  }

  async function refreshBrandContext(relationship = activeRelationship()) {
    elements.contextMessage.textContent = relationship ? "Merk- en relatiecontext wordt veilig geladen..." : "Intern merkprofiel geladen.";
    let scope;
    try {
      scope = relationshipScope(relationship);
      state.scopeId = scope.scopeId;
      let workspace = {};
      let source = "max-webstudio-default";
      if (relationship) {
        try {
          const loaded = await loadRelationshipWorkspace(relationship);
          workspace = loaded.workspace;
          source = "secured-relationship-workspace";
        } catch (error) {
          source = "active-relationship-summary";
          elements.contextMessage.textContent = `${error.message} Alleen de reeds gevalideerde relatiesamenvatting wordt gebruikt.`;
        }
      }
      const centralBranding = readCentralBranding(scope);
      const localExtensions = brandVoiceRepository.load(scope.scopeId) || {};
      const centralRelationship = workspace.relationship || relationship || {};
      state.brandVoice = mergeBrandVoiceSources({ scopeId: scope.scopeId, centralRelationship, centralBranding, localExtensions });
      state.relationshipContext = source === "secured-relationship-workspace" || !relationship
        ? buildRelationshipContext({ scope, activeRelationship: relationship, workspace, centralBranding, contentItems: state.variants })
        : {
          scopeId: scope.scopeId,
          source,
          relationship,
          brand: { brandName: relationship.companyName || "Relatie", industry: "", audience: "", colors: [], toneOfVoice: state.brandVoice.toneOfVoice.join(", "), region: "", services: [] },
          website: { id: null, url: relationship.websiteUrl || "", status: "" },
          project: { id: null, name: "", status: "" },
          contact: { email: relationship.email || "", phone: relationship.phone || "" },
          assets: [], previousContent: [],
        };
      state.relationshipContext.source = source;
      if (source !== "active-relationship-summary") elements.contextMessage.textContent = relationship ? "Relatiecontext en Brand Voice zijn geladen." : "Intern Max Webstudio-profiel geladen.";
      renderBrandContext();
    } catch (error) {
      state.scopeId = "internal:max-webstudio";
      state.brandVoice = mergeBrandVoiceSources({ scopeId: state.scopeId, localExtensions: brandVoiceRepository.load(state.scopeId) || {} });
      state.relationshipContext = buildRelationshipContext({ scope: relationshipScope(null), contentItems: state.variants });
      elements.contextMessage.textContent = `Relatiecontext is geweigerd: ${error.message}`;
      renderBrandContext();
    }
  }

  function brandFieldControl(field, label, type) {
    const wrapper = document.createElement("label");
    wrapper.htmlFor = `brand-voice-${field}`;
    const title = document.createElement("span");
    title.textContent = label;
    const control = type === "text" ? document.createElement("input") : document.createElement("textarea");
    control.id = `brand-voice-${field}`;
    control.name = field;
    control.dataset.brandField = field;
    if (type === "text") control.type = "text";
    const source = document.createElement("small");
    source.dataset.brandSource = field;
    wrapper.append(title, control, source);
    return wrapper;
  }

  function openBrandVoiceDialog() {
    elements.brandVoiceFields.replaceChildren(...BRAND_VOICE_FIELDS.map(([field, label, type]) => brandFieldControl(field, label, type)));
    for (const [field] of BRAND_VOICE_FIELDS) {
      const control = elements.brandVoiceForm.elements[field];
      const value = state.brandVoice?.[field];
      control.value = Array.isArray(value) ? value.join("\n") : value || "";
      const inherited = state.brandVoice?.provenance?.[field] === "central";
      control.readOnly = inherited;
      const source = elements.brandVoiceFields.querySelector(`[data-brand-source="${field}"]`);
      source.textContent = inherited ? "Uit centrale relatie- of brandingbron" : "Lokale Social Studio-uitbreiding";
    }
    const contact = state.brandVoice?.contactDetails || {};
    elements.brandVoiceForm.elements.contactWebsite.value = contact.website || "";
    elements.brandVoiceForm.elements.contactEmail.value = contact.email || "";
    elements.brandVoiceForm.elements.contactPhone.value = contact.phone || "";
    const contactInherited = state.brandVoice?.provenance?.contactDetails === "central";
    ["contactWebsite", "contactEmail", "contactPhone"].forEach((name) => { elements.brandVoiceForm.elements[name].readOnly = contactInherited; });
    elements.brandVoiceDialog.showModal();
  }

  function saveBrandVoiceFromForm(event) {
    event.preventDefault();
    const extensions = {};
    for (const [field] of BRAND_VOICE_FIELDS) {
      if (state.brandVoice?.provenance?.[field] !== "central") extensions[field] = elements.brandVoiceForm.elements[field].value;
    }
    if (state.brandVoice?.provenance?.contactDetails !== "central") {
      extensions.contactDetails = {
        website: elements.brandVoiceForm.elements.contactWebsite.value,
        email: elements.brandVoiceForm.elements.contactEmail.value,
        phone: elements.brandVoiceForm.elements.contactPhone.value,
      };
    }
    brandVoiceRepository.save(state.scopeId, extensions);
    elements.brandVoiceDialog.close();
    refreshBrandContext();
    setMessage("Brand Voice lokaal opgeslagen voor deze werkruimte.", "success");
  }

  function getContext() {
    return {
      client: elements.client.value.trim(),
      campaign: elements.campaign.value.trim(),
      goal: elements.goal.value,
      date: elements.date.value,
      time: elements.time.value || "09:00",
      status: elements.status.value || "draft",
      visualFormat: elements.visualFormat.value,
    };
  }

  function getCurrentContent() {
    return {
      scopeId: state.scopeId,
      contentType: state.contentType,
      platform: state.platform,
      title: elements.title.value.trim(),
      caption: elements.caption.value.trim(),
      imagePrompt: elements.imagePrompt.value.trim(),
      cta: elements.cta.value.trim(),
      link: elements.link.value.trim(),
      hashtags: elements.hashtags.value.trim(),
      tone: elements.tone.value,
      brandVoiceSnapshot: state.brandVoice ? {
        scopeId: state.brandVoice.scopeId,
        brandName: state.brandVoice.brandName,
        toneOfVoice: state.brandVoice.toneOfVoice,
        contentPillars: state.brandVoice.contentPillars,
        updatedAt: state.brandVoice.updatedAt,
      } : null,
      relationshipContextSnapshot: state.relationshipContext ? {
        scopeId: state.relationshipContext.scopeId,
        source: state.relationshipContext.source,
        brand: state.relationshipContext.brand,
      } : null,
      ...getContext(),
    };
  }

  function setFormContent(content) {
    if (content.scopeId === state.scopeId) state.scopeId = content.scopeId;
    state.contentType = content.contentType || state.contentType;
    state.platform = content.platform && platformLabels[content.platform] ? content.platform : state.platform;
    elements.client.value = content.client || elements.client.value || "";
    elements.campaign.value = content.campaign || elements.campaign.value || "";
    if (content.goal) elements.goal.value = content.goal;
    elements.date.value = content.date || elements.date.value || defaultDate();
    elements.time.value = content.time || elements.time.value || "09:00";
    elements.status.value = statusLabels[content.status] ? content.status : "draft";
    if (content.visualFormat) elements.visualFormat.value = content.visualFormat;
    elements.title.value = content.title || "";
    elements.caption.value = content.caption || "";
    elements.imagePrompt.value = content.imagePrompt || "";
    elements.cta.value = content.cta || "";
    elements.link.value = content.link || "";
    elements.hashtags.value = content.hashtags || "";
    elements.tone.value = content.tone || "Professioneel";
    updatePlatformButtons();
    updateAll();
  }

  function saveContext() {
    writeJson(storageKeys.context, getContext());
  }

  function setContext(context) {
    elements.client.value = context.client || "";
    elements.campaign.value = context.campaign || "";
    elements.goal.value = context.goal || "Meer aanvragen";
    elements.date.value = context.date || defaultDate();
    elements.time.value = context.time || "09:00";
    elements.status.value = statusLabels[context.status] ? context.status : "draft";
    elements.visualFormat.value = context.visualFormat || "square";
  }

  function defaultDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date());
    return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  }

  function setMessage(text, type) {
    elements.message.textContent = text;
    elements.message.className = `admin-form-message social-studio-message ${type || ""}`.trim();
  }

  function openContentWorkflow(typeId) {
    const type = contentTypes.find((item) => item.id === typeId);
    if (!type) return;
    const [title, caption, cta, hashtags] = contentTypeSeeds[type.id] || contentTypeSeeds["instagram-post"];
    state.contentType = type.id;
    state.platform = type.platform;
    elements.selectedType.textContent = type.label;
    elements.start.hidden = true;
    elements.stage.hidden = false;
    elements.skeleton.hidden = false;
    elements.workbench.hidden = true;

    setFormContent({
      ...getContext(),
      contentType: type.id,
      platform: type.platform,
      visualFormat: type.visualFormat,
      title,
      caption,
      cta,
      hashtags,
      imagePrompt: `Premium ${type.label.toLowerCase()} voor een Nederlands bedrijf, helder natuurlijk licht, diep marineblauw met subtiele cyan-accenten, moderne compositie, authentiek en zonder stockfoto-uitstraling`,
      link: elements.link.value,
      tone: elements.tone.value || "Professioneel",
    });

    window.setTimeout(() => {
      elements.skeleton.hidden = true;
      elements.workbench.hidden = false;
      elements.title.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
      scheduleAutosave();
    }, 320);
  }

  function returnToStart() {
    window.clearTimeout(autosaveTimer);
    elements.stage.hidden = true;
    elements.workbench.hidden = true;
    elements.skeleton.hidden = true;
    elements.start.hidden = false;
    elements.start.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setAutosaveState(label, saving = false) {
    const text = elements.autosave.querySelector("strong");
    text.textContent = label;
    elements.autosave.classList.toggle("is-saving", saving);
  }

  function persistDraft({ announce = false } = {}) {
    const saved = writeJson(storageKeys.draft, {
      ...getCurrentContent(),
      updatedAt: new Date().toISOString(),
    });
    const timestamp = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    setAutosaveState(saved ? `Opgeslagen om ${timestamp}` : "Opslaan mislukt", false);
    if (announce) {
      setMessage(saved ? "Concept lokaal opgeslagen." : "Concept kon niet lokaal worden opgeslagen.", saved ? "success" : "error");
    }
    updateHero();
    return saved;
  }

  function scheduleAutosave() {
    window.clearTimeout(autosaveTimer);
    setAutosaveState("Opslaan...", true);
    autosaveTimer = window.setTimeout(() => persistDraft(), 650);
  }

  function updatePlatformButtons() {
    elements.platformButtons.forEach((button) => {
      const isActive = button.dataset.platform === state.platform;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
  }

  function updateAll() {
    updatePreview();
    updateCounters();
    renderChecks();
    renderVariants();
    updateHero();
    saveContext();
  }

  function updatePreview() {
    const content = getCurrentContent();
    const fallback = platformFallbacks[state.platform];
    const label = platformLabels[state.platform];
    const client = content.client || "Klantnaam placeholder";
    const link = content.link || "maxwebstudio.nl";

    elements.previewCard.dataset.platform = state.platform;
    elements.previewHeading.textContent = `${label} preview`;
    elements.previewPlatform.textContent = label;
    elements.previewClient.textContent = client;
    elements.previewAvatar.textContent = initials(client);
    elements.previewDate.textContent = formatDate(content.date);
    elements.previewVisual.textContent = `${visualFormatLabels[content.visualFormat] || "Visual"} placeholder`;
    elements.previewTitle.textContent = content.title || fallback.title;
    elements.previewCaption.textContent = content.caption || fallback.caption;
    elements.previewCta.textContent = content.cta || fallback.cta;
    elements.previewLink.textContent = cleanDisplayLink(link);
    elements.previewHashtags.textContent = content.hashtags || fallback.hashtags;
    elements.previewTone.textContent = content.tone || "Professioneel";
    elements.editorFormat.textContent = `${label} · ${visualFormatLabels[content.visualFormat] || "Visual"}`;
  }

  function updateCounters() {
    const captionLength = elements.caption.value.trim().length;
    const hashtagCount = getHashtags(elements.hashtags.value).length;
    const rule = platformRules[state.platform];
    elements.captionCounter.textContent = `${captionLength} tekens`;
    elements.hashtagCounter.textContent = `${hashtagCount} hashtags`;
    elements.platformRule.textContent = `${platformLabels[state.platform]}: ideaal rond ${rule.ideal} tekens, max ${rule.max}.`;
    elements.captionGuidance.textContent = captionLength > rule.max
      ? "Te lang voor dit platform."
      : captionLength > rule.ideal
        ? "Kan korter voor sneller scannen."
        : "Past ruim binnen het platform.";
  }

  function renderChecks() {
    const content = getCurrentContent();
    const rule = platformRules[state.platform];
    const hashtagCount = getHashtags(content.hashtags).length;
    const checks = [
      ["Titel aanwezig", !!content.title, "Geeft intern en in exports duidelijke context."],
      ["Caption gevuld", !!content.caption, "De hoofdtekst is nodig voordat je kunt publiceren."],
      ["CTA aanwezig", !!content.cta, "Elke post moet een heldere vervolgstap hebben."],
      ["Lengte passend", content.caption.length <= rule.max, `Maximaal ${rule.max} tekens voor ${platformLabels[state.platform]}.`],
      ["Hashtags passend", hashtagCount >= rule.hashtagMin && hashtagCount <= rule.hashtagMax, `Aanbevolen: ${rule.hashtagMin}-${rule.hashtagMax} hashtags.`],
      ["Link of actie", !!content.link || !!content.cta, "Nodig voor campagneposts en advertenties."],
      ["Visual format", !!content.visualFormat, `${rule.visual} werkt het best.`],
    ];
    elements.platformChecks.replaceChildren(...checks.map(([title, done, detail]) => {
      const item = document.createElement("article");
      item.className = `social-studio-check${done ? " is-done" : ""}`;
      const copy = document.createElement("div");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = title;
      span.textContent = detail;
      copy.append(strong, span);
      item.append(copy);
      return item;
    }));
  }

  function updateHero() {
    const filteredCount = filteredVariants().length;
    const readyCount = state.variants.filter((variant) => normalizeStatus(variant.status) === "ready").length;
    if (!state.variants.length) {
      elements.heroCount.textContent = "Klaar voor iets moois";
      elements.heroDetail.textContent = "Kies een format en laat Social Studio de creatieve basis voor je klaarzetten.";
      return;
    }
    elements.heroCount.textContent = `${state.variants.length} ${state.variants.length === 1 ? "creatie" : "creaties"}`;
    elements.heroDetail.textContent = `${filteredCount} zichtbaar · ${readyCount} klaar voor publicatie. Laatst bijgewerkt: ${formatDate(new Date().toISOString().slice(0, 10))}.`;
  }

  function buildCopyText(content = getCurrentContent()) {
    const fallback = platformFallbacks[content.platform || state.platform];
    const parts = [
      platformLabels[content.platform || state.platform],
      content.client ? `Klant: ${content.client}` : "",
      content.campaign ? `Campagne: ${content.campaign}` : "",
      content.title || fallback.title,
      content.caption || fallback.caption,
      content.cta ? `CTA: ${content.cta}` : `CTA: ${fallback.cta}`,
      content.link ? `Link: ${content.link}` : "",
      content.hashtags || fallback.hashtags,
    ];

    return parts.filter(Boolean).join("\n\n");
  }

  function saveDraft() {
    persistDraft({ announce: true });
  }

  function saveVariant() {
    const content = getCurrentContent();
    const fallback = platformFallbacks[state.platform];
    const variant = normalizeContentItem({
      id: `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      scopeId: content.scopeId,
      contentType: content.contentType,
      platform: content.platform,
      title: content.title || fallback.title,
      caption: content.caption || fallback.caption,
      imagePrompt: content.imagePrompt,
      cta: content.cta || fallback.cta,
      link: content.link,
      hashtags: content.hashtags || fallback.hashtags,
      tone: content.tone,
      client: content.client,
      campaign: content.campaign,
      goal: content.goal,
      date: content.date,
      time: content.time,
      status: content.status,
      visualFormat: content.visualFormat,
      brandVoiceSnapshot: content.brandVoiceSnapshot,
      relationshipContextSnapshot: content.relationshipContextSnapshot,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    state.variants = [variant, ...state.variants].slice(0, 100);
    const saved = writeJson(storageKeys.variants, state.variants);
    renderVariants();
    updateHero();
    setMessage(saved ? "Variant opgeslagen." : "Variant kon niet lokaal worden opgeslagen.", saved ? "success" : "error");
  }

  async function copyText() {
    await copyToClipboard(buildCopyText(), "Tekst gekopieerd naar klembord.");
  }

  function resetEditor() {
    setFormContent({ platform: state.platform, tone: "Professioneel", date: elements.date.value, visualFormat: elements.visualFormat.value });
    repository.remove(storageKeys.draft);
    setMessage("Editor gereset.", "success");
  }

  function removeVariant(id) {
    state.variants = state.variants.filter((variant) => variant.id !== id);
    writeJson(storageKeys.variants, state.variants);
    renderVariants();
    updateHero();
    setMessage("Variant verwijderd.", "success");
  }

  function duplicateVariant(variant) {
    const copy = normalizeContentItem({
      ...variant,
      id: `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: `${variant.title || "Variant"} copy`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    state.variants.unshift(copy);
    writeJson(storageKeys.variants, state.variants);
    renderVariants();
    updateHero();
    setMessage("Variant gedupliceerd.", "success");
  }

  function loadVariant(variant) {
    setFormContent(variant);
    setMessage("Variant geladen in editor.", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function createVariantCard(variant) {
    const card = document.createElement("article");
    card.className = "social-studio-variant";

    const content = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const caption = document.createElement("small");
    const status = document.createElement("span");

    title.textContent = variant.title || "Naamloze variant";
    meta.textContent = `${platformLabels[variant.platform] || "Platform"} · ${variant.client || "Geen klant"} · ${formatDate(variant.date || variant.createdAt)} om ${variant.time || "09:00"} · ${variant.cta || "Geen CTA"}`;
    caption.textContent = variant.caption || "Geen tekst opgeslagen.";
    status.className = "social-studio-status-badge";
    status.textContent = statusLabels[normalizeStatus(variant.status)];

    content.append(title, meta, caption, status);

    const actions = document.createElement("div");
    actions.className = "social-studio-actions";
    actions.append(
      actionButton("Laden", () => loadVariant(variant), "primary"),
      actionButton("Kopieer", () => copyToClipboard(buildCopyText(variant), "Variant gekopieerd."), "secondary"),
      actionButton("Dupliceer", () => duplicateVariant(variant), "secondary"),
      actionButton(nextStatusLabel(variant), () => advanceVariantStatus(variant.id), "secondary"),
      actionButton("Verwijderen", () => removeVariant(variant.id), "secondary"),
    );

    card.append(content, actions);
    return card;
  }

  function actionButton(label, handler, variant) {
    const button = document.createElement("button");
    button.className = `button ${variant}`;
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function filteredVariants() {
    return state.variants.filter((variant) => {
      const matchesPlatform = state.variantFilter === "all" || variant.platform === state.variantFilter;
      const matchesStatus = state.statusFilter === "all" || normalizeStatus(variant.status) === state.statusFilter;
      const query = state.variantQuery.trim().toLowerCase();
      const haystack = JSON.stringify(variant).toLowerCase();
      return matchesPlatform && matchesStatus && (!query || haystack.includes(query));
    });
  }

  function renderVariants() {
    renderPipeline();
    const variants = filteredVariants();
    elements.variantList.textContent = "";

    if (!variants.length) {
      const empty = document.createElement("p");
      empty.className = "social-studio-empty";
      empty.textContent = state.variants.length
        ? "Geen varianten gevonden met deze filters."
        : "Nog geen varianten opgeslagen. Bewaar een variant of laad het voorbeeldpakket.";
      elements.variantList.append(empty);
      return;
    }

    variants.forEach((variant) => {
      elements.variantList.append(createVariantCard(variant));
    });
  }

  function normalizeStatus(status) {
    return normalizeContentStatus(status);
  }

  function nextStatusLabel(variant) {
    const currentIndex = statusOrder.indexOf(normalizeStatus(variant.status));
    const nextStatus = statusOrder[Math.min(currentIndex + 1, statusOrder.length - 1)];
    return currentIndex === statusOrder.length - 1 ? "Status klaar" : `Naar ${statusLabels[nextStatus].toLowerCase()}`;
  }

  function advanceVariantStatus(id) {
    state.variants = state.variants.map((variant) => {
      if (variant.id !== id) return variant;
      const currentIndex = statusOrder.indexOf(normalizeStatus(variant.status));
      const nextStatus = statusOrder[Math.min(currentIndex + 1, statusOrder.length - 1)];
      return { ...variant, status: nextStatus, updatedAt: new Date().toISOString() };
    });
    writeJson(storageKeys.variants, state.variants);
    renderVariants();
    updateHero();
    setMessage("Workflowstatus bijgewerkt.", "success");
  }

  function renderPipeline() {
    const counts = statusOrder.reduce((result, status) => {
      result[status] = state.variants.filter((variant) => normalizeStatus(variant.status) === status).length;
      return result;
    }, {});

    elements.pipelineGrid.replaceChildren(...statusOrder.map((status) => {
      const card = document.createElement("article");
      card.className = "social-studio-pipeline-card";
      const label = document.createElement("span");
      const count = document.createElement("strong");
      const detail = document.createElement("small");
      label.textContent = statusLabels[status];
      count.textContent = String(counts[status]);
      detail.textContent = status === "ready" ? "Gereed voor handmatige publicatie" : "Opgeslagen contentvarianten";
      card.append(label, count, detail);
      return card;
    }));

    const scheduled = state.variants
      .filter((variant) => variant.date)
      .sort((a, b) => `${a.date}T${a.time || "09:00"}`.localeCompare(`${b.date}T${b.time || "09:00"}`))
      .slice(0, 5);

    elements.scheduleList.textContent = "";
    if (!scheduled.length) {
      const empty = document.createElement("li");
      empty.textContent = "Nog geen content ingepland.";
      elements.scheduleList.append(empty);
      return;
    }

    scheduled.forEach((variant) => {
      const item = document.createElement("li");
      const title = document.createElement("span");
      const planning = document.createElement("strong");
      title.textContent = `${variant.title || "Naamloze variant"} · ${platformLabels[variant.platform] || "Platform"}`;
      planning.textContent = `${formatDate(variant.date)} · ${variant.time || "09:00"}`;
      item.append(title, planning);
      elements.scheduleList.append(item);
    });
  }

  function applyTemplate(templateKey) {
    const template = templateContent[templateKey];
    if (!template) return;
    elements.title.value = template.title;
    elements.caption.value = template.caption;
    elements.cta.value = template.cta;
    elements.hashtags.value = template.hashtags;
    if (!elements.link.value) elements.link.value = "https://maxwebstudio.nl";
    updateAll();
    setMessage("Template geladen. Pas hem nu aan voor de klant.", "success");
  }

  function renderMoreWorkOffers() {
    if (!elements.moreWorkList) return;
    elements.moreWorkList.replaceChildren(...moreWorkOffers.map((offer) => {
      const card = document.createElement("button");
      card.className = "social-studio-morework-card";
      card.type = "button";
      card.dataset.moreworkOffer = offer.id;
      card.innerHTML = `
        <span>${offer.price}</span>
        <strong>${offer.title}</strong>
        <small>${offer.note}</small>
      `;
      card.addEventListener("click", () => applyMoreWorkOffer(offer.id));
      return card;
    }));
  }

  function applyMoreWorkOffer(offerId) {
    const offer = moreWorkOffers.find((item) => item.id === offerId);
    if (!offer) return;
    state.platform = offer.platform;
    elements.campaign.value = offer.title;
    elements.goal.value = offer.goal;
    elements.status.value = "draft";
    elements.title.value = `${offer.title} voor ondernemers`;
    elements.caption.value = offer.copy;
    elements.cta.value = offer.cta;
    elements.link.value = "https://maxwebstudio.nl#meerwerk";
    elements.hashtags.value = offer.hashtags;
    elements.tone.value = offer.platform === "ad" ? "Direct verkoopgericht" : "Professioneel";
    if (elements.moreWorkSummary) {
      elements.moreWorkSummary.textContent = `${offer.title} geselecteerd: ${offer.price}. ${offer.note}`;
    }
    updatePlatformButtons();
    updateAll();
    setMessage(`${offer.title} geladen in de editor.`, "success");
  }

  function buildMoreWorkOfferText() {
    return moreWorkOffers.map((offer) => `${offer.title} - ${offer.price}\n${offer.note}`).join("\n\n");
  }

  function loadSample() {
    setContext({
      client: "Demo Klant",
      campaign: "Nieuwe website campagne",
      goal: "Meer aanvragen",
      date: defaultDate(),
      time: "09:00",
      status: "draft",
      visualFormat: "square",
    });
    state.platform = "instagram";
    setFormContent({
      platform: "instagram",
      title: "Nieuwe website live",
      caption: "Een sterke eerste indruk maakt verschil. Voor Demo Klant staat er nu een frisse website klaar die sneller duidelijk maakt wat ze doen, waarom klanten voor hen kiezen en hoe je direct contact opneemt.",
      cta: "Bekijk de website",
      link: "https://maxwebstudio.nl",
      hashtags: "#webdesign #lokaleondernemer #branding #maxwebstudio",
      tone: "Enthousiast",
      client: "Demo Klant",
      campaign: "Nieuwe website campagne",
      goal: "Meer aanvragen",
      date: defaultDate(),
      time: "09:00",
      status: "draft",
      visualFormat: "square",
    });
    saveVariant();
    setMessage("Voorbeeld geladen en als variant opgeslagen.", "success");
  }

  function exportPayload(variants = state.variants) {
    return createWorkspaceEnvelope({
      context: getContext(),
      currentDraft: getCurrentContent(),
      variants,
    });
  }

  function exportJson(variants = state.variants, filename = "maxwebstudio-social-media-studio.json") {
    const blob = new Blob([JSON.stringify(exportPayload(variants), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage("JSON export gestart.", "success");
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        if (parsed.context) setContext(parsed.context);
        if (parsed.currentDraft) setFormContent(parsed.currentDraft);
        if (Array.isArray(parsed.variants)) {
          state.variants = parsed.variants
            .filter((variant) => variant && variant.platform)
            .map(normalizeContentItem);
          writeJson(storageKeys.variants, state.variants);
        }
        renderVariants();
        updateHero();
        setMessage("JSON import geladen.", "success");
      } catch (error) {
        console.warn("Social Media Studio import mislukt.", error);
        setMessage("JSON import kon niet worden gelezen.", "error");
      } finally {
        event.target.value = "";
      }
    });
    reader.readAsText(file);
  }

  async function copyAllVariants() {
    const variants = filteredVariants();
    if (!variants.length) {
      setMessage("Geen varianten om te kopiëren.", "error");
      return;
    }
    await copyToClipboard(variants.map((variant) => buildCopyText(variant)).join("\n\n---\n\n"), "Alle zichtbare varianten gekopieerd.");
  }

  function clearStorage() {
    const confirmed = window.confirm("Weet je zeker dat je alle Social Media Studio concepten en varianten wilt wissen?");
    if (!confirmed) return;
    state.variants = [];
    repository.clearWorkspace();
    renderVariants();
    updateHero();
    setMessage("Lokale Social Media Studio opslag gewist.", "success");
  }

  function generateSocialContent() {
    // Future hook: send editor context to a Netlify Function that calls OpenAI.
    // Future hook: enrich the prompt with customer, brand, tone and campaign data from Supabase.
    setMessage("AI-generatie wordt later gekoppeld.", "success");
    return getCurrentContent();
  }

  function publishSocialPost() {
    // Future hook: validate approval status and send payload to Facebook, Instagram, LinkedIn, Google or ad APIs.
    // Future hook: write publication state and audit metadata back to Supabase.
    setMessage("Publiceren wordt later gekoppeld.", "success");
  }

  async function copyToClipboard(text, successMessage) {
    if (!text) {
      setMessage("Geen tekst om te kopiëren.", "error");
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setMessage(successMessage, "success");
    } catch (error) {
      console.warn("Kopiëren is mislukt.", error);
      setMessage("Kopiëren is niet gelukt. Selecteer de tekst handmatig.", "error");
    }
  }

  function getHashtags(value) {
    return String(value || "").split(/\s+/).filter((part) => part.startsWith("#") && part.length > 1);
  }

  function cleanDisplayLink(value) {
    return String(value || "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
  }

  function initials(value) {
    const words = String(value || "Max Webstudio").trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "MW";
  }

  function bindEvents() {
    elements.platformButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.platform = button.dataset.platform;
        updatePlatformButtons();
        updateAll();
      });
    });

    elements.templateButtons.forEach((button) => {
      button.addEventListener("click", () => applyTemplate(button.dataset.template));
    });

    [elements.client, elements.campaign, elements.goal, elements.date, elements.time, elements.status, elements.visualFormat, elements.title, elements.caption, elements.imagePrompt, elements.cta, elements.link, elements.hashtags, elements.tone].forEach((field) => {
      field.addEventListener("input", () => {
        updateAll();
        scheduleAutosave();
      });
      field.addEventListener("change", () => {
        updateAll();
        scheduleAutosave();
      });
    });

    elements.variantSearch.addEventListener("input", () => {
      state.variantQuery = elements.variantSearch.value;
      renderVariants();
      updateHero();
    });
    elements.variantFilter.addEventListener("change", () => {
      state.variantFilter = elements.variantFilter.value;
      renderVariants();
      updateHero();
    });
    elements.statusFilter.addEventListener("change", () => {
      state.statusFilter = elements.statusFilter.value;
      renderVariants();
      updateHero();
    });

    elements.saveDraft.addEventListener("click", saveDraft);
    elements.saveVariant.addEventListener("click", saveVariant);
    elements.copyText.addEventListener("click", copyText);
    elements.resetEditor.addEventListener("click", resetEditor);
    elements.generateButton.addEventListener("click", generateSocialContent);
    elements.publishButton.addEventListener("click", publishSocialPost);
    elements.sampleButton.addEventListener("click", loadSample);
    elements.importButton.addEventListener("click", () => elements.jsonFile.click());
    elements.jsonFile.addEventListener("change", importJson);
    elements.exportButton.addEventListener("click", () => exportJson());
    elements.clearButton.addEventListener("click", clearStorage);
    elements.copyAllButton.addEventListener("click", copyAllVariants);
    elements.platformExportButton.addEventListener("click", () => {
      const variants = filteredVariants();
      exportJson(variants, `maxwebstudio-${state.variantFilter === "all" ? "social" : state.variantFilter}-varianten.json`);
    });
    if (elements.copyMoreWorkOffer) {
      elements.copyMoreWorkOffer.addEventListener("click", () => copyToClipboard(buildMoreWorkOfferText(), "Meerwerk aanbod gekopieerd."));
    }

    elements.backButton.addEventListener("click", returnToStart);
    elements.editBrandVoice.addEventListener("click", openBrandVoiceDialog);
    elements.closeBrandVoice.addEventListener("click", () => elements.brandVoiceDialog.close());
    elements.cancelBrandVoice.addEventListener("click", () => elements.brandVoiceDialog.close());
    elements.brandVoiceForm.addEventListener("submit", saveBrandVoiceFromForm);
    elements.brandVoiceDialog.addEventListener("click", (event) => {
      if (event.target === elements.brandVoiceDialog) elements.brandVoiceDialog.close();
    });
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const isEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        persistDraft({ announce: true });
      }
      if (!isEditing && event.key === "/" && !elements.workbench.hidden) {
        event.preventDefault();
        elements.variantSearch.focus();
      }
    });
  }

  function init() {
    renderContentTypes();
    fillPlatformFilter();
    fillStatusFilter();
    renderMoreWorkOffers();
    const legacyVariants = readJson(storageKeys.legacyVariants, []);
    state.variants = repository.loadVariants(Array.isArray(legacyVariants) ? legacyVariants : []);
    const context = readJson(storageKeys.context, {});
    setContext({ ...context, date: context.date || defaultDate() });
    const draft = readJson(storageKeys.draft, readJson(storageKeys.legacyDraft, null));
    if (draft) {
      setFormContent(draft);
    } else {
      updateAll();
    }
    bindEvents();
    window.ActiveRelationship?.subscribeToRelationshipChanges?.((relationship) => refreshBrandContext(relationship));
    refreshBrandContext();
    renderVariants();
    updateHero();
  }

  window.generateSocialContent = generateSocialContent;
  window.publishSocialPost = publishSocialPost;

  init();
})();
