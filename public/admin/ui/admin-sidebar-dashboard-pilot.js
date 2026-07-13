(function initAdminSidebarDashboardPilot(global) {
  "use strict";

  const SESSION_KEY = "mws_admin_supabase_session";
  const PROFILES_KEY = "maxwebstudioProfiles";
  const ROLE_LABELS = Object.freeze({
    super_admin: "Super Admin", admin: "Admin", sales_manager: "Sales Manager",
    sales_partner: "Sales Partner", developer: "Developer", designer: "Designer",
    support: "Support", customer: "Klant", demo_user: "Demo Gebruiker",
  });

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

  function openWorkspaceSelector() {
    if (global.MaxCommand?.open) { global.MaxCommand.open(""); return; }
    document.getElementById("admin-page-search")?.focus();
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
  }

  const api = Object.freeze({ canAccessItem, pilotNavigation, readJson, refresh, relationshipForSidebar, resolveUser, safeRelationship, toggleSessionPanel });
  global.MaxAdminSidebarPilot = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
