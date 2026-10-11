-- Additive account features. Apply to an existing database; never rerun bootstrap.
begin;
alter table public.profiles add column if not exists avatar_path text;
create table if not exists public.account_settings (
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 cover_path text, revision bigint not null default 0 check(revision>=0)
);
create table if not exists public.account_image_assets (
 id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('avatar','cover')), path text not null unique,
 state text not null default 'pending' check(state in ('pending','attached','retired','deleting')),
 created_at timestamptz not null default now(),
 check(path=owner_id::text || '/' || kind || '/' || id::text || '.webp')
);
create index if not exists account_image_assets_owner on public.account_image_assets(owner_id,state);
create index if not exists ratings_user_movie on public.ratings(user_id,movie_id);
alter table public.account_settings enable row level security;
alter table public.account_image_assets enable row level security;
drop policy if exists account_settings_read on public.account_settings;
create policy account_settings_read on public.account_settings for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.account_settings,public.account_image_assets from public,anon,authenticated;
grant select on public.account_settings to authenticated;

create or replace function private.account_object_exists(p_kind text,p_path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare present boolean;
begin
 if to_regclass('storage.objects') is null then return false; end if;
 execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2)' into present
 using case p_kind when 'avatar' then 'account-avatars' when 'cover' then 'account-covers' end,p_path;
 return present;
end; $$;
revoke all on function private.account_object_exists(text,text) from public,anon,authenticated;

create or replace function public.get_my_account() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'not_authenticated'; end if;
 select jsonb_build_object('id',p.id,'name',p.name,'avatar_path',p.avatar_path,'cover_path',s.cover_path,'revision',coalesce(s.revision,0))
 into result from public.profiles p left join public.account_settings s on s.owner_id=p.id where p.id=actor;
 if result is null then raise exception 'account_missing'; end if;
 return result;
end; $$;

create or replace function public.update_my_account(p_name text default null,p_avatar_asset uuid default null,p_cover_asset uuid default null,
 p_change_avatar boolean default false,p_change_cover boolean default false,p_expected_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_revision bigint; old_avatar text; old_cover text; asset public.account_image_assets; selected_id uuid; selected_kind text;
begin
 if actor is null then raise exception 'not_authenticated'; end if;
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_revision'; end if;
 if p_name is not null and length(trim(p_name)) not between 1 and 80 then raise exception 'invalid_name'; end if;
 if p_change_avatar is null or p_change_cover is null or (not p_change_avatar and p_avatar_asset is not null) or (not p_change_cover and p_cover_asset is not null) then raise exception 'invalid_asset'; end if;
 insert into public.account_settings(owner_id) values(actor) on conflict do nothing;
 select revision,cover_path into current_revision,old_cover from public.account_settings where owner_id=actor for update;
 if current_revision<>p_expected_revision then raise exception 'revision_conflict'; end if;
 select avatar_path into old_avatar from public.profiles where id=actor for update;
 -- Account lock precedes every asset lock, including cleanup, avoiding an attach/delete race.
 for selected_kind,selected_id in select v.kind,v.id from (values ('avatar',case when p_change_avatar then p_avatar_asset end),('cover',case when p_change_cover then p_cover_asset end)) v(kind,id) where v.id is not null loop
  select * into asset from public.account_image_assets where id=selected_id for update;
  if not found or asset.owner_id<>actor or asset.kind<>selected_kind or asset.state<>'pending' or not private.account_object_exists(asset.kind,asset.path) then raise exception 'invalid_asset'; end if;
  update public.account_image_assets set state='attached' where id=selected_id;
  if selected_kind='avatar' then update public.profiles set avatar_path=asset.path where id=actor;
  else update public.account_settings set cover_path=asset.path where owner_id=actor; end if;
 end loop;
 if p_change_avatar then
  update public.account_image_assets set state='retired',created_at=now() where owner_id=actor and kind='avatar' and path=old_avatar and state='attached';
  if p_avatar_asset is null then update public.profiles set avatar_path=null where id=actor; end if;
 end if;
 if p_change_cover then
  update public.account_image_assets set state='retired',created_at=now() where owner_id=actor and kind='cover' and path=old_cover and state='attached';
  if p_cover_asset is null then update public.account_settings set cover_path=null where owner_id=actor; end if;
 end if;
 if p_name is not null then update public.profiles set name=trim(p_name) where id=actor; end if;
 update public.account_settings set revision=revision+1 where owner_id=actor;
 return public.get_my_account();
end; $$;

create or replace function public.list_my_ratings(p_limit integer default 20,p_cursor_title text default null,p_cursor_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'not_authenticated'; end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_limit'; end if;
 if (p_cursor_title is null)<>(p_cursor_id is null) then raise exception 'invalid_cursor'; end if;
 if p_cursor_title is not null and (length(p_cursor_title) not between 1 and 300 or not exists(select 1 from public.ratings r join public.group_movies m on m.id=r.movie_id where r.user_id=actor and m.id=p_cursor_id and m.title=p_cursor_title)) then raise exception 'invalid_cursor'; end if;
 with candidates as (
  select m.id,m.tmdb_id,m.title,m.year,m.poster,r.score,exists(select 1 from public.members mem where mem.group_id=r.group_id and mem.user_id=actor) is_current_member
  from public.ratings r join public.group_movies m on m.id=r.movie_id and m.group_id=r.group_id
  where r.user_id=actor and (p_cursor_id is null or (m.title collate "C",m.id)>(p_cursor_title collate "C",p_cursor_id))
  order by m.title collate "C",m.id limit p_limit+1
 ), page as (select * from candidates order by title collate "C",id limit p_limit)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page) order by title collate "C",id) from page),'[]'::jsonb),
 'next_cursor',case when (select count(*) from candidates)>p_limit then (select jsonb_build_object('title',title,'id',id) from page order by title collate "C" desc,id desc limit 1) else null end) into result;
 return result;
