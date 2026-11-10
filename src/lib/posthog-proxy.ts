// Le statistiche passano dal nostro dominio (popcorno.it/relay/...) e il Worker le inoltra a PostHog EU.
// Così i blocchi pubblicità che fermano eu.i.posthog.com non fanno sparire una parte delle visite.
export const RELAY_PATH = "/relay";

const API_HOST = "eu.i.posthog.com";
const ASSET_HOST = "eu-assets.i.posthog.com";

// Solo gli indirizzi che servono alle statistiche: eventi (/e/, /i/), registrazioni (/s/), opzioni
// (/flags/, /decide/, /array/…/config) e gli script di PostHog (/static/). Tutto il resto (ad es. le
// API /api/… dei sondaggi o dell'amministrazione) riceve 404 senza arrivare a PostHog.
const ALLOWED = ["/e/", "/i/", "/s/", "/batch/", "/flags/", "/decide/", "/static/", "/array/"];
export function relayAllowed(url: URL): boolean {
  const rest = url.pathname.slice(RELAY_PATH.length);
  return ALLOWED.some((p) => rest.startsWith(p));
}

// /relay/static/... (script del registratore, ecc.) va al server dei file, il resto all'API.
export function posthogTarget(url: URL): URL {
  const rest = url.pathname.slice(RELAY_PATH.length) || "/";
  const host = rest.startsWith("/static/") || rest.startsWith("/array/") ? ASSET_HOST : API_HOST;
  return new URL(rest + url.search, `https://${host}`);
}

export async function proxyPosthog(req: Request, f: typeof fetch = fetch): Promise<Response> {
  if (!relayAllowed(new URL(req.url))) return new Response(null, { status: 404 });
  const headers = new Headers(req.headers);
  // I cookie di popcorno.it non servono a PostHog.
  headers.delete("cookie");
  headers.delete("host");
  // L'indirizzo del visitatore serve solo per il paese (PostHog poi lo anonimizza).
  const ip = req.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for", ip);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  try {
    const res = await f(posthogTarget(new URL(req.url)).toString(), {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
    });
    const out = new Headers(res.headers);
    out.delete("set-cookie");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  } catch {
    return new Response(null, { status: 502 });
  }
}
