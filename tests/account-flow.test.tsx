// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn((..._a: unknown[]) => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { AppStateProvider, useApp, userFrom, type AppState } from "../src/app-state";
import { Shell } from "../src/components/Shell";
import { LAST_ACCOUNT_KEY, SESSION_KEY, getClient, setClientForTests, signOut } from "../src/lib/account";
import { DEFAULT_STATE } from "../src/lib/state";
import { emptyClocks, stamp } from "../src/lib/sync-merge";
import type { Stasera } from "../src/lib/types";

let app: AppState;
function Probe() {
  app = useApp();
  return null;
}
const mount = (shell = false) =>
  render(
    <AppStateProvider>
      <Probe />
      {shell ? <Shell /> : null}
    </AppStateProvider>,
  );

const st = (over: Partial<Stasera> = {}): Stasera => ({ ...structuredClone(DEFAULT_STATE), ...over });

type Session = { user: { id: string; email: string; user_metadata?: Record<string, unknown> } } | null;
type Resp = { error: { code?: string; message?: string } | null; status: number };

// Client finto: sessione, ascoltatori dell'accesso, preferences e profiles in memoria.
function fakeClient(opts: { session?: Session; prefs?: unknown; track?: boolean; profilesRead?: () => Promise<unknown>; eventsResult?: () => { error: { code?: string; message?: string } | null } } = {}) {
  let session: Session = opts.session ?? null;
  const cbs: ((ev: string, s: Session) => void)[] = [];
  const log: string[] = [];
  const sent: unknown[] = [];
  const upserts: { user_id: string; data: { st: Stasera; ck: unknown } }[] = [];
  const db: { prefs: unknown; track: boolean } = { prefs: opts.prefs ?? null, track: opts.track ?? true };
  let fail: Resp | null = null;
  const c = {
    auth: {
      getSession: vi.fn(async () => {
        log.push("getSession " + location.search);
        return { data: { session }, error: null };
      }),
      verifyOtp: vi.fn(async () => {
        log.push("verifyOtp " + location.search);
        session = { user: { id: "u1", email: "a@b.it" } };
        return { error: null };
      }),
      signOut: vi.fn(async (_o: { scope: string }) => {
        log.push("signOut");
        session = null;
        for (const cb of cbs) cb("SIGNED_OUT", null);
        return { error: null };
      }),
      onAuthStateChange: vi.fn((cb: (ev: string, s: Session) => void) => {
        cbs.push(cb);
        queueMicrotask(() => cb("INITIAL_SESSION", session));
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "events") {
        return {
          insert: async (rows: unknown[]) => {
            const r = opts.eventsResult?.() ?? { error: null };
            if (!r.error) sent.push(...rows);
            return r;
          },
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                log.push("profiles.select");
                if (opts.profilesRead) return opts.profilesRead();
                return { data: { track_events: db.track }, error: null };
              },
            }),
          }),
          update: (v: { track_events: boolean }) => ({
            eq: async (k: string, id: string) => {
              log.push(`profiles.update ${k}=${id} ${v.track_events}`);
              db.track = v.track_events;
              return { error: null };
            },
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              log.push("preferences.select");
              if (fail) return { data: null, ...fail };
              return { data: db.prefs === null ? null : { data: db.prefs }, error: null, status: 200 };
            },
          }),
        }),
        upsert: async (row: { user_id: string; data: unknown }) => {
          log.push("preferences.upsert");
          upserts.push(structuredClone(row) as (typeof upserts)[number]);
          if (fail) return { data: null, ...fail };
          db.prefs = structuredClone(row.data);
          return { error: null, status: 201 };
        },
      };
    }),
  };
  return {
    c, log, db, sent, upserts,
    emit(ev: string, s: Session) { session = s; for (const cb of cbs) cb(ev, s); },
    setFail(r: Resp | null) { fail = r; },
  };
}

