import { createFileRoute } from "@tanstack/react-router";
import { AppStateProvider } from "../app-state";
import { Shell } from "../components/Shell";

export const Route = createFileRoute("/")({
  component: () => (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  ),
});
