-- Additive, service-only scheduled cleanup. Existing upload cleanup stays compatible.
begin;
alter table public.account_image_assets add column if not exists cleanup_attempted_at timestamptz;
create index if not exists account_image_assets_cleanup_candidates
 on public.account_image_assets(owner_id,cleanup_attempted_at nulls first,id)
 where state in ('pending','retired','deleting');

create table if not exists private.account_image_cleanup_schedule (
 singleton boolean primary key default true check(singleton),
 owner_cursor uuid,
 lease_token uuid,
 lease_until timestamptz,
 lease_owners uuid[] not null default '{}',
 claimed_owners uuid[] not null default '{}'
);
alter table private.account_image_cleanup_schedule enable row level security;
revoke all on private.account_image_cleanup_schedule from public,anon,authenticated,service_role;
insert into private.account_image_cleanup_schedule(singleton) values(true) on conflict do nothing;

create or replace function public.acquire_account_image_cleanup() returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare schedule private.account_image_cleanup_schedule; selected uuid[]; token uuid;
begin
 select * into schedule from private.account_image_cleanup_schedule where singleton for update;
 if schedule.lease_token is not null and schedule.lease_until>clock_timestamp() then
  return jsonb_build_object('busy',true,'token',null,'owners','[]'::jsonb);
 end if;
 -- Cursor advances on acquire, including crashed/failed runs. Wrap exactly once.
 with eligible as (
  select distinct a.owner_id from public.account_image_assets a
  where (a.state='deleting' or (a.state in ('pending','retired') and a.created_at<statement_timestamp()-interval '1 hour'))
   and not exists(select 1 from public.profiles p where p.id=a.owner_id and p.avatar_path=a.path)
   and not exists(select 1 from public.account_settings s where s.owner_id=a.owner_id and s.cover_path=a.path)
 ), batch as (
  select owner_id,case when schedule.owner_cursor is null or owner_id>schedule.owner_cursor then 0 else 1 end wrap
  from eligible order by wrap,owner_id limit 20
 ) select coalesce(array_agg(owner_id order by wrap,owner_id),'{}'::uuid[]) into selected from batch;
 if cardinality(selected)=0 then
  update private.account_image_cleanup_schedule set lease_token=null,lease_until=null,lease_owners='{}',claimed_owners='{}' where singleton;
  return jsonb_build_object('busy',false,'token',null,'owners','[]'::jsonb);
 end if;
 token:=gen_random_uuid();
 update private.account_image_cleanup_schedule set owner_cursor=selected[cardinality(selected)],
  lease_token=token,lease_until=clock_timestamp()+interval '90 seconds',lease_owners=selected,claimed_owners='{}' where singleton;
 return jsonb_build_object('busy',false,'token',token,'owners',to_jsonb(selected));
end; $$;

create or replace function public.claim_scheduled_account_image_cleanup(p_token uuid,p_owner uuid)
returns table(id uuid,kind text,path text)
language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare schedule private.account_image_cleanup_schedule;
begin
 -- Same account-before-asset order as update_my_account and upload cleanup.
 select * into schedule from private.account_image_cleanup_schedule where singleton for update;
 if p_token is null or p_owner is null or schedule.lease_token is distinct from p_token
  or schedule.lease_until is null or schedule.lease_until<=clock_timestamp()
  or not (p_owner=any(schedule.lease_owners)) or p_owner=any(schedule.claimed_owners) then
  raise exception 'invalid_cleanup_lease';
 end if;
 update private.account_image_cleanup_schedule set claimed_owners=array_append(claimed_owners,p_owner) where singleton;
 -- Owner may have disappeared after acquire; no orphan account_settings insert.
 if not exists(select 1 from public.profiles p where p.id=p_owner) then return; end if;
 insert into public.account_settings(owner_id) values(p_owner) on conflict do nothing;
 perform 1 from public.account_settings s where s.owner_id=p_owner for update;
 -- Recheck expiry after a potentially contended account lock.
 if schedule.lease_until<=clock_timestamp() then raise exception 'invalid_cleanup_lease'; end if;
 return query with candidates as (
  select a.id,a.cleanup_attempted_at prior_attempt from public.account_image_assets a where a.owner_id=p_owner
   and (a.state='deleting' or (a.state in ('pending','retired') and a.created_at<statement_timestamp()-interval '1 hour'))
   and not exists(select 1 from public.profiles p where p.id=p_owner and p.avatar_path=a.path)
   and not exists(select 1 from public.account_settings s where s.owner_id=p_owner and s.cover_path=a.path)
  order by a.cleanup_attempted_at nulls first,a.id limit 20 for update of a
 ), updated as (
  update public.account_image_assets a set state='deleting',cleanup_attempted_at=clock_timestamp()
  from candidates c where a.id=c.id returning a.id,a.kind,a.path
 ) select u.id,u.kind,u.path from updated u join candidates c on c.id=u.id
 order by c.prior_attempt nulls first,u.id;
end; $$;

create or replace function public.release_account_image_cleanup(p_token uuid) returns boolean
language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
begin
 if p_token is null then return false; end if;
 update private.account_image_cleanup_schedule set lease_token=null,lease_until=null,lease_owners='{}',claimed_owners='{}'
 where singleton and lease_token=p_token;
 return found;
end; $$;
revoke all on function public.acquire_account_image_cleanup(),public.claim_scheduled_account_image_cleanup(uuid,uuid),public.release_account_image_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.acquire_account_image_cleanup(),public.claim_scheduled_account_image_cleanup(uuid,uuid),public.release_account_image_cleanup(uuid) to service_role;
commit;
