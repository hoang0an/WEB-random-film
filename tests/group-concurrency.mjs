import assert from 'node:assert/strict';

// Real PostgreSQL only: two different backend PIDs, a held transaction,
// and pg_blocking_pids prove the contender reached the lock before release.
export async function runGroupConcurrency(first, second, a, b) {
  const results=[];
  const pid1=(await first.query('select pg_backend_pid() pid')).rows[0].pid;
  const pid2=(await second.query('select pg_backend_pid() pid')).rows[0].pid;
  assert.notEqual(pid1,pid2);
  const login=async (c,uid)=>{
    await c.query('begin');
    await c.query("set local statement_timeout='12s'; set local lock_timeout='10s'; set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
  };
  const call=(c,name,args)=>c.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args);
  async function fixture() {
    await login(first,a);
    const gid=(await call(first,'create_group',['Nghiệm thu race PR3 '+results.length])).rows[0].value;
    const code=(await first.query('select invite_code from public.groups where id=$1',[gid])).rows[0].invite_code;
    const movie=(id)=>JSON.stringify({id,title:'Race fixture '+id,runtime:100,genres:['Thử nghiệm']});
    const pending=(await call(first,'add_movie',[gid,movie(90003001)])).rows[0].value;
    const watched=(await call(first,'add_movie',[gid,movie(90003002)])).rows[0].value;
    await call(first,'select_movie',[gid,watched]);await call(first,'mark_watched',[gid,watched]);
    await first.query('commit');
    await login(first,b);await call(first,'join_group',[code]);
    await call(first,'add_comment',[gid,watched,'Race original']);
    const cid=(await first.query('select id from public.comments where group_id=$1',[gid])).rows[0].id;
    await first.query('commit');
    return {gid,code,pending,watched,cid,movie};
  }
  const cases=[
    ['delete before select','a','delete_movie','select_movie','a','invalid_movie'],
    ['select before delete','a','select_movie','delete_movie','a',null],
    ['delete before mark','a','delete_movie','mark_watched','a','invalid_movie|not_tonight'],
    ['mark before delete','a','mark_watched','delete_movie','a','movie_watched'],
    ...['add_movie','save_rating','edit_comment'].flatMap(fn=>[
      [`leave before ${fn}`,'b','leave_group',fn,'b','not_member'],
      [`${fn} before leave`,'b',fn,'leave_group','b',null],
    ]),
    ['leave before join','b','leave_group','join_group','b',null],
    ['join before leave','b','join_group','leave_group','b',null],
  ];
  for(const [name,uid,fn1,fn2,uid2,error] of cases) {
    const f=await fixture();
    if(fn1==='mark_watched'||fn2==='mark_watched') {
      await login(first,a);await call(first,'select_movie',[f.gid,f.pending]);await first.query('commit');
    }
    const args=fn=>({delete_movie:[f.gid,f.pending],select_movie:[f.gid,f.pending],mark_watched:[f.gid,f.pending],
      leave_group:[f.gid],join_group:[f.code],add_movie:[f.gid,f.movie(90003003)],
      save_rating:[f.gid,f.watched,9],edit_comment:[f.gid,f.cid,'Race edited']}[fn]);
    let blocked=false;
    try {
      await login(first,uid==='a'?a:b);await call(first,fn1,args(fn1));
      await login(second,uid2==='a'?a:b);
      // Attach rejection immediately so a failed query never becomes unhandled.
      const pending=call(second,fn2,args(fn2)).then(value=>({value}),failure=>({failure}));
      for(let i=0;i<40;i++) {
        const row=(await first.query('select $1 = any(pg_blocking_pids($2)) blocked',[pid1,pid2])).rows[0];
        if(row.blocked) {blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      assert.ok(blocked,`${name}: no real lock wait observed`);
      await first.query('commit');
      const outcome=await pending;
      if(error) {assert.ok(outcome.failure,`${name}: expected denial`);assert.match(outcome.failure.message,new RegExp(error));await second.query('rollback');}
      else {if(outcome.failure) throw outcome.failure;await second.query('commit');}
      const members=(await first.query('select count(*)::int n from public.members where group_id=$1 and user_id=$2',[f.gid,b])).rows[0].n;
      if(fn2==='join_group') assert.equal(members,1);
      else if(fn1==='leave_group'||fn2==='leave_group') assert.equal(members,0);
      if(fn1==='delete_movie'||fn2==='delete_movie'&&!error) {
        const g=(await first.query('select tonight_id from public.groups where id=$1',[f.gid])).rows[0];
        assert.equal(g.tonight_id,null);
        assert.equal((await first.query('select id from public.group_movies where id=$1',[f.pending])).rows.length,0);
      }
      if(fn1==='mark_watched') assert.ok((await first.query('select watched_at from public.group_movies where id=$1',[f.pending])).rows[0].watched_at);
      const write=[fn1,fn2].find(fn=>['add_movie','save_rating','edit_comment'].includes(fn));
      if(write==='add_movie') assert.equal((await first.query('select id from public.group_movies where group_id=$1 and tmdb_id=90003003',[f.gid])).rows.length,error?0:1);
      if(write==='save_rating') assert.equal((await first.query('select score from public.ratings where group_id=$1 and user_id=$2',[f.gid,b])).rows.length,error?0:1);
      if(write==='edit_comment') assert.equal((await first.query('select body from public.comments where id=$1',[f.cid])).rows[0].body,error?'Race original':'Race edited');
      results.push({test:name,pass:true,observedLockWait:blocked,outcome:error?'denied after prior commit':'committed in lock order'});
    } finally {
      await first.query('rollback');await second.query('rollback');
      // Only the exact newly created fixture is disposable. Existing rows are untouched.
      await first.query('begin');
      const disposable=(await first.query("select id from public.groups where id=$1 and name like 'Nghiệm thu race PR3 %' for update",[f.gid])).rows;
      assert.equal(disposable.length,1);
      await first.query('delete from public.comments where group_id=$1',[f.gid]);
      await first.query('delete from public.ratings where group_id=$1',[f.gid]);
      await first.query('update public.groups set tonight_id=null where id=$1',[f.gid]);
      await first.query('delete from public.groups where id=$1',[f.gid]);
      await first.query('commit');
    }
  }
  return {distinctBackends:true,checks:results.length,results};
}
