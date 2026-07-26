(() => {
  "use strict";
  const endpoint = "/.netlify/functions/client-activation-start";
  let token = "";
  const byId = (id) => document.getElementById(id);

  async function request(action) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action, token }),
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Deze persoonlijke link is niet beschikbaar.");
    return data;
  }

  function readToken() {
    const match = window.location.pathname.match(/^\/start\/([0-9a-f]{64})\/?$/i);
    return match ? match[1].toLowerCase() : "";
  }

  function showError(message) {
    byId("dca-start-loading").hidden = true;
    byId("dca-start-content").hidden = true;
    byId("dca-start-error").hidden = false;
    byId("dca-start-error-message").textContent = message || "Vraag Max Webstudio om een nieuwe link.";
  }

  async function load() {
    token = readToken();
    if (!token) return showError("De link is onvolledig. Vraag Max Webstudio om een nieuwe link.");
    try {
      const data = await request("open");
      const view = data.presentation || {};
      byId("dca-start-name").textContent = view.firstName || "daar";
      byId("dca-start-company").textContent = view.companyName || "jouw bedrijf";
      byId("dca-start-status").textContent = view.status || "Wacht op jouw beoordeling";
      byId("dca-start-delivery").textContent = view.deliveryExpectation || "In overleg";
      byId("dca-start-loading").hidden = true;
      byId("dca-start-content").hidden = false;
    } catch (error) {
      showError(error.message);
    }
  }

  byId("dca-start-preview")?.addEventListener("click", async () => {
    const button = byId("dca-start-preview");
    button.disabled = true;
    byId("dca-start-note").textContent = "Website-preview laden…";
    try {
      const data = await request("preview");
      byId("dca-preview-frame").srcdoc = data.preview?.html || "";
      byId("dca-preview-dialog").hidden = false;
      byId("dca-start-note").textContent = "";
    } catch (error) {
      byId("dca-start-note").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  byId("dca-preview-close")?.addEventListener("click", () => {
    byId("dca-preview-frame").srcdoc = "";
    byId("dca-preview-dialog").hidden = true;
  });
  byId("dca-start-activate")?.addEventListener("click", () => {
    byId("dca-start-note").textContent = "Accountactivatie volgt in de volgende veilige stap. Je website bekijken kan nu al.";
  });
  load();
})();
