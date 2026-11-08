import { useEffect, useState } from "react";
import { nowHM } from "../lib/data";

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
      <Clock />
    </header>
  );
}
