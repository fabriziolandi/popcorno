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
