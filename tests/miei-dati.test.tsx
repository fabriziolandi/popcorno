// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EVENT_KINDS, type EventKind } from "../src/lib/events";
import { dayLabel, eventShort, eventText, exportName, KIND_FILTERS } from "../src/lib/miei-dati";

const app = {
  user: { id: "u1", email: "a@b.it" } as { id: string; email: string } | null,
  view: "dati",
  trackEvents: true,
  setTrackEvents: vi.fn(async (_on: boolean) => {}),
  clearEvents: vi.fn(),
  forgetSession: vi.fn(),
  toast: vi.fn(),
  setView: vi.fn(),
  st: { subs: ["netflix"], citta: "Roma", team: "Nessuna", gen: [] as string[], watch: [1], serie: [], liked: [1, 2], disliked: [], seen: [] },
};
vi.mock("../src/app-state", () => ({ useApp: () => app }));
const deleteAccount = vi.fn(async () => {});
vi.mock("../src/lib/account", async (orig) => ({
  ...(await orig<typeof import("../src/lib/account")>()),
  deleteAccount: () => deleteAccount(),
}));
// Shell con le sole sezioni che servono qui.
for (const m of ["Header", "Nav", "Toast", "prof/Profile", "onda/Guide", "scegli/Scegli"]) {
  const name = m.split("/").pop()!;
  vi.doMock(`../src/components/${m}`, () => ({ [name]: () => null }));
}

import { MieiDati } from "../src/components/prof/MieiDati";
import { setClientForTests } from "../src/lib/account";
const { Shell } = await import("../src/components/Shell");

const eq = vi.fn(async (_c: string, _v: string) => ({ error: null as unknown }));
const rows = [{ kind: "like", title: "Dune", created_at: new Date(2026, 10, 7, 21, 10).toISOString() }];
const range = vi.fn(async (_a: number, _b: number) => ({ data: rows as unknown[] | null, error: null as unknown }));
// Ogni lettura dello storico registra gli ordinamenti chiesti.
const orders: [string, unknown][][] = [];
const ordered = () => {
  const mine: [string, unknown][] = [];
  orders.push(mine);
  const q = { order: (col: string, o: unknown) => { mine.push([col, o]); return q; }, range };
  return q;
};
let metaFail = false;
const single = (data: unknown) => ({
  select: () => ({ maybeSingle: async () => (metaFail ? { data: null, error: { message: "boom" } } : { data, error: null }) }),
});
const client = {
  from: (t: string) => {
    if (t === "events") return {
      select: () => ordered(),
      delete: () => ({ eq }),
    };
    return t === "profiles" ? single({ created_at: "2026-01-01", track_events: true }) : single({ data: { a: 1 }, updated_at: "x" });
  },
};

// Il pulsante di un filtro della cronologia (i nomi tornano anche nei conteggi).
const filtro = (root: Element, label: string) =>
  [...root.querySelectorAll(".storia-filtri button")].find((b) => b.textContent === label)!;
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };

beforeEach(() => {
  app.user = { id: "u1", email: "a@b.it" };
  app.view = "dati";
  for (const f of [app.setTrackEvents, app.clearEvents, app.toast, app.setView, app.forgetSession, deleteAccount, eq]) f.mockClear();
  range.mockReset();
  range.mockImplementation(async () => ({ data: rows, error: null }));
  orders.length = 0;
  metaFail = false;
  setClientForTests(client);
});
afterEach(() => { cleanup(); setClientForTests(null); vi.useRealTimers(); });

describe("testi dello storico", () => {
  const d = new Date(2026, 10, 7, 21, 10).toISOString();
  const frasi: Record<EventKind, string> = {
    open: "Hai aperto «X»",
    like: "Hai messo mi piace a «X»",
    dislike: "Hai messo non mi piace a «X»",
    unlike: "Hai tolto il mi piace a «X»",
    undislike: "Hai tolto il non mi piace a «X»",
    seen: "Hai segnato come visto «X»",
    unseen: "Hai tolto «X» dai visti",
    watch_add: "Hai aggiunto «X» a Da vedere",
    watch_remove: "Hai tolto «X» da Da vedere",
    follow: "Hai iniziato a seguire «X»",
    unfollow: "Hai smesso di seguire «X»",
    trailer: "Hai aperto il trailer di «X»",
    showtimes: "Hai guardato gli orari di «X»",
    go: "Hai aperto il link per vedere «X»",
  };
  it("ogni tipo ha la sua frase", () => {
    expect(Object.keys(frasi).sort()).toEqual([...EVENT_KINDS].sort());
    for (const k of EVENT_KINDS) expect(eventText({ kind: k, title: "X", created_at: d })).toBe(`7 nov, 21:10 — ${frasi[k]}`);
  });
  it("exportName", () => {
    expect(exportName(new Date(2026, 10, 9, 12))).toBe("popcorno-miei-dati-2026-11-09.json");
  });
});

