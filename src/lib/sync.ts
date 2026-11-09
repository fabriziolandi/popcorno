// Sincronizzazione delle preferenze (`stasera`) con l'account: preferences.data = { v: 1, st, ck }.
// Si usa solo con una sessione: senza account il motore non si crea nemmeno.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_STATE } from "./state";
import { emptyClocks, merge, normClocks, type Synced } from "./sync-merge";
import type { Stasera } from "./types";

export type Client = Pick<SupabaseClient, "auth" | "from">;

export type SyncOpts = {
  client: () => Promise<Client>;
  local: () => Synced;
  apply: (s: Synced) => void;
  now: () => number;
  // La sessione non vale più (401, JWT scaduto o non valido): l'app resta in locale.
  onDenied?: () => void;
  // Il primo pull riuscito sostituisce lo stato locale con quello dell'account invece di unirli
  // (dispositivo usato prima da un altro account). Dopo si torna a unire.
  adopt?: boolean;
  // Il motore si è legato a questo account (primo pull riuscito).
  onOwner?: (uid: string) => void;
};

// stop: il motore smette per sempre (uscita dal provider), senza mandare ciò che è in attesa.
export type Sync = { pull(): Promise<void>; push(): void; flush(): Promise<void>; stop(): void };

const PUSH_MS = 1500;

type Res = { error: { code?: string; message?: string } | null; status?: number };

// Uguaglianza che ignora l'ordine delle chiavi (jsonb le riordina).
function eq(x: unknown, y: unknown): boolean {
  if (x === y) return true;
  if (Array.isArray(x) || Array.isArray(y)) {
    return Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => eq(v, y[i]));
  }
  if (!x || !y || typeof x !== "object" || typeof y !== "object") return false;
  const a = x as Record<string, unknown>, b = y as Record<string, unknown>;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
}

function remoteOf(data: unknown): Synced | null {
  const d = data as { v?: unknown; st?: unknown; ck?: unknown } | null;
  if (!d || d.v !== 1 || !d.st || typeof d.st !== "object") return null;
  const st: Stasera = Object.assign(structuredClone(DEFAULT_STATE), d.st);
  return { st, ck: normClocks(d.ck) };
}

const offline = (r: Res) => r.status === 0 || (typeof navigator !== "undefined" && navigator.onLine === false);
// Solo una sessione rifiutata conta; un 403/42501 (permessi o RLS) è un errore qualunque.
const denied = (r: Res) => r.status === 401 || r.error?.code === "PGRST301" || r.error?.code === "PGRST303";

export function createSync(opts: SyncOpts): Sync {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiting: "pull" | "push" | null = null;
  let dead = false;
  // L'account a cui appartengono i dati locali uniti: lo lega solo un pull riuscito.
  // Prima di allora un push non scrive (rilegge l'account); con un altro account in sessione non parte.
  let owner: string | null = null;
  let adopt = !!opts.adopt;

  const userId = async (c: Client): Promise<string | null> => {
    const { data } = await c.auth.getSession();
    return data.session?.user.id ?? null;
  };

  // Senza rete si riprova una volta sola, all'evento `online`; un pull in attesa vale anche come push.
  const retryOnline = (what: "pull" | "push") => {
    if (waiting) {
      if (what === "pull") waiting = "pull";
      return;
    }
    waiting = what;
    window.addEventListener("online", () => {
      const w = waiting;
      waiting = null;
      void (w === "pull" ? pull() : send());
    }, { once: true });
  };

  // Ritorna true se si può andare avanti.
  const handle = (r: Res, what: "pull" | "push"): boolean => {
    // Un motore fermato (uscita o nuovo accesso) non tocca più la sessione, nemmeno per un 401 in ritardo.
    if (dead) return false;
    if (!r.error) return true;
    if (denied(r)) {
      dead = true;
      opts.onDenied?.();
    } else if (offline(r)) {
      retryOnline(what);
    }
    // altri errori: nessun nuovo tentativo, si riprova al prossimo cambio o rientro
    return false;
  };

  // L'invio in corso: flush lo aspetta anche quando il timer è già scattato.
  let inflight: Promise<void> | null = null;
  function send(): Promise<void> {
    const p = doSend().finally(() => { if (inflight === p) inflight = null; });
    inflight = p;
    return p;
  }

  async function doSend(): Promise<void> {
    if (dead) return;
    try {
      const c = await opts.client();
      const uid = await userId(c);
      if (!uid || dead) return;
      // Senza un pull riuscito i dati locali non sono ancora uniti all'account: si rilegge,
      // e il pull scrive l'unione.
      if (!owner) return pull();
      if (uid !== owner) return;
      const { st, ck } = opts.local();
      const r = (await c.from("preferences").upsert({
        user_id: uid,
        data: { v: 1, st, ck },
        updated_at: new Date(opts.now()).toISOString(),
      })) as Res;
      handle(r, "push");
    } catch {
      retryOnline("push");
    }
  }

  function push(): void {
    if (dead) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void send();
    }, PUSH_MS);
  }

  async function pull(): Promise<void> {
    if (dead) return;
    try {
      const c = await opts.client();
      const uid = await userId(c);
      if (!uid || dead) return;
      const r = (await c.from("preferences").select("data").eq("user_id", uid).maybeSingle()) as Res & {
        data: { data?: unknown } | null;
      };
      // L'account è cambiato mentre si leggeva: il risultato non è suo, si scarta.
      if ((await userId(c)) !== uid || dead) return;
      if (!handle(r, "pull")) return;
      owner = uid;
      const remote = remoteOf(r.data?.data);
      const loc = opts.local();
      if (adopt) {
        // Si prendono i dati dell'account così come sono; un account vuoto riparte dai valori predefiniti.
        adopt = false;
        const next = remote ?? { st: structuredClone(DEFAULT_STATE), ck: emptyClocks() };
        if (!eq(next, loc)) opts.apply(next);
        if (!remote) push();
      } else {
        const merged = remote ? merge(loc, remote, opts.now()) : loc;
        if (!eq(merged, loc)) opts.apply(merged);
        if (!remote || !eq(merged, remote)) push();
      }
      opts.onOwner?.(uid);
    } catch {
      retryOnline("pull");
    }
  }

  async function flush(): Promise<void> {
    if (inflight) await inflight.catch(() => {});
    // Una modifica arrivata nel frattempo ha un nuovo timer: si manda ora.
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    await send();
  }

  function stop(): void {
    dead = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return { pull, push, flush, stop };
}
