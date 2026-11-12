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

// Le città conosciute (scripts/citta.json) hanno sempre la loro pagina, anche nei giorni senza orari:
// un indirizzo già indicizzato da Google non deve diventare 404.
const citta: Record<string, string> = JSON.parse(readFileSync("scripts/citta.json", "utf8"));
const slugs = Object.keys(citta);

describe("pagine dei cinema per ogni città conosciuta", () => {
  it("l'elenco delle città conosciute non è vuoto", () => {
    expect(slugs.length).toBeGreaterThan(50);
    expect(citta.milano).toBe("Milano");
  });

  it("senza orari: ogni città ha la pagina, nella sitemap, con l'avviso", () => {
    const sm = readFileSync(join(dir, "sitemap.xml"), "utf8");
    for (const s of slugs) {
      const f = join(dir, "cinema", s, "index.html");
      expect(existsSync(f), s).toBe(true);
      expect(sm).toContain(`<loc>https://popcorno.it/cinema/${s}/</loc>`);
    }
    const html = readFileSync(join(dir, "cinema", "milano", "index.html"), "utf8");
    expect(html).toContain("Cinema a Milano");
    expect(html).toContain("Oggi non abbiamo gli orari dei cinema di Milano");
    expect(html).not.toContain("noindex");
  });

  it("con orari per una città: quella elenca i film, le altre restano con l'avviso", () => {
    const d2 = mkdtempSync(join(tmpdir(), "pagine-cinema-"));
    try {
      cpSync("public/data/tv.json", join(d2, "data/tv.json"));
      cpSync("public/data/meta.json", join(d2, "data/meta.json"));
      const sala = { n: "Cinema Prova", ind: "Via Roma 1", url: "https://example.com/c", f: [{ t: "Film di Prova", o: ["18:30", "21:00"] }] };
      cpSync(join(dir, "sitemap.xml"), join(d2, "sitemap.xml")); // crea la cartella
      execFileSync(py, ["-c", `import json,os;os.makedirs(r'${join(d2, "data", "cinema")}',exist_ok=True);` +
        `json.dump({"citta":"Milano","agg":"2026-11-09","sale":[${JSON.stringify(sala)}]},open(r'${join(d2, "data", "cinema", "milano.json")}','w'));` +
        `json.dump({"agg":"2026-11-09","citta":{"milano":{"n":"Milano","sale":1,"film":1},"nuovacitta":{"n":"Nuova Città","sale":1,"film":1}}},open(r'${join(d2, "data", "cinema", "index.json")}','w'))`]);
      execFileSync(py, ["-X", "utf8", "scripts/pagine.py", d2], { stdio: "ignore" });
      const mi = readFileSync(join(d2, "cinema", "milano", "index.html"), "utf8");
      expect(mi).toContain("Film di Prova");
      expect(mi).toContain("21:00");
      expect(mi).not.toContain("Oggi non abbiamo gli orari");
      const altra = slugs.find((s) => s !== "milano")!;
      expect(readFileSync(join(d2, "cinema", altra, "index.html"), "utf8")).toContain("Oggi non abbiamo gli orari");
      const indice = readFileSync(join(d2, "cinema", "index.html"), "utf8");
      for (const s of slugs) expect(indice).toContain(`href="/cinema/${s}/"`);
    } finally {
      rmSync(d2, { recursive: true, force: true });
    }
  });
});

// Pagine "Cosa vedere su ..." dai cataloghi TMDB (data/catalogo/<chiave>.json, data/trame/<id%100>.json).
describe("pagine dello streaming", () => {
  const d3 = mkdtempSync(join(tmpdir(), "pagine-streaming-"));
  // [id, tipo 0 film/1 serie, titolo, anno, voto, generi, popolarità, poster, voti, lingua]
  const film = Array.from({ length: 8 }, (_, i) => [100 + i, 0, `Film ${i}`, "2024", 7.5, [28], 500 - i, "/p.jpg", 1000, "en"]);
  const sconosciuto = [200, 0, "Titolo Sconosciuto", "2026", 7, [18], 9999, "", 10, "es"];
  const serie = Array.from({ length: 6 }, (_, i) => [300 + i, 1, `Serie ${i}`, "2020", 8, [80], 300 - i, "", 800, "en"]);
  const cartone = [400, 1, "Cartone", "2010", 8, [10762, 16], 99999, "", 900, "en"];
  afterAll(() => rmSync(d3, { recursive: true, force: true }));
  cpSync("public/data/tv.json", join(d3, "data/tv.json"));
  cpSync("public/data/meta.json", join(d3, "data/meta.json"));
  const w = (p: string, v: unknown) => execFileSync(py, ["-c",
    `import json,os,sys;p=sys.argv[1];os.makedirs(os.path.dirname(p),exist_ok=True);json.dump(json.loads(sys.argv[2]),open(p,'w',encoding='utf-8'))`,
    join(d3, p), JSON.stringify(v)]);
  w("data/catalogo/netflix.json", { k: "netflix", agg: "2026-11-12", t: [sconosciuto, cartone, ...film, ...serie] });
  w("data/trame/0.json", { m100: "Una trama di prova." });
  execFileSync(py, ["-X", "utf8", "scripts/pagine.py", d3], { stdio: "ignore" });
  const leggi = (p: string) => readFileSync(join(d3, p, "index.html"), "utf8");

  it("crea indice, pagina della piattaforma, film e serie, nella sitemap", () => {
    const sm = readFileSync(join(d3, "sitemap.xml"), "utf8");
    for (const p of ["streaming", "cosa-vedere-su-netflix", "film-da-vedere-su-netflix", "serie-tv-da-vedere-su-netflix"]) {
      expect(existsSync(join(d3, p, "index.html")), p).toBe(true);
      expect(sm).toContain(`<loc>https://popcorno.it/${p}/</loc>`);
    }
    expect(leggi("streaming")).toContain('href="/cosa-vedere-su-netflix/"');
  });

  it("mette prima i titoli noti, con trama, e in fondo quelli con pochi voti e per bambini", () => {
    const html = leggi("cosa-vedere-su-netflix");
    expect(html).toContain("<title>Cosa vedere su Netflix");
    expect(html).toContain("Una trama di prova.");
    expect(html.indexOf("Film 0")).toBeLessThan(html.indexOf("Titolo Sconosciuto"));
    expect(html.indexOf("Serie 0")).toBeLessThan(html.indexOf("Cartone"));
  });

  it("senza catalogo la pagina resta, con l'avviso", () => {
    const html = leggi("cosa-vedere-su-prime-video");
    expect(html).toContain("Oggi non abbiamo il catalogo di Prime Video");
    expect(existsSync(join(d3, "film-da-vedere-su-prime-video", "index.html"))).toBe(true);
  });
});
