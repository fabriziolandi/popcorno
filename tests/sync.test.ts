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
  let uid: string | null = "u1";
  let onSelect: (() => void) | null = null;
  let onUpsert: (() => void) | null = null;
  const c = {
    auth: { getSession: vi.fn(async () => ({ data: { session: uid ? { user: { id: uid } } : null }, error: null })) },
    from: vi.fn((table: string) => {
      expect(table).toBe("preferences");
      return {
        select: () => ({
          eq: (_k: string, v: string) => ({
            maybeSingle: async () => {
              calls.push({ op: "select", arg: v });
              onSelect?.();
              if (fail) return { data: null, ...fail };
              return { data: db.row, error: null, status: 200 };
            },
          }),
        }),
        upsert: async (arg: { data: unknown }) => {
          calls.push({ op: "upsert", arg });
          onUpsert?.();
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
    setUid(u: string | null) { uid = u; },
    onSelect(f: (() => void) | null) { onSelect = f; },
    onUpsert(f: (() => void) | null) { onUpsert = f; },
  };
}

const st = (over: Partial<Stasera> = {}): Stasera => ({ ...structuredClone(DEFAULT_STATE), ...over });

function harness(f: ReturnType<typeof fakeClient>, init: Synced, extra: { adopt?: boolean } = {}) {
  let cur = init;
  const apply = vi.fn((s: Synced) => { cur = s; });
  const onDenied = vi.fn();
  const onOwner = vi.fn();
  const sync = createSync({ client: async () => f.c, local: () => cur, apply, now: () => 1000, onDenied, onOwner, ...extra });
  return { sync, apply, onDenied, onOwner, set(s: Synced) { cur = s; }, get: () => cur };
}

// Il motore si lega all'account con un primo pull riuscito (account vuoto: carica e poi tace).
async function bound(f: ReturnType<typeof fakeClient>, h: ReturnType<typeof harness>) {
  await h.sync.pull();
  await vi.advanceTimersByTimeAsync(1500);
  f.calls.length = 0;
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
    await bound(f, h);
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
    const h = harness(f, { st: st(), ck: emptyClocks() });
    await bound(f, h);
    h.set({ st: st({ citta: "Bari" }), ck: emptyClocks() });
    h.sync.push();
    await h.sync.flush();
    expect(f.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.calls).toHaveLength(1);
  });

  it("offline: push fallisce, riparte all'evento online", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const h = harness(f, { st: st(), ck: emptyClocks() });
    await bound(f, h);
    h.set({ st: st({ citta: "Roma" }), ck: emptyClocks() });
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

  it("403 (permessi, 42501) non chiude la sessione: push fallito, si riprova alla modifica dopo, senza ciclo", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const h = harness(f, { st: st(), ck: emptyClocks() });
    await bound(f, h);
    h.set({ st: st({ citta: "Roma" }), ck: emptyClocks() });
    f.setFail({ error: { code: "42501", message: "permission denied" }, status: 403 });
    h.sync.push();
    await vi.advanceTimersByTimeAsync(1500);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.calls).toHaveLength(1);
    expect(h.onDenied).not.toHaveBeenCalled();
    f.setFail(null);
    h.sync.push();
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.calls.map((x) => x.op)).toEqual(["upsert", "upsert"]);
    expect((f.db.row!.data as Synced).st.citta).toBe("Roma");
  });

  it("401 su push chiama onDenied", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const h = harness(f, { st: st(), ck: emptyClocks() });
    await bound(f, h);
    f.setFail({ error: { message: "JWT expired" }, status: 401 });
    h.sync.push();
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.onDenied).toHaveBeenCalledTimes(1);
  });

  it("cambio di account durante il pull: il risultato si scarta, niente apply né push", async () => {
    vi.useFakeTimers();
    const f = fakeClient({ data: { v: 1, st: st({ liked: ["B"] }), ck: emptyClocks() } });
    const h = harness(f, { st: st({ liked: ["A"] }), ck: emptyClocks() });
    f.onSelect(() => f.setUid("u2"));
    await h.sync.pull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.apply).not.toHaveBeenCalled();
    expect(f.calls.map((x) => x.op)).toEqual(["select"]);
  });

  it("push dopo un cambio di account non manda i dati del primo all'altro", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const h = harness(f, { st: st({ liked: ["A"] }), ck: emptyClocks() });
    await h.sync.pull();
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.calls.map((x) => x.op)).toEqual(["select", "upsert"]);
    f.setUid("u2");
    h.sync.push();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.calls.map((x) => x.op)).toEqual(["select", "upsert"]);
    // un nuovo pull per u2 lega di nuovo il motore al nuovo account
    await h.sync.pull();
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.calls.map((x) => x.op)).toEqual(["select", "upsert", "select", "upsert"]);
    expect((f.calls[3]!.arg as { user_id: string }).user_id).toBe("u2");
  });

  it("pull d'ingresso fallito (500): una modifica locale non scrive sull'account prima di un pull riuscito, poi scrive l'unione", async () => {
    vi.useFakeTimers();
    const remoteSt = st({ liked: ["B"], citta: "Milano" });
    const f = fakeClient({ data: { v: 1, st: remoteSt, ck: stamp(st(), remoteSt, emptyClocks(), 500) } });
    const h = harness(f, { st: st(), ck: emptyClocks() });
    f.setFail({ error: { message: "Internal Server Error" }, status: 500 });
    await h.sync.pull();
    expect(f.calls.map((x) => x.op)).toEqual(["select"]);
    f.setFail(null);
    const locSt = st({ liked: ["A"] });
    h.set({ st: locSt, ck: stamp(st(), locSt, emptyClocks(), 600) });
    h.sync.push();
    await vi.advanceTimersByTimeAsync(1500);
    // invece di scrivere i soli dati locali, il motore rilegge l'account
    expect(f.calls.map((x) => x.op)).toEqual(["select", "select"]);
    await vi.advanceTimersByTimeAsync(1500);
    const up = f.calls.filter((x) => x.op === "upsert");
    expect(up).toHaveLength(1);
    const sent = (up[0]!.arg as { data: Synced }).data.st;
    expect(sent.liked).toEqual(["A", "B"]);
    expect(sent.citta).toBe("Milano");
  });

  it("flush senza un pull riuscito rilegge l'account invece di scrivere", async () => {
    vi.useFakeTimers();
    const f = fakeClient({ data: { v: 1, st: st({ liked: ["B"] }), ck: stamp(st(), st({ liked: ["B"] }), emptyClocks(), 500) } });
    const h = harness(f, { st: st({ liked: ["A"] }), ck: stamp(st(), st({ liked: ["A"] }), emptyClocks(), 600) });
    h.sync.push();
    await h.sync.flush();
    expect(f.calls.map((x) => x.op)).toEqual(["select"]);
    expect(h.get().st.liked).toEqual(["A", "B"]);
  });

  it("un motore fermato non chiama onDenied per il 401 di una richiesta già partita", async () => {
    vi.useFakeTimers();
    const f = fakeClient(null);
    const h = harness(f, { st: st(), ck: emptyClocks() });
    await bound(f, h);
    h.set({ st: st({ citta: "Roma" }), ck: emptyClocks() });
    // la richiesta parte, il motore si ferma (nuovo accesso), poi arriva il 401
    f.onUpsert(() => { h.sync.stop(); f.setFail({ error: { code: "PGRST301", message: "JWT expired" }, status: 401 }); });
    h.sync.push();
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.calls.map((x) => x.op)).toEqual(["upsert"]);
    expect(h.onDenied).not.toHaveBeenCalled();
  });

  it("adopt: un account con dati sostituisce lo stato locale e le date, senza unire né scrivere", async () => {
    vi.useFakeTimers();
    const remoteSt = st({ liked: ["B"], citta: "Milano" });
    const remoteCk = stamp(st(), remoteSt, emptyClocks(), 500);
    const f = fakeClient({ data: { v: 1, st: remoteSt, ck: remoteCk } });
    const locSt = st({ liked: ["A"], citta: "Roma" });
    const h = harness(f, { st: locSt, ck: stamp(st(), locSt, emptyClocks(), 900) }, { adopt: true });
    await h.sync.pull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.get().st.liked).toEqual(["B"]);
    expect(h.get().st.citta).toBe("Milano");
    expect(h.get().ck).toEqual(remoteCk);
    expect(f.calls.map((x) => x.op)).toEqual(["select"]);
    expect(h.onOwner).toHaveBeenCalledWith("u1");
    // dopo il primo pull si torna a unire
    const s2 = st({ liked: ["B", "C"], citta: "Milano" });
    h.set({ st: s2, ck: stamp(h.get().st, s2, h.get().ck, 1200) });
    h.sync.push();
    await vi.advanceTimersByTimeAsync(1500);
    expect((f.db.row!.data as Synced).st.liked).toEqual(["B", "C"]);
  });

  it("adopt: un account vuoto ({}) riparte dai valori predefiniti con date vuote e li scrive", async () => {
    vi.useFakeTimers();
    const f = fakeClient({ data: {} });
    const locSt = st({ liked: ["A"], citta: "Roma" });
    const h = harness(f, { st: locSt, ck: stamp(st(), locSt, emptyClocks(), 900) }, { adopt: true });
    await h.sync.pull();
    expect(h.get()).toEqual({ st: st(), ck: emptyClocks() });
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.db.row!.data).toEqual({ v: 1, st: st(), ck: emptyClocks() });
  });

  it("adopt con pull fallito: la modifica successiva rilegge e adotta, senza unire", async () => {
    vi.useFakeTimers();
    const remoteSt = st({ liked: ["B"] });
    const f = fakeClient({ data: { v: 1, st: remoteSt, ck: stamp(st(), remoteSt, emptyClocks(), 500) } });
    const h = harness(f, { st: st({ liked: ["A"] }), ck: stamp(st(), st({ liked: ["A"] }), emptyClocks(), 900) }, { adopt: true });
    f.setFail({ error: { message: "boom" }, status: 500 });
    await h.sync.pull();
    expect(h.onOwner).not.toHaveBeenCalled();
    f.setFail(null);
    h.sync.push();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.get().st.liked).toEqual(["B"]);
    expect(f.calls.some((x) => x.op === "upsert" && JSON.stringify(x.arg).includes('"A"'))).toBe(false);
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