end; $$;

create or replace function public.reserve_account_image(p_id uuid,p_owner uuid,p_kind text,p_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Server verifies identity/decoding; this RPC serializes reservations and pointer CAS.
 if p_id is null or p_owner is null or p_kind is null or p_kind not in ('avatar','cover')
 or p_path is null or p_path<>p_owner::text || '/' || p_kind || '/' || p_id::text || '.webp' then raise exception 'invalid_asset'; end if;
 if not exists(select 1 from public.profiles where id=p_owner) then raise exception 'account_missing'; end if;
 insert into public.account_settings(owner_id) values(p_owner) on conflict do nothing;
 perform 1 from public.account_settings where owner_id=p_owner for update;
 if (select count(*) from public.account_image_assets where owner_id=p_owner and state='pending')>=20 then raise exception 'too_many_pending_images'; end if;
 insert into public.account_image_assets(id,owner_id,kind,path) values(p_id,p_owner,p_kind,p_path);
end; $$;

create or replace function public.claim_account_image_cleanup(p_owner uuid) returns table(id uuid,kind text,path text)
language plpgsql security definer set search_path='' as $$
begin
 -- Only service_role is granted EXECUTE; account lock serializes this with pointer CAS.
 insert into public.account_settings(owner_id) values(p_owner) on conflict do nothing;
 perform 1 from public.account_settings where owner_id=p_owner for update;
 return query update public.account_image_assets a set state='deleting'
 -- Reclaim deleting after a failed/ambiguous Storage.remove. Paths are immutable,
 -- attach rejects deleting, and repeated Storage deletion of the same path is safe.
 where a.owner_id=p_owner and (a.state='deleting' or (a.state in ('pending','retired') and a.created_at<now()-interval '1 hour'))
 and not exists(select 1 from public.profiles p where p.id=p_owner and p.avatar_path=a.path)
 and not exists(select 1 from public.account_settings s where s.owner_id=p_owner and s.cover_path=a.path)
 returning a.id,a.kind,a.path;
end; $$;
revoke all on function public.get_my_account(),public.update_my_account(text,uuid,uuid,boolean,boolean,bigint),public.list_my_ratings(integer,text,uuid),public.claim_account_image_cleanup(uuid),public.reserve_account_image(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.get_my_account(),public.update_my_account(text,uuid,uuid,boolean,boolean,bigint),public.list_my_ratings(integer,text,uuid) to authenticated;
-- Local bootstrap fixtures may omit Supabase's built-in service_role.
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 -- Narrow pre-existing/default ALL grants as well as granting required rights.
 revoke all on public.account_image_assets from service_role;
 grant select,delete on public.account_image_assets to service_role;
 grant execute on function public.claim_account_image_cleanup(uuid),public.reserve_account_image(uuid,uuid,text,text) to service_role;
end if; end $$;
commit;
