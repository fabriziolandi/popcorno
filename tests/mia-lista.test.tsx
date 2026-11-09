// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider } from "../src/app-state";
import { Shell } from "../src/components/Shell";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Stasera } from "../src/lib/types";
import { defaultFiles, fixtureFetch, fixturePalinsesto } from "./legacy/harness";

const NOW = new Date(2026, 10, 7, 21, 0);
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const $$ = (s: string) => [...document.querySelectorAll(s)] as HTMLElement[];
const stored = () => JSON.parse(localStorage.getItem("stasera")!);
const files = () => ({ ...defaultFiles(), "oggi.json": fixturePalinsesto() });
let fetchSpy: ReturnType<typeof vi.fn>;

async function mount(prof: Partial<Stasera> = {}) {
  const base = fixtureFetch(files());
  fetchSpy = vi.fn((url: string) => base(url));
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("scrollTo", vi.fn());
  localStorage.setItem("stasera", JSON.stringify({ ...DEFAULT_STATE, ...prof }));
  render(<AppStateProvider><Shell /></AppStateProvider>);
  await waitFor(() => expect($("#gtitle")?.textContent).toMatch(/^Guida di .+/));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  // Si parte dal Profilo, come chi apre la lista.
  await act(async () => { fireEvent.click($('nav button[data-v="prof"]')!); });
  expect($("#v-prof")!.classList.contains("hide")).toBe(false);
}
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const tab = (id: string) => $("#lista-tab-" + id)!;
const titles = () => $$("#mia-lista .lista-t").map((b) => b.textContent);
const card = (t: string) => $$("#mia-lista .lista-card").find((c) => c.querySelector(".lista-t")!.textContent === t)!;
const button = (root: Element, label: string) => [...root.querySelectorAll("button")].find((b) => b.textContent === label)!;

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

const LISTA: Partial<Stasera> = {
  watch: [{ t: "Sleepers", tmdb: "movie/819" }, { t: "Titolo sparito" }],
  seen: ["Affari tuoi", "Sleepers", "El lodo"],
  liked: ["El lodo"],
};

