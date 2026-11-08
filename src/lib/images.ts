// ---------- LOCANDINE E SFONDI (righe 625–629 dell'app vecchia) ----------
// GT e KIDG (generi TMDB) stanno in genres.ts.
import type { Item } from "./types";

export const IMG = (p: string, w: number): string => `https://image.tmdb.org/t/p/w${w}${p}`;

// Valore della proprietà CSS `background` di bgOf dell'app vecchia.
export function bgValue(it: Item, w: number): string {
  const c = it.c || ["#614385", "#516395"];
  const g = `linear-gradient(150deg,${c[0]},${c[1]})`;
  return it.p ? `linear-gradient(180deg,#0006 0%,#0000 35%,#000c 100%),url('${IMG(it.p, w)}') center/cover,${g}` : g;
}

// Come bgOf dell'app vecchia: il testo dell'attributo style.
export const bgOf = (it: Item, w: number): string => "background:" + bgValue(it, w);

// Lo stesso, come oggetto style di React.
export const bgStyle = (it: Item, w: number): { background: string } => ({ background: bgValue(it, w) });
