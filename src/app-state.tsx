import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LAST_ACCOUNT_KEY, authInUrl, completeFromUrl, getClient, hasStoredSession, onClientReady } from "./lib/account";
// Statistiche d'uso anonime (PostHog): separate dall'account, non ricevono mai email, id o nome.
import { analytics, prefEvents, track as trackUsage } from "./lib/analytics";
import { createTracker, eventRow, type EventKind, type SendResult } from "./lib/events";
import { loadCatalogs, loadCityShows, loadPalinsesto, type CityShows, type Palinsesto } from "./lib/data";
import { isUntouched, parseProfileHash } from "./lib/profile-link";
import { candidates, type Scored } from "./lib/scoring";
import { isFree } from "./lib/sources";
import { DEFAULT_STATE, loadState, saveState } from "./lib/state";
import { createSync, type Sync } from "./lib/sync";
import { emptyClocks, loadClocks, saveClocks, stamp, type Clocks, type Synced } from "./lib/sync-merge";
import type { Item, Stasera } from "./lib/types";

export type View = "scegli" | "onda" | "prof" | "dati";

export type User = { id: string; email: string; name?: string; avatar?: string };

// Riquadro "Accedi o registrati": `email` lo apre già sul campo email, `from` è il controllo
// a cui torna il focus alla chiusura.
export type LoginOpts = { email?: boolean; from?: HTMLElement | null };

// Nome e foto arrivano da Google (user_metadata). Solo stringhe; la foto solo da un indirizzo https.
export function userFrom(su: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }): User {
  const m = su.user_metadata ?? {};
  const str = (...v: unknown[]) => v.find((x): x is string => typeof x === "string" && x.trim() !== "");
  const u: User = { id: su.id, email: su.email ?? "" };
  const name = str(m.full_name, m.name);
  const avatar = str(m.avatar_url, m.picture);
  if (name) u.name = name.trim();
  if (avatar?.startsWith("https://")) u.avatar = avatar;
  return u;
}

// Un rientro nell'app rilegge l'account al massimo ogni 5 minuti.
// Di chi è la coda dei segnali in localStorage.
const QUEUE_OWNER_KEY = "popcorno-eventi-utente";

const PULL_EVERY_MS = 5 * 60_000;

// La proposta della vista Scegli (list, idx, luckyMode dell'app vecchia). `shown`: #res visibile
// al posto delle domande; `zap`: effetto cambio canale; `seq` cresce a ogni showRes e rifà la scheda.
export type Res = { list: Scored[]; idx: number; lucky: boolean; zap: boolean; shown: boolean; seq: number };

export type AppState = {
  st: Stasera;
  setSt(next: Stasera): void;
  pal: Palinsesto | null;
  // Il palinsesto appena arriva (subito, se c'è già). L'app vecchia lo aveva prima di qualunque tocco
  // (data/oggi.js caricato con la pagina): i gesti che lo usano lo aspettano, così un tocco anticipato
  // non propone titoli calcolati senza palinsesto. Se oggi.json manca è il palinsesto vuoto.
  palReady(): Promise<Palinsesto>;
  catalog: Item[];
  // Aggiunge al catalogo i titoli letti dopo l'avvio (nuovo abbonamento nel Profilo).
  addCatalog(items: Item[]): void;
  toast(msg: string): void;
  view: View;
  setView(v: View): void;
  // Orari dei cinema della città del profilo (SHOWS dell'app vecchia).
  shows: CityShows | null;
  setShows(s: CityShows | null): void;
  res: Res | null;
  setRes(f: (r: Res | null) => Res | null): void;
  // showOne dell'app vecchia: apre Scegli con quel titolo come proposta.
  // `tipo`: la guida dei film in sala imposta anche tipo="cinema" prima di aprire (come l'app vecchia).
  openItem(it: Item, tipo?: string): void;
  // per il componente Toast
  toastMsg: string;
  toastOn: boolean;
  // Account (facoltativo): null senza accesso.
  user: User | null;
  // "Ricorda le mie scelte" (profiles.track_events): vero con account finché non si legge, falso senza.
  trackEvents: boolean;
  setTrackEvents(on: boolean): Promise<void>;
  // Registra un segnale di gusto: non fa nulla senza account o con "Ricorda le mie scelte" spento.
  track(kind: EventKind, it: Item, ctx?: Record<string, unknown>): void;
  // Svuota la coda dei segnali non ancora spediti (storico cancellato o "Ricorda" spento).
  clearEvents(): void;
  // Riquadro di accesso: si apre solo con un tocco della persona.
  loginOpen: boolean;
  loginOpts: LoginOpts;
  openLogin(opts?: LoginOpts): void;
  closeLogin(): void;
  // Prima di un'uscita volontaria: manda ciò che è in attesa (al massimo 3 secondi, errori ignorati).
  flushSync(): Promise<void>;
  // Toglie l'account da questo dispositivo senza chiamate di rete (dopo "Elimina l'account").
  forgetSession(): void;
  // Link #profilo= aperto su un dispositivo che ha già le sue preferenze: si applica solo se la persona conferma.
  profileOffer: Partial<Stasera> | null;
  acceptProfile(): void;
  rejectProfile(): void;
};

