// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STATE } from "../src/lib/state";
import { emptyClocks, stamp, type Synced } from "../src/lib/sync-merge";
import { createSync, type Client } from "../src/lib/sync";
import type { Stasera } from "../src/lib/types";

type Resp = { error: { code?: string; message?: string } | null; status: number };

// Client finto in memoria: una riga di preferences, e risposte forzabili.
function fakeClient(row: unknown = null) {
  const db = { row: row as { data: unknown } | null };
  const calls: { op: string; arg?: unknown }[] = [];
  let fail: Resp | null = null;
  const c = {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: "u1" } } }, error: null })) },
    from: vi.fn((table: string) => {
      expect(table).toBe("preferences");
      return {
        select: () => ({
          eq: (_k: string, v: string) => ({
            maybeSingle: async () => {
              calls.push({ op: "select", arg: v });
              if (fail) return { data: null, ...fail };
              return { data: db.row, error: null, status: 200 };
            },
          }),
        }),
        upsert: async (arg: { data: unknown }) => {
          calls.push({ op: "upsert", arg });
          if (fail) return { data: null, ...fail };
          db.row = { data: structuredClone(arg.data) };
          return { data: null, error: null, status: 201 };
        },
      };
    }),
  };
  return {
    c: c as unknown as Client,
    db,
    calls,
    setFail(r: Resp | null) { fail = r; },
  };
}

const st = (over: Partial<Stasera> = {}): Stasera => ({ ...structuredClone(DEFAULT_STATE), ...over });

function harness(f: ReturnType<typeof fakeClient>, init: Synced) {
  let cur = init;
  const apply = vi.fn((s: Synced) => { cur = s; });
  const onDenied = vi.fn();
  const sync = createSync({ client: async () => f.c, local: () => cur, apply, now: () => 1000, onDenied });
  return { sync, apply, onDenied, set(s: Synced) { cur = s; }, get: () => cur };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createSync", () => {
  it("pull con account vuoto carica i dati locali sull'account", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const loc = { st: st({ liked: ["A"] }), ck: emptyClocks() };
    const h = harness(f, loc);
    await h.sync.pull();
    expect(h.apply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    const up = f.calls.filter((x) => x.op === "upsert");
    expect(up).toHaveLength(1);
    expect(up[0]!.arg).toMatchObject({ user_id: "u1", data: { v: 1, st: { liked: ["A"] } } });
    expect((up[0]!.arg as { updated_at: string }).updated_at).toBe(new Date(1000).toISOString());
  });

  it("pull con dati {} (account nuovo) carica i dati locali", async () => {
    vi.useFakeTimers();
    const f = fakeClient({ data: {} });
    const h = harness(f, { st: st({ citta: "Roma" }), ck: emptyClocks() });
    await h.sync.pull();
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.db.row!.data).toMatchObject({ v: 1, st: { citta: "Roma" } });
  });

  it("pull unisce e applica", async () => {
    vi.useFakeTimers();
    const remoteSt = st({ liked: ["B"] });
    const f = fakeClient({ data: { v: 1, st: remoteSt, ck: stamp(st(), remoteSt, emptyClocks(), 500) } });
    const locSt = st({ liked: ["A"] });
    const h = harness(f, { st: locSt, ck: stamp(st(), locSt, emptyClocks(), 400) });
    await h.sync.pull();
    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.apply.mock.calls[0]![0].st.liked).toEqual(["A", "B"]);
    await vi.advanceTimersByTimeAsync(1500);
    expect((f.db.row!.data as Synced).st.liked).toEqual(["A", "B"]);
  });

  it("pull uguale all'account non riscrive", async () => {
    vi.useFakeTimers();
    const s = st({ liked: ["A"] });
    const ck = stamp(st(), s, emptyClocks(), 400);
    const f = fakeClient(null);
    const h = harness(f, { st: s, ck });
    // prima volta: carica; seconda: niente da scrivere
    await h.sync.pull();
    await vi.advanceTimersByTimeAsync(1500);
    await h.sync.pull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.calls.filter((x) => x.op === "upsert")).toHaveLength(1);
  });

  it("push aspetta 1500 ms e manda una sola richiesta per tre modifiche ravvicinate", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const h = harness(f, { st: st(), ck: emptyClocks() });
    for (const c of ["Roma", "Milano", "Torino"]) {
      h.set({ st: st({ citta: c }), ck: emptyClocks() });
      h.sync.push();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(f.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.calls).toHaveLength(1);
    expect((f.db.row!.data as Synced).st.citta).toBe("Torino");
  });

  it("flush manda subito la modifica in attesa", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const h = harness(f, { st: st({ citta: "Bari" }), ck: emptyClocks() });
    h.sync.push();
    await h.sync.flush();
    expect(f.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.calls).toHaveLength(1);
  });

  it("offline: push fallisce, riparte all'evento online", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const h = harness(f, { st: st({ citta: "Roma" }), ck: emptyClocks() });
    f.setFail({ error: { message: "TypeError: Failed to fetch" }, status: 0 });
    h.sync.push();
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.calls).toHaveLength(1);
    f.setFail(null);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls).toHaveLength(2);
    expect((f.db.row!.data as Synced).st.citta).toBe("Roma");
    // il listener è usato una volta sola
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls).toHaveLength(2);
  });

  it("offline: anche un fetch che lancia riprova all'evento online", async () => {
    const f = fakeClient(null);
    const h = harness(f, { st: st({ liked: ["A"] }), ck: emptyClocks() });
    const from = (f.c as unknown as { from: ReturnType<typeof vi.fn> }).from;
    const real = from.getMockImplementation()!;
    from.mockImplementationOnce(() => { throw new TypeError("Failed to fetch"); });
    await h.sync.pull();
    expect(f.calls).toHaveLength(0);
    from.mockImplementation(real);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(f.calls.map((x) => x.op)).toEqual(["select"]));
  });

  it("sessione non valida: pull riceve errore 401, l'app resta in locale e non riprova in ciclo", async () => {
    vi.useFakeTimers();
    const f = fakeClient({ data: { v: 1, st: st({ liked: ["B"] }), ck: emptyClocks() } });
    const loc = { st: st({ liked: ["A"] }), ck: emptyClocks() };
    const h = harness(f, loc);
    f.setFail({ error: { code: "PGRST301", message: "JWT expired" }, status: 401 });
    await h.sync.pull();
    expect(h.onDenied).toHaveBeenCalledTimes(1);
    expect(h.apply).not.toHaveBeenCalled();
    expect(h.get()).toBe(loc);
    // né nuovi tentativi né scritture, nemmeno tornando online o con nuove modifiche
    window.dispatchEvent(new Event("online"));
    h.sync.push();
    await h.sync.pull();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.calls).toHaveLength(1);
  });

  it("stop annulla la modifica in attesa e ferma il motore", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const h = harness(f, { st: st({ citta: "Roma" }), ck: emptyClocks() });
    h.sync.push();
    h.sync.stop();
    await h.sync.pull();
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.calls).toHaveLength(0);
  });

  it("senza sessione non manda nulla", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    (f.c.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null }, error: null });
    const h = harness(f, { st: st(), ck: emptyClocks() });
    await h.sync.pull();
    h.sync.push();
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.calls).toHaveLength(0);
  });
});
