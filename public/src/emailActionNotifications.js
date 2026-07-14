(function initEmailActionNotifications(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EmailActionNotifications = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEmailActionNotifications() {
  "use strict";

  function dutchErrorMessage(error) {
    const message = String(error?.message || error || "").trim();
    if (!message) return "De e-mail kon niet worden verzonden. Probeer het opnieuw.";
    if (/timeout|timed out|abort/i.test(message)) return "De mailserver reageerde niet op tijd. Probeer het opnieuw.";
    if (/network|failed to fetch|connection/i.test(message)) return "De verbinding met de mailserver is verbroken. Controleer je internetverbinding en probeer het opnieuw.";
    if (/auth|jwt|log (eerst )?in|unauthor/i.test(message)) return "Je adminsessie is verlopen. Log opnieuw in en probeer het daarna opnieuw.";
    return message;
  }

  function successMessage({ recipient, template, sentAt = new Date() }) {
    const time = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(sentAt));
    return `E-mail verzonden · ${recipient || "onbekende ontvanger"} · ${template || "template"} · ${time}`;
  }

  function start({ showToast, recipient, template, onOpenTimeline, onRepeat, now = () => new Date() }) {
    const controller = showToast?.(`E-mail naar ${recipient || "de ontvanger"} wordt verstuurd…`, "info", { persistent: true, loading: true });
    return {
      success() {
        const message = successMessage({ recipient, template, sentAt: now() });
        controller?.update(message, "success", {
          duration: 9000,
          actions: [
            { label: "Open tijdlijn", onAction: onOpenTimeline },
            { label: "Nogmaals versturen", onAction: onRepeat },
          ],
        });
        return message;
      },
      failure(error) {
        const message = dutchErrorMessage(error);
        controller?.update(message, "error", {
          duration: 9000,
          actions: [{ label: "Opnieuw proberen", onAction: onRepeat }],
        });
        return message;
      },
    };
  }

  return { dutchErrorMessage, start, successMessage };
});
