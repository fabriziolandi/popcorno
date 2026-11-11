import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { withSecurityHeaders } from "./lib/security-headers";
import { avviaAggiornamento, type EnvAggiornamento } from "./lib/avvio-aggiornamento";

// Ingresso del Worker: quello predefinito di TanStack Start, con le intestazioni di sicurezza.
const entry = createServerEntry({
  async fetch(...args: Parameters<typeof handler.fetch>) {
    return withSecurityHeaders(await handler.fetch(...args));
  },
});

export default {
  ...entry,
  // Timer di Cloudflare: avvia l'aggiornamento dei dati su GitHub.
  async scheduled(_controller: unknown, env: EnvAggiornamento, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(avviaAggiornamento(env));
  },
};
