// Statistiche d'uso con PostHog (regione EU).
// PostHog si carica a parte (import dinamico) quando il browser è libero, dopo che l'app è già
// visibile: non pesa sul primo avvio. Gli eventi registrati prima finiscono in coda e partono dopo.
// Senza chiave (sviluppo, test) non si carica nulla.
import { RELAY_PATH } from "./posthog-proxy";
import type { Stasera } from "./types";

// Chiave pubblica del progetto PostHog ("Project API key", phc_…): è fatta per stare nel codice del sito.
// Progetto "Popcorno" (id 341996) nell'organizzazione PostHog "Popcorno", regione EU.
export const POSTHOG_KEY = "phc_CReLZeBgErTqtLkiMuMgfxiXi7WfYCrwqQjTrfVw28wJ";

export const POSTHOG_OPTIONS = {
  // Passa dal nostro dominio (Worker → PostHog EU): i blocchi pubblicità non lo fermano.
  api_host: RELAY_PATH,
  ui_host: "https://eu.posthog.com",
  defaults: "2026-08-30",
  // Ogni visitatore ha il suo profilo anonimo (ID salvato nel browser): si riconosce chi torna.
  person_profiles: "always",
  autocapture: true,
  capture_pageview: true,
  capture_pageleave: true,
  capture_exceptions: true,
  // Registrazione delle sessioni: i campi di testo (ricerca, ecc.) sono sempre oscurati.
  session_recording: { maskAllInputs: true },
  // Sondaggi ed esperimenti non si usano: niente script e richieste in più all'apertura.
  disable_surveys: true,
  disable_web_experiments: true,
} as const;

export type PostHogLike = {
  init(key: string, opts: typeof POSTHOG_OPTIONS): unknown;
  capture(name: string, props?: Props): unknown;
  opt_out_capturing?(): unknown;
  opt_in_capturing?(): unknown;
  setPersonProperties?(set: Props): unknown;
};
type Props = Record<string, unknown>;

type Opts = {
  key: string;
  load: () => Promise<PostHogLike>;
  // Quando caricare: per default quando il browser è libero (o dopo 2 s).
  schedule?: (f: () => void) => void;
  // Dove si ricorda la scelta "niente statistiche" (pagina privacy).
  storage?: () => Storage | null;
};

// Chiave in localStorage: se c'è, PostHog non si carica affatto.
export const OPT_OUT_KEY = "popcorno-no-statistiche";

// Visite del proprietario: popcorno.it/?interno=1 segna questo browser (resta salvato), ?interno=0 lo toglie.
// In PostHog finiscono nel gruppo "Internal / Test users", escluso dalle statistiche. In locale sempre.
export const INTERNAL_KEY = "popcorno-interno";

