// @vitest-environment node
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { Route } from "../src/routes/privacy/index";

const legacy = new JSDOM(readFileSync("tests/legacy/privacy.legacy.html", "utf8")).window.document;
// Testo per Cloudflare approvato dal proprietario il 2026-11-08 (docs/superpowers/plans/2026-11-08-privacy-cloudflare.md),
// applicato al cambio di dominio: cambiano solo la data e il punto su GitHub Pages; il resto deve restare identico.
const approved = {
  data: "Ultimo aggiornamento: 9 novembre 2026",
  servizi:
    `<li><strong>Cloudflare</strong> (Cloudflare, Inc.) ospita il sito e gestisce il dominio popcorno.it. Per far funzionare il servizio, velocizzarlo e proteggerlo da attacchi riceve l'indirizzo IP e i dati tecnici di ogni richiesta. I suoi server sono distribuiti in molti Paesi, anche fuori dall'Unione europea (per esempio negli Stati Uniti): in quel caso il trasferimento avviene con le garanzie previste dal GDPR. <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Informativa di Cloudflare</a>.</li>` +
    `<li><strong>GitHub Pages</strong> (GitHub, Inc., gruppo Microsoft) ospita solo il vecchio indirizzo fabriziolandi.github.io/popcorno/, che serve unicamente a portarti su popcorno.it. Se lo apri, può registrare l'indirizzo IP per sicurezza e funzionamento del servizio; i server possono trovarsi negli Stati Uniti. <a href="https://docs.github.com/it/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">Informativa di GitHub</a>.</li>`,
};
{
  const date = [...legacy.querySelectorAll("p.muto")].find((p) => p.textContent!.startsWith("Ultimo aggiornamento"))!;
  date.textContent = approved.data;
  const gh = [...legacy.querySelectorAll("li")].find((li) => li.querySelector("strong")?.textContent === "GitHub Pages")!;
  gh.outerHTML = approved.servizi;
}
const Page = Route.options.component as () => any;
const ours = new JSDOM(`<body>${renderToStaticMarkup(createElement(Page))}</body>`).window.document;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const head = (Route.options.head as any)();

describe("pagina privacy", () => {
  // Dal 10/11/2026 la pagina descrive le statistiche con PostHog (docs/superpowers/plans/2026-11-09-privacy-posthog.md):
  // non è più uguale a quella dell'app vecchia, ma i titoli delle sezioni e gli stili restano gli stessi.
  const text = flat(ours.body.textContent);
  it("descrive PostHog, le statistiche, il cookie e come disattivarle", () => {
    expect(text).toContain("Ultimo aggiornamento: 10 novembre 2026");
    expect(text).toContain("statistiche d'uso con PostHog");
    expect(text).toContain("PostHog (PostHog Inc.) raccoglie le statistiche d'uso");
    expect(text).toContain("registrazione della sessione");
    expect(text).toContain("ph_");
    expect(ours.querySelector('a[href="https://posthog.com/privacy"]')).not.toBeNull();
  });
  it("non promette più niente cookie e niente statistiche", () => {
    expect(text).not.toContain("Popcorno non usa cookie");
    expect(text).not.toContain("non fa statistiche sulle visite");
    expect(text).not.toContain("non usa cookie di tracciamento");
  });
  it("mantiene il testo Cloudflare approvato e gli stessi titoli di sezione", () => {
    expect(ours.body.innerHTML).toContain(approved.servizi.split("</li>")[0]);
    const hs = (d: Document) => [...d.querySelectorAll("h1,h2")].map((h) => [h.tagName, flat(h.textContent)]);
    expect(hs(ours)).toEqual(hs(legacy));
  });
  it("stesso title, canonical e stili; descrizione aggiornata", () => {
    const meta = head.meta as Record<string, string>[];
    expect(meta.find((m) => m.title)!.title).toBe(legacy.title);
    expect(meta.find((m) => m.name === "description")!.content).toContain("statistiche d'uso");
    expect(head.links.find((l: any) => l.rel === "canonical").href).toBe(legacy.querySelector('link[rel="canonical"]')!.getAttribute("href"));
    expect(head.styles[0].children.trim()).toContain(legacy.querySelector("style")!.textContent!.trim().split(".btn{")[0].trim());
  });
});
