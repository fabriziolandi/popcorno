// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn((..._a: unknown[]) => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { AppStateProvider, useApp, type AppState } from "../src/app-state";
import { Shell } from "../src/components/Shell";
import { SESSION_KEY, getClient, setClientForTests } from "../src/lib/account";
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

type Session = { user: { id: string; email: string } } | null;
type Resp = { error: { code?: string; message?: string } | null; status: number };

// Client finto: sessione, ascoltatori dell'accesso, preferences e profiles in memoria.
function fakeClient(opts: { session?: Session; prefs?: unknown; track?: boolean; profilesRead?: () => Promise<unknown> } = {}) {
  let session: Session = opts.session ?? null;
  const cbs: ((ev: string, s: Session) => void)[] = [];
  const log: string[] = [];
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
        upsert: async (row: { data: unknown }) => {
          log.push("preferences.upsert");
          if (fail) return { data: null, ...fail };
          db.prefs = structuredClone(row.data);
          return { error: null, status: 201 };
        },
      };
    }),
  };
  return {
    c, log, db,
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
});