// true: segnare come interno; false: togliere il segno (?interno=0); null: niente da fare.
export function internalMark(loc: { search: string; hostname: string }, store: Storage | null): boolean | null {
  const v = new URLSearchParams(loc.search).get("interno");
  try {
    if (v === "1") store?.setItem(INTERNAL_KEY, "1");
    else if (v === "0") store?.removeItem(INTERNAL_KEY);
  } catch {
    // senza memoria del browser vale solo per questa visita
  }
  if (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") return true;
  if (v === "1") return true;
  if (v === "0") return false;
  try { return store?.getItem(INTERNAL_KEY) === "1" ? true : null; } catch { return null; }
}

const localStore = (): Storage | null => {
  try { return window.localStorage; } catch { return null; }
};

const whenIdle = (f: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(f, { timeout: 4000 });
  else setTimeout(f, 2000);
};

export function createAnalytics({ key, load, schedule = whenIdle, storage = localStore }: Opts) {
  let ph: PostHogLike | null = null;
  let started = false;
  let queue: [string, Props | undefined][] = [];

  const isOptedOut = () => {
    try { return storage()?.getItem(OPT_OUT_KEY) === "1"; } catch { return false; }
  };

  const track = (name: string, props?: Props) => {
    if (!key || isOptedOut()) return;
    try {
      if (ph) ph.capture(name, props);
      else if (queue.length < 200) queue.push([name, props]);
    } catch {
      // le statistiche non devono mai rompere l'app
    }
  };

  const start = () => {
    if (!key || started || typeof window === "undefined" || isOptedOut()) return;
    started = true;
    schedule(() => {
      load()
        .then((p) => {
          p.init(key, POSTHOG_OPTIONS);
          ph = p;
          const mark = internalMark(window.location, storage());
          if (mark !== null) {
            try { p.setPersonProperties?.({ $internal_or_test_user: mark }); } catch { /* ignorato */ }
          }
          const q = queue;
          queue = [];
          for (const [n, pr] of q) track(n, pr);
        })
        .catch(() => { queue = []; });
    });
  };

  const setOptOut = (off: boolean) => {
    try {
      if (off) storage()?.setItem(OPT_OUT_KEY, "1");
      else storage()?.removeItem(OPT_OUT_KEY);
    } catch {
      // senza memoria del browser la scelta vale solo per questa visita
    }
    queue = [];
    try {
      if (off) ph?.opt_out_capturing?.();
      else { ph?.opt_in_capturing?.(); start(); }
    } catch {
      // ignorato
    }
  };

  return { start, track, isOptedOut, setOptOut };
}

export const analytics = createAnalytics({
  key: POSTHOG_KEY,
  load: () => import("posthog-js").then((m) => m.default as unknown as PostHogLike),
});
export const track = analytics.track;

type Ev = { name: string; props: Props };

const added = (a: string[], b: string[]) => b.filter((x) => !a.includes(x));
const titles = (l: { t: string }[]) => l.map((x) => x.t);

// Le preferenze cambiate tra due stati, come eventi con nome.
export function prefEvents(prev: Stasera, next: Stasera): Ev[] {
  const ev: Ev[] = [];
  for (const k of ["tempo", "chi", "tipo"] as const)
    if (prev[k] !== next[k]) ev.push({ name: "risposta_scelta", props: { domanda: k, valore: next[k] } });
  for (const k of ["umore", "gen"] as const)
    if (prev[k].join() !== next[k].join()) ev.push({ name: "risposta_scelta", props: { domanda: k, valore: next[k] } });
  if (prev.free !== next.free) ev.push({ name: "risposta_scelta", props: { domanda: "free", valore: next.free } });
  for (const s of added(prev.subs, next.subs)) ev.push({ name: "abbonamento_aggiunto", props: { servizio: s } });
  for (const s of added(next.subs, prev.subs)) ev.push({ name: "abbonamento_tolto", props: { servizio: s } });
  if (prev.citta !== next.citta) ev.push({ name: "citta_scelta", props: { citta: next.citta } });
  if (prev.team !== next.team) ev.push({ name: "squadra_scelta", props: { squadra: next.team } });
  for (const t of added(titles(prev.watch), titles(next.watch))) ev.push({ name: "da_vedere_aggiunto", props: { titolo: t } });
  for (const t of added(titles(next.watch), titles(prev.watch))) ev.push({ name: "da_vedere_tolto", props: { titolo: t } });
  for (const t of added(titles(prev.serie), titles(next.serie))) ev.push({ name: "serie_seguita", props: { titolo: t } });
  for (const t of added(titles(next.serie), titles(prev.serie))) ev.push({ name: "serie_smessa", props: { titolo: t } });
  for (const t of added(prev.liked, next.liked)) ev.push({ name: "mi_piace", props: { titolo: t } });
  for (const t of added(prev.disliked, next.disliked)) ev.push({ name: "non_mi_piace", props: { titolo: t } });
  for (const t of added(prev.seen, next.seen)) ev.push({ name: "visto", props: { titolo: t } });
  return ev;
}
