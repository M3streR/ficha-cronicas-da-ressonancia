begin;

-- Fully qualify the candidate row. Without these qualifiers PostgreSQL can bind
-- chronicle_id/confrontation_id to the inner query aliases and turn the intended
-- cross-table checks into tautologies.
drop policy if exists online_roll_records_insert_own_character on public.online_roll_records;
create policy online_roll_records_insert_own_character on public.online_roll_records
  for insert to authenticated
  with check (
    online_roll_records.author_id = (select auth.uid())
    and (select private.can_access_chronicle(online_roll_records.chronicle_id))
    and exists (
      select 1
      from public.online_characters oc
      join public.chronicle_cast_members ccm on ccm.character_id = oc.id
      where oc.id = online_roll_records.online_character_id
        and oc.owner_id = (select auth.uid())
        and ccm.chronicle_id = online_roll_records.chronicle_id
    )
    and (
      online_roll_records.confrontation_id is null
      or exists (
        select 1
        from public.chronicle_confrontations cc
        join public.confrontation_character_links ccl on ccl.confrontation_id = cc.id
        where cc.id = online_roll_records.confrontation_id
          and cc.chronicle_id = online_roll_records.chronicle_id
          and cc.active
          and ccl.character_id = online_roll_records.online_character_id
      )
    )
  );

commit;
