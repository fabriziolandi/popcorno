import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Percorso sconosciuto: nessuna pagina propria, come oggi.
function NotFound() {
  return <p>Pagina non trovata.</p>;
}

export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true, trailingSlash: "preserve", defaultNotFoundComponent: NotFound });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
