-- Storage policies are installed separately from public schema bootstrap.
-- Run after 20261011_account_features.sql. No Storage objects are deleted by SQL.
-- Browser reads use the application proxy with a caller-JWT authorization RPC.
-- Direct Storage downloads/metadata/sign/list are denied for both account buckets.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('account-avatars','account-avatars',false,3145728,array['image/webp']),
       ('account-covers','account-covers',false,3145728,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_read_account_image(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.account_image_assets a
  where a.path=p_path and a.state='attached' and (
   (p_bucket='account-avatars' and a.kind='avatar' and exists(select 1 from public.profiles p where p.id=a.owner_id and p.avatar_path=a.path) and private.shares_group(a.owner_id))
   or (p_bucket='account-covers' and a.kind='cover' and a.owner_id=auth.uid() and exists(select 1 from public.account_settings s where s.owner_id=a.owner_id and s.cover_path=a.path))
  )
 );
$$;
revoke all on function private.can_read_account_image(text,text) from public;
grant usage on schema private to anon,authenticated;
grant execute on function private.can_read_account_image(text,text) to anon,authenticated;

-- Narrow actor-scoped authorization only; never returns registry/group data.
-- Each HTTP RPC call gets its own current database snapshot. The proxy calls
-- again after buffering Storage bytes; it must not reuse the earlier decision.
create or replace function public.can_read_my_account_image(p_kind text,p_path text) returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or p_kind is null or p_kind not in ('avatar','cover') or p_path is null then
  return false;
 end if;
 if p_path !~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || p_kind || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$') then
  return false;
 end if;
 return private.can_read_account_image(
  case p_kind when 'avatar' then 'account-avatars' else 'account-covers' end,p_path
 );
end;
$$;
revoke all on function public.can_read_my_account_image(text,text) from public,anon,service_role;
grant execute on function public.can_read_my_account_image(text,text) to authenticated;

-- PUBLIC includes every browser role. This restrictive policy vetoes even a
-- broad legacy permissive policy. Backend service_role bypasses RLS, but may
-- only download after the separate caller-JWT authorization has allowed it.
drop policy if exists account_images_read on storage.objects;
drop policy if exists account_images_select_guard on storage.objects;
create policy account_images_select_guard on storage.objects as restrictive for select to public
using (bucket_id not in ('account-avatars','account-covers'));

drop policy if exists account_images_insert_guard on storage.objects;
create policy account_images_insert_guard on storage.objects as restrictive for insert to public
with check (bucket_id not in ('account-avatars','account-covers'));
drop policy if exists account_images_update_guard on storage.objects;
create policy account_images_update_guard on storage.objects as restrictive for update to public
using (bucket_id not in ('account-avatars','account-covers')) with check (bucket_id not in ('account-avatars','account-covers'));
drop policy if exists account_images_delete_guard on storage.objects;
create policy account_images_delete_guard on storage.objects as restrictive for delete to public
using (bucket_id not in ('account-avatars','account-covers'));
commit;
