import { useEffect, useRef, useState } from "react";
import { useApp } from "../../app-state";
import { accountVisible, sendLink, signInWithGoogle, verifyCode } from "../../lib/account";

const FLAG = "popcorno-accesso-in-corso";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Segna che l'accesso è partito da qui (codice, link o Google): all'arrivo dell'utente un solo saluto.
const flag = {
  set() { try { sessionStorage.setItem(FLAG, "1"); } catch { /* storage non disponibile */ } },
  clear() { try { sessionStorage.removeItem(FLAG); } catch { /* storage non disponibile */ } },
  on(): boolean { try { return sessionStorage.getItem(FLAG) === "1"; } catch { return false; } },
};

// Tutto ciò che riguarda l'account si vede solo dopo il mount (niente differenze con l'HTML del server):
// con ?account=1 (fino alla messa online), con una sessione salvata, o con un utente già dentro.
export function useAccountVisible(): boolean {
  const { user } = useApp();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = localStorage; } catch { /* storage non disponibile */ }
    setVisible(accountVisible(storage, location.search));
  }, []);
  return visible || !!user;
}

// Saluto all'ingresso avviato da qui. Va chiamato in un solo componente sempre montato.
export function useWelcome(): void {
  const { user, toast } = useApp();
  useEffect(() => {
    if (user && flag.on()) {
      flag.clear();
      toast("Fatto! Ora i tuoi gusti ti seguono su ogni dispositivo 🍿");
    }
  }, [user, toast]);
}

// Accesso con l'email (link o codice di 6 cifre) e con Google, usato dal riquadro e dal Profilo.
export function useLogin() {
  const { toast } = useApp();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusyRaw] = useState(false);
  // Anche nel ref: due tocchi ravvicinati vedono subito il primo.
  const busyRef = useRef(false);
  const setBusy = (on: boolean) => { busyRef.current = on; setBusyRaw(on); };

  // Tornando indietro da Google con la cache della pagina (bfcache) i pulsanti tornano attivi.
  useEffect(() => {
    const h = (e: PageTransitionEvent) => { if (e.persisted) { busyRef.current = false; setBusyRaw(false); } };
    window.addEventListener("pageshow", h);
    return () => window.removeEventListener("pageshow", h);
  }, []);

  const send = async () => {
    if (busyRef.current) return;
    const e = email.trim();
    if (!EMAIL.test(e)) { toast("Scrivi un indirizzo email valido"); return; }
    setBusy(true);
    flag.set();
    try {
      await sendLink(e);
      setSent(true);
    } catch {
      flag.clear();
      toast("Non riesco a mandare l'email, riprova tra poco");
    } finally {
      setBusy(false);
    }
  };
  const enter = async () => {
    if (busyRef.current) return;
    setBusy(true);
    try {
      await verifyCode(email.trim(), code.trim());
    } catch {
      toast("Il codice non è giusto o è scaduto");
    } finally {
      setBusy(false);
    }
  };
  // Google porta via dalla pagina: busy resta acceso finché non si torna (o finché non fallisce).
  const google = async () => {
    if (busyRef.current) return;
    setBusy(true);
    flag.set();
    try {
      await signInWithGoogle();
    } catch {
      flag.clear();
      setBusy(false);
      toast("Non riesco ad aprire l'accesso con Google, riprova tra poco");
    }
  };
  const otherEmail = () => { setSent(false); setCode(""); flag.clear(); };

  return { email, setEmail, sent, code, setCode, busy, send, enter, google, otherEmail };
}
