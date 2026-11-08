# Riscrittura in React + TanStack Start su Cloudflare — documento di progetto

Data: 2026-11-07 · Primo di due progetti. Il secondo è `2026-11-07-accesso-e-storico-design.md` (accesso facoltativo e storico dei gusti), che si costruisce **dopo** e sopra questa base.

## Perché

Il proprietario vuole costruire Popcorno con **React e TanStack Start** (decisione sua) e ospitarlo su **Cloudflare** (decisione sua) invece che su GitHub Pages. La nuova base serve anche al progetto successivo: accesso con Supabase, sincronizzazione e storico, con funzioni lato server dove servono (es. eliminazione dell'account).

## Obiettivo

**Stesse funzioni di oggi** (decisione del proprietario): nessuna funzione nuova, nessuna tolta, nessun cambio di comportamento visibile. Chi usa Popcorno oggi non deve accorgersi della riscrittura, salvo pagine un po' più veloci.

Riferimento di parità: l'app attuale, `index.html` (JS inline, ~65 KB), `privacy/index.html`, `sw.js`, `manifest.webmanifest`. Tutto ciò che fanno oggi va riprodotto, in particolare:
- le sezioni e i filtri: TV in chiaro, Sky/NOW, sport, Pluto TV e Samsung TV Plus, piattaforme streaming con catalogo completo, film al cinema con orari per città, film d'essai e MUBI, generi;
- le proposte: punteggio attuale (abbonamenti, generi, umore, tempo, mi piace/non mi piace, già visti), "Mi sento fortunato" con "Un'altra proposta";
- Da vedere, serie in corso/seguite, trailer, condividi (incluso WhatsApp), link del profilo;
- le preferenze in localStorage, chiave `stasera`, **con lo stesso formato**: chi aprirà la nuova versione deve ritrovare tutte le sue scelte;
- funzionamento offline e installazione sulla schermata Home (PWA), con le stesse strategie di cache del service worker (shell, dati, locandine TMDB);
- caratteri ospitati sul sito (nessun Google Fonts), nessun cookie, nessuna statistica;
- SEO già fatta: titolo, descrizione, anteprima social (Open Graph), dati strutturati JSON-LD, `robots.txt`, `sitemap.xml`;
- l'attribuzione TMDB.

## Non obiettivi
- Nessuna funzione nuova (l'accesso è il progetto successivo).
- Nessun cambio grafico: si riusano CSS, caratteri, icone e testi attuali.
- Non si riscrivono gli script Python dei dati.

## Anti-obiettivi
- Perdere le preferenze salvate da chi usa già l'app.
- Un sito più lento o più pesante di oggi sul telefono.
- Interruzioni di servizio durante il passaggio di dominio.

## Decisioni prese
- **React + TanStack Start** (proprietario).
- **Cloudflare Workers**, piano gratuito, con l'adattatore Cloudflare ufficiale di TanStack Start (proprietario per Cloudflare; adattatore scelta di Claude).
- **TypeScript** *(scelta di Claude)*.
- **Stile:** CSS attuale portato così com'è (anche come file CSS globale), nessuna libreria UI o Tailwind *(scelta di Claude)*.
- **Pagine e indirizzi** *(scelta di Claude, per rispettare "stesse funzioni")*: nessuna nuova pagina indicizzabile per titolo o città in questo progetto. Le pagine sono quelle di oggi (home `/` e `/privacy/`), generate dal server di TanStack Start con gli stessi meta tag, JSON-LD e anteprima social; le risposte hanno intestazioni di cache per la CDN di Cloudflare. Le schede dei titoli e le sezioni possono avere un indirizzo proprio solo se serve a riprodurre il comportamento attuale (es. condividi). Pagine SEO per film, serie e città sono un possibile progetto futuro, da decidere a parte. `sitemap.xml` e `robots.txt` restano come oggi.
- **Dati:** gli script Python in `scripts/` e il workflow `.github/workflows/aggiorna.yml` restano la fonte dei dati, con gli stessi orari (07:40, 15:10, 18:20) *(scelta di Claude)*. Oggi i dati generati (`data/oggi.js`, `data/catalogo/`, `data/trame/`, `data/cinema/`) non vengono salvati nel repository ma pubblicati direttamente con GitHub Pages; nella nuova versione il workflow genera i dati, costruisce l'app e la pubblica su Cloudflare con `wrangler` (secret `CLOUDFLARE_API_TOKEN` e account ID nelle impostazioni del repository). Restano salvati nel repository solo `data/tv.json` e `data/meta.json`, come oggi. Il formato `data/oggi.js` può diventare JSON se più comodo, purché il workflow resti l'unica fonte.
- **Passaggio di dominio senza interruzioni** *(scelta di Claude)*: 1) il nuovo sito va online su un indirizzo Cloudflare provvisorio (`*.workers.dev`); 2) si verifica la parità; 3) si collega `popcorno.it` a Cloudflare spostando i nameserver da OVH, dopo aver ricreato su Cloudflare tutti i record esistenti (in particolare MX/SPF dell'email `privacy@popcorno.it`) (via CLI OVH già installata o dal pannello); 4) solo dopo si spegne GitHub Pages e si toglie il file `CNAME`.
- **Se una lettura dei dati fallisce** *(scelta di Claude, come oggi)*: i passaggi Python restano tolleranti agli errori e la pubblicazione avviene comunque con gli ultimi dati validi (per la guida TV, `data/tv.json` salvato nel repository); se manca un dato indispensabile, la pubblicazione si interrompe e resta online la versione precedente. `data/oggi.js` diventa JSON (`data/oggi.json`).
- **Service worker e vecchie versioni** *(scelta di Claude)*: il nuovo service worker ha lo stesso percorso `/sw.js` e lo stesso ambito, così sostituisce quello vecchio sui telefoni dove Popcorno è installato; usa nomi di cache nuovi ed elimina quelle `popcorno-*` vecchie. Va provato su un telefono con la vecchia versione installata.
- **Vecchio indirizzo GitHub Pages** (`fabriziolandi.github.io/popcorno/`) *(scelta di Claude)*: invece di spegnerlo, al suo posto resta una piccola pagina statica che porta a `popcorno.it` e si porta dietro le preferenze: legge `stasera` dal localStorage di quel vecchio indirizzo e lo passa una sola volta nell'indirizzo riusando il link personale `#profilo=…` che l'app ha già (frammento mai inviato al server), che la nuova app importa come fa oggi. Dopo il passaggio, il vecchio indirizzo esce dagli URL consentiti per l'accesso nel secondo progetto.
- **Verifica della parità prima del cambio DNS** *(scelta di Claude)*: (1) le funzioni di punteggio e di scelta dell'app attuale vengono estratte senza modifiche in un test che confronta vecchio e nuovo sugli stessi dati e preferenze (risultati identici); (2) una lista di controllo manuale di tutte le funzioni elencate sopra; (3) il proprietario prova il sito provvisorio sul proprio telefono e dà l'ok prima del cambio DNS.
- **Struttura del repository:** l'app vive nello stesso repository `popcorno`; la cartella `docs/` non viene pubblicata (con Cloudflare si pubblica solo l'output della build).

## Vincoli
- Piano gratuito Cloudflare Workers (100.000 richieste al giorno): le pagine devono poter essere messe in cache dalla CDN, i dati statici serviti come asset.
- Il service worker deve continuare a funzionare con i nuovi indirizzi e non mettere in cache le chiamate future a Supabase.
- Il segreto `TMDB_KEY` resta solo nel workflow, mai nel sito.

## Cosa deve fare il proprietario (Claude lo guida)
- Creare l'account Cloudflare (se non c'è) e un token API per la pubblicazione, da inserire nei secret del repository.
- Approvare il cambio DNS di `popcorno.it`.

## Lasciato al builder
- Organizzazione di cartelle, componenti, stato (hook React, eventuale store leggero) e routing con TanStack Router.
- Come caricare i dati (asset statici letti dal client o dai loader dei percorsi), purché resti veloce e funzioni offline.
- Strumento per il service worker (scritto a mano o plugin Vite), purché le strategie di cache restino le stesse.
- Test: almeno controlli automatici sulla logica delle proposte (stessi risultati dell'app attuale a parità di dati e preferenze) e sulla lettura del vecchio formato di `stasera`.
