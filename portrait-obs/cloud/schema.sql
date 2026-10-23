-- Isolated display transport. Does not read or modify character/Chronicle rows.
create schema if not exists portrait_private;
revoke all on schema portrait_private from public;
grant usage on schema portrait_private to anon, authenticated;
create table portrait_private.streams (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 local_id text not null check(local_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 view_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''),
 state jsonb, image text not null default '', revision bigint not null default 0, image_revision bigint not null default 0,
 publisher text, epoch double precision not null default 0, sequence bigint not null default 0,
 updated_at timestamptz not null default now(), unique(owner_id,local_id)
);
create table portrait_private.events (
 id bigint generated always as identity primary key, stream_id uuid not null references portrait_private.streams(id) on delete cascade,
 event_id text not null check(length(event_id) between 1 and 128), packet jsonb not null,
 created_at timestamptz not null default now(), unique(stream_id,event_id)
);
create index portrait_events_cursor on portrait_private.events(stream_id,id);
alter table portrait_private.streams enable row level security;
alter table portrait_private.events enable row level security;
create policy deny_direct_streams on portrait_private.streams for all to anon,authenticated using(false) with check(false);
create policy deny_direct_events on portrait_private.events for all to anon,authenticated using(false) with check(false);
revoke all on all tables in schema portrait_private from public,anon,authenticated;
revoke all on all sequences in schema portrait_private from public,anon,authenticated;

