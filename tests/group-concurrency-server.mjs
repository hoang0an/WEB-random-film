import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import pg from 'pg';
import {runGroupConcurrency} from './group-concurrency.mjs';
const origin='http://127.0.0.1:4319',nonce=randomBytes(24).toString('hex');
const ca=await readFile('test-results/group-management/supabase-ca.crt','utf8');
let running=false,result=null;
const page=()=>`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Nghiệm thu PostgreSQL PR3</title><style>body{font:16px system-ui;max-width:740px;margin:30px auto;padding:20px}label{display:block;margin:16px 0}input{display:block;width:100%;padding:10px}pre{white-space:pre-wrap}button{padding:12px}</style><h1>Hai kết nối PostgreSQL thử nghiệm</h1><p>Chỉ project dgivczwqlzxcvxwzpadm. TLS được xác minh. Mật khẩu chỉ giữ trong bộ nhớ khi kết nối; không ghi ra file hoặc kết quả.</p><form method="post" action="/run"><input type="hidden" name="nonce" value="${nonce}"><label>Host<input name="host" value="aws-0-ap-northeast-1.pooler.supabase.com" readonly></label><label>User<input name="user" value="postgres.dgivczwqlzxcvxwzpadm" readonly></label><label>Mật khẩu database (không phải mật khẩu website)<input type="password" name="password" autocomplete="off" required></label><button ${running?'disabled':''}>Kết nối và kiểm thử race</button></form><pre>${JSON.stringify(result||{status:running?'Đang kiểm thử':'Chờ mật khẩu nhập trực tiếp'},null,2)}</pre></html>`;
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  if(req.headers.host!=='127.0.0.1:4319') {res.writeHead(403).end();return;}
  if(req.method==='GET'&&req.url==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page());return;}
  if(req.method!=='POST'||req.url!=='/run'||req.headers.origin!==origin||running) {res.writeHead(403).end();return;}
  let raw='';for await(const part of req){raw+=part;if(raw.length>16384){res.writeHead(413).end();return;}}
  const body=new URLSearchParams(raw);raw='';
  if(body.get('nonce')!==nonce||body.get('host')!=='aws-0-ap-northeast-1.pooler.supabase.com'||body.get('user')!=='postgres.dgivczwqlzxcvxwzpadm') {res.writeHead(403).end();return;}
  const config={host:body.get('host'),user:body.get('user'),password:body.get('password'),port:5432,database:'postgres',ssl:{rejectUnauthorized:true,ca},connectionTimeoutMillis:10000};body.delete('password');
  running=true;result={status:'Đang kiểm thử'};
  res.writeHead(303,{Location:'/'}).end();
  const first=new pg.Client(config),second=new pg.Client(config);config.password='';
  try {
    await first.connect();await second.connect();
    const emailA=process.env.QA_ACCOUNT_A_EMAIL, emailB=process.env.QA_ACCOUNT_B_EMAIL;
    if(!emailA||!emailB||emailA===emailB) throw new Error('fixture_accounts_missing');
    // Identifiers are read from configured disposable test accounts, never logged.
    const a=(await first.query('select id from auth.users where email=$1',[emailA])).rows[0]?.id;
    const b=(await first.query('select id from auth.users where email=$1',[emailB])).rows[0]?.id;
    if(!a||!b) throw new Error('fixture_accounts_missing');
    result=await runGroupConcurrency(first,second,a,b);
  } catch(error) {result={status:'Không hoàn tất',code:error.code||'TEST_FAILED',test:error.message?.includes(':')?error.message.split(':')[0].slice(0,100):'Xem kết nối hoặc phép kiểm tra; không hiển thị thông tin bí mật'};}
  finally {await Promise.allSettled([first.end(),second.end()]);first.password='';second.password='';running=false;await mkdir('test-results/group-management',{recursive:true});await writeFile('test-results/group-management/concurrency.json',JSON.stringify(result,null,2));}
});
server.listen(4319,'127.0.0.1',()=>console.log('PostgreSQL test form: '+origin));
