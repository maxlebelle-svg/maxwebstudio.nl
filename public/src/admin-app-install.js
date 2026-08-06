const PRODUCTION_HOSTS = new Set(["maxwebstudio.nl", "www.maxwebstudio.nl"]);

async function registerAdminApp() {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;
  if (!PRODUCTION_HOSTS.has(window.location.hostname)) return;

  try {
    await navigator.serviceWorker.register("/admin-service-worker.js", { scope: "/admin" });
  } catch (error) {
    console.warn("Max Webstudio Admin kon niet als web-app worden geregistreerd.", {
      message: error?.message || "Onbekende fout",
    });
  }
}

registerAdminApp();
