begin;

-- A local Chronicle remains independent after publishing. This stable relation
-- prevents accidental duplicate online copies without coupling both records.
alter table public.chronicles add column if not exists source_local_id text;
create unique index if not exists chronicles_owner_source_local_uidx
  on public.chronicles (owner_id, source_local_id)
  where source_local_id is not null;

-- These columns are essential to every Chronicle and current data was audited
-- before the constraints were introduced.
alter table public.chronicles
  alter column owner_id set not null,
  alter column name set not null,
  alter column updated_at set not null;

create table if not exists public.online_roll_records (
  id uuid primary key default gen_random_uuid(),
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  confrontation_id uuid references public.chronicle_confrontations(id) on delete set null,
  online_character_id uuid references public.online_characters(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  character_name text not null check (char_length(btrim(character_name)) between 1 and 160),
  source text not null default 'quick-dice' check (char_length(source) between 1 and 80),
  category text not null default 'expression' check (char_length(category) between 1 and 80),
  expression text not null check (char_length(btrim(expression)) between 1 and 120),
  dice_count integer check (dice_count is null or dice_count between 0 and 1000),
  dice_sides integer check (dice_sides is null or dice_sides between 2 and 1000000),
  rolls jsonb not null default '[]'::jsonb check (jsonb_typeof(rolls) = 'array'),
  modifier integer not null default 0 check (modifier between -1000000 and 1000000),
  subtotal integer,
  total integer not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists online_roll_records_chronicle_created_idx
  on public.online_roll_records (chronicle_id, created_at desc, id desc);
create index if not exists online_roll_records_character_created_idx
  on public.online_roll_records (online_character_id, created_at desc, id desc)
  where online_character_id is not null;
create index if not exists online_roll_records_confrontation_created_idx
  on public.online_roll_records (confrontation_id, created_at desc, id desc)
  where confrontation_id is not null;

alter table public.online_roll_records enable row level security;

drop policy if exists online_roll_records_select_accessible on public.online_roll_records;
create policy online_roll_records_select_accessible on public.online_roll_records
  for select to authenticated
  using ((select private.can_access_chronicle(chronicle_id)));

drop policy if exists online_roll_records_insert_own_character on public.online_roll_records;
create policy online_roll_records_insert_own_character on public.online_roll_records
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.can_access_chronicle(chronicle_id))
    and exists (
      select 1 from public.online_characters oc
      join public.chronicle_cast_members ccm on ccm.character_id = oc.id
      where oc.id = online_character_id
        and oc.owner_id = (select auth.uid())
        and ccm.chronicle_id = chronicle_id
    )
    and (
      confrontation_id is null
      or exists (
        select 1 from public.chronicle_confrontations cc
        join public.confrontation_character_links ccl on ccl.confrontation_id = cc.id
        where cc.id = confrontation_id
          and cc.chronicle_id = chronicle_id
          and cc.active
          and ccl.character_id = online_character_id
      )
    )
  );

drop policy if exists online_roll_records_delete_owner on public.online_roll_records;
create policy online_roll_records_delete_owner on public.online_roll_records
  for delete to authenticated
  using ((select private.is_chronicle_owner(chronicle_id)));

create or replace function public.append_online_roll(
  p_id uuid,
  p_chronicle_id uuid,
  p_confrontation_id uuid,
  p_online_character_id uuid,
  p_character_name text,
  p_source text,
  p_category text,
  p_expression text,
  p_dice_count integer,
  p_dice_sides integer,
  p_rolls jsonb,
  p_modifier integer,
  p_subtotal integer,
  p_total integer,
  p_metadata jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'ONLINE_AUTH_REQUIRED'; end if;
  if not private.can_access_chronicle(p_chronicle_id) then raise exception 'ONLINE_CHRONICLE_FORBIDDEN'; end if;
  if p_online_character_id is null or not exists (
    select 1 from public.online_characters oc
    join public.chronicle_cast_members ccm on ccm.character_id = oc.id
    where oc.id = p_online_character_id
      and oc.owner_id = v_user
      and ccm.chronicle_id = p_chronicle_id
  ) then raise exception 'ONLINE_CHARACTER_NOT_AVAILABLE'; end if;
  if p_confrontation_id is not null and not exists (
    select 1 from public.chronicle_confrontations cc
    join public.confrontation_character_links ccl on ccl.confrontation_id = cc.id
    where cc.id = p_confrontation_id
      and cc.chronicle_id = p_chronicle_id
      and cc.active
      and ccl.character_id = p_online_character_id
  ) then raise exception 'ONLINE_COMBAT_CONTEXT_INVALID'; end if;

  insert into public.online_roll_records (
    id, chronicle_id, confrontation_id, online_character_id, author_id,
    character_name, source, category, expression, dice_count, dice_sides,
    rolls, modifier, subtotal, total, metadata
  ) values (
    p_id, p_chronicle_id, p_confrontation_id, p_online_character_id, v_user,
    btrim(p_character_name), coalesce(nullif(btrim(p_source), ''), 'quick-dice'),
    coalesce(nullif(btrim(p_category), ''), 'expression'), btrim(p_expression),
    p_dice_count, p_dice_sides, coalesce(p_rolls, '[]'::jsonb),
    coalesce(p_modifier, 0), p_subtotal, p_total, coalesce(p_metadata, '{}'::jsonb)
  ) on conflict (id) do nothing;
  return p_id;
end;
$$;

create or replace function public.clear_online_roll_history(p_chronicle_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_count integer;
begin
  if not private.is_chronicle_owner(p_chronicle_id) then raise exception 'ONLINE_CHRONICLE_FORBIDDEN'; end if;
  delete from public.online_roll_records where chronicle_id = p_chronicle_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.append_online_roll(uuid,uuid,uuid,uuid,text,text,text,text,integer,integer,jsonb,integer,integer,integer,jsonb) from public;
grant execute on function public.append_online_roll(uuid,uuid,uuid,uuid,text,text,text,text,integer,integer,jsonb,integer,integer,integer,jsonb) to authenticated;
revoke all on function public.clear_online_roll_history(uuid) from public;
grant execute on function public.clear_online_roll_history(uuid) to authenticated;
grant select, insert, delete on public.online_roll_records to authenticated;

-- Removing a member must also remove their characters from any confrontation
-- in this Chronicle before removing them from the cast.
create or replace function private.cleanup_departed_member_cast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.confrontation_character_links ccl
  using public.chronicle_confrontations cc, public.online_characters oc
  where ccl.confrontation_id = cc.id
    and ccl.character_id = oc.id
    and cc.chronicle_id = old.chronicle_id
    and oc.owner_id = old.user_id;

  delete from public.chronicle_cast_members ccm
  using public.online_characters oc
  where ccm.chronicle_id = old.chronicle_id
    and ccm.character_id = oc.id
    and oc.owner_id = old.user_id;
  return old;
end;
$$;

-- A deleted publication intentionally leaves historical rolls intact while
-- removing live combat references.
alter table public.confrontation_character_links
  drop constraint if exists confrontation_character_links_character_id_fkey;
alter table public.confrontation_character_links
  add constraint confrontation_character_links_character_id_fkey
  foreign key (character_id) references public.online_characters(id) on delete cascade;

alter table public.online_roll_records replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'online_roll_records'
  ) then
    alter publication supabase_realtime add table public.online_roll_records;
  end if;
end $$;

commit;