const fetchSpy = vi.fn(async (..._a: unknown[]) => new Response("", { status: 404 }));
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => {
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  localStorage.clear();
  history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  setClientForTests(null);
  createClient.mockClear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("senza account", () => {
  it("senza sessione nessuna richiesta a supabase.co", async () => {
    mount(true);
    await vi.waitFor(() => expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("oggi.json"))).toBe(true));
    await settle();
    // anche i cambi di stato e i rientri nell'app non creano il client
    act(() => app.setSt({ ...app.st, citta: "Roma" }));
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("supabase.co"))).toEqual([]);
    expect(createClient).not.toHaveBeenCalled();
    expect(app.user).toBeNull();
    expect(app.trackEvents).toBe(false);
  });

  it("setSt salva anche le date di modifica", async () => {
    mount();
    await settle();
    act(() => app.setSt({ ...app.st, citta: "Roma" }));
    const ck = JSON.parse(localStorage.getItem("stasera-clock")!);
    expect(typeof ck.f.citta).toBe("number");
  });

  it("l'import di #profilo= conta come modifica locale", async () => {
    const { profileLink } = await import("../src/lib/profile-link");
    const link = profileLink({ ...st(), team: "Inter" }, "https://popcorno.it");
    history.replaceState(null, "", "/" + link.slice(link.indexOf("#")));
    mount();
    await settle();
    expect(app.st.team).toBe("Inter");
    const ck = JSON.parse(localStorage.getItem("stasera-clock")!);
    expect(typeof ck.f.team).toBe("number");
  });
});

