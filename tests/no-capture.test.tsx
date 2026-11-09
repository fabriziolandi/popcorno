// @vitest-environment jsdom
// Statistiche (PostHog) e account restano separati: gli elementi con dati dell'account hanno ph-no-capture,
// la classe che PostHog esclude dai clic registrati e oscura nelle registrazioni delle sessioni.
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../src/app-state";

const app = {
  user: null as User | null, view: "scegli", toast: vi.fn(), setView: vi.fn(), flushSync: vi.fn(),
  loginOpen: false, loginOpts: {} as { email?: boolean }, openLogin: vi.fn(), closeLogin: vi.fn(),
};
vi.mock("../src/app-state", () => ({ useApp: () => app }));
vi.mock("../src/lib/account", async (orig) => ({
  ...(await orig<typeof import("../src/lib/account")>()),
  sendLink: vi.fn(async () => {}),
  verifyCode: vi.fn(),
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
// Le altre sezioni non servono qui: si guarda solo il contenitore di «I miei dati».
vi.mock("../src/components/scegli/Scegli", () => ({ Scegli: () => null }));
vi.mock("../src/components/onda/Guide", () => ({ Guide: () => null }));
vi.mock("../src/components/prof/Profile", () => ({ Profile: () => null }));
vi.mock("../src/components/prof/MieiDati", () => ({ MieiDati: () => <p>Account: a@b.it</p> }));
vi.mock("../src/components/Nav", () => ({ Nav: () => null }));

import { Header } from "../src/components/Header";
import { AccessSheet } from "../src/components/prof/AccessSheet";
import { Account } from "../src/components/prof/Account";
import { Shell } from "../src/components/Shell";

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const NO = "ph-no-capture";
const ANNA: User = { id: "u", email: "a@b.it", name: "Anna", avatar: "https://lh3.googleusercontent.com/a/x" };

beforeEach(() => {
  app.user = null;
  app.view = "scegli";
  app.loginOpen = false;
  app.loginOpts = {};
  history.replaceState(null, "", "/?account=1");
});
afterEach(cleanup);

describe("PostHog non vede i dati dell'account", () => {
  it("analytics.ts non collega mai PostHog all'account (niente identify, alias o dati della persona)", () => {
    const src = readFileSync("src/lib/analytics.ts", "utf8");
    expect(src).not.toMatch(/\bidentify\s*\(|\balias\s*\(|\.email\b|\buser\.(id|name)\b/);
  });

  it("l'icona dell'account con la foto ha ph-no-capture", () => {
    app.user = ANNA;
    render(<Header />);
    expect($("#acc-btn")!.classList.contains(NO)).toBe(true);
    expect($("#acc-btn img")!.closest("." + NO)).not.toBeNull();
  });

  it("il riquadro dell'account nel Profilo (email, nome, foto) ha ph-no-capture", () => {
    app.user = ANNA;
    render(<Account />);
    const box = $("#acc-box")!;
    expect(box.classList.contains(NO)).toBe(true);
    expect(box.textContent).toContain("a@b.it");
  });

  it("nel riquadro di accesso il campo email ha ph-no-capture", () => {
    app.loginOpen = true;
    app.loginOpts = { email: true };
    render(<AccessSheet />);
    expect($('input[type="email"]')!.classList.contains(NO)).toBe(true);
  });

  it("anche il campo del codice ha ph-no-capture", async () => {
    app.loginOpen = true;
    const { getByLabelText, findByLabelText } = render(<AccessSheet />);
    fireEvent.change(getByLabelText("La tua email"), { target: { value: "a@b.it" } });
    await act(async () => { fireEvent.submit(getByLabelText("La tua email").closest("form")!); });
    expect((await findByLabelText("Codice di 6 cifre")).classList.contains(NO)).toBe(true);
  });

  it("tutta la sezione «I miei dati» ha ph-no-capture, aperta o nascosta", () => {
    app.user = ANNA;
    app.view = "dati";
    const r = render(<Shell />);
    expect($("#v-dati")!.classList.contains(NO)).toBe(true);
    expect($("#v-dati")!.classList.contains("hide")).toBe(false);
    app.view = "prof";
    r.rerender(<Shell />);
    expect($("#v-dati")!.classList.contains(NO)).toBe(true);
    expect($("#v-dati")!.classList.contains("hide")).toBe(true);
  });
});
