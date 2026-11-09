import { useEffect, useState } from "react";
import { useApp } from "../../app-state";
import { accountVisible, sendLink, signInWithGoogle, signOut, verifyCode } from "../../lib/account";

const input = { width: "100%", padding: 14, borderRadius: 14, background: "var(--notte2)", color: "var(--testo)", border: "1.5px solid var(--bordo)", font: "600 15px Figtree,sans-serif" } as const;
const FLAG = "popcorno-accesso-in-corso";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const flag = {
  set() { try { sessionStorage.setItem(FLAG, "1"); } catch { /* storage non disponibile */ } },
  clear() { try { sessionStorage.removeItem(FLAG); } catch { /* storage non disponibile */ } },
  on(): boolean { try { return sessionStorage.getItem(FLAG) === "1"; } catch { return false; } },
};

// Riga discreta di accesso nel Profilo. Visibile solo dopo il mount (niente differenze con l'HTML del server).
export function Account() {
  const { user, toast, setView } = useApp();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = localStorage; } catch { /* storage non disponibile */ }
    setVisible(accountVisible(storage, location.search));
  }, []);

  // Ingresso avviato da qui (codice, link o Google): un solo saluto.
  useEffect(() => {
    if (user && flag.on()) {
      flag.clear();
      toast("Fatto! Ora i tuoi gusti ti seguono su ogni dispositivo 🍿");
    }
  }, [user, toast]);

  if (!visible && !user) return null;

  if (user) {
    return (
      <div className="grp"><h3>Il tuo account</h3><p>Sei dentro come {user.email}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="act" onClick={() => setView("dati")}>I miei dati</button>
          <button className="act" onClick={async () => {
            try {
              await signOut();
              toast("Sei uscito: le preferenze restano su questo dispositivo");
            } catch (e) {
              toast((e as Error).message);
            }
          }}>Esci</button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="grp">
        <button className="act" style={{ width: "100%" }} onClick={() => setOpen(true)}>🔑 Ricorda i miei gusti su tutti i dispositivi</button>
      </div>
    );
  }

  const send = async () => {
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
    setBusy(true);
    try {
      await verifyCode(email.trim(), code.trim());
    } catch {
      toast("Il codice non è giusto o è scaduto");
    } finally {
      setBusy(false);
    }
  };
  const google = async () => {
    flag.set();
    try {
      await signInWithGoogle();
    } catch {
      flag.clear();
      toast("Non riesco ad aprire l'accesso con Google, riprova tra poco");
    }
  };

  return (
    <div className="grp">
      {sent ? (
        <>
          <p>Controlla la tua email: ti ho mandato un link per entrare. Se usi Popcorno dalla schermata Home, scrivi qui il codice di 6 cifre.</p>
          <input aria-label="Codice di 6 cifre" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} style={input} />
          <button className="act" disabled={busy} style={{ width: "100%", marginTop: 10 }} onClick={enter}>Entra</button>
          <p style={{ marginTop: 10 }}><a href="#" onClick={(e) => { e.preventDefault(); setSent(false); setCode(""); flag.clear(); }}>Usa un'altra email</a></p>
        </>
      ) : (
        <>
          <input type="email" aria-label="La tua email" placeholder="La tua email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
          <button className="act" disabled={busy} style={{ width: "100%", marginTop: 10 }} onClick={send}>Mandami il link</button>
          <button className="act" style={{ width: "100%", marginTop: 10 }} onClick={google}>Continua con Google</button>
          <p style={{ marginTop: 10 }}>Con l'account Popcorno ricorda cosa scegli per proporti di meglio. Puoi vedere e cancellare tutto in «I miei dati». <a href="/privacy/">Privacy</a></p>
        </>
      )}
    </div>
  );
}
