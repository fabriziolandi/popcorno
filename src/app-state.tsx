import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analytics, prefEvents, track } from "./lib/analytics";
import { loadCatalogs, loadCityShows, loadPalinsesto, type CityShows, type Palinsesto } from "./lib/data";
import { parseProfileHash } from "./lib/profile-link";
import { candidates, type Scored } from "./lib/scoring";
import { isFree } from "./lib/sources";
import { DEFAULT_STATE, loadState, saveState } from "./lib/state";
import type { Item, Stasera } from "./lib/types";

export type View = "scegli" | "onda" | "prof";

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
};

const Ctx = createContext<AppState | null>(null);

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

  // Come toast() dell'app vecchia: il timer non si annulla se arriva un altro messaggio.
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setToastOn(true);
    setTimeout(() => setToastOn(false), 1700);
  }, []);

  // Lo stato attuale, per confrontarlo con il nuovo nelle statistiche.
  const stRef = useRef(st);
  stRef.current = st;
  const setSt = useCallback((next: Stasera) => {
    for (const e of prefEvents(stRef.current, next)) track(e.name, e.props);
    setStRaw(next);
    saveState(next, storage());
  }, []);

  const setView = useCallback((v: View) => {
    track("vista_aperta", { vista: v });
    setViewRaw(v);
    window.scrollTo({ top: 0 });
  }, []);

  // Statistiche: PostHog si carica quando il browser è libero, dopo il primo disegno.
  useEffect(() => { analytics.start(); }, []);

  // Ogni proposta mostrata (anche "Cambia canale" e "Un'altra proposta", che cambiano idx o seq).
  useEffect(() => {
    if (!res?.shown) return;
    const it = res.list[res.idx]?.it;
    if (it) track("proposta_mostrata", { titolo: it.t, tipo: it.ty, canale: it.s, posizione: res.idx, fortunato: res.lucky });
  }, [res?.seq, res?.idx, res?.shown]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const before = loadState(storage());
    let s = before;
    // Import del link #profilo= (righe 712-717 dell'app vecchia).
    try {
      const p = parseProfileHash(location.hash);
      if (p) {
        s = { ...s, ...p };
        saveState(s, storage());
        setTimeout(() => toast("Profilo importato: bentornato! 🍿"), 300);
        history.replaceState(null, "", location.pathname);
      }
    } catch {
      setTimeout(() => toast("Il link del profilo non è valido"), 300);
      history.replaceState(null, "", location.pathname);
    }
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
      const cat = await loadCatalogs(before);
      if (alive) setCatalog(cat);
    })();
    return () => { alive = false; };
  }, [toast]);

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
    track("titolo_aperto", { titolo: it.t, tipo: it.ty, canale: it.s });
    void palReady().then((p) => {
      const { st, shows, catalog } = cur.current;
      const rest = candidates(p, tipo ? { ...st, tipo } : st, { shows, extra: catalog }).filter((x) => x.it !== it);
      const first: Scored = { it, sc: 99, why: ["l'hai cercato tu"].concat(isFree(it) ? ["è <b>gratis</b>"] : []) };
      setRes((r) => ({ list: [first, ...rest], idx: 0, lucky: false, zap: false, shown: true, seq: (r?.seq ?? 0) + 1 }));
      setView("scegli");
    });
  }, [palReady, setView]);

  const value = useMemo<AppState>(
    () => ({ st, setSt, pal, palReady, catalog, addCatalog, toast, view, setView, toastMsg, toastOn, shows, setShows, res, setRes, openItem }),
    [st, setSt, pal, palReady, catalog, addCatalog, toast, view, setView, toastMsg, toastOn, shows, res, setRes, openItem],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fuori da AppStateProvider");
  return v;
}
