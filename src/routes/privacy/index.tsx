import { createFileRoute, redirect } from "@tanstack/react-router";

// Stili propri della pagina, copiati dalla pagina privacy dell'app vecchia (valgono solo qui).
const css = `
@font-face{font-family:"Bricolage Grotesque";font-weight:200 800;font-display:swap;src:url(/fonts/bricolage.woff2) format("woff2")}
@font-face{font-family:Figtree;font-weight:400;font-display:swap;src:url(/fonts/figtree-400.woff2) format("woff2")}
@font-face{font-family:Figtree;font-weight:700;font-display:swap;src:url(/fonts/figtree-700.woff2) format("woff2")}
:root{--notte:#151a44;--notte2:#1d2358;--bordo:#2f377a;--luce:#ffb547;--testo:#f3f1ff;--muto:#a3a8da}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--notte);color:var(--testo);font:16px/1.6 Figtree,system-ui,sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:28px 20px 60px}
a{color:var(--luce)}
.top{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--testo);font:800 22px "Bricolage Grotesque",sans-serif;margin-bottom:28px}
.top img{width:34px;height:34px;border-radius:9px}
h1{font:800 34px/1.1 "Bricolage Grotesque",sans-serif;margin-bottom:8px}
h2{font:700 20px/1.25 "Bricolage Grotesque",sans-serif;margin:30px 0 8px;color:var(--luce)}
p,li{color:#dcdcf5;margin-bottom:10px}
ul{padding-left:20px}
.box{background:var(--notte2);border:1px solid var(--bordo);border-radius:16px;padding:16px 18px;margin:18px 0}
.muto{color:var(--muto);font-size:14px}
.btn{display:inline-block;margin-top:30px;background:var(--luce);color:#1a1300;font-weight:700;padding:12px 22px;border-radius:999px;text-decoration:none}
`;

export const Route = createFileRoute("/privacy/")({
  // /privacy (senza barra) rimanda a /privacy/; le altre rotte restano come sono.
  beforeLoad: ({ location }) => {
    if (!location.pathname.endsWith("/")) throw redirect({ href: "/privacy/", statusCode: 301 });
  },
  head: () => ({
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Privacy – Popcorno" },
      { name: "description", content: "Informativa privacy di Popcorno: quali dati usa l'app (quasi nessuno), dove restano e come contattarci." },
    ],
    links: [{ rel: "canonical", href: "https://popcorno.it/privacy/" }],
    styles: [{ children: css }],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="wrap">
      <a className="top" href="/"><img src="/icons/icon-180.png" alt="" />Popcorno</a>
      <h1>Informativa privacy</h1>
      <p className="muto">Ultimo aggiornamento: 7 novembre 2026</p>

      <div className="box">
      <p><strong>In breve:</strong> Popcorno non ti chiede di registrarti, non usa cookie di tracciamento, non fa statistiche sulle visite e non mostra pubblicità. Le tue preferenze restano sul tuo dispositivo.</p>
      </div>

      <h2>Chi è il titolare del trattamento</h2>
      <p>Il titolare del trattamento è il gestore di Popcorno (popcorno.it). Per qualsiasi domanda sulla privacy puoi scrivere a <a href="mailto:privacy@popcorno.it">privacy@popcorno.it</a>.</p>

      <h2>Quali dati usa l'app</h2>
      <ul>
      <li><strong>Preferenze salvate sul tuo dispositivo.</strong> Abbonamenti, squadra del cuore, città, generi, lista "Da vedere", serie che segui e gradimenti vengono salvati nella memoria locale del browser (localStorage). Non vengono inviati a noi né a nessun altro. Puoi cancellarli in qualsiasi momento svuotando i dati del sito dalle impostazioni del browser.</li>
      <li><strong>Link di sincronizzazione.</strong> Se usi "Copia il mio link", le preferenze vengono inserite nel link stesso. Il link resta nelle tue mani: lo condividi tu, e noi non lo riceviamo.</li>
      <li><strong>Dati tecnici di navigazione.</strong> Come ogni sito, quando apri Popcorno il tuo browser comunica ai server che lo ospitano alcuni dati tecnici, come indirizzo IP, tipo di browser e pagina richiesta. Li tratta il fornitore dell'hosting, solo per far funzionare e proteggere il servizio. Noi non li raccogliamo né li analizziamo.</li>
      </ul>

      <h2>Servizi esterni</h2>
      <ul>
      <li><strong>GitHub Pages</strong> (GitHub, Inc., gruppo Microsoft) ospita il sito. Può registrare l'indirizzo IP per sicurezza e funzionamento del servizio; i server possono trovarsi negli Stati Uniti. <a href="https://docs.github.com/it/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">Informativa di GitHub</a>.</li>
      <li><strong>TMDB</strong> (The Movie Database) fornisce le locandine: per mostrarle, il browser le scarica da image.tmdb.org, che riceve l'indirizzo IP come per qualsiasi immagine sul web. <a href="https://www.themoviedb.org/privacy-policy" rel="noopener">Informativa di TMDB</a>.</li>
      <li><strong>Link esterni.</strong> I pulsanti Trailer (YouTube), orari del cinema (Google) e Condividi (WhatsApp) aprono altri siti solo quando li tocchi tu. Da quel momento vale l'informativa di quei siti.</li>
      </ul>
      <p>I caratteri tipografici sono ospitati direttamente su popcorno.it: nessuna richiesta parte verso Google Fonts.</p>

      <h2>Cookie</h2>
      <p>Popcorno non usa cookie. Usa solo la memoria locale del browser per ricordare le tue preferenze e una cache per funzionare più velocemente e anche senza rete. Si tratta di strumenti tecnici necessari al servizio, per cui non serve alcun consenso.</p>

      <h2>Base giuridica e conservazione</h2>
      <p>I dati tecnici sono trattati per l'interesse legittimo a fornire un sito funzionante e sicuro (art. 6.1.f GDPR), per il tempo deciso dal fornitore di hosting. Le preferenze locali restano sul tuo dispositivo finché non le cancelli.</p>

      <h2>I tuoi diritti</h2>
      <p>Hai diritto di chiedere accesso, rettifica, cancellazione, limitazione od opposizione al trattamento dei tuoi dati, oltre alla portabilità (artt. 15–21 GDPR), scrivendo a <a href="mailto:privacy@popcorno.it">privacy@popcorno.it</a>. Hai anche il diritto di presentare reclamo al <a href="https://www.garanteprivacy.it" rel="noopener">Garante per la protezione dei dati personali</a>.</p>

      <h2>Modifiche</h2>
      <p>Se Popcorno aggiungerà nuove funzioni che usano dati personali (per esempio un account facoltativo), questa pagina verrà aggiornata prima che entrino in funzione.</p>

      <p className="muto" style={{ marginTop: 28 }}>Dati di film e serie da TMDB. Questo prodotto usa le API di TMDB ma non è approvato né certificato da TMDB.</p>
      <a className="btn" href="/">🍿 Torna a Popcorno</a>
    </div>
  );
}
