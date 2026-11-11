import { describe, expect, it } from "vitest";
import { varia, type Scored } from "../src/lib/scoring";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Item, Stasera } from "../src/lib/types";

const st = (p: Partial<Stasera> = {}): Stasera => ({ ...structuredClone(DEFAULT_STATE), ...p });
const sc = (t: string, n: number, extra: Partial<Item> = {}): Scored => ({ it: { t, ty: "film", s: "x", m: [], w: [], g: "Drammatico", ...extra }, sc: n, why: [] });
// generatore ripetibile per le prove
const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

describe("varietà delle proposte", () => {
  const list = [sc("A", 10), sc("B", 9.8), sc("C", 9.5), sc("D", 9.3), sc("Z", 0)];

  it("a parità di risposte il primo titolo cambia da una volta all'altra", () => {
    const primi = new Set(Array.from({ length: 200 }, (_, i) => varia(list, st(), rng(i + 1))[0].it.t));
    expect(primi.size).toBeGreaterThanOrEqual(3);
  });

  it("un titolo con punteggio molto più basso non va quasi mai in testa", () => {
    const n = Array.from({ length: 500 }, (_, i) => varia(list, st(), rng(i + 7))[0].it.t).filter((t) => t === "Z").length;
    expect(n).toBe(0);
  });

  it("non perde né duplica titoli", () => {
    expect(varia(list, st(), rng(3)).map((x) => x.it.t).sort()).toEqual(["A", "B", "C", "D", "Z"]);
  });

  it("squadra, serie seguite e lista Da vedere restano prime", () => {
    const l = [sc("A", 10), sc("Partita", 2, { ty: "sport", teams: ["Inter"] }), sc("Serie", 1, { ty: "serie" }), sc("Lista", 0.5)];
    const s = st({ team: "Inter", serie: [{ t: "Serie", tmdb: "", s: 1, e: 2 }], watch: [{ t: "Lista" }] });
    for (let i = 1; i < 50; i++) expect(varia(l, s, rng(i)).slice(0, 3).map((x) => x.it.t)).toEqual(["Partita", "Serie", "Lista"]);
  });
});
