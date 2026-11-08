# Lista di controllo della riscrittura (Task 10)

Data: 2026-11-08. Vecchia: `https://popcorno.it/` (GitHub Pages). Nuova: `https://popcorno.fabrizio-landi.workers.dev/` (Cloudflare, versione 0a3f35f2).
Prove automatiche con Chrome (390×844 e 1280×860), le due app affiancate; test di parità in `tests/`.

## Test automatici

| Controllo | Esito |
|---|---|
| `npm test` (223 test, compresi quelli di parità con l'app vecchia estratta senza modifiche) | ✅ tutti verdi |

## Funzioni (riferimento di parità della spec)

| Funzione | Come è stata provata | Esito |
|---|---|---|
| Vista Scegli: domande, scelte, aspetto | screenshot affiancati 390×844 e desktop | ✅ identica |
| Proposta dopo "Accendi" (punteggio) | stesse risposte su vecchia e nuova | ✅ stessa proposta (Friends, Cielo 20:55), stesso testo "Te lo propongo perché…" |
| Mi sento fortunato / Un'altra proposta | clic su entrambe | ✅ funziona; la scelta è casuale tra i migliori in tutte e due (stesso codice, test di parità) |
| Da vedere, La seguo, Trailer, Condividi, 👍/👎, "Ok, si guarda!" | presenti e uguali nella scheda | ✅ (uso effettivo: prova del proprietario) |
| Guida TV: fonti, ricerca, filtri, riga "ORA" | screenshot affiancati | ✅ identica |
| TV in chiaro, Sky/NOW, sport, Pluto TV, Samsung TV Plus | stessi programmi nella guida | ✅ |
| Cataloghi streaming completi | banner "Catalogo streaming: 27.110 titoli" (vecchia 27.190: dati di un'altra esecuzione) | ✅ |
| Cinema con orari per città | `/data/cinema/index.json` servito; scelta città nel Profilo | ✅ dati; prova manuale del proprietario |
| Profilo: abbonamenti, città, squadra, serie seguite, cosa ho imparato | screenshot affiancati | ✅ identico |
| Link del profilo `#profilo=` | test automatici (codifica uguale alla vecchia) | ✅ |
| Preferenze `stasera`, stesso formato | stesso JSON salvato da vecchia e nuova | ✅ identico |
| Telefono con la vecchia app installata | stesso indirizzo: prima la vecchia, poi la nuova | ✅ al 1° avvio si vede ancora la vecchia (normale con il service worker), dal 2° la nuova; cache vecchie `popcorno-shell-v3`/`popcorno-dati` cancellate; preferenze conservate |
| Offline, secondo avvio | modalità aereo simulata, su installazione nuova e su quella aggiornata | ✅ app completa (CSS, caratteri, guida) |
| Installazione sulla Home (manifest, icone) | manifest e icone serviti | ✅ |
| Nessun cookie, nessuna statistica | cookie del sito: nessuno; richieste esterne: solo `image.tmdb.org` (locandine) | ✅ come la vecchia |
| Caratteri ospitati sul sito | font serviti da `/fonts/` | ✅ |
| SEO: titolo, descrizione, Open Graph, JSON-LD, canonical | confronto dei tag | ✅ identici |
| `robots.txt`, `sitemap.xml` | 200 | ✅ |
| Pagina privacy | `/privacy/` 200, stesso testo; `/privacy` → 301 | ✅ (testo Cloudflare approvato, si applica al cambio di dominio) |
| Attribuzione TMDB | presente come nella vecchia | ✅ |
| Errori nella console | nessuno su entrambe | ✅ |

## Lighthouse (mobile, home, 5 esecuzioni alternate)

| | Vecchia | Nuova |
|---|---|---|
| Prestazioni (mediana) | 72 (oscilla tra 72 e 96) | 81 (oscilla tra 66 e 91) |
| Accessibilità / Best practice / SEO | 98 / 100 / 100 | 98 / 100 / 100 |
| LCP (titolo "Cosa guardiamo stasera?") | 2,5–2,7 s | 3,4–4,6 s |
| JS iniziale (compresso) | 35 KB (`oggi.js`, codice nel HTML) | 130 KB (React + app) |

Regola del piano "prestazioni nuova ≥ vecchia − 5": ✅ rispettata (81 ≥ 67).
Da sapere: sul telefono simulato lento il titolo compare circa 1,5 s più tardi, per il peso di React. Possibile miglioramento successivo (CSS in linea, JS più leggero), non bloccante.

## Ok del proprietario

- [x] Testo della privacy per Cloudflare approvato (2026-11-08).
- [ ] Prova sul proprio telefono dell'indirizzo `workers.dev` e ok esplicito al cambio di dominio.
