// La scheda della proposta (showRes, osd, facts, showsHtml dell'app vecchia, righe 417–483, 603–611).
import { useEffect, useState } from "react";
import { useApp, type Res } from "../../app-state";
import { filmShows, loadPlot, nowHM, type CityShows, type Palinsesto } from "../../lib/data";
import { isEssai, TYW, wantEssai } from "../../lib/genres";
import { bgStyle } from "../../lib/images";
import { epTxt } from "../../lib/scoring";
import { isFree, mySrc, SRC } from "../../lib/sources";
import { inWatch, serieOf } from "../../lib/state";
import type { Item, Stasera } from "../../lib/types";
import { Why } from "../Why";
import { Banner } from "./Ask";

export type ResultActions = {
  back(): void;
  other(it: Item): void;
  feedback(it: Item, v: 1 | -1): void;
  again(it: Item): void;
  watch(it: Item): void;
  serie(it: Item): void;
  share(it: Item): void;
  seen(it: Item): void;
  trailer(it: Item): void;
  showtimes(it: Item): void;
  mini(t: string): void;
};

function Osd({ it, st }: { it: Item; st: Stasera }) {
  if (it.ty === "cinema")
    return (
      <div className="osd">
        <div><span className="chn" style={{ fontSize: 26, margin: 0 }}>AL CINEMA</span><span className="chn">{st.citta || "in Italia"}</span></div>
        <span className="when">IN SALA</span>
      </div>
    );
  const my = mySrc(it, st), s = SRC[my[0]];
  return (
    <div className="osd">
      <div>
        {s.lcn ? (
          <><span className="ch">{s.lcn}</span><span className="chn">{s.n}</span></>
        ) : (
          <span className="chn" style={{ fontSize: 24, margin: 0 }}>
            {s.n}{my.length > 1 && <> <small style={{ fontSize: 18, opacity: 0.8 }}>+{my.length - 1}</small></>}
          </span>
        )}
      </div>
      {it.time ? <span className="when live"><span className="dot"></span>{it.time}</span> : <span className="when">ON DEMAND</span>}
    </div>
  );
}

function Facts({ it }: { it: Item }) {
  return (
    <div className="facts">
      {!!it.v && <span className="star">★ {it.v}</span>}
      {!!it.y && <span>{it.y}</span>}
      {!!it.dur && <span><b>{it.ty === "serie" ? it.dur + " min a episodio" : it.dur + " min"}</b></span>}
      <span>{it.g}</span>
      {isFree(it) && <span className="free">Gratis</span>}
      {isEssai(it) && <span style={{ color: "#c6f5dd", fontWeight: 700 }}>D'essai</span>}
      {!!it.nuovo && <span className="new">{it.ty === "cinema" ? "Appena uscito" : "Novità"}</span>}
      {!!it.uscita && <span>In sala dal {new Date(it.uscita).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}</span>}
    </div>
  );
}

function Shows({ it, st, shows, onTap }: { it: Item; st: Stasera; shows: CityShows | null; onTap(): void }) {
  const g = (
    <a className="orari" target="_blank" rel="noopener" onClick={onTap} href={"https://www.google.com/search?q=" + encodeURIComponent(it.t + " orari cinema " + (st.citta || ""))}>
      🎟️ {st.citta ? "Cerca orari a " + st.citta : "Cerca orari e sale"}
    </a>
  );
  const sh = filmShows(it, shows);
  if (!sh.length) return g;
  const now = nowHM();
  return (
    <div className="sale">
      <h3 className="more-h">Oggi a {shows!.citta}</h3>
      {sh.map((s, i) => (
        <div className="sala" key={i}>
          <a href={s.url} target="_blank" rel="noopener" onClick={onTap}><b>{s.n.replace(/^Cinema /, "")}</b><span>{s.ind.replace(/ - [^-]+ \([A-Z]{2}\)$/, "")}</span></a>
          <div className="ore">{s.o.map((o, j) => <span key={j} className={o < now ? "passato" : undefined}>{o}</span>)}</div>
        </div>
      ))}
      <p className="fonte">Orari da MoviePlayer, controlla sempre sul sito del cinema.</p>
    </div>
  );
}

// Trame già lette (l'app vecchia le scriveva in it.d): la seconda volta si vedono subito.
const plots = new WeakMap<Item, string>();

function Plot({ it }: { it: Item }) {
  const [txt, setTxt] = useState(() => it.d || plots.get(it) || "…");
  useEffect(() => {
    // Come l'app vecchia: senza tmdb resta "…".
    if (it.d || plots.has(it) || !it.tmdb) return;
    let alive = true;
    loadPlot(it).then((d) => { plots.set(it, d); if (alive) setTxt(d); });
    return () => { alive = false; };
  }, [it]);
  return <p className="plot" id="plot">{txt}</p>;
}

const ZAP_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
);

