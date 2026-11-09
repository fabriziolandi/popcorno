# Accesso facoltativo e storico dei gusti — piano di lavoro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popcorno con accesso facoltativo (link via email con codice, Google), preferenze sincronizzate su tutti i dispositivi, storico dei segnali di gusto, tasto "L'ho visto" e pagina "I miei dati".

**Architecture:** Tutto nel browser: `@supabase/supabase-js` caricato solo quando serve (import dinamico), sessione nel localStorage, dati protetti dalle politiche RLS già scritte in `drizzle/`. Un livello puro (`sync-merge.ts`) dà a ogni campo e a ogni elemento delle liste una data di modifica e unisce locale e account senza perdere nulla. Un motore di sincronizzazione (`sync.ts`) e una coda di eventi (`events.ts`) parlano con Supabase. "Elimina l'account" usa la funzione `delete_account` già nel database: non servono funzioni lato server né la chiave di servizio.

**Tech Stack:** React 19, TanStack Start su Cloudflare Workers, `@supabase/supabase-js` 2.118.0 (versione fissata), Vitest + jsdom, Drizzle (solo locale, schema già pronto).

**Spec:** `docs/superpowers/specs/2026-11-07-accesso-e-storico-design.md`

## Global Constraints

- Solo il progetto Supabase **popcorno**, ref `gvdarnmxnigprebwjglq`. Mai toccare altri progetti dell'account.
- Nel sito e nel repository va solo la chiave **publishable**: la chiave di servizio e la password del database non vanno mai nel codice, nei log o in chat.
- **Senza account non cambia nulla:**
  - nessuna richiesta a `*.supabase.co`;
  - nessun evento registrato o messo in coda;
  - nessun nuovo popup, promemoria o blocco.
- **Unico invito ad accedere:** una riga discreta nel Profilo. Fino al go-live (Task 10) è visibile solo con `?account=1`, oppure se c'è già una sessione.
- **Segnali registrati:** solo quelli della specifica (`eventKinds` in `db/schema.ts`). Mai scroll, tempo passato o ricerche.
- **Schema:** `db/schema.ts` e le migrazioni `drizzle/0000`/`0001` restano come sono. Questo piano non cambia lo schema.
- Le versioni npm sono fissate (niente `^`).
- **Testi:** tutti in italiano, col tono dell'app.
- **Pubblicazione delle prove:** mai sul Worker `popcorno`, che ora serve popcorno.it. I rami diversi da `main` pubblicano su `popcorno-prove` (Task 1).
- **Indirizzi di ritorno consentiti:**
  - `https://popcorno.it/**`
  - `https://popcorno-prove.fabrizio-landi.workers.dev/**`
  - `http://localhost:3000/**`
- **Cloudflare:** niente funzioni con cookie (Bot Fight Mode, challenge). La privacy dice "nessun cookie" e continua a dirlo.

## Decisioni (Rulings) rispetto alla specifica

- **R1 — Niente `@supabase/ssr` né cookie di sessione:** la sessione sta nel localStorage del browser (comportamento predefinito di supabase-js). Il server non ha bisogno di sapere chi sei, perché ogni dato passa da supabase-js con RLS. Così la privacy continua a dire "Popcorno non usa cookie". Costo se sbagliata: un giorno servirebbero pagine personali generate dal server; si aggiungeranno allora.
- **R2 — "Elimina l'account":** si chiama `supabase.rpc("delete_account")`, già nel database (SECURITY DEFINER, cancella `auth.users` e a cascata il resto). Non servono la chiave di servizio né un secret Cloudflare. Costo se sbagliata: nessuno di sicurezza, perché la funzione cancella solo `auth.uid()`.
- **R3 — Link valido in qualunque browser:** il link dell'email porta a `{{ .RedirectTo }}?token_hash=…&type=email`, che l'app verifica con `verifyOtp`. Funziona anche se si apre in un browser diverso da quello che l'ha chiesto. Il codice di 6 cifre (`{{ .Token }}`) resta per l'app sulla schermata Home. Google usa PKCE (`?code=`), che supabase-js scambia da solo.
- **R4 — `open` solo quando la persona sceglie un titolo:**
  - conta il tocco su un titolo della striscia "Sugli altri canali";
  - conta l'apertura di un titolo dalla Guida o dalla lista (`openItem`);
  - non contano le proposte automatiche e i "Cambia canale", che sono uno zapping e non una scelta.
  - In `ctx.shown` vanno al massimo 10 titoli visibili insieme.
- **R5 — Tipi di evento senza un tasto oggi:**
  - `unlike`/`undislike` oggi non hanno un gesto proprio: 👎 dopo 👍 è un `dislike`. Restano nel database per il futuro.
  - Anche `go` non ha un gesto proprio, perché l'app non ha un "link per vederlo".
  - `showtimes` si registra toccando una sala o "Cerca orari".
- **R6 — Cosa conta come "campo singolo":** `tempo, chi, umore, tipo, gen, free, subs, team, citta, likes`, e tra due valori vince il più recente. `likes` è un solo campo: i conteggi per genere non si sommano tra dispositivi.
- **R7 — Liste che si uniscono:** `watch, serie, liked, disliked, seen`. La chiave di un elemento è `tmdb` se c'è, altrimenti il titolo, e il titolo nudo per `liked/disliked/seen`.
- **R8 — Dove sta "I miei dati":** è una sezione dell'app (`view: "dati"`), raggiunta dal Profilo, non una rotta nuova. L'HTML generato dal server non contiene mai dati personali.
- **R9 — Record DNS per SendGrid:** vanno su **Cloudflare** (non più OVH), in "DNS only".

