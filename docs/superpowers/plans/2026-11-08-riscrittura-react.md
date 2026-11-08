# Riscrittura di Popcorno in React + TanStack Start — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riscrivere l'app attuale (`index.html` con JS inline) in React + TanStack Start, pubblicata su Cloudflare Workers, con funzioni, aspetto e dati salvati identici.

**Architecture:** La logica pura (stato `stasera`, sorgenti, generi, punteggio, "Mi sento fortunato", link del profilo) viene portata in moduli TypeScript in `src/lib/`, provati contro l'app vecchia caricata in jsdom. Le viste (Scegli, In onda, Profilo, Privacy) diventano componenti React su TanStack Router; il server di TanStack Start genera la shell HTML con gli stessi meta tag. I dati restano prodotti dagli script Python nel workflow, scritti in `public/data/` e serviti come asset statici.

**Tech Stack:** TypeScript, React 19, TanStack Start (`@tanstack/react-start`) con TanStack Router, Vite, `@cloudflare/vite-plugin` + Wrangler, Vitest + jsdom + Testing Library. Python 3.12 per gli script esistenti.

**Spec:** `docs/superpowers/specs/2026-11-07-riscrittura-react-design.md`

## Global Constraints

- Stesse funzioni di oggi: nessuna funzione nuova, nessuna tolta, nessun cambio visibile di comportamento o di testo.
- Il formato di localStorage `stasera` resta identico (stesse chiavi, stessi valori); il link `#profilo=…` esistente deve continuare a funzionare.
- CSS, caratteri (`fonts/`), icone, testi, meta tag, Open Graph, JSON-LD, `robots.txt`, `sitemap.xml` copiati dall'app attuale; nessuna libreria UI, niente Tailwind, niente Google Fonts, nessun cookie, nessuna statistica.
- Dipendenze npm con versione esatta (`npm install --save-exact`).
- Piano gratuito Cloudflare Workers; `TMDB_KEY` solo nei secret di GitHub Actions; nessun segreto nel codice o nel repository.
- Tutto il lavoro su un ramo `riscrittura-react`; `main` e GitHub Pages restano invariati fino al Task 11.
- Il `package.json` esistente (strumenti Drizzle per il database, vedi `CLAUDE.md`) si estende, non si sostituisce: gli script `db:*` e le loro dipendenze restano. `db/`, `drizzle/`, `drizzle.config.ts` non si toccano.
- Testi dell'interfaccia in italiano, identici a oggi.

## Review Focus

1. **Telefono con la vecchia versione installata, primo avvio dopo il cambio:** il vecchio service worker serve dalla cache il vecchio `index.html`, che cerca `data/oggi.js`. Atteso: funziona ancora. Il workflow continua a pubblicare anche `data/oggi.js` per 30 giorni dopo il cambio (Task 9), e il nuovo `/sw.js` prende il posto del vecchio (Task 8).
2. **localStorage strano o vecchio:** JSON rotto, campi mancanti, `gen`/`watch`/`serie` non array, `tipo:"essai"` vecchio, localStorage che lancia eccezioni (navigazione privata). Atteso: l'app parte con i valori predefiniti uniti a quelli validi, come oggi (Task 2).
3. **Dati mancanti o parziali:** `oggi.json` senza `ondemand` o `cinema`, `tmdb.json` vuoto, catalogo o trame che danno 404, nessun orario per la città. Atteso: nessun crash, stessi messaggi vuoti di oggi ("NO SEGNALE"…) (Task 3 e 5).
4. **Ora e fuso orario:** il server Cloudflare gira in UTC, l'Italia no; programmi dopo mezzanotte (`hh<5`), `PAL.data` diverso da oggi. Atteso: orologio, filtri per orario e "Mi sento fortunato" usano solo l'ora del dispositivo, calcolata dopo il caricamento nel browser, senza errori di idratazione (Task 4 e 5).
5. **Link `#profilo=` creati dalla versione vecchia,** anche con caratteri accentati nella città. Atteso: si importano come oggi e il toast "Profilo importato: bentornato! 🍿" compare (Task 2).

---

### Task 0: Passi del proprietario (prima di tutto)

Non è codice: il proprietario lo fa con la guida dell'esecutore.

