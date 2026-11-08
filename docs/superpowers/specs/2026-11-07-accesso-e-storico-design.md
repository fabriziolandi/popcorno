# Accesso facoltativo e storico dei gusti — documento di progetto

Data: 2026-11-07 · Progetto Supabase: `popcorno` (ref `gvdarnmxnigprebwjglq`, regione `eu-central-1` Francoforte, piano gratuito, Postgres 17)

## Perché

Popcorno oggi propone cosa guardare stasera basandosi sulle preferenze salvate solo sul dispositivo (localStorage, chiave `stasera`). Il proprietario vuole che in futuro Popcorno **ricordi le scelte di ogni persona e diventi più preciso** nel proporre film, serie, sport ecc. Per questo serve un account: lo storico delle scelte deve vivere in un database, legato alla persona, e seguirla su tutti i dispositivi.

Questo progetto prepara **l'accesso e la raccolta dello storico**. Il sistema di raccomandazione più intelligente arriverà dopo e userà i dati raccolti da qui in avanti.

## Obiettivi

1. **Accesso facoltativo** con link via email (magic link) e con Google.
2. Chi ha l'account ritrova preferenze, lista "Da vedere", serie seguite, mi piace/non mi piace e titoli visti **su ogni dispositivo**.
3. Da subito si registra uno **storico dei segnali** che indicano i gusti (vedi sotto), con data e ora.
4. Nuovo tasto **"L'ho visto"** nella scheda di ogni titolo.
5. Pagina **"I miei dati"**: mostra cosa è stato registrato, con "Cancella lo storico" ed "Elimina l'account".
6. Pagina privacy aggiornata.

## Non obiettivi (per ora)

- Il nuovo algoritmo di raccomandazione basato sullo storico. L'app continua a usare il punteggio attuale, alimentato dalle preferenze sincronizzate.
- App native, accesso con Apple, profili multipli nello stesso account, funzioni social.
- Statistiche sulle visite o analytics di chi non ha l'account.

## Anti-obiettivi (sarebbe un fallimento anche se funziona)

Decisi dal proprietario:
- **Niente popup insistenti.** Nessuna finestra all'apertura, nessun promemoria, nessun blocco di funzioni per chi non si registra. L'app senza account funziona esattamente come oggi.
- **Niente sensazione di essere spiati.** Si registrano solo i segnali elencati qui sotto, mai la navigazione generica (scroll, tempo passato sulle pagine, ricerche). Tutto ciò che è registrato è visibile e cancellabile dalla persona.

## Vincoli

- **Si costruisce sopra la riscrittura in React + TanStack Start su Cloudflare Workers** (vedi `2026-11-07-riscrittura-react-design.md`), che va completata prima. Dominio `popcorno.it`.
- `@supabase/supabase-js` come dipendenza npm con versione fissata; per le sessioni con il server di TanStack Start, `@supabase/ssr` (cookie di sessione tecnici, necessari al servizio: la privacy va aggiornata dicendo che esistono solo per chi accede).
- Le funzioni lato server di TanStack Start (su Cloudflare) si usano dove serve un segreto, in particolare **"Elimina l'account"**: la chiave di servizio di Supabase sta solo nei secret di Cloudflare, mai nel codice del browser né nel repository.
- Dati in UE (Supabase Francoforte). GDPR: base giuridica, conservazione, diritti dell'utente descritti nella privacy.
- Piano gratuito Supabase: 2 progetti attivi per organizzazione (già al limite), 500 MB di database. Lo storico deve restare compatto.
- I titoli nei dati dell'app hanno spesso un campo `tmdb` (`"movie/123"` o `"tv/456"`), ma non sempre (es. alcuni programmi della guida TV, sport). Oggi l'app li identifica soprattutto per nome (`it.t`); `refOf`/`sameRef` nell'app attuale usano `tmdb` quando c'è (logica portata nella riscrittura).

## Decisioni prese

