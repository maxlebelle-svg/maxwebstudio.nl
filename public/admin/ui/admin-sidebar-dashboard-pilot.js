(function initAdminSidebarDashboardPilot(global) {
  "use strict";

  const SESSION_KEY = "mws_admin_supabase_session";
  const PROFILES_KEY = "maxwebstudioProfiles";
  const RECENTS_KEY = "mwsAdminRelationshipRecents";
  const PERSPECTIVE_KEY = "mwsAdminPerspectiveMode";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ROLE_LABELS = Object.freeze({
    super_admin: "Super Admin", admin: "Admin", sales_manager: "Sales Manager",
    sales_partner: "Sales Partner", developer: "Developer", designer: "Designer",
    support: "Support", customer: "Klant", demo_user: "Demo Gebruiker",
  });
  const selectorState = { open: false, type: "all", query: "", request: null, restoreFocus: null, debouncedSearch: null };
  const employeeSelectorState = { open: false, query: "", results: [], loading: false, error: "", request: null, requestId: 0, restoreFocus: null, debouncedSearch: null };
  const actorState = { profile: null, loading: false, request: null };
  const perspectiveState = { current: null, request: null, requestId: 0 };
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

  function sessionIsValid(session = readJson(global.localStorage, SESSION_KEY, {})) {
    if (!adminToken()) return false;
    const rawExpiry = session.expiresAt || session.expires_at || session.expires || 0;
    if (!rawExpiry) return true;
    const numeric = Number(rawExpiry);
    const expiresAt = Number.isFinite(numeric) ? (numeric < 100000000000 ? numeric * 1000 : numeric) : Date.parse(rawExpiry);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }

  function clearPerspective(options = {}) {
    const previous = perspectiveState.current; perspectiveState.requestId += 1; perspectiveState.request?.abort(); perspectiveState.request = null; perspectiveState.current = null;
    try { global.sessionStorage?.removeItem(PERSPECTIVE_KEY); } catch {}
    renderPerspectiveBanner(); closeEmployeeSelector();
    if (previous && ["localhost", "127.0.0.1"].includes(global.location?.hostname)) console.info("Admin perspective stopped", { actorProfileId: actorState.profile?.id, viewedProfileId: previous.viewedProfileId });
    if (!options.silent) { refresh(); loadSidebarMetrics(safeRelationship(global.ActiveRelationship), { force: true, perspectiveOnly: true }); }
  }

  function minimalPerspective(employee = {}) {
    if (!UUID.test(String(employee.id || "")) || employee.status !== "active") return null;
    return { viewedProfileId: employee.id, viewedAuthUserId: employee.authUserId || null, name: String(employee.name || "").slice(0, 120), role: String(employee.role || "").slice(0, 40), avatarUrl: employee.avatarUrl || null, selectedAt: new Date().toISOString() };
  }

  async function loadActorProfile() {
    if (!sessionIsValid()) { actorState.profile = null; clearPerspective({ silent: true }); return null; }
    actorState.request?.abort(); const controller = new AbortController(); actorState.request = controller; actorState.loading = true;
    try {
      const response = await global.fetch("/api/account-profile", { headers: { Accept: "application/json", Authorization: `Bearer ${adminToken()}` }, cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || data.profile?.status !== "active") throw new Error(data.error || "Profiel kon niet worden geladen.");
      actorState.profile = data.profile;
      if (data.profile.role !== "super_admin") clearPerspective({ silent: true });
      return data.profile;
    } catch (error) { if (error.name !== "AbortError") { actorState.profile = null; clearPerspective({ silent: true }); } return null; }
    finally { if (actorState.request === controller) { actorState.request = null; actorState.loading = false; refresh(); } }
  }

  async function validatePerspective(viewedProfileId) {
    if (actorState.profile?.role !== "super_admin" || !sessionIsValid() || !UUID.test(String(viewedProfileId || ""))) return null;
    perspectiveState.request?.abort(); const controller = new AbortController(); perspectiveState.request = controller; perspectiveState.requestId += 1; const requestId = perspectiveState.requestId;
    try {
      const response = await global.fetch(`/api/admin-employee-search?id=${encodeURIComponent(viewedProfileId)}`, { headers: { Accept: "application/json", Authorization: `Bearer ${adminToken()}` }, cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.employee || requestId !== perspectiveState.requestId) return null;
      return minimalPerspective(data.employee);
    } catch { return null; }
    finally { if (perspectiveState.request === controller) perspectiveState.request = null; }
  }

  async function restorePerspective() {
    const stored = readJson(global.sessionStorage, PERSPECTIVE_KEY, null);
    if (!stored?.viewedProfileId) return null;
    const validated = await validatePerspective(stored.viewedProfileId);
    if (!validated) { clearPerspective({ silent: true }); return null; }
    perspectiveState.current = validated; try { global.sessionStorage?.setItem(PERSPECTIVE_KEY, JSON.stringify(validated)); } catch {}
    renderPerspectiveBanner(); refresh(); return validated;
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

    const cacheKey = `${key}|${perspectiveState.current?.viewedProfileId || "actor"}`;
    const cached = key ? metricState.cache.get(cacheKey) : null;
    if (!options.force && cached && Date.now() - cached.storedAt < 30000) {
      metricState.workspace = cached.workspace; metricState.loadingWorkspace = false; refresh(); return;
    }
    metricState.loadingGeneral = true;
    metricState.loadingWorkspace = options.perspectiveOnly ? false : Boolean(key);
    metricState.general = null;
    if (!options.perspectiveOnly) metricState.workspace = null;
    refresh();
    const controller = new AbortController(); metricState.request = controller;
    const params = new URLSearchParams();
    if (key) { const [entityType, id] = key.split(":"); params.set("entityType", entityType); params.set("id", id); }
    if (perspectiveState.current?.viewedProfileId) params.set("viewedProfileId", perspectiveState.current.viewedProfileId);
    try {
      const response = await global.fetch(`/api/admin-sidebar-metrics${params.size ? `?${params}` : ""}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Sidebarinformatie kon niet worden geladen.");
      if (requestId !== metricState.requestId || key !== metricState.workspaceKey) return;
      metricState.general = data.general || null;
      metricState.workspace = key ? data.workspace || null : null;
      if (key && data.workspace) metricState.cache.set(cacheKey, { workspace: data.workspace, storedAt: Date.now() });
    } catch (error) {
      if (error.name === "AbortError" || requestId !== metricState.requestId) return;
      if (!metricState.general) metricState.general = { openLeads: null, errors: [{ metric: "openLeads", code: "ENDPOINT_FAILED" }] };
      if (!options.perspectiveOnly) metricState.workspace = null;
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

  function roleLabel(role) { return ROLE_LABELS[role] || String(role || "").replaceAll("_", " ") || "Rol onbekend"; }

  function renderPerspectiveBanner() {
    document.querySelector(".mws-perspective-banner")?.remove();
    const perspective = perspectiveState.current;
    if (!perspective) return;
    const banner = document.createElement("section"); banner.className = "mws-perspective-banner"; banner.setAttribute("role", "status");
    const copy = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = `Je bekijkt het dashboard vanuit het perspectief van ${perspective.name}`;
    const detail = document.createElement("span"); detail.textContent = `${roleLabel(perspective.role)} · Echte gebruiker: ${actorState.profile?.name || "jezelf"}`; copy.append(title, detail);
    const stop = document.createElement("button"); stop.type = "button"; stop.textContent = "Terug naar mijn dashboard"; stop.addEventListener("click", () => clearPerspective());
    banner.append(copy, stop);
    const topbar = document.querySelector(".admin-page-topbar");
    if (topbar?.insertAdjacentElement) topbar.insertAdjacentElement("afterend", banner); else document.querySelector(".admin-crm-main")?.prepend?.(banner);
  }

  function closeEmployeeSelector() {
    employeeSelectorState.debouncedSearch?.cancel(); employeeSelectorState.request?.abort(); employeeSelectorState.request = null; employeeSelectorState.open = false;
    document.querySelector(".mws-employee-selector")?.remove();
    const focusTarget = employeeSelectorState.restoreFocus?.isConnected ? employeeSelectorState.restoreFocus : document.querySelector(".mws-user-profile-trigger");
    employeeSelectorState.restoreFocus = null; focusTarget?.focus?.();
  }

  function handleEmployeeSelectorKeys(event) {
    if (event.key === "Escape") { event.preventDefault(); closeEmployeeSelector(); return; }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const options = [...document.querySelectorAll(".mws-employee-result")]; if (!options.length) return;
    event.preventDefault(); const current = options.indexOf(document.activeElement); const next = event.key === "ArrowDown" ? (current + 1) % options.length : (current <= 0 ? options.length - 1 : current - 1); options[next].focus();
  }

  function renderEmployeeSelector({ focusSearch = false } = {}) {
    const existing = document.querySelector(".mws-employee-selector");
    const searchHadFocus = Boolean(existing?.contains(document.activeElement) && document.activeElement?.dataset?.employeeSearch);
    const selector = global.MaxAdminSidebar?.EmployeeSelector?.({
      results: employeeSelectorState.results.map((employee) => ({ ...employee, roleLabel: roleLabel(employee.role) })), loading: employeeSelectorState.loading,
      query: employeeSelectorState.query, error: employeeSelectorState.error, current: perspectiveState.current,
      onSearch: (value) => { employeeSelectorState.query = value; employeeSelectorState.debouncedSearch(); }, onSelect: selectPerspective, onStop: () => clearPerspective(), onClose: closeEmployeeSelector,
    });
    if (!selector) return; selector.addEventListener("keydown", handleEmployeeSelectorKeys);
    if (existing) existing.replaceWith(selector); else document.body.append(selector);
    if (focusSearch || searchHadFocus) selector.querySelector?.("[data-employee-search]")?.focus();
  }

  async function searchEmployees() {
    if (actorState.profile?.role !== "super_admin") { closeEmployeeSelector(); return; }
    const query = employeeSelectorState.query.trim();
    if (query && query.length < 2) { employeeSelectorState.results = []; employeeSelectorState.loading = false; employeeSelectorState.error = ""; renderEmployeeSelector(); return; }
    employeeSelectorState.request?.abort(); const controller = new AbortController(); employeeSelectorState.request = controller; employeeSelectorState.requestId += 1; const requestId = employeeSelectorState.requestId;
    employeeSelectorState.loading = true; employeeSelectorState.error = ""; renderEmployeeSelector();
    try {
      const params = new URLSearchParams({ limit: "20" }); if (query) params.set("q", query);
      const response = await global.fetch(`/api/admin-employee-search?${params}`, { headers: { Accept: "application/json", Authorization: `Bearer ${adminToken()}` }, cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({})); if (!response.ok || !data.success) throw new Error(data.error || "Medewerkers konden niet worden geladen.");
      if (requestId !== employeeSelectorState.requestId) return; employeeSelectorState.results = Array.isArray(data.results) ? data.results.slice(0, 20) : [];
    } catch (error) { if (error.name === "AbortError" || requestId !== employeeSelectorState.requestId) return; employeeSelectorState.results = []; employeeSelectorState.error = error.message || "Medewerkers konden niet worden geladen."; }
    finally { if (requestId === employeeSelectorState.requestId) { employeeSelectorState.loading = false; employeeSelectorState.request = null; renderEmployeeSelector(); } }
  }

  function openEmployeeSelector() {
    if (actorState.profile?.role !== "super_admin") return;
    employeeSelectorState.open = true; employeeSelectorState.query = ""; employeeSelectorState.results = []; employeeSelectorState.error = ""; employeeSelectorState.restoreFocus = document.activeElement;
    employeeSelectorState.debouncedSearch ||= createDebouncer(searchEmployees, 280); renderEmployeeSelector({ focusSearch: true }); searchEmployees();
  }

  async function selectPerspective(employee) {
    metricState.requestId += 1; metricState.request?.abort(); metricState.request = null; metricState.general = null; metricState.loadingGeneral = true; refresh();
    const validated = await validatePerspective(employee?.id); if (!validated) { employeeSelectorState.error = "Deze medewerker is niet meer beschikbaar."; metricState.loadingGeneral = false; renderEmployeeSelector(); loadSidebarMetrics(safeRelationship(global.ActiveRelationship), { force: true, perspectiveOnly: true }); return false; }
    perspectiveState.current = validated; try { global.sessionStorage?.setItem(PERSPECTIVE_KEY, JSON.stringify(validated)); } catch {}
    closeEmployeeSelector(); renderPerspectiveBanner(); refresh(); await loadSidebarMetrics(safeRelationship(global.ActiveRelationship), { force: true, perspectiveOnly: true });
    if (["localhost", "127.0.0.1"].includes(global.location?.hostname)) console.info("Admin perspective enabled", { actorProfileId: actorState.profile?.id, viewedProfileId: validated.viewedProfileId });
    return true;
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

  function currentSidebarItemId(navigation = [], location = global.location || {}) {
    const path = String(location.pathname || "").split("/").pop() || "admin-dashboard.html";
    const hash = String(location.hash || "");
    const items = navigation.flatMap((section) => section.items || []);
    const exact = items.find((item) => { const [routePath, routeHash = ""] = String(item.route || "").split("#"); return routePath === path && (routeHash ? `#${routeHash}` === hash : !hash); });
    const fallback = items.find((item) => String(item.route || "").split("#")[0] === path && !item.secondary);
    return (exact || fallback)?.id || "";
  }

  async function logoutFromSidebar() {
    const localLogout = document.getElementById("admin-session-logout");
    if (localLogout) { localLogout.click(); return; }
    try {
      const auth = await import("/src/services/adminAuthBridgeService.js");
      await auth.logoutAdmin();
      global.location.assign?.("/admin-login.html");
    } catch (error) {
      console.error("Shared admin logout failed", { code: error?.code || "LOGOUT_FAILED" });
    }
  }

  function profileActionsFor(actor = {}) {
    return [
      { label: "Mijn profiel", disabled: true },
      { label: "Instellingen", href: "admin-instellingen.html" },
      ...(actor.role === "super_admin" ? [{ label: "Bekijk als medewerker", onSelect: openEmployeeSelector }] : []),
      { label: "Uitloggen", onSelect: logoutFromSidebar },
    ];
  }

  function renderPageWorkspaceContext(relationship = safeRelationship(global.ActiveRelationship)) {
    if (document.body?.dataset.sharedAdminSidebar !== "true") return;
    let context = document.querySelector(".mws-page-workspace-context");
    const main = document.querySelector(".admin-crm-main");
    if (!main) return;
    if (!context) {
      context = document.createElement("section"); context.className = "mws-page-workspace-context"; context.setAttribute("aria-live", "polite");
      const anchor = main.querySelector(".admin-page-topbar, .admin-hero, .admin-section");
      if (anchor?.insertAdjacentElement) anchor.insertAdjacentElement("afterend", context); else main.prepend(context);
    }
    if (!relationship) { context.textContent = "Geen actieve werkruimte · deze pagina blijft in de algemene weergave."; context.classList.remove("is-active"); return; }
    const type = relationship.entityType === "lead" ? "Lead" : "Klant";
    context.textContent = `Actieve werkruimte: ${relationship.companyName || "Onbekende relatie"} · ${type}`;
    context.classList.add("is-active");
  }

  function refresh(context = {}) {
    const root = document.getElementById("admin-sidebar-root");
    const components = global.MaxAdminSidebar;
    const centralNavigation = global.MaxAdminSidebarNavigation?.ADMIN_SIDEBAR_NAVIGATION;
    if (!root || !components?.AdminSidebar || !centralNavigation) return 0;
    if (Object.keys(context).length) latestAccessContext = context;
    context = { ...latestAccessContext, ...context };
    const navigation = pilotNavigation(centralNavigation);
    const activeId = currentSidebarItemId(navigation);
    const session = readJson(global.localStorage, SESSION_KEY, {});
    const profiles = readJson(global.localStorage, PROFILES_KEY, []);
    const fallbackUser = resolveUser(session, profiles);
    const actor = actorState.profile ? { ...fallbackUser, ...actorState.profile, roleLabel: roleLabel(actorState.profile.role) } : fallbackUser;
    const role = actor.role || context.role || session.role || session.user?.role || "";
    const activeRelationship = safeRelationship(global.ActiveRelationship);
    const liveRelationship = metricState.workspace?.relationship && metricState.workspaceKey === relationshipKey(activeRelationship)
      ? { ...activeRelationship, ...metricState.workspace.relationship }
      : activeRelationship;
    const relationship = relationshipForSidebar(liveRelationship);
    const sidebar = components.AdminSidebar({
      navigation,
      activeId,
      relationship,
      user: actor,
      perspective: perspectiveState.current,
      badgeValues: buildBadgeValues(),
      canAccess: (item) => canAccessItem(item, { ...context, role }),
      onSwitchWorkspace: openWorkspaceSelector,
      onSelectWorkspace: openWorkspaceSelector,
      onClearWorkspace: clearWorkspace,
      profileActions: profileActionsFor(actorState.profile || {}),
    });
    sidebar.id = "admin-sidebar";
    root.replaceChildren(sidebar);
    renderPageWorkspaceContext(activeRelationship);
    return navigation.reduce((count, section) => count + section.items.filter((item) => !canAccessItem(item, { ...context, role })).length, 0);
  }

  function validateSessionState() {
    if (sessionIsValid()) return true;
    actorState.profile = null; clearPerspective({ silent: true }); clearMetricState(); return false;
  }

  async function initializeProfileAndMetrics() {
    const profile = await loadActorProfile();
    if (profile?.role === "super_admin") await restorePerspective();
    renderPerspectiveBanner(); refresh(); await loadSidebarMetrics();
  }

  function mount() {
    refresh();
    initializeProfileAndMetrics();
    document.querySelector("[data-sidebar-session-close]")?.addEventListener("click", () => toggleSessionPanel(false));
    global.addEventListener("maxwebstudio:relationship-change", () => resetWorkspaceMetrics());
    global.addEventListener("maxwebstudio:relationship-ready", () => resetWorkspaceMetrics());
    global.addEventListener("storage", (event) => { if (event.key === SESSION_KEY) { clearPerspective({ silent: true }); initializeProfileAndMetrics(); } else if (event.key === PROFILES_KEY) refresh(); });
    global.addEventListener("focus", validateSessionState);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") validateSessionState(); });
    global.addEventListener("maxwebstudio:admin-logout", () => { try { global.sessionStorage?.removeItem(RECENTS_KEY); } catch {} actorState.profile = null; clearPerspective({ silent: true }); clearMetricState(); closeWorkspaceSelector(); });
    const closeSelectorOutside = (event) => { const selector = document.querySelector(".mws-workspace-selector"); if (selectorState.open && selector && !selector.contains(event.target) && !event.target.closest(".mws-workspace-card,#active-relationship-workspace [data-relationship-switch]")) closeWorkspaceSelector(); };
    document.addEventListener("pointerdown", closeSelectorOutside, true);
    document.addEventListener("click", closeSelectorOutside, true);
    document.addEventListener("click", (event) => { if (!event.target.closest("#active-relationship-workspace [data-relationship-switch]")) return; event.preventDefault(); event.stopImmediatePropagation(); openWorkspaceSelector(); }, true);
  }

  const api = Object.freeze({ actorState, buildBadgeValues, canAccessItem, clearMetricState, clearPerspective, clearWorkspace, closeEmployeeSelector, closeWorkspaceSelector, createDebouncer, currentSidebarItemId, employeeSelectorState, handleEmployeeSelectorKeys, handleSelectorKeys, loadActorProfile, loadSidebarMetrics, logoutFromSidebar, metricState, minimalPerspective, openEmployeeSelector, openWorkspaceSelector, perspectiveState, pilotNavigation, profileActionsFor, readJson, recentResults, refresh, relationshipForSidebar, relationshipKey, rememberRelationship, renderPageWorkspaceContext, resetWorkspaceMetrics, resolveUser, restorePerspective, safeRelationship, searchEmployees, searchRelationships, selectPerspective, selectRelationship, semanticTone, sessionIsValid, syncRelationshipUrl, toggleSessionPanel, validatePerspective, validateSessionState });
  global.MaxAdminSidebarPilot = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
