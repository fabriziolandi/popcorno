// Popcorno: l'app si apre subito anche con poca rete.
const SHELL = "popcorno-shell-v2", DATI = "popcorno-dati", IMG = "popcorno-img";
const FILES = ["./", "index.html", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith("popcorno-shell") && n !== SHELL).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.hostname === "image.tmdb.org") {           // locandine: dalla cache se ci sono
    e.respondWith(caches.open(IMG).then(c => c.match(e.request).then(r => r || fetch(e.request).then(n => { c.put(e.request, n.clone()); return n; }))));
    return;
  }
  if (u.origin !== location.origin) return;
  if (e.request.mode === "navigate" || u.pathname.includes("/data/")) {   // pagina e dati: prima la rete              // dati: prima la rete, se manca la copia salvata
    e.respondWith(fetch(e.request).then(n => { const c = n.clone(); caches.open(DATI).then(x => x.put(e.request, c)); return n; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => { const net = fetch(e.request).then(n => { const cl = n.clone(); caches.open(SHELL).then(c => c.put(e.request, cl)); return n; }).catch(() => r); return r || net; }));
});
