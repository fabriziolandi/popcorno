import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { cachesToDelete } from "../src/lib/sw-caches";

describe("cachesToDelete", () => {
  it("cancella solo le vecchie popcorno-* e tiene le locandine", () => {
    expect(
      cachesToDelete(
        ["popcorno-shell-v3", "popcorno-dati", "popcorno-img", "altro"],
        ["popcorno-shell-v4", "popcorno-dati-v2", "popcorno-img"],
      ),
    ).toEqual(["popcorno-shell-v3", "popcorno-dati"]);
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
    const chiave = (r: any) => (typeof r === "string" ? r : r.url);
    const cacheObj = (m: Map<string, Response>) => ({
      addAll: async (urls: string[]) => { for (const u of urls) m.set(new URL(u, "https://popcorno.it/").href, await rete(u)); },
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
      fetch: async (r: any) => { const u = chiave(r); log.fetched.push(u); return rete(u); },
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

  it("install: salva la shell in popcorno-shell-v4 e chiama skipWaiting", async () => {
    const sw = carica(() => ok());
    await sw.run("install");
    expect([...sw.store.keys()]).toEqual(["popcorno-shell-v4"]);
    expect([...sw.store.get("popcorno-shell-v4")!.keys()]).toContain("https://popcorno.it/");
    expect(sw.log.skipWaiting).toBe(1);
  });

  it("activate: toglie popcorno-shell-v3 e popcorno-dati, tiene popcorno-img e le altre", async () => {
    const sw = carica(() => ok(), ["popcorno-shell-v3", "popcorno-dati", "popcorno-img", "popcorno-shell-v4", "altro"]);
    await sw.run("activate");
    expect([...sw.store.keys()].sort()).toEqual(["altro", "popcorno-img", "popcorno-shell-v4"]);
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
});
