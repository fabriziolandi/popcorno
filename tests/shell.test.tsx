// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { AppStateProvider } from "../src/app-state";
import { Shell } from "../src/components/Shell";
import { Why } from "../src/components/Why";
import { profileLink } from "../src/lib/profile-link";
import { DEFAULT_STATE } from "../src/lib/state";

const legacy = readFileSync("tests/legacy/index.legacy.html", "utf8");
const app = () => (
  <AppStateProvider>
    <Shell />
  </AppStateProvider>
);

// I caricatori dei dati leggono /data/…: nei test rispondono 404 (palinsesto vuoto, nessun catalogo).
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
  localStorage.clear();
  history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const navOf = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.querySelector("nav")!;
};

describe("rendering lato server", () => {
  it("contiene la barra con i tre pulsanti identici alla vecchia e l'orologio vuoto", () => {
    const html = renderToString(app());
    const nuova = navOf(html), vecchia = navOf(/<nav[\s\S]*<\/nav>/.exec(legacy)![0]);
    expect(nuova.getAttribute("aria-label")).toBe("Sezioni");
    const btn = (n: HTMLElement) =>
      [...n.querySelectorAll("button")].map((b) => ({ v: b.dataset.v, on: b.className, txt: b.textContent, svg: b.querySelector("svg")!.outerHTML }));
    expect(btn(nuova)).toEqual(btn(vecchia));
    expect(html).toMatch(/<div class="clock" id="clock"><\/div>/);
    expect(html).toContain('<section id="v-scegli">');
    expect(html).toContain('<section id="v-onda" class="hide">');
    expect(html).toContain('<section id="v-prof" class="hide">');
    expect(html).toContain('<div class="toast" id="toast" role="status"></div>');
  });

  it("logo identico alla vecchia", () => {
    const d = document.createElement("div");
    d.innerHTML = renderToString(app());
    const v = document.createElement("div");
    v.innerHTML = /<div class="logo">.*?<\/div>/.exec(legacy)![0];
    expect(d.querySelector(".logo")!.outerHTML).toBe(v.querySelector(".logo")!.outerHTML);
  });
});

