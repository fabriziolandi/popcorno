// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../src/app-state";

const app = {
  user: null as User | null, toast: vi.fn(), setView: vi.fn(), st: { liked: ["x"] },
  loginOpen: false, loginOpts: {}, openLogin: vi.fn(), closeLogin: vi.fn(),
};
vi.mock("../src/app-state", () => ({ useApp: () => app }));
const signOut = vi.fn(async () => {});
vi.mock("../src/lib/account", async (orig) => ({
  ...(await orig<typeof import("../src/lib/account")>()),
  sendLink: vi.fn(),
  verifyCode: vi.fn(),
  signOut: () => signOut(),
  signInWithGoogle: vi.fn(),
}));

import { Header } from "../src/components/Header";
import { AccessSheet } from "../src/components/prof/AccessSheet";
import { Account } from "../src/components/prof/Account";

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const $ = (s: string) => document.querySelector(s) as HTMLElement | null;

beforeEach(() => {
  app.user = null;
  app.loginOpen = false;
  for (const f of [app.toast, app.setView, app.openLogin, app.closeLogin, signOut]) f.mockClear();
  localStorage.clear(); sessionStorage.clear();
  history.replaceState(null, "", "/");
});
afterEach(cleanup);

describe("icona dell'account nell'header", () => {
  it("con l'avatar mostra la foto senza referrer; il tocco apre il Profilo", async () => {
    app.user = { id: "u", email: "a@b.it", name: "Anna", avatar: "https://lh3.googleusercontent.com/a/x" };
    render(<Header />);
    const b = $("#acc-btn")!;
    expect(b.getAttribute("aria-label")).toBe("Il tuo account");
    const img = b.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/x");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    await click(b);
    expect(app.setView).toHaveBeenCalledWith("prof");
    expect(app.openLogin).not.toHaveBeenCalled();
  });

  it("senza avatar mostra l'iniziale del nome, o dell'email", () => {
    app.user = { id: "u", email: "zeta@b.it", name: "anna" };
    const r = render(<Header />);
    expect($("#acc-btn img")).toBeNull();
    expect($("#acc-btn")!.textContent).toBe("A");
    app.user = { id: "u", email: "zeta@b.it" };
    r.rerender(<Header />);
    expect($("#acc-btn")!.textContent).toBe("Z");
  });

  it("se la foto non si carica resta l'iniziale", async () => {
    app.user = { id: "u", email: "a@b.it", name: "Bea", avatar: "https://lh3.googleusercontent.com/a/x" };
    render(<Header />);
    await act(async () => { fireEvent.error($("#acc-btn img")!); });
    expect($("#acc-btn img")).toBeNull();
    expect($("#acc-btn")!.textContent).toBe("B");
  });

  it("senza account, con ?account=1, il tocco apre il riquadro di accesso", async () => {
    history.replaceState(null, "", "/?account=1");
    render(<Header />);
    await act(async () => {});
    const b = $("#acc-btn")!;
    expect(b.getAttribute("aria-label")).toBe("Accedi");
    await click(b);
    expect(app.openLogin).toHaveBeenCalledWith({ from: b });
  });

  it("senza ?account=1 e senza sessione non c'è", async () => {
    render(<Header />);
    await act(async () => {});
    expect($("#acc-btn")).toBeNull();
    expect($("#clock")).not.toBeNull();
  });
});

describe("riquadro di accesso", () => {
  it("quando arriva l'utente si chiude da solo", () => {
    app.loginOpen = true;
    const r = render(<AccessSheet />);
    expect(app.closeLogin).not.toHaveBeenCalled();
    app.user = { id: "u", email: "a@b.it" };
    r.rerender(<AccessSheet />);
    expect(app.closeLogin).toHaveBeenCalled();
    expect(r.queryByRole("dialog")).toBeNull();
  });

  it("l'ingresso avviato da qui mostra il toast di benvenuto una volta sola", () => {
    sessionStorage.setItem("popcorno-accesso-in-corso", "1");
    const r = render(<AccessSheet />);
    app.user = { id: "u", email: "a@b.it" };
    r.rerender(<AccessSheet />);
    r.rerender(<AccessSheet />);
    expect(app.toast).toHaveBeenCalledTimes(1);
    expect(app.toast).toHaveBeenCalledWith("Fatto! Ora i tuoi gusti ti seguono su ogni dispositivo 🍿");
    expect(sessionStorage.getItem("popcorno-accesso-in-corso")).toBeNull();
  });
});

describe("Profilo con l'account", () => {
  it("avatar, nome, email; I miei dati apre la vista dati; Esci esce col toast e le preferenze restano", async () => {
    app.user = { id: "u", email: "a@b.it", name: "Anna Rossi", avatar: "https://lh3.googleusercontent.com/a/x" };
    const r = render(<Account />);
    const box = $("#acc-box")!;
    expect(box.querySelector("img")!.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/x");
    expect((box.querySelector("img") as HTMLElement).style.width).toBe("48px");
    expect(box.querySelector("b")!.textContent).toBe("Anna Rossi");
    expect(box.textContent).toContain("a@b.it");
    await click(r.getByText("I miei dati"));
    expect(app.setView).toHaveBeenCalledWith("dati");
    await click(r.getByText("Esci"));
    expect(signOut).toHaveBeenCalled();
    expect(app.toast).toHaveBeenCalledWith("Sei uscito: le preferenze restano su questo dispositivo");
    expect(app.st.liked).toEqual(["x"]);
  });

  it("senza nome mostra solo l'email, con l'iniziale", () => {
    app.user = { id: "u", email: "a@b.it" };
    render(<Account />);
    expect($("#acc-box b")).toBeNull();
    expect($("#acc-box .avatar")!.textContent).toBe("A");
  });

  it("Esci fallito: toast con il messaggio", async () => {
    app.user = { id: "u", email: "a@b.it" };
    signOut.mockRejectedValueOnce(new Error("Non siamo riusciti a uscire. Riprova."));
    const r = render(<Account />);
    await click(r.getByText("Esci"));
    expect(app.toast).toHaveBeenCalledWith("Non siamo riusciti a uscire. Riprova.");
  });
});
