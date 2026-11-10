import { afterEach, describe, expect, it, vi } from "vitest";
import { AREE, areaOf } from "../src/lib/aree";
import { allItems, loadCatalogs, loadCityShows, loadPalinsesto } from "../src/lib/data";
import { lucky } from "../src/lib/lucky";
import { candidates, pickNow, score, type Scored } from "../src/lib/scoring";
import { DEFAULT_STATE, loadState } from "../src/lib/state";
import type { Item, Stasera } from "../src/lib/types";
import { defaultFiles, fixtureFetch, fixturePalinsesto } from "./legacy/harness";

const NOW = new Date(2026, 10, 7, 21, 0); // data del palinsesto di prova, alle 21:00
const it0 = (l?: string): Item => ({ t: "X", ty: "film", s: "x", m: [], w: [], g: "Drammatico", ...(l === undefined ? {} : { l }) });

async function ours(prof: Partial<Stasera>) {
  vi.stubGlobal("fetch", fixtureFetch({ ...defaultFiles(), "oggi.json": fixturePalinsesto() }));
  const st: Stasera = { ...structuredClone(DEFAULT_STATE), ...structuredClone(prof) };
  const pal = await loadPalinsesto();
  const extra = await loadCatalogs(st);
  const shows = st.citta ? await loadCityShows(st.citta) : null;
  return { st, pal, extra, shows };
}
afterEach(() => vi.unstubAllGlobals());

const TOCCATI = new Set(["film", "serie", "cinema"]);
// Ciò che il filtro deve lasciare con le aree `aree`.
const passa = (x: Scored, aree: string[]) => !TOCCATI.has(x.it.ty) || areaOf(x.it) === null || aree.includes(areaOf(x.it)!);

describe("areaOf", () => {
  it("una lingua per ogni area", () => {
    expect(areaOf(it0("it"))).toBe("italia");
    expect(areaOf(it0("fr"))).toBe("europa");
    expect(areaOf(it0("sv"))).toBe("europa");
    expect(areaOf(it0("en"))).toBe("inglese");
    expect(areaOf(it0("es"))).toBe("latina");
    expect(areaOf(it0("pt"))).toBe("latina");
    expect(areaOf(it0("ja"))).toBe("asia");
    expect(areaOf(it0("ko"))).toBe("asia");
  });
  it("lingua sconosciuta: resto del mondo; lingua vuota o assente: null", () => {
    expect(areaOf(it0("fa"))).toBe("mondo");
    expect(areaOf(it0("ar"))).toBe("mondo");
    expect(areaOf(it0(""))).toBeNull();
    expect(areaOf(it0())).toBeNull();
  });
  it("etichette esatte, nell'ordine", () => {
    expect(AREE.map((a) => [a.k, a.n])).toEqual([
      ["italia", "🇮🇹 Italia"], ["europa", "🇪🇺 Europa"], ["inglese", "🇺🇸 USA e Regno Unito"],
      ["latina", "🌎 America Latina"], ["asia", "🌏 Asia"], ["mondo", "🌍 Resto del mondo"],
    ]);
  });
});

describe("stato: aree", () => {
  it("predefinito [] e dati vecchi senza il campo (o rotti) diventano []", () => {
    expect(DEFAULT_STATE.aree).toEqual([]);
    const mem = (raw: string) => ({ getItem: () => raw }) as unknown as Storage;
    expect(loadState(mem('{"citta":"Forlì"}')).aree).toEqual([]);
    expect(loadState(mem('{"aree":"asia"}')).aree).toEqual([]);
    expect(loadState(mem('{"aree":["asia"]}')).aree).toEqual(["asia"]);
  });
});

