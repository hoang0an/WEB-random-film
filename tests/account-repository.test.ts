import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveAccountService} from '../lib/account-repository.ts';
function builder(operation:()=>Promise<unknown>) {return {setHeader(_name:string,_value:string){return this;},abortSignal:operation};}
function mockImageFetch(operation:(input:string,init:RequestInit)=>Promise<Response>) {
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>typeof input==='string'&&input.startsWith('/api/account/images?')?operation(input,init??{}):original(input,init);
  return ()=>{globalThis.fetch=original;};
}
function fixture() {
  const calls: {name:string; args:unknown}[]=[];
  let actor='a';
  const profile={id:'a',name:'An',avatar_path:null,cover_path:null,revision:0};
  const client={auth:{getUser:async()=>({data:{user:{id:actor}},error:null}),getSession:async()=>({data:{session:{user:{id:actor},access_token:'jwt'}},error:null})},
    rpc:(name:string,args:unknown)=>{calls.push({name,args});return builder(async()=>({data:name==='list_my_ratings'?{items:[{id:'e',tmdb_id:1,title:'Film',year:'2026',poster:null,score:8,is_current_member:false}],next_cursor:null}:profile,error:null}));},
    storage:{from:()=>{throw new Error('Direct Storage must never be used');}}};
  return {client,calls,setActor:(id:string)=>{actor=id;}};
}
test('live maps owner projection, ratings and private authenticated blobs without signing',async()=>{
 const f=fixture(); const s=createLiveAccountService(f.client as never);
 assert.deepEqual(await s.getProfile(),{id:'a',name:'An',avatarPath:null,coverPath:null,revision:0});
 assert.equal((await s.listRatings()).items[0].isCurrentMember,false);
 assert.deepEqual(f.calls[1],{name:'list_my_ratings',args:{p_limit:20,p_cursor_title:null,p_cursor_id:null}});
 const restore=mockImageFetch(async(input,init)=>{assert.equal(input,'/api/account/images?kind=cover&path=a%2Ffile.webp');assert.equal(init.method,'GET');assert.equal((init.headers as Record<string,string>).Authorization,'Bearer jwt');assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.ok(init.signal instanceof AbortSignal);return new Response('private',{headers:{'Content-Type':'image/webp'}});});
 try {const url=await s.resolveImage('cover','a/file.webp');assert.match(url??'',/^blob:/);assert.equal(await (await fetch(url!)).text(),'private');URL.revokeObjectURL(url!);}finally{restore();}
});
test('service rejects account switches and does not submit a mutation',async()=>{
 const f=fixture();const s=createLiveAccountService(f.client as never);await s.getProfile();f.setActor('b');
 await assert.rejects(s.updateProfile({name:'New',expectedRevision:0}),/tài khoản|phiên/i);
 assert.equal(f.calls.length,1);
});
test('name update passes explicit asset change flags',async()=>{
 const f=fixture(); const s=createLiveAccountService(f.client as never);
 await s.updateProfile({name:'  An  ',expectedRevision:0,avatarAssetId:null});
 assert.deepEqual(f.calls[0],{name:'update_my_account',args:{p_name:'An',p_avatar_asset:null,p_cover_asset:null,p_change_avatar:true,p_change_cover:false,p_expected_revision:0}});
});
test('upload sends the raw file with current JWT and rejects a switched account after response',async()=>{
 const f=fixture(),s=createLiveAccountService(f.client as never),original=globalThis.fetch;let switchAfter=false;
 globalThis.fetch=async(input,init)=>{
   assert.equal(input,'/api/account/images?kind=avatar');assert.equal(init?.method,'POST');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer jwt');assert.ok(init?.body instanceof File);
   if(switchAfter) f.setActor('b');return new Response(JSON.stringify({assetId:'asset'}),{status:200});
 };
 try {const file=new File(['x'],'x.png',{type:'image/png'});assert.deepEqual(await s.uploadImage('avatar',file),{assetId:'asset'});
   switchAfter=true;await assert.rejects(s.uploadImage('avatar',file),/Tài khoản/);
 } finally {globalThis.fetch=original;}
});
test('upload rejects invalid input before network and maps status errors',async()=>{
 const f=fixture(),s=createLiveAccountService(f.client as never),original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:'limit'}),{status:413});};
 try {await assert.rejects(s.uploadImage('cover',new File(['x'],'x.svg',{type:'image/svg+xml'})),/JPEG/);assert.equal(calls,0);
   await assert.rejects(s.uploadImage('cover',new File(['x'],'x.png',{type:'image/png'})),/3 MiB/);
 } finally {globalThis.fetch=original;}
});
test('revision conflicts are readable and mutations are not retried',async()=>{
 const f=fixture();let mutations=0;
 f.client.rpc=((name:string,args:unknown)=>{f.calls.push({name,args});mutations++;return builder(async()=>({data:null,error:{message:'revision_conflict'}}));});
 const s=createLiveAccountService(f.client as never);await assert.rejects(s.updateProfile({expectedRevision:0,name:'An'}),/tab khác/);assert.equal(mutations,1);
});
test('network-lost mutation reconciles exact new pointers once and never replays',async()=>{
 const f=fixture();let writes=0;
 f.client.rpc=((name:string,args:unknown)=>builder(async()=>{
   f.calls.push({name,args});if(name==='update_my_account'){writes++;throw new TypeError('fetch failed');}
   return {data:{id:'a',name:'New',revision:1,avatar_path:'a/avatar/asset.webp',cover_path:null},error:null};
 }));
 const s=createLiveAccountService(f.client as never);
 const current=await s.updateProfile({expectedRevision:0,name:'New',avatarAssetId:'asset'});
 assert.equal(current.avatarPath,'a/avatar/asset.webp');assert.equal(writes,1);assert.equal(f.calls.length,2);
});
test('unmatched reconciliation exposes uncertain outcome without claiming saved',async()=>{
 const f=fixture();let writes=0;
 f.client.rpc=((name:string)=>builder(async()=>{
   if(name==='update_my_account'){writes++;throw new TypeError('network failed');}
   return {data:{id:'a',name:'Other',revision:2,avatar_path:null,cover_path:null},error:null};
 }));
 await assert.rejects(createLiveAccountService(f.client as never).updateProfile({expectedRevision:0,name:'New'}),/Chưa xác nhận/);assert.equal(writes,1);
});
test('late read or update cannot deliver another account response',async()=>{
 const f=fixture();f.client.rpc=(()=>builder(async()=>{f.setActor('b');return {data:{id:'a',name:'An',revision:0},error:null};}));
 await assert.rejects(createLiveAccountService(f.client as never).getProfile(),/Tài khoản/);
});
test('RPC pins verified actor token rather than mutable SDK session',async()=>{
 const f=fixture();let pinned='';f.client.rpc=()=>({setHeader(name:string,value:string){assert.equal(name,'Authorization');pinned=value;return this;},abortSignal:async()=>({data:{id:'a',name:'An',revision:0},error:null})});
 await createLiveAccountService(f.client as never).updateProfile({expectedRevision:0,name:'New'});assert.equal(pinned,'Bearer jwt');
});
test('peer image download failure returns fallback, auth failure still rejects',async()=>{
 const f=fixture();const restore=mockImageFetch(async()=>new Response(null,{status:403}));
 try {
  const s=createLiveAccountService(f.client as never);assert.equal(await s.resolveImage('avatar','peer/avatar/private.webp'),null);
  f.setActor('b');await assert.rejects(s.resolveImage('avatar','peer/avatar/private.webp'),/Tài khoản/);
 }finally{restore();}
});

