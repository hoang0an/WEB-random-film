-- Chạy một lần trong SQL Editor của dự án Supabase mới.
begin;
create schema if not exists private;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80)
);
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  owner_id uuid not null references public.profiles(id),
  invite_code text not null unique default upper(replace(gen_random_uuid()::text, '-', '')),
  tonight_id uuid,
  created_at timestamptz not null default now()
);
create table public.members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  joined_at timestamptz not null default now(), primary key(group_id,user_id)
);
create table public.group_movies (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  tmdb_id bigint not null check(tmdb_id > 0),
  title text not null check(length(title) between 1 and 300),
  year text not null default '', runtime integer check(runtime > 0),
  overview text not null default '', poster text, backdrop text, genres text[] not null default '{}',
  added_by uuid not null references public.profiles(id),
  watched_at timestamptz, created_at timestamptz not null default now(),
  unique(group_id,tmdb_id), unique(group_id,id)
);
alter table public.groups add constraint tonight_movie_same_group foreign key(id,tonight_id) references public.group_movies(group_id,id);
create table public.ratings (
  group_id uuid not null references public.groups(id), movie_id uuid not null,
  user_id uuid not null references public.profiles(id),
  score numeric not null check(score between 1 and 10 and score * 2 = trunc(score * 2)),
  primary key(movie_id,user_id),
  foreign key(group_id,movie_id) references public.group_movies(group_id,id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id), movie_id uuid not null,
  user_id uuid not null references public.profiles(id),
  body text not null check(length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key(group_id,movie_id) references public.group_movies(group_id,id)
);
create index members_user on public.members(user_id);
create index movies_group on public.group_movies(group_id);
create index ratings_group on public.ratings(group_id);
create index comments_group on public.comments(group_id);

create function private.is_member(gid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members where group_id=gid and user_id=(select auth.uid()));
$$;
create function private.shares_group(uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select uid=(select auth.uid()) or exists(select 1 from public.members a join public.members b using(group_id) where a.user_id=(select auth.uid()) and b.user_id=uid);
$$;
create function private.require_member(gid uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_member(gid) then raise exception 'not_member'; end if;
end; $$;
create function private.on_signup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,name) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),nullif(trim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1),'Thành viên'),80));
  return new;
end; $$;
create trigger new_user after insert on auth.users for each row execute function private.on_signup();
-- Bao gồm tài khoản đã đăng ký trước khi chạy schema.
insert into public.profiles(id,name) select id,left(coalesce(nullif(trim(raw_user_meta_data->>'name'),''),nullif(trim(raw_user_meta_data->>'full_name'),''),split_part(email,'@',1),'Thành viên'),80) from auth.users;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.group_movies enable row level security;
alter table public.ratings enable row level security;
alter table public.comments enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(private.shares_group(id));
create policy groups_read on public.groups for select to authenticated using(private.is_member(id));
create policy members_read on public.members for select to authenticated using(private.is_member(group_id));
create policy movies_read on public.group_movies for select to authenticated using(private.is_member(group_id));
create policy ratings_read on public.ratings for select to authenticated using(private.is_member(group_id));
create policy comments_read on public.comments for select to authenticated using(private.is_member(group_id));
revoke all on public.profiles,public.groups,public.members,public.group_movies,public.ratings,public.comments from anon,authenticated;
grant select on public.profiles,public.groups,public.members,public.group_movies,public.ratings,public.comments to authenticated;
revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.is_member(uuid),private.shares_group(uuid) to authenticated;

