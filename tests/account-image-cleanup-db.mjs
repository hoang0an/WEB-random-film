import {fixture} from './account-db.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

for (const mode of ['fresh','upgrade']) {
 const {db,a,b,login}=await fixture(mode);
 const migration=await readFile('supabase/migrations/20261012_account_image_scheduled_cleanup.sql','utf8');
 await db.exec(migration); await db.exec(migration);
 const catalog=(await db.query(`select p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('acquire_account_image_cleanup','claim_scheduled_account_image_cleanup','release_account_image_cleanup')`)).rows;
 assert.equal(catalog.length,3);
 assert.ok(catalog.every(p=>p.prosecdef && p.proconfig.includes('search_path=""') && p.proconfig.includes('lock_timeout=2s')));
 const rpc=async(sql,args=[])=>(await db.query(sql,args)).rows[0].result;
 const acquire=()=>rpc('select public.acquire_account_image_cleanup() result');
 const release=token=>rpc('select public.release_account_image_cleanup($1) result',[token]);
 const claim=(token,owner)=>db.query('select * from public.claim_scheduled_account_image_cleanup($1,$2)',[token,owner]);
 const seed=async(owner,n,state='pending',age='2 hours')=>{
  const result=await db.query(`insert into public.account_image_assets(id,owner_id,kind,path,state,created_at)
   select asset,$1::uuid,'avatar',$1::uuid::text||'/avatar/'||asset::text||'.webp',$3,now()-$4::interval
   from (select gen_random_uuid() asset from generate_series(1,$2)) x returning id,path`,[owner,n,state,age]);
  return result.rows;
 };
 // Browser callers cannot execute any maintenance RPC or read the private lease.
 for(const role of ['anon','authenticated']) {
  await login(a,role);
  await assert.rejects(acquire(),/permission denied/);
  await assert.rejects(claim(a,a),/permission denied/);
  await assert.rejects(release(a),/permission denied/);
  await assert.rejects(db.query('select * from private.account_image_cleanup_schedule'),/permission denied/);
 }
 await login(null,'service_role');
 assert.deepEqual(await acquire(),{busy:false,token:null,owners:[]});
 await assert.rejects(db.query("update public.account_image_assets set state='deleting'"),/permission denied/);
 await db.exec('reset role');
 // 21 owners exercise durable wrap despite every owner's deletions being poisoned.
 const owners=(await db.query("insert into auth.users(id,email) select gen_random_uuid(),'cleanup@test' from generate_series(1,21) returning id")).rows.map(x=>x.id).sort();
 for(const owner of owners) await seed(owner,1);
 await login(null,'service_role');
 const first=await acquire(); assert.equal(first.owners.length,20); assert.ok(first.token);
 assert.equal((await acquire()).busy,true);
 assert.equal(await release(a),false);
 await assert.rejects(claim(a,first.owners[0]),/invalid_cleanup_lease/);
 await assert.rejects(claim(first.token,b),/invalid_cleanup_lease/);
 assert.equal((await claim(first.token,first.owners[0])).rows.length,1);
 await assert.rejects(claim(first.token,first.owners[0]),/invalid_cleanup_lease/);
 assert.equal(await release(first.token),true); assert.equal(await release(first.token),false);
 const second=await acquire(); assert.equal(second.owners.length,20);
 assert.equal(second.owners[0],owners[20]); assert.equal(new Set([...first.owners,...second.owners]).size,21);
 await db.exec('reset role');
 await db.exec("update private.account_image_cleanup_schedule set lease_until=now()-interval '1 second'");
 await login(null,'service_role');
 await assert.rejects(claim(second.token,second.owners[0]),/invalid_cleanup_lease/);
 const recovered=await acquire(); assert.notEqual(recovered.token,second.token);
 assert.equal(await release(second.token),false); await release(recovered.token);
 await db.exec('reset role');
 await db.query('delete from auth.users where id=any($1::uuid[])',[owners]);
 // First 20 failed assets rotate behind asset 21; fresh and current pointers stay safe.
 const poisoned=await seed(a,21,'deleting');
 const fresh=await seed(a,1,'pending','30 minutes');
 const retired=await seed(a,1,'retired','30 minutes');
 const oldRetired=await seed(a,1,'retired','2 hours');
 const current=await seed(a,1,'deleting');
 await db.query('update public.profiles set avatar_path=$1 where id=$2',[current[0].path,a]);
 const coverId=b, coverPath=`${a}/cover/${coverId}.webp`;
 await db.query("insert into public.account_image_assets(id,owner_id,kind,path,state,created_at) values($1,$2,'cover',$3,'deleting',now()-interval '2 hours')",[coverId,a,coverPath]);
 await db.query('insert into public.account_settings(owner_id,cover_path) values($1,$2) on conflict(owner_id) do update set cover_path=excluded.cover_path',[a,coverPath]);
 await login(null,'service_role');
 const batch1=await acquire(); assert.deepEqual(batch1.owners,[a]);
 const assets1=(await claim(batch1.token,a)).rows; assert.equal(assets1.length,20);
 assert.ok(assets1.every(x=>!fresh.concat(retired,current).some(y=>x.id===y.id)&&x.id!==coverId));
 await release(batch1.token);
 const batch2=await acquire(); const assets2=(await claim(batch2.token,a)).rows;
 const missed=poisoned.concat(oldRetired).filter(x=>!assets1.some(y=>y.id===x.id));
 assert.ok(missed.every(x=>assets2.slice(0,missed.length).some(y=>y.id===x.id)));
 await release(batch2.token);
 await db.exec('reset role');
 const guarded=(await db.query('select state,cleanup_attempted_at from public.account_image_assets where id=any($1::uuid[])',[fresh.concat(retired,current).map(x=>x.id).concat(coverId)])).rows;
 assert.ok(guarded.every(x=>x.cleanup_attempted_at===null));
 // Attach winning first excludes that image from scheduled claim, just like upload cleanup.
 const attach=(await seed(b,1))[0];
 await db.exec('create schema storage; create table storage.objects(bucket_id text,name text)');
 await db.query("insert into storage.objects values('account-avatars',$1)",[attach.path]);
 await login(b); await db.query('select public.update_my_account(p_avatar_asset=>$1,p_change_avatar=>true,p_expected_revision=>0)',[attach.id]);
 await login(null,'service_role'); const lease=await acquire(); assert.ok(!lease.owners.includes(b)); await release(lease.token);
 // Claim winning first makes attach fail and leaves canonical pointers untouched.
 await db.exec('reset role'); const loser=(await seed(b,1))[0];
 await db.query("insert into storage.objects values('account-avatars',$1)",[loser.path]);
 await login(null,'service_role'); const winning=await acquire(); await claim(winning.token,b); await release(winning.token);
 await login(b); await assert.rejects(db.query('select public.update_my_account(p_avatar_asset=>$1,p_change_avatar=>true,p_expected_revision=>1)',[loser.id]),/invalid_asset/);
 await db.close(); console.log(`PASS scheduled cleanup DB ${mode} (PGlite sequential lock-order outcomes; no hosted concurrency)`);
}
