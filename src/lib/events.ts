// Storico dei segnali di gusto: righe messe in coda nel browser e mandate a Supabase,
// solo con un account e "Ricorda le mie scelte" acceso. Niente scroll, tempo passato o ricerche.
import { mySrc } from "./sources";
import type { Item, Stasera } from "./types";

// Da tenere uguale a eventKinds di db/schema.ts (la sorgente non importa db/): lo controlla un test.
export const EVENT_KINDS = [
  "open", "like", "dislike", "unlike", "undislike", "seen", "unseen",
  "watch_add", "watch_remove", "follow", "unfollow", "trailer", "showtimes", "go",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type EventRow = {
  kind: EventKind;
  title_ref: string;
  title: string;
  item_type: string;
  genre: string;
  source: string;
  ctx: Record<string, unknown>;
};

export type SendResult = "ok" | "off" | "retry";

export const QUEUE_KEY = "popcorno-eventi";
export const OPENED_KEY = "popcorno-aperti";
const MAX_QUEUE = 200;
const OPEN_DEDUPE_MS = 30 * 60_000;
const MAX_CTX = 3500;

export const titleRef = (it: Item): string => (it.tmdb || `${it.ty}:${it.t}`).slice(0, 200);

export function eventRow(kind: EventKind, it: Item, st: Stasera, ctx: Record<string, unknown> = {}): EventRow {
  const base: Record<string, unknown> = {};
  if (it.time) base.time = it.time;
  if (it.ty === "sport" && it.teams) base.teams = it.teams;
  const c: Record<string, unknown> = { ...base, ...ctx };
  // Troppo grande per il database (4096 byte): si tolgono titoli da `shown` finché ci sta.
  if (Array.isArray(c.shown)) {
    const shown = [...(c.shown as unknown[])];
    while (shown.length && JSON.stringify({ ...c, shown }).length > MAX_CTX) shown.pop();
    c.shown = shown;
  }
  return {
    kind,
    title_ref: titleRef(it),
    title: it.t,
    item_type: it.ty,
    genre: it.g,
    source: it.ty === "cinema" ? "cinema" : mySrc(it, st)[0] ?? "",
    ctx: c,
  };
}

export type TrackerOpts = {
  storage: Storage | null;
  enabled: () => boolean;
  send: (rows: EventRow[]) => Promise<SendResult>;
  now: () => number;
};

export function createTracker(o: TrackerOpts): { track(row: EventRow): void; flush(): Promise<void> } {
  // Se lo storage manca o lancia, la coda vive solo in memoria.
  let mem: unknown[] = [];
  let memOpened: Record<string, number> = {};
  const read = <T,>(key: string, fallback: T, memory: T): T => {
    if (!o.storage) return memory;
    try {
      const v = JSON.parse(o.storage.getItem(key) || "null");
      return v && typeof v === "object" ? (v as T) : fallback;
    } catch { return fallback; }
  };
  const write = (key: string, v: unknown) => { try { o.storage?.setItem(key, JSON.stringify(v)); } catch { /* pieno o vietato */ } };
  const queue = (): EventRow[] => {
    const q = read<unknown[]>(QUEUE_KEY, [], mem);
    return (Array.isArray(q) ? q : []) as EventRow[];
  };
  const saveQueue = (q: EventRow[]) => { mem = q; write(QUEUE_KEY, q); };

  let busy = false;
  let again = false;
  const flush = async (): Promise<void> => {
    if (!o.enabled()) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      do {
        again = false;
        const batch = queue();
        if (!batch.length || !o.enabled()) break;
        let r: SendResult;
        try { r = await o.send(batch); } catch { r = "retry"; }
        if (r === "off") { saveQueue([]); break; }
        if (r === "retry") break;
        // Spediti: si tolgono dalla coda (nel frattempo ne possono essere arrivati altri in fondo).
        saveQueue(queue().slice(batch.length));
        if (queue().length) again = true;
      } while (again);
    } finally { busy = false; }
  };

  const track = (row: EventRow): void => {
    if (!o.enabled()) return;
    if (row.kind === "open") {
      const t = o.now();
      const opened = read<Record<string, number>>(OPENED_KEY, {}, memOpened);
      const last = opened[row.title_ref];
      if (typeof last === "number" && t - last < OPEN_DEDUPE_MS) return;
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(opened)) if (typeof v === "number" && t - v < OPEN_DEDUPE_MS) next[k] = v;
      next[row.title_ref] = t;
      memOpened = next;
      write(OPENED_KEY, next);
    }
    saveQueue([...queue(), row].slice(-MAX_QUEUE));
    void flush();
  };

  return { track, flush };
}
