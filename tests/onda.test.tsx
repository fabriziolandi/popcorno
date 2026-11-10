// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider } from "../src/app-state";
import { Shell } from "../src/components/Shell";
import { norm } from "../src/components/onda/Guide";
import { mySrc, SRC } from "../src/lib/sources";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Stasera } from "../src/lib/types";
import { defaultFiles, fixtureFetch, fixturePalinsesto, loadLegacy, settle } from "./legacy/harness";

const NOW = new Date(2026, 10, 7, 21, 0); // data del palinsesto di prova, alle 21:00
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const text = (s: string, root: ParentNode = document) => ((root.querySelector(s) as HTMLElement | null)?.textContent ?? "").replace(/\s+/g, " ").trim();
// Spazi tra un blocco e l'altro (a capo e rientri del codice vecchio) non si vedono: si confronta senza spazi.
const flat = (s: string) => s.replace(/\s+/g, "");
const files = () => ({ ...defaultFiles(), "oggi.json": fixturePalinsesto() });
const PAY = ["netflix", "prime", "disney", "dazn"];

async function mount(prof: Partial<Stasera> = {}) {
  vi.stubGlobal("fetch", fixtureFetch(files()));
  vi.stubGlobal("scrollTo", vi.fn());
  localStorage.setItem("stasera", JSON.stringify({ ...DEFAULT_STATE, ...prof }));
  render(<AppStateProvider><Shell /></AppStateProvider>);
  await waitFor(() => expect(text("#gtitle")).toMatch(/^Guida di .+/));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); // cataloghi e orari
}
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const chip = (v: string) => document.querySelector(`#gfil .chip[data-v="${v}"]`) as HTMLElement;
const type = async (v: string) => { await act(async () => { fireEvent.change($("#cerca")!, { target: { value: v } }); }); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const LABELS = ["Tutto", "Film", "Serie", "Show", "Sport", "Solo gratis", "Novità streaming", "🔖 Da vedere", "D'essai", "Al cinema"];

describe("filtri", () => {
  it("stesse etichette e ordine di oggi, 'tutti' selezionato", async () => {
    const w = loadLegacy(fixturePalinsesto(), {}, { files: files(), now: NOW });
    await settle();
    w.eval("renderGuide()");
    const legacy = [...w.document.querySelectorAll("#gfil .chip")].map((b: any) => [b.dataset.v, b.textContent, b.classList.contains("on")]);
    await mount();
    const ours = [...document.querySelectorAll("#gfil .chip")].map((b) => [(b as HTMLElement).dataset.v, b.textContent, b.classList.contains("on")]);
    expect(ours).toEqual(legacy);
    expect(ours.map((o) => o[1])).toEqual(LABELS);
    expect(ours.filter((o) => o[2])).toEqual([["tutti", "Tutto", true]]);
  });
});

describe("parità del testo della guida con l'app vecchia", () => {
  const PROFILES: Record<string, Partial<Stasera>> = {
    predefinito: {},
    abbonato: { subs: [...PAY, "mubi"], watch: [{ t: "Perfect Days", tmdb: "movie/976893" }, { t: "Bluey" }], team: "Inter" },
    "cinema a Forlì": { subs: [...PAY, "mubi"], citta: "forli" },
    "cinema senza orari": { citta: "Roma" },
  };
  for (const [name, prof] of Object.entries(PROFILES)) {
    it(name, async () => {
      const w = loadLegacy(fixturePalinsesto(), prof, { files: files(), now: NOW });
      await settle();
      w.eval("renderGuide()");
      const doc = w.document;
      const legacy: Record<string, string> = { "": text("#gtitle", doc) + "|" + text("#gsub", doc) };
      for (const [v] of LABELS.map((l, i) => [["tutti", "film", "serie", "show", "sport", "gratis", "nuovo", "watch", "essai", "cinema"][i], l])) {
        (doc.querySelector(`#gfil .chip[data-v="${v}"]`) as HTMLElement).click();
        legacy[v] = text("#guide", doc);
      }
      await mount(prof);
      expect(text("#gtitle") + "|" + text("#gsub")).toBe(legacy[""]);
      for (const v of Object.keys(legacy).filter(Boolean)) {
        await click(chip(v));
        expect(chip(v).className).toBe("chip on");
        expect(flat(text("#guide")), v).toBe(flat(legacy[v]));
      }
    });
  }

  it("ricerca: stessi risultati e ordine", async () => {
    const prof = { subs: [...PAY, "mubi"] };
    const w = loadLegacy(fixturePalinsesto(), prof, { files: files(), now: NOW });
    await settle();
    const expectedFor: Record<string, string> = {};
    for (const q of ["dune", "perf", "zzzz", "è", "a"]) {
      const inp = w.document.querySelector("#cerca");
      inp.value = q;
      inp.dispatchEvent(new w.Event("input", { bubbles: true }));
      expectedFor[q] = text("#guide", w.document);
    }
    await mount(prof);
    for (const q of Object.keys(expectedFor)) {
      await type(q);
      expect(flat(text("#guide")), q).toBe(flat(expectedFor[q]));
    }
  });
});

describe("ricerca", () => {
  it("'dune' trova Dune ignorando maiuscole e accenti", async () => {
    expect(norm("DÚNE")).toBe("dune");
    await mount();
    await type("DuNe");
    expect(text("#guide")).toMatch(/Dune/);
    await type("dùne");
    expect(text("#guide")).toMatch(/Dune/);
    await type("d");
    expect(text("#guide")).not.toMatch(/^NIENTE/); // meno di 2 lettere: torna la guida del filtro
  });
  it("nessun risultato: NIENTE", async () => {
    await mount();
    await type("qqqqqq");
    expect(text("#guide .empty")).toMatch(/^NIENTENessun titolo con questo nome/);
  });
});

describe("apertura di un titolo", () => {
  it("toccando un titolo si passa a Scegli con quel titolo come risultato", async () => {
    await mount();
    await type("dune");
    const row = document.querySelector("#guide button.row")!;
    const title = text("b", row);
    await click(row);
    expect($("#v-scegli")!.className).not.toContain("hide");
    expect($("#v-onda")!.className).toBe("hide");
    expect($("#res")!.className).not.toContain("hide");
    expect(text("#res .title")).toBe(title);
    expect(text("#res")).toContain("l'hai cercato tu");
  });
  it("un titolo già visto resta nella Guida e, aperto, è il primo; non torna tra le alternative", async () => {
    await mount({ seen: ["Dune - Parte due"] });
    await type("dune");
    const row = document.querySelector("#guide button.row")!;
    expect(text("b", row)).toBe("Dune - Parte due");
    await click(row);
    expect(text("#res .title")).toBe("Dune - Parte due");
    expect(text("#res")).toContain("l'hai cercato tu");
    const alts = [...document.querySelectorAll("#res .mini")].map((b) => b.getAttribute("data-t"));
    expect(alts.length).toBeGreaterThan(0);
    expect(alts).not.toContain("Dune - Parte due");
    await click($("#other")!);
    expect(text("#res .title")).not.toBe("Dune - Parte due");
  });
  it("film in sala: imposta anche tipo cinema", async () => {
    await mount({ citta: "forli" });
    await click(chip("cinema"));
    const row = document.querySelector("#guide button.row")!;
    const title = text("b", row);
    await click(row);
    expect(text("#res .title")).toBe(title);
    expect(JSON.parse(localStorage.getItem("stasera")!).tipo).toBe("cinema");
  });
  it("Da vedere: togliere un titolo lo toglie dalla lista", async () => {
    await mount({ watch: [{ t: "Perfect Days", tmdb: "movie/976893" }] });
    await click(chip("watch"));
    expect(text("#guide")).toContain("Perfect Days");
    await click(document.querySelector("#guide .wdel")!);
    expect(text("#guide .empty")).toMatch(/^LISTA VUOTA/);
    expect(JSON.parse(localStorage.getItem("stasera")!).watch).toEqual([]);
  });
});

describe("riquadro canale (lcnBox)", () => {
  it("numero LCN con il nome, oppure il nome dell'app", async () => {
    await mount({ subs: [...PAY, "mubi"] });
    const boxes = [...document.querySelectorAll("#guide .lcn")];
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      if (b.classList.contains("app")) expect(Object.values(SRC).some((s) => !s.lcn && s.n === b.textContent)).toBe(true);
      else expect(Object.values(SRC).some((s) => b.textContent === `${s.lcn}${s.n}`)).toBe(true);
    }
    expect(boxes.some((b) => !b.classList.contains("app"))).toBe(true);
    expect(mySrc).toBeTypeOf("function");
  });
});
