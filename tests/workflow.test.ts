// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pubblicazione automatica: il permesso di scrivere nel repository lo usa solo il salvataggio della guida.
const wf = readFileSync(".github/workflows/aggiorna.yml", "utf8");
const steps = wf.split(/\n      - /);

describe("workflow aggiorna.yml", () => {
  it("di base il token può solo leggere", () => {
    expect(wf).toMatch(/^permissions:\n  contents: read$/m);
  });
  it("il checkout non lascia il token su disco", () => {
    expect(steps.find((s) => s.startsWith("uses: actions/checkout"))).toContain("persist-credentials: false");
  });
  it("il token arriva solo al passaggio che salva la guida, che viene prima di npm ci", () => {
    const withToken = steps.filter((s) => s.includes("secrets.GITHUB_TOKEN"));
    expect(withToken).toHaveLength(1);
    expect(withToken[0]).toContain("name: Salva la guida TV");
    expect(wf.indexOf("name: Salva la guida TV")).toBeLessThan(wf.indexOf("run: npm ci"));
  });
});
