// Testi della pagina "I miei dati": lo storico in italiano e il nome del file scaricato.
import type { EventKind } from "./events";

export type StoredEvent = { kind: EventKind; title: string | null; created_at: string };

const PHRASE: Record<EventKind, (t: string) => string> = {
  open: (t) => `Hai aperto «${t}»`,
  like: (t) => `Hai messo mi piace a «${t}»`,
  dislike: (t) => `Hai messo non mi piace a «${t}»`,
  unlike: (t) => `Hai tolto il mi piace a «${t}»`,
  undislike: (t) => `Hai tolto il non mi piace a «${t}»`,
  seen: (t) => `Hai segnato come visto «${t}»`,
  unseen: (t) => `Hai tolto «${t}» dai visti`,
  watch_add: (t) => `Hai aggiunto «${t}» a Da vedere`,
  watch_remove: (t) => `Hai tolto «${t}» da Da vedere`,
  follow: (t) => `Hai iniziato a seguire «${t}»`,
  unfollow: (t) => `Hai smesso di seguire «${t}»`,
  trailer: (t) => `Hai aperto il trailer di «${t}»`,
  showtimes: (t) => `Hai guardato gli orari di «${t}»`,
  go: (t) => `Hai aperto il link per vedere «${t}»`,
};

// "7 nov, 21:10", nell'ora del dispositivo.
export function eventDate(iso: string): string {
  const s = new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return s.replace(".", "").replace(/\s*,?\s+(\d{1,2}:\d{2})$/, ", $1");
}

export function eventText(e: StoredEvent): string {
  const phrase = PHRASE[e.kind];
  const title = e.title?.trim() || "un titolo";
  return `${eventDate(e.created_at)} — ${phrase ? phrase(title) : e.kind}`;
}

export function exportName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `popcorno-miei-dati-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
