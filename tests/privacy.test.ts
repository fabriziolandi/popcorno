// @vitest-environment node
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { Route } from "../src/routes/privacy/index";

const legacy = new JSDOM(readFileSync("tests/legacy/privacy.legacy.html", "utf8")).window.document;
const Page = Route.options.component as () => any;
const ours = new JSDOM(`<body>${renderToStaticMarkup(createElement(Page))}</body>`).window.document;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const head = (Route.options.head as any)();

describe("pagina privacy", () => {
  it("stesso testo visibile dell'app vecchia", () => {
    // Gli a capo tra un blocco e l'altro non si vedono: si confronta senza spazi.
    const nospace = (d: Document) => d.body.textContent!.replace(/\s+/g, "");
    expect(nospace(ours)).toBe(nospace(legacy));
  });
  it("stessi link e titoli", () => {
    const links = (d: Document) => [...d.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.getAttribute("rel"), a.className, flat(a.textContent)]);
    expect(links(ours)).toEqual(links(legacy));
    const hs = (d: Document) => [...d.querySelectorAll("h1,h2")].map((h) => [h.tagName, flat(h.textContent)]);
    expect(hs(ours)).toEqual(hs(legacy));
  });
  it("stesso title, meta description, canonical e stili", () => {
    const meta = head.meta as Record<string, string>[];
    expect(meta.find((m) => m.title)!.title).toBe(legacy.title);
    expect(meta.find((m) => m.name === "description")!.content).toBe(legacy.querySelector('meta[name="description"]')!.getAttribute("content"));
    expect(head.links.find((l: any) => l.rel === "canonical").href).toBe(legacy.querySelector('link[rel="canonical"]')!.getAttribute("href"));
    expect(head.styles[0].children.trim()).toBe(legacy.querySelector("style")!.textContent!.trim());
  });
});
