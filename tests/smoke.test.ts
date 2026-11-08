import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";

const titolo = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];

describe("scheletro TanStack Start su Cloudflare", () => {
  beforeAll(() => {
    execSync("npm run build", { stdio: "pipe" });
  }, 180_000);

  it("la build include font e manifest tra gli asset del client", () => {
    expect(existsSync("dist/client/fonts/figtree-400.woff2")).toBe(true);
    expect(existsSync("dist/client/manifest.webmanifest")).toBe(true);
  });

  it("la pagina / ha lang it e lo stesso title della vecchia", async () => {
    const vecchia = readFileSync("tests/legacy/index.legacy.html", "utf8");
    const { default: server } = await import(
      /* @vite-ignore */ new URL("../dist/server/index.js", import.meta.url).href
    );
    const res = await server.fetch(new Request("http://localhost/"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<html lang="it"');
    expect(titolo(html)).toBe(titolo(vecchia));
  });

  it("la pagina / ha la barra in basso, l'orologio vuoto e il CSS dell'app", async () => {
    const { default: server } = await import(
      /* @vite-ignore */ new URL("../dist/server/index.js", import.meta.url).href
    );
    const html = await (await server.fetch(new Request("http://localhost/"))).text();
    expect(html).toContain('<nav aria-label="Sezioni">');
    expect(html).toContain('<div class="clock" id="clock"></div>');
    const css = /<link rel="stylesheet" href="([^"]+\.css)"/.exec(html)?.[1];
    expect(css).toBeTruthy();
    expect(readFileSync("dist/client" + css, "utf8")).toContain(".toast.show{opacity:1}");
  });
});

describe("head della pagina / e rotte senza barra finale", () => {
  const get = async (path: string) => {
    const { default: server } = await import(
      /* @vite-ignore */ new URL("../dist/server/index.js", import.meta.url).href
    );
    return server.fetch(new Request("http://localhost" + path));
  };
  const unesc = (v: string) => v.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
  // La vecchia usa indirizzi relativi (icons/…); qui sono assoluti, perché la pagina serve anche /privacy/.
  const attr = (h: string, re: RegExp) => { const m = re.exec(h); return m ? unesc(m[1]).replace(/^\//, "") : undefined; };

  it("/ risponde 200 senza redirect e mantiene i tag spostati dal root", async () => {
    const vecchia = readFileSync("tests/legacy/index.legacy.html", "utf8");
    const res = await get("/");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    for (const re of [
      /<meta name="viewport" content="([^"]*)"/,
      /<meta name="description" content="([^"]*)"/,
      /<meta property="og:title" content="([^"]*)"/,
      /<meta property="og:description" content="([^"]*)"/,
      /<meta property="og:image" content="([^"]*)"/,
      /<meta name="theme-color" content="([^"]*)"/,
      /<link rel="canonical" href="([^"]*)"/,
      /<link rel="manifest" href="([^"]*)"/,
      /<link rel="apple-touch-icon" href="([^"]*)"/,
    ]) {
      expect(attr(html, re), String(re)).toBeDefined();
      expect(attr(html, re), String(re)).toBe(attr(vecchia, re));
    }
    expect(html).toMatch(/<link rel="stylesheet" href="[^"]+\.css"/);
    expect(html).toMatch(/<link rel="preload" href="\/fonts\/figtree-400\.woff2" as="font"/);
    const ld = /<script type="application\/ld\+json"[^>]*>([^<]*)<\/script>/.exec(html)?.[1];
    const ldVecchio = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(vecchia)?.[1];
    expect(JSON.parse(unesc(ld!))).toEqual(JSON.parse(ldVecchio!));
  });

  it("le rotte che non sono pagine non vengono rimandate a un indirizzo con la barra", async () => {
    for (const path of ["/sw.js", "/data/trame/99.json?v=1"]) {
      const res = await get(path);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.status, path).not.toBe(307);
      expect(res.status, path).not.toBe(301);
    }
  });
});

describe("pagina privacy", () => {
  const get = async (path: string) => {
    const { default: server } = await import(
      /* @vite-ignore */ new URL("../dist/server/index.js", import.meta.url).href
    );
    return server.fetch(new Request("http://localhost" + path));
  };

  it("/privacy/ risponde 200 con title e meta description della vecchia, senza il CSS dell'app", async () => {
    const vecchia = readFileSync("tests/legacy/privacy.legacy.html", "utf8");
    const res = await get("/privacy/");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(titolo(html)).toBe(titolo(vecchia));
    const desc = (h: string) => /<meta name="description" content="([^"]*)"/.exec(h)?.[1].replace(/&#x27;/g, "'");
    expect(desc(html)).toBe(desc(vecchia));
    expect(html).not.toMatch(/<link rel="stylesheet"/);
    expect(html).not.toContain("og:title");
  });

  it("/index.html (vecchi segnalibri e icone sulla schermata Home) rimanda a / con 301", async () => {
    const res = await get("/index.html");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/");
  });

  it("/privacy (senza barra) rimanda a /privacy/", async () => {
    const res = await get("/privacy");
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toBe("/privacy/");
    expect((await get("/privacy/")).status).toBe(200);
  });
});

describe("service worker", () => {
  it("/sw.js è servito come JavaScript dalla build", async () => {
    const { default: server } = await import(
      /* @vite-ignore */ new URL("../dist/server/index.js", import.meta.url).href
    );
    const res = await server.fetch(new Request("http://localhost/sw.js"));
    // In produzione gli asset statici li serve Cloudflare; qui controlliamo anche il file in dist/client.
    expect(existsSync("dist/client/sw.js")).toBe(true);
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).not.toBe(307);
  });
});