describe("con account", () => {
  it("Google (PKCE): getSession prima di completeFromUrl, che toglie il ?code= solo dopo lo scambio", async () => {
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } } });
    setClientForTests(f.c);
    history.replaceState(null, "", "/?code=zzz");
    mount();
    await settle();
    expect(f.log[0]).toBe("getSession ?code=zzz");
    expect(location.search).toBe("");
    expect(app.user).toEqual({ id: "u1", email: "a@b.it" });
  });

  it("link dell'email: getSession, poi verifyOtp del token_hash, poi l'utente", async () => {
    const f = fakeClient();
    setClientForTests(f.c);
    history.replaceState(null, "", "/?token_hash=abc&type=email");
    mount();
    await settle();
    expect(f.log.slice(0, 2)).toEqual(["getSession ?token_hash=abc&type=email", "verifyOtp ?token_hash=abc&type=email"]);
    expect(location.search).toBe("");
    expect(app.user?.id).toBe("u1");
  });

  it("con una sessione salvata entra, legge track_events e unisce le preferenze", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    const loc = st({ liked: ["A"] });
    localStorage.setItem("stasera", JSON.stringify(loc));
    localStorage.setItem("stasera-clock", JSON.stringify(stamp(st(), loc, emptyClocks(), 400)));
    const remote = st({ liked: ["B"] });
    const f = fakeClient({
      session: { user: { id: "u1", email: "a@b.it" } },
      prefs: { v: 1, st: remote, ck: stamp(st(), remote, emptyClocks(), 500) },
      track: false,
    });
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.user).toEqual({ id: "u1", email: "a@b.it" });
    expect(app.trackEvents).toBe(false);
    expect(app.st.liked).toEqual(["A", "B"]);
    expect(JSON.parse(localStorage.getItem("stasera")!).liked).toEqual(["A", "B"]);
    // l'unione si riscrive sull'account
    await vi.waitFor(() => expect((f.db.prefs as { st: Stasera }).st.liked).toEqual(["A", "B"]), { timeout: 3000 });
  });

  it("setSt con account manda la modifica dopo 1500 ms", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } } });
    setClientForTests(f.c);
    mount();
    await settle();
    await vi.waitFor(() => expect(f.log).toContain("preferences.upsert"), { timeout: 3000 });
    const n = f.log.filter((x) => x === "preferences.upsert").length;
    act(() => app.setSt({ ...app.st, citta: "Roma" }));
    await vi.waitFor(() => expect(f.log.filter((x) => x === "preferences.upsert").length).toBe(n + 1), { timeout: 3000 });
    expect((f.db.prefs as { st: Stasera; ck: { f: Record<string, number> } }).st.citta).toBe("Roma");
    expect(typeof (f.db.prefs as { ck: { f: Record<string, number> } }).ck.f.citta).toBe("number");
  });

  it("trackEvents è falso finché profiles non dice true", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    let resolve!: (v: unknown) => void;
    const f = fakeClient({
      session: { user: { id: "u1", email: "a@b.it" } },
      profilesRead: () => new Promise((r) => { resolve = r; }),
    });
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.user?.id).toBe("u1");
    expect(app.trackEvents).toBe(false);
    await act(async () => { resolve({ data: { track_events: true }, error: null }); });
    expect(app.trackEvents).toBe(true);
  });

  it("lettura di profiles fallita: trackEvents resta falso", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    const f = fakeClient({
      session: { user: { id: "u1", email: "a@b.it" } },
      profilesRead: async () => ({ data: null, error: { message: "boom" } }),
    });
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.user?.id).toBe("u1");
    expect(app.trackEvents).toBe(false);
    const g = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } }, profilesRead: () => Promise.reject(new Error("rete")) });
    cleanup();
    setClientForTests(g.c);
    mount();
    await settle();
    expect(app.user?.id).toBe("u1");
    expect(app.trackEvents).toBe(false);
  });

  it("setTrackEvents aggiorna profiles", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } }, track: true });
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.trackEvents).toBe(true);
    await act(() => app.setTrackEvents(false));
    expect(f.log).toContain("profiles.update id=u1 false");
    expect(app.trackEvents).toBe(false);
  });

  it("all'uscita user torna null e lo stato locale resta", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } }, prefs: { v: 1, st: st({ citta: "Bari" }), ck: { f: { citta: 900 }, l: {}, rm: {} } } });
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.st.citta).toBe("Bari");
    act(() => f.emit("SIGNED_OUT", null));
    await settle();
    expect(app.user).toBeNull();
    expect(app.trackEvents).toBe(false);
    expect(app.st.citta).toBe("Bari");
  });

  it("sessione non valida (401): user null, dati locali intatti, una sola richiesta", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    localStorage.setItem("stasera", JSON.stringify(st({ citta: "Roma" })));
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } } });
    f.setFail({ error: { code: "PGRST301", message: "JWT expired" }, status: 401 });
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.user).toBeNull();
    expect(app.st.citta).toBe("Roma");
    act(() => app.setSt({ ...app.st, citta: "Pisa" }));
    window.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 1700));
    expect(f.log.filter((x) => x.startsWith("preferences."))).toEqual(["preferences.select"]);
  });

  it("401: esce anche da supabase-js; un nuovo accesso riavvia pull e push", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } } });
    f.setFail({ error: { code: "PGRST301", message: "JWT expired" }, status: 401 });
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.user).toBeNull();
    expect(f.c.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    f.setFail(null);
    act(() => f.emit("SIGNED_IN", { user: { id: "u1", email: "a@b.it" } }));
    await settle();
    expect(app.user?.id).toBe("u1");
    expect(f.log.filter((x) => x === "preferences.select")).toHaveLength(2);
    // account vuoto: i dati locali si caricano
    await vi.waitFor(() => expect(f.log).toContain("preferences.upsert"), { timeout: 3000 });
  });

  it("403 (permessi) non fa uscire", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } } });
    f.setFail({ error: { code: "42501", message: "permission denied" }, status: 403 });
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.user?.id).toBe("u1");
    expect(f.c.auth.signOut).not.toHaveBeenCalled();
  });

  it("accesso chiesto più tardi (Mandami il link / codice): il client nato dal gesto avvia la sincronizzazione", async () => {
    const f = fakeClient();
    createClient.mockReturnValueOnce(f.c as never);
    mount();
    await settle();
    expect(createClient).not.toHaveBeenCalled();
    await getClient(); // come fa sendLink
    await settle();
    expect(app.user).toBeNull();
    act(() => f.emit("SIGNED_IN", { user: { id: "u9", email: "x@y.it" } }));
    await settle();
    expect(app.user).toEqual({ id: "u9", email: "x@y.it" });
    expect(f.log).toContain("preferences.select");
  });

  it("con Google l'utente ha anche nome e foto da user_metadata", async () => {
    const f = fakeClient();
    createClient.mockReturnValueOnce(f.c as never);
    mount();
    await settle();
    await getClient();
    await settle();
    act(() => f.emit("SIGNED_IN", { user: { id: "u9", email: "x@y.it", user_metadata: { full_name: "Anna Rossi", avatar_url: "https://lh3.googleusercontent.com/a/x" } } }));
    await settle();
    expect(app.user).toEqual({ id: "u9", email: "x@y.it", name: "Anna Rossi", avatar: "https://lh3.googleusercontent.com/a/x" });
  });
});