describe("filtro delle aree nelle proposte", () => {
  it("candidates con aree [asia]: niente film o serie di altre aree note; restano senza lingua, sport e show", async () => {
    const { st, pal, extra, shows } = await ours({ umore: ["relax", "sport"], tempo: "999" });
    const tutti = candidates(pal, st, { shows, extra });
    const asia = candidates(pal, { ...st, aree: ["asia"] }, { shows, extra });
    expect(asia.map((x) => x.it.t)).toEqual(tutti.filter((x) => passa(x, ["asia"])).map((x) => x.it.t));
    expect(asia.some((x) => areaOf(x.it) === "asia")).toBe(true);
    expect(asia.some((x) => TOCCATI.has(x.it.ty) && areaOf(x.it) === null)).toBe(true);
    expect(asia.some((x) => x.it.ty === "sport")).toBe(true);
    expect(asia.some((x) => x.it.ty === "show")).toBe(true);
    expect(asia.some((x) => TOCCATI.has(x.it.ty) && areaOf(x.it) !== null && areaOf(x.it) !== "asia")).toBe(false);
    expect(tutti.some((x) => areaOf(x.it) === "inglese")).toBe(true);
  });
  it("pickNow con più aree e con aree [] (nessun filtro)", async () => {
    const { st, pal, extra, shows } = await ours({});
    const tutti = pickNow(pal, st, shows, extra);
    const scelte = ["italia", "europa"];
    const due = pickNow(pal, { ...st, aree: scelte }, shows, extra);
    expect(due.map((x) => x.it.t)).toEqual(tutti.filter((x) => passa(x, scelte)).map((x) => x.it.t));
    expect(due.length).toBeLessThan(tutti.length);
    expect(pickNow(pal, { ...st, aree: [] }, shows, extra).map((x) => x.it.t)).toEqual(tutti.map((x) => x.it.t));
  });
  it("vale anche per il cinema", async () => {
    const { st, pal, extra, shows } = await ours({ tipo: "cinema" });
    const tutti = candidates(pal, st, { shows, extra });
    const it = candidates(pal, { ...st, aree: ["italia"] }, { shows, extra });
    expect(tutti.some((x) => areaOf(x.it) === "inglese")).toBe(true);
    expect(it.map((x) => x.it.t)).toEqual(tutti.filter((x) => passa(x, ["italia"])).map((x) => x.it.t));
  });
  it("il motivo dell'area si aggiunge solo con meno di 3 motivi", async () => {
    const { st, pal, extra, shows } = await ours({});
    const list = candidates(pal, { ...st, aree: ["italia"] }, { shows, extra });
    const ita = list.filter((x) => areaOf(x.it) === "italia");
    expect(ita.length).toBeGreaterThan(0);
    for (const x of ita) {
      const senza = candidates(pal, st, { shows, extra }).find((y) => y.it === x.it)!;
      expect(x.sc).toBe(senza.sc);
      expect(x.why).toEqual(senza.why.length < 3 ? [...senza.why, "viene <b>dall'Italia</b>"] : senza.why);
    }
    // un titolo con pochi motivi: quello dell'area c'è se l'area è scelta, e non per sport e show
    const base = { ...structuredClone(DEFAULT_STATE), umore: [], chi: "solo" };
    expect(score(it0("ko"), { ...base, aree: ["asia"] }).why).toEqual(["viene <b>dall'Asia</b>"]);
    expect(score(it0("en"), { ...base, aree: ["inglese", "asia"] }).why).toEqual(["viene <b>dagli USA o dal Regno Unito</b>"]);
    expect(score(it0("ko"), { ...base, aree: [] }).why).toEqual([]);
    expect(score(it0("ko"), { ...base, aree: ["italia"] }).why).toEqual([]);
    expect(score({ ...it0("ko"), ty: "show" }, { ...base, aree: ["asia"] }).why).toEqual([]);
    expect(score(it0(), { ...base, aree: ["asia"] }).why).toEqual([]);
  });
  it("lucky con aree filtra allo stesso modo", async () => {
    const { st, pal, extra } = await ours({});
    const items = allItems(pal, extra);
    for (const aree of [["asia"], ["italia"], ["europa", "latina"]]) {
      for (const r of [0, 0.3, 0.75, 0.999]) {
        const opts = { now: NOW, palDate: pal.data, skip: new Set<string>(), random: () => r };
        const mine = lucky(items, { ...st, aree }, opts);
        const atteso = lucky(items.filter((x) => passa({ it: x, sc: 0, why: [] }, aree)), st, opts);
        expect(mine?.it.t).toBe(atteso?.it.t);
        if (mine) expect(passa(mine, aree)).toBe(true);
      }
    }
  });
});

describe("titoli già visti", () => {
  it("un titolo visto non è più proposto (neppure tra le alternative), una serie seguita sì", async () => {
    const { st, pal, extra, shows } = await ours({ tipo: "serie" });
    const prima = pickNow(pal, st, shows, extra);
    const [a, b] = [prima[0].it, prima[1].it];
    const dopo = pickNow(pal, { ...st, seen: [a.t, b.t] }, shows, extra);
    expect(dopo.map((x) => x.it.t)).not.toContain(a.t);
    expect(dopo.map((x) => x.it.t)).not.toContain(b.t);
    expect(dopo.map((x) => x.it.t)).toEqual(prima.filter((x) => x.it !== a && x.it !== b).map((x) => x.it.t));
    const seguita = { ...st, seen: [a.t], serie: [{ t: a.t, tmdb: a.tmdb || "", s: 1, e: 2 }] };
    expect(candidates(pal, seguita, { shows, extra }).map((x) => x.it.t)).toContain(a.t);
  });
  it("anche un titolo con 👍 (in seen) e i film visti", async () => {
    const { st, pal, extra, shows } = await ours({});
    const prima = candidates(pal, st, { shows, extra });
    const film = prima.find((x) => x.it.ty === "film")!.it;
    const dopo = candidates(pal, { ...st, seen: [film.t], liked: [film.t] }, { shows, extra });
    expect(dopo.map((x) => x.it.t)).not.toContain(film.t);
  });
  it("lucky non propone i visti", async () => {
    const { st, pal, extra } = await ours({});
    const opts = { now: NOW, palDate: pal.data, skip: new Set<string>(), random: () => 0 };
    const first = lucky(allItems(pal, extra), st, opts)!;
    const second = lucky(allItems(pal, extra), { ...st, seen: [first.it.t] }, opts)!;
    expect(second.it.t).not.toBe(first.it.t);
  });
});
