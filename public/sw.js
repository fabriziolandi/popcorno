// Popcorno: l'app si apre subito anche con poca rete.
const SHELL = "popcorno-shell-v6", DATI = "popcorno-dati-v3", IMG = "popcorno-img";
const MAX_IMG = 200;   // locandine tenute al massimo: oltre, si tolgono le più vecchie
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
// Si salva solo una risposta buona: un errore (404, 500…) non prende mai il posto di una copia buona.
// Le locandine arrivano "opache" (da un altro sito, senza CORS): non se ne vede l'esito e si tengono.
const good = r => r && (r.ok || r.type === "opaque");
const save = (name, key, r) => { if (good(r)) caches.open(name).then(c => c.put(key, r)); };
// Locandine: dopo averne salvata una, se sono più di MAX_IMG si tolgono le più vecchie.
const trim = c => c.keys().then(k => Promise.all(k.slice(0, Math.max(0, k.length - MAX_IMG)).map(x => c.delete(x))));
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
    e.respondWith(caches.open(IMG).then(c => c.match(e.request).then(r => r || fetch(e.request).then(n => { if (good(n)) c.put(e.request, n.clone()).then(() => trim(c)); return n; }))));
    return;
  }
  if (u.origin !== location.origin) return;
  if (u.pathname.startsWith("/relay/")) return;    // statistiche (PostHog): mai in cache
  if (u.pathname.includes("/data/")) {              // dati: prima la rete, se manca (o dà errore) la copia salvata
    // Una sola copia per file: la chiave è l'indirizzo senza ?t=/?versione, che cambiano spesso.
    const key = u.origin + u.pathname;
    e.respondWith(fetch(e.request).then(n => {
      if (good(n)) { save(DATI, key, n.clone()); return n; }
      return caches.match(key).then(r => r || n);
    }).catch(() => caches.match(key)));
    return;
  }
  if (e.request.mode === "navigate" && isAuthNavigation(u)) {   // ritorno da un link di accesso: solo rete, mai in cache
    e.respondWith(fetch(e.request));
    return;
  }
  if (e.request.mode === "navigate") {              // pagina: prima la rete, offline la copia di "/"
    e.respondWith(fetch(e.request).then(n => { save(SHELL, e.request, n.clone()); return n; }).catch(() => caches.match(e.request).then(r => r || caches.match("/"))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => { const net = fetch(e.request).then(n => { save(SHELL, e.request, n.clone()); return n; }).catch(() => r); return r || net; }));
});
