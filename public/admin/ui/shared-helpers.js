(function initMaxSharedUiHelpers() {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  const helpers = {
    ...(window.MaxSharedUI || {}),
    escapeAttribute,
    escapeHtml,
    isProductionRuntime,
  };

  window.MaxSharedUI = helpers;
  window.escapeHtml = helpers.escapeHtml;
  window.escapeAttribute = helpers.escapeAttribute;

  function isProductionRuntime() {
    const host = String(window.location?.hostname || "").toLowerCase();
    const configuredEnvironment = String(window.__MAXWEBSTUDIO_ENV__ || localStorage.getItem("maxwebstudioEnvironment") || "").toUpperCase();
    return host === "maxwebstudio.nl" || host === "www.maxwebstudio.nl" || configuredEnvironment === "PRODUCTION";
  }

  function readJson(key, fallback = null) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
    } catch {
      return fallback;
    }
  }

  function productionSession() {
    const allowedAdminRoles = new Set(["super_admin", "admin", "developer", "designer", "sales_manager", "sales_partner", "support"]);
    const current = readJson("maxwebstudioCurrentSession", null);
    const admin = readJson("maxwebstudioAdminSession", null);
    const mwsAdmin = readJson("mws_admin_supabase_session", null);
    const session = current?.accessToken ? current : admin?.accessToken ? admin : mwsAdmin?.accessToken ? mwsAdmin : null;
    if (!session?.accessToken) return null;
    if (session.isDemo || session.provider === "demo") return null;
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) return null;
    if (!allowedAdminRoles.has(String(session.role || "").trim().toLowerCase())) return null;
    return session;
  }

  function hideProductionOnlyUnsafeUi() {
    if (!isProductionRuntime()) return;
    document.querySelectorAll([
      "[data-developer-only]",
      "[data-developer-only-tab]",
      ".admin-developer-only",
      "#admin-token-card",
      "#admin-token",
      "[data-auth-panel='demo']",
      "[data-demo-role]",
    ].join(",")).forEach((element) => {
      element.hidden = true;
      element.setAttribute("aria-hidden", "true");
    });
    document.querySelectorAll("[data-auth-panel-trigger='demo']").forEach((element) => {
      element.hidden = true;
      element.setAttribute("aria-hidden", "true");
    });
  }

  function guardProductionAdminPage() {
    if (!isProductionRuntime()) return;
    const path = String(window.location?.pathname || "");
    const isAdminPage = /\/admin-[^/]+\.html$/i.test(path);
    if (!isAdminPage) return;
    const session = productionSession();
    if (session) return;
    document.documentElement.classList.add("mws-auth-locked");
    window.location.replace(`/admin-login.html?next=${encodeURIComponent(path)}`);
  }

  hideProductionOnlyUnsafeUi();
  guardProductionAdminPage();
  document.addEventListener("DOMContentLoaded", hideProductionOnlyUnsafeUi);
})();
