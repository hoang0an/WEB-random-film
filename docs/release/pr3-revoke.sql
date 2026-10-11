-- PREPARED ONLY. Approved Production project, after snapshot and app rollback.
-- Keep data, locks and baseline RPCs. Never use bootstrap as rollback.
begin;
revoke execute on function public.delete_movie(uuid,uuid), public.edit_comment(uuid,uuid,text),
  public.delete_comment(uuid,uuid), public.delete_rating(uuid,uuid),
  public.leave_group(uuid), public.rename_group(uuid,text) from public, anon, authenticated;
commit;
