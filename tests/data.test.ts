import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allItems, catalogCount, dataVersion, filmShows, fromRow, loadCatalogs, loadCinemaIndex, loadCityShows,
  loadPalinsesto, loadPlot, nextTimes,
} from "../src/lib/data";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Item } from "../src/lib/types";
import { CINEMA_INDEX, defaultFiles, fixtureFetch, fixturePalinsesto, SHOWS_FORLI } from "./legacy/harness";

const st = () => structuredClone(DEFAULT_STATE);
const serve = (files: Record<string, unknown>) => {
  const f = vi.fn(fixtureFetch(files));
  vi.stubGlobal("fetch", f);
  return f;
};

afterEach(() => vi.unstubAllGlobals());

describe("loadPalinsesto", () => {
  it("legge /data/oggi.json", async () => {
    const f = serve({ "oggi.json": fixturePalinsesto() });
    const pal = await loadPalinsesto();
    expect(String(f.mock.calls[0][0])).toMatch(/^\/data\/oggi\.json\?t=\d+$/);
    expect(pal.data).toBe("2026-11-07");
    expect(pal.items.length).toBe(89);
    expect(pal.ondemand.length).toBe(6);
    expect(pal.cinema.length).toBe(3);
  });
  it("ondemand o cinema mancanti: []", async () => {
    const p = fixturePalinsesto();
    delete p.ondemand;
    delete p.cinema;
    serve({ "oggi.json": p });
    const pal = await loadPalinsesto();
    expect(pal.ondemand).toEqual([]);
    expect(pal.cinema).toEqual([]);
    expect(allItems(pal).slice(-3).map((x) => x.t)).toEqual(["Up", "Mare fuori", "Stranger Things"]);
  });
  it("oggi.json assente: palinsesto vuoto, come l'app vecchia senza data/oggi.js", async () => {
    serve({});
    const pal = await loadPalinsesto();
    expect(pal).toEqual({ data: "", etichetta: "", aggiornato: "", fonti: [], items: [], ondemand: [], cinema: [] });
    expect(dataVersion(pal)).toBe("v=0");
  });
});

describe("dataVersion", () => {
  it("come DV(): v=<aggiornato codificato>", () => {
    expect(dataVersion(null)).toBe("v=0");
    expect(dataVersion({ ...fixturePalinsesto(), aggiornato: "7 novembre, 07:43" } as any)).toBe("v=7%20novembre%2C%2007%3A43");
  });
});

describe("loadCatalogs", () => {
  it("un catalogo in 404 non blocca gli altri; usa lo stesso parametro di versione", async () => {
    const f = serve({ ...defaultFiles(), "oggi.json": fixturePalinsesto() });
    await loadPalinsesto();
    const s = { ...st(), subs: ["prime", "netflix", "hbo"] };
    const extra = await loadCatalogs(s);
    // Dune e Anatomia erano già nel palinsesto: si fondono, non si duplicano
    expect(extra.map((x) => x.t)).toEqual([
      "Breaking Bad", "Stranger Things", "Parasite", "Soul", "The Mandalorian", "Horror di serie B",
      "Film d'autore coreano", "Peppa Pig", "Concerto rock", "Senza generi",
    ]);
    expect(catalogCount()).toBe(12);
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("/data/catalogo/netflix.json?v=7%20novembre%2C%2007%3A43");
    expect(urls.filter((u) => u.includes("/catalogo/")).map((u) => u.replace(/^\/data\/catalogo\/|\.json.*$/g, "")))
      .toEqual(["raiplay", "infinity", "pluto", "rakuten", "netflix", "prime", "hbo"]);
  });
  it("fetch che lancia: nessuna eccezione, nessun titolo", async () => {
    serve({ "oggi.json": fixturePalinsesto() });
    await loadPalinsesto();
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
    await expect(loadCatalogs(st())).resolves.toEqual([]);
  });
});

