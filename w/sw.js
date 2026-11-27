// TSALAT web app — offline: the app shell is kept (network first, cache when offline). The times
// themselves are kept by core.js (localStorage), the Supabase calls are never cached here.
const SHELL = "tsalat-w-1";
const FILES = ["./", "index.html", "styles.css?v=1", "core.js?v=1", "app.js?v=1", "qrcode.js?v=1", "cities.json", "icon-192.png", "icon-180.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("tsalat-w-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname.endsWith("supabase.co") || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
