// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn((..._a: unknown[]) => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import {
  LAST_ACCOUNT_KEY, SESSION_KEY, accountVisible, authInUrl, completeFromUrl, deleteAccount, hasStoredSession,
  sendLink, setClientForTests, signInWithGoogle, signOut, verifyCode,
} from "../src/lib/account";

const fake = () => ({
  auth: {
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null }) as { error: { message: string } | null }),
    getSession: vi.fn(async () => ({ data: { session: { user: { id: "u1" } } }, error: null })),
  },
  rpc: vi.fn(async () => ({ error: null })),
});

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
});
afterEach(() => {
  setClientForTests(null);
  createClient.mockClear();
});

describe("visibilità", () => {
  it("senza sessione e senza ?account=1 è visibile a tutti, ma il client non si crea", () => {
    expect(accountVisible(localStorage, "")).toBe(true);
    expect(createClient).not.toHaveBeenCalled();
  });
  it("?account=1 la rende visibile anche dopo", () => {
    expect(accountVisible(localStorage, "?account=1")).toBe(true);
    expect(accountVisible(localStorage, "")).toBe(true);
  });
  it("con una sessione salvata è visibile", () => {
    localStorage.setItem(SESSION_KEY, "{}");
    expect(accountVisible(localStorage, "")).toBe(true);
  });
  it("con uno storage che lancia (o assente) non lancia ed è comunque visibile", () => {
    const bad = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } } as unknown as Storage;
    expect(() => accountVisible(bad, "")).not.toThrow();
    expect(accountVisible(bad, "")).toBe(true);
    expect(accountVisible(bad, "?account=1")).toBe(true);
    expect(accountVisible(null, "")).toBe(true);
  });
  it("hasStoredSession legge SESSION_KEY", () => {
    expect(hasStoredSession(localStorage)).toBe(false);
    localStorage.setItem(SESSION_KEY, "x");
    expect(hasStoredSession(localStorage)).toBe(true);
  });
  it("authInUrl riconosce code e token_hash", () => {
    expect(authInUrl("?code=1")).toBe(true);
    expect(authInUrl("?token_hash=a&type=email")).toBe(true);
    expect(authInUrl("?x=1")).toBe(false);
  });
});

describe("funzioni di accesso", () => {
  it("sendLink passa emailRedirectTo con l'origine", async () => {
    const c = fake();
    setClientForTests(c);
    await sendLink("a@b.it");
    expect(c.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "a@b.it",
      options: { emailRedirectTo: location.origin + "/", shouldCreateUser: true },
    });
  });
  it("verifyCode verifica il codice di sei cifre", async () => {
    const c = fake();
    setClientForTests(c);
    await verifyCode("a@b.it", "123456");
    expect(c.auth.verifyOtp).toHaveBeenCalledWith({ email: "a@b.it", token: "123456", type: "email" });
  });
  it("signInWithGoogle usa OAuth con ritorno all'origine", async () => {
    const c = fake();
    setClientForTests(c);
    await signInWithGoogle();
    expect(c.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google", options: { redirectTo: location.origin + "/" },
    });
  });
  it("completeFromUrl con token_hash chiama verifyOtp e pulisce l'indirizzo", async () => {
    const c = fake();
    setClientForTests(c);
    history.replaceState(null, "", "/?token_hash=abc&type=email&x=1");
    await completeFromUrl();
    expect(c.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
    expect(location.pathname + location.search).toBe("/?x=1");
  });
  it("completeFromUrl con code toglie solo il parametro, senza verifyOtp", async () => {
    const c = fake();
    setClientForTests(c);
    history.replaceState(null, "", "/?code=zzz");
    await completeFromUrl();
    expect(c.auth.verifyOtp).not.toHaveBeenCalled();
    expect(location.pathname + location.search).toBe("/");
  });
  it("completeFromUrl pulisce l'indirizzo anche se la verifica fallisce", async () => {
    const c = fake();
    c.auth.verifyOtp.mockResolvedValue({ error: { message: "expired" } } as never);
    setClientForTests(c);
    history.replaceState(null, "", "/?token_hash=abc&type=email");
    await expect(completeFromUrl()).rejects.toThrow(Error);
    expect(location.search).toBe("");
  });
  it("signOut esce solo da questo dispositivo", async () => {
    const c = fake();
    setClientForTests(c);
    await signOut();
    expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("deleteAccount chiama delete_account e poi esce", async () => {
    const c = fake();
    setClientForTests(c);
    await deleteAccount();
    expect(c.rpc).toHaveBeenCalledWith("delete_account");
    expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(c.rpc.mock.invocationCallOrder[0]).toBeLessThan(c.auth.signOut.mock.invocationCallOrder[0]);
  });
  it("signOut ricorda quale account c'era su questo dispositivo", async () => {
    const c = fake();
    setClientForTests(c);
    await signOut();
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe("u1");
  });
  it("deleteAccount riuscito dimentica l'account del dispositivo", async () => {
    localStorage.setItem(LAST_ACCOUNT_KEY, "u1");
    const c = fake();
    setClientForTests(c);
    await deleteAccount();
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBeNull();
  });
  it("deleteAccount fallito non tocca l'account ricordato", async () => {
    localStorage.setItem(LAST_ACCOUNT_KEY, "u1");
    const c = fake();
    c.rpc.mockResolvedValue({ error: { message: "boom" } } as never);
    setClientForTests(c);
    await expect(deleteAccount()).rejects.toThrow(Error);
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe("u1");
    expect(c.auth.signOut).not.toHaveBeenCalled();
  });
  it("deleteAccount: un'uscita fallita (senza rete) dopo l'eliminazione non è un errore", async () => {
    const c = fake();
    c.auth.signOut.mockResolvedValueOnce({ error: { message: "Failed to fetch" } });
    setClientForTests(c);
    await expect(deleteAccount()).resolves.toBeUndefined();
    c.auth.signOut.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(c.auth.signOut).toHaveBeenCalledTimes(2);
  });
  it("deleteAccount: se l'uscita non toglie la sessione, la toglie dal dispositivo", async () => {
    const c = fake();
    c.auth.signOut.mockResolvedValueOnce({ error: { message: "Failed to fetch" } });
    setClientForTests(c);
    localStorage.setItem(SESSION_KEY, "{}");
    await deleteAccount();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    localStorage.setItem(SESSION_KEY, "{}");
    c.auth.signOut.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await deleteAccount();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
  it("un errore di Supabase diventa un Error leggibile", async () => {
    const c = fake();
    c.auth.signInWithOtp.mockResolvedValue({ error: { message: "boom" } } as never);
    setClientForTests(c);
    const e = await sendLink("a@b.it").catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toMatch(/[a-zà-ù]/i);
    expect(e.message).not.toBe("boom");
  });
  it("getClient crea un solo client con le opzioni PKCE", async () => {
    const { getClient } = await import("../src/lib/account");
    const a = await getClient();
    const b = await getClient();
    expect(a).toBe(b);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient.mock.calls[0]![2]).toMatchObject({
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  });
});
