// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider } from "../src/app-state";
import { Shell } from "../src/components/Shell";
import { allItems, loadCatalogs, loadCityShows, loadPalinsesto } from "../src/lib/data";
import { lucky } from "../src/lib/lucky";
import { pickNow } from "../src/lib/scoring";
import { mySrc, OD as OD_ITEMS, SRC } from "../src/lib/sources";
import { DEFAULT_STATE } from "../src/lib/state";
import type { Stasera } from "../src/lib/types";
import { defaultFiles, fixtureFetch, fixturePalinsesto, legacyLucky, loadLegacy, settle } from "./legacy/harness";

const NOW = new Date(2026, 10, 7, 21, 0); // data del palinsesto di prova, alle 21:00
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const text = (s: string) => ($(s)?.textContent ?? "").replace(/\s+/g, " ").trim();
const strip = (h: string) => h.replace(/<\/?b>/g, "");
const files = () => ({ ...defaultFiles(), "oggi.json": fixturePalinsesto() });

// I risultati attesi, calcolati con le funzioni di src/lib sugli stessi dati (prima di montare l'app,
// perché loadPalinsesto azzera lo stato dei caricatori).
async function expected(prof: Partial<Stasera>) {
  vi.stubGlobal("fetch", fixtureFetch(files()));
  const st: Stasera = { ...structuredClone(DEFAULT_STATE), ...structuredClone(prof) };
  const pal = await loadPalinsesto();
  const extra = await loadCatalogs(st);
  const shows = st.citta ? await loadCityShows(st.citta) : null;
  return { st, pal, extra, shows, list: pickNow(pal, st, shows, extra) };
}

// Monta l'app con il palinsesto di prova e lo stato `prof`, e aspetta che i cataloghi siano caricati.
async function mount(prof: Partial<Stasera> = {}) {
  vi.stubGlobal("fetch", fixtureFetch(files()));
  vi.stubGlobal("scrollTo", vi.fn());
  Element.prototype.scrollIntoView = vi.fn(); // jsdom non lo implementa
  localStorage.setItem("stasera", JSON.stringify({ ...DEFAULT_STATE, ...prof }));
  render(<AppStateProvider><Shell /></AppStateProvider>);
  await waitFor(() => expect(text("#cat-count")).toMatch(/Catalogo streaming/));
}
const scrollIntoViewOrig = Element.prototype.scrollIntoView;
const click = async (s: string) => { await act(async () => { fireEvent.click($(s)!); }); };

// L'ora del dispositivo è quella del palinsesto di prova (solo Date: i timer restano veri).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  // Math.random costante: la varietà (varia) aggiunge lo stesso rumore a tutti e l'ordine resta quello di pickNow.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = scrollIntoViewOrig;
  localStorage.clear();
});

// Come mount(), ma oggi.json arriva solo quando il test chiama release(): i gesti toccati prima
// devono aspettare il palinsesto, non usare i 3 titoli predefiniti (OD) dell'app vecchia.
const OD = OD_ITEMS.map((x) => x.t);
async function mountSlow(prof: Partial<Stasera> = {}) {
  const base = fixtureFetch(files());
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  vi.stubGlobal("fetch", (url: string) => (/oggi\.json/.test(String(url)) ? gate.then(() => base(url)) : base(url)));
  vi.stubGlobal("scrollTo", vi.fn());
  localStorage.setItem("stasera", JSON.stringify({ ...DEFAULT_STATE, ...prof }));
  render(<AppStateProvider><Shell /></AppStateProvider>);
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return async () => {
    await act(async () => { release(); });
    await waitFor(() => expect(text("#cat-count")).toMatch(/Catalogo streaming/));
  };
}

