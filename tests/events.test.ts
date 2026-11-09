import { describe, expect, it, vi } from "vitest";
import { eventKinds } from "../db/schema";
import { createTracker, eventRow, EVENT_KINDS, OPENED_KEY, QUEUE_KEY, titleRef, type EventRow, type SendResult } from "../src/lib/events";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Item } from "../src/lib/types";

const item = (over: Partial<Item> = {}): Item => ({ t: "Up", ty: "film", s: "disney", m: [], w: [], g: "Animazione", ...over });
const st = () => structuredClone(DEFAULT_STATE);

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  } as Storage;
}

function setup(over: { enabled?: boolean; result?: SendResult } = {}) {
  const storage = memStorage();
  let enabled = over.enabled ?? true;
  let result: SendResult = over.result ?? "ok";
  let t = 1_000_000;
  const send = vi.fn(async (_rows: EventRow[]) => result);
  const tr = createTracker({ storage, enabled: () => enabled, send, now: () => t });
  return {
    storage, send, tr,
    queue: () => JSON.parse(storage.getItem(QUEUE_KEY) || "[]") as EventRow[],
    setEnabled: (v: boolean) => { enabled = v; },
    setResult: (v: SendResult) => { result = v; },
    advance: (ms: number) => { t += ms; },
  };
}
const row = (kind: EventRow["kind"] = "like", it = item()) => eventRow(kind, it, st());
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("storico dei segnali", () => {
  it("senza account non si mette niente in coda", async () => {
    const s = setup({ enabled: false });
    s.tr.track(row());
    await s.tr.flush();
    await tick();
    expect(s.queue()).toEqual([]);
    expect(s.storage.getItem(QUEUE_KEY)).toBeNull();
    expect(s.send).not.toHaveBeenCalled();
  });

  it("open ripetuto entro 30 minuti conta una volta, dopo 31 minuti di nuovo", async () => {
    const s = setup({ result: "retry" });
    s.tr.track(row("open"));
    s.advance(10 * 60_000);
    s.tr.track(row("open"));
    expect(s.queue()).toHaveLength(1);
    s.advance(21 * 60_000);
    s.tr.track(row("open"));
    expect(s.queue()).toHaveLength(2);
    expect(s.storage.getItem(OPENED_KEY)).not.toBeNull();
  });

  it("la coda tiene al massimo 200 eventi", async () => {
    const s = setup({ result: "retry" });
    for (let i = 0; i < 205; i++) s.tr.track(row("like", item({ t: "T" + i })));
    const q = s.queue();
    expect(q).toHaveLength(200);
    expect(q[0].title).toBe("T5");
    expect(q[199].title).toBe("T204");
  });

  it("off svuota la coda e non riprova", async () => {
    const s = setup({ result: "off" });
    s.tr.track(row());
    await tick();
    expect(s.queue()).toEqual([]);
    expect(s.send).toHaveBeenCalledTimes(1);
    await s.tr.flush();
    expect(s.send).toHaveBeenCalledTimes(1);
  });

  it("retry tiene la coda e la manda all'evento online", async () => {
    const s = setup({ result: "retry" });
    s.tr.track(row());
    await tick();
    expect(s.queue()).toHaveLength(1);
    s.setResult("ok");
    await s.tr.flush(); // è quello che fa l'evento online
    expect(s.send).toHaveBeenCalledTimes(2);
    expect(s.send.mock.calls[1][0]).toHaveLength(1);
    expect(s.queue()).toEqual([]);
  });

  it("drop scarta il lotto inviato e tiene i successivi, senza riprovare", async () => {
    const s = setup({ result: "drop" });
    s.tr.track(row("like", item({ t: "A" })));
    await tick();
    expect(s.queue()).toEqual([]);
    expect(s.send).toHaveBeenCalledTimes(1);
  });

  it("clear svuota coda e aperture; un invio in corso non tocca la coda nuova", async () => {
    const s = setup({ result: "retry" });
    s.tr.track(row("open"));
    await tick();
    s.tr.clear();
    expect(s.queue()).toEqual([]);
    expect(s.storage.getItem(OPENED_KEY)).toBeNull();
    let release!: () => void;
    s.send.mockImplementationOnce(() => new Promise<SendResult>((r) => { release = () => r("ok"); }));
    s.setResult("retry");
    s.tr.track(row("like", item({ t: "X" })));
    s.tr.clear();
    s.tr.track(row("like", item({ t: "Y" })));
    release();
    await tick();
    expect(s.queue().map((r) => r.title)).toEqual(["Y"]);
  });

  it("off chiama onOff", async () => {
    const onOff = vi.fn();
    const storage = memStorage();
    const tr = createTracker({ storage, enabled: () => true, send: async () => "off", now: () => 1, onOff });
    tr.track(row());
    await tick();
    expect(onOff).toHaveBeenCalledTimes(1);
  });

  it("title si accorcia a 300 caratteri", () => {
    expect(eventRow("like", item({ t: "x".repeat(500) }), st()).title).toHaveLength(300);
  });

  it("titleRef senza tmdb usa tipo:nome", () => {
    expect(titleRef(item({ tmdb: "movie/12" }))).toBe("movie/12");
    expect(titleRef(item())).toBe("film:Up");
    expect(titleRef(item({ t: "x".repeat(300) }))).toHaveLength(200);
  });

  it("ctx troppo grande viene accorciato sotto 3500 caratteri", () => {
    const shown = Array.from({ length: 10 }, (_, i) => `${i}-` + "a".repeat(600));
    const r = eventRow("open", item(), st(), { shown });
    expect(JSON.stringify(r.ctx).length).toBeLessThanOrEqual(3500);
    expect((r.ctx.shown as string[]).length).toBeGreaterThan(0);
    expect((r.ctx.shown as string[]).length).toBeLessThan(10);
  });

  it("source è cinema per i titoli al cinema; ctx di base ha time e teams", () => {
    expect(eventRow("open", item({ ty: "cinema" }), st()).source).toBe("cinema");
    expect(eventRow("like", item({ time: "21:00" }), st()).ctx).toEqual({ time: "21:00" });
    expect(eventRow("like", item({ ty: "sport", teams: ["A", "B"] }), st()).ctx).toEqual({ teams: ["A", "B"] });
  });

  it("eventKinds uguali a db/schema.ts", () => {
    expect([...EVENT_KINDS]).toEqual([...eventKinds]);
  });
});
