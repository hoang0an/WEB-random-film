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