- [ ] **Step 1:** Il proprietario crea (o conferma) l'account Cloudflare. Annota l'**Account ID**.
- [ ] **Step 2:** Crea un token API con il modello "Edit Cloudflare Workers" e lo salva nei secret del repository GitHub come `CLOUDFLARE_API_TOKEN`; l'Account ID va in `CLOUDFLARE_ACCOUNT_ID`.
- [ ] **Step 3:** Verifica locale: `npx wrangler@latest whoami` dopo `npx wrangler login`. Atteso: mostra l'account.

Fino a quando non è fatto, i Task 1–8 si sviluppano e si provano in locale (`npm run dev`, `npx wrangler dev`).

### Task 1: Scheletro TanStack Start su Cloudflare

**Files:**
- Modify: `package.json` (aggiunge dipendenze e script, conserva `db:*`), `.gitignore` (aggiunge `dist/`, `.wrangler/`, `public/data/catalogo/`, `public/data/trame/`, `public/data/cinema/`, `public/data/oggi.json`, `public/data/oggi.js`)
- Create: `vite.config.ts`, `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`
- Move (git mv): `fonts/` → `public/fonts/`, `icons/` → `public/icons/`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml` → `public/`, `data/tv.json`, `data/meta.json` → `public/data/`
- Create: `tests/legacy/index.legacy.html` (copia byte per byte dell'attuale `index.html`, congelata: è il riferimento di parità), `tests/legacy/privacy.legacy.html` (copia di `privacy/index.html`)
- Test: `tests/smoke.test.ts`

- [ ] **Step 1:** Creare il ramo: `git switch -c riscrittura-react`.
- [ ] **Step 2:** Installare con versioni esatte `@tanstack/react-start`, `@tanstack/react-router`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `@cloudflare/vite-plugin`, `wrangler`, `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `jsdom`, `@testing-library/react`. Configurazione secondo la guida ufficiale TanStack Start → hosting Cloudflare Workers: `vite.config.ts` con `cloudflare({ viteEnvironment: { name: "ssr" } })`, `tanstackStart()`, `react()`; `wrangler.jsonc` con `name: "popcorno"`, `main: "@tanstack/react-start/server-entry"`, `compatibility_flags: ["nodejs_compat"]`, data di compatibilità di oggi.
- [ ] **Step 3:** Script in `package.json`: `dev` (`vite dev`), `build` (`vite build`), `preview` (`vite preview`), `deploy` (`npm run build && wrangler deploy`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`).
- [ ] **Step 4: Test che fallisce** `tests/smoke.test.ts`: dopo `npm run build`, la cartella `dist/` contiene `client/fonts/figtree-400.woff2` e `client/manifest.webmanifest`; il percorso `/` reso dal server contiene `<html lang="it">` e `<title>` uguale a quello di `tests/legacy/index.legacy.html`.
- [ ] **Step 5:** `src/routes/__root.tsx` con `<html lang="it">`, tutto il `<head>` dell'app vecchia (meta, OG, JSON-LD, preload del carattere, link al manifest e alle icone) copiato tale e quale, e `index.tsx` provvisorio.
- [ ] **Step 6:** `npm run build && npm test` → PASS. `npx wrangler dev` → `/` risponde 200.
- [ ] **Step 7: Commit** `git commit -m "Scheletro TanStack Start su Cloudflare"`

### Task 2: Stato `stasera` e link del profilo

**Files:**
- Create: `src/lib/types.ts`, `src/lib/state.ts`, `src/lib/profile-link.ts`
- Test: `tests/state.test.ts`, `tests/profile-link.test.ts`

**Interfaces:**
- Produces:
  - `type Stasera = { tempo: string; chi: string; umore: string[]; tipo: string; gen: string[]; free: boolean; subs: string[]; team: string; citta: string; likes: Record<string, number>; liked: string[]; disliked: string[]; seen: string[]; watch: TitleRef[]; serie: SerieRef[] }`
  - `type TitleRef = { t: string; tmdb?: string }`, `type SerieRef = { t: string; tmdb: string; s: number; e: number }`
  - `type Item` in `types.ts`: i campi dei dati (`t, ty, s, also?, m, w, g, v?, vc?, pop?, time?, dur?, cat?, teams?, kids?, nuovo?, tmdb?, p?, d?, l?, gs?, y?, c?, e?`), tipi letti da `public/data/tv.json` e da `fromRow` dell'app vecchia.
  - `DEFAULT_STATE: Stasera` (valori della riga 337 dell'app vecchia)
  - `loadState(storage: Storage | null): Stasera`, `saveState(st: Stasera, storage: Storage | null): void`
  - `SYNC_KEYS` (stessa lista), `profileLink(st: Stasera, base: string): string`, `parseProfileHash(hash: string): Partial<Stasera> | null`
  - `refOf(it: Item): TitleRef`, `sameRef(a: TitleRef, b: TitleRef): boolean`, `inWatch(st, it): boolean`, `serieOf(st, it): SerieRef | undefined`
  - Funzioni pure che restituiscono un nuovo `Stasera`: `toggleWatch(st, it)`, `feedback(st, it, v: 1 | -1)` (stessa logica delle righe 488–492, senza toast né rendering)

- [ ] **Step 1: Test che falliscono** (`tests/state.test.ts`):
  - `loadState` con storage vuoto restituisce `DEFAULT_STATE`.
  - con `'{"tipo":"essai"}'` → `tipo === "film"` e `gen` contiene `"essai"`.
  - con `'{"gen":"x","watch":null}'` → `gen` e `watch` sono `[]`.
  - con JSON rotto, o con uno storage il cui `getItem` lancia un'eccezione, → `DEFAULT_STATE`.
  - `saveState` poi `loadState` restituisce lo stesso oggetto (andata e ritorno identici).
  - `feedback(st, {t:"Dune", g:"Fantascienza", …}, 1)`: `likes.Fantascienza === 1`, `liked` e `seen` contengono `"Dune"`, `disliked` no.
  - `feedback(…, -1)` → `disliked` contiene il titolo e `liked` no.
- [ ] **Step 2: Test che falliscono** (`tests/profile-link.test.ts`): un link generato da `tests/legacy/index.legacy.html` (in jsdom: impostare `stasera` con `citta:"Forlì"`, chiamare `window.syncLink()`) letto da `parseProfileHash` restituisce gli stessi valori. `profileLink` produce esattamente la stessa stringa di `syncLink` a parità di stato e indirizzo base.
- [ ] **Step 3:** Run `npx vitest run tests/state.test.ts tests/profile-link.test.ts` → FAIL.
- [ ] **Step 4:** Implementare portando la logica delle righe 336–347, 683–693 e 707–717 dell'app vecchia.
- [ ] **Step 5:** Run → PASS. **Commit** `git commit -m "Stato stasera e link del profilo"`

### Task 3: Dati, sorgenti, generi e punteggio (parità con l'app vecchia)

**Files:**
- Create: `src/lib/sources.ts` (`SRC`, `OD`, `allSrc`, `isFree`, `has`, `mySrc`, `available`), `src/lib/genres.ts` (`GEN`, `GT`, `KIDG`, `ARTE`, `ARTE_EN`, `POP_LANG`, `isEssai`, `genHit`, `genOk`, `MOODW`, `CHIW`, `TYW`, `TEAMS`, `CITTA`, `Q`), `src/lib/scoring.ts`, `src/lib/lucky.ts`, `src/lib/data.ts`
- Create: `tests/legacy/harness.ts`, `tests/fixtures/oggi.json`, `tests/fixtures/catalogo-netflix.json`
- Modify: `scripts/build.py` (aggiunge `--json`: stampa solo il JSON di `meta`; senza opzione resta come oggi)
- Test: `tests/parity.test.ts`, `tests/data.test.ts`

**Interfaces:**
- Consumes: `Stasera`, `Item`, `inWatch`, `serieOf` (Task 2)
- Produces:
  - `type Palinsesto = { data: string; etichetta: string; aggiornato: string; fonti: string[]; items: Item[]; ondemand: Item[]; cinema: Item[] }`
  - `type Scored = { it: Item; sc: number; why: string[] }` — `why` contiene le stesse stringhe di oggi, con `<b>…</b>`
  - `score(it: Item, st: Stasera): { sc: number; why: string[] }`
  - `candidates(pal: Palinsesto, st: Stasera, opts: { noTime?: boolean; shows?: CityShows | null }): Scored[]`
  - `pickNow(pal, st, shows): Scored[]` (stesso ripiego di oggi, quando non c'è nulla nel tempo disponibile)
  - `lucky(items: Item[], st: Stasera, opts: { now: Date; palDate: string; skip: Set<string>; random: () => number }): Scored | null`
  - `dataVersion(pal: Palinsesto | null): string` (come `DV`), `loadPalinsesto(): Promise<Palinsesto>`, `loadCatalogs(st): Promise<Item[]>`, `loadPlot(it): Promise<string>`, `loadCinemaIndex()`, `loadCityShows(citta): Promise<CityShows | null>`, `fromRow(key, row): Item | null`, `filmShows(it, shows)`, `nextTimes(it, shows)`
  - `type CityShows` (forma di `data/cinema/<slug>.json`)

- [ ] **Step 1:** `tests/fixtures/oggi.json` = `python3 -X utf8 scripts/build.py --json public/data/meta.json public/data/tv.json <(echo '{}')`, più a mano 6 titoli in `ondemand` e 3 in `cinema` (con e senza `tmdb`, `v`, `vc`, `cat`, uno d'essai, uno solo per la famiglia, uno sport con `teams`).
- [ ] **Step 2:** `tests/legacy/harness.ts`: `loadLegacy(pal: Palinsesto, stasera: object, opts?: { now?: Date; random?: () => number }): LegacyWindow` apre `tests/legacy/index.legacy.html` in jsdom (`runScripts: "dangerously"`), inserisce `window.PALINSESTO = pal` al posto dello script di `data/oggi.js`, imposta `localStorage.stasera`, sostituisce `fetch` con una funzione che risponde con le fixture o con 404, `Date` e `Math.random` con quelli passati. Espone `window.candidates`, `window.score`, `window.lucky`, `window.syncLink`, e la lista `list` letta dopo `lucky()` tramite il DOM del risultato.
- [ ] **Step 3: Test che falliscono** (`tests/parity.test.ts`), per almeno 8 profili (predefinito; famiglia; solo sport con squadra "Inter"; essai; gratis; tempo "90"; con liked/disliked/seen; con watch e serie):
  - `candidates(pal, st, {})` restituisce gli stessi titoli, nello stesso ordine e con gli stessi `sc` e `why`, di `window.candidates()` del vecchio.
  - `lucky(…, {random: () => 0.3, now: <data del palinsesto alle 21:00>})` sceglie lo stesso titolo del vecchio con gli stessi `Math.random` e `Date`.
- [ ] **Step 4: Test che falliscono** (`tests/data.test.ts`):
  - `loadPalinsesto` con `ondemand` o `cinema` mancanti restituisce `[]` per quei campi.
  - `loadCatalogs` con un 404 su un catalogo non lancia eccezioni e restituisce gli altri.
  - `loadPlot` con trama mancante restituisce `"Film del 2021."` (stessa regola di oggi).
  - `loadCityShows("forli")` trova `"Forlì"` (stessa normalizzazione `nrm`).
- [ ] **Step 5:** Run `npx vitest run tests/parity.test.ts tests/data.test.ts` → FAIL.
- [ ] **Step 6:** Implementare portando le righe 273–335, 373–415, 592–663 e 719–758 dell'app vecchia, senza toccare il DOM. I dati si leggono da `/data/oggi.json` e da `/data/catalogo|trame|cinema/…` con lo stesso parametro di versione.
- [ ] **Step 7:** Run → PASS. **Commit** `git commit -m "Logica delle proposte portata in TypeScript, uguale alla versione attuale"`

### Task 4: Shell dell'app: CSS, intestazione, barra in basso, toast

**Files:**
- Create: `src/styles/app.css` (tutto il CSS dei due `<style>` dell'app vecchia, con i percorsi dei caratteri resi assoluti `/fonts/…`), `src/components/Header.tsx` (logo e orologio), `src/components/Nav.tsx`, `src/components/Toast.tsx`, `src/components/Why.tsx`, `src/app-state.tsx`
- Modify: `src/routes/__root.tsx`, `src/routes/index.tsx`
- Test: `tests/shell.test.tsx`

**Interfaces:**
- Consumes: `loadState`, `saveState`, `parseProfileHash` (Task 2), `loadPalinsesto`, `loadCatalogs` (Task 3)
- Produces:
  - `AppStateProvider` e `useApp(): { st: Stasera; setSt(next: Stasera): void; pal: Palinsesto | null; catalog: Item[]; toast(msg: string): void; view: "scegli" | "onda" | "prof"; setView(v): void }`. `setSt` salva sempre in localStorage.
  - `<Why html={string} />` rende le stringhe `why` interpretando solo `<b>…</b>` come `<strong>` e mostrando tutto il resto come testo. *(Scelta del piano: nessun `dangerouslySetInnerHTML`.)*

- [ ] **Step 1: Test che falliscono:**
  - Il rendering lato server di `/` contiene la barra con i tre pulsanti (stesse etichette e stessi SVG) e l'orologio vuoto: l'ora si calcola solo nel browser.
  - Con `location.hash = "#profilo=…"` all'avvio, lo stato viene importato, compare il toast "Profilo importato: bentornato! 🍿" e l'hash viene tolto.
  - `<Why html="gioca <b>Inter</b>" />` rende `gioca <strong>Inter</strong>`; `<Why html="<img src=x>" />` rende testo, nessun elemento `img`.
  - Il rendering con `TZ=UTC` e poi l'idratazione con `TZ=Europe/Rome` non segnala differenze di idratazione.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementare. Il cambio di vista mantiene il comportamento attuale (una sola pagina, la barra in basso cambia sezione; *scelta del piano*: la vista corrente non è nell'indirizzo, come oggi).
- [ ] **Step 4:** Run → PASS. Confronto visivo: `npm run dev` e l'app vecchia aperta accanto, a 390×844; intestazione e barra identiche.
- [ ] **Step 5: Commit** `git commit -m "Shell dell'app: stile, intestazione, barra e toast"`

### Task 5: Vista Scegli: domande, proposta, Mi sento fortunato, riprendi

**Files:**
- Create: `src/components/scegli/Ask.tsx` (domande, umore, città, pulsante accensione, banner, pulsante 🍀), `src/components/scegli/Result.tsx` (scheda risultato: osd, facts, trama, 👍/👎, zap/altra proposta, "Un'altra proposta", Da vedere, segui serie, trailer, condividi, orari cinema), `src/components/scegli/Resume.tsx`
- Test: `tests/scegli.test.tsx`

**Interfaces:**
- Consumes: `useApp` (Task 4), `pickNow`, `lucky`, `loadCityShows`, `filmShows`, `nextTimes`, `loadPlot` (Task 3), `feedback`, `toggleWatch`, `serieOf` (Task 2), `<Why>`

- [ ] **Step 1: Test che falliscono** (con `tests/fixtures/oggi.json`):
  - Premendo il pulsante di accensione compare il primo titolo di `pickNow` con i suoi `why`; "zap" passa al secondo.
  - 👎 su una proposta di "Mi sento fortunato" ne propone subito un'altra e non ripropone quella scartata.
  - Senza candidati compare il riquadro "NO SEGNALE" con lo stesso testo di oggi.
  - Nella modalità cinema con città senza orari, non c'è nessun crash e la lista è quella dei film in sala.
  - "Condividi" chiama `navigator.share` con lo stesso testo di oggi; senza `navigator.share` apre `https://wa.me/?text=…`.
  - Gli HTML generati per un titolo fisso sono uguali, a parte gli spazi, al `#res` dell'app vecchia nello stesso stato (confronto tramite l'harness del Task 3).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementare portando `renderAsk`, `showRes`, `osd`, `facts`, `renderResume`, `shareIt`, `showsHtml` (righe 354–497, 607–624, 694–706).