describe("userFrom (nome e foto dell'account)", () => {
  it("legge full_name e avatar_url", () => {
    expect(userFrom({ id: "u", email: "a@b.it", user_metadata: { full_name: "Anna", avatar_url: "https://x.it/a.jpg", name: "Altro", picture: "https://x.it/b.jpg" } }))
      .toEqual({ id: "u", email: "a@b.it", name: "Anna", avatar: "https://x.it/a.jpg" });
  });
  it("in mancanza usa name e picture", () => {
    expect(userFrom({ id: "u", email: "a@b.it", user_metadata: { name: "Bea", picture: "https://x.it/b.jpg" } }))
      .toEqual({ id: "u", email: "a@b.it", name: "Bea", avatar: "https://x.it/b.jpg" });
  });
  it("scarta la foto non https e i valori che non sono stringhe", () => {
    expect(userFrom({ id: "u", email: "a@b.it", user_metadata: { full_name: 42, avatar_url: "http://x.it/a.jpg" } })).toEqual({ id: "u", email: "a@b.it" });
    expect(userFrom({ id: "u", email: "a@b.it", user_metadata: { avatar_url: "javascript:alert(1)" } })).toEqual({ id: "u", email: "a@b.it" });
  });
  it("senza metadati né email", () => {
    expect(userFrom({ id: "u" })).toEqual({ id: "u", email: "" });
  });
});

describe("storico dei segnali con account", () => {
  const A = { user: { id: "u1", email: "a@b.it" } };
  const B = { user: { id: "u2", email: "b@b.it" } };
  const it1 = { t: "Up", ty: "film", s: "disney", m: [], w: [], g: "Animazione" };

  it("eventi in coda di A non partono con la sessione di B", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    let net: { error: { message: string } } | null = { error: { message: "Failed to fetch" } };
    const f = fakeClient({ session: A, eventsResult: () => net ?? { error: null } });
    setClientForTests(f.c);
    mount();
    await settle();
    act(() => app.track("like", it1));
    await settle();
    expect(f.sent).toEqual([]);
    expect(JSON.parse(localStorage.getItem("popcorno-eventi")!)).toHaveLength(1);
    act(() => f.emit("SIGNED_OUT", null));
    await settle();
    net = null;
    act(() => f.emit("SIGNED_IN", B));
    await settle();
    expect(app.user?.id).toBe("u2");
    expect(app.trackEvents).toBe(true);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await settle();
    expect(f.sent).toEqual([]);
    act(() => app.track("dislike", { ...it1, t: "Altro" }));
    await settle();
    expect((f.sent as { kind: string }[]).map((r) => r.kind)).toEqual(["dislike"]);
  });

  it("dopo off (42501) trackEvents si spegne e i gesti successivi non mandano niente", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    let res: { error: { code: string } | null } = { error: { code: "42501" } };
    const f = fakeClient({ session: A, eventsResult: () => res });
    setClientForTests(f.c);
    mount();
    await settle();
    act(() => app.track("like", it1));
    await settle();
    expect(app.trackEvents).toBe(false);
    res = { error: null };
    act(() => app.track("like", it1));
    await settle();
    expect(f.sent).toEqual([]);
    expect(JSON.parse(localStorage.getItem("popcorno-eventi") || "[]")).toEqual([]);
  });
});

