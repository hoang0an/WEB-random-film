-- Apply after account-images.sql / 20261012_account_image_metadata.sql.
-- Transactional, idempotent server-only read repair. No bucket, object, registry,
-- membership, profile or rating rows are changed. Keep existing write guards.
begin;
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

commit;
