import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const LEGACY = resolve(__dirname, "index.legacy.html");
const FIXTURES = resolve(__dirname, "..", "fixtures");
// Lo script che in produzione carica data/oggi.js (riga 270 dell'app vecchia) sta su una riga sola.
const isOggiLoader = (line: string): boolean => line.includes("document.write") && line.includes("data/oggi.js");

export type LegacyPalinsesto = {
  items: unknown[];
  etichetta: string;
  aggiornato: string;
  fonti: unknown[];
  data: string;
  ondemand?: unknown[];
  cinema?: unknown[];
};

export const EMPTY_PALINSESTO: LegacyPalinsesto = { items: [], etichetta: "", aggiornato: "", fonti: [], data: "" };

const readFixture = (name: string): any => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));

// Il palinsesto di prova (tests/fixtures/oggi.json), sempre una copia nuova: l'app vecchia lo modifica.
export const fixturePalinsesto = (): LegacyPalinsesto => readFixture("oggi.json");

// File di dati serviti dal finto fetch: percorso dopo "data/" → JSON. Tutto il resto risponde 404.
export type FixtureFiles = Record<string, unknown>;

export const CINEMA_INDEX = {
  agg: "2026-11-07",
  citta: {
    roma: { n: "Roma", sale: 1, film: 2 },
    "forli-cesena": { n: "Forlì", sale: 2, film: 2 },
  },
};
export const SHOWS_FORLI = {
  citta: "Forlì",
  agg: "2026-11-07",
  sale: [
    { n: "Cinema Eliseo", ind: "Viale Bolognesi 14 - Forlì (FC)", url: "https://example.org/eliseo",
      f: [{ t: "Parthenope", o: ["18:00", "21:15"] }, { t: "Il Robot Selvaggio", o: ["16:30"] }] },
    { n: "Cinema Saffi", ind: "Viale Dell'Appennino 480 - Forlì (FC)", url: "https://example.org/saffi",
      f: [{ t: "Parthenope - Versione restaurata", o: ["20:30", "22:40"] }] },
  ],
};

export const defaultFiles = (): FixtureFiles => ({
  "catalogo/netflix.json": readFixture("catalogo-netflix.json"),
  "cinema/index.json": CINEMA_INDEX,
  "cinema/forli-cesena.json": SHOWS_FORLI,
  "trame/93.json": { m976893: "Un addetto alle pulizie dei bagni pubblici di Tokyo." },
});

// Un fetch finto: risponde con il file se l'URL contiene "data/<chiave>", altrimenti 404.
export function fixtureFetch(files: FixtureFiles): (url: string) => Promise<any> {
  return (url: string) => {
    const path = String(url).replace(/^.*?data\//, "").replace(/\?.*$/, "");
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      const body = JSON.parse(JSON.stringify(files[path]));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error("404")) });
  };
}

export type LegacyOpts = { now?: Date; random?: () => number; files?: FixtureFiles };

// Apre l'app vecchia in jsdom. `pal` sostituisce data/oggi.js,
// `stasera` (oggetto o stringa grezza) precompila localStorage.stasera.
// `opts.files` sono i file serviti da fetch (predefinito: nessuno, tutto 404),
// `opts.now` blocca l'orologio (Date e Date.now), `opts.random` sostituisce Math.random.
// Restituisce la window: le funzioni globali (syncLink, candidates, score, lucky…) sono sue proprietà;
// le variabili let/const (st, list, C…) si leggono con window.eval("…").
export function loadLegacy(pal: LegacyPalinsesto = EMPTY_PALINSESTO, stasera?: object | string, opts: LegacyOpts = {}): any {
  const html = readFileSync(LEGACY, "utf8");
  const lines = html.split("\n");
  const at = lines.findIndex(isOggiLoader);
  if (at < 0) throw new Error("harness: script di data/oggi.js non trovato in index.legacy.html");
  lines[at] = `<script>window.PALINSESTO=${JSON.stringify(pal)}</scr` + `ipt>`;
  // Novità rispetto all'app vecchia (src/lib/genres.ts): "Che genere?" guarda tutti i generi TMDB
  // del titolo e l'animazione esce solo se si sceglie "Animazione". La si applica anche qui,
  // così il confronto controlla tutto il resto.
  const GEN_RULES: [string, string][] = [
    ['const genHit = (k,it) => k==="essai" ? isEssai(it) : GEN[k][1].test(it.g);',
      'const genHit = (k,it) => k==="essai" ? isEssai(it) : GEN[k][1].test([it.g,...(it.gs||[]).map(x=>(GT[x]&&GT[x][0])||"")].join(" "));'],
    ["const genOk = it => !st.gen.length || st.gen.some(k=>genHit(k,it));",
      'const genOk = it => !st.gen.length || ((st.gen.includes("animazione") || !((it.gs||[]).includes(16) || /animazione|cartoni/i.test(it.g))) && st.gen.some(k=>genHit(k,it)));'],
  ];
  for (const [from, to] of GEN_RULES) {
    const i = lines.findIndex((l) => l.trim() === from);
    if (i < 0) throw new Error("harness: riga dei generi non trovata in index.legacy.html: " + from);
    lines[i] = to;
  }
  // Novità: abbonamenti TIMvision e Crunchyroll (src/lib/sources.ts).
  const SUBS_FROM = 'paramount:{n:"Paramount+"}, mubi:{n:"MUBI"}';
  const j = lines.findIndex((l) => l.includes(SUBS_FROM));
  if (j < 0) throw new Error("harness: elenco delle fonti non trovato in index.legacy.html");
  lines[j] = lines[j].replace(SUBS_FROM, 'paramount:{n:"Paramount+"}, timvision:{n:"TIMvision"}, crunchyroll:{n:"Crunchyroll"}, mubi:{n:"MUBI"}');
  const patched = lines.join("\n");
  const dom = new JSDOM(patched, {
    url: "https://popcorno.it/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(), // niente rumore su stderr
    beforeParse(window) {
      const w = window as any;
      if (stasera !== undefined) {
        window.localStorage.setItem("stasera", typeof stasera === "string" ? stasera : JSON.stringify(stasera));
      }
      w.fetch = fixtureFetch(opts.files || {});
      w.scrollTo = () => {};
      if (opts.random) w.Math.random = opts.random;
      if (opts.now) {
        const fixed = opts.now.getTime();
        const RealDate = w.Date as DateConstructor;
        class FixedDate extends RealDate {
          constructor(...a: any[]) {
            if (a.length) super(...(a as [any])); else super(fixed);
          }
          static now() { return fixed; }
        }
        w.Date = FixedDate;
      }
    },
  });
  return dom.window;
}

// Lascia finire i fetch asincroni dell'app vecchia (cataloghi, orari dei cinema).
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

// "Mi sento fortunato" dell'app vecchia: lancia lucky() e legge la scelta da `list`,
// controllando che il titolo mostrato in #res sia lo stesso.
export function legacyLucky(w: any): { it: any; sc: number; why: string[] } | null {
  w.lucky();
  const list = w.eval("list");
  if (!list.length) return null;
  const shown = w.document.querySelector("#res .title")?.textContent;
  if (shown !== list[0].it.t) throw new Error(`harness: #res mostra "${shown}", list ha "${list[0].it.t}"`);
  return JSON.parse(JSON.stringify(list[0]));
}
