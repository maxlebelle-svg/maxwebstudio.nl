(function () {
  "use strict";

  const storageKeys = {
    draft: "mws_social_media_studio_draft",
    variants: "mws_social_media_studio_variants",
  };

  const platformLabels = {
    facebook: "Facebook",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    google: "Google Bedrijfspost",
    ad: "Advertentie",
  };

  const platformFallbacks = {
    facebook: {
      title: "Nieuwe update voor onze klanten",
      caption: "Deel een korte update, actie of klantverhaal dat past bij Facebook.",
      cta: "Bekijk de update",
      hashtags: "#facebook #lokaal #maxwebstudio",
    },
    instagram: {
      title: "Visual campagne",
      caption: "Schrijf een compacte caption die past bij een sterke visual.",
      cta: "Ontdek meer",
      hashtags: "#instagram #content #branding",
    },
    linkedin: {
      title: "Zakelijke update",
      caption: "Deel expertise, resultaat of een professionele klantcase.",
      cta: "Plan een gesprek",
      hashtags: "#linkedin #expertise #groei",
    },
    google: {
      title: "Lokale bedrijfspost",
      caption: "Vertel kort wat klanten nu kunnen doen of aanvragen.",
      cta: "Bel vandaag",
      hashtags: "#googlebedrijf #lokaal",
    },
    ad: {
      title: "Advertentiecampagne",
      caption: "Schrijf een heldere advertentietekst met probleem, belofte en actie.",
      cta: "Vraag offerte aan",
      hashtags: "#advertentie #campagne",
    },
  };

  const state = {
    platform: "facebook",
    variants: [],
  };

  const elements = {
    form: document.getElementById("social-studio-form"),
    platformButtons: Array.from(document.querySelectorAll(".social-studio-platform[data-platform]")),
    title: document.getElementById("social-title"),
    caption: document.getElementById("social-caption"),
    cta: document.getElementById("social-cta"),
    link: document.getElementById("social-link"),
    hashtags: document.getElementById("social-hashtags"),
    tone: document.getElementById("social-tone"),
    message: document.getElementById("social-studio-message"),
    previewCard: document.getElementById("social-preview-card"),
    previewHeading: document.getElementById("preview-heading"),
    previewPlatform: document.getElementById("preview-platform"),
    previewDate: document.getElementById("preview-date"),
    previewTitle: document.getElementById("preview-title"),
    previewCaption: document.getElementById("preview-caption"),
    previewCta: document.getElementById("preview-cta"),
    previewLink: document.getElementById("preview-link"),
    previewHashtags: document.getElementById("preview-hashtags"),
    previewTone: document.getElementById("preview-tone"),
    variantList: document.getElementById("variant-list"),
    saveDraft: document.getElementById("save-draft"),
    saveVariant: document.getElementById("save-variant"),
    copyText: document.getElementById("copy-text"),
    resetEditor: document.getElementById("reset-editor"),
    publishButton: document.getElementById("publish-social-post"),
  };

  function readJson(key, fallback) {
    try {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) return fallback;
      return JSON.parse(rawValue);
    } catch (error) {
      console.warn("Social Media Studio opslag kon niet worden gelezen.", error);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("Social Media Studio opslag kon niet worden bijgewerkt.", error);
      return false;
    }
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
    };
  }

  function setFormContent(content) {
    state.platform = content.platform && platformLabels[content.platform] ? content.platform : "facebook";
    elements.title.value = content.title || "";
    elements.caption.value = content.caption || "";
    elements.cta.value = content.cta || "";
    elements.link.value = content.link || "";
    elements.hashtags.value = content.hashtags || "";
    elements.tone.value = content.tone || "Professioneel";
    updatePlatformButtons();
    updatePreview();
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(value);
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

  function updatePreview() {
    const content = getCurrentContent();
    const fallback = platformFallbacks[state.platform];
    const label = platformLabels[state.platform];

    elements.previewCard.dataset.platform = state.platform;
    elements.previewHeading.textContent = `${label} preview`;
    elements.previewPlatform.textContent = label;
    elements.previewDate.textContent = formatDate(new Date());
    elements.previewTitle.textContent = content.title || fallback.title;
    elements.previewCaption.textContent = content.caption || fallback.caption;
    elements.previewCta.textContent = content.cta || fallback.cta;
    elements.previewLink.textContent = content.link || "maxwebstudio.nl";
    elements.previewHashtags.textContent = content.hashtags || fallback.hashtags;
    elements.previewTone.textContent = content.tone || "Professioneel";
  }

  function buildCopyText() {
    const content = getCurrentContent();
    const fallback = platformFallbacks[state.platform];
    const parts = [
      platformLabels[state.platform],
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
  }

  function saveVariant() {
    const content = getCurrentContent();
    const fallback = platformFallbacks[state.platform];
    const variant = {
      id: `variant-${Date.now()}`,
      platform: content.platform,
      title: content.title || fallback.title,
      caption: content.caption || fallback.caption,
      cta: content.cta || fallback.cta,
      link: content.link,
      hashtags: content.hashtags || fallback.hashtags,
      tone: content.tone,
      createdAt: new Date().toISOString(),
    };

    state.variants = [variant, ...state.variants].slice(0, 50);
    const saved = writeJson(storageKeys.variants, state.variants);
    renderVariants();
    setMessage(saved ? "Variant opgeslagen." : "Variant kon niet lokaal worden opgeslagen.", saved ? "success" : "error");
  }

  async function copyText() {
    const text = buildCopyText();
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
      setMessage("Tekst gekopieerd naar klembord.", "success");
    } catch (error) {
      console.warn("Kopiëren is mislukt.", error);
      setMessage("Kopiëren is niet gelukt. Selecteer de tekst handmatig.", "error");
    }
  }

  function resetEditor() {
    setFormContent({ platform: state.platform, tone: "Professioneel" });
    localStorage.removeItem(storageKeys.draft);
    setMessage("Editor gereset.", "success");
  }

  function removeVariant(id) {
    state.variants = state.variants.filter((variant) => variant.id !== id);
    writeJson(storageKeys.variants, state.variants);
    renderVariants();
    setMessage("Variant verwijderd.", "success");
  }

  function createVariantCard(variant) {
    const card = document.createElement("article");
    card.className = "social-studio-variant";

    const content = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const caption = document.createElement("small");

    title.textContent = variant.title || "Naamloze variant";
    meta.textContent = `${platformLabels[variant.platform] || "Platform"} · ${formatDate(new Date(variant.createdAt || Date.now()))} · ${variant.cta || "Geen CTA"}`;
    caption.textContent = variant.caption || "Geen tekst opgeslagen.";

    content.append(title, meta, caption);

    const button = document.createElement("button");
    button.className = "button secondary";
    button.type = "button";
    button.textContent = "Verwijderen";
    button.addEventListener("click", () => removeVariant(variant.id));

    card.append(content, button);
    return card;
  }

  function renderVariants() {
    elements.variantList.textContent = "";

    if (!state.variants.length) {
      const empty = document.createElement("p");
      empty.className = "social-studio-empty";
      empty.textContent = "Nog geen varianten opgeslagen. Bewaar een variant om hem hier terug te zien.";
      elements.variantList.append(empty);
      return;
    }

    state.variants.forEach((variant) => {
      elements.variantList.append(createVariantCard(variant));
    });
  }

  function generateSocialContent() {
    // Future hook: send editor context to a Netlify Function that calls OpenAI.
    // Future hook: enrich the prompt with customer/brand data loaded from Supabase.
    setMessage("AI-generatie wordt later gekoppeld.", "success");
    return getCurrentContent();
  }

  function publishSocialPost() {
    // Future hook: validate approval status and send payload to platform publication APIs.
    // Future hook: write publication state and audit metadata back to Supabase.
    setMessage("Publiceren wordt later gekoppeld.", "success");
  }

  function bindEvents() {
    elements.platformButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.platform = button.dataset.platform;
        updatePlatformButtons();
        updatePreview();
      });
    });

    [elements.title, elements.caption, elements.cta, elements.link, elements.hashtags, elements.tone].forEach((field) => {
      field.addEventListener("input", updatePreview);
      field.addEventListener("change", updatePreview);
    });

    elements.saveDraft.addEventListener("click", saveDraft);
    elements.saveVariant.addEventListener("click", saveVariant);
    elements.copyText.addEventListener("click", copyText);
    elements.resetEditor.addEventListener("click", resetEditor);
    elements.publishButton.addEventListener("click", publishSocialPost);
  }

  function init() {
    state.variants = readJson(storageKeys.variants, []);
    const draft = readJson(storageKeys.draft, null);
    if (draft) {
      setFormContent(draft);
    } else {
      updatePlatformButtons();
      updatePreview();
    }
    renderVariants();
    bindEvents();
  }

  window.generateSocialContent = generateSocialContent;
  window.publishSocialPost = publishSocialPost;

  init();
})();