create function portrait_private.open_stream(p_local_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v portrait_private.streams; u uuid:=auth.uid();
begin
 if u is null then raise exception 'PORTRAIT_LOGIN_REQUIRED' using errcode='42501'; end if;
 insert into portrait_private.streams(owner_id,local_id) values(u,p_local_id) on conflict(owner_id,local_id) do nothing;
 select * into strict v from portrait_private.streams where owner_id=u and local_id=p_local_id;
 return jsonb_build_object('token',v.view_token,'id',v.id,'revision',v.revision);
end $$;

create function portrait_private.publish(p_local_id text,p_state jsonb,p_image text,p_sync jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v portrait_private.streams; u uuid:=auth.uid(); k text; e double precision; s bigint; p text;
begin
 if u is null then raise exception 'PORTRAIT_LOGIN_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(p_state) is distinct from 'object' or (p_state - array['name','pv','pn','ps']) <> '{}'::jsonb or jsonb_typeof(p_state->'name') is distinct from 'string' or length(p_state->>'name')>256 then raise exception 'PORTRAIT_INVALID_STATE'; end if;
 foreach k in array array['pv','pn','ps'] loop
  if jsonb_typeof(p_state->k) is distinct from 'object' or ((p_state->k) - array['current','max']) <> '{}'::jsonb or jsonb_typeof(p_state->k->'current') is distinct from 'number' or jsonb_typeof(p_state->k->'max') is distinct from 'number' or (p_state->k->>'current')::numeric not between 0 and 1000000000 or (p_state->k->>'max')::numeric not between 0 and 1000000000 then raise exception 'PORTRAIT_INVALID_RESOURCE'; end if;
 end loop;
 if p_image is not null and (length(p_image)>2500000 or (p_image<>'' and p_image !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')) then raise exception 'PORTRAIT_INVALID_IMAGE'; end if;
 e:=(p_sync->>'epoch')::double precision; s:=(p_sync->>'sequence')::bigint; p:=p_sync->>'publisher';
 if e is null or e<0 or e='Infinity'::double precision or e='NaN'::double precision or s is null or s<1 or p is null or length(p) not between 1 and 128 then raise exception 'PORTRAIT_INVALID_SEQUENCE'; end if;
 select * into strict v from portrait_private.streams where owner_id=u and local_id=p_local_id for update;
 if e<v.epoch or (e=v.epoch and (p<>v.publisher or s<=v.sequence)) then return jsonb_build_object('stale',true,'revision',v.revision); end if;
 update portrait_private.streams set state=p_state,image=coalesce(p_image,image),image_revision=image_revision+case when p_image is not null and p_image<>image then 1 else 0 end,revision=revision+1,publisher=p,epoch=e,sequence=s,updated_at=clock_timestamp() where id=v.id returning * into v;
 return jsonb_build_object('revision',v.revision);
end $$;

create function portrait_private.push_roll(p_local_id text,p_record jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; u uuid:=auth.uid(); r jsonb:=p_record->'result'; packet jsonb; eid text:=p_record->>'id';
begin
 if u is null then raise exception 'PORTRAIT_LOGIN_REQUIRED' using errcode='42501'; end if;
 if jsonb_typeof(p_record) is distinct from 'object' or p_record->>'characterId' is distinct from p_local_id or length(eid) not between 1 and 128 or eid is null or jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'total') is distinct from 'number' or jsonb_typeof(r->'rolls') is distinct from 'array' or jsonb_array_length(r->'rolls')>1000 or jsonb_typeof(r->'expression') is distinct from 'string' or length(r->>'expression')>256 or exists(select 1 from jsonb_array_elements(r->'rolls') d where jsonb_typeof(d)<>'number') then raise exception 'PORTRAIT_INVALID_ROLL'; end if;
 select id into strict sid from portrait_private.streams where owner_id=u and local_id=p_local_id;
 select jsonb_object_agg(key,value) into r from jsonb_each(r) where key=any(array['expression','rolls','total','modifier','faces','sides','natural','selectedIndex','diceTotal','quantity','count','resolution']);
 packet:=jsonb_build_object('id',eid,'characterId',p_local_id,'label',left(coalesce(p_record->>'label',p_record->>'name','Rolagem'),128),'expression',r->'expression','rolls',r->'rolls','total',r->'total','modifier',r->'modifier','natural',r->'natural','dieSides',coalesce(r->'faces',r->'sides'),'resolution',p_record->'resolution','source',p_record->'source','result',r);
 packet:=jsonb_strip_nulls(packet);
 insert into portrait_private.events(stream_id,event_id,packet) values(sid,eid,packet) on conflict(stream_id,event_id) do nothing;
 delete from portrait_private.events where stream_id=sid and created_at<now()-interval '10 minutes';
 return jsonb_build_object('id',eid);
end $$;

create function portrait_private.view_stream(p_token text,p_cursor bigint,p_revision bigint,p_image_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare v portrait_private.streams; cursor_id bigint; rolls jsonb; display jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into v from portrait_private.streams where view_token=p_token;
 if not found then return null; end if;
 select coalesce(max(id),0) into cursor_id from portrait_private.events where stream_id=v.id;
 select coalesce(jsonb_agg(packet order by id),'[]'::jsonb) into rolls from (select id,packet from portrait_private.events where stream_id=v.id and p_cursor is not null and id>p_cursor and created_at>now()-interval '10 seconds' order by id limit 64) q;
 if v.state is not null and v.revision is distinct from p_revision then
  display:=v.state;
  if v.image_revision is distinct from p_image_revision then display:=display||jsonb_build_object('portraitImage',v.image); end if;
 end if;
 return jsonb_build_object('state',display,'ready',v.state is not null,'revision',v.revision,'imageRevision',v.image_revision,'cursor',cursor_id,'rolls',rolls,'updatedAt',v.updated_at);
end $$;

create function portrait_private.rotate(p_local_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare token text; u uuid:=auth.uid();
begin
 if u is null then raise exception 'PORTRAIT_LOGIN_REQUIRED' using errcode='42501'; end if;
 update portrait_private.streams set view_token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') where owner_id=u and local_id=p_local_id returning view_token into token;
 if token is null then raise exception 'PORTRAIT_NOT_FOUND'; end if;
 return jsonb_build_object('token',token);
end $$;

revoke all on all functions in schema portrait_private from public,anon,authenticated;
grant execute on function portrait_private.open_stream(text),portrait_private.publish(text,jsonb,text,jsonb),portrait_private.push_roll(text,jsonb),portrait_private.rotate(text) to authenticated;
grant execute on function portrait_private.view_stream(text,bigint,bigint,bigint) to anon,authenticated;

create function public.portrait_open(p_local_id text) returns jsonb language sql security invoker set search_path='' as 'select portrait_private.open_stream(p_local_id)';
create function public.portrait_publish(p_local_id text,p_state jsonb,p_image text,p_sync jsonb) returns jsonb language sql security invoker set search_path='' as 'select portrait_private.publish(p_local_id,p_state,p_image,p_sync)';
create function public.portrait_roll(p_local_id text,p_record jsonb) returns jsonb language sql security invoker set search_path='' as 'select portrait_private.push_roll(p_local_id,p_record)';
create function public.portrait_view(p_token text,p_cursor bigint default null,p_revision bigint default null,p_image_revision bigint default null) returns jsonb language sql security invoker set search_path='' as 'select portrait_private.view_stream(p_token,p_cursor,p_revision,p_image_revision)';
create function public.portrait_rotate(p_local_id text) returns jsonb language sql security invoker set search_path='' as 'select portrait_private.rotate(p_local_id)';
revoke all on function public.portrait_open(text),public.portrait_publish(text,jsonb,text,jsonb),public.portrait_roll(text,jsonb),public.portrait_view(text,bigint,bigint,bigint),public.portrait_rotate(text) from public,anon,authenticated;
grant execute on function public.portrait_open(text),public.portrait_publish(text,jsonb,text,jsonb),public.portrait_roll(text,jsonb),public.portrait_rotate(text) to authenticated;
grant execute on function public.portrait_view(text,bigint,bigint,bigint) to anon,authenticated;
notify pgrst,'reload schema';
