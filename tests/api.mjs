// Contract tests use mocked upstream responses; no Supabase/TMDB credentials needed.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { NextRequest } from 'next/server.js';
import assert from 'node:assert/strict';
const fixture = new URL('./.route-fixture.mjs', import.meta.url);
const source = await readFile('app/api/movies/route.ts','utf8');
const output = transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext,target:ScriptTarget.ES2022}}).outputText.replaceAll("'next/server'", "'next/server.js'");
await writeFile(fixture,output);
const originalFetch = globalThis.fetch;
const keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','TMDB_READ_ACCESS_TOKEN'];
const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
try {
  const {GET}=await import(fixture.href);
  const request=(params, token='test-user-token') => new NextRequest(`http://localhost/api/movies?${params}`,{headers: token ? {Authorization:`Bearer ${token}`} : {}});
  delete process.env.TMDB_READ_ACCESS_TOKEN;
  assert.equal((await GET(request('q=Barbie'))).status,503);
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://project.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-public-key';
  process.env.TMDB_READ_ACCESS_TOKEN='private-tmdb-test-token';
  assert.equal((await GET(request('q=Barbie',null))).status,401);
  let mode='success', calls=[];
  globalThis.fetch=async (input, options={}) => {
    const url=new URL(typeof input==='string' ? input : input instanceof URL ? input.href : input.url);
    calls.push({url,options});
    if(url.host==='project.test') {
      if(mode==='unauthorized') return Response.json({message:'Invalid token'},{status:401});
      return Response.json({id:'00000000-0000-0000-0000-000000000001',aud:'authenticated',email:'test@test.dev',app_metadata:{},user_metadata:{}});
    }
    assert.equal(url.host,'api.themoviedb.org');
    assert.equal(options.headers.Authorization,'Bearer private-tmdb-test-token');
    assert.equal(url.searchParams.get('include_adult'),'false');
    if(mode==='network') throw new TypeError('fetch failed');
    if(mode==='rate') return Response.json({}, {status:429});
    if(url.pathname.endsWith('/search/movie')) return Response.json({results:[{id:1,title:'Movie',release_date:'2020-01-01',adult:false},{id:2,title:'Adult',adult:true}]});
    return Response.json({id:1,title:'Movie',adult:mode==='adult',runtime:123,genres:[{id:35,name:'Phim Hài'}],overview:url.searchParams.get('language')==='en-US'?'English fallback':'',poster_path:null});
  };
  mode='unauthorized'; assert.equal((await GET(request('q=Movie'))).status,401);
  mode='success'; calls=[];
  let res=await GET(request('q=Movie')); let json=await res.json();
  assert.equal(res.status,200); assert.equal(json.movies.length,1);
  assert.equal(calls.at(-1).url.searchParams.get('language'),'vi-VN');
  assert.equal(calls.at(-1).url.searchParams.get('query'),'Movie');
  assert.ok(!JSON.stringify(json).includes('private-tmdb'));
  assert.equal((await GET(request('q=x'))).status,400);
  assert.equal((await GET(request('id=invalid'))).status,400);
  res=await GET(request('id=1')); json=await res.json();
  assert.equal(res.status,200); assert.equal(json.movies[0].overview,'English fallback');
  assert.equal(json.movies[0].runtime,123); assert.equal(json.movies[0].poster,null);
  assert.deepEqual(json.movies[0].genres,['Phim Hài']);
  mode='adult'; assert.equal((await GET(request('id=1'))).status,400);
  mode='rate'; res=await GET(request('q=Movie')); assert.equal(res.status,502); assert.match((await res.json()).error,/TMDB/);
  mode='network'; assert.equal((await GET(request('q=Movie'))).status,502);
  console.log('PASS: API configuration, auth, input validation, TMDB vi-VN/adult filtering, English fallback/runtime, private token, rate/network failure. (Mock upstream services.)');
} finally {
  globalThis.fetch=originalFetch;
  for(const k of keys) {if(old[k]===undefined) delete process.env[k]; else process.env[k]=old[k];}
  await unlink(fixture);
}
