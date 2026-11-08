import { useApp } from "../app-state";
import { Header } from "./Header";
import { Nav } from "./Nav";
import { Toast } from "./Toast";

// Una sola pagina: la barra in basso mostra una sezione e nasconde le altre (.hide), come l'app vecchia.
export function Shell() {
  const { view } = useApp();
  const hide = (v: string) => (view === v ? undefined : "hide");
  return (
    <>
      <div className="wrap">
        <Header />
        {/* SCEGLI: Task 5 */}
        <section id="v-scegli" className={hide("scegli")}></section>
        {/* GUIDA: Task 6 */}
        <section id="v-onda" className={hide("onda")}></section>
        {/* PROFILO: Task 7 */}
        <section id="v-prof" className={hide("prof")}></section>
      </div>
      <Nav />
      <Toast />
    </>
  );
}