### Accesso
- Metodi: **link via email** e **Google** (decisione del proprietario).
- Le email di accesso partono da **SendGrid**, configurato come SMTP personalizzato in Supabase Auth (decisione del proprietario). Mittente su dominio `popcorno.it` (indirizzo esatto a scelta del builder, es. `accesso@popcorno.it`), con autenticazione del dominio su SendGrid tramite record DNS presso OVH. Template dell'email in italiano.
- **Link e codice nella stessa email** *(scelta di Claude)*: l'email contiene sia il link sia un codice di 6 cifre. Il link funziona nel browser; il codice serve quando Popcorno è installato sulla schermata Home (soprattutto iPhone), dove il link si aprirebbe in Safari invece che nell'app. La schermata "controlla la tua email" ha quindi un campo per il codice.
- **Messa online graduale** *(scelta di Claude)*: finché Google e SendGrid non sono configurati e provati, la riga di accesso resta nascosta (visibile solo con un parametro nell'indirizzo, es. `?account=1`). Si attiva per tutti solo quando funziona.
- Punto d'ingresso: **una sola riga discreta nella sezione profilo** (es. "Ricorda i miei gusti su tutti i dispositivi"). Nessun altro punto che inviti all'accesso. *(Scelta di Claude, coerente con gli anti-obiettivi.)*
- URL di ritorno consentiti: `https://popcorno.it/`, l'indirizzo provvisorio `*.workers.dev` durante le prove e `http://localhost`. Il vecchio indirizzo GitHub Pages non serve più (diventa solo una pagina che porta a `popcorno.it`, vedi documento della riscrittura).

### Dati
Tre tabelle nello schema `public`, tutte con Row Level Security attiva e politica "ogni riga appartiene a `auth.uid()`". *(Scelta di Claude.)*

- `profiles` — una riga per utente (`id` = `auth.users.id`), data di creazione. Creata da un trigger alla registrazione.
- `preferences` — una riga per utente con lo **stato attuale** dell'oggetto `stasera` in una colonna `jsonb`, più `updated_at`. Contiene abbonamenti, squadra, città, generi, umore, tempo, "Da vedere", serie seguite, liked/disliked, seen.
- `events` — lo **storico dei segnali**, una riga per segnale:
  - `user_id`, `created_at` (ora del server), `kind` (vedi elenco), `title_ref` (il `tmdb` se c'è, altrimenti `tipo:nome`), `title` (nome leggibile), `item_type` (film / serie / sport / tv…), `genre`, `source` (TV in chiaro, Sky, piattaforma, cinema…), e un campo `jsonb` `ctx` per dettagli (es. canale, squadra o competizione per lo sport, i titoli proposti insieme a quello scelto).

### Segnali registrati (solo per chi ha l'account)
Indicati dal proprietario: scegliere un titolo, guardarlo, mettere mi piace.
- `open` — apre la scheda di un titolo tra quelli proposti. In `ctx` vanno anche gli altri titoli proposti in quel momento (massimo una decina), per sapere cosa è stato scartato.
- `like` / `dislike` — preme mi piace / non mi piace.
- `seen` — preme il nuovo tasto **"L'ho visto"** (decisione del proprietario). Oggi "mi piace" segna già come visto; "L'ho visto" permette di farlo senza votare. Si può togliere.
- `watch_add` / `watch_remove` — aggiunge o toglie da "Da vedere".
- `follow` / `unfollow` — segue o smette di seguire una serie.
- `trailer`, `showtimes`, `go` — apre il trailer, gli orari del cinema o il link per vederlo (tracce indirette di visione).
- `unlike` / `undislike` / `unseen` — toglie un mi piace, un non mi piace o "L'ho visto". *(Scelta di Claude: le marce indietro sono eventi anche loro; le righe vecchie non si cancellano, così lo storico resta fedele.)*

Nient'altro viene registrato.

*(Scelte di Claude:)*
- `open` ripetuto sullo stesso titolo entro 30 minuti conta una volta sola.
- I dati locali già presenti al primo accesso (liked, seen…) vanno solo in `preferences`, **non** creano eventi con date inventate. Lo storico parte dal primo accesso.

### Sincronizzazione
- Senza account: tutto come oggi, solo localStorage, nessuna chiamata a Supabase oltre al caricamento della libreria. *(Il builder può caricare la libreria solo quando serve.)*
- Al **primo accesso** su un dispositivo, i dati locali vengono **uniti** a quelli dell'account: le liste (watch, serie, liked, disliked, seen) si uniscono senza duplicati; per i campi singoli (città, squadra, umore…) vince il valore più recente. Niente va perso.
- **Rimozioni e "più recente"** *(scelta di Claude)*: lo stato salvato tiene una data di modifica per ogni campo singolo e per ogni elemento delle liste, e le rimozioni restano come marcatori ("tolto il …") invece di sparire. Così, se una serie viene tolta sul telefono, l'unione con il computer non la fa ricomparire. I marcatori più vecchi di 90 giorni si possono eliminare. Serve un piccolo adattamento del formato locale di `stasera`, compatibile con i dati già salvati sui dispositivi (che all'inizio non hanno date: contano come "più vecchi di tutto").
- Dopo l'accesso: ogni modifica si salva subito in localStorage (l'app resta veloce e funziona offline) e poi in `preferences`; gli eventi vengono inviati a `events`. Se si è offline, gli eventi restano in coda locale e partono appena torna la connessione.
- All'apertura dell'app con account, si scaricano le `preferences` dell'account e si uniscono con la stessa regola.
- All'uscita (logout) i dati restano sul dispositivo come preferenze locali.

