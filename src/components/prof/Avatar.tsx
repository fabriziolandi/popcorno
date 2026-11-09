import { useState } from "react";
import type { User } from "../../app-state";

// Foto del profilo Google ritagliata a cerchio, o l'iniziale su cerchio color lampada.
// La foto arriva da googleusercontent.com: senza referrer, e se non si carica resta l'iniziale.
export function Avatar({ user, size }: { user: User; size: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (user.avatar && broken !== user.avatar) {
    return <img className="avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" style={style} onError={() => setBroken(user.avatar!)} />;
  }
  const initial = Array.from((user.name || user.email || "?").trim())[0]?.toUpperCase() ?? "?";
  return <span className="avatar" aria-hidden="true" style={style}>{initial}</span>;
}
