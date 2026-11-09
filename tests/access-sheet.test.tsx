// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn((..._a: unknown[]) => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
const sendLink = vi.fn(async (_e: string) => {});
// Google porta via dalla pagina: nel test la promessa non finisce mai.
const signInWithGoogle = vi.fn(() => new Promise<void>(() => {}));
vi.mock("../src/lib/account", async (orig) => ({
  ...(await orig<typeof import("../src/lib/account")>()),
  sendLink: (e: string) => sendLink(e),
  signInWithGoogle: () => signInWithGoogle(),
}));

import { AppStateProvider } from "../src/app-state";
import { Shell } from "../src/components/Shell";

const fetchSpy = vi.fn(async (..._a: unknown[]) => new Response("", { status: 404 }));
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const dialog = () => screen.queryByRole("dialog", { name: "Accedi o registrati" });

async function mount(search = "/?account=1") {
  history.replaceState(null, "", search);
  render(<AppStateProvider><Shell /></AppStateProvider>);
  await settle();
}
// Come un tocco vero: il bottone prende il focus e poi riceve il click.
async function openFromHeader() {
  const b = $("#acc-btn")!;
  b.focus();
  await click(b);
  return b;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("scrollTo", vi.fn());
  localStorage.clear();
  sessionStorage.clear();
  for (const f of [fetchSpy, createClient, sendLink, signInWithGoogle]) f.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("senza ?account=1 e senza sessione", () => {
  it("niente icona, niente riquadro nel Profilo, nessuna richiesta a supabase.co", async () => {
    await mount("/");
    expect($("#acc-btn")).toBeNull();
    expect($("#acc-box")).toBeNull();
    expect(dialog()).toBeNull();
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("supabase.co"))).toEqual([]);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("icona e riquadro di accesso", () => {
  it("l'icona dice Accedi e il riquadro si apre solo col tocco", async () => {
    await mount();
    const b = $("#acc-btn")!;
    expect(b.getAttribute("aria-label")).toBe("Accedi");
    expect(dialog()).toBeNull();
    await openFromHeader();
    const d = dialog()!;
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.textContent).toContain("Ritrova i tuoi gusti, la tua lista e le serie che segui su tutti i tuoi dispositivi.");
    expect(d.textContent).toContain("oppure");
    expect(d.querySelector('a[href="/privacy/"]')!.textContent).toBe("Privacy");
    // il focus va al primo controllo
    expect(document.activeElement).toBe(d.querySelector("button"));
    // aprire il riquadro non crea il client
    expect(createClient).not.toHaveBeenCalled();
  });

  it("✕ chiude e il focus torna al bottone", async () => {
    await mount();
    const b = await openFromHeader();
    await click(screen.getByLabelText("Chiudi"));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it("il velo chiude", async () => {
    await mount();
    const b = await openFromHeader();
    await click(screen.getByTestId("velo"));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it("Esc chiude", async () => {
    await mount();
    const b = await openFromHeader();
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: "Escape" }); });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it("email non valida: toast e niente sendLink; invio riuscito: campo del codice nel riquadro", async () => {
    await mount();
    await openFromHeader();
    const d = dialog()!;
    const send = within(d).getByText("Entra con l'email");
    fireEvent.change(screen.getByPlaceholderText("La tua email"), { target: { value: "non-una-email" } });
    await click(send);
    expect($("#toast")!.textContent).toBe("Scrivi un indirizzo email valido");
    expect(sendLink).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("La tua email"), { target: { value: " a@b.it " } });
    await click(send);
    expect(sendLink).toHaveBeenCalledWith("a@b.it");
    expect(d.textContent).toContain("Controlla la tua email");
    const code = screen.getByLabelText("Codice di 6 cifre") as HTMLInputElement;
    expect(d.contains(code)).toBe(true);
    expect(code.maxLength).toBe(6);
    expect(within(d).getByText("Entra")).toBeTruthy();
    await click(screen.getByText("Usa un'altra email"));
    expect(screen.getByPlaceholderText("La tua email")).toBeTruthy();
  });

  it("Continua con Google nel riquadro chiama signInWithGoogle una volta sola", async () => {
    await mount();
    await openFromHeader();
    const g = dialog()!.querySelector(".g-btn")!;
    expect(g.textContent).toBe("Continua con Google");
    await click(g);
    await click(g);
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });
});

describe("riquadro dell'account in cima al Profilo", () => {
  it("senza account: titolo e i due pulsanti, prima di \"I tuoi gusti\"", async () => {
    await mount();
    const box = $("#v-prof > #acc-box")!;
    expect(box.querySelector("h3")!.textContent).toBe("Accedi per ritrovare i tuoi gusti su tutti i tuoi dispositivi");
    expect($("#v-prof")!.firstElementChild).toBe(box);
    expect([...box.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Continua con Google", "Entra con l'email"]);
    // la vecchia riga discreta non c'è più
    expect($("#v-prof")!.textContent).not.toContain("Ricorda i miei gusti");
  });

  it("Continua con Google avvia Google; con busy un secondo tocco non lo richiama", async () => {
    await mount();
    const g = $("#acc-box .g-btn")!;
    await click(g);
    await click(g);
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("Entra con l'email apre il riquadro già sul campo email", async () => {
    await mount();
    const b = screen.getAllByText("Entra con l'email").find((x) => x.closest("#acc-box"))!;
    await click(b);
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByPlaceholderText("La tua email"));
    await click(screen.getByLabelText("Chiudi"));
    expect(document.activeElement).toBe(b);
  });
});