## Review Focus

1. **Due dispositivi offline che modificano la stessa lista.** Se una serie è tolta sul telefono e un'altra aggiunta sul computer, dopo la sincronizzazione la prima resta tolta e la seconda c'è (Task 2).
2. **Dati locali vecchi senza date più account già pieno.** I campi singoli dell'account vincono e le liste si uniscono: niente sparisce (Task 2).
3. **Sessione scaduta o refresh token non valido all'avvio.** L'app funziona in locale, mostra "non sei dentro" e non entra in un ciclo di errori o di richieste (Task 4).
4. **Supabase irraggiungibile o offline con sessione attiva.**
   - L'interfaccia non si blocca.
   - Le modifiche restano locali e partono al ritorno della rete.
   - Gli eventi aspettano in coda (Task 4, Task 5).
5. **"Ricorda le mie scelte" spento su un altro dispositivo.** La coda locale viene scartata alla prima risposta di rifiuto (RLS), senza nuovi tentativi (Task 5).

---

### Task 0: Passi del proprietario (Claude guida, la sessione con Chrome aiuta)

Non bloccano i Task 1–9, che si provano con Supabase vero solo in locale o su `popcorno-prove`. Servono prima del Task 10.

- [ ] **Step 1: Supabase → Authentication → URL Configuration**
  - Site URL: `https://popcorno.it`.
  - Redirect URLs: i tre indirizzi di ritorno dei Global Constraints.
- [ ] **Step 2: Authentication → Sign In / Providers → Email**
  - Email attiva, "Confirm email" attivo.
  - Lunghezza del codice OTP: **6**.
  - Scadenza: 3600 s.
- [ ] **Step 3: Email template "Magic Link" e "Confirm signup"**
  - Oggetto `Il tuo accesso a Popcorno`.
  - Corpo preso da `supabase/templates/accesso.html` (scritto nel Task 3), che usa `{{ .RedirectTo }}`, `{{ .TokenHash }}` e `{{ .Token }}`.
- [ ] **Step 4: SendGrid**
  - Creare l'account e una chiave API con solo "Mail Send".
  - Domain Authentication per `popcorno.it`: i CNAME vanno su Cloudflare in DNS only.
  - Aggiungere `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:privacy@popcorno.it`.
  - In Supabase → Authentication → SMTP Settings:
    - host `smtp.sendgrid.net`, porta 587, utente `apikey`;
    - password: la chiave, scritta dal proprietario nel dashboard;
    - mittente `accesso@popcorno.it`, nome `Popcorno`.
- [ ] **Step 5: Google Cloud Console**
  - Schermata di consenso: nome Popcorno, dominio `popcorno.it`, privacy `https://popcorno.it/privacy/`.
  - Client OAuth "Web" con redirect `https://gvdarnmxnigprebwjglq.supabase.co/auth/v1/callback`.
  - Client ID e secret vanno in Supabase → Providers → Google, inseriti dal proprietario.
- [ ] **Step 6: Annotare nel ledger** la data di ogni passo e il risultato di un'email di prova (arrivata, non in spam, link e codice presenti). Mai i valori delle chiavi.

### Task 1: Pubblicazione delle prove su un Worker separato e migrazioni verificate

**Files:**
- Modify: `.github/workflows/aggiorna.yml` (passo "Pubblica su Cloudflare Workers")
- Create: `tests/db/rls.test.ts`

**Interfaces:**
- Produces: l'indirizzo di prova `https://popcorno-prove.fabrizio-landi.workers.dev/`, usato dai Task 3–10.

- [ ] **Step 1: Pubblicare i rami di prova su `popcorno-prove`**
  - Su `main` il passo esegue `npx wrangler deploy`.
  - Sugli altri rami esegue `npx wrangler deploy --name popcorno-prove`.
  - Si sceglie con `if: github.ref == 'refs/heads/main'` su due passi distinti.
  - Il commento accanto spiega che il Worker `popcorno` serve popcorno.it.
- [ ] **Step 2: Verificare che le migrazioni siano applicate a popcorno**
  - Comando: dal checkout principale (che ha `.env`) `npm run db:migrate`.
  - Atteso: "migrations applied" oppure nessuna migrazione da applicare.
  - Non stampare `DATABASE_URL`.
- [ ] **Step 3: Scrivere `tests/db/rls.test.ts`**
  - Ambiente `node`, saltato con `describe.skipIf(!process.env.DATABASE_URL)`.
  - Usa `postgres` e `dotenv`. Ogni caso gira in una transazione chiusa con `ROLLBACK`.
  - Prepara un utente: `insert into auth.users (id, email) values (gen_random_uuid(), 'prova@example.com')`. Poi `set local role authenticated` e `set local request.jwt.claims = '{"sub":"<id>","role":"authenticated"}'`.
  - Casi:
    - `il trigger crea profilo e preferenze`: c'è 1 riga in `profiles` e 1 in `preferences` per l'id.
    - `vedo solo i miei eventi`: un secondo utente inserisce 1 evento; il primo ne legge 0.
    - `con track_events spento l'inserimento è rifiutato`: con `update profiles set track_events=false` l'insert di un evento lancia l'errore `42501`.
    - `created_at non si può impostare`: l'insert con `created_at` lancia `42501`.
    - `delete_account cancella tutto`: dopo `select public.delete_account()` restano 0 righe in `profiles`, `preferences` ed `events` per l'id.
    - `anon non legge nulla`: con `set local role anon`, `select` da `preferences` lancia `42501`.
