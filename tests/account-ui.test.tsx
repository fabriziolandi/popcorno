// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const app = { user: null as { id: string; email: string } | null, toast: vi.fn(), setView: vi.fn(), st: { liked: ["x"] } };
vi.mock("../src/app-state", () => ({ useApp: () => app }));
const sendLink = vi.fn(async (_e: string) => {});
const verifyCode = vi.fn(async (_e: string, _c: string) => { throw new Error("no"); });
const signOut = vi.fn(async () => {});
vi.mock("../src/lib/account", async (orig) => ({
  ...(await orig<typeof import("../src/lib/account")>()),
  sendLink: (e: string) => sendLink(e),
  verifyCode: (e: string, c: string) => verifyCode(e, c),
  signOut: () => signOut(),
  signInWithGoogle: vi.fn(),
}));

import { Account } from "../src/components/prof/Account";

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const byText = (r: ReturnType<typeof render>, t: string) => r.getByText(t, { exact: false });

beforeEach(() => {
  app.user = null;
  app.toast.mockClear(); app.setView.mockClear();
  sendLink.mockClear(); verifyCode.mockClear(); signOut.mockClear();
  localStorage.clear(); sessionStorage.clear();
  history.replaceState(null, "", "/");
});
afterEach(cleanup);

describe("Account nel Profilo", () => {
  it("senza ?account=1 e senza sessione non mostra la riga di accesso", async () => {
    const r = render(<Account />);
    await act(async () => {});
    expect(r.container.textContent).not.toContain("Ricorda i miei gusti");
  });

  it("con ?account=1: email non valida mostra l'errore e non chiama sendLink", async () => {
    history.replaceState(null, "", "/?account=1");
    const r = render(<Account />);
    await click(byText(r, "Ricorda i miei gusti"));
    fireEvent.change(r.getByPlaceholderText("La tua email"), { target: { value: "non-una-email" } });
    await click(byText(r, "Mandami il link"));
    expect(app.toast).toHaveBeenCalledWith("Scrivi un indirizzo email valido");
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("invio riuscito mostra il campo del codice; il codice sbagliato mostra il toast d'errore", async () => {
    history.replaceState(null, "", "/?account=1");
    const r = render(<Account />);
    await click(byText(r, "Ricorda i miei gusti"));
    fireEvent.change(r.getByPlaceholderText("La tua email"), { target: { value: " a@b.it " } });
    await click(byText(r, "Mandami il link"));
    expect(sendLink).toHaveBeenCalledWith("a@b.it");
    const code = r.getByLabelText("Codice di 6 cifre") as HTMLInputElement;
    expect(code.maxLength).toBe(6);
    fireEvent.change(code, { target: { value: "123456" } });
    await click(r.getByText("Entra"));
    expect(verifyCode).toHaveBeenCalledWith("a@b.it", "123456");
    expect(app.toast).toHaveBeenCalledWith("Il codice non è giusto o è scaduto");
  });

  it("l'ingresso avviato da qui mostra il toast di benvenuto una volta sola", async () => {
    sessionStorage.setItem("popcorno-accesso-in-corso", "1");
    const r = render(<Account />);
    app.user = { id: "u", email: "a@b.it" };
    r.rerender(<Account />);
    expect(app.toast).toHaveBeenCalledWith("Fatto! Ora i tuoi gusti ti seguono su ogni dispositivo 🍿");
    expect(sessionStorage.getItem("popcorno-accesso-in-corso")).toBeNull();
  });

  it("da dentro: Esci chiama signOut e le preferenze restano", async () => {
    app.user = { id: "u", email: "a@b.it" };
    const r = render(<Account />);
    expect(r.container.textContent).toContain("Sei dentro come a@b.it");
    await click(r.getByText("Esci"));
    expect(signOut).toHaveBeenCalled();
    expect(app.toast).toHaveBeenCalledWith("Sei uscito: le preferenze restano su questo dispositivo");
    expect(app.st.liked).toEqual(["x"]);
    await click(r.getByText("I miei dati"));
    expect(app.setView).toHaveBeenCalledWith("dati");
  });
});
