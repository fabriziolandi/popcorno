// Quali cache cancellare all'attivazione: solo le vecchie `popcorno-*`.
// La stessa logica è copiata in public/sw.js (il service worker non passa da Vite).
export function cachesToDelete(names: string[], keep: string[]): string[] {
  return names.filter((n) => n.startsWith("popcorno-") && !keep.includes(n));
}

// I file con l'impronta (/assets/…) che la pagina "/" carica: script, fogli di stile, modulepreload.
// Il service worker li salva all'installazione, perché la pagina li chiede prima che lui la controlli.
// La stessa logica è copiata in public/sw.js.
export function assetUrlsFromHtml(html: string, origin: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)) {
    let u: URL;
    try { u = new URL(m[1], origin + "/"); } catch { continue; }
    const p = u.pathname + u.search;
    if (u.origin === origin && u.pathname.startsWith("/assets/") && !out.includes(p)) out.push(p);
  }
  return out;
}

// Il ritorno da un link di accesso (token_hash, code, error_description) non va mai salvato in cache.
// La stessa logica è copiata in public/sw.js.
export function isAuthNavigation(url: URL): boolean {
  return ["code", "token_hash", "error_description"].some((k) => url.searchParams.has(k));
}