- [ ] **Step 4: Eseguire i test**
  - `DATABASE_URL` va letto da `.env` del checkout principale, con `dotenv`, senza stamparlo.
  - Atteso: 6 PASS in locale e test saltati in CI (`npm test` senza `DATABASE_URL`).
  - Se l'insert in `auth.users` è rifiutato al ruolo del database, annotarlo nel ledger e lasciare i test che non lo richiedono.
- [ ] **Step 5: Commit** `Prove su un Worker separato e verifica delle politiche del database`

### Task 2: Date di modifica e unione locale/account (logica pura)

**Files:**
- Create: `src/lib/sync-merge.ts`
- Test: `tests/sync-merge.test.ts`

**Interfaces:**
- Produces:
  - `type Clocks = { f: Record<string, number>; l: Record<string, Record<string, number>>; rm: Record<string, Record<string, number>> }`, dove `f` sono i campi singoli, `l` gli elementi vivi per lista e `rm` i marcatori di rimozione per lista.
  - `SCALAR_KEYS` (R6) e `LIST_KEYS` (R7), come `readonly (keyof Stasera)[]`.
  - `itemKey(list: string, x: unknown): string`.
  - `emptyClocks(): Clocks`.
  - `loadClocks(storage: Storage | null): Clocks` e `saveClocks(c: Clocks, storage: Storage | null): void`, sulla chiave localStorage `stasera-clock`. Con JSON rotto o storage che lancia, `loadClocks` restituisce `emptyClocks()`.
  - `stamp(prev: Stasera, next: Stasera, c: Clocks, now: number): Clocks`.
  - `merge(a: Synced, b: Synced, now: number): Synced`, dove `type Synced = { st: Stasera; ck: Clocks }`.
  - `gcClocks(c: Clocks, now: number): Clocks` toglie i marcatori più vecchi di 90 giorni (`90*864e5` ms).

Regole di `merge`, che la firma non determina:
- **Campo singolo:** vince il lato con `ck.f[k]` maggiore. Una data mancante vale 0. A parità vince `a`, il locale.
- **Lista, per ogni chiave presente su almeno un lato** (viva o rimossa):
  - la data di un lato è la sua data viva o di rimozione, e mancante vale 0;
  - vince il lato con la data maggiore, e a parità vince il lato vivo;
  - se vince un elemento vivo, si tiene la versione di quel lato (per `serie` anche stagione ed episodio); se vince una rimozione, l'elemento non c'è e il marcatore resta.
- **Ordine:** prima gli elementi nell'ordine di `a`, poi quelli solo di `b` nel loro ordine.
- **Fine:** si applica `gcClocks`.

- [ ] **Step 1: Scrivere i test**
  - `stamp segna solo ciò che cambia`:
    - cambiare `citta` imposta `f.citta=now` e lascia `f.team` assente;
    - aggiungere `{t:"Dune",tmdb:"movie/1"}` a `watch` imposta `l.watch["movie/1"]=now`;
    - toglierlo imposta `rm.watch["movie/1"]=now` e cancella `l.watch["movie/1"]`;
    - cambiare episodio di una serie aggiorna `l.serie[key]`.
  - `campo singolo: vince il più recente`: `a.citta="Roma"` con f 10 e `b.citta="Milano"` con f 20 danno `"Milano"`.
  - `dati vecchi senza date`: `a` locale senza clocks (`citta:"Roma"`, `liked:["A"]`) e `b` con `citta:"Milano"` (f 5) e `liked:["B"]` danno `citta "Milano"` e `liked ["A","B"]`.
  - `una rimozione non fa ricomparire l'elemento`:
    - `a` ha tolto la serie X (rm 30) e aggiunto Y (l 31);
    - `b` ha ancora X (l 10) e non ha Y;
    - risultato: `serie` contiene solo Y, e `rm.serie[X]` resta.
  - `una nuova aggiunta vince su una rimozione più vecchia`: `a` rm X a 10 e `b` l X a 20 danno X presente.
  - `a parità vince l'elemento vivo`.
  - `serie: vince lo stato dell'episodio più recente`: `{s:1,e:3}` a 10 e `{s:1,e:5}` a 20 danno `e:5`.
  - `i marcatori più vecchi di 90 giorni spariscono` e quelli di 89 giorni restano.
  - `merge è stabile`: `merge(merge(a,b),b)` è profondamente uguale a `merge(a,b)`.
  - `loadClocks con JSON rotto restituisce emptyClocks()`.
- [ ] **Step 2: Eseguire i test.** Comando: `npx vitest run tests/sync-merge.test.ts`. Atteso: FAIL (modulo mancante).
- [ ] **Step 3: Implementare `src/lib/sync-merge.ts`.** `itemKey`: per `watch` e `serie` usa `x.tmdb || x.t`; per le altre liste usa la stringa.
- [ ] **Step 4: Rieseguire i test.** Atteso: PASS. Poi `npm test`: tutto verde.
- [ ] **Step 5: Commit** `Date di modifica e unione delle preferenze tra dispositivi`

### Task 3: Client Supabase caricato su richiesta e funzioni di accesso

**Files:**
- Modify: `package.json` (dipendenza `"@supabase/supabase-js": "2.118.0"`)
- Create: `src/lib/account.ts`, `supabase/templates/accesso.html`
- Test: `tests/account.test.ts`

