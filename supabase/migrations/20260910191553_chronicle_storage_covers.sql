-- Additive: no change to Local data, memberships, combat, rolls or timestamps.
alter table public.chronicles
  add column cover_path text,
  add column cover_width integer,
  add column cover_height integer,
  add constraint chronicle_cover_metadata check (
    (cover_path is null and cover_width is null and cover_height is null) or
    (cover_path is not null and cover_width is not null and cover_height is not null and cover_width between 1 and 960 and cover_height between 1 and 540
     and cover_path ~ ('^' || owner_id::text || '/' || id::text || '/[0-9a-f-]+\.(webp|jpg|png)$'))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chronicle-covers', 'chronicle-covers', false, 460800, array['image/webp','image/jpeg','image/png']);

-- Durable cleanup survives tab closure and network failure. Upload reservations
-- expire after one hour; committed replacements/deletions become due immediately.
create table public.chronicle_cover_cleanup (
  path text primary key,
  owner_id uuid not null,
  not_before timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now()
);
create index chronicle_cover_cleanup_owner_due on public.chronicle_cover_cleanup(owner_id, not_before);
alter table public.chronicle_cover_cleanup enable row level security;
revoke all on public.chronicle_cover_cleanup from anon, authenticated;
grant select, insert on public.chronicle_cover_cleanup to authenticated;
grant all on public.chronicle_cover_cleanup to service_role;
create policy cover_cleanup_select_self on public.chronicle_cover_cleanup for select to authenticated
  using (owner_id = (select auth.uid()));
create policy cover_cleanup_reserve on public.chronicle_cover_cleanup for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and not_before >= now() + interval '59 minutes'
    and not_before <= now() + interval '61 minutes'
    and exists (select 1 from public.chronicles c where c.owner_id = (select auth.uid())
      and path ~ ('^' || c.owner_id::text || '/' || c.id::text || '/[0-9a-f-]+\.(webp|jpg|png)$')
      and path is distinct from c.cover_path)
  );

create policy chronicle_covers_read on storage.objects for select to authenticated
  using (bucket_id = 'chronicle-covers' and exists (
    select 1 from public.chronicles c where c.id::text = (storage.foldername(name))[2]
      and c.owner_id::text = (storage.foldername(name))[1]
      and (c.cover_path = name or c.owner_id = (select auth.uid()))
  ));
create policy chronicle_covers_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chronicle-covers' and exists (
    select 1 from public.chronicle_cover_cleanup q where q.path = name
      and q.owner_id = (select auth.uid()) and q.not_before > now()
  ) and exists (select 1 from public.chronicles c
    where c.id::text = (storage.foldername(name))[2] and c.owner_id = (select auth.uid())));
-- Immutable object paths: no UPDATE/upsert and no direct client DELETE.
-- The cleanup function uses the Storage API, never SQL deletion of objects.

create function private.track_chronicle_cover() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if new.cover_path is not null then raise exception 'ONLINE_COVER_INVALID_UPLOAD'; end if;
    return new;
  end if;
  if TG_OP = 'UPDATE' and new.cover_path is distinct from old.cover_path and new.cover_path is not null then
    if not exists (select 1 from public.chronicle_cover_cleanup q
      where q.path = new.cover_path and q.owner_id = new.owner_id and q.not_before > now())
      or not exists (select 1 from storage.objects o where o.bucket_id = 'chronicle-covers' and o.name = new.cover_path) then
      raise exception 'ONLINE_COVER_INVALID_UPLOAD';
    end if;
    delete from public.chronicle_cover_cleanup where path = new.cover_path;
  end if;
  if TG_OP = 'DELETE' or (TG_OP = 'UPDATE' and old.cover_path is distinct from new.cover_path) then
    if old.cover_path is not null then
      insert into public.chronicle_cover_cleanup(path, owner_id, not_before)
      values(old.cover_path, old.owner_id, now())
      on conflict (path) do update set not_before = excluded.not_before;
    end if;
  end if;
  if TG_OP = 'DELETE' then
    -- Include failed/pending uploads belonging to this Chronicle.
    update public.chronicle_cover_cleanup set not_before = now()
      where owner_id = old.owner_id and split_part(path, '/', 2) = old.id::text;
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.track_chronicle_cover() from public, anon, authenticated;
create trigger track_chronicle_cover before insert or update or delete on public.chronicles
  for each row execute function private.track_chronicle_cover();

-- Creation starts without a cover; upload + optimistic UPDATE attach it.
alter table public.chronicles add constraint chronicle_cover_path_unique unique(cover_path);
