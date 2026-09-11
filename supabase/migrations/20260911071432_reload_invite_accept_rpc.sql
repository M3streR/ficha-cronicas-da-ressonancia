drop function if exists public.accept_chronicle_invite(uuid);
drop function if exists private.accept_chronicle_invite_impl(uuid);

create function private.accept_chronicle_invite_impl(p_code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite_id uuid;
  v_chronicle_id uuid;
  v_multi_use boolean;
  v_inserted boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select id, chronicle_id, multi_use
    into v_invite_id, v_chronicle_id, v_multi_use
  from public.chronicle_invites
  where code = p_code
    and revoked_at is null
    and (expires_at is null or expires_at > v_now)
    and (
      (multi_use and (max_uses is null or use_count < max_uses))
      or (not multi_use and used_at is null)
    )
  for update;

  if v_invite_id is null then raise exception 'invitation is unavailable'; end if;

  if private.is_chronicle_owner(v_chronicle_id)
     or exists (
       select 1 from public.chronicle_members
       where chronicle_id = v_chronicle_id and user_id = v_user_id
     ) then
    return v_chronicle_id;
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

create function public.accept_chronicle_invite(p_code uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.accept_chronicle_invite_impl(p_code); $$;

revoke all on function private.accept_chronicle_invite_impl(uuid) from public, anon;
grant execute on function private.accept_chronicle_invite_impl(uuid) to authenticated;
revoke all on function public.accept_chronicle_invite(uuid) from public, anon;
grant execute on function public.accept_chronicle_invite(uuid) to authenticated;

notify pgrst, 'reload schema';
