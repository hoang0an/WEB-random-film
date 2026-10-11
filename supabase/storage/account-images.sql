-- Storage policies are installed separately from public schema bootstrap.
-- Run after 20261011_account_features.sql. No Storage objects are deleted by SQL.
-- Read access is authenticated download and its CDN metadata lookup only;
-- clients cannot mint signed URLs/list. Both operations use the same actor check.
-- Requires the vendor operation helper: https://supabase.com/docs/guides/storage/schema/helper-functions
begin;
do $$ begin
 if to_regprocedure('storage.allow_only_operation(text)') is null then
  raise exception 'account_images_requires_storage_operation_helper';
 end if;
end $$;
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

drop policy if exists account_images_read on storage.objects;
create policy account_images_read on storage.objects for select to authenticated
using (bucket_id in ('account-avatars','account-covers') and (storage.allow_only_operation('object.get_authenticated') or storage.allow_only_operation('object.get_authenticated_info')) and private.can_read_account_image(bucket_id,name));
-- Restrictive guards prevent a pre-existing permissive Storage policy from bypassing
-- account privacy or the server's decoder. Supabase service_role bypasses RLS.
drop policy if exists account_images_select_guard on storage.objects;
create policy account_images_select_guard on storage.objects as restrictive for select to public
using (bucket_id not in ('account-avatars','account-covers') or ((storage.allow_only_operation('object.get_authenticated') or storage.allow_only_operation('object.get_authenticated_info')) and private.can_read_account_image(bucket_id,name)));
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
