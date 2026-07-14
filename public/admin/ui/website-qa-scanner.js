(function initWebsiteQAScanner(global) {
  "use strict";

  const QA_STATUSES = Object.freeze({
    good: "Geslaagd",
    warning: "Waarschuwingen",
    critical: "Kritiek",
    untested: "Nog geen scan",
  });

  const CATEGORY_CONFIG = Object.freeze([
    Object.freeze({ id: "performance", label: "Performance", sourceIds: Object.freeze(["speed", "performance"]) }),
    Object.freeze({ id: "seo", label: "SEO", sourceIds: Object.freeze(["seo"]) }),
    Object.freeze({ id: "mobile", label: "Mobiel", sourceIds: Object.freeze(["mobile"]) }),
    Object.freeze({ id: "accessibility", label: "Toegankelijkheid", sourceIds: Object.freeze(["accessibility", "contrast"]) }),
    Object.freeze({ id: "best-practices", label: "Best Practices", sourceIds: Object.freeze(["desktop", "links", "images"]) }),
    Object.freeze({ id: "content-structure", label: "Content & Structuur", sourceIds: Object.freeze(["headings", "alt-text"]) }),
    Object.freeze({ id: "security", label: "Beveiliging", sourceIds: Object.freeze(["security"]) }),
  ]);

  function normalizeUrl(value) {
    const trimmedValue = String(value || "").trim();
    if (!trimmedValue) return "";
    const scheme = trimmedValue.match(/^([a-z][a-z0-9+.-]*):/i);
    if (scheme && !/^https?$/i.test(scheme[1])) return "";
    return /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
  }

  function validateWebsiteUrl(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) return { isValid: false, message: "Vul eerst een website-URL in." };
    if (/^([a-z][a-z0-9+.-]*):/i.test(rawValue) && !/^https?:\/\//i.test(rawValue)) {
      return { isValid: false, message: "Alleen http- en https-websites kunnen worden gescand." };
    }

    const normalizedUrl = normalizeUrl(rawValue);
    try {
      const parsedUrl = new URL(normalizedUrl);
      const validProtocol = parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
      const hostname = parsedUrl.hostname.toLowerCase();
      const validHost = hostname.includes(".") && hostname.length >= 4 && !hostname.startsWith(".") && !hostname.endsWith(".");
      if (!validProtocol || !validHost || parsedUrl.username || parsedUrl.password) throw new Error("invalid-url");
      return { isValid: true, url: parsedUrl.href };
    } catch (error) {
      return { isValid: false, message: "Gebruik een geldige URL, bijvoorbeeld https://voorbeeld.nl." };
    }
  }

  function createCheck(label, status) {
    return { label, status };
  }

  function calculateQAScore(categories) {
    const weights = { good: 100, warning: 62, critical: 24, untested: 0 };
    const testedCategories = categories.filter((category) => category.status !== "untested");
    const totalWeight = testedCategories.reduce((total, category) => total + (category.weight || 1), 0);
    if (!totalWeight) return 0;
    const weightedScore = testedCategories.reduce((total, category) => total + (weights[category.status] || 0) * (category.weight || 1), 0);
    return Math.round(weightedScore / totalWeight);
  }

  function createMockQAResult(websiteUrl, scannedAt = new Date().toISOString()) {
    const categories = [
      { id: "mobile", label: "Mobiel", status: "good", weight: 1.2, checks: [createCheck("Website werkt goed op mobiel", "good"), createCheck("CTA-knoppen zijn zichtbaar", "good"), createCheck("Navigatie werkt op mobiel", "good")] },
      { id: "desktop", label: "Desktop", status: "good", weight: 1, checks: [createCheck("Navigatie werkt op desktop", "good"), createCheck("Belangrijke content staat boven de vouw", "good")] },
      { id: "contrast", label: "Contrast", status: "warning", weight: 1, checks: [createCheck("Tekst is goed leesbaar", "good"), createCheck("Contrast vraagt handmatige controle", "warning")] },
      { id: "speed", label: "Snelheid", status: "warning", weight: 1.1, checks: [createCheck("Media-optimalisatie nalopen", "warning"), createCheck("Bestandsgroottes handmatig controleren", "warning")] },
      { id: "seo", label: "SEO", status: "good", weight: 1, checks: [createCheck("Meta title aanwezig", "good"), createCheck("Meta description aanwezig", "good"), createCheck("Indexeerbare structuur aanwezig", "good")] },
      { id: "accessibility", label: "Toegankelijkheid", status: "warning", weight: 1, checks: [createCheck("Formulieren hebben herkenbare labels", "good"), createCheck("Focus states handmatig nalopen", "warning")] },
      { id: "links", label: "Links", status: "good", weight: 0.9, checks: [createCheck("Belangrijke CTA-links opgenomen", "good"), createCheck("Linkcontrole voorbereid", "good")] },
      { id: "images", label: "Afbeeldingen", status: "warning", weight: 0.9, checks: [createCheck("Afbeeldingsformaten nalopen", "warning"), createCheck("Afbeeldingsverhoudingen controleren", "good")] },
      { id: "headings", label: "Headings", status: "critical", weight: 1, checks: [createCheck("Controleer of er precies één H1 is", "critical"), createCheck("Headingstructuur handmatig nalopen", "warning")] },
      { id: "alt-text", label: "Alt-teksten", status: "critical", weight: 1, checks: [createCheck("Alt-teksten handmatig controleren", "critical"), createCheck("Decoratieve afbeeldingen markeren", "warning")] },
      { id: "performance", label: "Performance", status: "warning", weight: 1.2, checks: [createCheck("Core Web Vitals nog niet live gemeten", "warning"), createCheck("Renderblokkerende scripts nalopen", "good")] },
    ];

    return {
      scannedUrl: websiteUrl,
      scannedAt,
      source: "mock",
      sourceLabel: "Mockscan",
      qualityScore: calculateQAScore(categories),
      categories,
      recommendations: [
        "Controleer de alt-teksten van inhoudelijke afbeeldingen.",
        "Loop contrast en zichtbare focusstates handmatig na.",
        "Optimaliseer grote media voordat de website live gaat.",
        "Bevestig één duidelijke H1 en een logische headingstructuur.",
      ],
    };
  }

  function aggregateCategories(result) {
    const sourceCategories = Array.isArray(result?.categories) ? result.categories : [];
    return CATEGORY_CONFIG.map((config) => {
      const matched = sourceCategories.filter((category) => config.sourceIds.includes(category.id));
      const checks = matched.flatMap((category) => Array.isArray(category.checks) ? category.checks : []);
      if (!checks.length) return { ...config, completed: 0, total: 0, percentage: 0, status: "untested" };
      const points = checks.reduce((total, check) => total + ({ good: 1, warning: 0.55, critical: 0 }[check.status] || 0), 0);
      const percentage = Math.round((points / checks.length) * 100);
      const status = checks.some((check) => check.status === "critical") ? "critical" : checks.some((check) => check.status === "warning") ? "warning" : "good";
      return { ...config, completed: checks.filter((check) => check.status === "good").length, total: checks.length, percentage, status };
    });
  }

  function summarizeChecks(result) {
    const checks = (result?.categories || []).flatMap((category) => category.checks || []);
    return {
      good: checks.filter((check) => check.status === "good").length,
      warning: checks.filter((check) => check.status === "warning").length,
      critical: checks.filter((check) => check.status === "critical").length,
    };
  }

  function getOverallStatus(score, loading = false) {
    if (loading) return { key: "loading", label: "Bezig" };
    if (score >= 85) return { key: "good", label: "Geslaagd" };
    if (score >= 65) return { key: "warning", label: "Waarschuwingen" };
    return { key: "critical", label: "Kritiek" };
  }

  const api = Object.freeze({ CATEGORY_CONFIG, normalizeUrl, validateWebsiteUrl, calculateQAScore, createMockQAResult, aggregateCategories, summarizeChecks, getOverallStatus });
  global.MaxWebsiteQAScanner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document === "undefined") return;

  function initializePage() {
    const byId = (id) => document.getElementById(id);
    const elements = {
      form: byId("qa-scan-form"), input: byId("qa-url-input"), startButton: byId("qa-start-button"), message: byId("qa-form-message"),
      loadingPanel: byId("qa-loading-panel"), emptyState: byId("qa-empty-state"), emptyStart: byId("qa-empty-start"), reportShell: byId("qa-report-shell"),
      reportStatus: byId("qa-report-status"), reportTitle: byId("qa-report-title"), reportUrl: byId("qa-report-url"), reportTime: byId("qa-report-time"),
      scoreRing: byId("qa-score-ring"), scoreValue: byId("qa-score-value"), scoreLabel: byId("qa-score-label"), reportSummary: byId("qa-report-summary"),
      categoryGrid: byId("qa-category-grid"), categorySummary: byId("qa-category-summary"), categorySource: byId("qa-category-source"), recommendationList: byId("qa-recommendation-list"),
      recentScans: byId("qa-recent-scans"), recentCount: byId("qa-recent-count"), search: byId("qa-page-search"),
      rescanButton: byId("qa-rescan"), copyButton: byId("qa-copy-report"), downloadButton: byId("qa-download-json"), reviewedButton: byId("qa-mark-reviewed"), reviewedBadge: byId("qa-reviewed-badge"),
      lastUpdated: byId("qa-last-updated"), settingsButton: byId("qa-settings-button"), settingsPanel: byId("qa-settings-panel"), settingsClose: byId("qa-settings-close"), autoOpen: byId("qa-auto-open"), toast: byId("qa-toast"),
    };
    if (!elements.form || !elements.input) return;

    const state = { results: [], currentResult: null, isLoading: false, searchQuery: "", reviewedAt: null };

    function createElement(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function clearNode(node) {
      while (node.firstChild) node.removeChild(node.firstChild);
    }

    function setMessage(text, type = "info") {
      elements.message.textContent = text;
      elements.message.className = `admin-form-message ${type}`;
    }

    function showToast(message) {
      elements.toast.textContent = message;
      elements.toast.hidden = false;
      global.clearTimeout(showToast.timeoutId);
      showToast.timeoutId = global.setTimeout(() => { elements.toast.hidden = true; }, 2800);
    }

    function setLoading(isLoading) {
      state.isLoading = isLoading;
      elements.loadingPanel.hidden = !isLoading;
      elements.startButton.disabled = isLoading;
      elements.input.disabled = isLoading;
      elements.startButton.textContent = isLoading ? "Scannen..." : "Start QA scan";
      elements.form.setAttribute("aria-busy", String(isLoading));
    }

    function statValue(name, value) {
      const node = document.querySelector(`[data-stat="${name}"] > strong`);
      if (node) node.textContent = String(value);
    }

    function renderStats() {
      const summaries = state.results.map(summarizeChecks);
      statValue("total", state.results.length);
      statValue("passed", state.results.filter((result) => result.qualityScore >= 85).length);
      statValue("warnings", summaries.reduce((total, summary) => total + summary.warning, 0));
      statValue("critical", summaries.reduce((total, summary) => total + summary.critical, 0));
      statValue("drafts", 0);
    }

    function emptyRecentState() {
      const wrapper = createElement("div", "qa-empty-compact");
      wrapper.append(createElement("strong", "", state.searchQuery ? "Geen scans gevonden" : "Nog geen scans"));
      wrapper.append(createElement("p", "", state.searchQuery ? "Pas de zoekterm aan of start een nieuwe scan." : "Start de eerste lokale mockscan. Er wordt geen productiedata verzonnen of opgeslagen."));
      const button = createElement("button", "button primary", "Start eerste scan");
      button.type = "button";
      button.addEventListener("click", () => elements.input.focus());
      wrapper.append(button);
      return wrapper;
    }

    function renderRecentScans() {
      clearNode(elements.recentScans);
      const filtered = state.results.filter((result) => result.scannedUrl.toLowerCase().includes(state.searchQuery)).slice(0, 5);
      elements.recentCount.textContent = String(filtered.length);
      if (!filtered.length) {
        elements.recentScans.appendChild(emptyRecentState());
        return;
      }
      const list = createElement("div", "qa-recent-list");
      filtered.forEach((result) => {
        const row = createElement("button", "qa-recent-row");
        row.type = "button";
        row.setAttribute("aria-label", `Open rapport voor ${result.scannedUrl}`);
        const copy = createElement("span", "qa-recent-row-copy");
        const hostname = new URL(result.scannedUrl).hostname;
        copy.append(createElement("strong", "", hostname), createElement("small", "", new Date(result.scannedAt).toLocaleString("nl-NL")));
        const score = createElement("span", "qa-recent-score", `${result.qualityScore} / 100`);
        const chevron = createElement("span", "qa-recent-chevron", "›");
        chevron.setAttribute("aria-hidden", "true");
        row.append(copy, score, chevron);
        row.addEventListener("click", () => renderReport(result, true));
        list.append(row);
      });
      elements.recentScans.appendChild(list);
    }

    function renderCategoryRows(result) {
      clearNode(elements.categorySummary);
      const categories = result ? aggregateCategories(result) : CATEGORY_CONFIG.map((config) => ({ ...config, completed: 0, total: 0, percentage: 0, status: "untested" }));
      elements.categorySource.textContent = result ? result.sourceLabel : "Geen scan";
      categories.forEach((category) => {
        const row = createElement("div", "qa-category-row");
        row.append(createElement("strong", "", category.label), createElement("small", "", category.total ? `${category.completed} / ${category.total}` : "Nog geen scan"));
        const progress = createElement("span", `qa-progress ${category.status === "untested" ? "" : `is-${category.status}`}`);
        progress.setAttribute("role", "progressbar");
        progress.setAttribute("aria-label", category.label);
        progress.setAttribute("aria-valuemin", "0");
        progress.setAttribute("aria-valuemax", "100");
        progress.setAttribute("aria-valuenow", String(category.percentage));
        progress.style.setProperty("--qa-progress", `${category.percentage}%`);
        progress.appendChild(createElement("span"));
        row.appendChild(progress);
        elements.categorySummary.appendChild(row);
      });
    }

    function renderReportCategories(result) {
      clearNode(elements.categoryGrid);
      aggregateCategories(result).forEach((category) => {
        const card = createElement("article", "qa-category-card");
        card.append(createElement("strong", "", category.label));
        card.append(createElement("span", "", category.total ? `${category.completed} van ${category.total} controles geslaagd` : "Niet gemeten in deze mockscan"));
        const progress = createElement("span", `qa-progress ${category.status === "untested" ? "" : `is-${category.status}`}`);
        progress.style.setProperty("--qa-progress", `${category.percentage}%`);
        progress.setAttribute("aria-hidden", "true");
        progress.appendChild(createElement("span"));
        card.appendChild(progress);
        elements.categoryGrid.appendChild(card);
      });
    }

    function renderReportSummary(result) {
      clearNode(elements.reportSummary);
      const summary = summarizeChecks(result);
      [["critical", "Kritieke fouten"], ["warning", "Waarschuwingen"], ["good", "Geslaagde controles"]].forEach(([key, label]) => {
        const card = createElement("article", "qa-summary-card");
        card.append(createElement("strong", "", summary[key]), createElement("span", "", label));
        elements.reportSummary.appendChild(card);
      });
    }

    function renderRecommendations(recommendations) {
      clearNode(elements.recommendationList);
      recommendations.forEach((recommendation) => elements.recommendationList.appendChild(createElement("li", "", recommendation)));
    }

    function renderReport(result, scrollIntoView) {
      state.currentResult = result;
      state.reviewedAt = null;
      const status = getOverallStatus(result.qualityScore);
      elements.emptyState.hidden = true;
      elements.reportShell.hidden = false;
      elements.reportStatus.className = `qa-status-badge qa-status-${status.key}`;
      elements.reportStatus.textContent = status.label;
      elements.reportTitle.textContent = "Website Quality Report";
      elements.reportUrl.textContent = result.scannedUrl;
      elements.reportTime.textContent = `Gescand op ${new Date(result.scannedAt).toLocaleString("nl-NL")} · Interne mockchecks, geen live Lighthouse-meting`;
      elements.scoreValue.textContent = String(result.qualityScore);
      elements.scoreLabel.textContent = status.label;
      elements.scoreRing.style.setProperty("--qa-score", `${result.qualityScore * 3.6}deg`);
      elements.reviewedBadge.hidden = true;
      elements.reviewedButton.disabled = false;
      elements.reviewedButton.textContent = "Markeer als gecontroleerd";
      renderReportSummary(result);
      renderReportCategories(result);
      renderRecommendations(result.recommendations || []);
      renderCategoryRows(result);
      elements.lastUpdated.textContent = `Laatste update: ${new Date(result.scannedAt).toLocaleString("nl-NL")}`;
      if (scrollIntoView && elements.autoOpen.checked) elements.reportShell.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function buildReportText(result) {
      const summary = summarizeChecks(result);
      const lines = [
        "Website QA Rapport — Mockscan",
        `URL: ${result.scannedUrl}`,
        `Score: ${result.qualityScore}/100`,
        `Scanmoment: ${new Date(result.scannedAt).toLocaleString("nl-NL")}`,
        `Kritiek: ${summary.critical} · Waarschuwingen: ${summary.warning} · Geslaagd: ${summary.good}`,
        "",
        "Aanbevolen verbeteringen:",
        ...(result.recommendations || []).map((item) => `- ${item}`),
        "",
        "Bron: interne mockchecks; geen live Lighthouse- of PageSpeed-meting.",
      ];
      return lines.join("\n");
    }

    async function runPreparedMockScan(websiteUrl) {
      await new Promise((resolve) => global.setTimeout(resolve, 650));
      return createMockQAResult(websiteUrl);
    }

    async function handleScanSubmit(event) {
      event.preventDefault();
      if (state.isLoading) return;
      const validation = validateWebsiteUrl(elements.input.value);
      if (!validation.isValid) {
        setMessage(validation.message, "error");
        elements.input.focus();
        return;
      }

      elements.input.value = validation.url;
      setMessage("", "info");
      setLoading(true);
      try {
        const result = await runPreparedMockScan(validation.url);
        if (!result || typeof result.qualityScore !== "number") throw new Error("invalid-result");
        state.results.unshift(result);
        state.results = state.results.slice(0, 5);
        renderStats();
        renderRecentScans();
        renderReport(result, true);
        setMessage("Mockscan afgerond. Dit resultaat bevat geen live Lighthouse-metingen.", "success");
        showToast("Mockscan afgerond en rapport geopend.");
      } catch (error) {
        setMessage("De QA-scan kon niet worden afgerond. Probeer het opnieuw.", "error");
        showToast("De QA-scan is mislukt.");
      } finally {
        setLoading(false);
      }
    }

    async function copyReport() {
      if (!state.currentResult) return;
      try {
        await navigator.clipboard.writeText(buildReportText(state.currentResult));
        showToast("Rapport gekopieerd.");
      } catch (error) {
        showToast("Kopiëren is niet gelukt.");
      }
    }

    function downloadReportJson() {
      if (!state.currentResult) return;
      const blob = new Blob([JSON.stringify(state.currentResult, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const host = new URL(state.currentResult.scannedUrl).hostname.replace(/[^a-z0-9.-]/gi, "-");
      link.href = downloadUrl;
      link.download = `website-qa-mockrapport-${host}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      showToast("Mockrapport als JSON gedownload.");
    }

    function markReviewed() {
      if (!state.currentResult) return;
      state.reviewedAt = new Date().toISOString();
      elements.reviewedBadge.hidden = false;
      elements.reviewedButton.disabled = true;
      elements.reviewedButton.textContent = "Gecontroleerd";
      showToast("Rapport lokaal als gecontroleerd gemarkeerd.");
    }

    function toggleSettings(open) {
      elements.settingsPanel.hidden = !open;
      elements.settingsButton.setAttribute("aria-expanded", String(open));
      if (open) elements.autoOpen.focus();
      else elements.settingsButton.focus();
    }

    elements.form.addEventListener("submit", handleScanSubmit);
    elements.emptyStart.addEventListener("click", () => elements.input.focus());
    elements.rescanButton.addEventListener("click", () => { elements.input.focus(); elements.form.requestSubmit(); });
    elements.copyButton.addEventListener("click", copyReport);
    elements.downloadButton.addEventListener("click", downloadReportJson);
    elements.reviewedButton.addEventListener("click", markReviewed);
    elements.search.addEventListener("input", () => { state.searchQuery = elements.search.value.trim().toLowerCase(); renderRecentScans(); });
    elements.settingsButton.addEventListener("click", () => toggleSettings(elements.settingsPanel.hidden));
    elements.settingsClose.addEventListener("click", () => toggleSettings(false));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !elements.settingsPanel.hidden) toggleSettings(false); });

    renderStats();
    renderRecentScans();
    renderCategoryRows(null);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializePage, { once: true });
  else initializePage();
})(typeof globalThis !== "undefined" ? globalThis : window);
