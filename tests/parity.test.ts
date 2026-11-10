import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { allItems, loadCatalogs, loadCityShows, loadPalinsesto } from "../src/lib/data";
import { lucky } from "../src/lib/lucky";
import { candidates, pickNow, score, type Scored } from "../src/lib/scoring";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Stasera } from "../src/lib/types";
import { defaultFiles, fixtureFetch, fixturePalinsesto, type LegacyPalinsesto, legacyLucky, loadLegacy, settle } from "./legacy/harness";

const PAY = ["netflix", "prime", "disney", "dazn"];
// Profili confrontati con l'app vecchia (solo i campi diversi da quelli predefiniti).
const PROFILES: Record<string, Partial<Stasera>> = {
  predefinito: {},
  famiglia: { chi: "famiglia", umore: ["risate", "emozione"] },
  "solo sport, squadra Inter": { umore: ["sport"], team: "Inter" },
  "sport con squadra Roma": { tipo: "sport", team: "Roma", umore: ["relax"] },
  essai: { tipo: "film", gen: ["essai"], subs: [...PAY, "mubi"] },
  "essai con tutto": { gen: ["essai", "drammatico"], subs: [...PAY, "mubi", "now"] },
  gratis: { free: true, umore: ["relax", "risate"] },
  "tempo 90": { tempo: "90", gen: ["giallo", "commedia"], chi: "solo" },
  "tutta la sera, serie": { tempo: "999", tipo: "serie", chi: "amici", umore: ["tensione"] },
  "liked, disliked, seen": {
    likes: { Drammatico: 2, Commedia: -1, Animazione: 1 }, liked: ["Breaking Bad", "Parthenope"],
    disliked: ["Stranger Things"], seen: ["Dune - Parte due"],
  },
  "watch e serie": {
    watch: [{ t: "Perfect Days", tmdb: "movie/976893" }, { t: "Bluey" }],
    serie: [{ t: "Breaking Bad", tmdb: "tv/1396", s: 2, e: 3 }], subs: [...PAY, "mubi"],
  },
  "cinema a Forlì": { tipo: "cinema", citta: "forli" },
  "cinema senza città": { tipo: "cinema", umore: ["emozione"] },
  "cinema essai": { tipo: "cinema", gen: ["essai"], citta: "Roma" },
  "nessun risultato nel tempo": { tempo: "90", tipo: "film", gen: ["fanta"], free: true },
};

const NOW = new Date(2026, 10, 7, 21, 0); // data del palinsesto di prova, alle 21:00
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const view = (xs: Scored[]) => xs.map((x) => ({ t: x.it.t, sc: x.sc, why: x.why }));
// Novità rispetto all'app vecchia: i titoli già visti non si propongono più (tranne le serie seguite).
// Le proposte dell'app vecchia si confrontano quindi senza quei titoli.
const unseen = (xs: Scored[], st: Stasera) =>
  xs.filter((x) => !st.seen.includes(x.it.t) || (x.it.ty === "serie" && st.serie.some((s) => (s.tmdb && x.it.tmdb ? s.tmdb === x.it.tmdb : s.t === x.it.t))));

async function ours(prof: Partial<Stasera>, pal0: LegacyPalinsesto = fixturePalinsesto()) {
  vi.stubGlobal("fetch", fixtureFetch({ ...defaultFiles(), "oggi.json": pal0 }));
  const st: Stasera = { ...structuredClone(DEFAULT_STATE), ...structuredClone(prof) };
  const pal = await loadPalinsesto();
  const extra = await loadCatalogs(st);
  const shows = st.citta ? await loadCityShows(st.citta) : null;
  return { st, pal, extra, shows };
}

afterEach(() => vi.unstubAllGlobals());

