// @vitest-environment node
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// scripts/pagine.py sulla cartella del sito (nel workflow: public), con i nomi dei canali da src/lib/sources.ts
const dir = mkdtempSync(join(tmpdir(), "pagine-"));
cpSync("public/data/tv.json", join(dir, "data/tv.json"));
cpSync("public/data/meta.json", join(dir, "data/meta.json"));
const py = process.platform === "win32" ? "python" : "python3";
execFileSync(py, ["-X", "utf8", "scripts/pagine.py", dir], { stdio: "ignore" });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("pagine per Google", () => {
  it("crea le pagine di stasera e la sitemap", () => {
    for (const p of ["stasera-in-tv", "film-stasera-in-tv", "serie-tv-stasera", "sport-stasera-in-tv", "cinema"])
      expect(existsSync(join(dir, p, "index.html"))).toBe(true);
    const sm = readFileSync(join(dir, "sitemap.xml"), "utf8");
    expect(sm).toContain("<loc>https://popcorno.it/</loc>");
    expect(sm).toContain("<loc>https://popcorno.it/privacy/</loc>");
    expect(sm).toContain("<loc>https://popcorno.it/stasera-in-tv/</loc>");
  });
  it("legge i nomi dei canali da src/lib/sources.ts", () => {
    const html = readFileSync(join(dir, "stasera-in-tv", "index.html"), "utf8");
    expect(html).toMatch(/Rai 1|Canale 5|Italia 1|Rete 4|La7/);
  });
});
