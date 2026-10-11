-- Additive upgrade only. No bootstrap or data reset.
begin;
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
