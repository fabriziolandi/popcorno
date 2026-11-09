import { describe, expect, it } from "vitest";
import { DEFAULT_STATE } from "../src/lib/state";
import { emptyClocks, gcClocks, loadClocks, merge, stamp, type Clocks, type Synced } from "../src/lib/sync-merge";
import type { Stasera } from "../src/lib/types";

const st = (o: Partial<Stasera> = {}): Stasera => ({ ...structuredClone(DEFAULT_STATE), ...o });
const ck = (o: Partial<Clocks> = {}): Clocks => ({ ...emptyClocks(), ...o });
const sy = (s: Partial<Stasera>, c: Partial<Clocks> = {}): Synced => ({ st: st(s), ck: ck(c) });
const DAY = 864e5;

describe("stamp", () => {
  it("segna solo ciò che cambia", () => {
    const prev = st();
    const c1 = stamp(prev, st({ citta: "Roma" }), emptyClocks(), 100);
    expect(c1.f.citta).toBe(100);
    expect(c1.f.team).toBeUndefined();

    const withDune = st({ watch: [{ t: "Dune", tmdb: "movie/1" }] });
    const c2 = stamp(prev, withDune, emptyClocks(), 200);
    expect(c2.l.watch["movie/1"]).toBe(200);

    const c3 = stamp(withDune, prev, c2, 300);
    expect(c3.rm.watch["movie/1"]).toBe(300);
    expect(c3.l.watch["movie/1"]).toBeUndefined();

    const s1 = st({ serie: [{ t: "X", tmdb: "tv/1", s: 1, e: 3 }] });
    const s2 = st({ serie: [{ t: "X", tmdb: "tv/1", s: 1, e: 4 }] });
    expect(stamp(s1, s2, emptyClocks(), 400).l.serie["tv/1"]).toBe(400);
  });
  it("non muta l'ingresso", () => {
    const c = emptyClocks();
    stamp(st(), st({ citta: "Roma" }), c, 1);
    expect(c).toEqual(emptyClocks());
  });
});

describe("merge", () => {
  const X = { t: "X", tmdb: "tv/x", s: 1, e: 1 };
  const Y = { t: "Y", tmdb: "tv/y", s: 1, e: 1 };

  it("campo singolo: vince il più recente", () => {
    const r = merge(sy({ citta: "Roma" }, { f: { citta: 10 } }), sy({ citta: "Milano" }, { f: { citta: 20 } }), 30);
    expect(r.st.citta).toBe("Milano");
    expect(r.ck.f.citta).toBe(20);
  });
  it("a parità vince il locale", () => {
    const r = merge(sy({ citta: "Roma" }, { f: { citta: 10 } }), sy({ citta: "Milano" }, { f: { citta: 10 } }), 30);
    expect(r.st.citta).toBe("Roma");
  });
  it("dati vecchi senza date", () => {
    const r = merge(sy({ citta: "Roma", liked: ["A"] }), sy({ citta: "Milano", liked: ["B"] }, { f: { citta: 5 } }), 30);
    expect(r.st.citta).toBe("Milano");
    expect(r.st.liked).toEqual(["A", "B"]);
  });
  it("una rimozione non fa ricomparire l'elemento", () => {
    const a = sy({ serie: [Y] }, { l: { serie: { "tv/y": 31 } }, rm: { serie: { "tv/x": 30 } } });
    const b = sy({ serie: [X] }, { l: { serie: { "tv/x": 10 } } });
    const r = merge(a, b, 40);
    expect(r.st.serie).toEqual([Y]);
    expect(r.ck.rm.serie["tv/x"]).toBe(30);
  });
  it("una nuova aggiunta vince su una rimozione più vecchia", () => {
    const r = merge(sy({}, { rm: { serie: { "tv/x": 10 } } }), sy({ serie: [X] }, { l: { serie: { "tv/x": 20 } } }), 40);
    expect(r.st.serie).toEqual([X]);
    expect(r.ck.rm.serie["tv/x"]).toBeUndefined();
  });
  it("a parità vince l'elemento vivo", () => {
    const r = merge(sy({}, { rm: { serie: { "tv/x": 20 } } }), sy({ serie: [X] }, { l: { serie: { "tv/x": 20 } } }), 40);
    expect(r.st.serie).toEqual([X]);
  });
  it("serie: vince lo stato dell'episodio più recente", () => {
    const a = sy({ serie: [{ ...X, e: 3 }] }, { l: { serie: { "tv/x": 10 } } });
    const b = sy({ serie: [{ ...X, e: 5 }] }, { l: { serie: { "tv/x": 20 } } });
    expect(merge(a, b, 40).st.serie[0].e).toBe(5);
    expect(merge(b, a, 40).st.serie[0].e).toBe(5);
  });
  it("i marcatori più vecchi di 90 giorni spariscono", () => {
    const now = 100 * DAY;
    const c = ck({ rm: { watch: { old: now - 91 * DAY, young: now - 89 * DAY } } });
    expect(gcClocks(c, now).rm.watch).toEqual({ young: now - 89 * DAY });
    const r = merge({ st: st(), ck: c }, sy({}), now);
    expect(r.ck.rm.watch).toEqual({ young: now - 89 * DAY });
  });
  it("merge è stabile", () => {
    const a = sy({ citta: "Roma", liked: ["A", "C"], serie: [Y] },
      { f: { citta: 10 }, l: { serie: { "tv/y": 5 } }, rm: { liked: { Z: 7 } } });
    const b = sy({ citta: "Milano", liked: ["B", "Z"], serie: [X] },
      { f: { citta: 20 }, l: { liked: { Z: 3 } }, rm: { serie: { "tv/y": 9 } } });
    const ab = merge(a, b, 50);
    expect(merge(ab, b, 50)).toEqual(ab);
  });
  it("non muta gli ingressi", () => {
    const a = sy({ liked: ["A"] });
    const b = sy({ liked: ["B"] });
    const ja = JSON.stringify(a);
    const jb = JSON.stringify(b);
    merge(a, b, 1);
    expect(JSON.stringify(a)).toBe(ja);
    expect(JSON.stringify(b)).toBe(jb);
  });
});

describe("loadClocks", () => {
  it("con JSON rotto restituisce emptyClocks()", () => {
    const s = { getItem: () => "{rotto" } as unknown as Storage;
    expect(loadClocks(s)).toEqual(emptyClocks());
    expect(loadClocks(null)).toEqual(emptyClocks());
  });
});
