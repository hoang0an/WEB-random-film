import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function fixture(mode='fresh') {
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    -- Supabase may grant ALL through default privileges; migration must narrow them.
    alter default privileges in schema public grant all on tables to service_role;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon,service_role;`);
  let schema=await readFile('supabase/schema.sql','utf8');
  if(mode==='upgrade') schema=schema.split('-- Account features: additive bootstrap')[0];
  await db.exec(schema);
  const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',c='00000000-0000-0000-0000-000000000003';
  await db.query("insert into auth.users(id,email) values($1,'a@test.dev'),($2,'b@test.dev'),($3,'c@test.dev')",[a,b,c]);
  await db.query("update public.profiles set name='Preserved' where id=$1",[a]);
  if(mode!=='bootstrap') {
    await db.exec(await readFile('supabase/migrations/20261011_account_features.sql','utf8'));
    await db.exec(await readFile('supabase/migrations/20261011_account_features.sql','utf8'));
  }
  const login=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role '+role);};
  return {db,a,b,c,login};
}
if(process.argv[1]?.endsWith('account-db.mjs')) for(const mode of ['bootstrap','fresh','upgrade']) {
 const {db,a,b,c,login}=await fixture(mode);
 const rpc=async(sql,args=[])=>(await db.query(sql,args)).rows[0].result;
 await login(a);
 let profile=await rpc('select public.get_my_account() result');
 assert.deepEqual(Object.keys(profile).sort(),['avatar_path','cover_path','id','name','revision']);
 assert.equal(profile.id,a);assert.equal(profile.name,'Preserved');assert.equal(profile.revision,0);
 profile=await rpc('select public.update_my_account(p_name=>$1,p_expected_revision=>0) result',[' New 🌟 ']);
 assert.equal(profile.name,'New 🌟');assert.equal(profile.revision,1);
 await assert.rejects(db.query("select public.update_my_account(p_name=>'stale',p_expected_revision=>0)"),/revision_conflict/);
 for(const name of ['', 'x'.repeat(81)]) await assert.rejects(db.query('select public.update_my_account(p_name=>$1,p_expected_revision=>1)',[name]),/invalid_name/);
 await assert.rejects(db.query('select public.update_my_account(p_name=>$1)',['bypass']),/invalid_revision/);
 await assert.rejects(db.query("update public.account_settings set revision=100"),/permission denied/);
 await assert.rejects(db.query("update public.profiles set name='bypass',avatar_path='forged'"),/permission denied/);
 // Compound update errors roll back the name and revision together.
 await assert.rejects(db.query('select public.update_my_account(p_name=>$1,p_avatar_asset=>$2,p_change_avatar=>true,p_expected_revision=>1)',['rollback',b]),/invalid_asset/);
 assert.deepEqual(await rpc('select public.get_my_account() result'),profile);
 const gid=(await db.query("select public.create_group('private') id")).rows[0].id;
 const code=(await db.query('select invite_code from public.groups where id=$1',[gid])).rows[0].invite_code;
 for(const [id,title] of [[1,'Z'],[2,'A'],[3,'A']]) {
  const mid=(await db.query('select public.add_movie($1,$2::jsonb) id',[gid,JSON.stringify({id,title})])).rows[0].id;
  await db.query('select public.select_movie($1,$2)',[gid,mid]);await db.query('select public.mark_watched($1,$2)',[gid,mid]);
 }
 await login(b);await db.query('select public.join_group($1)',[code]);
 const movies=(await db.query('select id from public.group_movies')).rows;
 for(const {id} of movies) await db.query('select public.save_rating($1,$2,8.5)',[gid,id]);
 let page=await rpc('select public.list_my_ratings(2) result');assert.equal(page.items.length,2);assert.ok(page.next_cursor);
 assert.equal(page.items[0].title,'A');assert.equal(page.items[1].title,'A');
 assert.deepEqual(Object.keys(page.items[0]).sort(),['id','is_current_member','poster','score','title','tmdb_id','year']);
 const tail=await rpc('select public.list_my_ratings(2,$1,$2) result',[page.next_cursor.title,page.next_cursor.id]);assert.equal(tail.items.length,1);assert.equal(tail.next_cursor,null);
 const all=await rpc('select public.list_my_ratings() result');
 assert.deepEqual([...page.items,...tail.items],all.items);
 assert.equal(new Set(all.items.map(x=>x.id)).size,3);
 assert.ok(page.items[0].id<page.items[1].id); // Duplicate titles use UUID as a stable tie break.
 await db.query('select public.leave_group($1)',[gid]);
 page=await rpc('select public.list_my_ratings() result');assert.equal(page.items.length,3);assert.ok(page.items.every(x=>!x.is_current_member));
 for(const table of ['groups','members','group_movies','ratings','comments']) assert.equal((await db.query('select * from public.'+table)).rows.length,0);
 for(const limit of [0,51,null]) await assert.rejects(db.query('select public.list_my_ratings($1)',[limit]),/invalid_limit/);
 await assert.rejects(db.query("select public.list_my_ratings(20,'A',null)"),/invalid_cursor/);
 await assert.rejects(db.query('select public.list_my_ratings(20,$1,$2)',['forged',a]),/invalid_cursor/);
 await login(c);assert.deepEqual((await rpc('select public.list_my_ratings() result')).items,[]);
 assert.equal((await db.query('select * from public.account_settings')).rows.length,0);
 await assert.rejects(db.query('select public.get_my_account($1)',[a]),/does not exist/);
 await assert.rejects(db.query("select public.update_my_account(p_avatar_path=>'forged',p_expected_revision=>0)"),/does not exist/);
 for(const role of ['anon','authenticated']) {
  await login(null,role);
  for(const sql of ['select public.get_my_account()','select public.list_my_ratings()','select public.update_my_account(p_name=>\'forged\',p_expected_revision=>0)'])
   await assert.rejects(db.query(sql),role==='anon'?/permission denied/:/not_authenticated/);
 }
 await db.close();console.log('PASS account DB '+mode+' (local PGlite, no hosted/concurrent sessions)');
}
