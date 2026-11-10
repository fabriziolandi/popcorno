import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../app-state";
import { deleteAccount, getClient } from "../../lib/account";
import { dayLabel, eventShort, eventText, eventTime, exportName, KIND_FILTERS, type StoredEvent } from "../../lib/miei-dati";
import { AREA, areeScelte } from "../../lib/aree";
import { SRC } from "../../lib/sources";

const PAGE = 100;
const CONFIRM = "Tocca di nuovo per confermare";
const FAIL = "Non ci sono riuscito, riprova tra poco";

type Meta = { created_at: string | null; track_events: boolean | null };

// "I miei dati": cosa Popcorno sa di te, con scarico e cancellazione. Niente senza account.
// Shell lo rimonta a ogni cambio di account (key), così non resta niente dell'account di prima.
export function MieiDati() {
  const { user, view, st, trackEvents, setTrackEvents, clearEvents, toast, setView, forgetSession } = useApp();
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [more, setMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [prefs, setPrefs] = useState<unknown>(null);
  const [filter, setFilter] = useState("tutto");
  const [armed, setArmed] = useState<"storico" | "account" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = user?.id;
  const shown = view === "dati";

  // Senza account la vista non ha senso: si torna al Profilo.
  useEffect(() => { if (shown && !user) setView("prof"); }, [shown, user, setView]);

  const fetchPage = useCallback(async (from: number): Promise<StoredEvent[]> => {
    const c = await getClient();
    const { data, error } = await c.from("events").select("kind,title,created_at")
      // A parità di data (un lotto di segnali) decide l'id: le pagine non saltano né ripetono righe.
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + PAGE - 1);
    if (error) throw error;
    return (data ?? []) as StoredEvent[];
  }, []);

  // Si legge solo con la vista aperta e un account.
  useEffect(() => {
    if (!shown || !userId) return;
    let live = true;
    (async () => {
      try {
        const c = await getClient();
        const [rows, pr, pf] = await Promise.all([
          fetchPage(0),
          c.from("profiles").select("created_at,track_events").maybeSingle(),
          c.from("preferences").select("data,updated_at").maybeSingle(),
        ]);
        if (!live) return;
        setEvents(rows);
        setMore(rows.length === PAGE);
        setMeta((pr.data as Meta | null) ?? null);
        setPrefs(pf.data ?? null);
        setLoaded(true);
      } catch {
        if (live) { setLoaded(true); toast(FAIL); }
      }
    })();
    return () => { live = false; };
  }, [shown, userId, fetchPage, toast]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!user) return null;

  // Prima pressione: si arma il pulsante per 5 secondi; la seconda esegue.
  const confirmTwice = (which: "storico" | "account", run: () => Promise<void>) => async () => {
    if (armed !== which) {
      setArmed(which);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(null), 5000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmed(null);
    try { await run(); } catch { toast(FAIL); }
  };

  const clearHistory = async () => {
    const c = await getClient();
    const { error } = await c.from("events").delete().eq("user_id", user.id);
    if (error) throw error;
    clearEvents();
    setEvents([]);
    setMore(false);
    toast("Storico cancellato");
  };
  const removeAccount = async () => {
    await deleteAccount();
    forgetSession();
    toast("Account eliminato. Le preferenze restano su questo dispositivo.");
    setView("prof");
  };
  const showMore = async () => {
    try {
      const rows = await fetchPage(events.length);
      setEvents((e) => [...e, ...rows]);
      setMore(rows.length === PAGE);
    } catch { toast(FAIL); }
  };
  const download = async () => {
    try {
      // Si scarica tutto lo storico, non solo le righe già mostrate.
      const all = [...events];
      let next = more;
      while (next) {
        const rows = await fetchPage(all.length);
        all.push(...rows);
        next = rows.length === PAGE;
      }
      const body = { account: { email: user.email, created_at: meta?.created_at ?? null }, profilo: meta, preferenze: prefs, storico: all };
      const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = exportName(new Date());
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch { toast(FAIL); }
  };

  const toggle = async () => {
    try { await setTrackEvents(!trackEvents); } catch { toast(FAIL); }
  };

  const chips = [
    ...st.subs.map((k) => SRC[k]?.n ?? k),
    ...(st.citta ? ["📍 " + st.citta] : []),
    ...(st.team && st.team !== "Nessuna" ? ["⚽ " + st.team] : []),
    ...st.gen,
    ...areeScelte(st).map((k) => AREA[k]?.n ?? k),
  ];
  const counts: [number, string][] = [
    [st.watch.length, "Da vedere"], [st.serie.length, "Serie seguite"], [st.liked.length, "Mi piace"],
    [st.disliked.length, "Non mi piace"], [st.seen.length, "Visti"],
  ];
  // Il filtro lavora sulle righe già lette; i giorni sono quelli del dispositivo.
  const kinds = KIND_FILTERS.find((f) => f.id === filter)?.kinds;
  const now = new Date();
  const days: { label: string; events: StoredEvent[] }[] = [];
  for (const e of events) {
    if (kinds && !kinds.includes(e.kind)) continue;
    const label = dayLabel(new Date(e.created_at), now);
    const last = days[days.length - 1];
    if (last && last.label === label) last.events.push(e);
    else days.push({ label, events: [e] });
  }

  return (
    <>
      <button className="act" style={{ marginBottom: 16 }} onClick={() => setView("prof")}>‹ Profilo</button>
      <h2 className="sec" style={{ marginBottom: 20 }}>I miei dati</h2>
      <p>Account: {user.email}</p>
      <div className="grp">
        <button className={trackEvents ? "sw on" : "sw"} role="switch" aria-label="Ricorda le mie scelte" aria-checked={trackEvents} onClick={toggle} />
        <h3>Ricorda le mie scelte</h3>
        <p>Se lo spegni, Popcorno smette di registrare le tue scelte. Preferenze e sincronizzazione continuano.</p>
      </div>
      <div className="grp"><h3>Le tue preferenze</h3>
        <div className="pref-chips">
          {chips.length ? chips.map((c, i) => <span key={i}>{c}</span>) : <span className="none">Nessuna preferenza indicata</span>}
        </div>
        <div className="stats mini-stats">
          {counts.map(([n, l]) => <div className="stat" key={l}><b>{n}</b><span>{l}</span></div>)}
        </div>
      </div>
      <div className="grp"><h3>Le tue scelte</h3>
        {events.length ? (
          <>
            <div className="filters storia-filtri" role="group" aria-label="Filtra le scelte">
              {KIND_FILTERS.map((f) => (
                <button key={f.id} className={filter === f.id ? "chip on" : "chip"} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
              ))}
            </div>
            {days.length ? (
              <div className="storia-days">
                {days.map((d) => (
                  <section key={d.label}>
                    <h4 className="storia-day">{d.label}</h4>
                    <ul className="storia">
                      {d.events.map((e, i) => {
                        const sh = eventShort(e.kind);
                        return (
                          <li key={i} aria-label={eventText(e)}>
                            <span className="ic" aria-hidden="true">{sh.icon}</span>
                            <div><small>{sh.label}</small><b>{e.title?.trim() || "un titolo"}</b></div>
                            <time dateTime={e.created_at}>{eventTime(e.created_at)}</time>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            ) : <p>Nessuna scelta di questo tipo.</p>}
          </>
        ) : loaded ? <p>Ancora nessuna scelta registrata.</p> : null}
        {more && <button className="act" style={{ marginTop: 10 }} onClick={showMore}>Mostra altre</button>}
      </div>
      <div className="grp">
        <button className="act" style={{ width: "100%" }} onClick={download}>Scarica i miei dati</button>
        <button className="act" style={{ width: "100%", marginTop: 10 }} onClick={confirmTwice("storico", clearHistory)}>
          {armed === "storico" ? CONFIRM : "Cancella lo storico"}
        </button>
        <button className="act" style={{ width: "100%", marginTop: 10 }} onClick={confirmTwice("account", removeAccount)}>
          {armed === "account" ? CONFIRM : "Elimina l'account"}
        </button>
      </div>
    </>
  );
}