- [ ] **Step 4:** Run → PASS. **Commit** `git commit -m "Vista Scegli"`

### Task 6: Vista In onda: guida, ricerca, filtri

**Files:**
- Create: `src/components/onda/Guide.tsx`
- Test: `tests/onda.test.tsx`

**Interfaces:**
- Consumes: `useApp`, `mySrc`, `SRC`, `bgOf`/`IMG` (spostati in `src/lib/images.ts` in questo task), `showOne` (diventa `openItem(it)` in `useApp`: imposta la vista "scegli" con quel titolo come risultato)

- [ ] **Step 1: Test che falliscono:**
  - I filtri hanno le stesse etichette e lo stesso ordine di oggi; "tutti" è selezionato all'inizio.
  - La ricerca "dune" trova "Dune" ignorando maiuscole e accenti (stessa `norm`).
  - Toccando un titolo, si passa a Scegli con quel titolo come risultato.
  - Il riquadro canale (`lcnBox`) mostra il numero LCN o il nome dell'app come oggi.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementare portando `renderGuide`, `lcnBox`, `showOne`, `norm` (righe 497–545, 664–682).
- [ ] **Step 4:** Run → PASS. **Commit** `git commit -m "Vista In onda"`

### Task 7: Vista Profilo e pagina Privacy

