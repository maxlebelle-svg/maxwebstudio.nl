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
  };

  window.MaxSharedUI = helpers;
  window.escapeHtml = helpers.escapeHtml;
  window.escapeAttribute = helpers.escapeAttribute;
})();
