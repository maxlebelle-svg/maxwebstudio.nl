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
    // The async central guard restores and verifies Supabase before deciding.
    // A legacy UX session must never redirect on its own.
    document.documentElement.dataset.adminAccess ||= "checking";
  }

  hideProductionOnlyUnsafeUi();
  guardProductionAdminPage();
  document.addEventListener("DOMContentLoaded", hideProductionOnlyUnsafeUi);
})();