describe.each(Object.entries(PROFILES))("parità con l'app vecchia: %s", (name, prof) => {
  // Una sola app vecchia per profilo: Math.random legge `r`, che ogni caso di lucky imposta.
  let r = 0.5;
  let w: any;
  beforeAll(async () => {
    w = loadLegacy(fixturePalinsesto(), prof, { files: defaultFiles(), now: NOW, random: () => r });
    await settle();
  });

  it("candidates: stessi titoli, ordine, punteggi e motivi", async () => {
    const legacy = plain(w.candidates());
    const legacyNoTime = plain(w.candidates(true));
    const { st, pal, extra, shows } = await ours(prof);
    expect(view(candidates(pal, st, { shows, extra }))).toEqual(view(unseen(legacy, st)));
    expect(view(candidates(pal, st, { shows, extra, noTime: true }))).toEqual(view(unseen(legacyNoTime, st)));
    expect(legacyNoTime.length).toBeGreaterThan(0);
    // col profilo che ha un titolo visto, l'esclusione toglie davvero qualcosa
    if (st.seen.length) expect(unseen(legacyNoTime, st).length).toBeLessThan(legacyNoTime.length);
  });

  it("score: stesso punteggio per ogni titolo del palinsesto", async () => {
    const legacyC = w.eval("C.concat(CIN)");
    const legacy = legacyC.map((it: any) => ({ t: it.t, ...plain(w.score(it)) }));
    const { st, pal, extra } = await ours(prof);
    const mine = allItems(pal, extra).concat(pal.cinema).map((it) => ({ t: it.t, ...score(it, st) }));
    expect(mine).toEqual(legacy);
  });

  it("pickNow: stessa lista, anche quando ripiega", async () => {
    w.pickNow();
    const legacy = plain(w.eval("list"));
    const { st, pal, extra, shows } = await ours(prof);
    expect(view(pickNow(pal, st, shows, extra))).toEqual(view(unseen(legacy, st)));
  });

  it.each([0, 0.3, 0.75, 0.999])("lucky con Math.random = %s: stessa scelta", async (x) => {
    r = x;
    const legacy = legacyLucky(w);
    const { st, pal, extra } = await ours(prof);
    const mine = lucky(allItems(pal, extra), st, { now: NOW, palDate: pal.data, skip: new Set(), random: () => x });
    // Col profilo predefinito c'è sempre una scelta: il confronto non passa perché entrambe sono null.
    if (name === "predefinito") {
      expect(legacy).not.toBeNull();
      expect(mine).not.toBeNull();
    }
    expect(mine && view([mine])).toEqual(legacy && view([legacy as Scored]));
  });
});

describe("parità: casi particolari", () => {
  it("palinsesto senza ondemand: ripiega sui 3 titoli predefiniti (OD)", async () => {
    const pal0 = fixturePalinsesto();
    delete pal0.ondemand;
    delete pal0.cinema;
    const w = loadLegacy(pal0, {}, { files: defaultFiles(), now: NOW });
    await settle();
    const legacy = plain(w.candidates());
    const { st, pal, extra, shows } = await ours({}, pal0);
    expect(view(candidates(pal, st, { shows, extra }))).toEqual(view(legacy));
    expect(legacy.some((x: Scored) => x.it.t === "Mare fuori")).toBe(true);
  });

  it.each([
    ["alle 23:00 (programmi già iniziati da più di 15 minuti esclusi)", new Date(2026, 10, 7, 23, 0)],
    ["all'una di notte", new Date(2026, 10, 8, 1, 0)],
    ["il giorno dopo (niente TV)", new Date(2026, 10, 8, 21, 0)],
  ])("lucky %s", async (_n, now) => {
    for (const r of [0.1, 0.6]) {
      const w = loadLegacy(fixturePalinsesto(), {}, { files: defaultFiles(), now, random: () => r });
      await settle();
      const legacy = legacyLucky(w);
      const { st, pal, extra } = await ours({});
      const mine = lucky(allItems(pal, extra), st, { now, palDate: pal.data, skip: new Set(), random: () => r });
      expect(legacy).not.toBeNull();
      expect(mine).not.toBeNull();
      expect(mine && view([mine])).toEqual(legacy && view([legacy as Scored]));
    }
  });

  it("lucky salta i titoli in skip, come 'Un'altra proposta'", async () => {
    const w = loadLegacy(fixturePalinsesto(), {}, { files: defaultFiles(), now: NOW, random: () => 0 });
    await settle();
    const first = legacyLucky(w)!;
    w.eval(`luckySkip.add(${JSON.stringify(first.it.t)})`);
    const second = legacyLucky(w)!;
    const { st, pal, extra } = await ours({});
    const mine = lucky(allItems(pal, extra), st, { now: NOW, palDate: pal.data, skip: new Set([first.it.t]), random: () => 0 });
    expect(mine!.it.t).toBe(second.it.t);
    expect(mine!.it.t).not.toBe(first.it.t);
  });

  it("lucky senza titoli adatti: null", async () => {
    const { st, pal } = await ours({});
    expect(lucky([], st, { now: NOW, palDate: pal.data, skip: new Set(), random: () => 0.5 })).toBeNull();
  });
});
