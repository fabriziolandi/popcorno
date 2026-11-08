import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadCatalogs, loadPalinsesto, type Palinsesto } from "./lib/data";
import { parseProfileHash } from "./lib/profile-link";
import { DEFAULT_STATE, loadState, saveState } from "./lib/state";
import type { Item, Stasera } from "./lib/types";

export type View = "scegli" | "onda" | "prof";

export type AppState = {
  st: Stasera;
  setSt(next: Stasera): void;
  pal: Palinsesto | null;
  catalog: Item[];
  toast(msg: string): void;
  view: View;
  setView(v: View): void;
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
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [view, setViewRaw] = useState<View>("scegli");
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);

  // Come toast() dell'app vecchia: il timer non si annulla se arriva un altro messaggio.
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setToastOn(true);
    setTimeout(() => setToastOn(false), 1700);
  }, []);

  const setSt = useCallback((next: Stasera) => {
    setStRaw(next);
    saveState(next, storage());
  }, []);

  const setView = useCallback((v: View) => {
    setViewRaw(v);
    window.scrollTo({ top: 0 });
  }, []);

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
    (async () => {
      const p = await loadPalinsesto();
      if (!alive) return;
      setPal(p);
      // Come l'app vecchia, che sceglie i cataloghi prima di importare il link profilo:
      // si usano gli abbonamenti salvati prima dell'import.
      const cat = await loadCatalogs(before);
      if (alive) setCatalog(cat);
    })();
    return () => { alive = false; };
  }, [toast]);

  const value = useMemo<AppState>(
    () => ({ st, setSt, pal, catalog, toast, view, setView, toastMsg, toastOn }),
    [st, setSt, pal, catalog, toast, view, setView, toastMsg, toastOn],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fuori da AppStateProvider");
  return v;
}
