const STORAGE_KEY_BASE = "maxwebstudio.seoStudioDraft.v1";
let activeRelationship = await window.ActiveRelationship?.whenReady?.();
let STORAGE_KEY = relationshipStorageKey(activeRelationship);

const initialState = {
  clientSite: "",
  targetUrl: "",
  pageType: "",
  pageGoal: "",
  audience: "",
  h1: "",
  cta: "",
  contentBrief: "",
  mainKeyword: "",
  keywords: [],
  seoTitle: "",
  metaDescription: "",
  faqs: [],
  schemaType: "",
  schemaPreparedAt: "",
};

let state = loadState();

function relationshipStorageKey(relationship) {
  const type = relationship?.relationshipType || relationship?.entityType;
  const id = relationship?.relationshipId || (type === "lead" ? relationship?.leadId : relationship?.customerId);
  return ["lead", "customer"].includes(type) && id ? `${STORAGE_KEY_BASE}:${type}:${id}` : "";
}

const nodes = {
  clientSite: document.getElementById("seo-client-site"),
  targetUrl: document.getElementById("seo-target-url"),
  saveDraft: document.getElementById("seo-save-draft"),
  exportDraft: document.getElementById("seo-export"),
  statusMessage: document.getElementById("seo-status-message"),
  tabs: [...document.querySelectorAll(".seo-studio-tab")],
  panels: [...document.querySelectorAll(".seo-studio-panel")],
  pageType: document.getElementById("seo-page-type"),
  pageGoal: document.getElementById("seo-page-goal"),
  audience: document.getElementById("seo-audience"),
  h1: document.getElementById("seo-h1"),
  cta: document.getElementById("seo-cta"),
  contentBrief: document.getElementById("seo-content-brief"),
  mainKeyword: document.getElementById("seo-main-keyword"),
  keywordIntent: document.getElementById("seo-keyword-intent"),
  extraKeyword: document.getElementById("seo-extra-keyword"),
  keywordPriority: document.getElementById("seo-keyword-priority"),
  addKeyword: document.getElementById("seo-add-keyword"),
  keywordList: document.getElementById("seo-keyword-list"),
  seoTitle: document.getElementById("seo-title"),
  seoTitleCount: document.getElementById("seo-title-count"),
  seoTitleStatus: document.getElementById("seo-title-status"),
  metaDescription: document.getElementById("seo-description"),
  metaDescriptionCount: document.getElementById("seo-description-count"),
  metaDescriptionStatus: document.getElementById("seo-description-status"),
  previewUrl: document.getElementById("seo-preview-url"),
  previewTitle: document.getElementById("seo-preview-title"),
  previewDescription: document.getElementById("seo-preview-description"),
  faqQuestion: document.getElementById("seo-faq-question"),
  faqAnswer: document.getElementById("seo-faq-answer"),
  addFaq: document.getElementById("seo-add-faq"),
  faqList: document.getElementById("seo-faq-list"),
  schemaType: document.getElementById("seo-schema-type"),
  prepareSchema: document.getElementById("seo-prepare-schema"),
  schemaPreview: document.getElementById("seo-schema-preview"),
  scoreValue: document.getElementById("seo-score-value"),
  scoreLabel: document.getElementById("seo-score-label"),
  scoreRing: document.querySelector(".seo-score-ring"),
  scoreRingValue: document.getElementById("seo-score-ring-value"),
  scoreSummary: document.getElementById("seo-score-summary"),
  checkList: document.getElementById("seo-check-list"),
};

function loadState() {
  try {
    if (!STORAGE_KEY) return { ...initialState };
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...initialState };
    const parsed = JSON.parse(stored);
    return { ...initialState, ...parsed };
  } catch {
    return { ...initialState };
  }
}

function saveState(showMessage = false) {
  if (!STORAGE_KEY) { setMessage("Selecteer eerst een actieve lead of klant.", "error"); return; }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (showMessage) setMessage("Concept opgeslagen.", "success");
}

function setMessage(message, type = "info") {
  nodes.statusMessage.textContent = message;
  nodes.statusMessage.dataset.type = type;
}

