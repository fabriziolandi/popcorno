// Popcorno: l'app si apre subito anche con poca rete.
const SHELL = "popcorno-shell-v6", DATI = "popcorno-dati-v2", IMG = "popcorno-img";
const FILES = ["/", "/manifest.webmanifest", "/icons/icon-180.png", "/icons/icon-512.png"];
// Stessa logica di cachesToDelete in src/lib/sw-caches.ts.
const cachesToDelete = (names, keep) => names.filter(n => n.startsWith("popcorno-") && !keep.includes(n));
// Stessa logica di assetUrlsFromHtml in src/lib/sw-caches.ts.
const assetUrlsFromHtml = (html, origin) => {
  const out = [];
  for (const m of html.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)) {
    let u;
    try { u = new URL(m[1], origin + "/"); } catch { continue; }
    const p = u.pathname + u.search;
    if (u.origin === origin && u.pathname.startsWith("/assets/") && !out.includes(p)) out.push(p);
  }
  return out;
};
// Stessa logica di isAuthNavigation in src/lib/sw-caches.ts.
const isAuthNavigation = u => ["code", "token_hash", "error_description"].some(k => u.searchParams.has(k));
// La pagina "/" si scarica una volta: si salva e se ne leggono i file /assets/ da salvare con gli altri.
self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => fetch("/").then(r => {
    if (!r.ok) throw new Error("/ " + r.status);
    return c.put("/", r.clone()).then(() => r.text());
  }).then(html => c.addAll(FILES.filter(f => f !== "/").concat(assetUrlsFromHtml(html, location.origin))))));
  self.skipWaiting();
});
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(cachesToDelete(k, [SHELL, DATI, IMG]).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.hostname === "image.tmdb.org") {           // locandine: dalla cache se ci sono
    e.respondWith(caches.open(IMG).then(c => c.match(e.request).then(r => r || fetch(e.request).then(n => { c.put(e.request, n.clone()); return n; }))));
    return;
  }
  if (u.origin !== location.origin) return;
  if (u.pathname.startsWith("/relay/")) return;    // statistiche (PostHog): mai in cache
  if (u.pathname.includes("/data/")) {              // dati: prima la rete, se manca la copia salvata
    e.respondWith(fetch(e.request).then(n => { const c = n.clone(); caches.open(DATI).then(x => x.put(e.request, c)); return n; }).catch(() => caches.match(e.request)));
    return;
  }
  if (e.request.mode === "navigate" && isAuthNavigation(u)) {   // ritorno da un link di accesso: solo rete, mai in cache
    e.respondWith(fetch(e.request));
    return;
  }
  if (e.request.mode === "navigate") {              // pagina: prima la rete, offline la copia di "/"
    e.respondWith(fetch(e.request).then(n => { const c = n.clone(); caches.open(SHELL).then(x => x.put(e.request, c)); return n; }).catch(() => caches.match(e.request).then(r => r || caches.match("/"))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => { const net = fetch(e.request).then(n => { const cl = n.clone(); caches.open(SHELL).then(c => c.put(e.request, cl)); return n; }).catch(() => r); return r || net; }));
});
