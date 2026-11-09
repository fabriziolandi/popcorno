import type { ReactElement } from "react";
import { useApp, type View } from "../app-state";

// Barra in basso come un telecomando.
const BTN: [View, ReactElement, string][] = [
  ["scegli", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></svg>, "Scegli"],
  ["onda", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="3" /><path d="m8 2 4 4 4-4" /></svg>, "Guida TV"],
  ["prof", <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>, "Profilo"],
];

export function Nav() {
  const { view, setView } = useApp();
  return (
    <nav aria-label="Sezioni">
      {BTN.map(([v, icon, label]) => (
        <button key={v} className={view === v || (v === "prof" && view === "dati") ? "on" : undefined} data-v={v} onClick={() => setView(v)}>
          {icon}
          {label}
        </button>
      ))}
    </nav>
  );
}
