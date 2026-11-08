# CLAUDE.md

## Supabase

This repo uses **only** the Supabase project **popcorno**.

- Project ref: `gvdarnmxnigprebwjglq`
- Region: `eu-central-1`
- DB host: `db.gvdarnmxnigprebwjglq.supabase.co`

Rules:
- Never read, modify or run commands against any other Supabase project in the account
  (e.g. football-ai, Emoji-WAR, FantaAI, ai-prediction-bot-cache, Cache Warmup Bot Telegram).
- With the CLI, always target popcorno: pass `--project-ref gvdarnmxnigprebwjglq`
  where a command accepts it, or link once with `supabase link --project-ref gvdarnmxnigprebwjglq`.
- With the Supabase MCP, use `project_id` / `project_ref` = `gvdarnmxnigprebwjglq` only.

## Database schema (Drizzle)

- Schema in `db/schema.ts`; migrations in `drizzle/` (applied with `npm run db:migrate`, needs `DATABASE_URL` in `.env`).
- Change the schema, then `npm run db:generate`. Triggers, functions and grants go in custom migrations
  (`npx drizzle-kit generate --custom --name ...`), e.g. `drizzle/0001_funzioni_e_permessi.sql`.
- Drizzle is a local tool only: the site talks to Supabase via `supabase-js` and the publishable key, protected by RLS.