create function public.create_group(group_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'not_member'; end if;
  insert into public.groups(name,owner_id) values(trim(group_name),auth.uid()) returning id into gid;
  insert into public.members(group_id,user_id) values(gid,auth.uid()); return gid;
end; $$;
create function public.join_group(code text) returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'not_member'; end if;
  select id into gid from public.groups where invite_code=upper(trim(code));
  if gid is null then raise exception 'invalid_invite'; end if;
  insert into public.members(group_id,user_id) values(gid,auth.uid()) on conflict do nothing; return gid;
end; $$;
create function public.add_movie(gid uuid,movie jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  perform private.require_member(gid);
  insert into public.group_movies(group_id,tmdb_id,title,year,runtime,overview,poster,backdrop,genres,added_by)
  values(gid,(movie->>'id')::bigint,left(movie->>'title',300),left(coalesce(movie->>'year',''),4),nullif((movie->>'runtime')::integer,0),left(coalesce(movie->>'overview',''),10000),movie->>'poster',movie->>'backdrop',array(select left(value,80) from jsonb_array_elements_text(coalesce(nullif(movie->'genres','null'::jsonb),'[]'::jsonb)) limit 20),auth.uid()) returning id into mid;
  return mid;
end; $$;
create function public.select_movie(gid uuid,mid uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  perform 1 from public.groups where id=gid for update;
  if not exists(select 1 from public.group_movies where id=mid and group_id=gid and watched_at is null) then raise exception 'invalid_movie'; end if;
  update public.groups set tonight_id=mid where id=gid;
end; $$;
create function public.mark_watched(gid uuid,mid uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  perform 1 from public.groups where id=gid for update;
  if not exists(select 1 from public.groups where id=gid and tonight_id=mid) then raise exception 'not_tonight'; end if;
  update public.group_movies set watched_at=now() where id=mid and group_id=gid and watched_at is null;
  update public.groups set tonight_id=null where id=gid;
end; $$;
create function public.save_rating(gid uuid,mid uuid,new_score numeric) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if not exists(select 1 from public.group_movies where id=mid and group_id=gid and watched_at is not null) then raise exception 'not_watched'; end if;
  insert into public.ratings(group_id,movie_id,user_id,score) values(gid,mid,auth.uid(),new_score) on conflict(movie_id,user_id) do update set score=excluded.score;
end; $$;
create function public.add_comment(gid uuid,mid uuid,comment_body text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if not exists(select 1 from public.group_movies where id=mid and group_id=gid and watched_at is not null) then raise exception 'not_watched'; end if;
  insert into public.comments(group_id,movie_id,user_id,body) values(gid,mid,auth.uid(),trim(comment_body));
end; $$;
revoke all on function public.create_group(text),public.join_group(text),public.add_movie(uuid,jsonb),public.select_movie(uuid,uuid),public.mark_watched(uuid,uuid),public.save_rating(uuid,uuid,numeric),public.add_comment(uuid,uuid,text) from public,anon;
grant execute on function public.create_group(text),public.join_group(text),public.add_movie(uuid,jsonb),public.select_movie(uuid,uuid),public.mark_watched(uuid,uuid),public.save_rating(uuid,uuid,numeric),public.add_comment(uuid,uuid,text) to authenticated;

-- Group self management for fresh installations.
create or replace function private.require_member(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_member'; end if;
  perform 1 from public.groups where id=gid for update;
  if not found or not private.is_member(gid) then raise exception 'not_member'; end if;
end; $$;

create or replace function public.delete_movie(gid uuid, mid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.group_movies%rowtype; owner uuid;
begin
  perform private.require_member(gid);
  select * into m from public.group_movies where group_id=gid and id=mid for update;
  if not found then raise exception 'invalid_movie'; end if;
  select owner_id into owner from public.groups where id=gid;
  if m.added_by<>auth.uid() and owner<>auth.uid() then raise exception 'forbidden'; end if;
  if m.watched_at is not null then raise exception 'movie_watched'; end if;
  if exists(select 1 from public.ratings where group_id=gid and movie_id=mid)
     or exists(select 1 from public.comments where group_id=gid and movie_id=mid)
  then raise exception 'movie_has_activity'; end if;
  update public.groups set tonight_id=null where id=gid and tonight_id=mid;
  delete from public.group_movies where group_id=gid and id=mid;
end; $$;
revoke all on function public.delete_movie(uuid,uuid) from public,anon;
grant execute on function public.delete_movie(uuid,uuid) to authenticated;

create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'not_member'; end if;
  select id into gid from public.groups where invite_code=upper(trim(code)) for update;
  if gid is null then raise exception 'invalid_invite'; end if;
  insert into public.members(group_id,user_id) values(gid,auth.uid())
    on conflict do nothing;
  return gid;
end; $$;

create or replace function public.edit_comment(gid uuid, cid uuid, comment_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if comment_body is null or length(trim(comment_body)) not between 1 and 1000
  then raise exception 'invalid_comment'; end if;
  update public.comments c set body=trim(comment_body)
  where c.group_id=gid and c.id=cid and c.user_id=auth.uid()
    and exists(select 1 from public.group_movies m where m.group_id=gid
      and m.id=c.movie_id and m.watched_at is not null);
  if not found then raise exception 'forbidden'; end if;
end; $$;

create or replace function public.delete_comment(gid uuid, cid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  delete from public.comments c where c.group_id=gid and c.id=cid and c.user_id=auth.uid()
    and exists(select 1 from public.group_movies m where m.group_id=gid
      and m.id=c.movie_id and m.watched_at is not null);
  if not found then raise exception 'forbidden'; end if;
end; $$;

create or replace function public.delete_rating(gid uuid, mid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if not exists(select 1 from public.group_movies where group_id=gid and id=mid
    and watched_at is not null) then raise exception 'not_watched'; end if;
  delete from public.ratings where group_id=gid and movie_id=mid and user_id=auth.uid();
  if not found then raise exception 'rating_missing'; end if;
end; $$;
revoke all on function public.edit_comment(uuid,uuid,text), public.delete_comment(uuid,uuid),
  public.delete_rating(uuid,uuid) from public,anon;
grant execute on function public.edit_comment(uuid,uuid,text), public.delete_comment(uuid,uuid),
  public.delete_rating(uuid,uuid) to authenticated;

create or replace function public.leave_group(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if exists(select 1 from public.groups where id=gid and owner_id=auth.uid())
  then raise exception 'owner_cannot_leave'; end if;
  delete from public.members where group_id=gid and user_id=auth.uid();
end; $$;

create or replace function public.rename_group(gid uuid, group_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member(gid);
  if not exists(select 1 from public.groups where id=gid and owner_id=auth.uid())
  then raise exception 'forbidden'; end if;
  if group_name is null or length(trim(group_name)) not between 1 and 80
  then raise exception 'invalid_group_name'; end if;
  update public.groups set name=trim(group_name) where id=gid;
end; $$;
revoke all on function public.leave_group(uuid), public.rename_group(uuid,text) from public,anon;
grant execute on function public.leave_group(uuid), public.rename_group(uuid,text) to authenticated;


commit;

-- Account features: additive bootstrap
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