**Interfaces:**
- Produces in `src/lib/account.ts`:
  - `SUPABASE_URL = "https://gvdarnmxnigprebwjglq.supabase.co"` e `SUPABASE_KEY` (la chiave publishable `sb_publishable_…`). La chiave si legge con `npx supabase projects api-keys --project-ref gvdarnmxnigprebwjglq`: copiare **solo** la publishable, mai quella di servizio.
  - `ACCOUNT_PUBLIC = false`, che diventa `true` nel Task 10.
  - `SESSION_KEY = "sb-gvdarnmxnigprebwjglq-auth-token"`.
  - `hasStoredSession(storage: Storage | null): boolean`.
  - `authInUrl(search: string): boolean`: vero se ci sono `code` oppure `token_hash`.
  - `accountVisible(storage: Storage | null, search: string): boolean`:
    - vero con `ACCOUNT_PUBLIC`, con `hasStoredSession`, oppure se `search` contiene `account=1`;
    - in quest'ultimo caso salva il flag `popcorno-account=1` in localStorage;
    - vero anche se quel flag è già salvato.
  - `getClient(): Promise<SupabaseClient>`:
    - fa un `import("@supabase/supabase-js")` dinamico e tiene un solo client;
    - opzioni `auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }`.
  - `setClientForTests(c: unknown): void`.
  - `sendLink(email: string): Promise<void>`: chiama `signInWithOtp({ email, options: { emailRedirectTo: location.origin + "/", shouldCreateUser: true } })`.
  - `verifyCode(email: string, code: string): Promise<void>`: chiama `verifyOtp({ email, token: code, type: "email" })`.
  - `completeFromUrl(): Promise<void>`:
    - con `token_hash` chiama `verifyOtp({ token_hash, type })`;
    - poi toglie sempre `code`, `token_hash` e `type` dall'indirizzo con `history.replaceState`.
  - `signInWithGoogle(): Promise<void>`: chiama `signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/" } })`.
  - `signOut(): Promise<void>`: chiama `signOut({ scope: "local" })`.
  - `deleteAccount(): Promise<void>`: chiama `rpc("delete_account")`, poi `signOut({ scope: "local" })`.
  - Ogni funzione lancia `Error` con un messaggio in italiano quando Supabase risponde con un errore.

- [ ] **Step 1: Scrivere i test** (jsdom, con un client finto passato da `setClientForTests`):
  - `senza sessione e senza ?account=1 la riga non si vede e il client non si crea`: `accountVisible` è false e il finto `import` non viene chiamato. Si verifica con `vi.mock("@supabase/supabase-js")` e un contatore.
  - `?account=1 la rende visibile anche dopo`: alla seconda chiamata senza parametro resta vera.
  - `hasStoredSession legge SESSION_KEY`.
  - `sendLink passa emailRedirectTo con l'origine`.
  - `completeFromUrl con token_hash chiama verifyOtp e pulisce l'indirizzo`: da `/?token_hash=abc&type=email&x=1` si passa a `/?x=1`.
  - `deleteAccount chiama delete_account e poi esce`.
  - `un errore di Supabase diventa un Error leggibile`.
- [ ] **Step 2: Eseguire i test.** Atteso: FAIL.
- [ ] **Step 3: Installare e implementare**
  - `npm install --save-exact @supabase/supabase-js@2.118.0`, poi scrivere `account.ts`.
  - `supabase/templates/accesso.html`: email semplice in italiano con i colori dell'app (`#151a44`, `#ffb547`). Contenuto, in quest'ordine:
    1. il titolo "Entra in Popcorno";
    2. il pulsante "Entra" che porta a `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`;
    3. la riga "Oppure scrivi questo codice nell'app: **{{ .Token }}**";
    4. la riga "Se non hai chiesto tu l'accesso, ignora questa email.".
- [ ] **Step 4: Verificare test e build**
  - `npx vitest run tests/account.test.ts` passa.
  - `npm run build` non mette supabase-js nel pezzo iniziale: in `.output`/`dist`, il chunk che contiene `GoTrueClient` non è tra gli script in `<head>` della home.
- [ ] **Step 5: Commit** `Accesso con Supabase (link, codice, Google) caricato solo quando serve`

### Task 4: Sincronizzazione delle preferenze

**Files:**
- Create: `src/lib/sync.ts`
- Modify: `src/app-state.tsx`
- Test: `tests/sync.test.ts`

**Interfaces:**
- Consumes: `Clocks`, `stamp`, `merge`, `loadClocks`, `saveClocks` (Task 2); `getClient`, `hasStoredSession`, `authInUrl`, `completeFromUrl` (Task 3).
- Produces:
  - `createSync(opts: { client: () => Promise<Client>; local: () => Synced; apply: (s: Synced) => void; now: () => number }): { pull(): Promise<void>; push(): void; flush(): Promise<void> }`.
    - `pull` legge `preferences.data`, del tipo `{ v: 1, st, ck }`, oppure `{}` per un account nuovo. Unisce con `merge(local, remote)` e chiama `apply`. Se il risultato è diverso da quello che c'era sull'account, fa `push`.
    - `push` aspetta 1500 ms, poi esegue `upsert({ user_id, data: { v: 1, st, ck }, updated_at })` con l'ora ISO.
    - Se la rete manca, riprova all'evento `online`.
  - In `AppState`:
    - `user: { id: string; email: string } | null`;
    - `trackEvents: boolean`;
    - `setTrackEvents(on: boolean): Promise<void>`;
    - `setSt` ora aggiorna anche i clocks con `stamp`, e se c'è `user` chiama `push`.

