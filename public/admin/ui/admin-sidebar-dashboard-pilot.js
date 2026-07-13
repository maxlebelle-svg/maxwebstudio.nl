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
    return { ...relationship, statusTone: relationship.entityType === "lead" ? "info" : "success" };
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
    const relationship = relationshipForSidebar(safeRelationship(global.ActiveRelationship));
    const sidebar = components.AdminSidebar({
      navigation,
      activeId: "dashboard",
      relationship,
      user: resolveUser({ ...session, role }, profiles),
      badgeValues: {},
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
    document.querySelector("[data-sidebar-session-close]")?.addEventListener("click", () => toggleSessionPanel(false));
    global.addEventListener("maxwebstudio:relationship-change", () => refresh());
    global.addEventListener("maxwebstudio:relationship-ready", () => refresh());
    global.addEventListener("storage", (event) => { if ([SESSION_KEY, PROFILES_KEY].includes(event.key)) refresh(); });
    global.addEventListener("maxwebstudio:admin-logout", () => { try { global.sessionStorage?.removeItem(RECENTS_KEY); } catch {} closeWorkspaceSelector(); });
    const closeSelectorOutside = (event) => { const selector = document.querySelector(".mws-workspace-selector"); if (selectorState.open && selector && !selector.contains(event.target) && !event.target.closest(".mws-workspace-card,#active-relationship-workspace [data-relationship-switch]")) closeWorkspaceSelector(); };
    document.addEventListener("pointerdown", closeSelectorOutside, true);
    document.addEventListener("click", closeSelectorOutside, true);
    document.addEventListener("click", (event) => { if (!event.target.closest("#active-relationship-workspace [data-relationship-switch]")) return; event.preventDefault(); event.stopImmediatePropagation(); openWorkspaceSelector(); }, true);
  }

  const api = Object.freeze({ canAccessItem, clearWorkspace, closeWorkspaceSelector, createDebouncer, handleSelectorKeys, openWorkspaceSelector, pilotNavigation, readJson, recentResults, refresh, relationshipForSidebar, rememberRelationship, resolveUser, safeRelationship, searchRelationships, selectRelationship, syncRelationshipUrl, toggleSessionPanel });
  global.MaxAdminSidebarPilot = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
