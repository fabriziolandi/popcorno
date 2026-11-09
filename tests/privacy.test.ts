// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { Route } from "../src/routes/privacy/index";

const Page = Route.options.component as () => any;
const ours = new JSDOM(`<body>${renderToStaticMarkup(createElement(Page))}</body>`).window.document;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const head = (Route.options.head as any)();
const testo = flat(ours.body.textContent);

describe("pagina privacy", () => {
  it("ha i titoli h2 nell'ordine previsto", () => {
    expect([...ours.querySelectorAll("h2")].map((h) => flat(h.textContent))).toEqual([
      "Chi è il titolare del trattamento",
      "Quali dati usa l'app",
      "Se crei un account (facoltativo)",
      "Servizi esterni",
      "Cookie",
      "Base giuridica e conservazione",
      "I tuoi diritti",
      "Modifiche",
    ]);
  });
  it("linka le informative di Supabase, Google e Resend", () => {
    const hrefs = [...ours.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://supabase.com/privacy");
    expect(hrefs).toContain("https://policies.google.com/privacy");
    expect(hrefs).toContain("https://resend.com/legal/privacy-policy");
  });
  it("cita la base giuridica dell'account", () => {
    expect(testo).toContain("art. 6.1.b GDPR");
  });
  it("dice dove stanno i dati", () => {
    expect(testo).toContain("Francoforte");
  });
  it("dice che non usa cookie", () => {
    expect(testo).toContain("Popcorno non usa cookie.");
  });
  it("non promette più l'assenza di registrazione in modo assoluto", () => {
    // «funziona senza registrazione» resta nel riquadro "In breve" (testo approvato): si controlla
    // che la formula assoluta di prima, "senza registrazione" come unica condizione, non ci sia più.
    expect(testo).not.toContain("Gratis, senza registrazione");
    expect(testo).not.toContain("non ti chiede di registrarti");
    expect(testo).toContain("L'account è facoltativo");
  });
  it("le preferenze sul dispositivo non partono solo senza account", () => {
    expect(testo).toContain("Senza account, non vengono inviati a noi né a nessun altro.");
  });
  it("dice che con Google salviamo anche nome e foto, e da dove arriva la foto", () => {
    expect(testo).toContain("L'indirizzo email con cui accedi. Se accedi con Google, anche il nome e la foto del tuo profilo Google, che usiamo solo per mostrarti chi sei nell'app.");
    expect(testo).toContain("conferma chi sei e ci comunica il tuo indirizzo email, il tuo nome e la foto del profilo. La foto viene mostrata caricandola dai server di Google. Informativa di Google.");
  });
  it("ha il canonical", () => {
    expect(head.links.find((l: any) => l.rel === "canonical").href).toBe("https://popcorno.it/privacy/");
  });
});
