import { useEffect, useRef, type KeyboardEvent } from "react";
import { useApp } from "../../app-state";
import { GoogleButton } from "./GoogleButton";
import { useLogin, useWelcome } from "./useLogin";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// Riquadro "Accedi o registrati" che sale dal basso. Montato una sola volta in Shell; si apre solo su tocco.
export function AccessSheet() {
  const { user, loginOpen, loginOpts, closeLogin } = useApp();
  const login = useLogin();
  useWelcome();
  const panel = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const open = loginOpen && !user;

  // Alla chiusura il passo del codice si azzera: riaperto riparte dall'email.
  const { sent, otherEmail } = login;
  useEffect(() => { if (!open && sent) otherEmail(); }, [open, sent]);

  // Accesso riuscito: il riquadro si chiude da solo.
  useEffect(() => { if (user && loginOpen) closeLogin(); }, [user, loginOpen, closeLogin]);

  // Apertura: focus sul primo controllo (o sul campo email), pagina sotto ferma, Esc chiude.
  // Chiusura: il focus torna al controllo che l'ha aperto.
  useEffect(() => {
    if (!open) return;
    const back = loginOpts.from ?? (document.activeElement as HTMLElement | null);
    const first = loginOpts.email && emailRef.current ? emailRef.current : panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") closeLogin(); };
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("keydown", esc);
      root.style.overflow = overflow;
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, [open, loginOpts, closeLogin]);

  if (!open) return null;

  // Il Tab gira dentro il riquadro.
  const trap = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || !panel.current) return;
    const all = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!all.length) return;
    const [a, z] = [all[0], all[all.length - 1]];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };

  return (
    <div className="sheet-wrap">
      <div className="sheet-veil" data-testid="velo" onClick={closeLogin} />
      <div className="sheet" ref={panel} role="dialog" aria-modal="true" aria-labelledby="acc-title" onKeyDown={trap}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-top">
          <h2 id="acc-title">Accedi o registrati</h2>
          <button type="button" className="sheet-x" aria-label="Chiudi" onClick={closeLogin}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {login.sent ? (
          <form onSubmit={(e) => { e.preventDefault(); void login.enter(); }}>
            <p className="sheet-lead">Controlla la tua email: ti ho mandato un link per entrare. Se usi Popcorno dalla schermata Home, scrivi qui il codice di 6 cifre.</p>
            <input className="sheet-in code ph-no-capture" aria-label="Codice di 6 cifre" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={login.code} onChange={(e) => login.setCode(e.target.value)} />
            <button type="submit" className="sheet-go" disabled={login.busy}>Entra</button>
            <p className="sheet-small"><a href="#" onClick={(e) => { e.preventDefault(); login.otherEmail(); }}>Usa un'altra email</a></p>
          </form>
        ) : (
          <>
            <p className="sheet-lead">Ritrova i tuoi gusti, la tua lista e le serie che segui su tutti i tuoi dispositivi.</p>
            <GoogleButton busy={login.busy} onClick={() => void login.google()} />
            <div className="sheet-or"><span>oppure</span></div>
            <form noValidate onSubmit={(e) => { e.preventDefault(); void login.send(); }}>
              <input ref={emailRef} className="sheet-in ph-no-capture" type="email" aria-label="La tua email" placeholder="La tua email" autoComplete="email" value={login.email} onChange={(e) => login.setEmail(e.target.value)} />
              <button type="submit" className="sheet-go" disabled={login.busy}>Entra con l'email</button>
            </form>
            <p className="sheet-small">Con l'account Popcorno ricorda cosa scegli per proporti di meglio. Puoi vedere e cancellare tutto in «I miei dati». <a href="/privacy/">Privacy</a></p>
          </>
        )}
      </div>
    </div>
  );
}
