// SQL/RLS fixture with simulated Storage operations: no hosted HTTP or real concurrency.
import {fixture} from './account-db.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Fresh bootstrap must match additive migration, before migration can mask drift.
const schema=await readFile('supabase/schema.sql','utf8');
const migration=await readFile('supabase/migrations/20261011_account_features.sql','utf8');
assert.equal(schema.split('-- Account features: additive bootstrap')[1].replaceAll('\r\n','\n').trim(),migration.replaceAll('\r\n','\n').trim());
for(const mode of ['bootstrap','upgrade']) {
const {db,a,b,c,login}=await fixture(mode);
await db.exec(`create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated,anon,service_role;
 grant select,insert,update,delete on storage.objects to authenticated,anon,service_role;
 -- Deliberately broad legacy policy: account restrictive guards must still prevent bypass.
 create policy legacy_allow on storage.objects for all to public using(true) with check(true);`);
const storageSql=await readFile('supabase/storage/account-images.sql','utf8');
await assert.rejects(db.exec(storageSql),/account_images_requires_storage_operation_helper/);
await db.exec('rollback');
assert.equal((await db.query('select * from storage.buckets')).rows.length,0);
// Fixture mock only: production SQL must require Supabase's vendor helper, never replace it.
await db.exec(`create function storage.allow_only_operation(operation text) returns boolean
 language sql stable as $$select coalesce(nullif(current_setting('storage.operation',true),'')=operation,false)$$;`);
const operation=async value=>{await db.query("select set_config('storage.operation',$1,false)",[value]);};
await operation('object.get_authenticated');
await db.exec(storageSql);
await db.exec(storageSql);
const reserve=async(owner,kind='avatar',pathOverride)=>{
 const id=(await db.query('select gen_random_uuid() id')).rows[0].id;
 const path=pathOverride??owner+'/'+kind+'/'+id+'.webp';
 await db.query('select public.reserve_account_image($1,$2,$3,$4)',[id,owner,kind,path]);
 return {id,path,kind};
};
await login(null,'service_role');
for(let i=0;i<20;i++) await reserve(c,i%2?'cover':'avatar');
await assert.rejects(reserve(c),/too_many_pending_images/);
assert.equal((await db.query("select count(*)::int n from public.account_image_assets where owner_id=$1 and state='pending'",[c])).rows[0].n,20);
await db.exec('reset role');
await db.query("update public.account_image_assets set created_at=now()-interval '2 hours' where id=(select id from public.account_image_assets where owner_id=$1 limit 1)",[c]);
await login(null,'service_role');
assert.equal((await db.query('select * from public.claim_account_image_cleanup($1)',[c])).rows.length,1);
await reserve(c); // Cleanup releases a pending slot while failed deletes remain retryable.
assert.equal((await db.query("select count(*)::int n from public.account_image_assets where owner_id=$1 and state='pending'",[c])).rows[0].n,20);
await assert.rejects(reserve(a,'invalid'),/invalid_asset/);
await assert.rejects(reserve(a,'avatar',b+'/avatar/forged.webp'),/invalid_asset/);
await assert.rejects(reserve('00000000-0000-0000-0000-000000000099'),/account_missing/);
await assert.rejects(db.query("insert into public.account_image_assets(id,owner_id,kind,path) values(gen_random_uuid(),$1,'avatar','forged')",[a]),/permission denied/);
for(const role of ['anon','authenticated']) {
 await login(a,role);await assert.rejects(reserve(a),/permission denied/);
}
const assets=[];
const upload=async(owner,kind='avatar',old=false)=>{
 await login(null,'service_role');const asset=await reserve(owner,kind);
 const {id,path}=asset;
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['account-'+(kind==='avatar'?'avatars':'covers'),path]);
 if(old) {await db.exec('reset role');await db.query("update public.account_image_assets set created_at=now()-interval '2 hours' where id=$1",[id]);await login(null,'service_role');}
 assets.push(asset);return asset;
};
await login(a);const gid=(await db.query("select public.create_group('peers') id")).rows[0].id;
const code=(await db.query('select invite_code from public.groups')).rows[0].invite_code;
await login(b);await db.query('select public.join_group($1)',[code]);
const avatar=await upload(a),cover=await upload(a,'cover'),pending=await upload(a),foreign=await upload(b);
// Registry alone cannot attach an object absent from the private bucket.
const missing=await upload(a);
await db.query('delete from storage.objects where name=$1',[missing.path]);
await login(a);
assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await assert.rejects(db.query('select public.update_my_account(p_avatar_asset=>$1,p_change_avatar=>true,p_expected_revision=>0)',[foreign.id]),/invalid_asset/);
await assert.rejects(db.query('select public.update_my_account(p_cover_asset=>$1,p_change_cover=>true,p_expected_revision=>0)',[avatar.id]),/invalid_asset/);
await assert.rejects(db.query('select public.update_my_account(p_avatar_asset=>$1,p_change_avatar=>true,p_expected_revision=>0)',[missing.id]),/invalid_asset/);
await assert.rejects(db.query('insert into public.account_image_assets(id,owner_id,kind,path) values(gen_random_uuid(),$1,\'avatar\',\'forged\')',[a]),/permission denied/);
await db.query('select public.update_my_account(p_avatar_asset=>$1,p_cover_asset=>$2,p_change_avatar=>true,p_change_cover=>true,p_expected_revision=>0)',[avatar.id,cover.id]);
assert.deepEqual((await db.query('select name from storage.objects order by name')).rows.map(x=>x.name).sort(),[avatar.path,cover.path].sort());
for(const actor of [a,b,c,null]) {
 await login(actor,actor?'authenticated':'anon');
 for(const value of ['object.sign','object.sign_many','object.list','object.get_public','']) {
  await operation(value);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 }
}
await operation('object.get_authenticated');await login(a);
for(const role of ['authenticated','anon']) {
 await login(a,role);
 await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values(\'account-avatars\',\'forged\')'),/row-level security/);
 assert.equal((await db.query('delete from storage.objects returning name')).rows.length,0);
 assert.equal((await db.query("update storage.objects set name='overwrite' returning name")).rows.length,0);
}
await login(b);assert.deepEqual((await db.query('select name from storage.objects')).rows.map(x=>x.name),[avatar.path]);
assert.deepEqual((await db.query('select owner_id from public.account_settings')).rows.map(x=>x.owner_id),[b]);
await db.query('select public.leave_group($1)',[gid]);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await login(c);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await login(null,'anon');assert.equal((await db.query('select * from storage.objects')).rows.length,0);
const replacement=await upload(a);await login(a);
await db.query('select public.update_my_account(p_avatar_asset=>$1,p_change_avatar=>true,p_expected_revision=>1)',[replacement.id]);
// Two writers with the same revision: exactly the first commit wins; loser keeps pending.
await assert.rejects(db.query('select public.update_my_account(p_avatar_asset=>$1,p_change_avatar=>true,p_expected_revision=>1)',[pending.id]),/revision_conflict/);
assert.equal((await db.query('select public.get_my_account() result')).rows[0].result.avatar_path,replacement.path);
assert.equal((await db.query('select * from storage.objects where name=$1',[avatar.path])).rows.length,0);
await assert.rejects(db.query('select public.update_my_account(p_avatar_asset=>$1,p_change_avatar=>true,p_expected_revision=>2)',[avatar.id]),/invalid_asset/);
await assert.rejects(db.query('select public.claim_account_image_cleanup($1)',[a]),/permission denied/);
const expired=await upload(a,'avatar',true);
const otherExpired=await upload(b,'avatar',true);
await login(null,'service_role');let claimed=(await db.query('select * from public.claim_account_image_cleanup($1)',[a])).rows;
assert.deepEqual(claimed.map(x=>x.id),[expired.id]);
// Storage.remove failed: deleting remains registered and must be retried.
assert.deepEqual((await db.query('select * from public.claim_account_image_cleanup($1)',[a])).rows.map(x=>x.id),[expired.id]);
assert.equal((await db.query('select state from public.account_image_assets where id=$1',[otherExpired.id])).rows[0].state,'pending');
await assert.rejects(db.query("update public.account_image_assets set state='pending' where id=$1",[expired.id]),/permission denied/);
// An attached image is protected even if its upload timestamp is very old.
// A retired image becomes eligible only after the retirement grace period.
await db.exec('reset role');
await db.query("update public.account_image_assets set created_at=now()-interval '2 hours' where id in ($1,$2)",[replacement.id,avatar.id]);
await login(null,'service_role');
assert.deepEqual((await db.query('select * from public.claim_account_image_cleanup($1)',[a])).rows.map(x=>x.id).sort(),[avatar.id,expired.id].sort());
await login(b);assert.equal((await db.query('select public.get_my_account() result')).rows[0].result.avatar_path,null);
await login(a);await assert.rejects(db.query('select public.update_my_account(p_avatar_asset=>$1,p_change_avatar=>true,p_expected_revision=>2)',[expired.id]),/invalid_asset/);
await db.query('select public.update_my_account(p_change_avatar=>true,p_change_cover=>true,p_expected_revision=>2)');
const account=(await db.query('select public.get_my_account() result')).rows[0].result;assert.equal(account.avatar_path,null);assert.equal(account.cover_path,null);
assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await login(null,'service_role');await db.query("delete from public.account_image_assets where id=$1 and state='deleting'",[expired.id]);
assert.ok(!(await db.query('select * from public.claim_account_image_cleanup($1)',[a])).rows.some(x=>x.id===expired.id));
await db.close();console.log('PASS account Storage SQL '+mode+': authenticated-download owner/current-peer/leaver/outsider/anon, signing/list blocked, helper preflight, pending/history, direct-write bypass, registry CAS and cleanup retries; no hosted Storage verification.');
}