- [ ] **Step 1: Scrivere i test** (client finto in memoria):
  - `pull con account vuoto carica i dati locali sull'account`.
  - `pull unisce e applica`: con locale `liked ["A"]` e account `liked ["B"]`, `apply` riceve `["A","B"]` e l'account riceve `["A","B"]`.
  - `push aspetta 1500 ms e manda una sola richiesta per tre modifiche ravvicinate` (`vi.useFakeTimers`).
  - `offline: push fallisce, riparte all'evento online`.
  - `sessione non valida: pull riceve errore 401, l'app resta in locale e non riprova in ciclo` (al massimo 1 richiesta).
  - In `tests/shell.test.tsx` (o in un nuovo `tests/account-flow.test.tsx`): `senza sessione nessuna richiesta a supabase.co`. Si verifica con `fetch` spiato dopo il montaggio e il caricamento di oggi.json: nessun URL contiene `supabase.co`.
- [ ] **Step 2: Eseguire i test.** Atteso: FAIL.
- [ ] **Step 3: Implementare**
  - `sync.ts`.
  - In `AppStateProvider`, dopo il montaggio, si carica il client (`getClient()`) solo se `hasStoredSession(storage) || authInUrl(location.search)`. Poi:
    1. `completeFromUrl()`;
    2. `onAuthStateChange` imposta `user` e legge `profiles.track_events`;
    3. all'ingresso fa `pull()`;
    4. a ogni `visibilitychange` verso `visible` rifà `pull()`, al massimo una volta ogni 5 minuti.
  - I clocks vivono in un `useRef`, caricati con `loadClocks` e salvati con `saveClocks`.
  - `apply` imposta `st` e i clocks **senza** chiamare `stamp`.
  - L'import `#profilo=` passa da `stamp`, cioè conta come modifica locale.
  - All'uscita `user` torna `null` e lo stato locale resta.
- [ ] **Step 4: Eseguire i test.** `npx vitest run` passa tutto, compresi i test di parità già esistenti.
- [ ] **Step 5: Commit** `Preferenze sincronizzate con l'account, anche offline`

### Task 5: Storico dei segnali e tasto "L'ho visto"

**Files:**
- Create: `src/lib/events.ts`
- Modify:
  - `src/lib/state.ts`: aggiungere `toggleSeen`;
  - `src/app-state.tsx`: aggiungere `track`;
  - `src/components/scegli/Scegli.tsx` e `Result.tsx`;
  - `src/components/prof/Profile.tsx` (✕ della serie);
  - `src/components/onda/Guide.tsx` (solo se apre titoli senza passare da `openItem`).
- Test: `tests/events.test.ts`, `tests/scegli.test.tsx`

**Interfaces:**
- Consumes: `user`, `trackEvents`, `getClient` (Task 3–4), e `mySrc` da `src/lib/sources.ts`.
- Produces:
  - `type EventKind`: i valori di `eventKinds`, da tenere uguali a `db/schema.ts`, con un test che lo controlla.
  - `type EventRow = { kind; title_ref; title; item_type; genre; source; ctx }`.
  - `titleRef(it: Item): string`: `it.tmdb`, altrimenti `` `${it.ty}:${it.t}` ``, tagliato a 200 caratteri.
  - `eventRow(kind: EventKind, it: Item, st: Stasera, ctx?: Record<string, unknown>): EventRow`.
    - `source` è `"cinema"` per i titoli al cinema, altrimenti `mySrc(it, st)[0]`.
    - `ctx` di base: `time` se c'è, `teams` per lo sport.
    - Se il JSON di `ctx` supera 3500 caratteri, si tolgono elementi da `shown` finché ci sta.
  - `createTracker(opts: { storage: Storage | null; enabled: () => boolean; send: (rows: EventRow[]) => Promise<"ok" | "off" | "retry">; now: () => number }): { track(row: EventRow): void; flush(): Promise<void> }`.
    - Coda in localStorage `popcorno-eventi`, al massimo 200 elementi: si scartano i più vecchi.
    - `open` dello stesso `title_ref` entro 30 minuti conta una volta, con le ultime aperture in `popcorno-aperti`.
    - Con `enabled()` falso, `track` non fa nulla e non mette in coda.
    - Con `"off"` (errore `42501`) svuota la coda e non riprova; con `"retry"` tiene la coda.
    - `flush` parte dopo `track`, all'ingresso e all'evento `online`.
  - `toggleSeen(st: Stasera, it: Item): Stasera`: aggiunge o toglie `it.t` da `seen`.
  - `AppState.track(kind: EventKind, it: Item, ctx?: Record<string, unknown>): void`.

**Dove si registra:**

| Gesto | Evento |
|---|---|
| 👍 / 👎 | `like` / `dislike` |
| "🔖 Da vedere" / "Nella lista" | `watch_add` / `watch_remove` |
| "📺 La seguo" (aggiunta) | `follow` |
| ✕ nel Profilo | `unfollow`, con un `Item` minimo `{ t, ty: "serie", tmdb, g: "" }` |
| "L'ho visto" | `seen` / `unseen` |
| Trailer | `trailer` |
| tocco su una sala o su "Cerca orari" | `showtimes` |
| tocco su un titolo della striscia, `openItem` | `open` con `ctx.shown` (R4) |

