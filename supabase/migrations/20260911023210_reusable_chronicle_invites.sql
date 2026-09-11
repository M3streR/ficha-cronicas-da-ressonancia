alter table public.chronicle_invites
  add column if not exists multi_use boolean not null default false,
  add column if not exists max_uses integer,
  add column if not exists use_count integer not null default 0,
  add column if not exists expires_at timestamptz,
  add column if not exists last_used_at timestamptz;

update public.chronicle_invites
set use_count = 1,
    last_used_at = used_at
where used_at is not null
  and use_count = 0;

alter table public.chronicle_invites
  drop constraint if exists chronicle_invites_max_uses_check,
  drop constraint if exists chronicle_invites_use_count_check,
  add constraint chronicle_invites_max_uses_check
    check (max_uses is null or max_uses between 1 and 1000),
  add constraint chronicle_invites_use_count_check
    check (use_count >= 0 and (max_uses is null or use_count <= max_uses));

create index if not exists chronicle_invites_active_owner_idx
  on public.chronicle_invites (chronicle_id, created_at desc)
  where revoked_at is null;

drop function if exists public.create_chronicle_invite(uuid);
drop function if exists private.create_chronicle_invite_impl(uuid);

create function private.create_chronicle_invite_impl(
  p_chronicle_id uuid,
  p_max_uses integer,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if not private.is_chronicle_owner(p_chronicle_id) then
    raise exception 'only the chronicle owner can create invitations';
  end if;
  if p_max_uses is not null and (p_max_uses < 1 or p_max_uses > 1000) then
    raise exception 'invitation max uses must be between 1 and 1000';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '365 days') then
    raise exception 'invitation expiration must be in the future and within 365 days';
  end if;

  insert into public.chronicle_invites (
    chronicle_id, created_by, multi_use, max_uses, expires_at
  ) values (
    p_chronicle_id, v_user_id, true, p_max_uses, p_expires_at
  )
  returning code into v_code;

  return v_code;
end;
$$;

create function public.create_chronicle_invite(
  p_chronicle_id uuid,
  p_max_uses integer default null,
  p_expires_at timestamptz default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_chronicle_invite_impl(p_chronicle_id, p_max_uses, p_expires_at);
$$;

create or replace function private.accept_chronicle_invite_impl(p_code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.chronicle_invites%rowtype;
  v_inserted boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_invite
  from public.chronicle_invites
  where code = p_code
  for update;

  if v_invite.id is null then
    raise exception 'invitation is invalid';
  end if;

  if private.is_chronicle_owner(v_invite.chronicle_id)
     or exists (
       select 1 from public.chronicle_members
       where chronicle_id = v_invite.chronicle_id and user_id = v_user_id
     ) then
    return v_invite.chronicle_id;
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'invitation is revoked';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'invitation is expired';
  end if;
  if v_invite.multi_use then
    if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
      raise exception 'invitation usage limit reached';
    end if;
  elsif v_invite.used_at is not null then
    raise exception 'invitation is already used';
  end if;

  insert into public.chronicle_members (chronicle_id, user_id)
  values (v_invite.chronicle_id, v_user_id)
  on conflict (chronicle_id, user_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    return v_invite.chronicle_id;
  end if;

  if v_invite.multi_use then
    update public.chronicle_invites
    set use_count = use_count + 1,
        last_used_at = now()
    where id = v_invite.id;
  else
    update public.chronicle_invites
    set used_at = now(),
        used_by = v_user_id,
        use_count = 1,
        last_used_at = now()
    where id = v_invite.id;
  end if;

  return v_invite.chronicle_id;
end;
$$;

create or replace function private.revoke_chronicle_invite_impl(p_code uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_chronicle_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select chronicle_id into v_chronicle_id
  from public.chronicle_invites
  where code = p_code;

  if v_chronicle_id is null then return false; end if;
  if not private.is_chronicle_owner(v_chronicle_id) then
    raise exception 'only the chronicle owner can revoke invitations';
  end if;

  update public.chronicle_invites
  set revoked_at = coalesce(revoked_at, now())
  where code = p_code and revoked_at is null;
  return found;
end;
$$;

create or replace function public.accept_chronicle_invite(p_code uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.accept_chronicle_invite_impl(p_code); $$;

create or replace function public.revoke_chronicle_invite(p_code uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.revoke_chronicle_invite_impl(p_code); $$;

revoke all on function private.create_chronicle_invite_impl(uuid, integer, timestamptz) from public, anon;
revoke all on function private.accept_chronicle_invite_impl(uuid) from public, anon;
revoke all on function private.revoke_chronicle_invite_impl(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.create_chronicle_invite_impl(uuid, integer, timestamptz) to authenticated;
grant execute on function private.accept_chronicle_invite_impl(uuid) to authenticated;
grant execute on function private.revoke_chronicle_invite_impl(uuid) to authenticated;

revoke all on function public.create_chronicle_invite(uuid, integer, timestamptz) from public, anon;
revoke all on function public.accept_chronicle_invite(uuid) from public, anon;
revoke all on function public.revoke_chronicle_invite(uuid) from public, anon;
grant execute on function public.create_chronicle_invite(uuid, integer, timestamptz) to authenticated;
grant execute on function public.accept_chronicle_invite(uuid) to authenticated;
grant execute on function public.revoke_chronicle_invite(uuid) to authenticated;
