import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, feedback, inWatch, loadState, saveState, serieOf, toggleWatch } from "../src/lib/state";
import type { Item } from "../src/lib/types";

const mem = (raw?: string): Storage => {
  const d = new Map<string, string>(raw === undefined ? [] : [["stasera", raw]]);
  return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v) } as unknown as Storage;
};
const dune = { t: "Dune", ty: "film", s: "x", m: [], w: [], g: "Fantascienza" } as Item;

describe("loadState", () => {
  it("storage vuoto o assente: valori predefiniti", () => {
    expect(loadState(mem())).toEqual(DEFAULT_STATE);
    expect(loadState(null)).toEqual(DEFAULT_STATE);
  });
  it("tipo essai vecchio diventa film + genere essai", () => {
    const s = loadState(mem('{"tipo":"essai"}'));
    expect(s.tipo).toBe("film");
    expect(s.gen).toContain("essai");
  });
  it("gen e watch non array diventano []", () => {
    const s = loadState(mem('{"gen":"x","watch":null}'));
    expect(s.gen).toEqual([]);
    expect(s.watch).toEqual([]);
  });
  it("campi parziali si uniscono ai predefiniti", () => {
    const s = loadState(mem('{"citta":"Forlì"}'));
    expect(s).toEqual({ ...DEFAULT_STATE, citta: "Forlì" });
  });
  it("JSON rotto o getItem che lancia: predefiniti", () => {
    expect(loadState(mem("{rotto"))).toEqual(DEFAULT_STATE);
    const throwing = { getItem() { throw new Error("SecurityError"); } } as unknown as Storage;
    expect(loadState(throwing)).toEqual(DEFAULT_STATE);
  });
  it("non muta DEFAULT_STATE", () => {
    const s = loadState(mem());
    s.gen.push("a"); s.subs.push("b");
    expect(DEFAULT_STATE.gen).toEqual([]);
    expect(DEFAULT_STATE.subs).toEqual(["netflix", "prime", "disney", "dazn"]);
  });
});

describe("saveState", () => {
  it("andata e ritorno identici", () => {
    const st = { ...DEFAULT_STATE, citta: "Forlì", liked: ["Dune"], likes: { Horror: -2 }, serie: [{ t: "S", tmdb: "tv/1", s: 2, e: 3 }] };
    const store = mem();
    saveState(st, store);
    expect(loadState(store)).toEqual(st);
  });
  it("setItem che lancia non propaga", () => {
    const throwing = { setItem() { throw new Error("Quota"); } } as unknown as Storage;
    expect(() => saveState(DEFAULT_STATE, throwing)).not.toThrow();
    expect(() => saveState(DEFAULT_STATE, null)).not.toThrow();
  });
});

describe("feedback", () => {
  it("+1: likes, liked, seen; non disliked; stato originale intatto", () => {
    const st = { ...DEFAULT_STATE, disliked: ["Dune"] };
    const n = feedback(st, dune, 1);
    expect(n.likes.Fantascienza).toBe(1);
    expect(n.liked).toContain("Dune");
    expect(n.seen).toContain("Dune");
    expect(n.disliked).not.toContain("Dune");
    expect(st.disliked).toEqual(["Dune"]);
    expect(feedback(n, dune, 1).liked).toEqual(["Dune"]);
  });
  it("-1: disliked, non liked; seen invariato", () => {
    const n = feedback({ ...DEFAULT_STATE, liked: ["Dune"] }, dune, -1);
    expect(n.likes.Fantascienza).toBe(-1);
    expect(n.disliked).toContain("Dune");
    expect(n.liked).not.toContain("Dune");
    expect(n.seen).toEqual([]);
  });
});

describe("watch e serie", () => {
  it("toggleWatch aggiunge e toglie, confrontando per tmdb se presente", () => {
    const a = { ...dune, tmdb: "movie/1" } as Item;
    const on = toggleWatch(DEFAULT_STATE, a);
    expect(on.watch).toEqual([{ t: "Dune", tmdb: "movie/1" }]);
    expect(inWatch(on, { ...a, t: "Altro titolo" })).toBe(true);
    expect(toggleWatch(on, a).watch).toEqual([]);
    expect(toggleWatch(DEFAULT_STATE, dune).watch).toEqual([{ t: "Dune" }]);
  });
  it("serieOf solo per ty serie", () => {
    const st = { ...DEFAULT_STATE, serie: [{ t: "X", tmdb: "tv/9", s: 1, e: 2 }] };
    expect(serieOf(st, { ...dune, t: "X", ty: "serie", tmdb: "tv/9" } as Item)).toEqual(st.serie[0]);
    expect(serieOf(st, { ...dune, t: "X", ty: "film", tmdb: "tv/9" } as Item)).toBeUndefined();
  });
});