function updateText(node, value) {
  node.textContent = value;
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function getLengthStatus(length, min, max) {
  if (!length) return "Ontbreekt";
  if (length < min) return "Te kort";
  if (length > max) return "Te lang";
  return "Goed";
}

function getStatusClass(status) {
  if (status === "Goed") return "is-good";
  if (status === "Kan beter" || status === "Te kort" || status === "Te lang") return "is-warning";
  return "is-missing";
}

function syncInputs() {
  nodes.clientSite.value = state.clientSite;
  nodes.targetUrl.value = state.targetUrl;
  nodes.pageType.value = state.pageType;
  nodes.pageGoal.value = state.pageGoal;
  nodes.audience.value = state.audience;
  nodes.h1.value = state.h1;
  nodes.cta.value = state.cta;
  nodes.contentBrief.value = state.contentBrief;
  nodes.mainKeyword.value = state.mainKeyword;
  nodes.seoTitle.value = state.seoTitle;
  nodes.metaDescription.value = state.metaDescription;
  nodes.schemaType.value = state.schemaType;
}

function bindStateInput(node, key, eventName = "input") {
  node.addEventListener(eventName, () => {
    state[key] = node.value;
    saveState();
    render();
  });
}

function renderKeywords() {
  clearChildren(nodes.keywordList);

  const rows = [];
  if (state.mainKeyword.trim()) {
    rows.push({
      keyword: state.mainKeyword.trim(),
      intent: "Primair",
      priority: "Hoog",
      status: "Goed",
    });
  }
  rows.push(...state.keywords);

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "seo-empty-state";
    empty.textContent = "Nog geen zoekwoorden toegevoegd.";
    nodes.keywordList.append(empty);
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("div");
    row.className = "seo-table-row";

    [item.keyword, item.intent, item.priority, item.status].forEach((value, index) => {
      const cell = document.createElement("span");
      cell.textContent = value;
      if (index === 3) cell.className = `seo-status-pill ${getStatusClass(value)}`;
      row.append(cell);
    });

    nodes.keywordList.append(row);
  });
}

function renderFaqs() {
  clearChildren(nodes.faqList);

  if (!state.faqs.length) {
    const empty = document.createElement("p");
    empty.className = "seo-empty-state";
    empty.textContent = "Nog geen FAQ-items toegevoegd.";
    nodes.faqList.append(empty);
    return;
  }

  state.faqs.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "seo-faq-item";

    const content = document.createElement("div");
    const question = document.createElement("strong");
    question.textContent = item.question;
    const answer = document.createElement("p");
    answer.textContent = item.answer;
    content.append(question, answer);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button secondary";
    remove.dataset.faqIndex = String(index);
    remove.textContent = "Verwijderen";

    card.append(content, remove);
    nodes.faqList.append(card);
  });
}

function getSchemaPreview() {
  const schemaType = state.schemaType || "WebPage";
  const base = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: state.seoTitle || "Klantpagina titel",
    description: state.metaDescription || "Meta description placeholder",
    url: state.targetUrl || (state.clientSite ? `https://maxwebstudio.nl/${state.clientSite}` : "https://maxwebstudio.nl/klantpagina"),
  };

  if (state.h1) base.headline = state.h1;
  if (state.audience) base.audience = state.audience;

  if (schemaType === "FAQPage") {
    base.mainEntity = state.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    }));
  }

  if (schemaType === "LocalBusiness" || schemaType === "Organization") {
    base.brand = "Klantwebsite";
    base.areaServed = "Nederland";
  }

  if (schemaType === "Service") {
    base.serviceType = state.mainKeyword || "Dienstverlening";
  }

  return JSON.stringify(base, null, 2);
}

function renderMetadata() {
  const titleLength = state.seoTitle.length;
  const descriptionLength = state.metaDescription.length;
  const titleStatus = getLengthStatus(titleLength, 35, 60);
  const descriptionStatus = getLengthStatus(descriptionLength, 120, 160);

  updateText(nodes.seoTitleCount, String(titleLength));
  updateText(nodes.metaDescriptionCount, String(descriptionLength));
  updateText(nodes.seoTitleStatus, titleStatus);
  updateText(nodes.metaDescriptionStatus, descriptionStatus);
  nodes.seoTitleStatus.className = `seo-badge ${getStatusClass(titleStatus)}`;
  nodes.metaDescriptionStatus.className = `seo-badge ${getStatusClass(descriptionStatus)}`;

  updateText(nodes.previewTitle, state.seoTitle || "SEO title verschijnt hier");
  updateText(nodes.previewDescription, state.metaDescription || "Meta description verschijnt hier zodra je tekst invult.");
  updateText(nodes.previewUrl, formatPreviewUrl());
}

