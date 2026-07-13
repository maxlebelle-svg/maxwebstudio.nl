import {
  CONTENT_STATUSES,
  createWorkspaceEnvelope,
  normalizeContentItem,
  normalizeStatus as normalizeContentStatus,
} from "./social-studio/core.mjs";
import { LocalSocialStudioRepository } from "./social-studio/local-repository.mjs";

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

  const platformLabels = {
    facebook: "Facebook",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    google: "Google Bedrijfspost",
    ad: "Advertentie",
  };

  const statusLabels = Object.fromEntries(CONTENT_STATUSES.map(({ id, label }) => [id, label]));

  const statusOrder = Object.keys(statusLabels);

  const platformRules = {
    facebook: { max: 63206, ideal: 280, hashtagMin: 0, hashtagMax: 5, visual: "Liggend of vierkant" },
    instagram: { max: 2200, ideal: 180, hashtagMin: 3, hashtagMax: 12, visual: "Vierkant of staand" },
    linkedin: { max: 3000, ideal: 420, hashtagMin: 1, hashtagMax: 5, visual: "Liggend of vierkant" },
    google: { max: 1500, ideal: 300, hashtagMin: 0, hashtagMax: 3, visual: "Liggend of vierkant" },
    ad: { max: 500, ideal: 140, hashtagMin: 0, hashtagMax: 2, visual: "Campagnevisual" },
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

  const state = {
    platform: "facebook",
    variants: [],
    variantQuery: "",
    variantFilter: "all",
    statusFilter: "all",
  };

  const elements = {
    platformButtons: Array.from(document.querySelectorAll(".social-studio-platform[data-platform]")),
    templateButtons: Array.from(document.querySelectorAll("[data-template]")),
    client: document.getElementById("social-client"),
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

  function fillStatusFilter() {
    elements.statusFilter.replaceChildren();
    [["all", "Alle statussen"], ...Object.entries(statusLabels)].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      elements.statusFilter.append(option);
    });
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
      platform: state.platform,
      title: elements.title.value.trim(),
      caption: elements.caption.value.trim(),
      cta: elements.cta.value.trim(),
      link: elements.link.value.trim(),
      hashtags: elements.hashtags.value.trim(),
      tone: elements.tone.value,
      ...getContext(),
    };
  }

  function setFormContent(content) {
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
    elements.heroCount.textContent = `${state.variants.length} ${state.variants.length === 1 ? "variant" : "varianten"}`;
    const readyCount = state.variants.filter((variant) => normalizeStatus(variant.status) === "ready").length;
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
    const saved = writeJson(storageKeys.draft, {
      ...getCurrentContent(),
      updatedAt: new Date().toISOString(),
    });
    setMessage(saved ? "Concept lokaal opgeslagen." : "Concept kon niet lokaal worden opgeslagen.", saved ? "success" : "error");
    updateHero();
  }

  function saveVariant() {
    const content = getCurrentContent();
    const fallback = platformFallbacks[state.platform];
    const variant = normalizeContentItem({
      id: `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      platform: content.platform,
      title: content.title || fallback.title,
      caption: content.caption || fallback.caption,
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

    [elements.client, elements.campaign, elements.goal, elements.date, elements.time, elements.status, elements.visualFormat, elements.title, elements.caption, elements.cta, elements.link, elements.hashtags, elements.tone].forEach((field) => {
      field.addEventListener("input", updateAll);
      field.addEventListener("change", updateAll);
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
  }

  function init() {
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
    renderVariants();
    updateHero();
  }

  window.generateSocialContent = generateSocialContent;
  window.publishSocialPost = publishSocialPost;

  init();
})();