### "I miei dati"
- Raggiungibile dalla sezione profilo quando si è dentro.
- Mostra l'email dell'account, le preferenze salvate e lo storico in forma leggibile (es. "7 nov, 21:10 — Hai messo mi piace a *Dune*"), dal più recente.
- "Cancella lo storico" cancella tutte le righe di `events` della persona.
- "Scarica i miei dati" scarica un file JSON con profilo, preferenze e storico. *(Scelta di Claude: mantiene la promessa di portabilità della privacy.)*
- "Elimina l'account" cancella account e tutti i dati collegati (funzione lato server di TanStack Start su Cloudflare, con la chiave di servizio di Supabase nei secret di Cloudflare, perché il browser non può eliminare un utente da solo). Chiede conferma una volta.

### Base giuridica e trasparenza (decisione del proprietario: opzione A)
- La raccolta dello storico **fa parte del servizio** che la persona chiede creando l'account (art. 6.1.b GDPR, esecuzione del servizio). Nessuna casella di consenso.
- Nella schermata di accesso, sotto il campo email, una riga fissa: "Con l'account Popcorno ricorda cosa scegli per proporti di meglio. Puoi vedere e cancellare tutto in *I miei dati*." (testo indicativo).
- In "I miei dati", interruttore **"Ricorda le mie scelte"** (attivo per impostazione predefinita): se spento, non si inviano più eventi a `events`; preferenze e sincronizzazione continuano. Lo stato dell'interruttore si salva nel profilo (`profiles.track_events boolean default true`) e va rispettato su tutti i dispositivi.
- Consiglio annotato: verifica con un esperto di privacy se Popcorno cresce.

### Privacy
Aggiornare la pagina privacy (nella riscrittura), mantenendo il tono "in breve" attuale:
- Senza account non cambia nulla.
- Con account: cosa si salva (email, preferenze, elenco dei segnali qui sopra), dove (Supabase, UE, Francoforte), perché (ricordare i gusti e migliorare le proposte), base giuridica (esecuzione del servizio, art. 6.1.b), come fermare la raccolta con "Ricorda le mie scelte", per quanto (finché la persona non cancella lo storico o l'account), chi tratta i dati (Supabase per database e accesso, Google se si accede con Google, SendGrid per le email di accesso).
- Come vedere, cancellare ed esportare i propri dati.
- Togliere o correggere "senza registrazione" dove diventerebbe impreciso (es. meta description), dicendo che la registrazione è facoltativa.

## Cosa deve fare il proprietario (Claude lo guida)
- Creare le credenziali OAuth di Google nella Google Cloud Console e inserirle in Supabase.
- Creare l'account SendGrid e la chiave API, autenticare il dominio `popcorno.it` (record DNS su OVH; Claude può aiutare con la CLI di OVH già installata).
- Collegare il server MCP di Supabase (`/mcp`) se si vuole che Claude lavori sul database tramite MCP; altrimenti si usa la CLI di Supabase già installata e collegata.

## Lasciato al builder
- Organizzazione dei componenti React, dei percorsi e delle funzioni lato server per accesso, sincronizzazione e "I miei dati".
- Aspetto della riga di accesso, della schermata "controlla la tua email", del tasto "L'ho visto" e della pagina "I miei dati", in linea con lo stile attuale.
- Le migrazioni SQL (consigliato: cartella `supabase/migrations` nel repository, applicate con la CLI).
- Gestione della chiave pubblica di Supabase nella pagina (la chiave `anon`/publishable è pubblica per natura; la chiave di servizio non deve mai finire nel sito o nel repository).
- Service worker: non deve mettere in cache le chiamate a Supabase né le pagine personali.
- Indici sulla tabella `events` e limiti di dimensione per `ctx`.
