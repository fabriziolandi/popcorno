import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Solo il progetto Supabase "popcorno" (ref gvdarnmxnigprebwjglq). Vedi CLAUDE.md.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Manca DATABASE_URL nel file .env (vedi .env.example)");
if (!url.includes("gvdarnmxnigprebwjglq")) {
  throw new Error("DATABASE_URL non punta al progetto popcorno (gvdarnmxnigprebwjglq)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  schemaFilter: ["public"],
  // I ruoli di Supabase (anon, authenticated...) esistono già: Drizzle non li tocca.
  entities: { roles: { provider: "supabase" } },
  strict: true,
  verbose: true,
});
