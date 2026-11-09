import { useApp } from "../../app-state";
import { signOut } from "../../lib/account";
import { Avatar } from "./Avatar";
import { GoogleButton } from "./GoogleButton";
import { useAccountVisible, useLogin } from "./useLogin";

// Riquadro dell'account in cima al Profilo. Visibile solo dopo il mount (niente differenze con l'HTML del server).
export function Account() {
  const { user, toast, setView, openLogin, flushSync } = useApp();
  const visible = useAccountVisible();
  const login = useLogin();

  if (!visible) return null;

  if (user) {
    return (
      <div className="grp acc-box" id="acc-box">
        <div className="acc-who">
          <Avatar user={user} size={48} />
          <div>
            {user.name && <b>{user.name}</b>}
            <span>{user.email}</span>
          </div>
        </div>
        <div className="acc-row">
          <button className="act" onClick={() => setView("dati")}>I miei dati</button>
          <button className="act" onClick={async () => {
            try {
              await flushSync();
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

  return (
    <div className="grp acc-box acc-invite" id="acc-box">
      <h3>Accedi per ritrovare i tuoi gusti su tutti i tuoi dispositivi</h3>
      <div className="acc-row">
        <GoogleButton busy={login.busy} onClick={() => void login.google()} />
        <button className="act" onClick={(e) => openLogin({ email: true, from: e.currentTarget })}>Entra con l'email</button>
      </div>
    </div>
  );
}
