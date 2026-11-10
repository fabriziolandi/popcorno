import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { posthogTarget, proxyPosthog } from "../src/lib/posthog-proxy";

describe("posthogTarget", () => {
  it("l'API va a eu.i.posthog.com, con la query", () => {
    expect(posthogTarget(new URL("https://popcorno.it/relay/e/?ip=0&ver=1")).toString()).toBe("https://eu.i.posthog.com/e/?ip=0&ver=1");
    expect(posthogTarget(new URL("https://popcorno.it/relay/flags/?v=2")).toString()).toBe("https://eu.i.posthog.com/flags/?v=2");
  });
  it("gli script vanno a eu-assets.i.posthog.com", () => {
    expect(posthogTarget(new URL("https://popcorno.it/relay/static/posthog-recorder.js?v=1")).toString()).toBe("https://eu-assets.i.posthog.com/static/posthog-recorder.js?v=1");
    expect(posthogTarget(new URL("https://popcorno.it/relay/array/phc_x/config.js")).host).toBe("eu-assets.i.posthog.com");
  });
});

describe("proxyPosthog", () => {
  it("inoltra metodo e corpo, toglie i cookie, passa l'IP del visitatore", async () => {
    const f = vi.fn(async () => new Response("ok", { status: 200, headers: { "set-cookie": "x=1", "content-type": "text/plain" } }));
    const req = new Request("https://popcorno.it/relay/e/?ver=1", {
      method: "POST",
      body: "dati",
      headers: { cookie: "a=b", "cf-connecting-ip": "1.2.3.4", "content-type": "text/plain" },
    });
    const res = await proxyPosthog(req, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://eu.i.posthog.com/e/?ver=1");
    expect(init.method).toBe("POST");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe("dati");
    const h = init.headers as Headers;
    expect(h.get("cookie")).toBeNull();
    expect(h.get("x-forwarded-for")).toBe("1.2.3.4");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toBe("ok");
  });

  it("GET senza corpo; se PostHog non risponde, 502 e niente eccezioni", async () => {
    const f = vi.fn(async () => { throw new Error("rete"); });
    const res = await proxyPosthog(new Request("https://popcorno.it/relay/static/x.js"), f as unknown as typeof fetch);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBeUndefined();
    expect(res.status).toBe(502);
  });
});

describe("service worker", () => {
  it("non mette in cache le richieste delle statistiche", () => {
    expect(readFileSync("public/sw.js", "utf8")).toContain('u.pathname.startsWith("/relay/")) return;');
  });
});

describe("solo le richieste delle statistiche", () => {
  const ok = vi.fn(async () => new Response("ok"));
  it("eventi, registrazioni, opzioni e script passano", async () => {
    for (const p of ["/relay/e/?v=1", "/relay/i/v0/e/", "/relay/i/v1/logs", "/relay/s/", "/relay/flags/?v=2", "/relay/decide/", "/relay/static/1.2.3/recorder.js", "/relay/array/phc_x/config.js"]) {
      ok.mockClear();
      const r = await proxyPosthog(new Request("https://popcorno.it" + p), ok);
      expect(r.status, p).toBe(200);
      expect(ok).toHaveBeenCalledTimes(1);
    }
  });
  it("tutto il resto: 404 senza chiamare PostHog", async () => {
    for (const p of ["/relay/", "/relay/api/projects/", "/relay/api/surveys/", "/relay/login", "/relay/static", "/relay/estatico/", "/relay/../api/x", "/relay/%2e%2e/api/x"]) {
      ok.mockClear();
      const r = await proxyPosthog(new Request("https://popcorno.it" + p), ok);
      expect(r.status, p).toBe(404);
      expect(ok).not.toHaveBeenCalled();
    }
  });
});
