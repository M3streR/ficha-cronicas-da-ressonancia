-- DELETE filters in Supabase Realtime need the previous primary-key identity.
-- Keep the table and its RLS policies unchanged; only expand the WAL identity.
alter table public.online_characters replica identity full;