// L'app vecchia aveva il palinsesto già con la pagina, ma i cataloghi streaming arrivavano dopo:
// un tocco anticipato dava la proposta calcolata sul palinsesto senza cataloghi. È quella attesa qui.
describe("tocco prima che arrivi il palinsesto", () => {
  it("Accendi aspetta oggi.json e propone il titolo dell'app vecchia toccata subito", async () => {
    const w = loadLegacy(fixturePalinsesto(), {}, { files: files(), now: NOW });
    w.pickNow(); // prima che arrivino i cataloghi
    const legacy = w.eval("list")[0].it.t as string;
    await settle();
    const { st, pal, shows } = await expected({});
    expect(pickNow(pal, st, shows, [])[0].it.t).toBe(legacy);
    expect(OD).not.toContain(legacy);
    const release = await mountSlow();
    expect(text("#guide")).toBe(""); // niente NO SEGNALE mentre il palinsesto non c'è
    await click("#go");
    await release();
    await waitFor(() => expect(text("#res .title")).toBe(legacy));
    expect($("#ask")!.className).toBe("hide");
    expect(text("#guide")).not.toBe("");
  });

  it("🍀 aspetta oggi.json e sceglie come l'app vecchia toccata subito", async () => {
    const w = loadLegacy(fixturePalinsesto(), {}, { files: files(), now: NOW, random: () => 0.4 });
    const legacy = legacyLucky(w)!; // prima che arrivino i cataloghi
    await settle();
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const { st, pal } = await expected({});
    const pick = lucky(allItems(pal, []), st, { now: new Date(), palDate: pal.data, skip: new Set(), random: () => 0.4 });
    expect(pick!.it.t).toBe(legacy.it.t);
    expect(OD).not.toContain(pick!.it.t);
    const release = await mountSlow();
    await click("#lucky");
    await release();
    await waitFor(() => expect(text("#res .title")).toBe(pick!.it.t));
    expect(text("#res .kind")).toMatch(/^🍀 Scelto per te · /);
  });
});

describe("Accendi e scegli per me", () => {
  it("mostra il primo titolo di pickNow con i suoi why; zap passa al secondo", async () => {
    const { list } = await expected({});
    await mount();
    expect($("#res")!.className).toBe("hide");
    await click("#go");
    expect($("#ask")!.className).toBe("hide");
    expect(text("#res .title")).toBe(list[0].it.t);
    expect(text("#res .why")).toBe("Te lo propongo perché " + strip(list[0].why.slice(0, 3).join(", ")) + ".");
    await click("#other");
    expect(text("#res .title")).toBe(list[1].it.t);
    expect($("#res .tv")!.className).toBe("tv zap");
    await click("#bk");
    expect($("#ask")!.className).toBe("");
    expect($("#res")!.className).toBe("hide");
  });

  it("👎 dopo 450 ms riparte da capo con candidates() aggiornato", async () => {
    const { list } = await expected({});
    await mount();
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    vi.setSystemTime(NOW);
    await click("#go");
    await click("#other");
    const second = list[1].it;
    expect(text("#res .title")).toBe(second.t);
    await click("#no");
    expect(text("#toast")).toBe("Ok, meno " + second.g.toLowerCase() + " d'ora in poi");
    await act(async () => { vi.advanceTimersByTime(449); });
    expect(text("#res .title")).toBe(second.t);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(text("#res .title")).toBe(list[0].it.t);
    expect($("#res .tv")!.className).toBe("tv zap");
  });

  it("senza candidati compare NO SEGNALE con lo stesso testo di oggi", async () => {
    const prof = { tipo: "show", gen: ["horror"] };
    expect((await expected(prof)).list).toEqual([]);
    await mount(prof);
    await click("#go");
    expect(text("#res .empty")).toBe(
      "NO SEGNALENessun titolo corrisponde alle tue risposte.Togli qualche genere, scegli “Sorprendimi” o disattiva “Solo cose gratis”.",
    );
    expect(text("#bk")).toBe("‹ Cambia risposte");
  });

  it("al cinema con una città senza orari: nessun errore, i film in sala", async () => {
    const prof = { tipo: "cinema", citta: "Milano" };
    const { list, shows } = await expected(prof);
    expect(shows).toBeNull();
    expect(list.length).toBeGreaterThan(1);
    expect(list.every((x) => x.it.ty === "cinema")).toBe(true);
    await mount(prof);
    expect($("#q-citta")!.className).toBe("q");
    expect(($("#citta") as HTMLInputElement).value).toBe("Milano");
    await click("#go");
    expect(text("#res .title")).toBe(list[0].it.t);
    expect(text("#res .osd")).toBe("AL CINEMAMilanoIN SALA");
    expect(text("#res a.orari")).toBe("🎟️ Cerca orari a Milano");
    expect(text("#res .more-h")).toBe("Altri film in sala");
    expect([...document.querySelectorAll("#res .mini")].map((b) => (b as HTMLElement).dataset.t)).toEqual(list.slice(1).map((x) => x.it.t));
  });

  it("al cinema a Forlì mostra sale e orari, gli orari passati in grigio", async () => {
    await mount({ tipo: "cinema", citta: "forli", tempo: "999" });
    await click("#go");
    if (text("#res .title") !== "Parthenope") await click('#res .mini[data-t="Parthenope"]');
    expect(text("#res .title")).toBe("Parthenope");
    expect(text("#res .sale h3")).toBe("Oggi a Forlì");
    expect([...document.querySelectorAll("#res .ore span")].map((s) => [s.textContent, s.className])).toEqual([
      ["18:00", "passato"], ["21:15", ""], ["20:30", "passato"], ["22:40", ""],
    ]);
  });
});

