import { useApp } from "../app-state";

export function Toast() {
  const { toastMsg, toastOn } = useApp();
  return (
    <div className={toastOn ? "toast show" : "toast"} id="toast" role="status">
      {toastMsg}
    </div>
  );
}
