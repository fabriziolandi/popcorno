// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EVENT_KINDS, type EventKind } from "../src/lib/events";
import { eventText, exportName } from "../src/lib/miei-dati";

const app = {
  user: { id: "u1", email: "a@b.it" } as { id: string; email: string } | null,
  view: "dati",
  trackEvents: true,
  setTrackEvents: vi.fn(async (_on: boolean) => {}),
  clearEvents: vi.fn(),
  toast: vi.fn(),
  setView: vi.fn(),
  st: { subs: ["netflix"], citta: "Roma", team: "Nessuna", gen: [], watch: [1], serie: [], liked: [1, 2], disliked: [], seen: [] },
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

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };

beforeEach(() => {
  app.user = { id: "u1", email: "a@b.it" };
  app.view = "dati";
  for (const f of [app.setTrackEvents, app.clearEvents, app.toast, app.setView, deleteAccount, eq]) f.mockClear();
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

describe("vista I miei dati", () => {
  it("mostra email, preferenze e storico", async () => {
    const r = render(<MieiDati />);
    await act(async () => {});
    expect(r.container.textContent).toContain("Account: a@b.it");
    expect(r.container.textContent).toContain("7 nov, 21:10 — Hai messo mi piace a «Dune»");
    expect(r.container.textContent).toContain("Abbonamenti: netflix");
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
    expect(r.container.textContent).toContain("«Dune»");
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