- [ ] **Step 1: Scrivere i test**
  - `tests/events.test.ts`:
    - `senza account non si mette niente in coda`;
    - `open ripetuto entro 30 minuti conta una volta, dopo 31 minuti di nuovo`;
    - `la coda tiene al massimo 200 eventi`;
    - `off svuota la coda e non riprova`;
    - `retry tiene la coda e la manda all'evento online`;
    - `titleRef senza tmdb usa tipo:nome`;
    - `ctx troppo grande viene accorciato sotto 3500 caratteri`;
    - `eventKinds uguali a db/schema.ts` (importa `eventKinds` da `../db/schema`).
  - `tests/scegli.test.tsx`:
    - `il tasto L'ho visto segna e toglie il titolo da seen`: `#a-seen` passa da "👁 L'ho visto" a "✔ Visto", e i toast sono "Segnato come visto" e "Tolto dai visti";
    - `il tasto non c'è per lo sport`;
    - `con account, 👍 registra like`: `track` riceve `like` con `title_ref` del titolo.
- [ ] **Step 2: Eseguire i test.** Atteso: FAIL.
- [ ] **Step 3: Implementare**
  - `#a-seen` va nella riga `.acts` dopo "Da vedere", con classe `act on` quando il titolo è visto.
  - `send` usa `getClient()` e `from("events").insert(rows)`.
- [ ] **Step 4: Eseguire i test.** `npm test`: tutto verde. I test di parità che contano i pulsanti di `.acts` si aggiornano solo per il nuovo `#a-seen`; annotarlo nel ledger.
- [ ] **Step 5: Commit** `Storico dei segnali di gusto (solo con account) e tasto "L'ho visto"`

### Task 6: Accesso nel Profilo

**Files:**
- Create: `src/components/prof/Account.tsx`
- Modify: `src/components/prof/Profile.tsx`, `src/styles/app.css`
- Test: `tests/account-ui.test.tsx`

**Interfaces:**
- Consumes: `accountVisible`, `sendLink`, `verifyCode`, `signInWithGoogle`, `signOut` (Task 3); `user`, `setView` (Task 4).
- Produces: `<Account />`, nel Profilo subito prima del gruppo "Usa Popcorno su un altro dispositivo".

**Testi, esatti:**
- **Riga chiusa:** pulsante `🔑 Ricorda i miei gusti su tutti i dispositivi`.
- **Aperta:**
  - campo `type="email"` con placeholder `La tua email`;
  - pulsante `Mandami il link`;
  - pulsante `Continua con Google`;
  - sotto, il testo `Con l'account Popcorno ricorda cosa scegli per proporti di meglio. Puoi vedere e cancellare tutto in «I miei dati».` con il link `Privacy` a `/privacy/`.
- **Dopo l'invio:**
  - testo `Controlla la tua email: ti ho mandato un link per entrare. Se usi Popcorno dalla schermata Home, scrivi qui il codice di 6 cifre.`;
  - campo `inputMode="numeric"` `maxLength={6}`;
  - pulsante `Entra`;
  - link `Usa un'altra email`.
- **Errori, nel toast:**
  - `Non riesco a mandare l'email, riprova tra poco`;
  - `Il codice non è giusto o è scaduto`;
  - `Scrivi un indirizzo email valido`.
- **Dentro:**
  - testo `Sei dentro come <email>`;
  - pulsanti `I miei dati` (`setView("dati")`) e `Esci`.
  - Toast all'ingresso: `Fatto! Ora i tuoi gusti ti seguono su ogni dispositivo 🍿`.
  - Toast all'uscita: `Sei uscito: le preferenze restano su questo dispositivo`.

- [ ] **Step 1: Scrivere i test**
  - `senza ?account=1 e senza sessione il Profilo non mostra la riga di accesso`: il testo "Ricorda i miei gusti" non c'è.
  - `con ?account=1: email non valida mostra l'errore e non chiama sendLink`.
  - `invio riuscito mostra il campo del codice; il codice sbagliato mostra il toast d'errore`.
  - `da dentro: Esci chiama signOut e le preferenze restano`: `st.liked` invariato.
- [ ] **Step 2: Eseguire i test.** Atteso: FAIL.
- [ ] **Step 3: Implementare.** Gli stili riusano `.grp`, `.act` e `input` come nel Profilo. Nessun popup e nessun elemento fuori dal Profilo.
- [ ] **Step 4: Eseguire i test.** Atteso: PASS, `npm test` verde.
- [ ] **Step 5: Commit** `Riga di accesso nel Profilo`

### Task 7: "I miei dati"

**Files:**
- Create: `src/components/prof/MieiDati.tsx`, `src/lib/miei-dati.ts`
- Modify:
  - `src/app-state.tsx`: aggiungere `"dati"` a `View`;
  - `src/components/Shell.tsx`: aggiungere `<section id="v-dati">`;
  - `src/components/Nav.tsx`: con la vista `dati`, resta acceso "Profilo".
- Test: `tests/miei-dati.test.tsx`

**Interfaces:**
- Consumes: `user`, `trackEvents`, `setTrackEvents`, `deleteAccount`, `getClient`, `signOut`.
- Produces:
  - `eventText(e: { kind: EventKind; title: string | null; created_at: string }): string`, nel formato `7 nov, 21:10 — Hai messo mi piace a «Dune»`. Data con `toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })`, senza punto dopo il mese.
  - `exportName(now: Date): string` restituisce `popcorno-miei-dati-YYYY-MM-DD.json`.

**Frasi per tipo di evento:**

