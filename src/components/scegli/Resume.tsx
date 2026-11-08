// "Riprendi …": le prime 3 serie che stai seguendo (renderResume dell'app vecchia, righe 694–699).
import { useApp } from "../../app-state";
import { findRef } from "../../lib/data";
import { epTxt } from "../../lib/scoring";
import { mySrc, SRC } from "../../lib/sources";

export function Resume() {
  const { st, pal, catalog, openItem } = useApp();
  const rows = st.serie.map((x) => ({ x, it: findRef(x, pal, catalog) })).filter((r) => r.it).slice(0, 3);
  return (
    <div id="resume">
      {rows.map((r, i) => (
        <button key={i} className="resume" data-i={i} onClick={() => openItem(r.it!)}>
          <span style={{ fontSize: 26 }}>📺</span>
          <span><b>Riprendi {r.x.t}</b><small>{SRC[mySrc(r.it!, st)[0]].n}</small></span>
          <span className="ee">{epTxt(r.x)}</span>
        </button>
      ))}
    </div>
  );
}
