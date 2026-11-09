// Accesso facoltativo con Supabase. Il client si carica solo quando serve:
// senza account non parte nessuna richiesta verso supabase.co.
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://gvdarnmxnigprebwjglq.supabase.co";
// Chiave publishable (pubblica per progetto, protetta da RLS).
export const SUPABASE_KEY = "sb_publishable_vtC7tcEYhp_0wXj0yqbDNA_wLWP4YyC";
// Diventa true nel Task 10 (go-live).
export const ACCOUNT_PUBLIC = false;
export const SESSION_KEY = "sb-gvdarnmxnigprebwjglq-auth-token";
const FLAG_KEY = "popcorno-account";
// L'ultimo account a cui appartengono le preferenze di questo dispositivo: se entra un account
// diverso, si prendono i suoi dati invece di unirli a quelli locali (vedi app-state).
export const LAST_ACCOUNT_KEY = "popcorno-ultimo-account";

const safeGet = (s: Storage | null, k: string): string | null => {
  try { return s ? s.getItem(k) : null; } catch { return null; }
};

export function hasStoredSession(storage: Storage | null): boolean {
  return safeGet(storage, SESSION_KEY) !== null;
}

export function authInUrl(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.has("code") || p.has("token_hash");
}

export function accountVisible(storage: Storage | null, search: string): boolean {
  if (ACCOUNT_PUBLIC || hasStoredSession(storage)) return true;
  if (new URLSearchParams(search).get("account") === "1") {
    try { storage?.setItem(FLAG_KEY, "1"); } catch { /* storage non disponibile */ }
    return true;
  }
  return safeGet(storage, FLAG_KEY) === "1";
}

let client: SupabaseClient | null = null;
const readyCbs = new Set<(c: SupabaseClient) => void>();

// Avvisa quando il client nasce per un gesto della persona (per esempio "Mandami il link"),
// così l'app può ascoltare l'accesso senza creare il client da sé. Ritorna la funzione per smettere.
export function onClientReady(cb: (c: SupabaseClient) => void): () => void {
  readyCbs.add(cb);
  return () => { readyCbs.delete(cb); };
}

export async function getClient(): Promise<SupabaseClient> {
  if (client) return client;
  const { createClient } = await import("@supabase/supabase-js");
  // Un'altra chiamata può aver finito prima mentre aspettavamo l'import.
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    for (const cb of readyCbs) cb(client);
  }
  return client;
}

export function setClientForTests(c: unknown): void {
  client = c as SupabaseClient | null;
}

function fail(error: { message?: string } | null | undefined, fallback: string): void {
  if (!error) return;
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("expired") || m.includes("invalid")) {
    throw new Error("Il codice o il link non è valido o è scaduto. Chiedine uno nuovo.");
  }
  if (m.includes("rate") || m.includes("too many")) {
    throw new Error("Troppi tentativi. Aspetta un minuto e riprova.");
  }
  throw new Error(fallback);
}

export async function sendLink(email: string): Promise<void> {
  const c = await getClient();
  const { error } = await c.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + "/", shouldCreateUser: true },
  });
  fail(error, "Non siamo riusciti a inviare l'email. Riprova tra poco.");
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const c = await getClient();
  const { error } = await c.auth.verifyOtp({ email, token: code, type: "email" });
  fail(error, "Non siamo riusciti a verificare il codice. Riprova.");
}

export async function completeFromUrl(): Promise<void> {
  const url = new URL(location.href);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  try {
    if (tokenHash) {
      const c = await getClient();
      const { error } = await c.auth.verifyOtp({
        token_hash: tokenHash,
        type: (type ?? "email") as "email",
      });
      fail(error, "Non siamo riusciti a completare l'accesso. Riprova.");
    }
  } finally {
    for (const k of ["code", "token_hash", "type"]) url.searchParams.delete(k);
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  }
}

export async function signInWithGoogle(): Promise<void> {
  const c = await getClient();
  const { error } = await c.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + "/" },
  });
  fail(error, "Non siamo riusciti ad aprire l'accesso con Google. Riprova.");
}

export async function signOut(): Promise<void> {
  const c = await getClient();
  try {
    const { data } = await c.auth.getSession();
    const id = data.session?.user.id;
    if (id) localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch { /* storage vietato o sessione illeggibile */ }
  const { error } = await c.auth.signOut({ scope: "local" });
  fail(error, "Non siamo riusciti a uscire. Riprova.");
}

export async function deleteAccount(): Promise<void> {
  const c = await getClient();
  const { error } = await c.rpc("delete_account");
  fail(error, "Non siamo riusciti a eliminare l'account. Riprova.");
  // L'account non c'è più: le preferenze locali non appartengono più a nessuno.
  try { localStorage.removeItem(LAST_ACCOUNT_KEY); } catch { /* storage vietato */ }
  // Un'uscita fallita (per esempio senza rete) non è un errore: l'account è già eliminato.
  try { await c.auth.signOut({ scope: "local" }); } catch { /* già eliminato */ }
}
