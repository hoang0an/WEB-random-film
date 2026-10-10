-- PREPARED ONLY. Re-enable only after reviewed fix, migration and validation.
begin;
revoke execute on function public.delete_movie(uuid,uuid), public.edit_comment(uuid,uuid,text),
  public.delete_comment(uuid,uuid), public.delete_rating(uuid,uuid),
  public.leave_group(uuid), public.rename_group(uuid,text) from public, anon;
grant execute on function public.delete_movie(uuid,uuid), public.edit_comment(uuid,uuid,text),
  public.delete_comment(uuid,uuid), public.delete_rating(uuid,uuid),
  public.leave_group(uuid), public.rename_group(uuid,text) to authenticated;
commit;
