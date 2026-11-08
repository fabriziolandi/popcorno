-- Migrazione scritta a mano: cose che Drizzle non descrive (trigger, funzioni, permessi per colonna).

-- 1) Alla registrazione: crea profilo e preferenze vuote.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();--> statement-breakpoint

-- Utenti già registrati prima di questa migrazione (di solito nessuno).
INSERT INTO public.profiles (id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO public.preferences (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 2) "Elimina l'account": il browser chiama supabase.rpc('delete_account').
--    Cancellando auth.users, profilo, preferenze e storico spariscono a cascata.
CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Accesso richiesto';
  END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_account() FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;--> statement-breakpoint

-- 3) Permessi: chi non ha l'account non tocca nulla; chi ce l'ha scrive solo le colonne previste.
REVOKE ALL ON public.profiles, public.preferences, public.events FROM anon;--> statement-breakpoint

-- profiles: si cambia solo "Ricorda le mie scelte"; le righe le crea il trigger.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;--> statement-breakpoint
GRANT UPDATE (track_events) ON public.profiles TO authenticated;--> statement-breakpoint

-- preferences: niente cancellazione diretta (va via con l'account).
REVOKE DELETE ON public.preferences FROM authenticated;--> statement-breakpoint

-- events: mai modificati; created_at e user_id li decide il server.
REVOKE INSERT, UPDATE ON public.events FROM authenticated;--> statement-breakpoint
GRANT INSERT (kind, title_ref, title, item_type, genre, source, ctx) ON public.events TO authenticated;