describe("La mia lista nel Profilo", () => {
  it("sta subito prima delle serie", async () => {
    await mount();
    expect($("#mia-lista")!.nextElementSibling!.id).toBe("serie-list");
    expect($("#mia-lista h3")!.textContent).toBe("La mia lista");
  });

  it("le tre schede mostrano i conteggi, cambiano contenuto e la scelta si ricorda", async () => {
    await mount(LISTA);
    expect(tab("watch").textContent).toBe("🔖 Da vedere (2)");
    expect(tab("seen").textContent).toBe("👁 Visti (3)");
    expect(tab("liked").textContent).toBe("👍 Piaciuti (1)");
    expect(tab("watch").getAttribute("aria-selected")).toBe("true");
    expect(tab("watch").getAttribute("role")).toBe("tab");
    // più recenti per primi
    expect(titles()).toEqual(["Titolo sparito", "Sleepers"]);
    await click(tab("seen"));
    expect(tab("seen").getAttribute("aria-selected")).toBe("true");
    expect(tab("watch").getAttribute("aria-selected")).toBe("false");
    expect(titles()).toEqual(["El lodo", "Sleepers", "Affari tuoi"]);
    expect($("#mia-lista .lista-acts")).toBeNull();
    await click(tab("liked"));
    expect(titles()).toEqual(["El lodo"]);
    expect(localStorage.getItem("popcorno-lista-tab")).toBe("liked");
    cleanup();
    await mount(LISTA);
    expect(tab("liked").getAttribute("aria-selected")).toBe("true");
    expect(titles()).toEqual(["El lodo"]);
  });

  it("un titolo trovato mostra locandina e genere, e toccandolo si apre la proposta", async () => {
    await mount(LISTA);
    const c = card("Sleepers");
    expect(c.querySelector<HTMLElement>(".lista-poster")!.style.background).toContain("image.tmdb.org/t/p/w342/2P2DrNkSZArdhuUcy9ClGODb7fu.jpg");
    expect(c.querySelector(".lista-e")).toBeNull();
    expect(c.querySelector(".lista-g")!.textContent).toBe("Crime");
    await click(c.querySelector("button.lista-open")!);
    await waitFor(() => expect($("#v-scegli")!.classList.contains("hide")).toBe(false));
    expect($("#v-prof")!.classList.contains("hide")).toBe(true);
    expect($("#res .title")!.textContent).toBe("Sleepers");
  });

  it("un titolo senza locandina mostra la sua emoji sul gradiente", async () => {
    await mount({ seen: ["Affari tuoi"] });
    await click(tab("seen"));
    const c = card("Affari tuoi");
    expect(c.querySelector(".lista-e")!.textContent).toBe("🎤");
    expect(c.querySelector<HTMLElement>(".lista-poster")!.style.background).toContain("linear-gradient");
  });

  it("un titolo non trovato mostra 🎬 e il titolo, e toccandolo non succede nulla", async () => {
    await mount(LISTA);
    const c = card("Titolo sparito");
    expect(c.querySelector(".lista-e")!.textContent).toBe("🎬");
    expect(c.querySelector(".lista-g")).toBeNull();
    expect(c.querySelector("button.lista-open")).toBeNull();
    await click(c.querySelector(".lista-open")!);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect($("#v-prof")!.classList.contains("hide")).toBe(false);
    expect($("#v-scegli")!.classList.contains("hide")).toBe(true);
  });

  it("✔ Visto sposta da Da vedere a Visti, con il toast", async () => {
    await mount({ watch: [{ t: "Sleepers", tmdb: "movie/819" }, { t: "El lodo", tmdb: "movie/808969" }], seen: [] });
    await click(button(card("El lodo"), "✔ Visto"));
    expect(stored().watch).toEqual([{ t: "Sleepers", tmdb: "movie/819" }]);
    expect(stored().seen).toEqual(["El lodo"]);
    expect($("#toast")!.textContent).toBe("Segnato come visto");
    expect(tab("seen").textContent).toBe("👁 Visti (1)");
    // già nei visti: non si ripete
    await click(button(card("Sleepers"), "✔ Visto"));
    expect(stored().seen).toEqual(["El lodo", "Sleepers"]);
  });

  it("✔ Visto non duplica un titolo già visto, e funziona anche se il titolo non si trova", async () => {
    await mount({ watch: [{ t: "Titolo sparito" }], seen: ["Titolo sparito"] });
    await click(button(card("Titolo sparito"), "✔ Visto"));
    expect(stored().watch).toEqual([]);
    expect(stored().seen).toEqual(["Titolo sparito"]);
  });

  it("✕ Togli lo toglie dalla lista, con il toast", async () => {
    await mount(LISTA);
    await click(button(card("Titolo sparito"), "✕ Togli"));
    expect(stored().watch).toEqual([{ t: "Sleepers", tmdb: "movie/819" }]);
    expect($("#toast")!.textContent).toBe("Tolto dalla lista");
    await click(button(card("Sleepers"), "✕ Togli"));
    expect(stored().watch).toEqual([]);
    expect(stored().seen).toEqual(LISTA.seen);
  });

  it("liste vuote: i tre testi", async () => {
    await mount({ watch: [], seen: [], liked: [] });
    const empty = () => $("#mia-lista .lista-empty")!.textContent;
    expect(empty()).toBe("Niente in lista. Tocca “🔖 Da vedere” sotto una proposta.");
    await click(tab("seen"));
    expect(empty()).toBe("Nessun titolo visto. Tocca “👁 L'ho visto” sotto una proposta.");
    await click(tab("liked"));
    expect(empty()).toBe("Nessun titolo piaciuto. Metti 👍 a quello che ti è piaciuto.");
  });

  it("oltre 12 titoli se ne vedono 12, poi Mostra tutti", async () => {
    const seen = Array.from({ length: 15 }, (_, i) => `T${i}`);
    await mount({ seen });
    await click(tab("seen"));
    expect(titles()).toEqual(seen.slice(3).reverse());
    const more = button($("#mia-lista")!, "Mostra tutti (15)");
    await click(more);
    expect(titles()).toHaveLength(15);
    expect(button($("#mia-lista")!, "Mostra tutti (15)")).toBeUndefined();
  });

  it("senza account nessuna richiesta a Supabase e nessun evento in coda", async () => {
    await mount(LISTA);
    await click(tab("seen"));
    await click(tab("watch"));
    await click(button(card("Sleepers"), "✔ Visto"));
    await click(button(card("Titolo sparito"), "✕ Togli"));
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("supabase.co"))).toBe(false);
    expect(localStorage.getItem("popcorno-eventi")).toBeNull();
  });
});
