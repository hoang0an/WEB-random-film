-- Repair the authenticated CDN metadata preflight for existing account buckets.
-- Run only after account-images.sql. No bucket/object/registry data is changed.
begin;
alter policy account_images_read on storage.objects
using (bucket_id in ('account-avatars','account-covers')
  and (storage.allow_only_operation('object.get_authenticated')
    or storage.allow_only_operation('object.get_authenticated_info'))
  and private.can_read_account_image(bucket_id,name));
alter policy account_images_select_guard on storage.objects
using (bucket_id not in ('account-avatars','account-covers')
  or ((storage.allow_only_operation('object.get_authenticated')
    or storage.allow_only_operation('object.get_authenticated_info'))
    and private.can_read_account_image(bucket_id,name)));
commit;
