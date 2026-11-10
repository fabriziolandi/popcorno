// Protezioni standard che il browser applica al sito. Le stesse righe sono in public/_headers
// (file statici: dati, icone, sw.js) e si aggiungono qui alle risposte del Worker (pagine, /relay/).
// - frame-ancestors / X-Frame-Options: nessun altro sito può mostrare Popcorno dentro una sua pagina
//   (niente tocchi "rubati", ad es. su "Elimina l'account").
// - Nessuna regola sugli script o sulle immagini: copertine, Google, Supabase e PostHog restano permessi.
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

// Copia la risposta (quelle di fetch hanno le intestazioni bloccate) e aggiunge le protezioni mancanti.
export function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}
