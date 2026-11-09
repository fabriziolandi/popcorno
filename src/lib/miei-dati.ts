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

// Icona e testo breve di ogni tipo, per la cronologia (il titolo va sotto, in grassetto).
const SHORT: Record<EventKind, { icon: string; label: string }> = {
  like: { icon: "👍", label: "Ti è piaciuto" },
  dislike: { icon: "👎", label: "Non ti è piaciuto" },
  unlike: { icon: "👍", label: "Tolto il mi piace" },
  undislike: { icon: "👎", label: "Tolto il non mi piace" },
  seen: { icon: "👁", label: "Visto" },
  unseen: { icon: "👁", label: "Tolto dai visti" },
  watch_add: { icon: "🔖", label: "Aggiunto a Da vedere" },
  watch_remove: { icon: "🔖", label: "Tolto da Da vedere" },
  open: { icon: "🍿", label: "Aperto" },
  trailer: { icon: "▶", label: "Trailer" },
  showtimes: { icon: "🎟", label: "Orari del cinema" },
  go: { icon: "📺", label: "Link per vederlo" },
  follow: { icon: "📺", label: "Inizi a seguirla" },
  unfollow: { icon: "📺", label: "Smetti di seguirla" },
};

export function eventShort(kind: EventKind): { icon: string; label: string } {
  return SHORT[kind] ?? { icon: "•", label: kind };
}

// Intestazione del giorno, nell'ora del dispositivo: "Oggi", "Ieri", "7 novembre" (con l'anno se non è quello corrente).
export function dayLabel(d: Date, now: Date): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day(d) === day(now)) return "Oggi";
  if (day(d) === day(yesterday)) return "Ieri";
  return d.toLocaleDateString("it-IT", d.getFullYear() === now.getFullYear()
    ? { day: "numeric", month: "long" }
    : { day: "numeric", month: "long", year: "numeric" });
}

// "21:18", nell'ora del dispositivo.
export const eventTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

// I filtri della cronologia; "Tutto" non filtra.
export const KIND_FILTERS: { id: string; label: string; kinds: EventKind[] | null }[] = [
  { id: "tutto", label: "Tutto", kinds: null },
  { id: "like", label: "Mi piace", kinds: ["like", "dislike", "unlike", "undislike"] },
  { id: "visti", label: "Visti", kinds: ["seen", "unseen"] },
  { id: "watch", label: "Da vedere", kinds: ["watch_add", "watch_remove"] },
  { id: "aperti", label: "Aperti", kinds: ["open", "trailer", "showtimes", "go", "follow", "unfollow"] },
];
