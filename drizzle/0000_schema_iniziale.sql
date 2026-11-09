CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"title_ref" text,
	"title" text,
	"item_type" text,
	"genre" text,
	"source" text,
	"ctx" jsonb,
	CONSTRAINT "events_kind_valid" CHECK ("events"."kind" in ('open', 'like', 'dislike', 'unlike', 'undislike', 'seen', 'unseen', 'watch_add', 'watch_remove', 'follow', 'unfollow', 'trailer', 'showtimes', 'go')),
	CONSTRAINT "events_ctx_size" CHECK ("events"."ctx" is null or pg_column_size("events"."ctx") <= 4096),
	CONSTRAINT "events_title_ref_len" CHECK ("events"."title_ref" is null or length("events"."title_ref") <= 200),
	CONSTRAINT "events_title_len" CHECK ("events"."title" is null or length("events"."title") <= 300)
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "preferences" (
	"user_id" uuid PRIMARY KEY DEFAULT auth.uid() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_data_size" CHECK (pg_column_size("preferences"."data") <= 262144)
);
--> statement-breakpoint
ALTER TABLE "preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"track_events" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_user_created_idx" ON "events" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "events: leggo i miei" ON "events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "events: registro i miei" ON "events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_id" = (select auth.uid()) and exists (
        select 1 from public.profiles p where p.id = (select auth.uid()) and p.track_events
      ));--> statement-breakpoint
CREATE POLICY "events: cancello i miei" ON "events" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "preferences: leggo le mie" ON "preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "preferences: creo le mie" ON "preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "preferences: modifico le mie" ON "preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles: leggo il mio" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles: modifico il mio" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("id" = (select auth.uid())) WITH CHECK ("id" = (select auth.uid()));