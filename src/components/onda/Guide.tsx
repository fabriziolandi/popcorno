import { useState, type CSSProperties } from "react";
import { useApp } from "../../app-state";
import { allItems, filmShows, findRef, isoDay, nextTimes, nowHM } from "../../lib/data";
import { isEssai, TYW } from "../../lib/genres";
import { available, isFree, mySrc, SRC } from "../../lib/sources";
import { toggleWatch } from "../../lib/state";
import type { Item, Stasera } from "../../lib/types";

// ---------- GUIDA TV (righe 497–545 e 664–682 dell'app vecchia) ----------
const FILTERS: [string, string][] = [["tutti","Tutto"],["film","Film"],["serie","Serie"],["show","Show"],["sport","Sport"],["gratis","Solo gratis"],["nuovo","Novità streaming"],["watch","🔖 Da vedere"],["essai","D'essai"],["cinema","Al cinema"]];

export const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const rowBtn: CSSProperties = { width: "100%", background: "none", border: 0, borderBottom: "1px solid #2f377a88", textAlign: "left" };

// Il riquadro canale: numero sul telecomando, o il nome dell'app.
function LcnBox({ it, st }: { it: Item; st: Stasera }) {
  const s = SRC[mySrc(it, st)[0]];
  return s.lcn ? <div className="lcn">{s.lcn}<small>{s.n}</small></div> : <div className="lcn app">{s.n}</div>;
}

const Empty = ({ e, children }: { e: string; children: string }) => <div className="empty"><div className="e">{e}</div><p>{children}</p></div>;
const Star = ({ it }: { it: Item }) => <div className="t st">{it.v ? "★ " + it.v : ""}</div>;