const Ctx = createContext<AppState | null>(null);
const NO_OPTS: LoginOpts = {};

const storage = (): Storage | null => {
  try { return window.localStorage; } catch { return null; }
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  // Sul server e al primo render nel browser si parte dai valori predefiniti (stesso HTML, niente
  // differenze di idratazione); lo stato salvato si legge dopo il montaggio.
  const [st, setStRaw] = useState<Stasera>(() => structuredClone(DEFAULT_STATE));
  const [pal, setPal] = useState<Palinsesto | null>(null);
  const palP = useRef<Promise<Palinsesto> | null>(null);
  // I tocchi arrivano solo dopo il montaggio, quando il caricamento è già partito.
  const palReady = useCallback(() => palP.current ?? new Promise<Palinsesto>(() => {}), []);
  const [catalog, setCatalog] = useState<Item[]>([]);
  const addCatalog = useCallback((items: Item[]) => { if (items.length) setCatalog((c) => [...c, ...items]); }, []);
  const [view, setViewRaw] = useState<View>("scegli");
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const [shows, setShows] = useState<CityShows | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [login, setLogin] = useState<LoginOpts | null>(null);
  const openLogin = useCallback((opts: LoginOpts = {}) => setLogin(opts), []);
  const closeLogin = useCallback(() => setLogin(null), []);
  const [profileOffer, setOffer] = useState<Partial<Stasera> | null>(null);

  // Come toast() dell'app vecchia: il timer non si annulla se arriva un altro messaggio.
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setToastOn(true);
    setTimeout(() => setToastOn(false), 1700);
  }, []);

  // Account e sincronizzazione. Lo stato e le date di modifica stanno anche in ref, letti dal motore.
  const [user, setUser] = useState<User | null>(null);
  const [trackEvents, setTrackRaw] = useState(false);
  const userRef = useRef<User | null>(null);
  const stRef = useRef<Stasera>(st);
  const clocks = useRef<Clocks>(emptyClocks());
  const sync = useRef<Sync | null>(null);
  const leave = useRef<() => void>(() => {});
  const trackRef = useRef(false);
  trackRef.current = trackEvents;

  // Un solo tracker per provider; legge account e consenso dai ref, mai da valori vecchi.
  const tracker = useRef<ReturnType<typeof createTracker> | null>(null);
  if (!tracker.current) {
    tracker.current = createTracker({
      storage: typeof window === "undefined" ? null : storage(),
      enabled: () => !!userRef.current && trackRef.current,
      now: Date.now,
      onOff: () => setTrackRaw(false),
      send: async (rows): Promise<SendResult> => {
        const c = await getClient();
        const { error } = await c.from("events").insert(rows);
        if (!error) return "ok";
        // 42501: permesso negato (consenso tolto): si smette. Il resto (rete, 5xx) si riprova al prossimo segnale.
        if (error.code === "42501") return "off";
        // Errori permanenti sui dati (classi 22 e 23): riprovare non servirebbe, il lotto si scarta.
        return /^2[23]/.test(error.code ?? "") ? "drop" : "retry";
      },
    });
  }
  const track = useCallback((kind: EventKind, it: Item, ctx?: Record<string, unknown>) => {
    tracker.current!.track(eventRow(kind, it, stRef.current, ctx));
  }, []);
  const clearEvents = useCallback(() => { tracker.current!.clear(); }, []);
  // Si svuota la coda all'ingresso (quando "Ricorda" diventa vero) e quando torna la rete.
  useEffect(() => { if (user && trackEvents) void tracker.current!.flush(); }, [user, trackEvents]);
  useEffect(() => {
    const on = () => { void tracker.current!.flush(); };
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);

  const setSt = useCallback((next: Stasera) => {
    for (const e of prefEvents(stRef.current, next)) trackUsage(e.name, e.props);
    clocks.current = stamp(stRef.current, next, clocks.current, Date.now());
    stRef.current = next;
    setStRaw(next);
    saveState(next, storage());
    saveClocks(clocks.current, storage());
    if (userRef.current) sync.current?.push();
  }, []);

  const acceptProfile = useCallback(() => {
    if (!profileOffer) return;
    setOffer(null);
    setSt({ ...stRef.current, ...profileOffer });
    toast("Profilo importato: bentornato! 🍿");
  }, [profileOffer, setSt, toast]);
  const rejectProfile = useCallback(() => setOffer(null), []);

  // Dati arrivati dall'account: si applicano senza contarli come modifiche locali.
  const apply = useCallback((s: Synced) => {
    clocks.current = s.ck;
    stRef.current = s.st;
    setStRaw(s.st);
    saveState(s.st, storage());
    saveClocks(s.ck, storage());
  }, []);

  const flushSync = useCallback(async () => {
    const s = sync.current;
    if (!userRef.current || !s) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([s.flush(), new Promise<void>((r) => { t = setTimeout(r, 3000); })]);
    } catch { /* l'uscita non si blocca */ }
    clearTimeout(t);
  }, []);
  const forgetSession = useCallback(() => leave.current(), []);

  const setTrackEvents = useCallback(async (on: boolean) => {
    const u = userRef.current;
    if (!u) return;
    const c = await getClient();
    const { error } = await c.from("profiles").update({ track_events: on }).eq("id", u.id);
    if (error) throw new Error("Non siamo riusciti a salvare la scelta. Riprova.");
    // Spento: anche i segnali ancora in coda non partono più.
    if (!on) tracker.current!.clear();
    if (userRef.current?.id === u.id) setTrackRaw(on);
  }, []);

  const setView = useCallback((v: View) => {
    trackUsage("vista_aperta", { vista: v });
    setViewRaw(v);
    window.scrollTo({ top: 0 });
  }, []);

  // Statistiche: PostHog si carica quando il browser è libero, dopo il primo disegno.
  useEffect(() => { analytics.start(); }, []);

  // Ogni proposta mostrata (anche "Cambia canale" e "Un'altra proposta", che cambiano idx o seq).
  useEffect(() => {
    if (!res?.shown) return;
    const it = res.list[res.idx]?.it;
    if (it) trackUsage("proposta_mostrata", { titolo: it.t, tipo: it.ty, canale: it.s, posizione: res.idx, fortunato: res.lucky });
  }, [res?.seq, res?.idx, res?.shown]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const before = loadState(storage());
    let s = before;
    clocks.current = loadClocks(storage());
    // Import del link #profilo= (righe 712-717 dell'app vecchia). Conta come modifica locale.
    try {
      const p = parseProfileHash(location.hash);
      // Preferenze già presenti (o un account su questo dispositivo): prima si chiede.
      if (p && (!isUntouched(before, DEFAULT_STATE) || hasStoredSession(storage()))) {
        setOffer(p);
        history.replaceState(null, "", location.pathname);
      } else if (p) {
        s = { ...s, ...p };
        saveState(s, storage());
        clocks.current = stamp(before, s, clocks.current, Date.now());
        saveClocks(clocks.current, storage());
        setTimeout(() => toast("Profilo importato: bentornato! 🍿"), 300);
        history.replaceState(null, "", location.pathname);
      }
    } catch {
      setTimeout(() => toast("Il link del profilo non è valido"), 300);
      history.replaceState(null, "", location.pathname);
    }
    stRef.current = s;
    setStRaw(s);

    // I caricatori dei dati tengono uno stato a livello di modulo (come le variabili globali dell'app
    // vecchia) e leggono /data/… con indirizzi relativi: si chiamano SOLO qui, nel browser dopo il
    // montaggio, mai in un loader della rotta né durante il rendering lato server.
    let alive = true;
    const pending = loadPalinsesto();
    palP.current = pending;
    (async () => {
      const p = await pending;
      if (!alive) return;
      setPal(p);
      // Come l'app vecchia, che sceglie i cataloghi prima di importare il link profilo:
      // si usano gli abbonamenti salvati prima dell'import.
      // I cataloghi (centinaia di KB) servono solo dopo un tocco: si scaricano a pagina caricata,
      // per non rallentare la prima comparsa della home.
      if (document.readyState !== "complete") await new Promise((r) => addEventListener("load", r, { once: true }));
      if (!alive) return;
      const cat = await loadCatalogs(before);
      if (alive) setCatalog(cat);
    })();
    return () => { alive = false; };
  }, [toast]);

  // Account: il client si carica solo con una sessione salvata o un accesso in arrivo nell'indirizzo,
  // oppure quando la persona chiede di entrare (onClientReady). Senza account nessuna richiesta a supabase.co.
  useEffect(() => {
    let alive = true;
    let started = false;
    let unsub: (() => void) | null = null;
    let lastPull = 0;
    const urlAuth = authInUrl(location.search);

    const pull = () => {
      if (!userRef.current || !sync.current) return;
      lastPull = Date.now();
      void sync.current.pull();
    };

    // All'uscita (o con una sessione non più valida) lo stato locale resta com'è.
    const signedOut = () => {
      userRef.current = null;
      tracker.current?.clear();
      setUser(null);
      setTrackRaw(false);
    };

    // Eliminazione dell'account senza rete: la sessione non c'è più, anche se supabase-js non lo sa.
    leave.current = () => {
      sync.current?.stop();
      signedOut();
    };

    // Ogni accesso ha un motore nuovo: quello di prima (anche spento da un 401) non si riusa.
    const newSync = (c: SupabaseClient, adopt: boolean) => {
      sync.current?.stop();
      sync.current = createSync({
        client: getClient,
        local: () => ({ st: stRef.current, ck: clocks.current }),
        apply,
        now: Date.now,
        adopt,
        // Dopo il primo pull riuscito le preferenze locali sono di questo account.
        onOwner: (uid) => { try { storage()?.setItem(LAST_ACCOUNT_KEY, uid); } catch { /* storage vietato */ } },
        // Sessione rifiutata: si esce anche da supabase-js, così interfaccia e sessione coincidono.
        onDenied: () => {
          signedOut();
          void c.auth.signOut({ scope: "local" }).catch(() => { /* già fuori */ });
        },
      });
    };

    const signedIn = (c: SupabaseClient, u: User) => {
      // La coda dei segnali appartiene a chi l'ha prodotta: con un altro utente (anche dopo un ricaricamento) si butta.
      let owner: string | null = null;
      try { owner = storage()?.getItem(QUEUE_OWNER_KEY) ?? null; } catch { /* storage vietato */ }
      if (userRef.current?.id !== u.id && owner !== u.id) tracker.current?.clear();
      try { storage()?.setItem(QUEUE_OWNER_KEY, u.id); } catch { /* storage vietato */ }
      userRef.current = u;
      setUser(u);
      // "Ricorda le mie scelte" vale solo dopo averlo letto come vero; una lettura fallita lo lascia spento.
      setTrackRaw(false);
      void c.from("profiles").select("track_events").eq("id", u.id).maybeSingle().then(
        ({ data, error }) => {
          const v = (data as { track_events?: unknown } | null)?.track_events;
          if (alive && !error && userRef.current?.id === u.id) setTrackRaw(v === true);
        },
        () => { /* resta spento */ },
      );
      // Dispositivo usato prima da un altro account: si prendono i dati del nuovo, senza unire quelli locali.
      // Stesso account, o dispositivo mai usato con un account: si uniscono.
      let last: string | null = null;
      try { last = storage()?.getItem(LAST_ACCOUNT_KEY) ?? null; } catch { /* storage vietato */ }
      newSync(c, !!last && last !== u.id);
      pull();
    };

    const start = async (c: SupabaseClient) => {
      if (started) return;
      started = true;
      // Prima la sessione: getSession aspetta che supabase-js scambi da solo il ?code= di Google (PKCE).
      // Solo dopo completeFromUrl verifica il token_hash del link e pulisce l'indirizzo.
      await c.auth.getSession();
      if (urlAuth) {
        try {
          await completeFromUrl();
        } catch (e) {
          if (alive) toast((e as Error).message);
        }
      }
      if (!alive) return;
      const { data } = c.auth.onAuthStateChange((_ev, session) => {
        // Le chiamate a Supabase si fanno fuori dalla callback.
        setTimeout(() => {
          if (!alive) return;
          const su = session?.user;
          if (!su) {
            if (userRef.current) signedOut();
          } else if (userRef.current?.id !== su.id) {
            signedIn(c, userFrom(su));
          }
        }, 0);
      });
      unsub = () => data.subscription.unsubscribe();
    };

    const stopReady = onClientReady((c) => { void start(c); });
    if (hasStoredSession(storage()) || urlAuth) {
      void getClient().then(start).catch(() => { /* client non disponibile: si resta in locale */ });
    }

    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastPull >= PULL_EVERY_MS) pull();
      } else if (userRef.current) {
        void sync.current?.flush();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      stopReady();
      unsub?.();
      sync.current?.stop();
      sync.current = null;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [apply, toast]);

  // Come loadCityShows() dell'app vecchia, chiamata all'avvio e a ogni cambio di città:
  // gli orari si azzerano e si ricaricano (dopo il palinsesto, che dà la versione dei dati).
  useEffect(() => {
    if (!pal) return;
    let alive = true;
    setShows(null);
    loadCityShows(st.citta).then((s) => { if (alive) setShows(s); });
    return () => { alive = false; };
  }, [pal, st.citta]);

  // Lo stato più recente, per openItem che lo legge dopo aver aspettato il palinsesto.
  const cur = useRef({ st, shows, catalog });
  cur.current = { st, shows, catalog };
  const openItem = useCallback((it: Item, tipo?: string) => {
    trackUsage("titolo_aperto", { titolo: it.t, tipo: it.ty, canale: it.s });
    void palReady().then((p) => {
      const { st, shows, catalog } = cur.current;
      const rest = candidates(p, tipo ? { ...st, tipo } : st, { shows, extra: catalog }).filter((x) => x.it !== it);
      const first: Scored = { it, sc: 99, why: ["l'hai cercato tu"].concat(isFree(it) ? ["è <b>gratis</b>"] : []) };
      track("open", it, { shown: [it.t, ...rest.slice(0, 9).map((x) => x.it.t)] });
      setRes((r) => ({ list: [first, ...rest], idx: 0, lucky: false, zap: false, shown: true, seq: (r?.seq ?? 0) + 1 }));
      setView("scegli");
    });
  }, [palReady, setView, track]);

  const value = useMemo<AppState>(
    () => ({
      st, setSt, pal, palReady, catalog, addCatalog, toast, view, setView, toastMsg, toastOn, shows, setShows, res, setRes, openItem,
      user, trackEvents, setTrackEvents, track, clearEvents,
      loginOpen: login !== null, loginOpts: login ?? NO_OPTS, openLogin, closeLogin, flushSync, forgetSession,
      profileOffer, acceptProfile, rejectProfile,
    }),
    [st, setSt, pal, palReady, catalog, addCatalog, toast, view, setView, toastMsg, toastOn, shows, res, setRes, openItem, user, trackEvents, setTrackEvents, track, clearEvents, login, openLogin, closeLogin, flushSync, forgetSession, profileOffer, acceptProfile, rejectProfile],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fuori da AppStateProvider");
  return v;
}