**Files:**
- Create: `src/components/prof/Profile.tsx`, `src/routes/privacy.tsx`
- Test: `tests/prof.test.tsx`, `tests/privacy.test.ts`

**Interfaces:**
- Consumes: `useApp`, `SRC`, `TEAMS`, `profileLink`

- [ ] **Step 1: Test che falliscono:**
  - Abbonamenti, squadra, statistiche "Cosa ho imparato di te", sorgenti gratuite, link personale, conteggio del catalogo e crediti TMDB uguali a `renderProf` dell'app vecchia nello stesso stato.
  - Cambiare un abbonamento aggiorna localStorage.
  - Il pulsante "Copia" copia esattamente `profileLink(st, location.origin + "/")`.
  - `/privacy/` (con la barra finale) risponde 200 con lo stesso `<title>`, la stessa meta description e lo stesso testo di `tests/legacy/privacy.legacy.html` (confronto del testo visibile); anche `/privacy` risponde, con un reindirizzamento.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementare (righe 546–591; contenuto della privacy copiato tale e quale).
- [ ] **Step 4:** Run → PASS. **Commit** `git commit -m "Profilo e privacy"`

### Task 8: Service worker e installazione

**Files:**
- Create: `public/sw.js`, `src/lib/sw-caches.ts`
- Modify: `src/routes/__root.tsx` (registrazione di `/sw.js` come oggi)
- Test: `tests/sw.test.ts`

