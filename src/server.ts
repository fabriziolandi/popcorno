import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { withSecurityHeaders } from "./lib/security-headers";

// Ingresso del Worker: quello predefinito di TanStack Start, con le intestazioni di sicurezza.
export default createServerEntry({
  async fetch(...args: Parameters<typeof handler.fetch>) {
    return withSecurityHeaders(await handler.fetch(...args));
  },
});
