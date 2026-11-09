// Schema del database Supabase "popcorno" (ref gvdarnmxnigprebwjglq).
// Vedi docs/superpowers/specs/2026-11-07-accesso-e-storico-design.md
//
// Ogni riga appartiene a una persona (auth.uid()): Row Level Security su tutte le tabelle.
// Il sito parla con il database tramite supabase-js e la chiave pubblica; Drizzle serve
// solo a descrivere lo schema e a generare le migrazioni.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUid, authUsers } from "drizzle-orm/supabase";

const own = (col: string) => sql`${sql.identifier(col)} = ${authUid}`;

// Una riga per persona, creata dal trigger alla registrazione (vedi migrazione custom).
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Interruttore "Ricorda le mie scelte": se false non si registrano eventi.
    trackEvents: boolean("track_events").notNull().default(true),
  },
  () => [
    pgPolicy("profiles: leggo il mio", { for: "select", to: authenticatedRole, using: own("id") }),
    pgPolicy("profiles: modifico il mio", {
      for: "update",
      to: authenticatedRole,
      using: own("id"),
      withCheck: own("id"),
    }),
  ],
);

// Stato attuale dell'oggetto `stasera` (abbonamenti, squadra, città, liste...).
export const preferences = pgTable(
  "preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .default(sql`auth.uid()`)
      .references(() => authUsers.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("preferences_data_size", sql`pg_column_size(${t.data}) <= 262144`),
    pgPolicy("preferences: leggo le mie", { for: "select", to: authenticatedRole, using: own("user_id") }),
    pgPolicy("preferences: creo le mie", { for: "insert", to: authenticatedRole, withCheck: own("user_id") }),
    pgPolicy("preferences: modifico le mie", {
      for: "update",
      to: authenticatedRole,
      using: own("user_id"),
      withCheck: own("user_id"),
    }),
  ],
);

export const eventKinds = [
  "open",
  "like",
  "dislike",
  "unlike",
  "undislike",
  "seen",
  "unseen",
  "watch_add",
  "watch_remove",
  "follow",
  "unfollow",
  "trailer",
  "showtimes",
  "go",
] as const;

// Storico dei segnali: una riga per segnale, mai modificata (le marce indietro sono eventi).
export const events = pgTable(
  "events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // Ora del server: il browser non può impostarla (vedi permessi nella migrazione custom).
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind", { enum: eventKinds }).notNull(),
    titleRef: text("title_ref"), // "movie/123", "tv/456" oppure "tipo:nome"
    title: text("title"),
    itemType: text("item_type"),
    genre: text("genre"),
    source: text("source"),
    ctx: jsonb("ctx"),
  },
  (t) => [
    index("events_user_created_idx").on(t.userId, t.createdAt.desc()),
    check(
      "events_kind_valid",
      sql`${t.kind} in (${sql.raw(eventKinds.map((k) => `'${k}'`).join(", "))})`,
    ),
    check("events_ctx_size", sql`${t.ctx} is null or pg_column_size(${t.ctx}) <= 4096`),
    check("events_title_ref_len", sql`${t.titleRef} is null or length(${t.titleRef}) <= 200`),
    check("events_title_len", sql`${t.title} is null or length(${t.title}) <= 300`),
    pgPolicy("events: leggo i miei", { for: "select", to: authenticatedRole, using: own("user_id") }),
    // Si registra solo se "Ricorda le mie scelte" è attivo.
    pgPolicy("events: registro i miei", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${own("user_id")} and exists (
        select 1 from public.profiles p where p.id = ${authUid} and p.track_events
      )`,
    }),
    // "Cancella lo storico".
    pgPolicy("events: cancello i miei", { for: "delete", to: authenticatedRole, using: own("user_id") }),
  ],
);
