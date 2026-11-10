// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS, withSecurityHeaders } from "../src/lib/security-headers";

describe("intestazioni di sicurezza", () => {
  it("impediscono di mostrare il sito dentro un altro sito", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("public/_headers ha le stesse righe, per tutti i file statici", () => {
    const lines = readFileSync("public/_headers", "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
    expect(lines[0]).toBe("/*");
    const got = Object.fromEntries(lines.slice(1).map((l) => { const i = l.indexOf(": "); return [l.slice(0, i).trim(), l.slice(i + 2)]; }));
    expect(got).toEqual(SECURITY_HEADERS);
  });

  it("le aggiunge alle risposte del Worker senza cambiare stato, corpo e intestazioni già presenti", async () => {
    const r = withSecurityHeaders(new Response("ciao", { status: 404, headers: { "Content-Type": "text/plain", "X-Frame-Options": "SAMEORIGIN" } }));
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("ciao");
    expect(r.headers.get("Content-Type")).toBe("text/plain");
    expect(r.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(r.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("anche quando le intestazioni della risposta sono bloccate (risposte di fetch)", async () => {
    const locked = Response.redirect("https://popcorno.it/", 302);
    const r = withSecurityHeaders(locked);
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("https://popcorno.it/");
    expect(r.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("il Worker parte da src/server.ts", () => {
    expect(readFileSync("wrangler.jsonc", "utf8")).toContain('"main": "src/server.ts"');
  });
});
