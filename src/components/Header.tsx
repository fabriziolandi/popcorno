import { useEffect, useState } from "react";
import { useApp } from "../app-state";
import { nowHM } from "../lib/data";
import { Avatar } from "./prof/Avatar";
import { useAccountVisible } from "./prof/useLogin";

// Orologio da televisore: vuoto sul server, l'ora del dispositivo si calcola solo nel browser.
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="clock" id="clock">
      {now && (
        <>
          {nowHM(now)}
          <small>{now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "short" })}</small>
        </>
      )}
    </div>
  );
}

// Tasto dell'account accanto all'orologio: senza account apre il riquadro di accesso, con l'account il Profilo.
function AccountButton() {
  const { user, openLogin, setView } = useApp();
  const visible = useAccountVisible();
  if (!visible) return null;
  if (user) {
    return (
      <button type="button" className="acc-btn" id="acc-btn" aria-label="Il tuo account" onClick={() => setView("prof")}>
        <Avatar user={user} size={36} />
      </button>
    );
  }
  return (
    <button type="button" className="acc-btn" id="acc-btn" aria-label="Accedi" onClick={(e) => openLogin({ from: e.currentTarget })}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.75" />
        <path d="M4.75 19.25c1.2-3.3 4-5 7.25-5s6.05 1.7 7.25 5" />
      </svg>
    </button>
  );
}

export function Header() {
  return (
    <header>
      <div className="logo">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="10" cy="9" r="5" fill="#fff6dc" />
          <circle cx="17" cy="6.5" r="5.5" fill="#ffe7a3" />
          <circle cx="23" cy="9.5" r="4.8" fill="#fff6dc" />
          <circle cx="14" cy="12" r="4" fill="#ffd36b" />
          <path d="M5 12h22l-3 18H8z" fill="#fff" />
          <path d="M9.4 12h3.4l.9 18h-3.3zM19.2 12h3.4l-1.9 18h-3.3z" fill="#ff4d6d" />
        </svg>
        Popcorno
      </div>
      {/* Il tasto viene prima nel codice (così il CSS può accorciare l'orologio) ma si vede a destra. */}
      <div className="hd-r">
        <AccountButton />
        <Clock />
      </div>
    </header>
  );
}
