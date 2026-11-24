/* Service worker : l'appli s'ouvre instantanément et reste affichable sans réseau.
   Les données (Supabase) ne sont jamais mises en cache ici. */
const VERSION = "planning-xl-20261124";
const CACHE = "actes-" + VERSION;
const COQUILLE = ["./", "index.html", "app.css", "config.js", "supabase.js", "591.supabase.js", "claude-shim.js?v=20261124q", "qr-virement.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icon.svg", "favicon.ico"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith("actes-") && x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (/supabase\.co$/.test(u.hostname)) return; // données : toujours en direct
  const memeSite = u.origin === self.location.origin;
  const polices = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (!memeSite && !polices) return;
  if (e.request.mode === "navigate") {
    // page : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
    e.respondWith(fetch(u.href, { cache: "no-cache", credentials: "same-origin" }).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put("index.html", c)); } return r; }).catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; })));
});
