BEGIN;
-- Experimental only: apply to wxsmcocvjiqkajajolpn. Production requires separate review.

ALTER TABLE public.chronicle_confrontations ADD COLUMN IF NOT EXISTS execution_id uuid;
ALTER TABLE public.chronicle_confrontations ADD COLUMN IF NOT EXISTS execution_token_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.online_roll_records ADD COLUMN IF NOT EXISTS execution_id uuid;
ALTER TABLE public.online_roll_records ADD COLUMN IF NOT EXISTS adversary_id uuid;
CREATE TABLE IF NOT EXISTS public.confrontation_adversary_sheets (
 adversary_id uuid PRIMARY KEY REFERENCES public.confrontation_adversaries(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
 source_local_id text,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.confrontation_adversary_sheets ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.confrontation_adversary_sheets TO authenticated;
CREATE POLICY adversary_sheet_owner ON public.confrontation_adversary_sheets TO authenticated
 USING (private.is_confrontation_owner((select a.confrontation_id from public.confrontation_adversaries a where a.id=adversary_id)))
 WITH CHECK (private.is_confrontation_owner((select a.confrontation_id from public.confrontation_adversaries a where a.id=adversary_id)));
-- No public snapshot: only the authenticated Chronicle owner can read this table.
CREATE OR REPLACE FUNCTION private.normalize_combat_order() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; actor jsonb; result jsonb='[]'; old_actor jsonb; pos int=0; selected_pos int; offset_index int; successor jsonb; candidate_index int; seen text[]='{}'; key text;
BEGIN
 old_actor=OLD.initiative_order->OLD.combat_turn;
 IF NEW.active AND (NOT OLD.active) AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
  NEW.execution_id=gen_random_uuid();
  -- Already-open clients may finish their first execution; restarts require an explicit token.
  NEW.execution_token_required=OLD.execution_token_required OR OLD.started_at IS NOT NULL;
 END IF;
 IF NEW.active OR jsonb_array_length(NEW.initiative_order)>0 THEN
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.initiative_order) LOOP
   key=(item->>'kind')||':'||(item->>'id');
   IF key=ANY(seen) THEN CONTINUE; END IF;
   IF (item->>'kind'='character' AND EXISTS(select 1 from public.confrontation_character_links where confrontation_id=NEW.id and character_id::text=item->>'id'))
    OR (item->>'kind'='adversary' AND EXISTS(select 1 from public.confrontation_adversaries where confrontation_id=NEW.id and id::text=item->>'id')) THEN
    result=result||jsonb_build_array(item); seen=array_append(seen,key);
   END IF;
  END LOOP;
  FOR actor IN SELECT jsonb_build_object('kind','character','id',character_id,'initiative',0) FROM public.confrontation_character_links WHERE confrontation_id=NEW.id
   UNION ALL SELECT jsonb_build_object('kind','adversary','id',id,'initiative',0) FROM public.confrontation_adversaries WHERE confrontation_id=NEW.id LOOP
   key=(actor->>'kind')||':'||(actor->>'id');
   IF NOT key=ANY(seen) THEN result=result||jsonb_build_array(actor); seen=array_append(seen,key); END IF;
  END LOOP;
  -- Keep the current actor on composition/reordering changes, not on an explicit turn step or restart.
  IF result IS DISTINCT FROM OLD.initiative_order AND NEW.started_at IS NOT DISTINCT FROM OLD.started_at THEN
   FOR item IN SELECT value FROM jsonb_array_elements(result) LOOP
    IF item->>'kind'=old_actor->>'kind' AND item->>'id'=old_actor->>'id' THEN selected_pos=pos; END IF; pos=pos+1;
   END LOOP;
   IF selected_pos IS NULL AND jsonb_array_length(OLD.initiative_order)>0 THEN
    FOR offset_index IN 1..jsonb_array_length(OLD.initiative_order) LOOP
     successor=OLD.initiative_order->((OLD.combat_turn+offset_index)%jsonb_array_length(OLD.initiative_order));candidate_index=0;
     FOR item IN SELECT value FROM jsonb_array_elements(result) LOOP
      IF item->>'kind'=successor->>'kind' AND item->>'id'=successor->>'id' THEN selected_pos=candidate_index; END IF;candidate_index=candidate_index+1;
     END LOOP;
     EXIT WHEN selected_pos IS NOT NULL;
    END LOOP;
   END IF;
   NEW.combat_turn=coalesce(selected_pos,0);
  ELSE NEW.combat_turn=least(NEW.combat_turn,greatest(jsonb_array_length(result)-1,0)); END IF;
  NEW.initiative_order=result;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.normalize_combat_order() FROM PUBLIC;
CREATE TRIGGER combat_order_canonical BEFORE UPDATE ON public.chronicle_confrontations FOR EACH ROW EXECUTE FUNCTION private.normalize_combat_order();
UPDATE public.chronicle_confrontations SET execution_id=gen_random_uuid() WHERE execution_id IS NULL AND started_at IS NOT NULL;
UPDATE public.online_roll_records r SET execution_id=c.execution_id FROM public.chronicle_confrontations c WHERE r.confrontation_id=c.id AND r.created_at>=c.started_at;
CREATE INDEX IF NOT EXISTS combat_execution_rolls ON public.online_roll_records(confrontation_id,execution_id,created_at DESC,id DESC);
CREATE OR REPLACE FUNCTION public.resume_confrontation(p_id uuid,p_expected_updated_at timestamptz) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.chronicle_confrontations%rowtype;
BEGIN
 SELECT * INTO c FROM public.chronicle_confrontations WHERE id=p_id FOR UPDATE;
 IF NOT private.is_confrontation_owner(p_id) THEN RAISE EXCEPTION 'ONLINE_CHRONICLE_FORBIDDEN'; END IF;
 IF c.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'CONFRONTATION_UPDATE_CONFLICT'; END IF;
 IF c.started_at IS NULL THEN RAISE EXCEPTION 'CONFRONTATION_NOT_STARTED'; END IF;
 IF NOT EXISTS(select 1 from public.confrontation_character_links where confrontation_id=p_id) AND NOT EXISTS(select 1 from public.confrontation_adversaries where confrontation_id=p_id) THEN RAISE EXCEPTION 'EMPTY_CONFRONTATION'; END IF;
 UPDATE public.chronicle_confrontations SET active=true,ended_at=NULL WHERE id=p_id;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.resume_confrontation(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resume_confrontation(uuid,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_combat_adversary(p_confrontation_id uuid,p_adversary_id uuid,p_values jsonb,p_expected_updated_at timestamptz DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.confrontation_adversaries%rowtype; sid uuid;
BEGIN
 PERFORM 1 FROM public.chronicle_confrontations WHERE id=p_confrontation_id FOR UPDATE;
 IF NOT private.is_confrontation_owner(p_confrontation_id) THEN RAISE EXCEPTION 'ONLINE_CHRONICLE_FORBIDDEN'; END IF;
 IF p_adversary_id IS NULL THEN
  INSERT INTO public.confrontation_adversaries(confrontation_id,name,pv_current,pv_max,defense)
  VALUES(p_confrontation_id,p_values->>'name',(p_values->>'pvCurrent')::int,(p_values->>'pvMax')::int,(p_values->>'defense')::int) RETURNING id INTO sid;
 ELSE
  SELECT * INTO a FROM public.confrontation_adversaries WHERE id=p_adversary_id AND confrontation_id=p_confrontation_id FOR UPDATE;
  IF a.id IS NULL OR a.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'ADVERSARY_UPDATE_CONFLICT'; END IF;
  UPDATE public.confrontation_adversaries SET name=p_values->>'name',pv_current=(p_values->>'pvCurrent')::int,pv_max=(p_values->>'pvMax')::int,defense=(p_values->>'defense')::int WHERE id=a.id;
  sid=a.id;
 END IF;
 IF p_values ? 'snapshot' THEN
  INSERT INTO public.confrontation_adversary_sheets(adversary_id,snapshot,source_local_id)
  VALUES(sid,(p_values->'snapshot') - 'notes' - 'photo',p_values->>'sourceLocalId')
  ON CONFLICT(adversary_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,source_local_id=EXCLUDED.source_local_id,updated_at=clock_timestamp();
 END IF;
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.save_combat_adversary(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_combat_adversary(uuid,uuid,jsonb,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_chronicle_confrontation(p_chronicle_id uuid, p_name text, p_description text DEFAULT ''::text, p_character_ids uuid[] DEFAULT '{}'::uuid[], p_adversaries jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_enemy_id uuid;
  v_character_ids uuid[];
  v_adversary jsonb;
begin
  if not private.is_chronicle_owner(p_chronicle_id) then
    raise exception 'ONLINE_CHRONICLE_FORBIDDEN';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'INVALID_CONFRONTATION_NAME';
  end if;
  if char_length(coalesce(p_description, '')) > 1200 then
    raise exception 'INVALID_CONFRONTATION_DESCRIPTION';
  end if;
  if jsonb_typeof(coalesce(p_adversaries, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_adversaries, '[]'::jsonb)) > 100 then
    raise exception 'INVALID_ADVERSARY_RECORD';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::uuid[])
  into v_character_ids
  from unnest(coalesce(p_character_ids, '{}'::uuid[])) as ids(value);

  if exists (
    select 1 from unnest(v_character_ids) id
    where not exists (
      select 1 from public.chronicle_cast_members ccm
      where ccm.chronicle_id = p_chronicle_id and ccm.character_id = id
    )
  ) then raise exception 'CHARACTER_NOT_IN_CAST'; end if;

  for v_adversary in select value from jsonb_array_elements(coalesce(p_adversaries, '[]'::jsonb))
  loop
    if char_length(btrim(coalesce(v_adversary->>'name', ''))) not between 1 and 120
       or ((v_adversary ? 'pvCurrent') <> (v_adversary ? 'pvMax'))
       or ((v_adversary ? 'pvCurrent') and ((v_adversary->>'pvCurrent')::integer < 0 or (v_adversary->>'pvMax')::integer < 1)) then
      raise exception 'INVALID_ADVERSARY_RECORD';
    end if;
  end loop;

  if cardinality(v_character_ids) = 0 and jsonb_array_length(coalesce(p_adversaries, '[]'::jsonb)) = 0 then
    raise exception 'EMPTY_CONFRONTATION';
  end if;

  insert into public.chronicle_confrontations (chronicle_id, name, description)
  values (p_chronicle_id, btrim(p_name), coalesce(p_description, '')) returning id into v_id;

  insert into public.confrontation_character_links (confrontation_id, character_id)
  select v_id, id from unnest(v_character_ids) id;

  for v_adversary in select value from jsonb_array_elements(coalesce(p_adversaries,'[]'::jsonb)) loop
    v_enemy_id=public.save_combat_adversary(v_id,NULL,v_adversary,NULL);
  end loop;
  return v_id;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'INVALID_ADVERSARY_NUMBERS';
end;
$function$
;
CREATE OR REPLACE FUNCTION private.stamp_combat_roll() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.chronicle_confrontations%rowtype;
BEGIN
 IF NEW.confrontation_id IS NOT NULL THEN
  SELECT * INTO c FROM public.chronicle_confrontations WHERE id=NEW.confrontation_id;
  IF NOT coalesce(c.active,false) OR (NEW.metadata->>'executionId' IS NOT NULL AND NEW.metadata->>'executionId' IS DISTINCT FROM c.execution_id::text) OR (c.execution_token_required AND NEW.metadata->>'executionId' IS NULL) THEN RAISE EXCEPTION 'ONLINE_COMBAT_CONTEXT_INVALID'; END IF;
  NEW.execution_id=c.execution_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.stamp_combat_roll() FROM PUBLIC;
CREATE TRIGGER combat_roll_execution BEFORE INSERT ON public.online_roll_records FOR EACH ROW EXECUTE FUNCTION private.stamp_combat_roll();
-- Owner-only enemy events use their actual actor, never a player's identity.
CREATE POLICY enemy_roll_insert ON public.online_roll_records FOR INSERT TO authenticated WITH CHECK (
 author_id=auth.uid() AND online_character_id IS NULL AND adversary_id IS NOT NULL
 AND private.is_chronicle_owner(chronicle_id)
 AND EXISTS(select 1 from public.confrontation_adversaries a join public.chronicle_confrontations c on c.id=a.confrontation_id
  where a.id=adversary_id and c.id=online_roll_records.confrontation_id and c.chronicle_id=online_roll_records.chronicle_id and c.active)
);
CREATE OR REPLACE FUNCTION public.append_adversary_roll(p_id uuid,p_confrontation_id uuid,p_adversary_id uuid,p_record jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.confrontation_adversaries%rowtype; c public.chronicle_confrontations%rowtype; r jsonb=p_record->'result';
BEGIN
 SELECT * INTO c FROM public.chronicle_confrontations WHERE id=p_confrontation_id FOR SHARE;
 IF NOT private.is_confrontation_owner(p_confrontation_id) THEN RAISE EXCEPTION 'ONLINE_CHRONICLE_FORBIDDEN'; END IF;
 SELECT * INTO a FROM public.confrontation_adversaries WHERE id=p_adversary_id AND confrontation_id=c.id;
 IF a.id IS NULL OR NOT c.active THEN RAISE EXCEPTION 'ONLINE_COMBAT_CONTEXT_INVALID'; END IF;
 INSERT INTO public.online_roll_records(id,chronicle_id,confrontation_id,adversary_id,author_id,character_name,source,category,expression,dice_count,dice_sides,rolls,modifier,subtotal,total,metadata)
 VALUES(p_id,c.chronicle_id,c.id,a.id,auth.uid(),a.name,'online-combat','expression',r->>'expression',coalesce(r->>'count',r->>'quantity')::int,coalesce(r->>'sides',r->>'faces')::int,r->'rolls',(r->>'modifier')::int,(r->>'diceTotal')::int,(r->>'total')::int,
 jsonb_build_object('resolution',coalesce(p_record->>'resolution','sum'),'label',p_record->>'label','executionId',p_record->>'executionId')) ON CONFLICT(id) DO NOTHING;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.append_adversary_roll(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.append_adversary_roll(uuid,uuid,uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.replace_confrontation_characters(p_confrontation_id uuid, p_character_ids uuid[], p_expected_character_ids uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_chronicle_id uuid;
  v_current uuid[];
  v_selected uuid[];
  v_expected uuid[];
begin
  select chronicle_id into v_chronicle_id
  from public.chronicle_confrontations where id = p_confrontation_id for update;
  if v_chronicle_id is null or not private.is_chronicle_owner(v_chronicle_id) then
    raise exception 'ONLINE_CHRONICLE_FORBIDDEN';
  end if;
  select coalesce(array_agg(character_id order by character_id), '{}'::uuid[])
    into v_current from public.confrontation_character_links where confrontation_id = p_confrontation_id;
  select coalesce(array_agg(distinct value order by value), '{}'::uuid[]) into v_selected
    from unnest(coalesce(p_character_ids, '{}'::uuid[])) ids(value);
  select coalesce(array_agg(distinct value order by value), '{}'::uuid[]) into v_expected
    from unnest(coalesce(p_expected_character_ids, '{}'::uuid[])) ids(value);
  if v_current <> v_expected then raise exception 'COMBAT_SELECTION_CONFLICT'; end if;
  if exists (
    select 1 from unnest(v_selected) id
    where not (id = any(v_current))
      and not exists (
        select 1 from public.chronicle_cast_members ccm
        where ccm.chronicle_id = v_chronicle_id and ccm.character_id = id
      )
  ) then raise exception 'CHARACTER_NOT_IN_CAST'; end if;
  if v_current = v_selected then return true; end if;
  delete from public.confrontation_character_links where confrontation_id = p_confrontation_id and not(character_id=any(v_selected));
  insert into public.confrontation_character_links (confrontation_id, character_id)
  select p_confrontation_id, id from unnest(v_selected) id on conflict do nothing;
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_combat_roll() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE spec text[]; n int; sides int; bonus int; value jsonb; dice int; subtotal int=0;
BEGIN
 spec=regexp_match(NEW.expression,'^([1-9][0-9]{0,2})[dD]([1-9][0-9]{0,3})([+-][0-9]{1,6})?$');
 IF spec IS NULL THEN RAISE EXCEPTION 'INVALID_DICE_EXPRESSION'; END IF;
 n=spec[1]::int;sides=spec[2]::int;bonus=coalesce(spec[3],'0')::int;
 IF n>100 OR sides<2 OR sides>1000 OR abs(bonus)>100000 OR jsonb_array_length(NEW.rolls)<>n OR NEW.dice_count IS DISTINCT FROM n OR NEW.dice_sides IS DISTINCT FROM sides OR NEW.modifier IS DISTINCT FROM bonus THEN RAISE EXCEPTION 'INVALID_ROLL_RESULT'; END IF;
 FOR value IN SELECT v FROM jsonb_array_elements(NEW.rolls) v LOOP
  IF jsonb_typeof(value)<>'number' OR value::text !~ '^[0-9]+$' THEN RAISE EXCEPTION 'INVALID_ROLL_RESULT'; END IF;
  dice=(value::text)::int;IF dice<1 OR dice>sides THEN RAISE EXCEPTION 'INVALID_ROLL_RESULT'; END IF;
  IF sides=20 AND n>1 THEN subtotal=greatest(subtotal,dice);ELSE subtotal=subtotal+dice;END IF;
 END LOOP;
 IF NEW.subtotal IS DISTINCT FROM subtotal OR NEW.total IS DISTINCT FROM subtotal+bonus THEN RAISE EXCEPTION 'INVALID_ROLL_RESULT'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_combat_roll() FROM PUBLIC;
CREATE TRIGGER combat_roll_consistency BEFORE INSERT ON public.online_roll_records FOR EACH ROW EXECUTE FUNCTION private.validate_combat_roll();
CREATE OR REPLACE FUNCTION public.append_online_roll(p_id uuid, p_chronicle_id uuid, p_confrontation_id uuid, p_online_character_id uuid, p_character_name text, p_source text, p_category text, p_expression text, p_dice_count integer, p_dice_sides integer, p_rolls jsonb, p_modifier integer, p_subtotal integer, p_total integer, p_metadata jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'ONLINE_AUTH_REQUIRED'; end if;
  if not private.can_access_chronicle(p_chronicle_id) then raise exception 'ONLINE_CHRONICLE_FORBIDDEN'; end if;
  if exists(select 1 from public.online_roll_records where id=p_id) then
    if exists(select 1 from public.online_roll_records r where r.id=p_id and r.author_id=v_user
      and r.chronicle_id=p_chronicle_id and r.confrontation_id is not distinct from p_confrontation_id
      and r.online_character_id=p_online_character_id and r.expression=p_expression
      and r.rolls=p_rolls and r.modifier=p_modifier and r.subtotal=p_subtotal and r.total=p_total
      and r.metadata=coalesce(p_metadata,'{}'::jsonb)) then return p_id; end if;
    raise exception 'ROLL_ID_CONFLICT';
  end if;
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
$function$
;

-- Candidate package. Apply to staging wxsmcocvjiqkajajolpn only during validation.
-- Deploy this access boundary before the compatible client. No characters or rolls are deleted.

CREATE TABLE IF NOT EXISTS public.confrontation_adversary_roster (
 id uuid PRIMARY KEY REFERENCES public.confrontation_adversaries(id) ON DELETE CASCADE,
 confrontation_id uuid NOT NULL REFERENCES public.chronicle_confrontations(id) ON DELETE CASCADE,
 name text NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL
);
ALTER TABLE public.confrontation_adversary_roster ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.confrontation_adversary_roster FROM PUBLIC, anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.confrontation_adversary_roster TO authenticated;
CREATE INDEX IF NOT EXISTS adversary_roster_confrontation_idx ON public.confrontation_adversary_roster(confrontation_id);
DROP POLICY IF EXISTS roster_read ON public.confrontation_adversary_roster;
CREATE POLICY roster_read ON public.confrontation_adversary_roster FOR SELECT TO authenticated
 USING ((select private.can_view_confrontation(confrontation_id)));
DROP POLICY IF EXISTS roster_insert_owner ON public.confrontation_adversary_roster;
CREATE POLICY roster_insert_owner ON public.confrontation_adversary_roster FOR INSERT TO authenticated
 WITH CHECK ((select private.is_confrontation_owner(confrontation_id)));
DROP POLICY IF EXISTS roster_update_owner ON public.confrontation_adversary_roster;
CREATE POLICY roster_update_owner ON public.confrontation_adversary_roster FOR UPDATE TO authenticated
 USING ((select private.is_confrontation_owner(confrontation_id)))
 WITH CHECK ((select private.is_confrontation_owner(confrontation_id)));
DROP POLICY IF EXISTS roster_delete_owner ON public.confrontation_adversary_roster;
CREATE POLICY roster_delete_owner ON public.confrontation_adversary_roster FOR DELETE TO authenticated
 USING ((select private.is_confrontation_owner(confrontation_id)));
INSERT INTO public.confrontation_adversary_roster(id,confrontation_id,name,created_at,updated_at)
 SELECT id,confrontation_id,name,created_at,updated_at FROM public.confrontation_adversaries
 ON CONFLICT(id) DO UPDATE SET name=excluded.name;
CREATE OR REPLACE FUNCTION private.sync_adversary_roster() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;
 INSERT INTO public.confrontation_adversary_roster(id,confrontation_id,name,created_at,updated_at)
 VALUES(NEW.id,NEW.confrontation_id,NEW.name,NEW.created_at,NEW.updated_at)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.sync_adversary_roster() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sync_adversary_public_roster ON public.confrontation_adversaries;
CREATE TRIGGER sync_adversary_public_roster AFTER INSERT OR UPDATE ON public.confrontation_adversaries FOR EACH ROW EXECUTE FUNCTION private.sync_adversary_roster();
DROP POLICY IF EXISTS confrontation_adversaries_select_accessible ON public.confrontation_adversaries;
DROP POLICY IF EXISTS confrontation_adversaries_select_owner ON public.confrontation_adversaries;
CREATE POLICY confrontation_adversaries_select_owner ON public.confrontation_adversaries FOR SELECT TO authenticated
 USING ((select private.is_confrontation_owner(confrontation_id)));
-- DELETE notifications must not carry previous full resource values.
ALTER TABLE public.confrontation_adversaries REPLICA IDENTITY DEFAULT;
ALTER TABLE public.confrontation_adversary_sheets REPLICA IDENTITY DEFAULT;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='confrontation_adversary_roster') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.confrontation_adversary_roster;
 END IF;
END; $$;


-- Full sheets are available to their owner and to the master of a linked Chronicle.
CREATE OR REPLACE FUNCTION private.can_access_online_character(_character_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_online_character_owner(_character_id)
    OR EXISTS (
      SELECT 1 FROM public.chronicle_cast_members AS member
      WHERE member.character_id = _character_id
        AND private.is_chronicle_owner(member.chronicle_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.confrontation_character_links AS link
      WHERE link.character_id = _character_id
        AND private.is_confrontation_owner(link.confrontation_id)
    );
$$;

-- The player-facing cast and initiative need names, never full sheet snapshots.
CREATE OR REPLACE FUNCTION private.chronicle_character_summaries(p_chronicle_id uuid)
RETURNS TABLE(id uuid, owner_id uuid, name text, level integer, class_name text,
              signature text, thumbnail text, created_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sheet.id, sheet.owner_id, sheet.name, sheet.level::integer,
         sheet.class_name, sheet.signature, sheet.thumbnail,
         sheet.created_at, sheet.updated_at
  FROM public.online_characters AS sheet
  JOIN public.chronicle_cast_members AS member ON member.character_id = sheet.id
  WHERE member.chronicle_id = p_chronicle_id
    AND auth.uid() IS NOT NULL
    AND private.can_access_chronicle(p_chronicle_id);
$$;

CREATE OR REPLACE FUNCTION public.chronicle_character_summaries(p_chronicle_id uuid)
RETURNS TABLE(id uuid, owner_id uuid, name text, level integer, class_name text,
              signature text, thumbnail text, created_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM private.chronicle_character_summaries(p_chronicle_id);
$$;

REVOKE ALL ON FUNCTION private.chronicle_character_summaries(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chronicle_character_summaries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.chronicle_character_summaries(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chronicle_character_summaries(uuid) TO authenticated;

ALTER TABLE public.online_characters REPLICA IDENTITY DEFAULT;
ALTER TABLE public.online_roll_records REPLICA IDENTITY DEFAULT;

DROP POLICY IF EXISTS online_roll_records_select_accessible ON public.online_roll_records;
CREATE POLICY online_roll_records_select_accessible ON public.online_roll_records
FOR SELECT TO authenticated USING (
  (confrontation_id IS NULL AND (SELECT private.can_access_chronicle(chronicle_id)))
  OR (confrontation_id IS NOT NULL AND (
    (SELECT private.is_chronicle_owner(chronicle_id))
    OR (author_id = (SELECT auth.uid()) AND (SELECT private.can_access_chronicle(chronicle_id)))
  ))
);

-- Start and store the initiative in one write. The existing trigger assigns execution ID.
CREATE OR REPLACE FUNCTION public.start_confrontation_with_initiative(
  p_id uuid, p_order jsonb, p_expected_updated_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  encounter public.chronicle_confrontations%ROWTYPE;
  participant_count integer;
  valid_count integer;
  canonical_order jsonb;
BEGIN
  IF NOT private.is_confrontation_owner(p_id) THEN RAISE EXCEPTION 'ONLINE_CHRONICLE_FORBIDDEN'; END IF;
  SELECT * INTO encounter FROM public.chronicle_confrontations WHERE id = p_id FOR UPDATE;
  IF encounter.id IS NULL THEN RAISE EXCEPTION 'CONFRONTATION_NOT_FOUND'; END IF;
  IF encounter.active THEN RETURN encounter.id; END IF;
  IF p_expected_updated_at IS DISTINCT FROM encounter.updated_at THEN
    RAISE EXCEPTION 'CONFRONTATION_UPDATE_CONFLICT';
  END IF;
  IF jsonb_typeof(p_order) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_INITIATIVE_ORDER'; END IF;

  WITH participants AS (
    SELECT 'character' AS kind, character_id AS id
    FROM public.confrontation_character_links WHERE confrontation_id = p_id
    UNION ALL
    SELECT 'adversary', id FROM public.confrontation_adversaries WHERE confrontation_id = p_id
  ), submitted AS (
    SELECT payload->>'kind' AS kind, (payload->>'id')::uuid AS id,
           (payload->>'initiative')::integer AS score, ordinal
    FROM jsonb_array_elements(p_order) WITH ORDINALITY AS entries(payload, ordinal)
  )
  SELECT (SELECT count(*) FROM participants),
         count(DISTINCT (participants.kind, participants.id)) FILTER (WHERE submitted.score BETWEEN -999 AND 999),
         jsonb_agg(jsonb_build_object('kind', participants.kind, 'id', participants.id, 'initiative', submitted.score)
                   ORDER BY submitted.score DESC, submitted.ordinal)
    INTO participant_count, valid_count, canonical_order
    FROM participants JOIN submitted USING (kind, id);

  IF participant_count = 0 THEN RAISE EXCEPTION 'EMPTY_CONFRONTATION'; END IF;
  IF valid_count <> participant_count OR jsonb_array_length(p_order) <> participant_count THEN
    RAISE EXCEPTION 'INVALID_INITIATIVE_ORDER';
  END IF;

  UPDATE public.chronicle_confrontations SET
    active = true, combat_round = 1, combat_turn = 0,
    initiative_order = canonical_order, started_at = clock_timestamp(), ended_at = NULL
  WHERE id = p_id;
  RETURN p_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'ACTIVE_CONFRONTATION_EXISTS';
END;
$$;
REVOKE ALL ON FUNCTION public.start_confrontation_with_initiative(uuid,jsonb,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_confrontation_with_initiative(uuid,jsonb,timestamptz) TO authenticated;


COMMIT;
