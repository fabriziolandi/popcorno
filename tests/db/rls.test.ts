// @vitest-environment node
// Verifica trigger, politiche RLS e permessi sul database reale (progetto popcorno).
// Ogni caso gira in una transazione che finisce sempre in ROLLBACK: nulla resta nel database.
// Si salta senza DATABASE_URL (CI). In locale: DOTENV_PATH=C:/Progetti/popcorno/.env npx vitest run tests/db
import { config } from "dotenv";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

config({ path: process.env.DOTENV_PATH ?? ".env", quiet: true });
const url = process.env.DATABASE_URL;

type Tx = postgres.TransactionSql;
const ROLLBACK = Symbol("rollback");

describe.skipIf(!url)("database: trigger, RLS e permessi", () => {
  const sql = url ? postgres(url, { max: 1, prepare: false }) : (null as never);
  afterAll(async () => {
    await sql?.end();
  });

  // Esegue `fn` in una transazione e la annulla sempre; propaga gli errori di `fn`.
  async function inRollback(fn: (tx: Tx) => Promise<void>) {
    try {
      await sql.begin(async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  }

  async function nuovoUtente(tx: Tx, email: string) {
    const [u] = await tx`insert into auth.users (id, email) values (gen_random_uuid(), ${email}) returning id`;
    return u.id as string;
  }

  async function come(tx: Tx, id: string) {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: "authenticated" })}, true)`;
  }

  async function codiceErrore(p: PromiseLike<unknown>) {
    try {
      await p;
    } catch (e) {
      return (e as { code?: string }).code;
    }
    return undefined;
  }

  // Un errore dentro una transazione la invalida: ogni insert da rifiutare gira in un savepoint.
  async function rifiutato(tx: Tx, fn: (t: Tx) => PromiseLike<unknown>) {
    return codiceErrore(tx.savepoint((s) => fn(s) as never));
  }

  it("il trigger crea profilo e preferenze", () =>
    inRollback(async (tx) => {
      const id = await nuovoUtente(tx, "prova@example.com");
      await come(tx, id);
      const [p] = await tx`select count(*)::int as n from public.profiles where id = ${id}`;
      const [f] = await tx`select count(*)::int as n from public.preferences where user_id = ${id}`;
      expect(p.n).toBe(1);
      expect(f.n).toBe(1);
    }));

  it("vedo solo i miei eventi", () =>
    inRollback(async (tx) => {
      const a = await nuovoUtente(tx, "a@example.com");
      const b = await nuovoUtente(tx, "b@example.com");
      await come(tx, b);
      await tx`insert into public.events (kind, title) values ('like', 'Titolo di B')`;
      await come(tx, a);
      const [r] = await tx`select count(*)::int as n from public.events`;
      expect(r.n).toBe(0);
    }));

  it("con track_events spento l'inserimento è rifiutato", () =>
    inRollback(async (tx) => {
      const id = await nuovoUtente(tx, "prova@example.com");
      await come(tx, id);
      await tx`update public.profiles set track_events = false where id = ${id}`;
      const codice = await rifiutato(tx, (t) => t`insert into public.events (kind) values ('like')`);
      expect(codice).toBe("42501");
    }));

  it("created_at non si può impostare", () =>
    inRollback(async (tx) => {
      const id = await nuovoUtente(tx, "prova@example.com");
      await come(tx, id);
      const codice = await rifiutato(
        tx,
        (t) => t`insert into public.events (kind, created_at) values ('like', now() - interval '1 day')`,
      );
      expect(codice).toBe("42501");
    }));

  it("delete_account cancella tutto", () =>
    inRollback(async (tx) => {
      const id = await nuovoUtente(tx, "prova@example.com");
      await come(tx, id);
      await tx`insert into public.events (kind) values ('like')`;
      await tx`select public.delete_account()`;
      for (const [tabella, colonna] of [
        ["profiles", "id"],
        ["preferences", "user_id"],
        ["events", "user_id"],
      ] as const) {
        const [r] = await tx`select count(*)::int as n from ${tx("public." + tabella)} where ${tx(colonna)} = ${id}`;
        expect(r.n, tabella).toBe(0);
      }
    }));

  it("anon non legge nulla", () =>
    inRollback(async (tx) => {
      await tx`set local role anon`;
      const codice = await rifiutato(tx, (t) => t`select * from public.preferences`);
      expect(codice).toBe("42501");
    }));
});