function formatPreviewUrl() {
  if (state.targetUrl.trim()) {
    return state.targetUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  return state.clientSite ? `maxwebstudio.nl/${state.clientSite}` : "maxwebstudio.nl/klantpagina";
}

function getChecks() {
  return [
    { label: "Klantwebsite geselecteerd", passed: Boolean(state.clientSite) },
    { label: "Pagina URL ingevuld", passed: Boolean(state.targetUrl.trim()) },
    { label: "Pagina doel duidelijk", passed: Boolean(state.pageGoal.trim()) },
    { label: "H1 voorstel aanwezig", passed: Boolean(state.h1.trim()) },
    { label: "Hoofdzoekwoord ingevuld", passed: Boolean(state.mainKeyword.trim()) },
    { label: "Meta title aanwezig", passed: Boolean(state.seoTitle.trim()) },
    { label: "Meta description aanwezig", passed: Boolean(state.metaDescription.trim()) },
    { label: "FAQ aanwezig", passed: state.faqs.length > 0 },
    { label: "Schema gekozen", passed: Boolean(state.schemaType) },
    { label: "CTA ingevuld", passed: Boolean(state.cta.trim()) },
  ];
}

function renderScore() {
  const checks = getChecks();
  const passed = checks.filter((check) => check.passed).length;
  const score = Math.round((passed / checks.length) * 100);
  const label = score >= 80 ? "Goed" : score >= 40 ? "Kan beter" : "Ontbreekt";

  updateText(nodes.scoreValue, String(score));
  updateText(nodes.scoreRingValue, String(score));
  updateText(nodes.scoreLabel, label);
  updateText(nodes.scoreSummary, label);
  nodes.scoreSummary.className = `seo-badge ${getStatusClass(label)}`;
  nodes.scoreRing.style.setProperty("--seo-score", `${score * 3.6}deg`);

  clearChildren(nodes.checkList);
  checks.forEach((check) => {
    const item = document.createElement("div");
    item.className = "seo-check-item";

    const labelNode = document.createElement("strong");
    labelNode.textContent = check.label;
    const status = document.createElement("span");
    status.className = `seo-status-pill ${check.passed ? "is-good" : "is-missing"}`;
    status.textContent = check.passed ? "Goed" : "Ontbreekt";

    item.append(labelNode, status);
    nodes.checkList.append(item);
  });
}

function renderSchema() {
  nodes.schemaPreview.textContent = getSchemaPreview();
}

function render() {
  renderKeywords();
  renderFaqs();
  renderMetadata();
  renderSchema();
  renderScore();
}

function addKeyword() {
  const keyword = nodes.extraKeyword.value.trim();
  if (!keyword) {
    setMessage("Vul eerst een extra zoekwoord in.", "warning");
    return;
  }

  state.keywords.push({
    keyword,
    intent: nodes.keywordIntent.value,
    priority: nodes.keywordPriority.value,
    status: "Kan beter",
  });
  nodes.extraKeyword.value = "";
  saveState();
  render();
}

function addFaq() {
  const question = nodes.faqQuestion.value.trim();
  const answer = nodes.faqAnswer.value.trim();
  if (!question || !answer) {
    setMessage("Vul een vraag en antwoord in.", "warning");
    return;
  }

  state.faqs.push({ question, answer });
  nodes.faqQuestion.value = "";
  nodes.faqAnswer.value = "";
  saveState();
  render();
}

function exportDraft() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "seo-studio-concept.json";
  link.click();
  URL.revokeObjectURL(url);
  setMessage("Concept lokaal geexporteerd.", "success");
}

nodes.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const nextTab = tab.dataset.tab;
    nodes.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    nodes.panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== nextTab;
    });
  });
});

bindStateInput(nodes.clientSite, "clientSite", "change");
bindStateInput(nodes.targetUrl, "targetUrl");
bindStateInput(nodes.pageType, "pageType", "change");
bindStateInput(nodes.pageGoal, "pageGoal");
bindStateInput(nodes.audience, "audience");
bindStateInput(nodes.h1, "h1");
bindStateInput(nodes.cta, "cta");
bindStateInput(nodes.contentBrief, "contentBrief");
bindStateInput(nodes.mainKeyword, "mainKeyword");
bindStateInput(nodes.seoTitle, "seoTitle");
bindStateInput(nodes.metaDescription, "metaDescription");
bindStateInput(nodes.schemaType, "schemaType", "change");

nodes.addKeyword.addEventListener("click", addKeyword);
nodes.addFaq.addEventListener("click", addFaq);
nodes.saveDraft.addEventListener("click", () => saveState(true));
nodes.exportDraft.addEventListener("click", exportDraft);
nodes.prepareSchema.addEventListener("click", () => {
  state.schemaPreparedAt = new Date().toISOString();
  saveState();
  renderSchema();
  setMessage("Schema-preview voorbereid. Er is niets gepubliceerd.", "success");
});

nodes.faqList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-faq-index]");
  if (!button) return;
  const index = Number(button.dataset.faqIndex);
  state.faqs.splice(index, 1);
  saveState();
  render();
});

syncInputs();
render();
if (!STORAGE_KEY) setMessage("Selecteer eerst een actieve lead of klant.", "error");
window.ActiveRelationship?.subscribeToRelationshipChanges?.((relationship) => {
  activeRelationship = relationship;
  STORAGE_KEY = relationshipStorageKey(relationship);
  state = loadState();
  syncInputs();
  render();
  setMessage(STORAGE_KEY ? "Relatiecontext geladen." : "Selecteer eerst een actieve lead of klant.", STORAGE_KEY ? "success" : "error");
});
