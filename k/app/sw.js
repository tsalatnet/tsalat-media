// ختمة جماعية — offline: the app shell is kept (refreshed in the background), and every mushaf page
// once seen stays available without network. The server calls (Supabase) are never cached.
const SHELL = "khatma-shell-1", PAGES = "khatma-mushaf-1";
const FILES = ["./", "index.html", "styles.css?v=1", "strings.js?v=1", "core.js?v=1", "app.js?v=1", "icon-192.png", "icon-180.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== PAGES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname.endsWith("supabase.co")) return;
  if (url.pathname.includes("/mushaf/")) {          // pages: cache first
    e.respondWith(caches.open(PAGES).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (url.origin === location.origin) {             // shell: network first, cache when offline
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(e.request, r.clone())); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: false }).then((r) => r || caches.match("index.html"))));
  }
});
