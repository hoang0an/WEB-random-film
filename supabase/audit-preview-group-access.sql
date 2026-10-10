-- Kiem tra RLS tren database thu nghiem that, khong thay doi du lieu.
-- Chi chay sau khi profile 'Nghiem thu B' (co dau nhu ben duoi) da ton tai.
-- SQL Editor can postgres de dat role/claims trong transaction rieng.
-- Day la phep kiem database theo role B; ket hop voi nghiem thu UI Preview.
begin;
select set_config('preview_audit.group_a',
  (select id::text from public.groups where name='Nghiệm thu Preview 10-10'), true);
select set_config('preview_audit.owner_a',
  (select owner_id::text from public.groups where name='Nghiệm thu Preview 10-10'), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where name='Nghiệm thu B'),
  'role', 'authenticated')::text, true);
set local role authenticated;
select
  auth.uid() is not null as b_identity_present,
  (select count(*) from public.groups
    where id=current_setting('preview_audit.group_a')::uuid) as visible_a_group,
  (select count(*) from public.members
    where group_id=current_setting('preview_audit.group_a')::uuid) as visible_a_members,
  (select count(*) from public.profiles
    where id=current_setting('preview_audit.owner_a')::uuid) as visible_a_profile,
  private.is_member(current_setting('preview_audit.group_a')::uuid) as b_is_member,
  (select count(*) from public.profiles where id=auth.uid()) as b_own_profile;
rollback;
