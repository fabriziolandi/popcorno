import { useState } from "react";
import { useApp } from "../../app-state";
import { findRef } from "../../lib/data";
import { bgStyle } from "../../lib/images";
import { toggleSeen, toggleWatch } from "../../lib/state";
import type { Item, TitleRef } from "../../lib/types";

type Tab = "watch" | "seen" | "liked";
const TAB_KEY = "popcorno-lista-tab";
const MAX = 12;

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: "watch", label: "🔖 Da vedere", empty: "Niente in lista. Tocca “🔖 Da vedere” sotto una proposta." },
  { id: "seen", label: "👁 Visti", empty: "Nessun titolo visto. Tocca “👁 L'ho visto” sotto una proposta." },
  { id: "liked", label: "👍 Piaciuti", empty: "Nessun titolo piaciuto. Metti 👍 a quello che ti è piaciuto." },
];

const readTab = (): Tab => {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return v === "seen" || v === "liked" ? v : "watch";
  } catch { return "watch"; }
};

// Un Item minimo per cambiare lo stato di un titolo che non si trova più nel palinsesto.
const bare = (ref: TitleRef, it: Item | null): Item =>
  ({ t: ref.t, tmdb: ref.tmdb, ty: it?.ty ?? "film", g: "", s: "", m: [], w: [] });

// "La mia lista" nel Profilo: Da vedere, Visti e Piaciuti come locandine. Niente rete.
export function MiaLista() {
  const { st, setSt, pal, catalog, openItem, toast, track } = useApp();
  const [tab, setTab] = useState<Tab>(readTab);
  const [all, setAll] = useState(false);

  const lists: Record<Tab, TitleRef[]> = {
    watch: st.watch,
    seen: st.seen.map((t) => ({ t })),
    liked: st.liked.map((t) => ({ t })),
  };
  const refs = [...lists[tab]].reverse();
  const shown = all ? refs : refs.slice(0, MAX);

  const choose = (t: Tab) => {
    setTab(t);
    setAll(false);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* niente memoria: va bene lo stesso */ }
  };

  const markSeen = (ref: TitleRef, it: Item | null) => {
    const b = bare(ref, it);
    const add = !st.seen.includes(ref.t);
    setSt(toggleWatch(add ? toggleSeen(st, b) : st, b));
    if (it) {
      if (add) track("seen", it);
      track("watch_remove", it);
    }
    toast("Segnato come visto");
  };
  const remove = (ref: TitleRef, it: Item | null) => {
    setSt(toggleWatch(st, bare(ref, it)));
    if (it) track("watch_remove", it);
    toast("Tolto dalla lista");
  };

  const empty = TABS.find((x) => x.id === tab)!.empty;

  return (
    <div className="grp" id="mia-lista"><h3>La mia lista</h3>
      <div className="lista-tabs" role="tablist" aria-label="La mia lista">
        {TABS.map((x) => (
          <button key={x.id} role="tab" id={"lista-tab-" + x.id} aria-selected={tab === x.id} aria-controls="lista-panel"
            className={tab === x.id ? "chip on" : "chip"} onClick={() => choose(x.id)}>
            {x.label} <span className="lista-n">({lists[x.id].length})</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="lista-panel" aria-labelledby={"lista-tab-" + tab}>
        {refs.length ? (
          <div className="lista-grid">
            {shown.map((ref, i) => {
              const it = findRef(ref, pal, catalog);
              const body = (
                <>
                  <div className="lista-poster" style={it ? bgStyle(it, 342) : undefined}>
                    {!it?.p && <span className="lista-e" aria-hidden="true">{it?.e || "🎬"}</span>}
                  </div>
                  <b className="lista-t">{ref.t}</b>
                  {it?.g ? <span className="lista-g">{it.g}</span> : null}
                </>
              );
              return (
                <div className="lista-card" key={i + ":" + (ref.tmdb || ref.t)}>
                  {it
                    ? <button className="lista-open" onClick={() => openItem(it)}>{body}</button>
                    : <div className="lista-open">{body}</div>}
                  {tab === "watch" && (
                    <div className="lista-acts">
                      <button onClick={() => markSeen(ref, it)}>✔ Visto</button>
                      <button aria-label={"Togli " + ref.t} onClick={() => remove(ref, it)}>✕ Togli</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : <p className="lista-empty">{empty}</p>}
        {!all && refs.length > MAX && (
          <button className="act lista-more" onClick={() => setAll(true)}>Mostra tutti ({refs.length})</button>
        )}
      </div>
    </div>
  );
}
