-- DELETE events need the contextual columns used by client-side validation.
alter table public.confrontation_character_links replica identity full;
alter table public.confrontation_adversaries replica identity full;
