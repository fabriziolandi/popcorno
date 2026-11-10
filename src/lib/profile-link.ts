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

// null se l'hash non è un link profilo; lancia se è un link rotto (l'app mostra "Il link del profilo non è valido")
export function parseProfileHash(hash: string): Partial<Stasera> | null {
  const m = hash.match(/^#profilo=(.+)$/);
  if (!m) return null;
  const p = JSON.parse(fromB64(decodeURIComponent(m[1])));
  const out: Record<string, unknown> = {};
  for (const k of SYNC_KEYS) if (p[k] !== undefined) out[k] = p[k];
  return out as Partial<Stasera>;
}
