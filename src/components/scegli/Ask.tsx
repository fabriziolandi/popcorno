// Domande della vista Scegli (renderAsk, banner e città dell'app vecchia, righe 222–236, 354–371, 588–600).
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../app-state";
import { catalogCount, isoDay, loadCinemaIndex, type Palinsesto } from "../../lib/data";
import { CITTA, Q } from "../../lib/genres";
import type { Stasera } from "../../lib/types";
import { Why } from "../Why";
import { Resume } from "./Resume";

type Multi = "umore" | "gen";
const MULTI = new Set(["umore", "gen"]);
const CAN_EMPTY = new Set(["gen"]);

// Il testo di #banner (STATO DEI DATI dell'app vecchia); `count`: segue il conteggio del catalogo.
export function bannerHtml(pal: Palinsesto, now: Date): { html: string; count: boolean } {
  const vecchio = pal.data && pal.data < isoDay(now);
  return !pal.items.length ? { html: "Guida TV non disponibile: ti propongo solo titoli in streaming.", count: false }
    : vecchio ? { html: `La guida TV è ferma a <b>${pal.etichetta}</b>: gli orari potrebbero non valere per stasera.`, count: false }
    : { html: `Guida TV di <b>${pal.etichetta}</b>, aggiornata il ${pal.aggiornato}.`, count: true };
}

// Il contenuto di #banner, usato anche in fondo alla proposta (#rb). Vuoto finché il palinsesto
// non è caricato nel browser: la data del dispositivo si legge solo lì.
export function Banner({ countId }: { countId?: string }) {
  const { pal, catalog } = useApp();
  // Come l'app vecchia, il conteggio si scrive quando i cataloghi sono finiti di caricare.
  const n = useMemo(() => catalogCount(), [catalog]);
  if (!pal) return null;
  const { html, count } = bannerHtml(pal, new Date());
  return (
    <>
      <Why html={html} />
      {count && <span id={countId}>{n ? ` Catalogo streaming: ${n.toLocaleString("it-IT")} titoli.` : ""}</span>}
    </>
  );
}

function Seg({ k, st, onPick }: { k: string; st: Stasera; onPick(k: string, v: string): void }) {
  const multi = MULTI.has(k);
  const cur = st[k as keyof Stasera];
  return (
    <div className={k === "umore" ? "moods" : "seg"} data-k={k}>
      {Q[k].map((q) => {
        const v = q[0], on = multi ? (cur as string[]).includes(v) : cur === v;
        return k === "umore" ? (
          <button key={v} className={on ? "mood on" : "mood"} data-v={v} aria-pressed={on} onClick={() => onPick(k, v)}>
            <em>{q[1]}</em>{q[2]}
          </button>
        ) : (
          <button key={v} className={on ? "chip on" : "chip"} data-v={v} aria-pressed={on} onClick={() => onPick(k, v)}>
            {q[1]}
          </button>
        );
      })}
    </div>
  );
}

export function Ask({ hidden, onGo, onLucky }: { hidden: boolean; onGo(): void; onLucky(): void }) {
  const { st, setSt, shows } = useApp();
  const stRef = useRef(st);
  stRef.current = st;

  const onPick = (k: string, v: string) => {
    if (MULTI.has(k)) {
      const a = st[k as Multi];
      let next = a.includes(v) ? a.filter((x) => x !== v) : [...a, v];
      if (!next.length && !CAN_EMPTY.has(k)) next = [v];
      setSt({ ...st, [k]: next });
    } else setSt({ ...st, [k]: v });
  };

  // #citta: come l'app vecchia ascolta "change" (non ogni tasto); il valore segue st.citta
  // quando cambia altrove (profilo, stato salvato).
  const citta = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = citta.current!;
    const h = () => {
      const s = stRef.current;
      setSt({ ...s, citta: el.value.trim() });
    };
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, [setSt]);
  useEffect(() => {
    const el = citta.current!;
    if (el.value.trim() !== (st.citta || "")) el.value = st.citta || "";
  }, [st.citta]);

  // Quando una città ha gli orari, i suggerimenti diventano le città dei dati dei cinema.
  const [names, setNames] = useState<string[]>(CITTA);
  useEffect(() => {
    if (!shows) return;
    let alive = true;
    loadCinemaIndex().then((idx) => { if (alive && idx) setNames(Object.values(idx.citta).map((c) => c.n)); });
    return () => { alive = false; };
  }, [shows]);

  return (
    <div id="ask" className={hidden ? "hide" : undefined}>
      <h1 className="q-title">Cosa guardiamo stasera?</h1>
      <p className="lead" id="banner"><Banner countId="cat-count" /></p>
      <button className="lucky" id="lucky" onClick={onLucky}>
        <span className="clover" aria-hidden="true">🍀</span>
        <span><b>Mi sento fortunato</b><small>Una sola proposta per stasera, scelta in base ai tuoi gusti</small></span>
      </button>
      <Resume />
      <p className="or">oppure rispondi a qualche domanda</p>
      <div className="q"><h3>Quanto tempo hai?</h3><Seg k="tempo" st={st} onPick={onPick} /></div>
      <div className="q"><h3>Con chi guardi?</h3><Seg k="chi" st={st} onPick={onPick} /></div>
      <div className="q"><h3>Che voglia hai? <span>anche più di una</span></h3><Seg k="umore" st={st} onPick={onPick} /></div>
      <div className="q"><h3>Film, serie o altro?</h3><Seg k="tipo" st={st} onPick={onPick} /></div>
      <div className={st.tipo !== "cinema" ? "q hide" : "q"} id="q-citta">
        <h3>In che città?</h3>
        <input id="citta" ref={citta} list="citta-list" placeholder="Scrivi la tua città" autoComplete="off" />
        <datalist id="citta-list">{names.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div className="q"><h3>Che genere? <span>se non scegli, vanno bene tutti</span></h3><Seg k="gen" st={st} onPick={onPick} /></div>
      <div className={st.tipo === "cinema" ? "toggle hide" : "toggle"}>
        <div><b>Solo cose gratis</b><p>TV in chiaro, RaiPlay, Pluto TV e le altre app gratuite</p></div>
        <button className={st.free ? "sw on" : "sw"} id="sw-free" role="switch" aria-label="Solo cose gratis" aria-checked={st.free}
          onClick={() => setSt({ ...st, free: !st.free })}></button>
      </div>
      <button className="power" id="go" onClick={onGo}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></svg>
        Accendi e scegli per me
      </button>
    </div>
  );
}
