import { DEFAULT_STATE } from "./state";
import type { Stasera } from "./types";

// Date di modifica (ms) per l'unione tra dispositivi.
// f: campi singoli; l: elementi vivi per lista; rm: marcatori di rimozione per lista.
export type Clocks = {
  f: Record<string, number>;
  l: Record<string, Record<string, number>>;
  rm: Record<string, Record<string, number>>;
};
export type Synced = { st: Stasera; ck: Clocks };

export const SCALAR_KEYS: readonly (keyof Stasera)[] = [
  "tempo", "chi", "umore", "tipo", "gen", "free", "subs", "team", "citta", "likes", "aree",
];
export const LIST_KEYS: readonly (keyof Stasera)[] = ["watch", "serie", "liked", "disliked", "seen"];

const CLOCK_KEY = "stasera-clock";
const GC_MS = 90 * 864e5;

export function itemKey(list: string, x: unknown): string {
  if (list === "watch" || list === "serie") {
    const o = (x ?? {}) as { tmdb?: string; t?: string };
    return String(o.tmdb || o.t || "");
  }
  return String(x ?? "");
}

export const emptyClocks = (): Clocks => ({ f: {}, l: {}, rm: {} });

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const cleanNums = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isRec(v)) for (const k of Object.keys(v)) if (typeof v[k] === "number" && Number.isFinite(v[k])) out[k] = v[k] as number;
  return out;
};
const cleanLists = (v: unknown): Record<string, Record<string, number>> => {
  const out: Record<string, Record<string, number>> = {};
  if (isRec(v)) for (const k of Object.keys(v)) out[k] = cleanNums(v[k]);
  return out;
};

// Date mancanti o malformate: si scartano (valgono 0).
export function normClocks(raw: unknown): Clocks {
  if (!isRec(raw)) return emptyClocks();
  return { f: cleanNums(raw.f), l: cleanLists(raw.l), rm: cleanLists(raw.rm) };
}

export function loadClocks(storage: Storage | null): Clocks {
  try {
    return normClocks(JSON.parse((storage as Storage).getItem(CLOCK_KEY) || "null"));
  } catch {
    return emptyClocks();
  }
}

export function saveClocks(c: Clocks, storage: Storage | null): void {
  try {
    (storage as Storage).setItem(CLOCK_KEY, JSON.stringify(c));
  } catch {
    // storage pieno o bloccato: le date ripartono da zero, i dati restano
  }
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
const listOf = (st: Stasera, k: string): unknown[] => {
  const v = (st as unknown as Record<string, unknown>)[k];
  return Array.isArray(v) ? v : [];
};
const byKey = (k: string, items: unknown[]): Map<string, unknown> => {
  const m = new Map<string, unknown>();
  for (const x of items) {
    const key = itemKey(k, x);
    if (key && !m.has(key)) m.set(key, x);
  }
  return m;
};

export function stamp(prev: Stasera, next: Stasera, c: Clocks, now: number): Clocks {
  const out = structuredClone(c);
  for (const k of SCALAR_KEYS) {
    if (!same(prev[k], next[k])) out.f[k] = now;
  }
  for (const k of LIST_KEYS) {
    const p = byKey(k, listOf(prev, k));
    const n = byKey(k, listOf(next, k));
    const l = (out.l[k] ??= {});
    const rm = (out.rm[k] ??= {});
    for (const [key, x] of n) {
      if (!p.has(key) || !same(p.get(key), x)) {
        l[key] = now;
        delete rm[key];
      }
    }
    for (const key of p.keys()) {
      if (!n.has(key)) {
        rm[key] = now;
        delete l[key];
      }
    }
  }
  return out;
}

export function gcClocks(c: Clocks, now: number): Clocks {
  const out = structuredClone(c);
  for (const k of Object.keys(out.rm)) {
    for (const key of Object.keys(out.rm[k])) {
      if (now - out.rm[k][key] > GC_MS) delete out.rm[k][key];
    }
  }
  return out;
}

export function merge(a0: Synced, b0: Synced, now: number): Synced {
  const a: Synced = { st: a0.st, ck: normClocks(a0.ck) };
  const b: Synced = { st: b0.st, ck: normClocks(b0.ck) };
  const st = structuredClone(a.st);
  const ck = emptyClocks();
  const rec = st as unknown as Record<string, unknown>;

  for (const k of SCALAR_KEYS) {
    const fa = a.ck.f[k] ?? 0;
    const fb = b.ck.f[k] ?? 0;
    const dflt = (s: Stasera) => !same(s[k], DEFAULT_STATE[k]);
    // senza date su entrambi i lati vince il valore diverso dal predefinito, altrimenti a
    const bWins = fb > fa || (fb === fa && fa === 0 && dflt(b.st) && !dflt(a.st));
    if (bWins) rec[k] = structuredClone((b.st as unknown as Record<string, unknown>)[k]);
    if (k in a.ck.f || k in b.ck.f) ck.f[k] = Math.max(fa, fb);
  }

  for (const k of LIST_KEYS) {
    const la = byKey(k, listOf(a.st, k));
    const lb = byKey(k, listOf(b.st, k));
    const side = (live: Map<string, unknown>, s: Synced, key: string) => {
      const isLive = live.has(key);
      const date = isLive ? s.ck.l[k]?.[key] ?? 0 : s.ck.rm[k]?.[key] ?? 0;
      return { isLive, date };
    };
    const markers = [...Object.keys(a.ck.rm[k] ?? {}), ...Object.keys(b.ck.rm[k] ?? {})];
    // ordine: prima gli elementi di a, poi quelli solo di b, poi i soli marcatori
    const order = [...new Set([...la.keys(), ...lb.keys(), ...markers])];
    const outL: Record<string, number> = {};
    const outRm: Record<string, number> = {};
    const items: unknown[] = [];
    for (const key of order) {
      const sa = side(la, a, key);
      const sb = side(lb, b, key);
      let win: "a" | "b";
      if (sa.date !== sb.date) win = sa.date > sb.date ? "a" : "b";
      else if (sa.isLive !== sb.isLive) win = sa.isLive ? "a" : "b";
      else win = "a";
      const w = win === "a" ? sa : sb;
      if (w.isLive) {
        items.push(structuredClone((win === "a" ? la : lb).get(key)));
        outL[key] = w.date;
      } else {
        outRm[key] = w.date;
      }
    }
    rec[k] = items;
    ck.l[k] = outL;
    ck.rm[k] = outRm;
  }

  return { st, ck: gcClocks(ck, now) };
}