describe("dispositivo condiviso tra due account", () => {
  const A = { user: { id: "u1", email: "a@b.it" } };
  const B = { user: { id: "u2", email: "b@b.it" } };
  const locA = st({ liked: ["Dune"], citta: "Roma" });

  // A entra con un account vuoto (i suoi dati locali vanno sul suo account), poi esce con "Esci".
  async function aEntraEdEsce(f: ReturnType<typeof fakeClient>) {
    localStorage.setItem(SESSION_KEY, "{}");
    localStorage.setItem("stasera", JSON.stringify(locA));
    localStorage.setItem("stasera-clock", JSON.stringify(stamp(st(), locA, emptyClocks(), 400)));
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.user?.id).toBe("u1");
    await vi.waitFor(() => expect(f.upserts.some((u) => u.user_id === "u1")).toBe(true), { timeout: 3000 });
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe("u1");
    await act(() => signOut());
    await settle();
    expect(app.user).toBeNull();
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe("u1");
  }

  it("A esce, entra B: l'account di B non riceve i dati di A e lo stato locale diventa quello di B", async () => {
    const f = fakeClient({ session: A });
    await aEntraEdEsce(f);
    const remoteB = st({ liked: ["Up"], citta: "Milano" });
    const ckB = stamp(st(), remoteB, emptyClocks(), 300);
    f.db.prefs = { v: 1, st: remoteB, ck: ckB };
    act(() => f.emit("SIGNED_IN", B));
    await settle();
    expect(app.user?.id).toBe("u2");
    expect(app.st.liked).toEqual(["Up"]);
    expect(app.st.citta).toBe("Milano");
    expect(JSON.parse(localStorage.getItem("stasera-clock")!)).toEqual(ckB);
    // anche una modifica dopo non porta i dati di A
    act(() => app.setSt({ ...app.st, team: "Inter" }));
    await vi.waitFor(() => expect(f.upserts.some((u) => u.user_id === "u2")).toBe(true), { timeout: 3000 });
    for (const u of f.upserts.filter((x) => x.user_id === "u2")) {
      expect(u.data.st.liked).toEqual(["Up"]);
      expect(u.data.st.citta).toBe("Milano");
    }
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe("u2");
  });

  it("A esce, entra B con account vuoto: si riparte dai valori predefiniti e si scrivono su B", async () => {
    const f = fakeClient({ session: A });
    await aEntraEdEsce(f);
    f.db.prefs = {};
    act(() => f.emit("SIGNED_IN", B));
    await settle();
    expect(app.user?.id).toBe("u2");
    expect(app.st).toEqual(st());
    expect(JSON.parse(localStorage.getItem("stasera-clock")!)).toEqual(emptyClocks());
    await vi.waitFor(() => expect(f.upserts.some((u) => u.user_id === "u2")).toBe(true), { timeout: 3000 });
    const toB = f.upserts.filter((x) => x.user_id === "u2");
    expect(toB.map((u) => u.data)).toEqual([{ v: 1, st: st(), ck: emptyClocks() }]);
  });

  it("A esce e rientra: si unisce come sempre", async () => {
    const f = fakeClient({ session: A });
    await aEntraEdEsce(f);
    const remoteA = { ...structuredClone(f.db.prefs as { v: 1; st: Stasera; ck: ReturnType<typeof emptyClocks> }) };
    const s2 = st({ ...remoteA.st, liked: ["Dune", "Up"] });
    f.db.prefs = { v: 1, st: s2, ck: stamp(remoteA.st, s2, remoteA.ck, 900) };
    act(() => app.setSt({ ...app.st, team: "Inter" }));
    act(() => f.emit("SIGNED_IN", A));
    await settle();
    expect(app.user?.id).toBe("u1");
    expect(app.st.liked).toEqual(["Dune", "Up"]);
    expect(app.st.team).toBe("Inter");
    expect(app.st.citta).toBe("Roma");
  });

  it("dispositivo mai usato con un account: si unisce e si ricorda l'account", async () => {
    localStorage.setItem(SESSION_KEY, "{}");
    localStorage.setItem("stasera", JSON.stringify(locA));
    localStorage.setItem("stasera-clock", JSON.stringify(stamp(st(), locA, emptyClocks(), 400)));
    const remoteB = st({ liked: ["Up"] });
    const f = fakeClient({ session: B, prefs: { v: 1, st: remoteB, ck: stamp(st(), remoteB, emptyClocks(), 500) } });
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.st.liked).toEqual(["Dune", "Up"]);
    expect(app.st.citta).toBe("Roma");
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe("u2");
  });
});