test('switch during token acquisition never submits the original edit with a new actor token',async()=>{
 const f=fixture();f.client.auth.getSession=async()=>{f.setActor('b');return {data:{session:{user:{id:'b'},access_token:'jwt-b'}},error:null};};
 await assert.rejects(createLiveAccountService(f.client as never).updateProfile({name:'New',expectedRevision:0}),/Phiên|Tài khoản/);assert.equal(f.calls.length,0);
});

test('late downloaded blob cannot deliver after an actor switch and revokes its URL',async()=>{
 const f=fixture();let revoked='';const revoke=URL.revokeObjectURL;
 URL.revokeObjectURL=url=>{revoked=url;revoke(url);};
 const restore=mockImageFetch(async()=>new Response(new ReadableStream({start(controller){f.setActor('b');controller.enqueue(new TextEncoder().encode('private'));controller.close();}}),{headers:{'Content-Type':'image/webp'}}));
 try {await assert.rejects(createLiveAccountService(f.client as never).resolveImage('cover','a/cover/private.webp'),/Tài khoản/);assert.match(revoked,/^blob:/);}
 finally {URL.revokeObjectURL=revoke;restore();}
});

test('download rejects an expired JWT while permission denial keeps the image fallback',async()=>{
 const f=fixture();const restore=mockImageFetch(async()=>new Response(null,{status:401}));
 try {await assert.rejects(createLiveAccountService(f.client as never).resolveImage('avatar','peer/avatar/private.webp'),/Phiên đăng nhập đã hết hạn/);}finally{restore();}
});