describe("Mi sento fortunato", () => {
  it("👎 propone subito un'altra proposta e non ripropone quelle scartate", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    await mount();
    await click("#lucky");
    const first = text("#res .title");
    expect(first).not.toBe("");
    expect(text("#res .kind")).toMatch(/^🍀 Scelto per te · /);
    expect(text("#bk")).toBe("‹ Indietro");
    expect(text("#other")).toBe("🍿 Ok, si guarda!");
    expect($("#res .strip")).toBeNull();
    await click("#no");
    expect(text("#toast")).toMatch(/^Ok, meno .* d'ora in poi$/);
    expect(text("#res .title")).toBe(first); // la nuova proposta arriva dopo 450 ms, come oggi
    await waitFor(() => expect(text("#res .title")).not.toBe(first), { timeout: 2000 });
    const second = text("#res .title");
    expect(JSON.parse(localStorage.getItem("stasera")!).disliked).toEqual([first]);
    await click("#again");
    const third = text("#res .title");
    expect([first, second]).not.toContain(third);
  });

  it("la proposta è quella di lucky() con la stessa scelta casuale", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const { st, pal, extra } = await expected({});
    const pick = lucky(allItems(pal, extra), st, { now: new Date(), palDate: pal.data, skip: new Set(), random: () => 0.4 });
    await mount();
    await click("#lucky");
    expect(text("#res .title")).toBe(pick!.it.t);
    expect(text("#res .why")).toBe("L'ho scelto perché " + strip(pick!.why.slice(0, 3).join(", ")) + ".");
  });
});

describe("Condividi", () => {
  it("usa navigator.share con lo stesso testo di oggi", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("open", vi.fn());
    const { list, st } = await expected({});
    await mount();
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      await click("#go");
      await click("#a-share");
      const it = list[0].it, n = SRC[mySrc(it, st)[0]].n;
      const dove = it.time ? `stasera alle ${it.time} su ${n}` : `su ${n}`;
      expect(share).toHaveBeenCalledWith({ title: "Popcorno", text: `Stasera guardiamo «${it.t}» ${dove}? 🍿`, url: location.origin + location.pathname });
      expect(window.open).not.toHaveBeenCalled();
    } finally {
      delete (navigator as any).share;
    }
  });

  it("senza navigator.share apre wa.me", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    await mount({ tipo: "cinema", citta: "Milano" });
    await click("#go");
    await click("#a-share");
    const t = text("#res .title");
    expect(open).toHaveBeenCalledWith(
      "https://wa.me/?text=" + encodeURIComponent(`Stasera guardiamo «${t}» al cinema a Milano? 🍿\n` + location.origin + location.pathname), "_blank",
    );
  });
});

