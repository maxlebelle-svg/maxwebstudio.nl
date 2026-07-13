(function initAdminSidebarDashboardPilot(global) {
  "use strict";

  const SESSION_KEY = "mws_admin_supabase_session";
  const PROFILES_KEY = "maxwebstudioProfiles";
  const RECENTS_KEY = "mwsAdminRelationshipRecents";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ROLE_LABELS = Object.freeze({
    super_admin: "Super Admin", admin: "Admin", sales_manager: "Sales Manager",
    sales_partner: "Sales Partner", developer: "Developer", designer: "Designer",
    support: "Support", customer: "Klant", demo_user: "Demo Gebruiker",
  });
  const selectorState = { open: false, type: "all", query: "", request: null, restoreFocus: null, debouncedSearch: null };
  const metricState = { general: null, workspace: null, loadingGeneral: true, loadingWorkspace: false, workspaceKey: "", request: null, requestId: 0, cache: new Map() };
  const WORKSPACE_BADGES = Object.freeze(["websiteFactory", "demoSites", "assets", "brandStatus", "domains", "openTasks", "openQuotes", "openInvoices", "subscriptionStatus", "mailCount", "timelineEvents"]);
  const METRIC_TO_BADGE = Object.freeze({ assets: "assets", demoSites: "demoSites", openTasks: "openTasks", timelineEvents: "timelineEvents", mailCount: "mailCount", openQuotes: "openQuotes", openInvoices: "openInvoices", overdueInvoices: "openInvoices", subscriptions: "subscriptionStatus", activeSubscriptions: "subscriptionStatus", website: "domains", project: "websiteFactory", journey: "websiteFactory", brandAssets: "brandStatus", websiteFactory: "websiteFactory", previewVersions: "websiteFactory" });
  let latestAccessContext = {};

  function readJson(storage, key, fallback) {
    try { const value = JSON.parse(storage?.getItem(key) || "null"); return value ?? fallback; }
    catch { return fallback; }
  }

  function resolveUser(session = {}, profiles = []) {
    session = session && typeof session === "object" ? session : {};
    const authUser = session.user || {};
    const userId = session.userId || session.user_id || authUser.id || "";
    const email = session.email || authUser.email || "";
    const rows = Array.isArray(profiles) ? profiles.filter((row) => row && typeof row === "object") : [];
    const profile = rows.find((row) => String(row.authUserId || row.auth_user_id || row.userId || row.id || "") === String(userId))
      || rows.find((row) => email && String(row.email || "").toLowerCase() === String(email).toLowerCase())
      || {};
    const role = profile.role || session.role || authUser.role || "";
    const name = profile.name || profile.fullName || profile.full_name || authUser.user_metadata?.full_name || email || "Onbekende gebruiker";
    return { name, email: profile.email || email, role, roleLabel: ROLE_LABELS[role] || role || "Rol onbekend", avatarUrl: profile.avatarUrl || profile.avatar_url || authUser.user_metadata?.avatar_url || "" };
  }

  function safeRelationship(service) {
    try { return service?.getActiveRelationship?.() || null; }
    catch { return null; }
  }

  function relationshipForSidebar(relationship) {
    if (!relationship) return null;
    return { ...relationship, statusTone: relationship.entityType === "lead" ? "info" : "success", lifecycleTone: semanticTone(relationship.lifecycleStage) };
  }

  function semanticTone(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (/inactief|inactive|niet gestart|onbekend|unknown|geen gegevens|niet beschikbaar/.test(normalized)) return "neutral";
    if (/failed|fout|blocked|geblokkeerd|mislukt|overdue|verlopen|rejected|afgewezen|lost/.test(normalized)) return "danger";
    if (/waiting|wacht|pending|actie|partial|gedeeltelijk|follow up|opvolgen|bijna/.test(normalized)) return "warning";
    if (/production|productie|building|branding|content|campagne|aanpassingen/.test(normalized)) return "purple";
    if (/preview|received|ontvangen|review|beoordeling|qualified|interesse/.test(normalized)) return "info";
    if (/live|online|active|actief|paid|betaald|complete|compleet|approved|goedgekeurd|success|won|verkocht|customer|klant/.test(normalized)) return "success";
    return "neutral";
  }

  function createDebouncer(callback, wait = 280, timers = global) {
    let timer = null;
    const debounced = (...args) => { if (timer) timers.clearTimeout(timer); timer = timers.setTimeout(() => { timer = null; callback(...args); }, wait); };
    debounced.cancel = () => { if (timer) timers.clearTimeout(timer); timer = null; };
    return debounced;
  }

  function adminToken() {
    const session = readJson(global.localStorage, SESSION_KEY, {});
    return session.accessToken || session.access_token || "";
  }

  function relationshipKey(relationship) {
    const type = relationship?.entityType;
    const id = type === "lead" ? relationship?.leadId : relationship?.customerId;
    return ["lead", "customer"].includes(type) && UUID.test(String(id || "")) ? `${type}:${id}` : "";
  }

  function metric(value, tone, label) {
    return value === null || value === undefined || value === "" ? undefined : { value, tone, label };
  }

  function loadingMetric(label) { return { loading: true, tone: "neutral", label: `${label} wordt geladen` }; }
  function unavailableMetric(label) { return { value: "—", tone: "neutral", label: `${label} tijdelijk niet beschikbaar` }; }

  function buildBadgeValues() {
    const badges = {};
    if (metricState.loadingGeneral && !metricState.general) badges.openLeads = loadingMetric("Open leads");
    else if (metricState.general?.openLeads === null) badges.openLeads = unavailableMetric("Open leads");
    else if (Number.isFinite(metricState.general?.openLeads)) badges.openLeads = metric(metricState.general.openLeads, "info", `${metricState.general.openLeads} open leads binnen jouw toegestane scope`);

    if (!metricState.workspaceKey) return badges;
    if (metricState.loadingWorkspace) {
      WORKSPACE_BADGES.forEach((key) => { badges[key] = loadingMetric(key); });
      return badges;
    }
    if (!metricState.workspace) {
      WORKSPACE_BADGES.forEach((key) => { badges[key] = unavailableMetric(key); });
      return badges;
    }

    const summary = metricState.workspace;
    const values = summary.metrics || {};
    const statuses = summary.statuses || {};
    if (statuses.websiteFactory) badges.websiteFactory = metric(statuses.websiteFactory.label, statuses.websiteFactory.tone, `Website Factory: ${statuses.websiteFactory.label}`);
    if (Number.isFinite(values.demoSites)) badges.demoSites = metric(values.demoSites, "info", `${values.demoSites} gekoppelde demo${values.demoSites === 1 ? "" : "'s"}`);
    if (Number.isFinite(values.assets)) badges.assets = metric(values.assets, "info", `${values.assets} gekoppelde assets`);
    if (statuses.brandCenter) badges.brandStatus = metric(statuses.brandCenter.label, statuses.brandCenter.tone, `Brand Center: ${statuses.brandCenter.label}`);
    if (statuses.domainCenter) badges.domains = metric(statuses.domainCenter.label, statuses.domainCenter.tone, `Domein Center: ${statuses.domainCenter.label}`);
    if (Number.isFinite(values.openTasks)) badges.openTasks = metric(values.openTasks, values.openTasks ? "warning" : "neutral", `${values.openTasks} open taken`);
    if (Number.isFinite(values.openQuotes)) badges.openQuotes = metric(values.openQuotes, values.openQuotes ? "warning" : "neutral", `${values.openQuotes} open offertes voor deze relatie`);
    if (Number.isFinite(values.overdueInvoices) && values.overdueInvoices > 0) {
      const openCopy = Number.isFinite(values.openInvoices) ? `; ${values.openInvoices} open totaal` : "";
      badges.openInvoices = metric(`${values.overdueInvoices} achterstallig`, "danger", `${values.overdueInvoices} werkelijk achterstallige facturen${openCopy}`);
    } else if (Number.isFinite(values.openInvoices)) {
      const overdueKnown = Number.isFinite(values.overdueInvoices);
      badges.openInvoices = metric(values.openInvoices, values.openInvoices ? "warning" : "neutral", overdueKnown ? `${values.openInvoices} open facturen; geen als achterstallig gemarkeerd` : `${values.openInvoices} open facturen; achterstallige status tijdelijk niet beschikbaar`);
    }
    if (Number.isFinite(values.subscriptions)) {
      const active = Number.isFinite(values.activeSubscriptions) ? values.activeSubscriptions : null;
      if (active > 0) badges.subscriptionStatus = metric(active === 1 ? "Actief" : `${active} actief`, "success", active === 1 ? "1 actief abonnement" : `${active} actieve abonnementen`);
      else if (values.subscriptions === 0) badges.subscriptionStatus = metric("Geen", "neutral", "Geen abonnementen voor deze relatie");
      else if (active === 0) badges.subscriptionStatus = metric("Inactief", "neutral", "Geen actief abonnement voor deze relatie");
      else badges.subscriptionStatus = metric(values.subscriptions, "neutral", `${values.subscriptions} abonnement${values.subscriptions === 1 ? "" : "en"}; actieve status tijdelijk niet beschikbaar`);
    }
    if (Number.isFinite(values.mailCount)) badges.mailCount = metric(values.mailCount, "info", `${values.mailCount} gekoppelde e-maillogs`);
    if (Number.isFinite(values.timelineEvents)) badges.timelineEvents = metric(values.timelineEvents, "neutral", `${values.timelineEvents} gekoppelde timeline-events`);

    (summary.errors || []).forEach((error) => { const badge = METRIC_TO_BADGE[error.metric]; if (badge && !badges[badge]) badges[badge] = unavailableMetric(badge); });
    return badges;
  }

  async function loadSidebarMetrics(relationship = safeRelationship(global.ActiveRelationship), options = {}) {
    const token = adminToken();
    const key = relationshipKey(relationship);
    metricState.workspaceKey = key;
    metricState.requestId += 1;
    const requestId = metricState.requestId;
    metricState.request?.abort(); metricState.request = null;
    if (!token) { metricState.loadingGeneral = false; metricState.loadingWorkspace = false; metricState.general = null; metricState.workspace = null; refresh(); return; }

    const cached = key ? metricState.cache.get(key) : null;
    if (!options.force && cached && Date.now() - cached.storedAt < 30000) {
      metricState.workspace = cached.workspace; metricState.loadingWorkspace = false; refresh(); return;
    }
    metricState.loadingGeneral = !metricState.general;
    metricState.loadingWorkspace = Boolean(key);
    metricState.workspace = null;
    refresh();
    const controller = new AbortController(); metricState.request = controller;
    const params = new URLSearchParams();
    if (key) { const [entityType, id] = key.split(":"); params.set("entityType", entityType); params.set("id", id); }
    try {
      const response = await global.fetch(`/api/admin-sidebar-metrics${params.size ? `?${params}` : ""}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Sidebarinformatie kon niet worden geladen.");
      if (requestId !== metricState.requestId || key !== metricState.workspaceKey) return;
      metricState.general = data.general || null;
      metricState.workspace = key ? data.workspace || null : null;
      if (key && data.workspace) metricState.cache.set(key, { workspace: data.workspace, storedAt: Date.now() });
    } catch (error) {
      if (error.name === "AbortError" || requestId !== metricState.requestId) return;
      if (!metricState.general) metricState.general = { openLeads: null, errors: [{ metric: "openLeads", code: "ENDPOINT_FAILED" }] };
      metricState.workspace = null;
    } finally {
      if (requestId === metricState.requestId) { metricState.loadingGeneral = false; metricState.loadingWorkspace = false; metricState.request = null; refresh(); }
    }
  }

  function resetWorkspaceMetrics(relationship = safeRelationship(global.ActiveRelationship)) {
    metricState.workspace = null;
    metricState.workspaceKey = relationshipKey(relationship);
    metricState.loadingWorkspace = Boolean(metricState.workspaceKey);
    refresh();
    return loadSidebarMetrics(relationship, { force: true });
  }

  function clearMetricState() {
    metricState.requestId += 1; metricState.request?.abort(); metricState.request = null;
    metricState.general = null; metricState.workspace = null; metricState.workspaceKey = "";
    metricState.loadingGeneral = false; metricState.loadingWorkspace = false; metricState.cache.clear();
    refresh();
  }

  function syncRelationshipUrl(relationship = null) {
    const url = new URL(global.location.href);
    url.searchParams.delete("leadId"); url.searchParams.delete("customerId");
    if (relationship?.entityType === "lead" && relationship.leadId) url.searchParams.set("leadId", relationship.leadId);
    if (relationship?.entityType === "customer" && relationship.customerId) url.searchParams.set("customerId", relationship.customerId);
    global.history.replaceState(global.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function setSelectorStatus(message, tone = "") {
    const status = document.querySelector("[data-workspace-status]");
    if (!status) return;
    status.textContent = message;
    status.className = `mws-workspace-selector-status${tone ? ` is-${tone}` : ""}`;
  }

  function renderSelectorResults(results = [], options = {}) {
    const list = document.querySelector("[data-workspace-results]");
    if (!list) return;
    list.replaceChildren();
    if (!results.length) {
      const empty = document.createElement("p"); empty.className = "mws-workspace-no-results"; empty.textContent = options.emptyMessage || "Geen relaties gevonden."; list.append(empty); return;
    }
    results.forEach((result) => {
      const option = document.createElement("button"); option.type = "button"; option.className = "mws-workspace-result"; option.setAttribute("role", "option");
      option.dataset.entityType = result.entityType; option.dataset.relationshipId = result.id || (result.entityType === "lead" ? result.leadId : result.customerId);
      const title = document.createElement("strong"); title.textContent = result.companyName || "Onbekende relatie";
      const meta = document.createElement("span"); meta.textContent = [result.entityType === "lead" ? "Lead" : "Klant", result.contactName, result.email, result.status, result.assignedUserName ? `Eigenaar: ${result.assignedUserName}` : ""].filter(Boolean).join(" · ");
      option.append(title, meta); option.addEventListener("click", () => selectRelationship(result)); list.append(option);
    });
  }

  function recentResults() {
    const current = safeRelationship(global.ActiveRelationship);
    const stored = readJson(global.sessionStorage, RECENTS_KEY, []);
    const candidates = [current, ...(Array.isArray(stored) ? stored : [])].filter(Boolean).map((row) => ({ ...row, id: row.id || (row.entityType === "lead" ? row.leadId : row.customerId) }));
    return [...new Map(candidates.filter((row) => ["lead", "customer"].includes(row.entityType) && UUID.test(row.id) && (selectorState.type === "all" || row.entityType === selectorState.type)).map((row) => [`${row.entityType}:${row.id}`, row])).values()].slice(0, 5);
  }

  function rememberRelationship(relationship) {
    const id = relationship?.entityType === "lead" ? relationship.leadId : relationship?.customerId;
    if (!UUID.test(String(id || "")) || !["lead", "customer"].includes(relationship?.entityType)) return;
    const minimal = { entityType: relationship.entityType, id, companyName: relationship.companyName || "Onbekende relatie", status: relationship.lifecycleStage || "", selectedAt: relationship.selectedAt || new Date().toISOString() };
    const previous = readJson(global.sessionStorage, RECENTS_KEY, []);
    const next = [minimal, ...(Array.isArray(previous) ? previous : []).filter((row) => `${row.entityType}:${row.id}` !== `${minimal.entityType}:${minimal.id}`)].slice(0, 5);
    try { global.sessionStorage?.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* recents remain optional */ }
  }

  async function searchRelationships() {
    const query = selectorState.query.trim();
    if (query.length < 2) { setSelectorStatus(recentResults().length ? "Recente relatie" : "Typ minimaal twee tekens om te zoeken."); renderSelectorResults(recentResults(), { emptyMessage: "Nog geen recente relatie." }); return; }
    const token = adminToken();
    if (!token) { setSelectorStatus("Log opnieuw in om relaties te zoeken.", "error"); renderSelectorResults([], { emptyMessage: "Zoeken is niet beschikbaar zonder geldige sessie." }); return; }
    selectorState.request?.abort(); selectorState.request = new AbortController();
    setSelectorStatus("Relaties zoeken…", "loading");
    const list = document.querySelector("[data-workspace-results]");
    if (list && global.MaxAdminSidebar?.LoadingSkeleton) list.replaceChildren(global.MaxAdminSidebar.LoadingSkeleton({ rows: 4, label: "Relaties zoeken" }));
    try {
      const params = new URLSearchParams({ q: query, type: selectorState.type, limit: "20" });
      const response = await fetch(`/api/admin-relationship-search?${params}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store", signal: selectorState.request.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Relaties konden niet worden doorzocht.");
      const results = Array.isArray(data.results) ? data.results : [];
      setSelectorStatus(results.length ? `${results.length} ${results.length === 1 ? "relatie" : "relaties"} gevonden` : "Geen relaties gevonden.");
      renderSelectorResults(results);
    } catch (error) {
      if (error.name === "AbortError") return;
      setSelectorStatus(error.message || "Relaties konden niet worden doorzocht.", "error");
      renderSelectorResults([], { emptyMessage: "Probeer een andere zoekterm of probeer het later opnieuw." });
    }
  }

  function setSelectorType(type) {
    selectorState.type = ["lead", "customer"].includes(type) ? type : "all";
    document.querySelectorAll("[data-workspace-type]").forEach((tab) => { const active = tab.dataset.workspaceType === selectorState.type; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active)); });
    if (selectorState.query.trim().length >= 2) selectorState.debouncedSearch(); else searchRelationships();
  }

  function handleSelectorKeys(event) {
    if (event.key === "Escape") { event.preventDefault(); closeWorkspaceSelector(); return; }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const options = [...document.querySelectorAll(".mws-workspace-result")];
    if (!options.length) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? (current + 1) % options.length : (current <= 0 ? options.length - 1 : current - 1);
    options[next].focus();
  }

  function closeWorkspaceSelector() {
    const selector = document.querySelector(".mws-workspace-selector");
    selectorState.debouncedSearch?.cancel(); selectorState.request?.abort(); selectorState.request = null; selectorState.open = false;
    selector?.remove();
    const focusTarget = selectorState.restoreFocus?.isConnected ? selectorState.restoreFocus : document.querySelector(".mws-workspace-action");
    selectorState.restoreFocus = null; focusTarget?.focus();
  }

  function openWorkspaceSelector() {
    const existing = document.querySelector(".mws-workspace-selector");
    if (existing) { existing.querySelector("[data-workspace-search]")?.focus(); return; }
    selectorState.open = true; selectorState.query = ""; selectorState.type = "all"; selectorState.restoreFocus = document.activeElement;
    selectorState.debouncedSearch ||= createDebouncer(searchRelationships, 280);
    const selector = global.MaxAdminSidebar?.WorkspaceSelector({
      activeType: selectorState.type,
      onSearch: (value) => { selectorState.query = value; selectorState.debouncedSearch(); },
      onTypeChange: setSelectorType,
      onClose: closeWorkspaceSelector,
    });
    if (!selector) { document.getElementById("admin-page-search")?.focus(); return; }
    selector.addEventListener("keydown", handleSelectorKeys); document.body.append(selector);
    searchRelationships(); selector.querySelector("[data-workspace-search]")?.focus();
  }

  async function selectRelationship(result) {
    const id = result?.id || (result?.entityType === "lead" ? result?.leadId : result?.customerId);
    if (!id || !["lead", "customer"].includes(result?.entityType)) return;
    setSelectorStatus("Relatie veilig valideren…", "loading");
    try {
      const relationship = await global.ActiveRelationship?.setActiveRelationship?.({ entityType: result.entityType, leadId: result.entityType === "lead" ? id : null, customerId: result.entityType === "customer" ? id : null }, { source: "dashboard-sidebar" });
      if (!relationship) throw new Error("De relatie kon niet worden geselecteerd.");
      rememberRelationship(relationship); syncRelationshipUrl(relationship); closeWorkspaceSelector(); refresh();
    } catch (error) { setSelectorStatus(error.userMessage || error.message || "De relatie kon niet worden geselecteerd.", "error"); }
  }

  function clearWorkspace() {
    try { global.ActiveRelationship?.clearActiveRelationship?.("dashboard-sidebar-clear"); }
    finally { syncRelationshipUrl(null); closeWorkspaceSelector(); refresh(); }
  }

  function toggleSessionPanel(force) {
    const panel = document.getElementById("admin-sidebar-session-panel");
    if (!panel) return;
    const open = typeof force === "boolean" ? force : panel.hidden;
    panel.hidden = !open;
    if (open) panel.querySelector("button, input, select, a")?.focus();
  }

  function canAccessItem(item, context = {}) {
    const role = String(context.role || "").toLowerCase();
    if (item.permission?.roles?.length && role && !item.permission.roles.includes(role)) return false;
    if (typeof context.canAccess === "function") {
      try { return context.canAccess(item) !== false; }
      catch { return false; }
    }
    return true;
  }

  function pilotNavigation(navigation = []) {
    return navigation.map((section) => Object.freeze({
      ...section,
      items: Object.freeze(section.items.filter((item) => !item.secondary)),
    }));
  }

  function refresh(context = {}) {
    const root = document.getElementById("admin-sidebar-root");
    const components = global.MaxAdminSidebar;
    const centralNavigation = global.MaxAdminSidebarNavigation?.ADMIN_SIDEBAR_NAVIGATION;
    if (!root || !components?.AdminSidebar || !centralNavigation) return 0;
    if (Object.keys(context).length) latestAccessContext = context;
    context = { ...latestAccessContext, ...context };
    const navigation = pilotNavigation(centralNavigation);
    const session = readJson(global.localStorage, SESSION_KEY, {});
    const profiles = readJson(global.localStorage, PROFILES_KEY, []);
    const role = context.role || session.role || session.user?.role || "";
    const activeRelationship = safeRelationship(global.ActiveRelationship);
    const liveRelationship = metricState.workspace?.relationship && metricState.workspaceKey === relationshipKey(activeRelationship)
      ? { ...activeRelationship, ...metricState.workspace.relationship }
      : activeRelationship;
    const relationship = relationshipForSidebar(liveRelationship);
    const sidebar = components.AdminSidebar({
      navigation,
      activeId: "dashboard",
      relationship,
      user: resolveUser({ ...session, role }, profiles),
      badgeValues: buildBadgeValues(),
      canAccess: (item) => canAccessItem(item, { ...context, role }),
      onSwitchWorkspace: openWorkspaceSelector,
      onSelectWorkspace: openWorkspaceSelector,
      onClearWorkspace: clearWorkspace,
      profileActions: [
        { label: "Sessiebeheer", onSelect: () => toggleSessionPanel(true) },
        { label: "Uitloggen", onSelect: () => document.getElementById("admin-session-logout")?.click() },
      ],
    });
    sidebar.id = "admin-sidebar";
    root.replaceChildren(sidebar);
    return navigation.reduce((count, section) => count + section.items.filter((item) => !canAccessItem(item, { ...context, role })).length, 0);
  }

  function mount() {
    refresh();
    loadSidebarMetrics();
    document.querySelector("[data-sidebar-session-close]")?.addEventListener("click", () => toggleSessionPanel(false));
    global.addEventListener("maxwebstudio:relationship-change", () => resetWorkspaceMetrics());
    global.addEventListener("maxwebstudio:relationship-ready", () => resetWorkspaceMetrics());
    global.addEventListener("storage", (event) => { if (event.key === SESSION_KEY) loadSidebarMetrics(); else if (event.key === PROFILES_KEY) refresh(); });
    global.addEventListener("maxwebstudio:admin-logout", () => { try { global.sessionStorage?.removeItem(RECENTS_KEY); } catch {} clearMetricState(); closeWorkspaceSelector(); });
    const closeSelectorOutside = (event) => { const selector = document.querySelector(".mws-workspace-selector"); if (selectorState.open && selector && !selector.contains(event.target) && !event.target.closest(".mws-workspace-card,#active-relationship-workspace [data-relationship-switch]")) closeWorkspaceSelector(); };
    document.addEventListener("pointerdown", closeSelectorOutside, true);
    document.addEventListener("click", closeSelectorOutside, true);
    document.addEventListener("click", (event) => { if (!event.target.closest("#active-relationship-workspace [data-relationship-switch]")) return; event.preventDefault(); event.stopImmediatePropagation(); openWorkspaceSelector(); }, true);
  }

  const api = Object.freeze({ buildBadgeValues, canAccessItem, clearMetricState, clearWorkspace, closeWorkspaceSelector, createDebouncer, handleSelectorKeys, loadSidebarMetrics, metricState, openWorkspaceSelector, pilotNavigation, readJson, recentResults, refresh, relationshipForSidebar, relationshipKey, rememberRelationship, resetWorkspaceMetrics, resolveUser, safeRelationship, searchRelationships, selectRelationship, semanticTone, syncRelationshipUrl, toggleSessionPanel });
  global.MaxAdminSidebarPilot = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
