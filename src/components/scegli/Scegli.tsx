// Vista Scegli: domande o proposta, e i gesti della proposta (pickNow, lucky, feedback, back, #go,
// shareIt dell'app vecchia, righe 412, 470–483, 700–706, 719–760).
import { useRef } from "react";
import { track as trackUsage } from "../../lib/analytics";
import { useApp, type Res } from "../../app-state";
import { allItems, loadCityShows, nrm, type CityShows } from "../../lib/data";
import { lucky } from "../../lib/lucky";
import { candidates, pickNow, varia } from "../../lib/scoring";
import { mySrc, SRC } from "../../lib/sources";
import { feedback, inWatch, serieOf, toggleSeen, toggleWatch } from "../../lib/state";
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
    const list = varia(pickNow(p, st, shows, catalog), st);
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
    trackUsage("accendi", { tempo: st.tempo, chi: st.chi, umore: st.umore, tipo: st.tipo, generi: st.gen, gratis: st.free });
    let shows = cur.current.shows;
    if (st.tipo === "cinema" && st.citta && (!shows || nrm(shows.citta) !== nrm(st.citta))) {
      cur.current.setShows(null);
      shows = await loadCityShows(st.citta);
      cur.current.setShows(shows);
    }
    await doPick(shows);
    window.scrollTo({ top: 0 });
  };

  const onLucky = () => { trackUsage("mi_sento_fortunato"); skip.current.clear(); void doLucky(); };

  const fb = (it: Item, v: 1 | -1) => {
    const { st, setSt, toast, track } = cur.current;
    trackUsage(v > 0 ? "pollice_su" : "pollice_giu", { titolo: it.t, tipo: it.ty });
    setSt(feedback(st, it, v));
    track(v > 0 ? "like" : "dislike", it);
    if (v > 0) { toast("Buona visione! Popcorno se lo ricorda"); showRes(false); return; }
    toast("Ok, meno " + it.g.toLowerCase() + " d'ora in poi");
    setTimeout(async () => {
      if (cur.current.res?.lucky) { skip.current.add(it.t); void doLucky(); return; }
      const p = await cur.current.palReady();
      const { st, shows, catalog } = cur.current;
      const list = varia(candidates(p, st, { shows, extra: catalog }), st);
      showRes(true, () => ({ list, idx: 0 }));
    }, 450);
  };

  const act: ResultActions = {
    back: () => { trackUsage("cambia_risposte"); cur.current.setRes((r) => r && { ...r, shown: false }); window.scrollTo({ top: 0 }); },
    other: (it) => { trackUsage("cambia_canale", { titolo: it.t }); if (cur.current.res?.lucky) fb(it, 1); else showRes(true, (r) => ({ idx: r.idx + 1 })); },
    feedback: fb,
    again: (it) => { trackUsage("altra_proposta", { titolo: it.t }); skip.current.add(it.t); void doLucky(); },
    watch: (it) => {
      const { st, setSt, toast, track } = cur.current;
      const was = inWatch(st, it);
      setSt(toggleWatch(st, it));
      track(was ? "watch_remove" : "watch_add", it);
      toast(was ? "Tolto dalla lista" : "Aggiunto a Da vedere 🔖");
      showRes(false);
    },
    serie: (it) => {
      const { st, setSt, toast, setView, track } = cur.current;
      if (!serieOf(st, it)) {
        setSt({ ...st, serie: [...st.serie, { t: it.t, tmdb: it.tmdb || "", s: 1, e: 1 }] });
        track("follow", it);
        toast("Segnata: riparti dalla stagione 1, episodio 1. Cambiala nel Profilo");
        showRes(false);
        return;
      }
      setView("prof");
      setTimeout(() => { const el = document.getElementById("serie-list"); if (el) el.scrollIntoView({ behavior: "smooth" }); }, 150);
    },
    seen: (it) => {
      const { st, setSt, toast, track } = cur.current;
      const was = st.seen.includes(it.t);
      setSt(toggleSeen(st, it));
      track(was ? "unseen" : "seen", it);
      toast(was ? "Tolto dai visti" : "Segnato come visto");
      showRes(false);
    },
    trailer: (it) => { cur.current.track("trailer", it); },
    showtimes: (it) => { cur.current.track("showtimes", it); },
    share: (it) => { trackUsage("condividi", { titolo: it.t, tipo: it.ty }); void shareIt(it, cur.current.st); },
    mini: (t) => {
      trackUsage("altra_proposta_scelta", { titolo: t });
      // Tocco su un titolo della striscia: una scelta (R4). `shown` = la striscia più il titolo principale.
      const r = cur.current.res;
      if (r && r.list.length) {
        const n = r.list.length, main = r.list[r.idx % n];
        const alts = [1, 2, 3, 4].map((i) => r.list[(r.idx + i) % n]).filter((a, i, arr) => a !== main && arr.indexOf(a) === i);
        const picked = r.list.find((x) => x.it.t === t);
        if (picked) cur.current.track("open", picked.it, { shown: [main.it.t, ...alts.map((a) => a.it.t)].slice(0, 10) });
      }
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
      <p className="seo"><a href="/stasera-in-tv/">Stasera in TV</a> · <a href="/film-stasera-in-tv/">Film stasera</a> · <a href="/serie-tv-stasera/">Serie TV stasera</a> · <a href="/sport-stasera-in-tv/">Sport stasera</a> · <a href="/cinema/">Cinema oggi</a> · <a href="/streaming/">Cosa vedere in streaming</a></p>
    </>
  );
}