| Tipo | Frase |
|---|---|
| `open` | `Hai aperto «X»` |
| `like` | `Hai messo mi piace a «X»` |
| `dislike` | `Hai messo non mi piace a «X»` |
| `unlike` | `Hai tolto il mi piace a «X»` |
| `undislike` | `Hai tolto il non mi piace a «X»` |
| `seen` | `Hai segnato come visto «X»` |
| `unseen` | `Hai tolto «X» dai visti` |
| `watch_add` | `Hai aggiunto «X» a Da vedere` |
| `watch_remove` | `Hai tolto «X» da Da vedere` |
| `follow` | `Hai iniziato a seguire «X»` |
| `unfollow` | `Hai smesso di seguire «X»` |
| `trailer` | `Hai aperto il trailer di «X»` |
| `showtimes` | `Hai guardato gli orari di «X»` |
| `go` | `Hai aperto il link per vedere «X»` |

**Contenuto della vista, in ordine:**
1. pulsante `‹ Profilo`;
2. titolo `I miei dati`;
3. `Account: <email>`;
4. interruttore `Ricorda le mie scelte`, con la nota `Se lo spegni, Popcorno smette di registrare le tue scelte. Preferenze e sincronizzazione continuano.`;
5. gruppo `Le tue preferenze`: abbonamenti, città, squadra, generi, e il numero di titoli in Da vedere, serie seguite, mi piace, non mi piace e visti;
6. gruppo `Le tue scelte`: gli ultimi 100 eventi, dal più recente, poi `Mostra altre`. Senza eventi: `Ancora nessuna scelta registrata.`;
7. pulsanti finali:
   - `Scarica i miei dati`: scarica JSON `{ account: { email, created_at }, profilo, preferenze, storico }`;
   - `Cancella lo storico`;
   - `Elimina l'account`.

**Conferme ed esiti:**
- Le due cancellazioni chiedono conferma una volta, nello stesso pulsante: il secondo tocco entro 5 s, sul testo `Tocca di nuovo per confermare`. Mai `window.confirm`.
- Toast degli esiti:
  - `Storico cancellato`;
  - `Account eliminato. Le preferenze restano su questo dispositivo.`, poi ritorno al Profilo;
  - `Non ci sono riuscito, riprova tra poco`.

- [ ] **Step 1: Scrivere i test**
  - Per ogni tipo, `eventText` dà la frase della tabella. C'è anche un test che tutti i 14 tipi hanno una frase.
  - `exportName`.
  - `l'interruttore chiama setTrackEvents(false)`.
  - `Cancella lo storico: il primo tocco chiede conferma, il secondo cancella` (`delete().eq("user_id", id)` sul client finto).
  - `Elimina l'account chiama deleteAccount e torna al Profilo`.
  - `senza account la vista dati non mostra niente e torna al Profilo`.
- [ ] **Step 2: Eseguire i test.** Atteso: FAIL.
- [ ] **Step 3: Implementare.**
- [ ] **Step 4: Eseguire i test.** `npm test`: verde.
- [ ] **Step 5: Commit** `Pagina "I miei dati": storico, scarica, cancella, elimina l'account`

### Task 8: Service worker

**Files:**
- Modify: `public/sw.js`, `src/lib/sw-caches.ts`
- Test: `tests/sw.test.ts`

**Interfaces:**
- Produces: `isAuthNavigation(url: URL): boolean` in `sw-caches.ts`, copiata in `sw.js` come le altre funzioni. È vera se la query contiene `code`, `token_hash` o `error_description`.

- [ ] **Step 1: Scrivere i test**
  - `le richieste a supabase.co non passano dal service worker`: nessun `respondWith` per `https://gvdarnmxnigprebwjglq.supabase.co/rest/v1/events`.
  - `una navigazione con token_hash va in rete e non si salva in cache`.
  - `isAuthNavigation`.
- [ ] **Step 2: Eseguire i test.** Atteso: FAIL sul secondo caso.
- [ ] **Step 3: Implementare**
  - Nel ramo `navigate`, se `isAuthNavigation(u)`, usare solo `fetch(e.request)`, senza `put`.
  - Alzare `SHELL` a `popcorno-shell-v5`.
- [ ] **Step 4: Eseguire i test.** Atteso: PASS.
- [ ] **Step 5: Commit** `Service worker: niente cache per i link di accesso`

### Task 9: Privacy e descrizione della home (testo da far approvare al proprietario)

**Files:**
- Modify: `src/routes/privacy/index.tsx`, `src/routes/index.tsx` (meta description), `tests/privacy.test.ts`

Questo testo il proprietario lo approva leggendo questo piano. La data diventa quella del go-live (Task 10).