export function Guide() {
  const { st, setSt, pal, catalog, shows, toast, openItem } = useApp();
  const [gf, setGf] = useState("tutti");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  const C = pal ? allItems(pal, catalog) : [];
  const CIN = pal ? pal.cinema : [];
  const open = (it: Item) => openItem(it);

  function body() {
    if (searching) {
      const n = norm(q.trim());
      const res = C.concat(CIN).filter((it) => norm(it.t).includes(n))
        .sort((a, b) => (+norm(b.t).startsWith(n) - +norm(a.t).startsWith(n)) || ((b.pop || 0) - (a.pop || 0))).slice(0, 40);
      return res.length ? <>{res.map((it, i) => (
        <button key={i} className="row" style={rowBtn} onClick={() => open(it)}>
          <LcnBox it={it} st={st} />
          <div><b>{it.t}</b><div className="ty">{TYW[it.ty] || ""} · {it.g}{it.y ? " · " + it.y : ""}{available(it, st) ? "" : " · non nei tuoi abbonamenti"}</div></div>
          <Star it={it} />
        </button>
      ))}</> : <Empty e="NIENTE">Nessun titolo con questo nome. Prova a scriverlo in modo diverso.</Empty>;
    }
    if (gf === "watch") {
      const ws = st.watch.map((r) => findRef(r, pal, catalog)).filter((x): x is Item => !!x);
      if (!ws.length) return <Empty e="LISTA VUOTA">Tocca “🔖 Da vedere” sotto una proposta per salvarla qui.</Empty>;
      return <>
        <p className="sub">I titoli che hai salvato. Popcorno te li propone quando sono adatti alla serata.</p>
        {ws.map((it, i) => (
          <div key={i} className="row">
            <button className="wopen" style={{ all: "unset", display: "contents", cursor: "pointer" }} onClick={() => open(it)}>
              <LcnBox it={it} st={st} />
              <div><b>{it.t}</b><div className="ty">{TYW[it.ty] || ""} · {it.g}{it.time ? " · stasera alle " + it.time : ""}{available(it, st) ? "" : " · non nei tuoi abbonamenti"}</div></div>
            </button>
            <button className="wdel" aria-label="Togli dalla lista" style={{ background: "none", border: 0, color: "var(--muto)", fontSize: 20, padding: 8 }}
              onClick={() => { setSt(toggleWatch(st, it)); toast("Tolto dalla lista"); }}>✕</button>
          </div>
        ))}
      </>;
    }
    if (gf === "essai") {
      const es = C.concat(CIN).filter((it) => isEssai(it) && (it.ty === "cinema" || available(it, st)));
      es.sort((a, b) => ((b.v || 0) * Math.log10((b.vc || 10) + 10)) - ((a.v || 0) * Math.log10((a.vc || 10) + 10)));
      if (!es.length) return <Empty e="SALA VUOTA">Aggiungi MUBI o altre piattaforme nel Profilo per vedere i film d'essai.</Empty>;
      return <>
        <p className="sub">Cinema d'autore: tutto MUBI e i film più apprezzati dalla critica sulle tue piattaforme, in TV e in sala.</p>
        {es.slice(0, 120).map((it, i) => (
          <button key={i} className="row" style={rowBtn} onClick={() => open(it)}>
            {it.ty === "cinema" ? <div className="lcn app">🎟️<small>in sala</small></div> : <LcnBox it={it} st={st} />}
            <div><b>{it.t}</b><div className="ty">{it.g}{it.y ? " · " + it.y : ""}{it.time ? " · stasera alle " + it.time : ""}</div></div>
            <Star it={it} />
          </button>
        ))}
      </>;
    }
    if (gf === "cinema") {
      const inCity = !!(shows && shows.sale.length);
      const cs = (inCity ? CIN.filter((it) => filmShows(it, shows).length) : [...CIN]).sort((a, b) => (b.pop || 0) - (a.pop || 0));
      if (!cs.length) return <Empty e="SALA VUOTA">Nessun film in programmazione trovato oggi.</Empty>;
      return <>
        <p className="sub">{inCity
          ? <>Film in programmazione oggi a <b>{shows!.citta}</b>. Tocca un titolo per sale e orari.</>
          : `I film nelle sale italiane.${st.citta ? " Non ho gli orari di " + st.citta + ": scegli il capoluogo più vicino nel Profilo." : " Scegli la tua città nel Profilo per vedere sale e orari."}`}</p>
        {cs.map((it, i) => (
          <button key={i} className="row" style={rowBtn} onClick={() => { setSt({ ...st, tipo: "cinema" }); openItem(it, "cinema"); }}>
            <div className="lcn app">🎟️<small>{inCity ? filmShows(it, shows).length + " sale" : it.dur + " min"}</small></div>
            <div><b>{it.t}</b><div className="ty">{it.g}{it.nuovo ? " · appena uscito" : ""}{inCity ? " · " + nextTimes(it, shows).slice(0, 3).join(" ") : ""}</div></div>
            <Star it={it} />
          </button>
        ))}
      </>;
    }
    if (gf === "nuovo") {
      const nv = C.filter((it) => it.nuovo && available(it, st)).sort((a, b) => (b.v || 0) - (a.v || 0));
      if (!nv.length) return <Empty e="NESSUNA NOVITÀ">Aggiungi i tuoi abbonamenti nel Profilo per vedere le novità.</Empty>;
      return <>{nv.map((it, i) => (
        <div key={i} className="row">
          <LcnBox it={it} st={st} />
          <div><b>{it.t}</b><div className="ty">{it.ty === "film" ? "Film" : "Serie"} · {it.g}{it.y ? " · " + it.y : ""}</div></div>
          <Star it={it} />
        </div>
      ))}</>;
    }
    const rows = C.filter((it) => it.time).filter((it) => gf === "tutti" || (gf === "gratis" ? isFree(it) : it.ty === gf))
      .filter((it) => available(it, st)).sort((a, b) => a.time!.localeCompare(b.time!));
    const now = nowHM();
    let marked = !!pal && pal.data !== isoDay();
    if (!rows.length) return <Empty e="NO SEGNALE">Niente in onda con questo filtro. Prova “Tutto”.</Empty>;
    return <>{rows.map((it, i) => {
      let line = null;
      if (!marked && it.time! > now) { marked = true; line = <div className="nowline">ORA {now}</div>; }
      return (
        <div key={i}>
          {line}
          <div className="row">
            <LcnBox it={it} st={st} />
            <div><b>{it.e} {it.t}</b><div className="ty">{it.g} · {it.dur} min{it.v ? " · ★ " + it.v : ""}{it.teams && it.teams.includes(st.team) ? " · la tua squadra" : ""}</div></div>
            <div className="t">{it.time}</div>
          </div>
        </div>
      );
    })}</>;
  }

  return (
    <>
      <h2 className="sec" id="gtitle">Guida di {(pal && pal.etichetta) || "stasera"}</h2>
      <p className="sub" id="gsub">Fonti: {((pal && pal.fonti) || []).join(", ")}</p>
      <input id="cerca" type="search" placeholder="Cerca un film o una serie…" autoComplete="off" value={q}
        style={{ width: "100%", padding: "14px 16px", borderRadius: 14, background: "var(--notte2)", color: "var(--testo)", border: "1.5px solid var(--bordo)", font: "600 15px Figtree,sans-serif", marginBottom: 14 }}
        onChange={(e) => { setQ(e.target.value); setSearching(norm(e.target.value.trim()).length >= 2); }} />
      <div className="filters" id="gfil">
        {FILTERS.map(([v, l]) => <button key={v} className={"chip " + (gf === v ? "on" : "")} data-v={v} onClick={() => { setGf(v); setSearching(false); }}>{l}</button>)}
      </div>
      {/* Finché il palinsesto non arriva la guida resta vuota (niente "NO SEGNALE" per un attimo). */}
      <div id="guide">{pal ? body() : null}</div>
    </>
  );
}
