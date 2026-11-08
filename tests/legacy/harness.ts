import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const LEGACY = resolve(__dirname, "index.legacy.html");
// Lo script che in produzione carica data/oggi.js (riga 270 dell'app vecchia) sta su una riga sola.
const isOggiLoader = (line: string): boolean => line.includes("document.write") && line.includes("data/oggi.js");

export type LegacyPalinsesto = {
  items: unknown[];
  etichetta: string;
  aggiornato: string;
  fonti: unknown[];
  data: string;
};

export const EMPTY_PALINSESTO: LegacyPalinsesto = { items: [], etichetta: "", aggiornato: "", fonti: [], data: "" };

// Apre l'app vecchia in jsdom senza rete. `pal` sostituisce data/oggi.js,
// `stasera` (oggetto o stringa grezza) precompila localStorage.stasera.
// Restituisce la window: le funzioni globali (es. syncLink) sono sue proprietà.
export function loadLegacy(pal: LegacyPalinsesto = EMPTY_PALINSESTO, stasera?: object | string): any {
  const html = readFileSync(LEGACY, "utf8");
  const lines = html.split("\n");
  const at = lines.findIndex(isOggiLoader);
  if (at < 0) throw new Error("harness: script di data/oggi.js non trovato in index.legacy.html");
  lines[at] = `<script>window.PALINSESTO=${JSON.stringify(pal)}</scr` + `ipt>`;
  const patched = lines.join("\n");
  const dom = new JSDOM(patched, {
    url: "https://popcorno.it/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(), // niente rumore su stderr
    beforeParse(window) {
      if (stasera !== undefined) {
        window.localStorage.setItem("stasera", typeof stasera === "string" ? stasera : JSON.stringify(stasera));
      }
      (window as any).fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error("404")) });
    },
  });
  return dom.window;
}