**Riquadro "In breve" (sostituisce l'attuale):**
> **In breve:** Popcorno funziona senza registrazione, non usa cookie, non fa statistiche sulle visite e non mostra pubblicità. Se non crei un account, le tue preferenze restano sul tuo dispositivo. L'account è facoltativo: se lo crei, Popcorno salva le tue preferenze e le tue scelte nell'app per ritrovarle su tutti i dispositivi e proporti di meglio. Puoi vederle, scaricarle e cancellarle quando vuoi in «I miei dati».

**Nuova sezione, dopo "Quali dati usa l'app": `<h2>Se crei un account (facoltativo)</h2>`**
- **Cosa salviamo.**
  - L'indirizzo email con cui accedi.
  - Le preferenze che altrimenti resterebbero solo sul dispositivo: abbonamenti, squadra, città, generi, lista "Da vedere", serie che segui, gradimenti e titoli visti.
  - L'elenco delle tue scelte nell'app, ognuna con data e ora: quando apri un titolo proposto (insieme agli altri titoli che ti erano stati proposti), metti mi piace o non mi piace, segni "L'ho visto", aggiungi o togli un titolo da "Da vedere", inizi o smetti di seguire una serie, apri il trailer o gli orari del cinema.
  - Non registriamo nient'altro: niente pagine visitate, tempo passato nell'app o ricerche.
- **Perché.** Per farti ritrovare i tuoi gusti su ogni dispositivo e per proporti titoli più adatti a te. È il servizio che chiedi creando l'account: la base giuridica è l'esecuzione del servizio (art. 6.1.b GDPR).
- **Dove.** Nel database di Supabase, nell'Unione europea (Francoforte, Germania).
- **Per quanto.** Finché non cancelli lo storico o l'account. Se spegni "Ricorda le mie scelte" in «I miei dati», smettiamo di registrare le tue scelte; preferenze e sincronizzazione continuano.
- **Vedere, scaricare, cancellare.** In «I miei dati» (nel Profilo, dopo l'accesso) vedi tutto quello che è salvato. Da lì puoi scaricarlo in un file, cancellare lo storico o eliminare l'account con tutti i dati collegati.

**In "Servizi esterni", tre punti dopo GitHub Pages:**
- **Supabase** (Supabase, Inc.), solo se crei un account: gestisce l'accesso e il database degli account. I dati sono conservati a Francoforte (UE). Per assistenza e sicurezza Supabase può accedervi anche da fuori dell'Unione europea, con le garanzie previste dal GDPR. Link: [Informativa di Supabase](https://supabase.com/privacy).
- **Google**, solo se scegli "Continua con Google": conferma chi sei e ci comunica il tuo indirizzo email. Link: [Informativa di Google](https://policies.google.com/privacy).
- **SendGrid** (Twilio Inc.), solo se accedi con l'email: invia l'email con il link e il codice di accesso, e per farlo riceve il tuo indirizzo email. Link: [Informativa di Twilio](https://www.twilio.com/legal/privacy).

**"Cookie" (sostituisce il paragrafo):**
> Popcorno non usa cookie. Usa solo la memoria locale del browser per ricordare le tue preferenze e, se hai fatto l'accesso, per tenerti dentro; e una cache per funzionare più velocemente e anche senza rete. Si tratta di strumenti tecnici necessari al servizio, per cui non serve alcun consenso.

**"Base giuridica e conservazione":** al paragrafo attuale si aggiunge la frase:
> Per chi crea un account, i dati dell'account sono trattati per fornire il servizio richiesto (art. 6.1.b GDPR) e conservati finché non cancelli lo storico o l'account.

**"Modifiche" (sostituisce il paragrafo):**
> Se cambierà il modo in cui Popcorno usa i dati personali, aggiorneremo questa pagina prima che le novità entrino in funzione.

**Meta description della home:** cambia solo la fine, da `Gratis, senza registrazione.` a `Gratis, registrazione facoltativa.`

**Meta description della privacy:** `Informativa privacy di Popcorno: quali dati usa l'app, l'account facoltativo, dove restano i dati e come contattarci.`

- [ ] **Step 1: Riscrivere `tests/privacy.test.ts`**
  - Il confronto con la pagina vecchia non vale più, perché il testo cambia molto.
  - I test controllano, ognuno con il suo `it`:
    - la presenza dei titoli h2 nell'ordine:
      1. `Chi è il titolare del trattamento`
      2. `Quali dati usa l'app`
      3. `Se crei un account (facoltativo)`
      4. `Servizi esterni`
      5. `Cookie`
      6. `Base giuridica e conservazione`
      7. `I tuoi diritti`
      8. `Modifiche`
    - i link delle informative di Supabase, Google e Twilio;
    - le frasi `art. 6.1.b GDPR` e `Francoforte`;
    - la frase `Popcorno non usa cookie.`;
    - che la pagina non contenga `senza registrazione`;
    - il canonical.
- [ ] **Step 2: Eseguire i test.** Atteso: FAIL.
- [ ] **Step 3: Aggiornare la pagina e le due meta description.** La data resta quella attuale fino al Task 10.
- [ ] **Step 4: Eseguire i test.** Atteso: PASS.
- [ ] **Step 5: Commit** `Privacy: account facoltativo e storico dei gusti`. La pagina va online solo con il Task 10: fino ad allora il ramo non va su `main`.

### Task 10: Prova completa e messa online

- [ ] **Step 1: Pubblicare il ramo su `popcorno-prove`.** Comando: `gh workflow run aggiorna.yml --ref accesso-storico`. Atteso: run verde e `https://popcorno-prove.fabrizio-landi.workers.dev/?account=1` raggiungibile.
- [ ] **Step 2: Prova con il proprietario, su telefono e computer.** Annotare ✅/❌ nel ledger:
  1. link via email nel browser;
  2. codice nell'app sulla schermata Home;
  3. Google;
  4. modifica sul telefono, ritrovata sul computer;
  5. serie tolta offline sul telefono, che non ricompare;
  6. "L'ho visto";
  7. "I miei dati" mostra le scelte;
  8. l'interruttore spento ferma lo storico;
  9. scarica;
  10. cancella lo storico;
  11. elimina l'account.
  - Senza `?account=1` e senza sessione, la scheda Rete del browser non mostra richieste a `supabase.co`.
- [ ] **Step 3: Andare online**
  - `ACCOUNT_PUBLIC = true`.
  - Data della privacy uguale al giorno della messa online.
  - Merge su `main`, solo con l'ok esplicito del proprietario.
- [ ] **Step 4: Verificare su popcorno.it**
  - La riga di accesso si vede nel Profilo.
  - La privacy è aggiornata.
  - Un accesso vero funziona.
  - Nessun `Set-Cookie` (`curl -sI https://popcorno.it/ | grep -i set-cookie` vuoto).
