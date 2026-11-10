import type { Stasera } from "./types";

export const SYNC_KEYS = ["subs", "team", "citta", "likes", "liked", "disliked", "seen", "watch", "serie", "gen", "chi", "tempo", "umore", "aree"] as const;

// UTF-8 -> base64 e ritorno, equivalenti a btoa(unescape(encodeURIComponent(..))) dell'app vecchia
// (un carattere alla volta: con lo spread un profilo molto grande darebbe RangeError)
const toB64 = (s: string): string => {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const fromB64 = (b: string): string => new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));

// `base` è origin + pathname (es. "https://popcorno.it/")
export function profileLink(st: Stasera, base: string): string {
  const p: Record<string, unknown> = {};
  for (const k of SYNC_KEYS) p[k] = st[k];
  return base + "#profilo=" + toB64(JSON.stringify(p));
}

// Limiti del contenuto di un link profilo: larghi per i profili veri (anche migliaia di titoli visti),
// stretti abbastanza da non far entrare dati enormi o di forma strana.
const MAX_STR = 300;
const MAX_LIST = 20000;
const MAX_LIKES = 500;
const STR_KEYS = new Set(["team", "citta", "chi", "tempo"]);
const LIST_KEYS = new Set(["subs", "liked", "disliked", "seen", "gen", "umore", "aree"]);
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const str = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_STR;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = <T>(v: unknown, f: (x: unknown) => T | null): T[] | undefined =>
  Array.isArray(v) && v.length <= MAX_LIST ? v.map(f).filter((x): x is T => x !== null) : undefined;

// Una voce di "Da vedere" o delle serie: serve il titolo; dei campi in più (tmdb, anno, stagione,
// episodio, anche dati di versioni vecchie) restano solo testi brevi e numeri, al massimo 10.
function ref(x: unknown): Record<string, string | number> | null {
  if (!obj(x) || !str(x.t)) return null;
  const out: Record<string, string | number> = {};
  for (const [f, v] of Object.entries(x).slice(0, 10)) if (!BAD_KEYS.has(f) && (str(v) || num(v))) out[f] = v;
  return out;
}

// Ogni campo si controlla da solo: uno di forma sbagliata si scarta, gli altri restano.
function clean(k: string, v: unknown): unknown {
  if (STR_KEYS.has(k)) return str(v) ? v : undefined;
  if (LIST_KEYS.has(k)) return list(v, (x) => (str(x) ? x : null));
  if (k === "likes") {
    if (!obj(v)) return undefined;
    const out: Record<string, number> = {};
    for (const [g, n] of Object.entries(v).slice(0, MAX_LIKES)) if (str(g) && !BAD_KEYS.has(g) && num(n)) out[g] = n;
    return out;
  }
  if (k === "watch" || k === "serie") return list(v, ref);
  return undefined;
}

// null se l'hash non è un link profilo; lancia se è un link rotto o senza nessun campo valido
// (l'app mostra "Il link del profilo non è valido").
export function parseProfileHash(hash: string): Partial<Stasera> | null {
  const m = hash.match(/^#profilo=(.+)$/);
  if (!m) return null;
  const p: unknown = JSON.parse(fromB64(decodeURIComponent(m[1])));
  if (!obj(p)) throw new Error("profilo non valido");
  const out: Record<string, unknown> = {};
  for (const k of SYNC_KEYS) {
    const v = clean(k, p[k]);
    if (v !== undefined) out[k] = v;
  }
  if (!Object.keys(out).length) throw new Error("profilo vuoto");
  return out as Partial<Stasera>;
}

// Vero se le preferenze del dispositivo sono ancora quelle iniziali: importare un link non fa perdere niente.
export function isUntouched(st: Stasera, def: Stasera): boolean {
  return SYNC_KEYS.every((k) => JSON.stringify(st[k]) === JSON.stringify(def[k]));
}
