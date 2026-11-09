import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { assetUrlsFromHtml, cachesToDelete, isAuthNavigation } from "../src/lib/sw-caches";

// Pagina SSR finta: i file con l'impronta in /assets/ e altri indirizzi da non salvare.
const PAGINA = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/assets/app-abc.css"/>
<link rel="modulepreload" href="/assets/routes-ghi.js"/>
<link rel="icon" href="/icons/icon-180.png"/>
<link rel="preconnect" href="https://image.tmdb.org/assets/x.js"/>
<link rel="canonical" href="https://popcorno.it/"/>
</head><body><script type="module" src="/assets/index-def.js"></script>
<script src="//cdn.example/assets/y.js"></script><a href="/privacy/">Privacy</a></body></html>`;
const ASSETS = ["/assets/app-abc.css", "/assets/routes-ghi.js", "/assets/index-def.js"];

describe("cachesToDelete", () => {
  it("cancella solo le vecchie popcorno-* e tiene le locandine", () => {
    expect(
      cachesToDelete(
        ["popcorno-shell-v3", "popcorno-dati", "popcorno-img", "altro"],
        ["popcorno-shell-v6", "popcorno-dati-v2", "popcorno-img"],
      ),
    ).toEqual(["popcorno-shell-v3", "popcorno-dati"]);
  });
});

describe("isAuthNavigation", () => {
  it("vera se la query ha code, token_hash o error_description", () => {
    expect(isAuthNavigation(new URL("https://popcorno.it/?token_hash=abc&type=email"))).toBe(true);
    expect(isAuthNavigation(new URL("https://popcorno.it/?code=xyz"))).toBe(true);
    expect(isAuthNavigation(new URL("https://popcorno.it/?error_description=scaduto"))).toBe(true);
  });
  it("falsa per le pagine normali", () => {
    expect(isAuthNavigation(new URL("https://popcorno.it/"))).toBe(false);
    expect(isAuthNavigation(new URL("https://popcorno.it/?v=1&tipo=film"))).toBe(false);
  });
});

describe("assetUrlsFromHtml", () => {
  it("prende solo i file /assets/ dello stesso sito, da src e href, senza doppioni", () => {
    expect(assetUrlsFromHtml(PAGINA + PAGINA, "https://popcorno.it")).toEqual(ASSETS);
  });
  it("pagina senza file /assets/: lista vuota", () => {
    expect(assetUrlsFromHtml("<p>ciao</p>", "https://popcorno.it")).toEqual([]);
  });
});

describe("public/sw.js", () => {
  it("passa node --check", () => {
    expect(() => execFileSync(process.execPath, ["--check", "public/sw.js"])).not.toThrow();
  });

  // Mini ambiente da service worker: Cache API e fetch finti.
  function carica(rete: (url: string) => Response | Promise<Response>, esistenti: string[] = []) {
    const store = new Map<string, Map<string, Response>>(esistenti.map((n) => [n, new Map()]));
    const handlers: Record<string, (e: any) => void> = {};
    // Come la vera Cache API: gli indirizzi relativi valgono rispetto al sito.
    const chiave = (r: any) => new URL(typeof r === "string" ? r : r.url, "https://popcorno.it/").href;
    const cacheObj = (m: Map<string, Response>) => ({
      addAll: async (urls: string[]) => { for (const u of urls) m.set(chiave(u), await rete(u)); },
      match: async (r: any) => m.get(chiave(r))?.clone(),
      put: async (r: any, res: Response) => { m.set(chiave(r), res); },
    });
    const caches = {
      open: async (n: string) => { if (!store.has(n)) store.set(n, new Map()); return cacheObj(store.get(n)!); },
      keys: async () => [...store.keys()],
      delete: async (n: string) => store.delete(n),
      match: async (r: any) => { for (const m of store.values()) { const x = m.get(chiave(r)); if (x) return x.clone(); } },
    };
    const log = { skipWaiting: 0, claim: 0, fetched: [] as string[] };
    const self = {
      addEventListener: (t: string, f: any) => { handlers[t] = f; },
      skipWaiting: () => { log.skipWaiting++; },
      clients: { claim: async () => { log.claim++; } },
    };
    const ctx: any = {
      self, caches, URL, Response, Promise,
      location: { origin: "https://popcorno.it" },
      fetch: async (r: any) => { const u = typeof r === "string" ? r : r.url; log.fetched.push(u); return rete(u); },
    };
    vm.createContext(ctx);
    vm.runInContext(readFileSync("public/sw.js", "utf8"), ctx);
    const run = async (tipo: string, e: any = {}) => {
      const ps: Promise<any>[] = [];
      handlers[tipo]({ ...e, waitUntil: (p: Promise<any>) => ps.push(p), respondWith: (p: any) => ps.push(Promise.resolve(p)) });
      return Promise.all(ps);
    };
    const richiesta = (url: string, extra: any = {}) => ({ url, method: "GET", mode: "cors", ...extra });
    return { store, handlers, log, run, richiesta };
  }
  const ok = (t = "x") => new Response(t);

  it("install: salva la shell in popcorno-shell-v6 e chiama skipWaiting", async () => {
    const sw = carica(() => ok());
    await sw.run("install");
    expect([...sw.store.keys()]).toEqual(["popcorno-shell-v6"]);
    expect([...sw.store.get("popcorno-shell-v6")!.keys()]).toContain("https://popcorno.it/");
    expect(sw.log.skipWaiting).toBe(1);
  });

  it("install: salva anche i file /assets/ della pagina, non quelli di altri siti", async () => {
    const sw = carica((u) => (u === "/" ? ok(PAGINA) : ok("file " + u)));
    await sw.run("install");
    const shell = sw.store.get("popcorno-shell-v6")!;
    const attesi = [...["/", "/manifest.webmanifest", "/icons/icon-180.png", "/icons/icon-512.png"], ...ASSETS].map((u) => "https://popcorno.it" + u);
    expect([...shell.keys()].sort()).toEqual(attesi.sort());
    expect(await shell.get("https://popcorno.it/assets/index-def.js")!.clone().text()).toBe("file /assets/index-def.js");
    expect(await shell.get("https://popcorno.it/")!.clone().text()).toBe(PAGINA);
    expect(sw.log.fetched.filter((u) => u.includes("example") || u.includes("tmdb"))).toEqual([]);
    expect(sw.log.skipWaiting).toBe(1);
  });

  it("install: riesce anche se la pagina non ha file /assets/", async () => {
    const sw = carica(() => ok("<p>niente</p>"));
    const [r] = await sw.run("install");
    expect(r).toBeUndefined();
    expect(sw.store.get("popcorno-shell-v6")!.size).toBe(4);
  });

  it("fetch: un file /assets/ salvato arriva dalla cache anche offline; uno nuovo va in rete e si salva", async () => {
    let online = true;
    const sw = carica((u) => { if (!online) throw new Error("offline"); return u === "/" ? ok(PAGINA) : ok("rete " + u); });
    await sw.run("install");
    online = false;
    const [r1] = await sw.run("fetch", { request: sw.richiesta("https://popcorno.it/assets/index-def.js") });
    expect(await r1.text()).toBe("rete /assets/index-def.js");
    online = true;
    const nuovo = "https://popcorno.it/assets/altro-xyz.js";
    const [r2] = await sw.run("fetch", { request: sw.richiesta(nuovo) });
    expect(await r2.text()).toBe("rete " + nuovo);
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.store.get("popcorno-shell-v6")!.has(nuovo)).toBe(true);
  });

  it("activate: toglie popcorno-shell-v3, popcorno-shell-v5 e popcorno-dati, tiene popcorno-img e le altre", async () => {
    const sw = carica(() => ok(), ["popcorno-shell-v3", "popcorno-shell-v5", "popcorno-dati", "popcorno-img", "popcorno-shell-v6", "altro"]);
    await sw.run("activate");
    expect([...sw.store.keys()].sort()).toEqual(["altro", "popcorno-img", "popcorno-shell-v6"]);
    expect(sw.log.claim).toBe(1);
  });

  it("fetch: i dati vanno prima in rete (cache popcorno-dati-v2) e, offline, dalla cache", async () => {
    let online = true;
    const sw = carica(() => { if (!online) throw new Error("offline"); return ok("nuovo"); });
    const url = "https://popcorno.it/data/oggi.json?v=1";
    const [r1] = await sw.run("fetch", { request: sw.richiesta(url) });
    expect(await r1.text()).toBe("nuovo");
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.store.get("popcorno-dati-v2")!.has(url)).toBe(true);
    online = false;
    const [r2] = await sw.run("fetch", { request: sw.richiesta(url) });
    expect(await r2.text()).toBe("nuovo");
  });

  it("fetch: le locandine TMDB sono prima dalla cache (popcorno-img)", async () => {
    const sw = carica(() => ok("img"));
    const url = "https://image.tmdb.org/t/p/w342/a.jpg";
    await sw.run("fetch", { request: sw.richiesta(url) });
    await sw.run("fetch", { request: sw.richiesta(url) });
    expect(sw.log.fetched).toEqual([url]);
    expect(sw.store.get("popcorno-img")!.has(url)).toBe(true);
  });

  it("fetch: non tocca richieste non GET né verso altri domini", async () => {
    const sw = carica(() => ok());
    const risposte = [
      ...(await sw.run("fetch", { request: sw.richiesta("https://popcorno.it/data/x.json", { method: "POST" }) })),
      ...(await sw.run("fetch", { request: sw.richiesta("https://altro.example/data/x.json") })),
    ];
    expect(risposte).toEqual([]);
    expect(sw.log.fetched).toEqual([]);
    expect(sw.store.size).toBe(0);
  });

  it("fetch: la pagina offline si apre dalla copia di / ", async () => {
    let online = true;
    const sw = carica(() => { if (!online) throw new Error("offline"); return ok("pagina"); });
    await sw.run("install");
    online = false;
    const [r] = await sw.run("fetch", { request: sw.richiesta("https://popcorno.it/", { mode: "navigate" }) });
    expect(await r.text()).toBe("pagina");
  });

  it("fetch: le richieste a supabase.co non passano dal service worker", async () => {
    const sw = carica(() => ok());
    const risposte = await sw.run("fetch", { request: sw.richiesta("https://gvdarnmxnigprebwjglq.supabase.co/rest/v1/events") });
    expect(risposte).toEqual([]);
    expect(sw.log.fetched).toEqual([]);
    expect(sw.store.size).toBe(0);
  });

  it("fetch: una navigazione con token_hash va in rete e non si salva in cache", async () => {
    const sw = carica(() => ok("accesso"));
    const url = "https://popcorno.it/?token_hash=abc&type=email";
    const [r] = await sw.run("fetch", { request: sw.richiesta(url, { mode: "navigate" }) });
    expect(await r.text()).toBe("accesso");
    await new Promise((x) => setTimeout(x, 0));
    expect(sw.log.fetched).toEqual([url]);
    expect(sw.store.size).toBe(0);
  });
});
