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

import { MieiDati } from "../src/components/prof/MieiDati";
import { setClientForTests } from "../src/lib/account";

const eq = vi.fn(async (_c: string, _v: string) => ({ error: null as unknown }));
const rows = [{ kind: "like", title: "Dune", created_at: new Date(2026, 10, 7, 21, 10).toISOString() }];
const range = vi.fn(async (_a: number, _b: number) => ({ data: rows, error: null }));
const single = (data: unknown) => ({ select: () => ({ maybeSingle: async () => ({ data, error: null }) }) });
const client = {
  from: (t: string) => {
    if (t === "events") return {
      select: () => ({ order: () => ({ range }) }),
      delete: () => ({ eq }),
    };
    return t === "profiles" ? single({ created_at: "2026-01-01", track_events: true }) : single({ data: { a: 1 }, updated_at: "x" });
  },
};

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };

beforeEach(() => {
  app.user = { id: "u1", email: "a@b.it" };
  app.view = "dati";
  for (const f of [app.setTrackEvents, app.toast, app.setView, deleteAccount, eq, range]) f.mockClear();
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
