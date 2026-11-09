import { useEffect, useRef, useState } from "react";
import { useApp } from "../../app-state";
import { loadCatalogs } from "../../lib/data";
import { TEAMS } from "../../lib/genres";
import { profileLink } from "../../lib/profile-link";
import { Account } from "./Account";
import { epTxt } from "../../lib/scoring";
import { SRC } from "../../lib/sources";
import type { Item } from "../../lib/types";

const input = { width: "100%", padding: 14, borderRadius: 14, background: "var(--notte2)", color: "var(--testo)", border: "1.5px solid var(--bordo)", font: "600 15px Figtree,sans-serif" } as const;

// Vista Profilo (renderProf dell'app vecchia).
export function Profile() {
  const { st, setSt, toast, addCatalog, track } = useApp();
  const stRef = useRef(st);
  stRef.current = st;

  const pay = Object.keys(SRC).filter((k) => !SRC[k].free && !SRC[k].via && !SRC[k].sala);
  const freeSrc = Object.keys(SRC).filter((k) => SRC[k].free).map((k) => SRC[k].n).join(", ");
  const top = Object.entries(st.likes).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1])[0];

  const toggleSub = (k: string) => {
    const on = st.subs.includes(k);
    setSt({ ...st, subs: on ? st.subs.filter((x) => x !== k) : [...st.subs, k] });
    if (!on) loadCatalogs({ ...st, subs: [...st.subs, k] }).then(addCatalog);
  };

  // #citta2: come l'app vecchia ascolta "change" (non ogni tasto).
  const citta = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = citta.current!;
    const h = () => {
      const c = el.value.trim();
      setSt({ ...stRef.current, citta: c });
      toast(c ? "Città: " + c : "Città rimossa");
    };
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, [setSt, toast]);
  useEffect(() => {
    const el = citta.current!;
    if (el.value !== (st.citta || "")) el.value = st.citta || "";
  }, [st.citta]);

  const setSerie = (i: number, f: (x: typeof st.serie[number]) => typeof st.serie[number] | null) => {
    const serie = st.serie.flatMap((x, j) => {
      if (j !== i) return [x];
      const y = f(x);
      return y ? [y] : [];
    });
    setSt({ ...st, serie });
  };

  const [link, setLink] = useState<string | null>(null);
  const out = useRef<HTMLInputElement>(null);
  const copy = async () => {
    const l = profileLink(st, location.origin + location.pathname);
    setLink(l);
    try {
      await navigator.clipboard.writeText(l);
      toast("Link copiato: aprilo sull'altro dispositivo");
    } catch {
      out.current?.select();
      toast("Tieni premuto il link per copiarlo");
    }
  };

  return (
    <>
      <h2 className="sec" style={{ marginBottom: 20 }}>I tuoi gusti</h2>
      <div className="grp"><h3>I tuoi abbonamenti</h3><p>Ti propongo solo quello che puoi vedere davvero.</p>
        <div className="seg" id="subs">
          {pay.map((k) => (
            <button key={k} className={st.subs.includes(k) ? "chip on" : "chip"} data-k={k} aria-pressed={st.subs.includes(k)} onClick={() => toggleSub(k)}>{SRC[k].n}</button>
          ))}
        </div>
      </div>
      <div className="grp"><h3>La tua città</h3><p>Per gli orari dei film al cinema.</p>
        <input id="citta2" ref={citta} list="citta-list" placeholder="Scrivi la tua città" autoComplete="off" style={input} />
      </div>
      <div className="grp"><h3>La tua squadra</h3><p>Quando gioca, la partita va in cima.</p>
        <select id="team" aria-label="La tua squadra" value={st.team} onChange={(e) => {
          setSt({ ...st, team: e.target.value });
          toast(e.target.value === "Nessuna" ? "Squadra rimossa" : "Forza " + e.target.value + "!");
        }}>
          {TEAMS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="grp" id="serie-list"><h3>Serie che stai seguendo</h3><p>Segna a che episodio sei: Popcorno ti ricorda dove ripartire.</p>
        <div id="serie-box">
          {st.serie.length ? st.serie.map((x, i) => (
            <div className="ep" key={i}>
              <div><b>{x.t}</b><span>Prossimo da vedere</span></div>
              <div className="ctr">
                <button aria-label="Episodio precedente" onClick={() => setSerie(i, (y) => ({ ...y, e: Math.max(1, y.e - 1) }))}>−</button>
                <span className="ee">{epTxt(x)}</span>
                <button aria-label="Episodio successivo" onClick={() => setSerie(i, (y) => ({ ...y, e: Math.max(1, y.e + 1) }))}>+</button>
                <button aria-label="Stagione successiva" style={{ width: "auto", padding: "0 10px", fontSize: 13 }} onClick={() => setSerie(i, (y) => ({ ...y, s: y.s + 1, e: 1 }))}>Stag. +1</button>
                <button aria-label="Smetti di seguirla" style={{ color: "var(--muto)" }} onClick={() => {
                  track("unfollow", { t: x.t, ty: "serie", s: "", m: [], w: [], tmdb: x.tmdb || undefined, g: "" } satisfies Item);
                  setSerie(i, () => null);
                }}>✕</button>
              </div>
            </div>
          )) : <p style={{ fontSize: 13, color: "var(--muto)" }}>Nessuna serie. Tocca “📺 La seguo” sotto una serie.</p>}
        </div>
      </div>
      <div className="grp"><h3>Cosa ho imparato di te</h3>
        <div className="stats" id="stats">
          <div className="stat"><b>{st.liked.length}</b><span>titoli che ti sono piaciuti</span></div>
          <div className="stat"><b>{st.disliked.length}</b><span>titoli scartati</span></div>
          <div className="stat" style={{ gridColumn: "span 2" }}><b>{top ? top[0] : "—"}</b><span>{top ? "il genere che preferisci finora" : "Metti qualche 👍 e imparo i tuoi gusti"}</span></div>
        </div>
      </div>
      <div className="grp"><h3>Sempre inclusi, gratis</h3><p className="free-list" id="freesrc">{freeSrc}</p></div>
      <Account />
      <div className="grp"><h3>Usa Popcorno su un altro dispositivo</h3><p>Copia il tuo link personale e aprilo sull'altro telefono o tablet: ritrovi abbonamenti, gusti, lista e serie.</p>
        <button className="act" id="sync" style={{ width: "100%" }} onClick={copy}>🔗 Copia il mio link</button>
        <input id="sync-out" ref={out} readOnly className={link ? undefined : "hide"} value={link ?? ""} style={{ width: "100%", marginTop: 10, padding: 12, borderRadius: 12, background: "var(--notte2)", color: "var(--testo)", border: "1.5px solid var(--bordo)", font: "500 12px Figtree,sans-serif" }} />
        <p className="credit">Catalogo streaming, voti e trame da <a href="https://www.themoviedb.org">TMDB</a>. Questo prodotto usa le API di TMDB ma non è approvato né certificato da TMDB. · <a href="/privacy/">Privacy</a> · <a href="mailto:privacy@popcorno.it">privacy@popcorno.it</a></p>
      </div>
    </>
  );
}
