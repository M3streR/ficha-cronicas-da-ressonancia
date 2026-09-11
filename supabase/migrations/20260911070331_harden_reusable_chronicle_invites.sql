drop index if exists public.chronicle_invites_active_owner_idx;

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
  v_now timestamptz := clock_timestamp();
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
  if v_invite.expires_at is not null and v_invite.expires_at <= v_now then
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
        last_used_at = v_now
    where id = v_invite.id;
  else
    update public.chronicle_invites
    set used_at = v_now,
        used_by = v_user_id,
        use_count = 1,
        last_used_at = v_now
    where id = v_invite.id;
  end if;

  return v_invite.chronicle_id;
end;
$$;
