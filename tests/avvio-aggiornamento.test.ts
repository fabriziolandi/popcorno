// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { avviaAggiornamento } from "../src/lib/avvio-aggiornamento";

describe("avvio dell'aggiornamento dal timer di Cloudflare", () => {
  it("chiede a GitHub di avviare aggiorna.yml su main", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await avviaAggiornamento({ GITHUB_TOKEN_AGGIORNA: "tok" }, fetcher as unknown as typeof fetch);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/fabriziolandi/popcorno/actions/workflows/aggiorna.yml/dispatches");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ ref: "main" });
  });

  it("segnala il segreto mancante e le risposte di errore", async () => {
    await expect(avviaAggiornamento({})).rejects.toThrow("GITHUB_TOKEN_AGGIORNA");
    const fetcher = async () => new Response("Bad credentials", { status: 401 });
    await expect(avviaAggiornamento({ GITHUB_TOKEN_AGGIORNA: "x" }, fetcher as typeof fetch)).rejects.toThrow("401");
  });

  it("il workflow non ha piu' orari propri: lo avvia solo Cloudflare", () => {
    const yml = readFileSync(".github/workflows/aggiorna.yml", "utf8");
    expect(yml).not.toMatch(/^\s*schedule:/m);
    expect(yml).toContain("workflow_dispatch");
  });
});
