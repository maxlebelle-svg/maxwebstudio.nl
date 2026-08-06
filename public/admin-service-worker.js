const VERSION = "mws-admin-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("mws-admin-") && key !== VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Beveiligde HTML, API-antwoorden en klantdata worden bewust niet onderschept
// of lokaal gecachet. De service worker maakt alleen installatie als web-app
// mogelijk; iedere sessie en iedere dataset blijft netwerk- en servergestuurd.
self.addEventListener("fetch", () => {});