**Interfaces:**
- Produces: `cachesToDelete(names: string[], keep: string[]): string[]` in `sw-caches.ts`, con la stessa logica copiata in `public/sw.js` (il service worker non passa da Vite).

- [ ] **Step 1: Test che falliscono:**
  - `cachesToDelete(["popcorno-shell-v3","popcorno-dati","popcorno-img","altro"], ["popcorno-shell-v4","popcorno-dati-v2","popcorno-img"])` → `["popcorno-shell-v3","popcorno-dati"]` (si cancellano solo le vecchie `popcorno-*`; `popcorno-img` resta, così le locandine già scaricate non si perdono).
  - Il file `public/sw.js` passa `node --check`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** `public/sw.js`: stesso percorso e ambito `/`; shell `popcorno-shell-v4` (prima `/`, poi rete in background, come oggi), dati `popcorno-dati-v2` (prima la rete, poi la cache) per `/data/`, locandine `popcorno-img` (prima la cache) per `image.tmdb.org`; `skipWaiting` + `clients.claim`; mai in cache le richieste non GET o verso altri domini (prepara il secondo progetto).
- [ ] **Step 4:** Run → PASS. Prova manuale da annotare nel commit: in Chrome, aprire l'app vecchia servita in locale, poi servire la nuova sullo stesso indirizzo e ricaricare due volte. Atteso: è attivo il nuovo service worker, la vecchia cache shell non c'è più, le preferenze sono intatte.
- [ ] **Step 5: Commit** `git commit -m "Service worker che sostituisce quello vecchio"`