describe("cronologia: icone, giorni e filtri", () => {
  it("eventShort per tutti i 14 tipi", () => {
    const attesi: Record<EventKind, [string, string]> = {
      like: ["👍", "Ti è piaciuto"], dislike: ["👎", "Non ti è piaciuto"],
      unlike: ["👍", "Tolto il mi piace"], undislike: ["👎", "Tolto il non mi piace"],
      seen: ["👁", "Visto"], unseen: ["👁", "Tolto dai visti"],
      watch_add: ["🔖", "Aggiunto a Da vedere"], watch_remove: ["🔖", "Tolto da Da vedere"],
      open: ["🍿", "Aperto"], trailer: ["▶", "Trailer"], showtimes: ["🎟", "Orari del cinema"],
      go: ["📺", "Link per vederlo"], follow: ["📺", "Inizi a seguirla"], unfollow: ["📺", "Smetti di seguirla"],
    };
    expect(EVENT_KINDS).toHaveLength(14);
    for (const k of EVENT_KINDS) expect(eventShort(k)).toEqual({ icon: attesi[k][0], label: attesi[k][1] });
  });
  it("ogni tipo sta in un solo filtro", () => {
    const kinds = KIND_FILTERS.flatMap((f) => f.kinds ?? []);
    expect([...kinds].sort()).toEqual([...EVENT_KINDS].sort());
    expect(KIND_FILTERS.map((f) => f.label)).toEqual(["Tutto", "Mi piace", "Visti", "Da vedere", "Aperti"]);
  });
  it("dayLabel: Oggi, Ieri, data, anno diverso", () => {
    const now = new Date(2026, 10, 9, 10, 0);
    expect(dayLabel(new Date(2026, 10, 9, 0, 5), now)).toBe("Oggi");
    expect(dayLabel(new Date(2026, 10, 8, 23, 59), now)).toBe("Ieri");
    expect(dayLabel(new Date(2026, 10, 7, 21, 0), now)).toBe("7 novembre");
    expect(dayLabel(new Date(2025, 11, 31, 21, 0), now)).toBe("31 dicembre 2025");
    // Ieri anche a cavallo del mese
    expect(dayLabel(new Date(2026, 9, 31, 22, 0), new Date(2026, 10, 1, 8, 0))).toBe("Ieri");
  });

  const now = new Date();
  const at = (daysAgo: number, h: number, m = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m).toISOString();
  const mixed = [
    { kind: "like", title: "Dune", created_at: at(0, 1, 5) },
    { kind: "open", title: "Fargo", created_at: at(0, 0, 30) },
    { kind: "seen", title: "Up", created_at: at(1, 21, 18) },
    { kind: "watch_add", title: "Heat", created_at: at(5, 20) },
  ];
  it("raggruppa per giorno con le intestazioni e mostra l'ora", async () => {
    range.mockResolvedValueOnce({ data: mixed, error: null });
    const r = render(<MieiDati />);
    await act(async () => {});
    const heads = [...r.container.querySelectorAll(".storia-day")].map((h) => h.textContent);
    expect(heads).toEqual(["Oggi", "Ieri", dayLabel(new Date(at(5, 20)), now)]);
    expect(r.container.querySelectorAll(".storia")[0]!.querySelectorAll("li")).toHaveLength(2);
    const up = r.container.querySelectorAll(".storia li")[2]!;
    expect(up.querySelector(".ic")!.textContent).toBe("👁");
    expect(up.querySelector("small")!.textContent).toBe("Visto");
    expect(up.querySelector("b")!.textContent).toBe("Up");
    expect(up.querySelector("time")!.textContent).toBe("21:18");
    expect(up.getAttribute("aria-label")).toBe(eventText(mixed[2] as never));
  });
  it("i filtri riducono le righe, senza nuove richieste", async () => {
    range.mockResolvedValueOnce({ data: mixed, error: null });
    const r = render(<MieiDati />);
    await act(async () => {});
    const calls = range.mock.calls.length;
    const titles = () => [...r.container.querySelectorAll(".storia b")].map((b) => b.textContent);
    expect(titles()).toEqual(["Dune", "Fargo", "Up", "Heat"]);
    await click(filtro(r.container, "Mi piace"));
    expect(titles()).toEqual(["Dune"]);
    await click(filtro(r.container, "Visti"));
    expect(titles()).toEqual(["Up"]);
    await click(filtro(r.container, "Aperti"));
    expect(titles()).toEqual(["Fargo"]);
    expect(filtro(r.container, "Aperti").getAttribute("aria-pressed")).toBe("true");
    await click(filtro(r.container, "Tutto"));
    expect(titles()).toHaveLength(4);
    expect(range.mock.calls.length).toBe(calls);
  });
  it("con un filtro senza righe dice che non ce ne sono", async () => {
    range.mockResolvedValueOnce({ data: [mixed[0]], error: null });
    const r = render(<MieiDati />);
    await act(async () => {});
    await click(filtro(r.container, "Da vedere"));
    expect(r.container.textContent).toContain("Nessuna scelta di questo tipo.");
    expect(r.container.querySelector(".storia")).toBeNull();
  });
  it("le preferenze sono chip con il nome vero dell'abbonamento, e i conteggi in riquadri", async () => {
    const prev = app.st;
    app.st = { ...prev, subs: ["netflix", "now"], citta: "Roma", team: "Inter", gen: ["Thriller"] };
    try {
      const r = render(<MieiDati />);
      await act(async () => {});
      const chips = [...r.container.querySelectorAll(".pref-chips span")].map((c) => c.textContent);
      expect(chips).toEqual(["Netflix", "Sky / NOW", "📍 Roma", "⚽ Inter", "Thriller"]);
      const stats = [...r.container.querySelectorAll(".mini-stats .stat")].map((s) => s.textContent);
      expect(stats).toEqual(["1Da vedere", "0Serie seguite", "2Mi piace", "0Non mi piace", "0Visti"]);
    } finally { app.st = prev; }
  });
  it("le aree scelte sono un chip ciascuna; Ovunque (aree vuoto) non ne aggiunge", async () => {
    const prev = app.st;
    app.st = { ...prev, aree: ["asia", "italia"] } as typeof prev;
    try {
      const r = render(<MieiDati />);
      await act(async () => {});
      const chips = [...r.container.querySelectorAll(".pref-chips span")].map((c) => c.textContent);
      expect(chips).toEqual(["Netflix", "📍 Roma", "🌏 Asia", "🍝 Italia"]);
    } finally { app.st = prev; }
  });
  it("con squadra 'Nessuna' e senza città non ci sono quei chip", async () => {
    const r = render(<MieiDati />);
    await act(async () => {});
    const chips = [...r.container.querySelectorAll(".pref-chips span")].map((c) => c.textContent);
    expect(chips).toEqual(["Netflix", "📍 Roma"]);
  });
});

