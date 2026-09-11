create or replace function private.accept_reusable_chronicle_invite_impl(p_code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite_id uuid;
  v_chronicle_id uuid;
  v_revoked_at timestamptz;
  v_used_at timestamptz;
  v_multi_use boolean;
  v_max_uses integer;
  v_use_count integer;
  v_expires_at timestamptz;
  v_inserted boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select id, chronicle_id, revoked_at, used_at, multi_use, max_uses, use_count, expires_at
    into v_invite_id, v_chronicle_id, v_revoked_at, v_used_at,
         v_multi_use, v_max_uses, v_use_count, v_expires_at
  from public.chronicle_invites
  where code = p_code
  for update;

  if v_invite_id is null then raise exception 'invitation is invalid'; end if;

  -- A member already has access. Returning before availability checks keeps the
  -- operation idempotent without incrementing the historical usage counter.
  if private.is_chronicle_owner(v_chronicle_id)
     or exists (
       select 1 from public.chronicle_members
       where chronicle_id = v_chronicle_id and user_id = v_user_id
     ) then
    return v_chronicle_id;
  end if;

  if v_revoked_at is not null then raise exception 'invitation is unavailable'; end if;
  if v_expires_at is not null and v_expires_at <= v_now then raise exception 'invitation is unavailable'; end if;
  if v_multi_use then
    if v_max_uses is not null and v_use_count >= v_max_uses then
      raise exception 'invitation is unavailable';
    end if;
  elsif v_used_at is not null then
    raise exception 'invitation is unavailable';
  end if;

  insert into public.chronicle_members (chronicle_id, user_id)
  values (v_chronicle_id, v_user_id)
  on conflict (chronicle_id, user_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then return v_chronicle_id; end if;

  if v_multi_use then
    update public.chronicle_invites
    set use_count = use_count + 1, last_used_at = v_now
    where id = v_invite_id;
  else
    update public.chronicle_invites
    set used_at = v_now, used_by = v_user_id, use_count = 1, last_used_at = v_now
    where id = v_invite_id;
  end if;

  return v_chronicle_id;
end;
$$;

create or replace function public.accept_chronicle_invite(p_code uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.accept_reusable_chronicle_invite_impl(p_code); $$;

drop function if exists private.accept_chronicle_invite_impl(uuid);
notify pgrst, 'reload schema';