### Task 9: Workflow: dati, build e pubblicazione su Cloudflare (indirizzo provvisorio)

**Files:**
- Modify: `.github/workflows/aggiorna.yml`, `scripts/build.py` (solo l'opzione `--json` del Task 3)
- Test: esecuzione del workflow sul ramo

- [ ] **Step 1:** Tutti i percorsi `data/…` del workflow diventano `public/data/…` (anche la cache degli orari dei cinema e il commit di `tv.json` e `meta.json`). Si aggiungono questi passi:
  - `python3 scripts/build.py --json … > public/data/oggi.json` più `python3 -m json.tool public/data/oggi.json > /dev/null`;
  - `python3 scripts/build.py … > public/data/oggi.js` per i telefoni con la versione vecchia (Review Focus 1), con un commento "togliere dopo il <data del cambio + 30 giorni>";
  - `actions/setup-node`, `npm ci`, `npm test`, `npm run build`, `npx wrangler deploy` con `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
- [ ] **Step 2:** Sul ramo `riscrittura-react` il workflow pubblica solo su Cloudflare (`*.workers.dev`) e **non** esegue i passi di GitHub Pages, né il commit della guida: `if: github.ref == 'refs/heads/main'` sui passi Pages e commit. Si aggiunge l'attivazione `workflow_dispatch` anche sul ramo.
- [ ] **Step 3:** Se manca `oggi.json` valido, il job si ferma prima di `wrangler deploy`: resta online la versione precedente. I passi di lettura restano `continue-on-error` come oggi.
- [ ] **Step 4:** Lanciare il workflow a mano sul ramo. Atteso: job verde e `https://popcorno.<sottodominio>.workers.dev/` mostra l'app con i dati di oggi.
- [ ] **Step 5: Commit** `git commit -m "Workflow: pubblicazione su Cloudflare Workers"`

### Task 10: Verifica della parità e ok del proprietario

- [ ] **Step 1:** `npm test`: tutti verdi, compresi i test di parità.
- [ ] **Step 2:** Lista di controllo manuale, scritta in `docs/superpowers/plans/2026-11-08-riscrittura-checklist.md`, con una riga per ogni funzione elencata nella spec ("Riferimento di parità"), provata sull'indirizzo `workers.dev` a 390×844 e su desktop, con l'app vecchia accanto.
- [ ] **Step 3:** Lighthouse mobile su vecchia e nuova (home): prestazioni della nuova ≥ della vecchia meno 5 punti; peso del JS iniziale annotato.
- [ ] **Step 4:** Il proprietario prova l'indirizzo `workers.dev` sul proprio telefono e dà l'ok esplicito. **Senza questo ok non si passa al Task 11.**

### Task 11: Passaggio del dominio e vecchio indirizzo

**Files:**
- Create: `gh-redirect/index.html`
- Modify: `.github/workflows/aggiorna.yml` (passi Pages: pubblica solo `gh-redirect/`), `wrangler.jsonc` (rotta `popcorno.it` come dominio personalizzato)
- Delete: `index.html`, `privacy/index.html`, `sw.js` della radice, `CNAME`, `.nojekyll`

- [ ] **Step 1: Inventario DNS** con la CLI OVH: `ovhcloud domain zone record list popcorno.it` (o il comando equivalente della versione installata). Salvare l'elenco (MX e SPF dell'email `privacy@popcorno.it`, eventuali TXT di verifica, i record di GitHub Pages) in `docs/superpowers/plans/2026-11-08-dns-popcorno.md`.
- [ ] **Step 2:** Il proprietario aggiunge `popcorno.it` a Cloudflare (piano Free). Si ricreano su Cloudflare **tutti** i record dell'inventario tranne quelli di GitHub Pages; poi si confronta con l'inventario, riga per riga.
- [ ] **Step 3:** Con l'ok del proprietario, i nameserver di `popcorno.it` su OVH passano a quelli indicati da Cloudflare. Atteso dopo la propagazione: `dig NS popcorno.it` mostra Cloudflare e `dig MX popcorno.it` restituisce lo stesso valore di prima.
- [ ] **Step 4:** Dominio personalizzato `popcorno.it` (e `www`, se esiste nell'inventario) collegato al Worker. Atteso: `curl -I https://popcorno.it/` → 200 dal Worker.
- [ ] **Step 5:** `gh-redirect/index.html`: legge `localStorage.stasera` sul vecchio indirizzo; se esiste, costruisce il link `#profilo=…` con la stessa codifica di `syncLink`, altrimenti usa `https://popcorno.it/`; poi `location.replace` verso quel link. *(Scelta del piano: si riusa l'importazione `#profilo=` che esiste già, invece di un nuovo `#importa=`.)* Test: con jsdom e `stasera` impostato, la destinazione è decodificabile da `parseProfileHash` con gli stessi valori.
- [ ] **Step 6:** Merge di `riscrittura-react` in `main`. Su `main` il workflow pubblica su Cloudflare e, su Pages, solo `gh-redirect/`. Si eliminano i file vecchi e `CNAME`.
- [ ] **Step 7:** Verifiche: `https://popcorno.it/` è servito dal Worker; `https://fabriziolandi.github.io/popcorno/` porta a `popcorno.it` con le preferenze; un'email di prova a `privacy@popcorno.it` arriva.
- [ ] **Step 8: Commit** `git commit -m "popcorno.it su Cloudflare; il vecchio indirizzo porta al nuovo"`