describe("vista I miei dati", () => {
  it("mostra email, preferenze e storico", async () => {
    const r = render(<MieiDati />);
    await act(async () => {});
    expect(r.container.textContent).toContain("Account: a@b.it");
    expect(r.container.querySelector('li[aria-label="7 nov, 21:10 — Hai messo mi piace a «Dune»"]')).toBeTruthy();
    expect(r.container.textContent).toContain("Ti è piaciuto");
    expect(r.container.textContent).toContain("Dune");
  });
  it("senza storico mostra il messaggio vuoto", async () => {
    range.mockResolvedValueOnce({ data: [], error: null });
    const r = render(<MieiDati />);
    await act(async () => {});
    expect(r.container.textContent).toContain("Ancora nessuna scelta registrata.");
  });
  it("l'interruttore chiama setTrackEvents(false)", async () => {
    const r = render(<MieiDati />);
    await act(async () => {});
    await click(r.getByRole("switch"));
    expect(app.setTrackEvents).toHaveBeenCalledWith(false);
  });
  it("Cancella lo storico: il primo tocco chiede conferma, il secondo cancella", async () => {
    const r = render(<MieiDati />);
    await act(async () => {});
    await click(r.getByText("Cancella lo storico"));
    expect(eq).not.toHaveBeenCalled();
    await click(r.getByText("Tocca di nuovo per confermare"));
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(app.toast).toHaveBeenCalledWith("Storico cancellato");
    // anche i segnali ancora in coda sul dispositivo
    expect(app.clearEvents).toHaveBeenCalledTimes(1);
  });
  it("Cancella lo storico fallito non svuota la coda", async () => {
    eq.mockResolvedValueOnce({ error: { message: "boom" } });
    const r = render(<MieiDati />);
    await act(async () => {});
    await click(r.getByText("Cancella lo storico"));
    await click(r.getByText("Tocca di nuovo per confermare"));
    expect(app.clearEvents).not.toHaveBeenCalled();
    expect(app.toast).toHaveBeenCalledWith("Non ci sono riuscito, riprova tra poco");
  });
  it("lo storico si ordina per data e poi per id, sia nella vista sia nello scarico", async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ kind: "like", title: `T${i}`, created_at: rows[0]!.created_at }));
    range.mockResolvedValueOnce({ data: page, error: null });
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    const click_ = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const r = render(<MieiDati />);
    await act(async () => {});
    range.mockResolvedValueOnce({ data: page, error: null });
    await click(r.getByText("Mostra altre"));
    await click(r.getByText("Scarica i miei dati"));
    click_.mockRestore();
    // vista, "Mostra altre", scarico (che legge fino all'ultima pagina)
    expect(orders).toHaveLength(3);
    for (const o of orders) {
      expect(o).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    }
  });
  it("la conferma scade dopo 5 secondi", async () => {
    const r = render(<MieiDati />);
    await act(async () => {});
    vi.useFakeTimers();
    await click(r.getByText("Cancella lo storico"));
    await act(async () => { vi.advanceTimersByTime(5100); });
    expect(r.queryByText("Tocca di nuovo per confermare")).toBeNull();
    expect(r.getByText("Cancella lo storico")).toBeTruthy();
  });
  it("Elimina l'account chiama deleteAccount e torna al Profilo", async () => {
    const r = render(<MieiDati />);
    await act(async () => {});
    await click(r.getByText("Elimina l'account"));
    expect(deleteAccount).not.toHaveBeenCalled();
    await click(r.getByText("Tocca di nuovo per confermare"));
    expect(deleteAccount).toHaveBeenCalled();
    expect(app.toast).toHaveBeenCalledWith("Account eliminato. Le preferenze restano su questo dispositivo.");
    expect(app.setView).toHaveBeenCalledWith("prof");
    expect(app.forgetSession).toHaveBeenCalled();
  });
  it("Scarica i miei dati crea un file JSON", async () => {
    const create = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click_ = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const r = render(<MieiDati />);
    await act(async () => {});
    await click(r.getByText("Scarica i miei dati"));
    expect(create).toHaveBeenCalled();
    expect(click_).toHaveBeenCalled();
    click_.mockRestore();
  });
  it("senza account non mostra niente, non chiede dati e torna al Profilo", async () => {
    app.user = null;
    const r = render(<MieiDati />);
    await act(async () => {});
    expect(r.container.textContent).toBe("");
    expect(range).not.toHaveBeenCalled();
    expect(app.setView).toHaveBeenCalledWith("prof");
  });
});

