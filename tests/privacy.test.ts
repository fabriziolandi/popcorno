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
const testo = flat(ours.body.textContent);

describe("pagina privacy", () => {
  // Dal 10/11/2026 la pagina descrive le statistiche con PostHog (docs/superpowers/plans/2026-11-09-privacy-posthog.md)
  // e l'account facoltativo: non è più uguale a quella dell'app vecchia, ma title, canonical e stili restano gli stessi.
  it("ha i titoli h1 e h2 nell'ordine previsto (quelli della vecchia più l'account)", () => {
    expect(flat(ours.querySelector("h1")!.textContent)).toBe(flat(legacy.querySelector("h1")!.textContent));
    const h2 = [...ours.querySelectorAll("h2")].map((h) => flat(h.textContent));
    expect(h2).toEqual([
      "Chi è il titolare del trattamento",
      "Quali dati usa l'app",
      "Se crei un account (facoltativo)",
      "Servizi esterni",
      "Cookie",
      "Base giuridica e conservazione",
      "I tuoi diritti",
      "Modifiche",
    ]);
    expect(h2.filter((h) => h !== "Se crei un account (facoltativo)")).toEqual([...legacy.querySelectorAll("h2")].map((h) => flat(h.textContent)));
  });
  it("descrive PostHog, le statistiche, il cookie e come disattivarle", () => {
    expect(testo).toContain("Ultimo aggiornamento: 10 novembre 2026");
    expect(testo).toContain("statistiche d'uso con PostHog");
    expect(testo).toContain("PostHog (PostHog Inc.) raccoglie le statistiche d'uso");
    expect(testo).toContain("registrazione della sessione");
    expect(testo).toContain("ph_");
    expect(ours.querySelector('a[href="https://posthog.com/privacy"]')).not.toBeNull();
  });
  it("non promette più niente cookie e niente statistiche", () => {
    expect(testo).not.toContain("Popcorno non usa cookie");
    expect(testo).not.toContain("non fa statistiche sulle visite");
    expect(testo).not.toContain("non usa cookie di tracciamento");
  });
  it("mantiene il testo Cloudflare approvato", () => {
    expect(ours.body.innerHTML).toContain(approved.servizi.split("</li>")[0]);
  });
  it("linka le informative di Supabase, Google e Resend", () => {
    const hrefs = [...ours.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://supabase.com/privacy");
    expect(hrefs).toContain("https://policies.google.com/privacy");
    expect(hrefs).toContain("https://resend.com/legal/privacy-policy");
  });
  it("cita la base giuridica dell'account", () => {
    expect(testo).toContain("Per chi crea un account, i dati dell'account sono trattati per fornire il servizio richiesto (art. 6.1.b GDPR) e conservati finché non cancelli lo storico o l'account.");
  });
  it("dice dove stanno i dati", () => {
    expect(testo).toContain("Francoforte");
  });
  it("non promette più l'assenza di registrazione in modo assoluto", () => {
    expect(testo).not.toContain("Gratis, senza registrazione");
    expect(testo).not.toContain("non ti chiede di registrarti");
    expect(testo).toContain("L'account è facoltativo");
  });
  it("«In breve»: senza registrazione, statistiche PostHog e account facoltativo", () => {
    expect(flat(ours.querySelector(".box")!.textContent)).toBe(
      "In breve: Popcorno funziona senza registrazione e non mostra pubblicità. Per capire come viene usata l'app e migliorarla raccogliamo statistiche d'uso con PostHog: pagine viste, tocchi, scelte fatte nell'app, errori e una registrazione anonima della sessione (i campi di testo sono sempre oscurati). Le tue preferenze restano sul tuo dispositivo. L'account è facoltativo: se lo crei, Popcorno salva le tue preferenze e le tue scelte nell'app per ritrovarle su tutti i dispositivi e proporti di meglio. Puoi vederle, scaricarle e cancellarle quando vuoi in «I miei dati».",
    );
  });
  it("l'account non registra altro e le statistiche non sono collegate all'account", () => {
    expect(testo).toContain("Nell'account non registriamo nient'altro. Le statistiche d'uso descritte sopra sono separate e non sono collegate al tuo account.");
    expect(testo).not.toContain("niente pagine visitate, tempo passato nell'app o ricerche");
  });
  it("cookie: la memoria locale tiene anche l'accesso", () => {
    expect(testo).toContain("Popcorno usa la memoria locale del browser e una cache, strumenti tecnici necessari per ricordare le tue preferenze e, se hai fatto l'accesso, per tenerti dentro e funzionare anche senza rete. Usa inoltre un cookie e una voce nella memoria del browser di PostHog (il nome inizia con ph_) per le statistiche d'uso descritte sopra.");
  });
  it("le preferenze sul dispositivo non partono solo senza account", () => {
    expect(testo).toContain("Senza account, non vengono inviati a noi né a nessun altro.");
  });
  it("dice che con Google salviamo anche nome e foto, e da dove arriva la foto", () => {
    expect(testo).toContain("L'indirizzo email con cui accedi. Se accedi con Google, anche il nome e la foto del tuo profilo Google, che usiamo solo per mostrarti chi sei nell'app.");
    expect(testo).toContain("conferma chi sei e ci comunica il tuo indirizzo email, il tuo nome e la foto del profilo. La foto viene mostrata caricandola dai server di Google. Informativa di Google.");
  });
  it("Modifiche: aggiornamento prima delle novità", () => {
    expect(testo).toContain("Se cambierà il modo in cui Popcorno usa i dati personali, aggiorneremo questa pagina prima che le novità entrino in funzione.");
  });
  it("stesso title, canonical e stili; descrizione aggiornata", () => {
    const meta = head.meta as Record<string, string>[];
    expect(meta.find((m) => m.title)!.title).toBe(legacy.title);
    expect(meta.find((m) => m.name === "description")!.content).toBe("Informativa privacy di Popcorno: quali dati usa l'app, l'account facoltativo, le statistiche d'uso, dove restano i dati e come contattarci.");
    expect(head.links.find((l: any) => l.rel === "canonical").href).toBe(legacy.querySelector('link[rel="canonical"]')!.getAttribute("href"));
    expect(head.styles[0].children.trim()).toContain(legacy.querySelector("style")!.textContent!.trim().split(".btn{")[0].trim());
  });
});
