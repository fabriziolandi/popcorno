// ---------- AREE GEOGRAFICHE ("Da dove?" di Scegli) ----------
// L'area di un titolo si ricava dalla sua lingua originale (`l`, codice ISO 639-1 di TMDB).
import type { Item, Stasera } from "./types";

// `n`: etichetta della pillola; `da`: il motivo in "Te lo propongo perché…".
export type Area = { k: string; n: string; da: string; lingue: string[] };

export const AREE: Area[] = [
  { k: "italia", n: "🇮🇹 Italia", da: "dall'Italia", lingue: ["it"] },
  { k: "europa", n: "🇪🇺 Europa", da: "dall'Europa", lingue: "fr de nl sv da no nb nn fi is pl cs sk sl hr sr bs hu ro bg el et lv lt ga cy ca eu gl uk ru be mk sq mt lb".split(" ") },
  { k: "inglese", n: "🇺🇸 USA e Regno Unito", da: "dagli USA o dal Regno Unito", lingue: ["en"] },
  { k: "latina", n: "🌎 America Latina", da: "dall'America Latina", lingue: ["es", "pt"] },
  { k: "asia", n: "🌏 Asia", da: "dall'Asia", lingue: "ja ko zh cn hi te ta ml kn bn mr pa gu ur th vi id ms tl km lo my ne si".split(" ") },
  { k: "mondo", n: "🌍 Resto del mondo", da: "dal resto del mondo", lingue: [] },
];
export const AREA: Record<string, Area> = Object.fromEntries(AREE.map((a) => [a.k, a]));
const LINGUA = new Map(AREE.flatMap((a) => a.lingue.map((l) => [l, a.k] as const)));

// null se la lingua manca: non si sa da dove viene.
export function areaOf(it: Item): string | null {
  if (!it.l) return null;
  return LINGUA.get(it.l) ?? "mondo";
}

// Le aree scelte (un valore non valido, ad es. da un link profilo rotto, vale "Ovunque").
export const areeScelte = (st: Stasera): string[] => (Array.isArray(st.aree) ? st.aree : []);

// Film, serie e film al cinema di un'area nota non scelta non si propongono; sport, show e titoli senza lingua sì.
const TOCCATI = new Set(["film", "serie", "cinema"]);
export function areaOk(it: Item, st: Stasera): boolean {
  const aree = areeScelte(st);
  if (!aree.length || !TOCCATI.has(it.ty)) return true;
  const a = areaOf(it);
  return a === null || aree.includes(a);
}
