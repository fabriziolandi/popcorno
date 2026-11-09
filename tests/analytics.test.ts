// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createAnalytics, POSTHOG_OPTIONS, prefEvents } from "../src/lib/analytics";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Stasera } from "../src/lib/types";

const fakePosthog = () => ({ init: vi.fn(), capture: vi.fn() });
const now = (f: () => void) => f(); // pianificazione immediata nei test
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("analytics", () => {
  it("senza chiave non carica PostHog e non registra nulla", async () => {
    const load = vi.fn();
    const a = createAnalytics({ key: "", load, schedule: now });
    a.start();
    a.track("prova");
    await flush();
    expect(load).not.toHaveBeenCalled();
  });

  it("carica PostHog solo con start(), con la configurazione EU e i campi di testo oscurati", async () => {
    const ph = fakePosthog();
    const load = vi.fn(async () => ph);
    const a = createAnalytics({ key: "phc_test", load, schedule: now });
    expect(load).not.toHaveBeenCalled();
    a.start();
    await flush();
    expect(ph.init).toHaveBeenCalledWith("phc_test", POSTHOG_OPTIONS);
    expect(POSTHOG_OPTIONS.api_host).toBe("https://eu.i.posthog.com");
    expect(POSTHOG_OPTIONS.autocapture).toBe(true);
    expect(POSTHOG_OPTIONS.capture_exceptions).toBe(true);
    expect(POSTHOG_OPTIONS.session_recording?.maskAllInputs).toBe(true);
  });

  it("gli eventi registrati prima del caricamento partono dopo, nello stesso ordine", async () => {
    const ph = fakePosthog();
    const a = createAnalytics({ key: "phc_test", load: async () => ph, schedule: now });
    a.track("primo", { x: 1 });
    a.track("secondo");
    a.start();
    await flush();
    a.track("terzo");
    expect(ph.capture.mock.calls).toEqual([["primo", { x: 1 }], ["secondo", undefined], ["terzo", undefined]]);
  });

  it("start() due volte carica PostHog una volta sola", async () => {
    const ph = fakePosthog();
    const load = vi.fn(async () => ph);
    const a = createAnalytics({ key: "phc_test", load, schedule: now });
    a.start();
    a.start();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(ph.init).toHaveBeenCalledTimes(1);
  });

  it("chi ha disattivato le statistiche: PostHog non si carica e non si registra nulla", async () => {
    const store = new Map<string, string>();
    const load = vi.fn(async () => fakePosthog());
    const a = createAnalytics({ key: "phc_test", load, schedule: now, storage: () => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }) as unknown as Storage });
    a.setOptOut(true);
    expect(a.isOptedOut()).toBe(true);
    a.track("prima");
    a.start();
    await flush();
    expect(load).not.toHaveBeenCalled();
    a.setOptOut(false);
    expect(a.isOptedOut()).toBe(false);
  });

  it("disattivare dopo il caricamento ferma PostHog e gli eventi successivi", async () => {
    const ph = { ...fakePosthog(), opt_out_capturing: vi.fn(), opt_in_capturing: vi.fn() };
    const store = new Map<string, string>();
    const a = createAnalytics({ key: "phc_test", load: async () => ph, schedule: now, storage: () => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }) as unknown as Storage });
    a.start();
    await flush();
    a.setOptOut(true);
    a.track("dopo");
    expect(ph.opt_out_capturing).toHaveBeenCalled();
    expect(ph.capture).not.toHaveBeenCalledWith("dopo", undefined);
  });

  it("se PostHog non si carica (rete, blocco pubblicità) l'app non si rompe", async () => {
    const a = createAnalytics({ key: "phc_test", load: async () => { throw new Error("bloccato"); }, schedule: now });
    a.start();
    await flush();
    expect(() => a.track("dopo")).not.toThrow();
  });
});

describe("prefEvents: le preferenze cambiate diventano eventi", () => {
  const base: Stasera = structuredClone(DEFAULT_STATE);

  it("nessun cambiamento, nessun evento", () => {
    expect(prefEvents(base, structuredClone(base))).toEqual([]);
  });

  it("risposte, abbonamenti, città e squadra", () => {
    const next = { ...base, tempo: "90", subs: [...base.subs.filter((s) => s !== "dazn"), "mubi"], citta: "milano", team: "Inter" };
    const ev = prefEvents(base, next);
    expect(ev).toContainEqual({ name: "risposta_scelta", props: { domanda: "tempo", valore: "90" } });
    expect(ev).toContainEqual({ name: "abbonamento_aggiunto", props: { servizio: "mubi" } });
    expect(ev).toContainEqual({ name: "abbonamento_tolto", props: { servizio: "dazn" } });
    expect(ev).toContainEqual({ name: "citta_scelta", props: { citta: "milano" } });
    expect(ev).toContainEqual({ name: "squadra_scelta", props: { squadra: "Inter" } });
  });

  it("lista Da vedere, serie seguite, mi piace / non mi piace", () => {
    const a = { ...base, watch: [{ t: "Friends" }], liked: ["Seinfeld"], serie: [{ t: "Lost", tmdb: "1", s: 1, e: 1 }] };
    const b = { ...a, watch: [], disliked: ["Lost"], serie: [] };
    expect(prefEvents(base, a)).toEqual(expect.arrayContaining([
      { name: "da_vedere_aggiunto", props: { titolo: "Friends" } },
      { name: "mi_piace", props: { titolo: "Seinfeld" } },
      { name: "serie_seguita", props: { titolo: "Lost" } },
    ]));
    expect(prefEvents(a, b)).toEqual(expect.arrayContaining([
      { name: "da_vedere_tolto", props: { titolo: "Friends" } },
      { name: "non_mi_piace", props: { titolo: "Lost" } },
      { name: "serie_smessa", props: { titolo: "Lost" } },
    ]));
  });
});
