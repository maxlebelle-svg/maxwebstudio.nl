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
import { AI_OUTPUT_FIELDS, CONTENT_OBJECTIVES } from "./social-studio/ai-contracts.mjs";
import { buildSocialStudioAIRequest, summarizeAIRequestContext } from "./social-studio/ai-prompt-builder.mjs";
import { LocalMockSocialStudioAIAdapter } from "./social-studio/ai-mock-adapter.mjs";
import {
  PLATFORM_VARIANT_PROFILES,
  createMasterConcept,
  generatePlatformVariants,
  variantsForMaster,
} from "./social-studio/platform-variants.mjs";
import { analyzeContentQuality, contentQualityScore } from "./social-studio/content-quality.mjs";

(function () {
  "use strict";

  const storageKeys = {
    draft: "mws_social_media_studio_draft_v2",
    variants: "mws_social_media_studio_variants_v2",
    context: "mws_social_media_studio_context_v2",
    masters: "mws_social_media_studio_masters_v2",
    legacyDraft: "mws_social_media_studio_draft",
    legacyVariants: "mws_social_media_studio_variants",
  };

  const repository = new LocalSocialStudioRepository(window.localStorage, storageKeys);
  const brandVoiceRepository = new BrandVoiceRepository(window.localStorage);
  const aiAdapter = new LocalMockSocialStudioAIAdapter();

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
    ["google-business-post", "Google Bedrijfspost", "Lokale zichtbaarheid met één heldere actie", "pin", "google", "landscape"],
    ["blog", "Blogidee", "Verdieping met structuur en zoekintentie", "document", "blog", "landscape"],
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
    "google-business-post": ["Een lokale update die direct duidelijk is", "Vertel concreet wat er nieuw, nuttig of beschikbaar is en maak de volgende stap laagdrempelig.", "Bekijk de mogelijkheden", ""],
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
    pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  };

  const state = {
    platform: "facebook",
    contentType: "social-post",
    scopeId: "internal:max-webstudio",
    brandVoice: null,
    relationshipContext: null,
    aiStep: 1,
    aiRequest: null,
    aiOutput: null,
    aiVariation: 0,
    aiAcceptedFields: new Set(),
    masters: [],
    activeMasterId: null,
    editingVariantId: null,
    variantDetails: {},
    variants: [],
    variantQuery: "",
    variantFilter: "all",
    statusFilter: "all",
    sortBy: "updated-desc",
    campaignFilter: "all",
    clientFilter: "all",
    pillarFilter: "all",
    mobileCanvas: "editor",
  };

  let autosaveTimer = null;

  const elements = {
    platformButtons: Array.from(document.querySelectorAll(".social-studio-platform[data-platform]")),
    templateButtons: Array.from(document.querySelectorAll("[data-template]")),
    copyEditorFields: Array.from(document.querySelectorAll("[data-copy-editor-field]")),
    client: document.getElementById("social-client"),
    start: document.getElementById("social-studio-start"),
    stage: document.getElementById("social-studio-stage"),
    skeleton: document.getElementById("social-studio-skeleton"),
    workbench: document.getElementById("social-studio-workbench"),
    contentTypeGrid: document.getElementById("social-content-type-grid"),
    backButton: document.getElementById("social-studio-back"),
    selectedType: document.getElementById("social-selected-type"),
    createPlatformVariants: document.getElementById("create-platform-variants"),
    platformVariantSwitcher: document.getElementById("platform-variant-switcher"),
    masterSummary: document.getElementById("social-master-summary"),
    greeting: document.getElementById("social-studio-greeting"),
    dailyBrief: document.getElementById("social-daily-brief"),
    editorGrid: document.getElementById("social-editor-grid"),
    showEditor: document.getElementById("show-social-editor"),
    showPreview: document.getElementById("show-social-preview"),
    autosave: document.getElementById("social-autosave"),
    aiLaunch: document.getElementById("open-ai-creator"),
    aiCreator: document.getElementById("social-ai-creator"),
    aiClose: document.getElementById("close-ai-creator"),
    aiSteps: document.getElementById("social-ai-steps"),
    aiForm: document.getElementById("social-ai-form"),
    aiPrevious: document.getElementById("social-ai-previous"),
    aiNext: document.getElementById("social-ai-next"),
    aiStepLabel: document.getElementById("social-ai-step-label"),
    aiContextChips: document.getElementById("social-ai-context-chips"),
    aiContextSummary: document.getElementById("social-ai-context-summary"),
    aiAssets: document.getElementById("social-ai-assets"),
    aiReview: document.getElementById("social-ai-review"),
    aiGenerate: document.getElementById("generate-ai-preview"),
    aiOutput: document.getElementById("social-ai-output"),
    aiFinish: document.getElementById("social-ai-finish"),
    aiOpenEditor: document.getElementById("open-ai-in-editor"),
    aiMessage: document.getElementById("social-ai-message"),
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
    publicationFields: document.getElementById("social-publication-fields"),
    publicUrl: document.getElementById("social-public-url"),
    publicationNote: document.getElementById("social-publication-note"),
    visualFormat: document.getElementById("social-visual-format"),
    variantSearch: document.getElementById("variant-search"),
    variantFilter: document.getElementById("variant-platform-filter"),
    statusFilter: document.getElementById("variant-status-filter"),
    variantSort: document.getElementById("variant-sort"),
    campaignFilter: document.getElementById("variant-campaign-filter"),
    clientFilter: document.getElementById("variant-client-filter"),
    pillarFilter: document.getElementById("variant-pillar-filter"),
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

  function greetingForNow() {
    const hour = new Date().getHours();
    const moment = hour < 12 ? "Goedemorgen" : hour < 18 ? "Goedemiddag" : "Goedenavond";
    const session = readJson("mws_admin_supabase_session", {});
    const emailName = String(session.email || "").split("@")[0].split(/[._-]/)[0].trim();
    const generic = ["", "admin", "preview", "info", "contact"].includes(emailName.toLowerCase());
    const name = generic ? "Max" : emailName.charAt(0).toUpperCase() + emailName.slice(1);
    return `${moment}, ${name}.`;
  }

  function resumeVariantFromStart(variant) {
    elements.start.hidden = true;
    elements.stage.hidden = false;
    elements.skeleton.hidden = true;
    elements.aiCreator.hidden = true;
    elements.workbench.hidden = false;
    loadVariant(variant);
  }

  function dailyCard({ eyebrow, title, detail, action, recommended = false }) {
    const card = action ? document.createElement("button") : document.createElement("article");
    if (action) {
      card.type = "button";
      card.addEventListener("click", action);
    }
    card.className = `social-studio-daily-card${recommended ? " is-recommended" : ""}`;
    const label = document.createElement("span");
    const copy = document.createElement("div");
    const heading = document.createElement("strong");
    const description = document.createElement("small");
    label.textContent = eyebrow;
    heading.textContent = title;
    description.textContent = detail;
    copy.append(heading, description);
    card.append(label, copy);
    return card;
  }

  function renderStartDashboard() {
    elements.greeting.textContent = greetingForNow();
    const active = state.variants.filter((variant) => normalizeStatus(variant.status) !== "archived");
    const recent = [...active].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
    const planned = [...active]
      .filter((variant) => normalizeStatus(variant.status) === "scheduled" && variant.date)
      .sort((a, b) => `${a.date}T${a.time || "09:00"}`.localeCompare(`${b.date}T${b.time || "09:00"}`))[0];
    const review = active.find((variant) => normalizeStatus(variant.status) === "review");
    const approved = active.find((variant) => normalizeStatus(variant.status) === "approved");
    const draftCount = active.filter((variant) => ["idea", "draft"].includes(normalizeStatus(variant.status))).length;
    const readyCount = active.filter((variant) => ["approved", "scheduled"].includes(normalizeStatus(variant.status))).length;
    const recommendation = review
      ? { title: "Rond één review af", detail: review.title || "Open het concept en maak het besluit eenvoudig.", action: () => resumeVariantFromStart(review) }
      : approved
        ? { title: "Plan je goedgekeurde concept", detail: approved.title || "Geef het concept een rustig moment in je kalender.", action: () => resumeVariantFromStart(approved) }
        : { title: "Begin met een fris idee", detail: "Gebruik je merkcontext voor een lokaal, controleerbaar startconcept.", action: openAICreator };
    elements.dailyBrief.replaceChildren(
      dailyCard({
        eyebrow: "Recent concept",
        title: recent?.title || "Je canvas wacht op je",
        detail: recent ? `Bijgewerkt ${formatDate(recent.updatedAt)} · ga verder waar je was.` : "Kies hieronder een format om je eerste concept te maken.",
        action: recent ? () => resumeVariantFromStart(recent) : openAICreator,
      }),
      dailyCard({
        eyebrow: "Eerstvolgende planning",
        title: planned?.title || "Nog alle ruimte",
        detail: planned ? `${formatDate(planned.date)} om ${planned.time || "09:00"}.` : "Plan een goedgekeurd concept wanneer het moment klopt.",
        action: planned ? () => resumeVariantFromStart(planned) : openAICreator,
      }),
      dailyCard({
        eyebrow: "Contentvoorraad",
        title: `${draftCount} in ontwikkeling · ${readyCount} klaar`,
        detail: active.length ? `${active.length} actieve creaties, veilig lokaal bewaard.` : "Je voorraad groeit mee met ieder goed idee.",
      }),
      dailyCard({ eyebrow: "Aanbevolen volgende stap", ...recommendation, recommended: true }),
    );
  }

  function setMobileCanvas(canvas) {
    state.mobileCanvas = canvas === "preview" ? "preview" : "editor";
    const preview = state.mobileCanvas === "preview";
    elements.editorGrid.classList.toggle("is-preview", preview);
    elements.showEditor.classList.toggle("is-active", !preview);
    elements.showPreview.classList.toggle("is-active", preview);
    elements.showEditor.setAttribute("aria-selected", String(!preview));
    elements.showPreview.setAttribute("aria-selected", String(preview));
    if (window.matchMedia("(max-width: 760px)").matches && !elements.workbench.hidden) {
      window.requestAnimationFrame(() => elements.workbench.scrollIntoView({ block: "start" }));
    }
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
      publication: {
        date: elements.status.value === "published" ? elements.date.value : "",
        url: elements.publicUrl.value.trim(),
        note: elements.publicationNote.value.trim(),
      },
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
      visualDirection: state.variantDetails.visualDirection || state.aiOutput?.visualDirection || "",
      altText: state.variantDetails.altText || state.aiOutput?.altText || "",
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
      extensions: {
        ...(state.variantDetails.extensions || {}),
        ...(state.aiOutput ? { aiDraft: {
          requestId: state.aiOutput.requestId,
          outputId: state.aiOutput.outputId,
          generator: state.aiOutput.generator,
          mode: state.aiOutput.mode,
          acceptedFields: [...state.aiAcceptedFields],
          output: { ...state.aiOutput },
        } } : {}),
      },
      ...getContext(),
    };
  }

  function setFormContent(content) {
    if (content.scopeId === state.scopeId) state.scopeId = content.scopeId;
    state.contentType = content.contentType || state.contentType;
    state.platform = content.platform && platformLabels[content.platform] ? content.platform : state.platform;
    state.editingVariantId = content.contentRole === "platform-variant" ? content.id : null;
    state.activeMasterId = content.masterId || state.activeMasterId;
    state.variantDetails = { visualDirection: content.visualDirection || "", altText: content.altText || "", extensions: { ...(content.extensions || {}) } };
    elements.client.value = content.client || elements.client.value || "";
    elements.campaign.value = content.campaign || elements.campaign.value || "";
    if (content.goal) elements.goal.value = content.goal;
    elements.date.value = content.date || elements.date.value || defaultDate();
    elements.time.value = content.time || elements.time.value || "09:00";
    elements.status.value = statusLabels[content.status] ? content.status : "draft";
    elements.publicUrl.value = content.publication?.url || "";
    elements.publicationNote.value = content.publication?.note || "";
    updatePublicationFields();
    if (content.visualFormat) elements.visualFormat.value = content.visualFormat;
    elements.title.value = content.title || "";
    elements.caption.value = content.caption || "";
    elements.imagePrompt.value = content.imagePrompt || "";
    elements.cta.value = content.cta || "";
    elements.link.value = content.link || "";
    elements.hashtags.value = content.hashtags || "";
    const tone = content.tone || "Professioneel";
    if (![...elements.tone.options].some((option) => option.value === tone)) {
      const option = document.createElement("option");
      option.value = tone;
      option.textContent = tone;
      elements.tone.append(option);
    }
    elements.tone.value = tone;
    updatePlatformButtons();
    renderPlatformVariantSwitcher();
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
    updatePublicationFields();
  }

  function updatePublicationFields() {
    const published = elements.status.value === "published";
    elements.publicationFields.hidden = !published;
  }

  function defaultDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(value) {
    const formatter = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
    if (!value) return formatter.format(new Date());
    const raw = String(value);
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
    return Number.isNaN(date.getTime()) ? "Datum onbekend" : formatter.format(date);
  }

  function setMessage(text, type) {
    elements.message.textContent = text;
    elements.message.className = `admin-form-message social-studio-message ${type || ""}`.trim();
  }

  const aiStepLabels = ["Doel", "Briefing", "Context", "Genereren", "Bewerken", "Afronden"];
  const aiListFields = new Set(["hookVariants", "hashtags", "reelScript", "storyStructure", "carouselStructure", "platformNotes", "claimWarnings"]);
  const aiFieldLabels = {
    mainIdea: "Hoofdidee",
    hookVariants: "Hookvarianten",
    caption: "Caption",
    cta: "Call to action",
    hashtags: "Hashtags",
    imagePrompt: "AI-afbeelding prompt",
    visualDirection: "Visuele richting",
    reelScript: "Reelscript",
    storyStructure: "Story-opbouw",
    carouselStructure: "Carousel-opbouw",
    altText: "Alt-tekst",
    platformNotes: "Platformnotities",
    claimWarnings: "Claimcontrole",
    brandContextSummary: "Gebruikte merkcontext",
  };

  function setAIMessage(text, type = "") {
    elements.aiMessage.textContent = text;
    elements.aiMessage.className = `admin-form-message ${type}`.trim();
  }

  function populateAICreatorOptions() {
    const objective = elements.aiForm.elements.objective;
    objective.replaceChildren(...CONTENT_OBJECTIVES.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
      return option;
    }));
    const contentType = elements.aiForm.elements.contentType;
    contentType.replaceChildren(...contentTypes.map((type) => {
      const option = document.createElement("option");
      option.value = type.id;
      option.textContent = type.label;
      return option;
    }));
  }

  function renderAIStepNavigation() {
    elements.aiSteps.replaceChildren(...aiStepLabels.map((label, index) => {
      const item = document.createElement("span");
      item.className = "social-studio-ai-step-dot";
      item.textContent = `${index + 1}. ${label}`;
      item.classList.toggle("is-active", state.aiStep === index + 1);
      item.classList.toggle("is-done", state.aiStep > index + 1);
      item.setAttribute("aria-current", state.aiStep === index + 1 ? "step" : "false");
      return item;
    }));
    elements.aiForm.querySelectorAll("[data-ai-step]").forEach((step) => {
      step.hidden = Number(step.dataset.aiStep) !== state.aiStep;
    });
    elements.aiPrevious.hidden = state.aiStep === 1;
    elements.aiNext.hidden = state.aiStep >= 6;
    elements.aiNext.textContent = state.aiStep === 4 ? "Bekijk concept" : "Volgende";
    elements.aiStepLabel.textContent = `Stap ${state.aiStep} van 6`;
    if (state.aiStep === 3) renderAIContext();
    if (state.aiStep === 4) renderAIReview();
    if (state.aiStep === 5) renderAIOutput();
    if (state.aiStep === 6) renderAIFinish();
  }

  function openAICreator() {
    window.clearTimeout(autosaveTimer);
    state.aiStep = 1;
    state.aiRequest = null;
    state.aiOutput = null;
    state.aiVariation = 0;
    state.aiAcceptedFields = new Set();
    elements.aiForm.reset();
    elements.aiForm.elements.objective.value = "zichtbaarheid";
    elements.aiForm.elements.platform.value = "instagram";
    elements.aiForm.elements.contentType.value = "instagram-post";
    elements.aiForm.elements.audience.value = state.brandVoice?.targetAudience || state.relationshipContext?.brand?.audience || "";
    elements.aiForm.elements.contentPillar.value = state.brandVoice?.contentPillars?.[0] || "";
    elements.aiForm.elements.toneOfVoice.value = state.brandVoice?.toneOfVoice?.join(", ") || "";
    elements.aiForm.elements.desiredCta.value = state.brandVoice?.standardCtas?.[0] || "";
    elements.aiForm.elements.campaign.value = elements.campaign.value || "";
    elements.start.hidden = true;
    elements.stage.hidden = false;
    elements.skeleton.hidden = true;
    elements.workbench.hidden = true;
    elements.aiCreator.hidden = false;
    setAIMessage("Lokale preview actief: er worden geen gegevens extern verstuurd.", "success");
    renderAIStepNavigation();
    elements.aiForm.elements.objective.focus({ preventScroll: true });
    elements.aiCreator.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function collectAIRequest() {
    const form = new FormData(elements.aiForm);
    const relationship = activeRelationship();
    return buildSocialStudioAIRequest({
      scopeId: state.scopeId,
      relationship: relationship ? { id: relationship.id, companyName: relationship.companyName || relationship.name || "" } : null,
      topic: form.get("topic"),
      objective: form.get("objective"),
      audience: form.get("audience"),
      contentPillar: form.get("contentPillar"),
      platform: form.get("platform"),
      contentType: form.get("contentType"),
      toneOfVoice: form.get("toneOfVoice"),
      desiredCta: form.get("desiredCta"),
      facts: form.get("facts"),
      assets: (state.relationshipContext?.assets || []).map((asset) => ({
        id: asset.id || asset.assetId || "",
        name: asset.name || asset.fileName || asset.label || "Asset",
        category: asset.category || asset.type || "brand",
      })),
      desiredLength: form.get("desiredLength"),
      emojiPreference: form.get("emojiPreference"),
      campaign: form.get("campaign"),
      language: form.get("language"),
      brandVoice: state.brandVoice || {},
      relationshipContext: state.relationshipContext || {},
    });
  }

  function validateCurrentAIStep() {
    if (state.aiStep === 2) {
      for (const name of ["topic", "audience"]) {
        const field = elements.aiForm.elements[name];
        if (!field.value.trim()) {
          setAIMessage(name === "topic" ? "Geef eerst een concreet onderwerp." : "Beschrijf eerst de doelgroep.", "error");
          field.focus();
          return false;
        }
      }
      const result = collectAIRequest();
      if (!result.valid) {
        setAIMessage(result.errors[0]?.message || "De briefing is nog niet compleet.", "error");
        return false;
      }
      state.aiRequest = result.request;
    }
    if (state.aiStep === 4 && !state.aiOutput) {
      setAIMessage("Genereer eerst een lokaal concept.", "error");
      elements.aiGenerate.focus();
      return false;
    }
    if (state.aiStep === 5 && !state.aiAcceptedFields.size) {
      setAIMessage("Kies minimaal één onderdeel met ‘Gebruik in editor’.", "error");
      return false;
    }
    return true;
  }

  function renderAIContext() {
    const request = state.aiRequest || collectAIRequest().request;
    const chips = contextChips(state.relationshipContext || {});
    elements.aiContextChips.replaceChildren(...chips.map((chip) => {
      const item = document.createElement("span");
      item.className = "social-studio-context-chip";
      item.textContent = `${chip.label}: ${chip.value}`;
      return item;
    }));
    elements.aiContextSummary.textContent = request ? summarizeAIRequestContext(request) : "De briefing wordt nog voorbereid.";
    const assets = state.relationshipContext?.assets || [];
    elements.aiAssets.replaceChildren(...(assets.length ? assets : [{ name: "Geen goedgekeurde assets gekoppeld" }]).map((asset) => {
      const chip = document.createElement("span");
      chip.className = "social-studio-context-chip";
      chip.textContent = asset.name || asset.fileName || asset.label || "Merkasset";
      return chip;
    }));
  }

  function renderAIReview() {
    const request = state.aiRequest;
    if (!request) {
      elements.aiReview.textContent = "Vul eerst de briefing in.";
      return;
    }
    elements.aiReview.replaceChildren();
    const title = document.createElement("strong");
    const detail = document.createElement("p");
    title.textContent = `${request.topic} · ${platformLabels[request.platform] || request.platform}`;
    detail.textContent = `${request.objective} voor ${request.audience}. ${summarizeAIRequestContext(request)}`;
    elements.aiReview.append(title, detail);
  }

  async function generateAIPreview() {
    const result = collectAIRequest();
    if (!result.valid) {
      setAIMessage(result.errors[0]?.message || "De briefing is nog niet compleet.", "error");
      return;
    }
    state.aiRequest = result.request;
    elements.aiGenerate.disabled = true;
    elements.aiGenerate.textContent = "Concept wordt opgebouwd…";
    setAIMessage("Lokale regels bouwen je concept op…");
    try {
      state.aiOutput = await aiAdapter.generate(state.aiRequest, { variation: state.aiVariation });
      state.aiAcceptedFields.clear();
      setAIMessage("Concept gereed. Bekijk en bewerk ieder onderdeel bewust.", "success");
      renderAIOutput();
    } catch (error) {
      setAIMessage(error.message || "Het lokale concept kon niet worden opgebouwd.", "error");
    } finally {
      elements.aiGenerate.disabled = false;
      elements.aiGenerate.textContent = state.aiOutput ? "Maak een nieuwe variant" : "Genereer lokaal concept";
    }
  }

  function serializeAIField(field, value) {
    return aiListFields.has(field) ? (Array.isArray(value) ? value : []).join("\n") : String(value || "");
  }

  function parseAIField(field, value) {
    if (!aiListFields.has(field)) return String(value || "").trim();
    return String(value || "").split(field === "hashtags" ? /[\s\n]+/ : /\n+/).map((item) => item.trim()).filter(Boolean);
  }

  function applyAIFieldToEditor(field) {
    if (!state.aiOutput) return;
    const value = state.aiOutput[field];
    const editorFields = {
      hookVariants: [elements.title, Array.isArray(value) ? value[0] : value],
      caption: [elements.caption, value],
      cta: [elements.cta, value],
      hashtags: [elements.hashtags, Array.isArray(value) ? value.join(" ") : value],
      imagePrompt: [elements.imagePrompt, value],
    };
    if (editorFields[field]) editorFields[field][0].value = editorFields[field][1] || "";
    state.aiAcceptedFields.add(field);
    updateAll();
    renderAIOutput();
    setAIMessage(`${aiFieldLabels[field]} gekozen voor de editor.`, "success");
  }

  async function regenerateAIField(field) {
    if (!state.aiRequest || !state.aiOutput) return;
    state.aiVariation += 1;
    try {
      const variation = await aiAdapter.generate(state.aiRequest, { variation: state.aiVariation });
      state.aiOutput[field] = variation[field];
      state.aiAcceptedFields.delete(field);
      renderAIOutput();
      setAIMessage(`Nieuwe variant voor ${aiFieldLabels[field].toLowerCase()} gemaakt.`, "success");
    } catch (error) {
      setAIMessage(error.message || "Nieuwe variant maken is niet gelukt.", "error");
    }
  }

  function renderAIOutput() {
    elements.aiOutput.replaceChildren();
    if (!state.aiOutput) {
      elements.aiOutput.textContent = "Er is nog geen concept gegenereerd.";
      return;
    }
    AI_OUTPUT_FIELDS.forEach((field) => {
      const card = document.createElement("article");
      card.className = "social-studio-ai-output-card";
      card.dataset.aiField = field;
      if (field === "claimWarnings") card.classList.add("is-warning");
      const header = document.createElement("header");
      const label = document.createElement("strong");
      const accepted = document.createElement("span");
      label.textContent = aiFieldLabels[field] || field;
      accepted.textContent = state.aiAcceptedFields.has(field) ? "Gekozen" : "Vrij concept";
      header.append(label, accepted);
      const textarea = document.createElement("textarea");
      textarea.value = serializeAIField(field, state.aiOutput[field]);
      textarea.setAttribute("aria-label", aiFieldLabels[field] || field);
      textarea.addEventListener("input", () => {
        state.aiOutput[field] = parseAIField(field, textarea.value);
        state.aiAcceptedFields.delete(field);
        accepted.textContent = "Aangepast · opnieuw kiezen";
      });
      const actions = document.createElement("div");
      actions.className = "social-studio-ai-output-actions";
      const use = document.createElement("button");
      use.type = "button";
      use.className = "button primary";
      use.textContent = state.aiAcceptedFields.has(field) ? "Gekozen voor editor" : "Gebruik in editor";
      use.addEventListener("click", () => applyAIFieldToEditor(field));
      const variant = document.createElement("button");
      variant.type = "button";
      variant.className = "button secondary";
      variant.textContent = "Nieuwe variant";
      variant.addEventListener("click", () => regenerateAIField(field));
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "button secondary";
      copy.textContent = "Kopieer";
      copy.addEventListener("click", () => copyToClipboard(serializeAIField(field, state.aiOutput[field]), `${aiFieldLabels[field]} gekopieerd.`));
      actions.append(use, variant, copy);
      card.append(header, textarea, actions);
      elements.aiOutput.append(card);
    });
  }

  function renderAIFinish() {
    const chosen = [...state.aiAcceptedFields].map((field) => aiFieldLabels[field]).join(", ");
    elements.aiFinish.textContent = chosen
      ? `Gekozen voor de editor: ${chosen}. De volledige lokale preview blijft als herkomstinformatie bij het concept bewaard.`
      : "Kies eerst minimaal één onderdeel voor de editor.";
    elements.aiOpenEditor.disabled = !state.aiAcceptedFields.size;
  }

  function openAIConceptInEditor() {
    if (!state.aiRequest || !state.aiOutput || !state.aiAcceptedFields.size) {
      setAIMessage("Kies eerst minimaal één onderdeel voor de editor.", "error");
      return;
    }
    const type = contentTypes.find((item) => item.id === state.aiRequest.contentType) || contentTypes[0];
    const requestPlatform = state.aiRequest.platform;
    state.contentType = type.id;
    state.platform = platformLabels[requestPlatform] ? requestPlatform : type.platform;
    state.activeMasterId = null;
    state.editingVariantId = null;
    state.variantDetails = {};
    elements.selectedType.textContent = `${type.label} · lokaal AI-concept`;
    elements.campaign.value = state.aiRequest.campaign || elements.campaign.value;
    elements.tone.value = state.aiRequest.toneOfVoice[0] || elements.tone.value;
    elements.visualFormat.value = type.visualFormat;
    elements.aiCreator.hidden = true;
    elements.workbench.hidden = false;
    elements.skeleton.hidden = true;
    updatePlatformButtons();
    updateAll();
    scheduleAutosave();
    elements.title.focus({ preventScroll: true });
    elements.workbench.scrollIntoView({ behavior: "smooth", block: "start" });
    setMessage("Gekozen AI-onderdelen staan in de editor; niets is automatisch gepubliceerd.", "success");
  }

  function openContentWorkflow(typeId) {
    const type = contentTypes.find((item) => item.id === typeId);
    if (!type) return;
    state.aiRequest = null;
    state.aiOutput = null;
    state.aiAcceptedFields.clear();
    state.activeMasterId = null;
    state.editingVariantId = null;
    state.variantDetails = {};
    const [title, caption, cta, hashtags] = contentTypeSeeds[type.id] || contentTypeSeeds["instagram-post"];
    state.contentType = type.id;
    state.platform = type.platform;
    elements.selectedType.textContent = type.label;
    elements.start.hidden = true;
    elements.stage.hidden = false;
    elements.aiCreator.hidden = true;
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
      elements.workbench.scrollIntoView({ behavior: "smooth", block: "start" });
      scheduleAutosave();
    }, 320);
  }

  function returnToStart() {
    window.clearTimeout(autosaveTimer);
    elements.stage.hidden = true;
    elements.workbench.hidden = true;
    elements.skeleton.hidden = true;
    elements.aiCreator.hidden = true;
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
    const qualityIssues = analyzeContentQuality(content, { scopeId: state.scopeId, brandVoice: state.brandVoice, relationshipContext: state.relationshipContext });
    const qualityScore = contentQualityScore(qualityIssues);
    const checks = [
      [`Kwaliteit ${qualityScore}/100`, qualityIssues.length === 0, qualityIssues.length ? `${qualityIssues.length} aandachtspunt${qualityIssues.length === 1 ? "" : "en"}; adviserend en altijd bewerkbaar.` : "Deze versie heeft geen directe aandachtspunten."],
      ["Titel aanwezig", !!content.title, "Geeft intern en in exports duidelijke context."],
      ["Caption gevuld", !!content.caption, "De hoofdtekst is nodig voordat je kunt publiceren."],
      ["CTA aanwezig", !!content.cta, "Elke post moet een heldere vervolgstap hebben."],
      ["Lengte passend", content.caption.length <= rule.max, `Maximaal ${rule.max} tekens voor ${platformLabels[state.platform]}.`],
      ["Hashtags passend", hashtagCount >= rule.hashtagMin && hashtagCount <= rule.hashtagMax, `Aanbevolen: ${rule.hashtagMin}-${rule.hashtagMax} hashtags.`],
      ["Link of actie", !!content.link || !!content.cta, "Nodig voor campagneposts en advertenties."],
      ["Visual format", !!content.visualFormat, `${rule.visual} werkt het best.`],
    ];
    const checkCards = checks.map(([title, done, detail]) => {
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
    });
    const issueCards = qualityIssues.map((qualityIssue) => {
      const item = document.createElement("article");
      item.className = `social-studio-check ${qualityIssue.severity === "safety" ? "is-safety" : "is-warning"}`;
      const copy = document.createElement("div");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = qualityIssue.severity === "safety" ? "Veiligheidscontrole" : "Suggestie";
      span.textContent = qualityIssue.message;
      copy.append(strong, span);
      item.append(copy);
      return item;
    });
    elements.platformChecks.replaceChildren(...checkCards, ...issueCards);
  }

  function updateHero() {
    const filteredCount = filteredVariants().length;
    const readyCount = state.variants.filter((variant) => normalizeStatus(variant.status) === "ready").length;
    if (!state.variants.length) {
      elements.heroCount.textContent = "Klaar voor iets moois";
      elements.heroDetail.textContent = "Kies een format en laat Social Studio de creatieve basis voor je klaarzetten.";
      renderStartDashboard();
      return;
    }
    elements.heroCount.textContent = `${state.variants.length} ${state.variants.length === 1 ? "creatie" : "creaties"}`;
    elements.heroDetail.textContent = `${filteredCount} zichtbaar · ${readyCount} klaar voor publicatie. Laatst bijgewerkt: ${formatDate(new Date().toISOString().slice(0, 10))}.`;
    renderStartDashboard();
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

  function renderPlatformVariantSwitcher() {
    const linked = state.activeMasterId ? variantsForMaster(state.variants, state.activeMasterId) : [];
    elements.platformVariantSwitcher.replaceChildren();
    if (!linked.length) {
      const empty = document.createElement("span");
      empty.className = "social-studio-workbench-label";
      empty.textContent = "Nog geen gekoppelde varianten";
      elements.platformVariantSwitcher.append(empty);
      elements.masterSummary.textContent = "Maak eerst een sterke basis. Iedere platformversie blijft daarna zelfstandig bewerkbaar.";
      return;
    }
    const master = state.masters.find((item) => item.id === state.activeMasterId);
    elements.masterSummary.textContent = `${master?.title || "Master concept"} · bronrevisie ${master?.revision || 1} · ${linked.length} zelfstandig bewerkbare varianten.`;
    PLATFORM_VARIANT_PROFILES.forEach((profile) => {
      const variant = linked.find((item) => item.variantKey === profile.key);
      if (!variant) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary";
      button.classList.toggle("is-active", state.editingVariantId === variant.id);
      button.textContent = profile.label;
      button.setAttribute("aria-pressed", String(state.editingVariantId === variant.id));
      button.addEventListener("click", () => loadVariant(variant));
      elements.platformVariantSwitcher.append(button);
    });
  }

  function createPlatformVariantFamily() {
    const content = getCurrentContent();
    const fallback = platformFallbacks[state.platform];
    const master = createMasterConcept({
      ...content,
      id: `master-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: content.title || fallback.title,
      caption: content.caption || fallback.caption,
      cta: content.cta || fallback.cta,
      hashtags: content.hashtags || fallback.hashtags,
      extensions: { ...(content.extensions || {}), sourceContentType: content.contentType },
    });
    const linked = generatePlatformVariants(master);
    state.masters = [master, ...state.masters].slice(0, 50);
    state.variants = [...linked, ...state.variants].slice(0, 150);
    state.activeMasterId = master.id;
    state.editingVariantId = linked[0].id;
    const mastersSaved = writeJson(storageKeys.masters, state.masters);
    const variantsSaved = writeJson(storageKeys.variants, state.variants);
    setFormContent(linked[0]);
    renderVariants();
    updateHero();
    setMessage(mastersSaved && variantsSaved
      ? "Master concept bewaard en zeven gekoppelde platformvarianten gemaakt."
      : "De platformvarianten konden niet volledig lokaal worden bewaard.", mastersSaved && variantsSaved ? "success" : "error");
  }

  function saveVariant() {
    const content = getCurrentContent();
    const fallback = platformFallbacks[state.platform];
    const editing = state.editingVariantId ? state.variants.find((item) => item.id === state.editingVariantId) : null;
    const variant = normalizeContentItem({
      ...(editing || {}),
      ...content,
      id: editing?.id || `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      revision: editing ? editing.revision + 1 : 1,
      scopeId: content.scopeId,
      contentType: content.contentType,
      platform: content.platform,
      title: content.title || fallback.title,
      caption: content.caption || fallback.caption,
      imagePrompt: content.imagePrompt,
      visualDirection: content.visualDirection,
      altText: content.altText,
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
      extensions: content.extensions,
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    state.variants = editing
      ? state.variants.map((item) => item.id === editing.id ? variant : item)
      : [variant, ...state.variants].slice(0, 150);
    const saved = writeJson(storageKeys.variants, state.variants);
    renderVariants();
    renderPlatformVariantSwitcher();
    updateHero();
    setMessage(saved ? (editing ? `Platformvariant opgeslagen als revisie ${variant.revision}.` : "Variant opgeslagen.") : "Variant kon niet lokaal worden opgeslagen.", saved ? "success" : "error");
  }

  async function copyText() {
    await copyToClipboard(buildCopyText(), "Tekst gekopieerd naar klembord.");
  }

  function resetEditor() {
    state.editingVariantId = null;
    state.activeMasterId = null;
    state.variantDetails = {};
    setFormContent({ platform: state.platform, tone: "Professioneel", date: elements.date.value, visualFormat: elements.visualFormat.value });
    repository.remove(storageKeys.draft);
    setMessage("Editor gereset.", "success");
  }

  function removeVariant(id) {
    state.variants = state.variants.filter((variant) => variant.id !== id);
    writeJson(storageKeys.variants, state.variants);
    renderVariants();
    if (state.editingVariantId === id) state.editingVariantId = null;
    renderPlatformVariantSwitcher();
    updateHero();
    setMessage("Variant verwijderd.", "success");
  }

  function duplicateVariant(variant) {
    const copy = normalizeContentItem({
      ...variant,
      id: `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      contentRole: "master",
      masterId: null,
      variantKey: null,
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
    if (variant.scopeId && variant.scopeId !== state.scopeId) {
      setMessage("Deze content hoort bij een andere werkruimte en is niet geladen.", "error");
      return;
    }
    setFormContent(variant);
    const profile = PLATFORM_VARIANT_PROFILES.find((item) => item.key === variant.variantKey);
    elements.selectedType.textContent = profile ? `${profile.label} · gekoppeld aan master` : (contentTypes.find((item) => item.id === variant.contentType)?.label || "Opgeslagen concept");
    setMessage(profile ? "Gekoppelde platformvariant geladen. Andere varianten blijven onaangeroerd." : "Variant geladen in editor.", "success");
    elements.workbench.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function archiveVariant(id) {
    let restored = false;
    state.variants = state.variants.map((variant) => {
      if (variant.id !== id) return variant;
      restored = variant.status === "archived";
      return { ...variant, status: restored ? "draft" : "archived", updatedAt: new Date().toISOString() };
    });
    writeJson(storageKeys.variants, state.variants);
    renderVariants();
    updateHero();
    setMessage(restored ? "Content hersteld als concept." : "Content gearchiveerd en lokaal bewaard.", "success");
  }

  function reuseVariant(variant) {
    const reused = normalizeContentItem({
      ...variant,
      id: `content-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      contentRole: "master",
      masterId: null,
      variantKey: null,
      status: "draft",
      revision: 1,
      sourceRevision: variant.revision || 1,
      title: `${variant.title || "Concept"} · hergebruik`,
      publication: {},
      extensions: { ...(variant.extensions || {}), reusedFrom: variant.id },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    state.variants.unshift(reused);
    writeJson(storageKeys.variants, state.variants);
    loadVariant(reused);
    renderVariants();
    updateHero();
    setMessage("Content hergebruikt als nieuw, onafhankelijk concept.", "success");
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
    meta.textContent = `${platformLabels[variant.platform] || "Platform"} · ${variant.client || "Geen klant"} · revisie ${variant.revision || 1} · ${formatDate(variant.publication?.date || variant.date || variant.createdAt)} · ${variant.cta || "Geen CTA"}`;
    caption.textContent = variant.caption || "Geen tekst opgeslagen.";
    status.className = "social-studio-status-badge";
    status.textContent = statusLabels[normalizeStatus(variant.status)];

    content.append(title, meta, caption, status);

    const actions = document.createElement("div");
    actions.className = "social-studio-actions";
    const workflowAction = actionButton(nextStatusLabel(variant), () => advanceVariantStatus(variant.id), "secondary");
    workflowAction.disabled = ["published", "cancelled", "archived"].includes(normalizeStatus(variant.status));
    actions.append(
      actionButton("Laden", () => loadVariant(variant), "primary"),
      actionButton("Kopieer", () => copyToClipboard(buildCopyText(variant), "Variant gekopieerd."), "secondary"),
      actionButton("Dupliceer", () => duplicateVariant(variant), "secondary"),
      actionButton("Hergebruik", () => reuseVariant(variant), "secondary"),
      workflowAction,
      actionButton(variant.status === "archived" ? "Herstel als concept" : "Archiveer", () => archiveVariant(variant.id), "secondary"),
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

  function fillDynamicFilter(select, values, allLabel, selectedValue) {
    const options = [["all", allLabel], ...[...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl")).map((value) => [value, value])];
    select.replaceChildren(...options.map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }));
    select.value = options.some(([value]) => value === selectedValue) ? selectedValue : "all";
  }

  function renderLibraryFilterOptions() {
    fillDynamicFilter(elements.campaignFilter, state.variants.map((variant) => variant.campaign), "Alle campagnes", state.campaignFilter);
    fillDynamicFilter(elements.clientFilter, state.variants.map((variant) => variant.client), "Alle relaties", state.clientFilter);
    fillDynamicFilter(elements.pillarFilter, state.variants.map((variant) => variant.brandVoiceSnapshot?.contentPillars?.[0] || variant.extensions?.contentPillar || ""), "Alle contentpijlers", state.pillarFilter);
    state.campaignFilter = elements.campaignFilter.value;
    state.clientFilter = elements.clientFilter.value;
    state.pillarFilter = elements.pillarFilter.value;
  }

  function filteredVariants() {
    const variants = state.variants.filter((variant) => {
      const matchesPlatform = state.variantFilter === "all" || variant.platform === state.variantFilter;
      const matchesStatus = state.statusFilter === "all" || normalizeStatus(variant.status) === state.statusFilter;
      const matchesCampaign = state.campaignFilter === "all" || variant.campaign === state.campaignFilter;
      const matchesClient = state.clientFilter === "all" || variant.client === state.clientFilter;
      const pillar = variant.brandVoiceSnapshot?.contentPillars?.[0] || variant.extensions?.contentPillar || "";
      const matchesPillar = state.pillarFilter === "all" || pillar === state.pillarFilter;
      const query = state.variantQuery.trim().toLowerCase();
      const haystack = JSON.stringify(variant).toLowerCase();
      return matchesPlatform && matchesStatus && matchesCampaign && matchesClient && matchesPillar && (!query || haystack.includes(query));
    });
    const direction = state.sortBy.endsWith("asc") ? 1 : -1;
    const field = state.sortBy.startsWith("publication") ? "publication" : "updated";
    return variants.sort((a, b) => {
      const left = field === "publication" ? (a.publication?.date || a.date || "") : (a.updatedAt || "");
      const right = field === "publication" ? (b.publication?.date || b.date || "") : (b.updatedAt || "");
      return left.localeCompare(right) * direction;
    });
  }

  function renderVariants() {
    renderPipeline();
    renderLibraryFilterOptions();
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
    const workflow = ["idea", "draft", "review", "approved", "scheduled", "published"];
    const currentIndex = workflow.indexOf(normalizeStatus(variant.status));
    if (currentIndex < 0 || currentIndex === workflow.length - 1) return "Status afgerond";
    return `Naar ${statusLabels[workflow[currentIndex + 1]].toLowerCase()}`;
  }

  function advanceVariantStatus(id) {
    state.variants = state.variants.map((variant) => {
      if (variant.id !== id) return variant;
      const workflow = ["idea", "draft", "review", "approved", "scheduled", "published"];
      const currentIndex = workflow.indexOf(normalizeStatus(variant.status));
      if (currentIndex < 0 || currentIndex === workflow.length - 1) return variant;
      const nextStatus = workflow[currentIndex + 1];
      return {
        ...variant,
        status: nextStatus,
        publication: nextStatus === "published" ? { ...(variant.publication || {}), date: variant.publication?.date || variant.date || defaultDate() } : variant.publication,
        updatedAt: new Date().toISOString(),
      };
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
      detail.textContent = status === "published" ? "Handmatig gemarkeerd als geplaatst" : "Opgeslagen contentvarianten";
      card.append(label, count, detail);
      return card;
    }));

    const scheduled = state.variants
      .filter((variant) => normalizeStatus(variant.status) === "scheduled" && variant.date)
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
      masters: state.masters,
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
        if (Array.isArray(parsed.masters)) {
          state.masters = parsed.masters.map(normalizeContentItem);
          writeJson(storageKeys.masters, state.masters);
        }
        if (Array.isArray(parsed.variants)) {
          state.variants = parsed.variants
            .filter((variant) => variant && variant.platform)
            .map(normalizeContentItem);
          writeJson(storageKeys.variants, state.variants);
        }
        renderVariants();
        renderPlatformVariantSwitcher();
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
    state.masters = [];
    state.activeMasterId = null;
    state.editingVariantId = null;
    repository.clearWorkspace();
    renderPlatformVariantSwitcher();
    renderVariants();
    updateHero();
    setMessage("Lokale Social Media Studio opslag gewist.", "success");
  }

  function generateSocialContent() {
    openAICreator();
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
    elements.showEditor.addEventListener("click", () => setMobileCanvas("editor"));
    elements.showPreview.addEventListener("click", () => setMobileCanvas("preview"));
    elements.copyEditorFields.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const field = elements[button.dataset.copyEditorField];
        copyToClipboard(field?.value?.trim() || "", `${button.dataset.copyEditorField === "imagePrompt" ? "Afbeelding prompt" : "Onderdeel"} gekopieerd.`);
      });
    });
    elements.aiForm.addEventListener("submit", (event) => event.preventDefault());
    elements.aiLaunch.addEventListener("click", openAICreator);
    elements.aiClose.addEventListener("click", returnToStart);
    elements.aiPrevious.addEventListener("click", () => {
      if (state.aiStep > 1) {
        state.aiStep -= 1;
        setAIMessage("");
        renderAIStepNavigation();
      }
    });
    elements.aiNext.addEventListener("click", () => {
      if (!validateCurrentAIStep()) return;
      if (state.aiStep < 6) {
        state.aiStep += 1;
        setAIMessage("");
        renderAIStepNavigation();
      }
    });
    elements.aiGenerate.addEventListener("click", () => {
      if (state.aiOutput) state.aiVariation += 1;
      generateAIPreview();
    });
    elements.aiOpenEditor.addEventListener("click", openAIConceptInEditor);
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

    [elements.client, elements.campaign, elements.goal, elements.date, elements.time, elements.status, elements.visualFormat, elements.publicUrl, elements.publicationNote, elements.title, elements.caption, elements.imagePrompt, elements.cta, elements.link, elements.hashtags, elements.tone].forEach((field) => {
      field.addEventListener("input", () => {
        updateAll();
        scheduleAutosave();
      });
      field.addEventListener("change", () => {
        updateAll();
        scheduleAutosave();
      });
    });
    elements.status.addEventListener("change", updatePublicationFields);

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
    elements.variantSort.addEventListener("change", () => {
      state.sortBy = elements.variantSort.value;
      renderVariants();
    });
    elements.campaignFilter.addEventListener("change", () => {
      state.campaignFilter = elements.campaignFilter.value;
      renderVariants();
    });
    elements.clientFilter.addEventListener("change", () => {
      state.clientFilter = elements.clientFilter.value;
      renderVariants();
    });
    elements.pillarFilter.addEventListener("change", () => {
      state.pillarFilter = elements.pillarFilter.value;
      renderVariants();
    });

    elements.saveDraft.addEventListener("click", saveDraft);
    elements.saveVariant.addEventListener("click", saveVariant);
    elements.createPlatformVariants.addEventListener("click", createPlatformVariantFamily);
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
    setMobileCanvas("editor");
    populateAICreatorOptions();
    fillPlatformFilter();
    fillStatusFilter();
    renderMoreWorkOffers();
    const legacyVariants = readJson(storageKeys.legacyVariants, []);
    state.variants = repository.loadVariants(Array.isArray(legacyVariants) ? legacyVariants : []);
    const storedMasters = readJson(storageKeys.masters, []);
    state.masters = Array.isArray(storedMasters) ? storedMasters.map(normalizeContentItem) : [];
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
    renderPlatformVariantSwitcher();
    updateHero();
  }

  window.generateSocialContent = generateSocialContent;
  window.publishSocialPost = publishSocialPost;

  init();
})();
