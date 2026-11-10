import { useEffect, useRef } from "react";
import { useApp } from "../../app-state";

// "Vuoi sostituire il tuo profilo?": compare quando si apre un link #profilo= su un dispositivo
// che ha già le sue preferenze. Senza conferma non cambia niente. Montato una sola volta in Shell.
export function ProfileOffer() {
  const { profileOffer, acceptProfile, rejectProfile, user } = useApp();
  const keep = useRef<HTMLButtonElement>(null);
  const open = profileOffer !== null;

  // Focus su "Annulla" (la scelta che non cambia niente), pagina sotto ferma, Esc annulla.
  useEffect(() => {
    if (!open) return;
    keep.current?.focus({ preventScroll: true });
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") rejectProfile(); };
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("keydown", esc);
      root.style.overflow = overflow;
    };
  }, [open, rejectProfile]);

  if (!open) return null;
  return (
    <div className="sheet-wrap">
      <div className="sheet-veil" onClick={rejectProfile} />
      <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="po-title" aria-describedby="po-text">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-top">
          <h2 id="po-title">Vuoi sostituire il tuo profilo?</h2>
        </div>
        <p id="po-text" className="sheet-lead">
          Hai aperto un link con le preferenze di un profilo Popcorno: abbonamenti, squadra, città, gusti e liste.
          Se confermi, prendono il posto di quelle {user ? "di questo dispositivo e del tuo account" : "di questo dispositivo"}.
          Usalo solo se il link è tuo o di una persona di cui ti fidi.
        </p>
        <button type="button" id="po-si" className="sheet-go" onClick={acceptProfile}>Sostituisci</button>
        <button type="button" id="po-no" ref={keep} className="act" style={{ width: "100%", marginTop: 10 }} onClick={rejectProfile}>Annulla, tieni il mio</button>
      </div>
    </div>
  );
}
