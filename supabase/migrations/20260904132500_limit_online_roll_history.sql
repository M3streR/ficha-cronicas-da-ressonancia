create or replace function private.limit_online_roll_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.online_roll_records target
  where target.id in (
    select stale.id
    from public.online_roll_records stale
    where stale.chronicle_id = new.chronicle_id
    order by stale.created_at desc, stale.id desc
    offset 2000
  );
  return new;
end;
$$;

drop trigger if exists online_roll_records_limit_history on public.online_roll_records;
create trigger online_roll_records_limit_history
after insert on public.online_roll_records
for each row execute function private.limit_online_roll_history();