describe("Da vedere, serie, riprendi", () => {
  it("Da vedere e La seguo aggiornano lo stato e la scheda", async () => {
    await mount({ tipo: "serie" });
    await click("#go");
    const t = text("#res .title");
    await click("#a-watch");
    expect(text("#toast")).toBe("Aggiunto a Da vedere 🔖");
    expect(text("#a-watch")).toBe("🔖 Nella lista");
    await click("#a-serie");
    expect(text("#toast")).toBe("Segnata: riparti dalla stagione 1, episodio 1. Cambiala nel Profilo");
    expect(text("#a-serie")).toBe("📺 S1 E1");
    const saved = JSON.parse(localStorage.getItem("stasera")!);
    expect(saved.watch.map((w: any) => w.t)).toEqual([t]);
    expect(saved.serie.map((w: any) => [w.t, w.s, w.e])).toEqual([[t, 1, 1]]);
    await click("#a-watch");
    expect(text("#toast")).toBe("Tolto dalla lista");
    await click("#a-serie");
    expect($("#v-prof")!.className).toBe("");
  });

  it("Riprendi apre la serie che stai seguendo come proposta", async () => {
    await mount({ serie: [{ t: "Breaking Bad", tmdb: "tv/1396", s: 2, e: 3 }] });
    expect(text("#resume")).toBe("📺Riprendi Breaking BadNetflixS2 E3");
    await click("#resume button");
    expect(text("#res .title")).toBe("Breaking Bad");
    expect(text("#res .why")).toMatch(/^Te lo propongo perché l'hai cercato tu/);
  });
});

describe("domande", () => {
  it("Da dove?: subito dopo Che genere?, Ovunque acceso all'inizio, le aree si accendono e spengono e si salvano", async () => {
    await mount();
    const row = $('[data-k="aree"]')!.closest(".q")!;
    expect(row.previousElementSibling!.querySelector("h3")!.textContent).toBe("Che genere? se non scegli, vanno bene tutti");
    expect(row.querySelector("h3")!.innerHTML).toBe("Da dove? <span>se non scegli, va bene ovunque</span>");
    const pills = () => [...row.querySelectorAll("button")].map((b) => [b.textContent, b.className, b.getAttribute("aria-pressed")]);
    expect(pills()).toEqual([
      ["🌐 Ovunque", "chip on", "true"], ["🍝 Italia", "chip", "false"], ["🏰 Europa", "chip", "false"],
      ["🗽 USA e Regno Unito", "chip", "false"], ["🌎 America Latina", "chip", "false"], ["🌏 Asia", "chip", "false"],
      ["🌍 Resto del mondo", "chip", "false"],
    ]);
    const saved = () => JSON.parse(localStorage.getItem("stasera")!).aree;
    await click('[data-k="aree"] [data-v="asia"]');
    expect(pills()[0][1]).toBe("chip");
    expect(pills()[5][1]).toBe("chip on");
    expect(saved()).toEqual(["asia"]);
    await click('[data-k="aree"] [data-v="italia"]');
    expect(saved()).toEqual(["asia", "italia"]);
    await click('[data-k="aree"] [data-v="italia"]');
    await click('[data-k="aree"] [data-v="asia"]');
    expect(pills()[0][1]).toBe("chip on");
    expect(pills()[5][1]).toBe("chip");
    expect(saved()).toEqual([]);
    await click('[data-k="aree"] [data-v="europa"]');
    await click('[data-k="aree"] [data-v="mondo"]');
    expect(saved()).toEqual(["europa", "mondo"]);
    await click('[data-k="aree"] [data-v="ovunque"]');
    expect(saved()).toEqual([]);
    expect(pills().filter((p) => p[1] === "chip on").map((p) => p[0])).toEqual(["🌐 Ovunque"]);
  });

  it("Da dove? si vede per tutto/film/serie/cinema, sparisce per sport e show senza toccare le aree", async () => {
    await mount({ aree: ["asia"] });
    for (const tipo of ["tutto", "film", "serie", "cinema"]) {
      await click(`[data-k="tipo"] [data-v="${tipo}"]`);
      expect($('[data-k="aree"]'), tipo).not.toBeNull();
    }
    for (const tipo of ["sport", "show"]) {
      await click(`[data-k="tipo"] [data-v="${tipo}"]`);
      expect($('[data-k="aree"]'), tipo).toBeNull();
      expect(JSON.parse(localStorage.getItem("stasera")!).aree).toEqual(["asia"]);
    }
    await click('[data-k="tipo"] [data-v="film"]');
    expect($('[data-k="aree"] [data-v="asia"]')!.className).toBe("chip on");
  });

  it("con un'area scelta, Accendi propone solo titoli di quell'area (o senza lingua)", async () => {
    const { list } = await expected({ aree: ["italia"] });
    await mount({ aree: ["italia"] });
    expect($('[data-k="aree"] [data-v="italia"]')!.className).toBe("chip on");
    await click("#go");
    expect(text("#res .title")).toBe(list[0].it.t);
    expect(["it", undefined, ""]).toContain(list[0].it.l);
  });

  it("le scelte si salvano; umore non resta mai vuoto, genere sì; il cinema mostra la città", async () => {
    await mount();
    await click('[data-k="umore"] [data-v="relax"]');
    expect($('[data-k="umore"] [data-v="relax"]')!.getAttribute("aria-pressed")).toBe("true");
    await click('[data-k="gen"] [data-v="horror"]');
    await click('[data-k="gen"] [data-v="horror"]');
    await click('[data-k="tipo"] [data-v="cinema"]');
    await click("#sw-free");
    const saved = JSON.parse(localStorage.getItem("stasera")!);
    expect(saved).toMatchObject({ umore: ["relax"], gen: [], tipo: "cinema", free: true });
    expect($("#q-citta")!.className).toBe("q");
    expect($(".toggle")!.className).toBe("toggle hide");
    const c = $("#citta") as HTMLInputElement;
    c.value = "  Roma ";
    await act(async () => { c.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(JSON.parse(localStorage.getItem("stasera")!).citta).toBe("Roma");
  });
});

// Ruling R5: per un titolo fisso, stesso testo visibile e stessi controlli di #res dell'app vecchia.
const controls = (root: Element) =>
  [...root.querySelectorAll("button, a")].map((e) => [e.tagName, e.id, e.getAttribute("aria-label") || "", e.getAttribute("href") || "", (e.textContent || "").replace(/\s+/g, "")]);
const classes = (root: Element) => [...root.querySelectorAll("*")].flatMap((e) => [...e.classList]).sort();
// L'app vecchia non ha "L'ho visto" (#a-seen): è un tasto nuovo, quindi la parità si confronta senza.
const snap = (root0: Element) => {
  const root = root0.cloneNode(true) as Element;
  root.querySelector("#a-seen")?.remove();
  return { text: (root.textContent || "").replace(/\s+/g, ""), controls: controls(root), classes: classes(root) };
};

const CASES: [string, Partial<Stasera>, (d: Document) => void][] = [
  ["predefinito, prima proposta", {}, (d) => d.querySelector<HTMLElement>("#go")!.click()],
  ["predefinito, dopo due zap", {}, (d) => { d.querySelector<HTMLElement>("#go")!.click(); }],
  ["serie seguite e Da vedere", { tipo: "serie", watch: [{ t: "Breaking Bad", tmdb: "tv/1396" }], serie: [{ t: "Breaking Bad", tmdb: "tv/1396", s: 2, e: 3 }], subs: ["netflix", "prime", "disney", "dazn", "mubi"] }, (d) => d.querySelector<HTMLElement>("#go")!.click()],
  ["d'essai", { tipo: "film", gen: ["essai"], subs: ["netflix", "prime", "disney", "dazn", "mubi"] }, (d) => d.querySelector<HTMLElement>("#go")!.click()],
  ["cinema a Forlì", { tipo: "cinema", citta: "forli" }, (d) => d.querySelector<HTMLElement>("#go")!.click()],
  ["cinema senza città", { tipo: "cinema" }, (d) => d.querySelector<HTMLElement>("#go")!.click()],
  ["nessun risultato", { tipo: "show", gen: ["horror"] }, (d) => d.querySelector<HTMLElement>("#go")!.click()],
  ["Mi sento fortunato", {}, (d) => d.querySelector<HTMLElement>("#lucky")!.click()],
  ["Riprendi", { serie: [{ t: "Breaking Bad", tmdb: "tv/1396", s: 2, e: 3 }] }, (d) => d.querySelector<HTMLElement>("#resume button")!.click()],
];

describe.each(CASES)("parità di #res con l'app vecchia: %s", (name, prof, start) => {
  it("stesso testo visibile, stessi controlli, stesse classi", async () => {
    const zaps = name.includes("zap") ? 2 : 0;
    const w = loadLegacy(fixturePalinsesto(), { ...DEFAULT_STATE, ...prof }, { files: defaultFiles(), now: NOW, random: () => 0.3 });
    await settle();
    start(w.document);
    await settle();
    for (let i = 0; i < zaps; i++) { w.document.querySelector("#other").click(); await settle(); }
    const old = snap(w.document.querySelector("#res"));
    const oldResume = (w.document.querySelector("#resume").textContent || "").replace(/\s+/g, "");

    vi.spyOn(Math, "random").mockReturnValue(0.3);
    await mount(prof);
    expect(($("#resume")!.textContent || "").replace(/\s+/g, "")).toBe(oldResume);
    await act(async () => { start(document); });
    for (let i = 0; i < zaps; i++) await click("#other");
    await waitFor(() => expect(snap($("#res")!)).toEqual(old));
  });
});

describe("L'ho visto e storico", () => {
  it("il tasto L'ho visto segna e toglie il titolo da seen", async () => {
    await mount({ tipo: "serie" });
    await click("#go");
    const t = text("#res .title");
    expect(text("#a-seen")).toBe("👁 L'ho visto");
    expect($("#a-seen")!.className).toBe("act");
    await click("#a-seen");
    expect(text("#toast")).toBe("Segnato come visto");
    expect(text("#a-seen")).toBe("✔ Visto");
    expect($("#a-seen")!.className).toBe("act on");
    expect(JSON.parse(localStorage.getItem("stasera")!).seen).toEqual([t]);
    await click("#a-seen");
    expect(text("#toast")).toBe("Tolto dai visti");
    expect(text("#a-seen")).toBe("👁 L'ho visto");
    expect(JSON.parse(localStorage.getItem("stasera")!).seen).toEqual([]);
    expect(localStorage.getItem("popcorno-eventi")).toBeNull(); // senza account niente coda
  });

  it("il tasto non c'è per lo sport", async () => {
    await mount({ tipo: "sport", team: "Nessuna" });
    await click("#go");
    expect(text("#res .title")).not.toBe("");
    expect(text("#res .kind")).toMatch(/Sport/i);
    expect($("#a-seen")).toBeNull();
  });

  it("con account, 👍 registra like", async () => {
    const inserted: any[][] = [];
    const none = { data: null, error: null, status: 200 };
    const client = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: (cb: (ev: string, s: unknown) => void) => {
          queueMicrotask(() => cb("INITIAL_SESSION", { user: { id: "u1", email: "a@b.it" } }));
          return { data: { subscription: { unsubscribe() {} } } };
        },
      },
      from: (table: string) => table === "events"
        ? { insert: async (rows: any[]) => { inserted.push(rows); return { error: null }; } }
        : {
            select: () => ({ eq: () => ({ maybeSingle: async () => (table === "profiles" ? { data: { track_events: true }, error: null } : none) }) }),
            upsert: async () => ({ error: null, status: 201 }),
          },
    };
    const { setClientForTests, SESSION_KEY } = await import("../src/lib/account");
    setClientForTests(client);
    try {
      localStorage.setItem(SESSION_KEY, "{}");
      await mount({ tipo: "serie" });
      await click("#go");
      const t = text("#res .title");
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      await click("#yes");
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      const rows = inserted.flat();
      expect(rows.map((r) => r.kind)).toContain("like");
      expect(rows.find((r) => r.kind === "like").title).toBe(t);
      expect(rows.find((r) => r.kind === "like").title_ref).toMatch(new RegExp("^(tv/|serie:)"));
    } finally { setClientForTests(null); }
  });
});
