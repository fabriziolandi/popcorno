# Pagina privacy: testo per le statistiche con PostHog

Va online **insieme alla chiave PostHog** (`POSTHOG_KEY` in `src/lib/analytics.ts`), non prima e non dopo:
finché la chiave è vuota il sito non invia nulla e la pagina attuale resta vera.

Scelta del proprietario (2026-11-09): tracciamento completo (ID salvato nel browser, registrazione delle
sessioni, errori, clic ed eventi), **senza banner di consenso**. Rischio noto e accettato dal proprietario:
per le linee guida del Garante (cookie e strumenti analoghi, 2021) statistiche che riconoscono il visitatore
e registrano le sessioni richiedono il consenso preventivo. La pagina deve comunque dire la verità.

## 1. Data
> Ultimo aggiornamento: **[data di attivazione]**

## 2. "In breve" diventa
> **In breve:** Popcorno non ti chiede di registrarti e non mostra pubblicità. Per capire come viene usata
> l'app e migliorarla raccogliamo statistiche d'uso con PostHog: pagine viste, tocchi, scelte fatte nell'app,
> errori e una registrazione anonima della sessione (i campi di testo sono sempre oscurati). Le tue
> preferenze restano sul tuo dispositivo.

## 3. "Quali dati usa l'app": nuovo punto (dopo "Link di sincronizzazione")
> **Statistiche d'uso.** Mentre usi Popcorno registriamo le pagine che apri, i pulsanti che tocchi, le
> risposte alle domande, le proposte che ti mostriamo e cosa ne fai (Da vedere, 👍/👎, Trailer, Condividi),
> i filtri e le ricerche nella guida, la città e gli abbonamenti scelti, gli errori dell'app e una
> registrazione della sessione (cosa compare sullo schermo e dove tocchi; quello che scrivi nei campi di
> testo è oscurato). Per riconoscere le visite successive dallo stesso browser salviamo un identificativo
> casuale nella memoria del browser e in un cookie. Non conosciamo il tuo nome né la tua email, e non
> usiamo questi dati per pubblicità.

## 4. "Servizi esterni": nuovo punto (dopo Cloudflare)
> **PostHog** (PostHog Inc.) raccoglie le statistiche d'uso per nostro conto, come responsabile del
> trattamento. I dati sono conservati nella sua regione europea (server in Germania), ma PostHog Inc. ha
> sede negli Stati Uniti: eventuali accessi da fuori dall'UE avvengono con le garanzie previste dal GDPR.
> [Informativa di PostHog](https://posthog.com/privacy).

## 5. "Cookie" diventa
> Popcorno usa la memoria locale del browser e una cache, strumenti tecnici necessari per ricordare le tue
> preferenze e funzionare anche senza rete. Usa inoltre un cookie e una voce nella memoria del browser di
> PostHog (nome che inizia con `ph_`) per le statistiche d'uso descritte sopra. Puoi cancellarli in
> qualsiasi momento svuotando i dati del sito dalle impostazioni del browser.

## 6. "Base giuridica e conservazione": frase aggiunta
> Le statistiche d'uso sono trattate per il nostro interesse legittimo a capire come viene usata l'app e a
> correggerne gli errori (art. 6.1.f GDPR) e sono conservate per [12 mesi / il periodo impostato in PostHog].

## Disattivazione delle statistiche
Per ora (fase di test, 2026-11-10) il proprietario ha scelto di **non** mostrare il pulsante "Non voglio le
statistiche" né la frase che lo cita. Il codice è pronto in `src/lib/analytics.ts` (`setOptOut`,
`isOptedOut`): da riattivare nella pagina privacy quando arrivano gli utenti.

## Nota
Testo preparato da Claude, non è una consulenza legale.