test('switch during image token acquisition does not submit a download with another actor token',async()=>{
 const f=fixture();let downloads=0;const restore=mockImageFetch(async()=>{downloads++;return new Response('x',{headers:{'Content-Type':'image/webp'}});});
 f.client.auth.getSession=async()=>{f.setActor('b');return {data:{session:{user:{id:'b'},access_token:'jwt-b'}},error:null};};
 try {await assert.rejects(createLiveAccountService(f.client as never).resolveImage('avatar','a/avatar/x.webp'),/Phiên|Tài khoản/);assert.equal(downloads,0);}finally{restore();}
});

test('missing authenticated image uses fallback',async()=>{
 const f=fixture();const restore=mockImageFetch(async()=>new Response(null,{status:404}));
 try {assert.equal(await createLiveAccountService(f.client as never).resolveImage('avatar','a/avatar/missing.webp'),null);}finally{restore();}
});

test('image upload status 401 maps to the session-expired error',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({error:'unrecognized error'}),{status:401});
 try {await assert.rejects(createLiveAccountService(fixture().client as never).uploadImage('avatar',new File(['x'],'x.png',{type:'image/png'})),/Phiên đăng nhập đã hết hạn/);}
 finally {globalThis.fetch=original;}
});

test('mismatched profile identity cannot be accepted as a successful update',async()=>{
 const f=fixture();f.client.rpc=()=>builder(async()=>({data:{id:'b',name:'New',revision:1},error:null}));
 await assert.rejects(createLiveAccountService(f.client as never).updateProfile({name:'New',expectedRevision:0}),/Tài khoản/);
});


test('proxy image query encodes the entire path without adding injected parameters',async()=>{
 const path='a/avatar/x.webp?kind=cover&path=other#fragment';
 const restore=mockImageFetch(async(input)=>{const url=new URL(input,'https://preview.invalid');assert.deepEqual([...url.searchParams], [['kind','avatar'],['path',path]]);return new Response(null,{status:404});});
 try {assert.equal(await createLiveAccountService(fixture().client as never).resolveImage('avatar',path),null);}finally{restore();}
});
test('proxy rejects server failures and invalid success bodies without creating blob URLs',async()=>{
 let response=new Response('upstream internal detail',{status:503});let creates=0;const create=URL.createObjectURL;
 URL.createObjectURL=(blob)=>{creates++;return create(blob);};
 const restore=mockImageFetch(async()=>response);
 try {
  for(const candidate of [response,new Response('<html>private</html>',{headers:{'Content-Type':'text/html'}}),new Response('x',{headers:{'Content-Type':'image/png'}}),new Response(new Uint8Array(3*1024*1024+1),{headers:{'Content-Type':'image/webp'}}),new Response(null,{headers:{'Content-Type':'image/webp'}})]) {
   response=candidate;await assert.rejects(createLiveAccountService(fixture().client as never).resolveImage('avatar','a/avatar/x.webp'),/Không thể tải ảnh|Phản hồi ảnh không hợp lệ/);assert.equal(creates,0);
  }
 }finally{restore();URL.createObjectURL=create;}
});

