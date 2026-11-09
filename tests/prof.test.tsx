// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider } from "../src/app-state";
import { Shell } from "../src/components/Shell";
import { profileLink } from "../src/lib/profile-link";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Stasera } from "../src/lib/types";
import { defaultFiles, fixtureFetch, fixturePalinsesto, loadLegacy, settle } from "./legacy/harness";

const NOW = new Date(2026, 10, 7, 21, 0);
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const files = () => ({ ...defaultFiles(), "oggi.json": fixturePalinsesto() });
const stored = () => JSON.parse(localStorage.getItem("stasera")!);

async function mount(prof: Partial<Stasera> = {}) {
  vi.stubGlobal("fetch", fixtureFetch(files()));
  vi.stubGlobal("scrollTo", vi.fn());
  localStorage.setItem("stasera", JSON.stringify({ ...DEFAULT_STATE, ...prof }));
  render(<AppStateProvider><Shell /></AppStateProvider>);
  await waitFor(() => expect($("#gtitle")?.textContent).toMatch(/^Guida di .+/));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };

// Testo visibile e controlli di #v-prof: ogni controllo con id, aria-label, stato e valore.
// L'app vecchia non ha "La mia lista" (#mia-lista): è una sezione nuova, quindi la parità si confronta senza.
function snapshot(root: Element) {
  const controls = [...root.querySelectorAll("button, input, select, a")].filter((c) => !c.closest("#mia-lista")).map((c: any) => [
    c.tagName, c.id, c.getAttribute("aria-label"), c.getAttribute("aria-pressed"), c.classList.contains("on"), c.getAttribute("href"),
    c.tagName === "SELECT" ? c.value : c.tagName === "INPUT" && c.id !== "sync-out" ? c.value : null,
    flat(c.textContent),
  ]);
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll("#sync-out, datalist, #mia-lista").forEach((e) => e.remove());
  return { text: flat(clone.textContent), controls, options: [...root.querySelectorAll("#team option")].map((o) => o.textContent) };
}
const legacyProf = async (prof: object) => {
  const w = loadLegacy(fixturePalinsesto(), { ...DEFAULT_STATE, ...prof }, { files: files(), now: NOW });
  await settle();
  w.eval("renderProf()");
  return snapshot(w.document.querySelector("#v-prof")!);
};

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

const STATES: [string, Partial<Stasera>][] = [
  ["predefinito", {}],
  ["con gusti, serie, squadra e città", {
    subs: ["netflix", "mubi"], team: "Inter", citta: "Forlì",
    likes: { Thriller: 3, Commedia: 1 }, liked: ["a", "b", "c"], disliked: ["x"],
    serie: [{ t: "Dark", tmdb: "tv/1", s: 2, e: 5 }, { t: "Fargo", tmdb: "tv/2", s: 1, e: 1 }],
  }],
  ["senza abbonamenti né gradimenti", { subs: [], likes: { Horror: 0 } }],
];

describe("parità del Profilo con l'app vecchia", () => {
  for (const [nome, prof] of STATES) {
    it(`stesso testo e stessi controlli: ${nome}`, async () => {
      const legacy = await legacyProf(prof);
      await mount(prof);
      expect(snapshot($("#v-prof")!)).toEqual(legacy);
    });
  }
});

describe("azioni del Profilo", () => {
  it("cambiare un abbonamento aggiorna localStorage", async () => {
    await mount();
    await click($('#subs .chip[data-k="netflix"]')!);
    expect(stored().subs).toEqual(["prime", "disney", "dazn"]);
    expect($('#subs .chip[data-k="netflix"]')!.getAttribute("aria-pressed")).toBe("false");
    await click($('#subs .chip[data-k="netflix"]')!);
    expect(stored().subs).toEqual(["prime", "disney", "dazn", "netflix"]);
  });

  it("la squadra si salva e dà il toast", async () => {
    await mount();
    await act(async () => { fireEvent.change($("#team")!, { target: { value: "Milan" } }); });
    expect(stored().team).toBe("Milan");
    expect($("#toast")!.textContent).toBe("Forza Milan!");
    await act(async () => { fireEvent.change($("#team")!, { target: { value: "Nessuna" } }); });
    expect($("#toast")!.textContent).toBe("Squadra rimossa");
  });

  it("la città si salva a 'change', con il toast, e segue lo stato", async () => {
    await mount();
    const c = $("#citta2") as HTMLInputElement;
    await act(async () => { c.value = "  Forlì "; fireEvent.change(c); });
    expect(stored().citta).toBe("Forlì");
    expect($("#toast")!.textContent).toBe("Città: Forlì");
    expect(($("#citta") as HTMLInputElement).value).toBe("Forlì");
    await act(async () => { c.value = ""; fireEvent.change(c); });
    expect(stored().citta).toBe("");
    expect($("#toast")!.textContent).toBe("Città rimossa");
  });

  it("i pulsanti delle serie come oggi", async () => {
    await mount({ serie: [{ t: "Dark", tmdb: "tv/1", s: 2, e: 5 }, { t: "Fargo", tmdb: "tv/2", s: 1, e: 1 }] });
    const b = (n: number, label: string) => document.querySelectorAll("#serie-box .ep")[n].querySelector(`[aria-label="${label}"]`)!;
    await click(b(0, "Episodio successivo"));
    expect(stored().serie[0]).toMatchObject({ s: 2, e: 6 });
    await click(b(1, "Episodio precedente"));
    expect(stored().serie[1]).toMatchObject({ s: 1, e: 1 });
    await click(b(0, "Stagione successiva"));
    expect(stored().serie[0]).toMatchObject({ s: 3, e: 1 });
    await click(b(0, "Smetti di seguirla"));
    expect(stored().serie.map((x: any) => x.t)).toEqual(["Fargo"]);
    expect($("#serie-box")!.textContent).not.toContain("Dark");
    await click(b(0, "Smetti di seguirla"));
    expect($("#serie-box")!.textContent).toBe("Nessuna serie. Tocca “📺 La seguo” sotto una serie.");
  });

  it("'Copia' copia esattamente il link del profilo e lo mostra", async () => {
    await mount({ team: "Inter", citta: "Forlì" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
    expect($("#sync-out")!.classList.contains("hide")).toBe(true);
    await click($("#sync")!);
    const expected = profileLink(stored(), location.origin + "/");
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(($("#sync-out") as HTMLInputElement).value).toBe(expected);
    expect($("#sync-out")!.classList.contains("hide")).toBe(false);
    expect($("#toast")!.textContent).toBe("Link copiato: aprilo sull'altro dispositivo");
  });

  it("se la clipboard non c'è, mostra il link e dice di tenerlo premuto", async () => {
    await mount();
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } }));
    await click($("#sync")!);
    expect($("#toast")!.textContent).toBe("Tieni premuto il link per copiarlo");
    expect(($("#sync-out") as HTMLInputElement).value).toContain("#profilo=");
  });
});
