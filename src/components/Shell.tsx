import { useApp } from "../app-state";
import { Header } from "./Header";
import { Nav } from "./Nav";
import { MieiDati } from "./prof/MieiDati";
import { Profile } from "./prof/Profile";
import { Guide } from "./onda/Guide";
import { Scegli } from "./scegli/Scegli";
import { Toast } from "./Toast";

// Una sola pagina: la barra in basso mostra una sezione e nasconde le altre (.hide), come l'app vecchia.
export function Shell() {
  const { view } = useApp();
  const hide = (v: string) => (view === v ? undefined : "hide");
  return (
    <>
      <div className="wrap">
        <Header />
        <section id="v-scegli" className={hide("scegli")}><Scegli /></section>
        <section id="v-onda" className={hide("onda")}><Guide /></section>
        <section id="v-prof" className={hide("prof")}><Profile /></section>
        <section id="v-dati" className={hide("dati")}><MieiDati /></section>
      </div>
      <Nav />
      <Toast />
    </>
  );
}
