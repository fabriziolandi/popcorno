// Vista Scegli: domande o proposta, e i gesti della proposta (pickNow, lucky, feedback, back, #go,
// shareIt dell'app vecchia, righe 412, 470–483, 700–706, 719–760).
import { useRef } from "react";
import { useApp, type Res } from "../../app-state";
import { allItems, loadCityShows, nrm, type CityShows } from "../../lib/data";
import { lucky } from "../../lib/lucky";
import { candidates, pickNow } from "../../lib/scoring";
import { mySrc, SRC } from "../../lib/sources";
import { feedback, inWatch, serieOf, toggleWatch } from "../../lib/state";
import type { Item, Stasera } from "../../lib/types";
import { Ask } from "./Ask";
import { Result, type ResultActions } from "./Result";

// Testo di "Condividi", come shareIt dell'app vecchia.
export function shareText(it: Item, st: Stasera): string {
  const dove = it.ty === "cinema" ? "al cinema" + (st.citta ? " a " + st.citta : "")
    : (it.time ? "stasera alle " + it.time + " su " + SRC[mySrc(it, st)[0]].n : "su " + SRC[mySrc(it, st)[0]].n);
  return `Stasera guardiamo «${it.t}» ${dove}? 🍿`;
}

export async function shareIt(it: Item, st: Stasera): Promise<void> {
  const text = shareText(it, st);
  const url = location.origin + location.pathname;
  try { if (navigator.share) { await navigator.share({ title: "Popcorno", text, url }); return; } }
  catch (e) { if (e && (e as Error).name === "AbortError") return; }
  window.open("https://wa.me/?text=" + encodeURIComponent(text + "\n" + url), "_blank");
}

export function Scegli() {
  const app = useApp();
  // I gesti leggono sempre lo stato più recente, come le variabili globali dell'app vecchia
  // (anche dal timer di 👎).
  const cur = useRef(app);
  cur.current = app;
  // luckySkip: i titoli scartati con "Un'altra proposta" o 👎, da quando si è premuto 🍀.
  const skip = useRef(new Set<string>());

  // showRes(zap): mostra la proposta (rifà la scheda) con le modifiche date.
  const showRes = (zap: boolean, patch: (r: Res) => Partial<Res> = () => ({})) =>
    cur.current.setRes((r0) => {
      const r: Res = r0 ?? { list: [], idx: 0, lucky: false, zap: false, shown: false, seq: 0 };
      return { ...r, ...patch(r), zap, shown: true, seq: r.seq + 1 };
    });

  // I gesti aspettano il palinsesto (palReady): un tocco prima che arrivi oggi.json non propone
  // titoli calcolati senza palinsesto.
  const doPick = async (shows: CityShows | null) => {
    const p = await cur.current.palReady();
    const { st, catalog } = cur.current;
    const list = pickNow(p, st, shows, catalog);
    showRes(false, () => ({ list, idx: 0, lucky: false }));
  };

  const doLucky = async () => {
    const p = await cur.current.palReady();
    const { st, catalog } = cur.current;
    const pick = lucky(allItems(p, catalog), st, { now: new Date(), palDate: p.data, skip: skip.current, random: Math.random });
    if (!pick) { showRes(false, () => ({ list: [], idx: 0, lucky: true })); return; }
    showRes(true, () => ({ list: [pick], idx: 0, lucky: true }));
    window.scrollTo({ top: 0 });
  };

  const onGo = async () => {
    const { st } = cur.current;
    let shows = cur.current.shows;
    if (st.tipo === "cinema" && st.citta && (!shows || nrm(shows.citta) !== nrm(st.citta))) {
      cur.current.setShows(null);
      shows = await loadCityShows(st.citta);
      cur.current.setShows(shows);
    }
    await doPick(shows);
    window.scrollTo({ top: 0 });
  };

  const onLucky = () => { skip.current.clear(); void doLucky(); };

  const fb = (it: Item, v: 1 | -1) => {
    const { st, setSt, toast } = cur.current;
    setSt(feedback(st, it, v));
    if (v > 0) { toast("Buona visione! Popcorno se lo ricorda"); showRes(false); return; }
    toast("Ok, meno " + it.g.toLowerCase() + " d'ora in poi");
    setTimeout(async () => {
      if (cur.current.res?.lucky) { skip.current.add(it.t); void doLucky(); return; }
      const p = await cur.current.palReady();
      const { st, shows, catalog } = cur.current;
      const list = candidates(p, st, { shows, extra: catalog });
      showRes(true, () => ({ list, idx: 0 }));
    }, 450);
  };

  const act: ResultActions = {
    back: () => { cur.current.setRes((r) => r && { ...r, shown: false }); window.scrollTo({ top: 0 }); },
    other: (it) => { if (cur.current.res?.lucky) fb(it, 1); else showRes(true, (r) => ({ idx: r.idx + 1 })); },
    feedback: fb,
    again: (it) => { skip.current.add(it.t); void doLucky(); },
    watch: (it) => {
      const { st, setSt, toast } = cur.current;
      const was = inWatch(st, it);
      setSt(toggleWatch(st, it));
      toast(was ? "Tolto dalla lista" : "Aggiunto a Da vedere 🔖");
      showRes(false);
    },
    serie: (it) => {
      const { st, setSt, toast, setView } = cur.current;
      if (!serieOf(st, it)) {
        setSt({ ...st, serie: [...st.serie, { t: it.t, tmdb: it.tmdb || "", s: 1, e: 1 }] });
        toast("Segnata: riparti dalla stagione 1, episodio 1. Cambiala nel Profilo");
        showRes(false);
        return;
      }
      setView("prof");
      setTimeout(() => { const el = document.getElementById("serie-list"); if (el) el.scrollIntoView({ behavior: "smooth" }); }, 150);
    },
    share: (it) => { void shareIt(it, cur.current.st); },
    mini: (t) => {
      showRes(true, (r) => ({ idx: r.list.findIndex((x) => x.it.t === t) }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  };

  const res = app.res;
  const shown = !!res && res.shown;
  return (
    <>
      <Ask hidden={shown} onGo={onGo} onLucky={onLucky} />
      <div id="res" className={shown ? undefined : "hide"}>
        {shown && <Result key={res.seq} res={res} pal={app.pal} act={act} />}
      </div>
      {/* Pagine per Google generate ogni giorno da scripts/pagine.py */}
      <p className="seo"><a href="/stasera-in-tv/">Stasera in TV</a> · <a href="/film-stasera-in-tv/">Film stasera</a> · <a href="/serie-tv-stasera/">Serie TV stasera</a> · <a href="/sport-stasera-in-tv/">Sport stasera</a> · <a href="/cinema/">Cinema oggi</a></p>
    </>
  );
}
