// Loopback-only HTTP fixtures for the real UI build. No real Auth/database credentials.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
const uid='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002';
const gid='00000000-0000-0000-0000-000000000010', gid2='00000000-0000-0000-0000-000000000020';
const mid='00000000-0000-0000-0000-000000000030', watched='00000000-0000-0000-0000-000000000040';
const cid='00000000-0000-0000-0000-000000000050';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'qa@example.invalid',app_metadata:{},user_metadata:{name:'QA A'},created_at:'2026-10-10T00:00:00Z'};
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})}.qa-only-signature`;
const session={access_token:token,refresh_token:'qa-only-refresh',expires_in:3600,token_type:'bearer',user};
const headers={'Access-Control-Allow-Origin':'http://localhost:4320','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
let groups,mode='normal',held=[],counts={},history=[];
function reset() {
  groups=[gid,gid2].map((id,i)=>({id,owner_id:uid,name:i?'QA nhóm thứ hai':'QA quản lý nhóm',invite_code:i?'QA2':'QA1',tonight_id:null,
    members:[{user_id:uid,profiles:{id:uid,name:'QA A'}},{user_id:other,profiles:{id:other,name:'QA B'}}],
    group_movies:i?[]:[{id:mid,group_id:id,tmdb_id:90004001,title:'QA phim chờ',year:'2026',runtime:100,poster:null,genres:['Thử nghiệm'],added_by:uid,watched_at:null},
      {id:watched,group_id:id,tmdb_id:90004002,title:'QA phim đã xem',year:'2026',runtime:100,poster:null,genres:['Thử nghiệm'],added_by:uid,watched_at:'2026-10-10T00:00:00Z'}],
    ratings:i?[]:[{movie_id:watched,user_id:uid,score:8,profiles:{name:'QA A'}}],
    comments:i?[]:[{id:cid,movie_id:watched,user_id:uid,body:'QA bình luận gốc',created_at:'2026-10-10T00:00:00Z',profiles:{name:'QA A'}}]}));
  mode='normal';counts={};history=[];
}
reset();
function mutate(fn,data) {
  const g=groups.find(g=>g.id===data.gid);if(!g) return {message:'not_member'};
  if(fn==='delete_movie') {g.group_movies=g.group_movies.filter(m=>m.id!==data.mid);if(g.tonight_id===data.mid)g.tonight_id=null;}
  else if(fn==='edit_comment') {const c=g.comments.find(c=>c.id===data.cid);if(!c)return {message:'forbidden'};c.body=data.comment_body;}
  else if(fn==='delete_comment')g.comments=g.comments.filter(c=>c.id!==data.cid);
  else if(fn==='delete_rating')g.ratings=g.ratings.filter(r=>r.movie_id!==data.mid||r.user_id!==uid);
  else if(fn==='save_rating') {g.ratings=g.ratings.filter(r=>r.movie_id!==data.mid||r.user_id!==uid);g.ratings.push({movie_id:data.mid,user_id:uid,score:data.new_score,profiles:{name:'QA A'}});}
  else if(fn==='add_comment')g.comments.push({id:randomUUID(),movie_id:data.mid,user_id:uid,body:data.comment_body,created_at:new Date().toISOString(),profiles:{name:'QA A'}});
  else if(fn==='rename_group')g.name=data.group_name;
  else if(fn==='leave_group')groups=groups.filter(x=>x.id!==g.id);
  else return {message:'unexpected_rpc'};
  return null;
}
const finish=(res,fn,data)=>{const error=mutate(fn,data);res.writeHead(error?400:200,headers).end(JSON.stringify(error));};
const service=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,headers).end();return;}
  if(req.url.startsWith('/auth/v1/')){res.writeHead(200,headers).end(JSON.stringify(req.url.includes('/token')?session:user));return;}
  if(mode==='offline'){
    // Truncate the response body so browser/SDK transport retries do not hide
    // the failure being tested. Authentication remains available in this fixture.
    res.writeHead(200,{...headers,'Content-Length':'100'});res.flushHeaders();
    res.write('{');req.socket.destroy();return;
  }
  if(req.url.startsWith('/rest/v1/groups')){res.writeHead(200,headers).end(JSON.stringify(groups));return;}
  if(req.url.startsWith('/rest/v1/rpc/')) {
    let raw='';for await(const part of req) raw+=part;
    const data=JSON.parse(raw),fn=req.url.split('/').at(-1);counts[fn]=(counts[fn]||0)+1;history.push({fn,gid:data.gid});
    if(mode==='hold'){held.push({res,fn,data});return;}
    // Begin a response before truncating it; a socket reset before any headers can
    // be transparently replayed by Chromium and would not isolate app retries.
    if(mode==='drop-before'){res.writeHead(200,{...headers,'Content-Length':'100'});res.flushHeaders();res.write('{');req.socket.destroy();return;}
    if(mode==='drop-after'){mutate(fn,data);res.writeHead(200,{...headers,'Content-Length':'100'});res.flushHeaders();res.write('{');req.socket.destroy();return;}
    finish(res,fn,data);return;
  }
  res.writeHead(404,headers).end('{}');
});
const controls=['normal','offline','hold','drop-before','drop-after','release','reject','hide-first','reset'];
const control=http.createServer(async(req,res)=>{
  if(req.headers.host!=='127.0.0.1:4318'){res.writeHead(403).end();return;}
  if(req.method==='POST') {
    if(req.headers.origin!=='http://127.0.0.1:4318'){res.writeHead(403).end();return;}
    let raw='';for await(const part of req)raw+=part;const action=new URLSearchParams(raw).get('action');
    if(action==='release'||action==='reject'){for(const item of held) {if(action==='release')finish(item.res,item.fn,item.data);else item.res.writeHead(400,headers).end(JSON.stringify({message:'not_member'}));}held=[];mode='normal';}
    else if(action==='hide-first')groups=groups.filter(g=>g.id!==gid);
    else if(action==='reset'){if(held.length){res.writeHead(409).end();return;}reset();}
    else if(controls.includes(action))mode=action;
    res.writeHead(303,{Location:'/'}).end();return;
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});
  res.end(`<html lang="vi"><title>Điều khiển lỗi QA PR3</title><style>body{font:16px system-ui;padding:30px}form{display:inline-block;margin:10px}button{padding:12px}pre{white-space:pre-wrap}</style><h1>Điều khiển lỗi QA PR3</h1><p>Chỉ HTTP giả lập ở loopback, không Supabase thật.</p>${controls.map(action=>`<form method="post"><button name="action" value="${action}">${action}</button></form>`).join('')}<pre>${JSON.stringify({mode,held:held.length,counts,history,groups:groups.map(g=>({name:g.name,pending:g.group_movies.filter(m=>!m.watched_at).length,comments:g.comments.map(c=>c.body)}))},null,2)}</pre></html>`);
});
service.listen(54321,'127.0.0.1');control.listen(4318,'127.0.0.1',()=>console.log('QA controller http://127.0.0.1:4318; mock HTTP :54321'));
