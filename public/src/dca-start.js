(() => {
  "use strict";
  const contextEndpoint = "/.netlify/functions/client-activation-start";
  const exchangeEndpoint = "/.netlify/functions/client-activation-exchange";
  const byId = (id) => document.getElementById(id);

  async function requestContext(action) {
    const response = await fetch(contextEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action }),
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Deze persoonlijke link is niet beschikbaar.");
    return data;
  }

  function takeFragmentToken() {
    const fragment = String(window.location.hash || "");
    window.history.replaceState(null, "", "/start");
    if (fragment.length !== 65 || !/^#[0-9a-f]{64}$/i.test(fragment)) return "";
    return fragment.slice(1).toLowerCase();
  }

  async function exchange(token) {
    const response = await fetch(exchangeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("Deze persoonlijke link is niet beschikbaar.");
  }

  function showError(message) {
    byId("dca-start-loading").hidden = true;
    byId("dca-start-content").hidden = true;
    byId("dca-start-error").hidden = false;
    byId("dca-start-error-message").textContent = message || "Vraag Max Webstudio om een nieuwe link.";
  }

  async function load() {
    const legacyPath = !/^\/start\/?$/.test(window.location.pathname);
    let token = takeFragmentToken();
    if (legacyPath) return showError("Vraag Max Webstudio om een nieuwe veilige link.");
    try {
      if (token) await exchange(token);
      token = "";
      const data = await requestContext("open");
      const view = data.presentation || {};
      byId("dca-start-name").textContent = view.firstName || "daar";
      byId("dca-start-company").textContent = view.companyName || "jouw bedrijf";
      byId("dca-start-status").textContent = view.status || "Wacht op jouw beoordeling";
      byId("dca-start-delivery").textContent = view.deliveryExpectation || "In overleg";
      byId("dca-start-loading").hidden = true;
      byId("dca-start-content").hidden = false;
    } catch (error) {
      token = "";
      showError(error.message);
    }
  }

  byId("dca-start-preview")?.addEventListener("click", async () => {
    const button = byId("dca-start-preview");
    button.disabled = true;
    byId("dca-start-note").textContent = "Website-preview laden…";
    try {
      const data = await requestContext("preview");
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