describe("coda dei segnali svuotata", () => {
  const A = { user: { id: "u1", email: "a@b.it" } };
  const it1 = { t: "Up", ty: "film", s: "disney", m: [], w: [], g: "Animazione" };

  async function conCoda() {
    localStorage.setItem(SESSION_KEY, "{}");
    const f = fakeClient({ session: A, eventsResult: () => ({ error: { message: "Failed to fetch" } }) });
    setClientForTests(f.c);
    mount();
    await settle();
    act(() => app.track("like", it1));
    await settle();
    expect(JSON.parse(localStorage.getItem("popcorno-eventi")!)).toHaveLength(1);
    return f;
  }

  it("clearEvents svuota la coda locale", async () => {
    await conCoda();
    act(() => app.clearEvents());
    expect(JSON.parse(localStorage.getItem("popcorno-eventi") || "[]")).toEqual([]);
  });

  it("spegnere \"Ricorda le mie scelte\" svuota la coda locale", async () => {
    await conCoda();
    await act(() => app.setTrackEvents(false));
    expect(JSON.parse(localStorage.getItem("popcorno-eventi") || "[]")).toEqual([]);
  });
});

describe("uscita e eliminazione", () => {
  it("flushSync: una modifica fatta subito prima di uscire arriva all'account prima di signOut", async () => {
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } } });
    localStorage.setItem(SESSION_KEY, "{}");
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.user?.id).toBe("u1");
    await vi.waitFor(() => expect(f.log).toContain("preferences.upsert"), { timeout: 3000 });
    f.log.length = 0;
    act(() => app.setSt({ ...app.st, team: "Inter" }));
    await act(async () => { await app.flushSync(); await signOut(); });
    const i = f.log.indexOf("preferences.upsert");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(f.log.indexOf("signOut"));
    expect(f.upserts[f.upserts.length - 1].data.st.team).toBe("Inter");
  });

  it("flushSync non blocca l'uscita: errori ignorati e attesa massima di 3 secondi", async () => {
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } } });
    localStorage.setItem(SESSION_KEY, "{}");
    setClientForTests(f.c);
    mount();
    await settle();
    await vi.waitFor(() => expect(f.log).toContain("preferences.upsert"), { timeout: 3000 });
    vi.useFakeTimers();
    f.c.auth.getSession.mockImplementation(() => new Promise(() => {}));
    act(() => app.setSt({ ...app.st, team: "Milan" }));
    let done = false;
    const p = app.flushSync().then(() => { done = true; });
    await act(async () => { await vi.advanceTimersByTimeAsync(2900); });
    expect(done).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await p;
    expect(done).toBe(true);
  });

  it("forgetSession porta l'app allo stato non dentro senza chiamate di rete", async () => {
    const f = fakeClient({ session: { user: { id: "u1", email: "a@b.it" } } });
    localStorage.setItem(SESSION_KEY, "{}");
    setClientForTests(f.c);
    mount();
    await settle();
    expect(app.user?.id).toBe("u1");
    f.log.length = 0;
    act(() => app.forgetSession());
    expect(app.user).toBeNull();
    expect(app.trackEvents).toBe(false);
    await settle();
    expect(f.log).toEqual([]);
    expect(f.c.auth.signOut).not.toHaveBeenCalled();
  });
});