describe("I miei dati e il cambio di account", () => {
  it("dopo l'uscita di A e l'ingresso di B (lettura fallita) non resta niente di A, nemmeno nello scarico", async () => {
    let blob: Blob | null = null;
    Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => { blob = b; return "blob:x"; }), revokeObjectURL: vi.fn() });
    const click_ = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const r = render(<Shell />);
    await act(async () => {});
    expect(r.container.textContent).toContain("Dune");
    app.user = null;
    r.rerender(<Shell />);
    await act(async () => {});
    app.user = { id: "u2", email: "b@c.it" };
    range.mockImplementation(async () => ({ data: null, error: { message: "boom" } }));
    metaFail = true;
    r.rerender(<Shell />);
    await act(async () => {});
    expect(r.container.textContent).toContain("Account: b@c.it");
    expect(r.container.textContent).not.toContain("a@b.it");
    expect(r.container.textContent).not.toContain("Dune");
    await click(r.getByText("Scarica i miei dati"));
    click_.mockRestore();
    const body = await (blob as unknown as Blob).text();
    expect(body).not.toContain("Dune");
    expect(body).not.toContain("a@b.it");
    expect(body).not.toContain("2026-01-01");
    expect(JSON.parse(body)).toMatchObject({ account: { email: "b@c.it", created_at: null }, profilo: null, preferenze: null, storico: [] });
  });
});