test('logout during final actor verification discards the image URL',async()=>{
 const f=fixture();let verifications=0;let revoked='';const revoke=URL.revokeObjectURL;
 f.client.auth.getUser=async()=>{verifications++;if(verifications===2)f.setActor('');return {data:{user:{id:verifications===1?'a':''}},error:null};};
 URL.revokeObjectURL=url=>{revoked=url;revoke(url);};
 const restore=mockImageFetch(async()=>new Response('private',{headers:{'Content-Type':'image/webp'}}));
 try {await assert.rejects(createLiveAccountService(f.client as never).resolveImage('avatar','a/avatar/x.webp'),/Phiên đăng nhập đã hết hạn/);assert.match(revoked,/^blob:/);}
 finally{restore();URL.revokeObjectURL=revoke;}
});

test('image body arriving after an actor switch cannot be delivered',async()=>{
 const f=fixture();let finish!:(blob:Blob)=>void;let bodyStarted!:()=>void;
 const started=new Promise<void>(resolve=>{bodyStarted=resolve;});
 const restore=mockImageFetch(async()=>({ok:true,status:200,headers:new Headers({'Content-Type':'image/webp'}),blob:()=>{bodyStarted();return new Promise<Blob>(resolve=>{finish=resolve;});}} as Response));
 try {const pending=createLiveAccountService(f.client as never).resolveImage('avatar','a/avatar/x.webp');await started;f.setActor('b');finish(new Blob(['private'],{type:'image/webp'}));await assert.rejects(pending,/Tài khoản/);}
 finally{restore();}
});

test('oversized or malformed advertised length rejects before reading the body',async()=>{
 let length='3145729';let reads=0;
 const restore=mockImageFetch(async()=>({ok:true,status:200,headers:new Headers({'Content-Type':'image/webp','Content-Length':length}),blob:async()=>{reads++;return new Blob(['x']);}} as Response));
 try {for(const value of ['3145729','Infinity','-1','garbage']){length=value;await assert.rejects(createLiveAccountService(fixture().client as never).resolveImage('cover','a/cover/x.webp'),/Phản hồi ảnh không hợp lệ/);}assert.equal(reads,0);}
 finally{restore();}
});
test('image body timeout aborts transport and a late body never creates a blob URL',async()=>{
 const nativeTimeout=globalThis.setTimeout,create=URL.createObjectURL;let creates=0;let signal:AbortSignal|undefined;let finish!:()=>void;
 globalThis.setTimeout=((callback:()=>void,_ms?:number,...args:unknown[])=>nativeTimeout(callback,15,...args)) as typeof setTimeout;
 URL.createObjectURL=(blob)=>{creates++;return create(blob);};
 const restore=mockImageFetch(async(_input,init)=>{signal=init.signal as AbortSignal;return {ok:true,status:200,headers:new Headers({'Content-Type':'image/webp'}),blob:async()=>{await new Promise<void>(resolve=>{finish=resolve;});return new Blob(['private'],{type:'image/webp'});}} as Response;});
 try {await assert.rejects(createLiveAccountService(fixture().client as never).resolveImage('avatar','a/avatar/x.webp'),/request_timeout/);assert.equal(signal?.aborted,true);finish();await new Promise(resolve=>nativeTimeout(resolve,5));assert.equal(creates,0);}
 finally{restore();globalThis.setTimeout=nativeTimeout;URL.createObjectURL=create;}
});