describe("nel browser", () => {
  it("l'orologio mostra ora e giorno dopo il montaggio", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "setTimeout"] });
    vi.setSystemTime(new Date(2026, 10, 8, 21, 5));
    render(app());
    const c = document.getElementById("clock")!;
    expect(c.firstChild!.textContent).toBe("21:05");
    expect(c.querySelector("small")!.textContent).toBe(new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "short" }));
    act(() => { vi.setSystemTime(new Date(2026, 10, 8, 21, 6)); vi.advanceTimersByTime(30000); });
    expect(c.firstChild!.textContent).toBe("21:06");
  });

  it("la barra cambia sezione come la vecchia e torna in cima", () => {
    const scroll = vi.fn();
    vi.stubGlobal("scrollTo", scroll);
    render(app());
    fireEvent.click(screen.getByText("Guida TV"));
    expect(document.getElementById("v-scegli")!.className).toBe("hide");
    expect(document.getElementById("v-onda")!.className).toBe("");
    expect(document.getElementById("v-prof")!.className).toBe("hide");
    expect(document.querySelector("nav button.on")!.textContent).toBe("Guida TV");
    expect(scroll).toHaveBeenCalledWith({ top: 0 });
  });

  it("importa il profilo da #profilo=, mostra il toast e toglie l'hash", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    const link = profileLink({ ...DEFAULT_STATE, citta: "Forlì", team: "Inter", subs: ["mubi"] }, "http://localhost/");
    history.replaceState(null, "", "/" + link.slice(link.indexOf("#")));
    render(app());
    const saved = JSON.parse(localStorage.getItem("stasera")!);
    expect(saved).toMatchObject({ citta: "Forlì", team: "Inter", subs: ["mubi"] });
    expect(location.hash).toBe("");
    expect(location.pathname).toBe("/");
    const t = document.getElementById("toast")!;
    expect(t.className).toBe("toast");
    act(() => { vi.advanceTimersByTime(300); });
    expect(t.textContent).toBe("Profilo importato: bentornato! 🍿");
    expect(t.className).toBe("toast show");
    act(() => { vi.advanceTimersByTime(1700); });
    expect(t.className).toBe("toast");
  });

  it("con preferenze già salvate chiede prima di sostituirle: Annulla non cambia niente", () => {
    localStorage.setItem("stasera", JSON.stringify({ ...DEFAULT_STATE, citta: "Roma", team: "Roma" }));
    const link = profileLink({ ...DEFAULT_STATE, citta: "Forlì", team: "Inter" }, "http://localhost/");
    history.replaceState(null, "", "/" + link.slice(link.indexOf("#")));
    render(app());
    expect(location.hash).toBe("");
    expect(screen.getByRole("alertdialog").textContent).toContain("Vuoi sostituire il tuo profilo?");
    expect(JSON.parse(localStorage.getItem("stasera")!)).toMatchObject({ citta: "Roma", team: "Roma" });
    expect(document.activeElement!.id).toBe("po-no");
    fireEvent.click(document.getElementById("po-no")!);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(JSON.parse(localStorage.getItem("stasera")!)).toMatchObject({ citta: "Roma", team: "Roma" });
  });

  it("con preferenze già salvate: Sostituisci importa e mostra il toast", () => {
    localStorage.setItem("stasera", JSON.stringify({ ...DEFAULT_STATE, citta: "Roma" }));
    const link = profileLink({ ...DEFAULT_STATE, citta: "Forlì", team: "Inter" }, "http://localhost/");
    history.replaceState(null, "", "/" + link.slice(link.indexOf("#")));
    render(app());
    fireEvent.click(document.getElementById("po-si")!);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(JSON.parse(localStorage.getItem("stasera")!)).toMatchObject({ citta: "Forlì", team: "Inter" });
    expect(document.getElementById("toast")!.textContent).toBe("Profilo importato: bentornato! 🍿");
  });

  it("con un account sul dispositivo chiede anche se le preferenze sono quelle iniziali", () => {
    localStorage.setItem("sb-gvdarnmxnigprebwjglq-auth-token", "{}");
    const link = profileLink({ ...DEFAULT_STATE, citta: "Forlì" }, "http://localhost/");
    history.replaceState(null, "", "/" + link.slice(link.indexOf("#")));
    render(app());
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(localStorage.getItem("stasera")).toBeNull();
  });

  it("link profilo rotto: toast di errore, hash tolto, stato invariato", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    history.replaceState(null, "", "/#profilo=%%%rotto");
    render(app());
    expect(localStorage.getItem("stasera")).toBeNull();
    expect(location.hash).toBe("");
    act(() => { vi.advanceTimersByTime(300); });
    expect(document.getElementById("toast")!.textContent).toBe("Il link del profilo non è valido");
  });

  it("senza #profilo= non fa niente", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    history.replaceState(null, "", "/#altro");
    render(app());
    act(() => { vi.advanceTimersByTime(2000); });
    expect(location.hash).toBe("#altro");
    expect(document.getElementById("toast")!.textContent).toBe("");
  });
});

describe("Why", () => {
  it("interpreta solo <b>…</b>", () => {
    expect(renderToString(<Why html="gioca <b>Inter</b>" />)).toBe("gioca <b>Inter</b>");
  });
  it("tutto il resto è testo", () => {
    const { container } = render(<p><Why html={'<img src=x> e <b>★ 7.5</b>'} /></p>);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("<img src=x> e ★ 7.5");
    expect(container.querySelector("b")!.textContent).toBe("★ 7.5");
  });
});

describe("idratazione", () => {
  it("render con TZ=UTC e idratazione con TZ=Europe/Rome senza differenze", async () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const html = renderToString(app());
      process.env.TZ = "Europe/Rome";
      const root = document.createElement("div");
      root.innerHTML = html;
      document.body.appendChild(root);
      const errors: unknown[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...a) => void errors.push(a));
      await act(async () => {
        hydrateRoot(root, app(), { onRecoverableError: (e) => void errors.push(e) });
      });
      spy.mockRestore();
      expect(errors).toEqual([]);
      expect(document.getElementById("clock")!.textContent).not.toBe("");
    } finally {
      process.env.TZ = tz;
    }
  });
});