describe("fromRow", () => {
  it("costruisce un titolo dal catalogo come l'app vecchia", async () => {
    serve({ "oggi.json": fixturePalinsesto() });
    await loadPalinsesto();
    const it = fromRow("netflix", [77777, 1, "Peppa Pig", 2004, 6.2, [16, 10762], 15, "/peppa.jpg", 400, "en"])!;
    expect(it).toEqual({
      t: "Peppa Pig", ty: "serie", s: "netflix", dur: 0, m: ["risate", "emozione"], w: ["famiglia", "coppia", "amici"],
      g: "Animazione", e: "🎨", c: ["#56ccf2", "#2f80ed"], d: "", v: 6.2, vc: 400, l: "en", gs: [16, 10762], y: 2004,
      p: "/peppa.jpg", pop: 15, tmdb: "tv/77777", cat: 1, kids: 1,
    });
    expect(fromRow("prime", [77777, 1, "Peppa Pig", 2004, 6.2, [16], 15, "", 400, "en"])).toBeNull();
    expect(it.also).toEqual(["prime"]);
  });
  it("titolo già nel palinsesto: aggiunge la piattaforma e i dati mancanti", async () => {
    serve({ "oggi.json": fixturePalinsesto() });
    const pal = await loadPalinsesto();
    expect(fromRow("netflix", [915935, 0, "Anatomia di una caduta", 2023, 7.6, [18], 30, "/a.jpg", 1200, "fr"])).toBeNull();
    const an = pal.ondemand.find((x) => x.t === "Anatomia di una caduta")!;
    expect(an.also).toEqual(["netflix"]);
    expect(an.p).toBe("/a.jpg");
  });
});

describe("loadPlot", () => {
  const film: Item = { t: "X", ty: "film", s: "netflix", m: [], w: [], g: "Commedia", y: 2021, tmdb: "movie/4242" };
  it("trama mancante (404): 'Film del 2021.'", async () => {
    serve({});
    expect(await loadPlot(film)).toBe("Film del 2021.");
    expect(await loadPlot({ ...film, ty: "serie", y: undefined, tmdb: "tv/4243" })).toBe("Serie.");
  });
  it("trama presente nel file del suo gruppo (id % 100)", async () => {
    const f = serve(defaultFiles());
    expect(await loadPlot({ ...film, tmdb: "movie/976893" })).toBe("Un addetto alle pulizie dei bagni pubblici di Tokyo.");
    expect(String(f.mock.calls[0][0])).toMatch(/^\/data\/trame\/93\.json\?v=/);
  });
  it("senza tmdb: la descrizione che c'è già", async () => {
    serve({});
    expect(await loadPlot({ ...film, tmdb: undefined, d: "Una descrizione." })).toBe("Una descrizione.");
  });
});

describe("cinema", () => {
  it("loadCityShows('forli') trova 'Forlì'", async () => {
    serve(defaultFiles());
    const sh = await loadCityShows("forli");
    expect(sh?.citta).toBe("Forlì");
    expect(await loadCityShows("FORLÌ ")).toEqual(SHOWS_FORLI);
  });
  it("città sconosciuta, vuota o senza file: null", async () => {
    serve(defaultFiles());
    expect(await loadCityShows("Atlantide")).toBeNull();
    expect(await loadCityShows("")).toBeNull();
    expect(await loadCityShows("Roma")).toBeNull();
  });
  it("indice assente: null", async () => {
    serve({});
    await loadPalinsesto(); // nuovo caricamento: niente indice in memoria
    expect(await loadCinemaIndex()).toBeNull();
    expect(await loadCityShows("forli")).toBeNull();
    serve(defaultFiles());
    expect(await loadCinemaIndex()).toEqual(CINEMA_INDEX);
  });
  it("filmShows e nextTimes riconoscono i titoli come l'app vecchia", () => {
    const it: Item = { t: "Parthenope", ty: "cinema", s: "cinema", m: [], w: [], g: "Drammatico" };
    expect(filmShows(it, SHOWS_FORLI).map((s) => s.n)).toEqual(["Cinema Eliseo", "Cinema Saffi"]);
    expect(nextTimes(it, SHOWS_FORLI, "20:30")).toEqual(["20:30", "21:15", "22:40"]);
    expect(filmShows({ ...it, t: "Il robot selvaggio" }, SHOWS_FORLI).map((s) => s.o)).toEqual([["16:30"]]);
    expect(filmShows(it, null)).toEqual([]);
  });
});