export function Result({ res, pal, act }: { res: Res; pal: Palinsesto | null; act: ResultActions }) {
  const { st, shows } = useApp();
  const L = res.lucky, list = res.list;
  if (!list.length)
    return (
      <>
        <button className="back" id="bk" onClick={act.back}>‹ Cambia risposte</button>
        <div className="empty"><div className="e">NO SEGNALE</div><p>Nessun titolo corrisponde alle tue risposte.<br />Togli qualche genere, scegli “Sorprendimi” o disattiva “Solo cose gratis”.</p></div>
      </>
    );
  const n = list.length, main = list[res.idx % n], it = main.it;
  const alts = L ? [] : [1, 2, 3, 4].map((i) => list[(res.idx + i) % n]).filter((a, i, arr) => a !== main && arr.indexOf(a) === i);
  const fb = st.liked.includes(it.t) ? "y" : st.disliked.includes(it.t) ? "n" : "";
  const sr = serieOf(st, it), w = inWatch(st, it), seen = st.seen.includes(it.t);
  const kind = (L ? "🍀 Scelto per te · " : "")
    + (wantEssai(st) && isEssai(it) ? (it.ty === "cinema" ? "D'essai in sala" : "Film d'essai") : TYW[it.ty])
    + (it.time ? " · " + (pal ? pal.etichetta : "") : "");
  const why = (L ? "L'ho scelto perché" : "Te lo propongo perché") + " " + (main.why.slice(0, 3).join(", ") || "è una buona scelta per stasera") + ".";
  return (
    <>
      <button className="back" id="bk" onClick={act.back}>{L ? "‹ Indietro" : "‹ Cambia risposte"}</button>
      <div className={res.zap ? "tv zap" : "tv"}>
        <div className="screen" style={bgStyle(it, 500)}>
          <Osd it={it} st={st} />
          {!it.p && <div className="big-emoji" aria-hidden="true">{it.e}</div>}
          <div><div className="kind">{kind}</div><div className="title">{it.t}</div></div>
        </div>
      </div>
      <Facts it={it} />
      <Plot it={it} />
      {it.ty === "cinema" && <Shows it={it} st={st} shows={shows} onTap={() => act.showtimes(it)} />}
      <p className="why"><Why html={why} /></p>
      <div className="acts">
        {it.ty !== "sport" && <button className={w ? "act on" : "act"} id="a-watch" onClick={() => act.watch(it)}>{w ? "🔖 Nella lista" : "🔖 Da vedere"}</button>}
        {it.ty !== "sport" && <button className={seen ? "act on" : "act"} id="a-seen" onClick={() => act.seen(it)}>{seen ? "✔ Visto" : "👁 L'ho visto"}</button>}
        {it.ty === "serie" && <button className={sr ? "act on" : "act"} id="a-serie" onClick={() => act.serie(it)}>{sr ? "📺 " + epTxt(sr) : "📺 La seguo"}</button>}
        {it.ty !== "sport" && (
          <a className="act" id="a-trailer" target="_blank" rel="noopener" onClick={() => act.trailer(it)}
            href={"https://www.youtube.com/results?search_query=" + encodeURIComponent(it.t + (it.y ? " " + it.y : "") + " trailer italiano")}>▶ Trailer</a>
        )}
        <button className="act" id="a-share" onClick={() => act.share(it)}>💬 Condividi</button>
      </div>
      <div className="remote">
        <button className={fb === "y" ? "rbtn yes sel" : "rbtn yes"} id="yes" aria-label="Mi piace" onClick={() => act.feedback(it, 1)}>👍</button>
        <button className="zapbtn" id="other" onClick={() => act.other(it)}>
          {L ? "🍿 Ok, si guarda!" : <>{ZAP_ICON}{it.ty === "cinema" ? "Un altro film" : "Cambia canale"}</>}
        </button>
        <button className={fb === "n" ? "rbtn no sel" : "rbtn no"} id="no" aria-label="Non mi piace" onClick={() => act.feedback(it, -1)}>👎</button>
      </div>
      {L && <button className="again" id="again" onClick={() => act.again(it)}>🍀 Un'altra proposta</button>}
      {!!alts.length && (
        <>
          <h3 className="more-h">{it.ty === "cinema" ? "Altri film in sala" : "Sugli altri canali"}</h3>
          <div className="strip">
            {alts.map((a, i) => {
              const s = SRC[mySrc(a.it, st)[0]];
              return (
                <button key={i} className="mini" data-t={a.it.t} onClick={() => act.mini(a.it.t)}>
                  <div className="ms" style={bgStyle(a.it, 342)}>
                    <span className="mo">{a.it.ty === "cinema" ? "IN SALA" : (s.lcn || s.n)}{a.it.time ? " · " + a.it.time : ""}</span>
                    <span className="me">{a.it.p ? "" : a.it.e}</span>
                  </div>
                  <b>{a.it.t}</b><span>{a.it.g}{a.it.v ? " · ★ " + a.it.v : ""}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <p className="banner" id="rb"><Banner /></p>
    </>
  );
}
