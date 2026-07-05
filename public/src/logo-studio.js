"use strict";

(() => {
  const DRAFT_KEY = "maxwebstudioLogoStudioDraft";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STYLE_LABELS = {
    premium: "Premium",
    modern: "Modern",
    speels: "Speels",
    minimalistisch: "Minimalistisch",
    zakelijk: "Zakelijk",
  };
  const COLOR_PALETTES = {
    automatisch: ["#08111f", "#61d4ff", "#d7b46a", "#f7f8fb"],
    "donker-premium": ["#050b14", "#15233a", "#d7b46a", "#f7f8fb"],
    "blauw-vertrouwen": ["#07162c", "#2563eb", "#61d4ff", "#f8fbff"],
    "groen-groei": ["#071a14", "#16a36d", "#8ff0bf", "#f4fff9"],
    "goud-luxe": ["#11100c", "#7a5b21", "#d7b46a", "#fff7df"],
    "rood-energie": ["#1d0808", "#dc332d", "#ff8d74", "#fff5f2"],
  };

  const form = document.querySelector("#logo-studio-form");
  const conceptGrid = document.querySelector("#concept-grid");
  const emptyState = document.querySelector("#empty-state");
  const formError = document.querySelector("#form-error");
  const toast = document.querySelector("#studio-toast");
  const draftIndicator = document.querySelector("#draft-indicator");
  const regenerateButton = document.querySelector("#regenerate-concepts");
  const clearDraftButton = document.querySelector("#clear-draft");

  let currentDraft = {
    briefing: null,
    concepts: [],
    chosenConcept: null,
  };
  let toastTimer = null;

  const safeStorage = {
    read() {
      try {
        return window.localStorage.getItem(DRAFT_KEY);
      } catch (error) {
        return null;
      }
    },
    write(value) {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    },
    remove() {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch (error) {
        return false;
      }
      return true;
    },
  };

  function getValue(selector) {
    const field = document.querySelector(selector);
    return field ? field.value.trim() : "";
  }

  function setValue(selector, value) {
    const field = document.querySelector(selector);
    if (field) {
      field.value = value || "";
    }
  }

  function getBriefing() {
    return {
      companyName: getValue("#company-name"),
      industry: getValue("#industry"),
      slogan: getValue("#slogan"),
      audience: getValue("#audience"),
      styleChoice: getValue("#style-choice") || "premium",
      colorChoice: getValue("#color-choice") || "automatisch",
    };
  }

  function validateBriefing(briefing) {
    if (!briefing.companyName) {
      return "Vul eerst een bedrijfsnaam in.";
    }

    return "";
  }

  function initialsFromName(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "MW";
  }

  function paletteForChoice(choice, index) {
    if (choice !== "automatisch") {
      return COLOR_PALETTES[choice] || COLOR_PALETTES.automatisch;
    }

    const automatic = [
      COLOR_PALETTES["donker-premium"],
      COLOR_PALETTES["blauw-vertrouwen"],
      COLOR_PALETTES["goud-luxe"],
      COLOR_PALETTES["groen-groei"],
      COLOR_PALETTES["rood-energie"],
    ];
    return automatic[index % automatic.length];
  }

  function buildConcepts(briefing) {
    const base = [
      {
        id: "premium",
        label: "Concept 1: Premium",
        mood: "premium",
        description: "Een rijke, rustige identiteit met stevige typografie en een exclusieve uitstraling voor vertrouwen vanaf het eerste contact.",
      },
      {
        id: "modern",
        label: "Concept 2: Modern",
        mood: "modern",
        description: "Een scherp en eigentijds concept met heldere lijnen, geschikt voor een merk dat professioneel en vooruitstrevend wil voelen.",
      },
      {
        id: "creatief",
        label: "Concept 3: Creatief",
        mood: "creatief",
        description: "Een expressiever logo met meer beweging en karakter, ideaal wanneer het merk direct herkenbaar en energiek mag zijn.",
      },
    ];

    const styleLabel = STYLE_LABELS[briefing.styleChoice] || "Premium";
    const industryText = briefing.industry ? ` voor ${briefing.industry}` : "";

    return base.map((concept, index) => ({
      ...concept,
      companyName: briefing.companyName,
      slogan: briefing.slogan,
      initials: initialsFromName(briefing.companyName),
      palette: paletteForChoice(briefing.colorChoice, index),
      description: `${concept.description} Afgestemd op ${styleLabel.toLowerCase()}${industryText}.`,
    }));
  }

  function saveDraft() {
    safeStorage.write(currentDraft);
    updateDraftIndicator();
  }

  function updateDraftIndicator() {
    if (!currentDraft.briefing && currentDraft.concepts.length === 0) {
      draftIndicator.textContent = "Geen draft";
      return;
    }

    draftIndicator.textContent = currentDraft.chosenConcept ? "Draft met gekozen logo" : "Draft opgeslagen";
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  }

  function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function addSvgText(svg, text, attributes) {
    const textElement = createSvgElement("text", attributes);
    textElement.textContent = text;
    svg.appendChild(textElement);
  }

  function buildLogoSvg(concept) {
    const [background, primary, accent, light] = concept.palette;
    const svg = createSvgElement("svg", {
      viewBox: "0 0 420 300",
      xmlns: SVG_NS,
      role: "img",
      "aria-label": `${concept.companyName} logo preview`,
    });

    svg.appendChild(createSvgElement("rect", { width: "420", height: "300", rx: "28", fill: background }));

    if (concept.mood === "premium") {
      svg.appendChild(createSvgElement("circle", { cx: "210", cy: "104", r: "58", fill: primary, opacity: "0.22" }));
      svg.appendChild(createSvgElement("rect", { x: "158", y: "52", width: "104", height: "104", rx: "28", fill: "none", stroke: accent, "stroke-width": "6" }));
      svg.appendChild(createSvgElement("path", { d: "M172 147 L210 62 L248 147", fill: "none", stroke: light, "stroke-width": "7", "stroke-linecap": "round", "stroke-linejoin": "round" }));
    } else if (concept.mood === "modern") {
      svg.appendChild(createSvgElement("path", { d: "M116 90 H250 C286 90 310 114 310 150 C310 186 286 210 250 210 H116 Z", fill: primary, opacity: "0.28" }));
      svg.appendChild(createSvgElement("path", { d: "M145 186 L205 72 L265 186", fill: "none", stroke: accent, "stroke-width": "10", "stroke-linecap": "round", "stroke-linejoin": "round" }));
      svg.appendChild(createSvgElement("line", { x1: "176", y1: "151", x2: "234", y2: "151", stroke: light, "stroke-width": "8", "stroke-linecap": "round" }));
    } else {
      svg.appendChild(createSvgElement("circle", { cx: "162", cy: "104", r: "46", fill: primary, opacity: "0.38" }));
      svg.appendChild(createSvgElement("circle", { cx: "244", cy: "126", r: "58", fill: accent, opacity: "0.24" }));
      svg.appendChild(createSvgElement("path", { d: "M150 164 C190 78 236 226 276 118", fill: "none", stroke: light, "stroke-width": "9", "stroke-linecap": "round" }));
    }

    addSvgText(svg, concept.initials, {
      x: "210",
      y: "128",
      fill: light,
      "font-size": "48",
      "font-weight": "900",
      "text-anchor": "middle",
      "font-family": "Inter, Arial, sans-serif",
    });
    addSvgText(svg, concept.companyName, {
      x: "210",
      y: "222",
      fill: light,
      "font-size": "30",
      "font-weight": "900",
      "text-anchor": "middle",
      "font-family": "Inter, Arial, sans-serif",
    });

    if (concept.slogan) {
      addSvgText(svg, concept.slogan, {
        x: "210",
        y: "250",
        fill: accent,
        "font-size": "15",
        "font-weight": "700",
        "text-anchor": "middle",
        "font-family": "Inter, Arial, sans-serif",
      });
    }

    return svg;
  }

  function serializeSvg(concept) {
    const svg = buildLogoSvg(concept);
    return new XMLSerializer().serializeToString(svg);
  }

  function downloadSvg(concept) {
    const svgText = serializeSvg(concept);
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = concept.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "logo";

    link.href = url;
    link.download = `${safeName}-${concept.id}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderConcepts() {
    conceptGrid.textContent = "";
    emptyState.hidden = currentDraft.concepts.length > 0;

    currentDraft.concepts.forEach((concept) => {
      const isSelected = currentDraft.chosenConcept === concept.id;
      const card = document.createElement("article");
      card.className = isSelected ? "concept-card is-selected" : "concept-card";

      const preview = document.createElement("div");
      preview.className = "logo-preview";
      preview.appendChild(buildLogoSvg(concept));

      const content = document.createElement("div");
      content.className = "concept-content";

      const titleRow = document.createElement("div");
      titleRow.className = "concept-title-row";

      const title = document.createElement("h3");
      title.className = "concept-name";
      title.textContent = concept.label;

      const badge = document.createElement("span");
      badge.className = "concept-badge";
      badge.textContent = isSelected ? "Gekozen" : "Concept";

      titleRow.append(title, badge);

      const company = document.createElement("strong");
      company.textContent = concept.companyName;

      const slogan = document.createElement("p");
      slogan.className = "concept-slogan";
      slogan.textContent = concept.slogan || "";
      slogan.hidden = !concept.slogan;

      const description = document.createElement("p");
      description.className = "concept-description";
      description.textContent = concept.description;

      const palette = document.createElement("div");
      palette.className = "palette";
      concept.palette.forEach((color) => {
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.backgroundColor = color;
        swatch.title = color;
        palette.appendChild(swatch);
      });

      const actions = document.createElement("div");
      actions.className = "concept-actions";

      const chooseButton = document.createElement("button");
      chooseButton.className = "studio-button secondary";
      chooseButton.type = "button";
      chooseButton.textContent = "Kies dit logo";
      chooseButton.addEventListener("click", () => chooseConcept(concept.id));

      const downloadButton = document.createElement("button");
      downloadButton.className = "studio-button ghost";
      downloadButton.type = "button";
      downloadButton.textContent = "Download SVG";
      downloadButton.addEventListener("click", () => downloadSvg(concept));

      actions.append(chooseButton, downloadButton);
      content.append(titleRow, company, slogan, description, palette, actions);
      card.append(preview, content);
      conceptGrid.appendChild(card);
    });
  }

  function chooseConcept(conceptId) {
    currentDraft.chosenConcept = conceptId;
    saveDraft();
    renderConcepts();
    showToast("Logo concept gekozen");
  }

  function generateConcepts() {
    const briefing = getBriefing();
    const error = validateBriefing(briefing);

    formError.textContent = error;
    if (error) {
      return;
    }

    currentDraft = {
      briefing,
      concepts: buildConcepts(briefing),
      chosenConcept: null,
    };
    saveDraft();
    renderConcepts();
  }

  function fillForm(briefing) {
    if (!briefing) {
      return;
    }

    setValue("#company-name", briefing.companyName);
    setValue("#industry", briefing.industry);
    setValue("#slogan", briefing.slogan);
    setValue("#audience", briefing.audience);
    setValue("#style-choice", briefing.styleChoice || "premium");
    setValue("#color-choice", briefing.colorChoice || "automatisch");
  }

  function restoreDraft() {
    const rawDraft = safeStorage.read();
    if (!rawDraft) {
      updateDraftIndicator();
      return;
    }

    try {
      const parsed = JSON.parse(rawDraft);
      currentDraft = {
        briefing: parsed.briefing || null,
        concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
        chosenConcept: parsed.chosenConcept || null,
      };
      fillForm(currentDraft.briefing);
      renderConcepts();
      updateDraftIndicator();
    } catch (error) {
      currentDraft = { briefing: null, concepts: [], chosenConcept: null };
      updateDraftIndicator();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    generateConcepts();
  });

  regenerateButton.addEventListener("click", generateConcepts);

  clearDraftButton.addEventListener("click", () => {
    currentDraft = { briefing: null, concepts: [], chosenConcept: null };
    form.reset();
    formError.textContent = "";
    safeStorage.remove();
    renderConcepts();
    updateDraftIndicator();
  });

  restoreDraft();
})();
