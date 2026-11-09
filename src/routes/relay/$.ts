import { createFileRoute } from "@tanstack/react-router";
import { proxyPosthog } from "../../lib/posthog-proxy";

// popcorno.it/relay/* → PostHog EU (vedi src/lib/posthog-proxy.ts).
export const Route = createFileRoute("/relay/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxyPosthog(request),
      POST: ({ request }) => proxyPosthog(request),
    },
  },
});
