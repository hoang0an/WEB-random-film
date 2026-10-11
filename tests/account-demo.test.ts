import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoAccountService,readDemoProfile} from '../lib/account-demo.ts';
import {initialStore} from '../lib/demo.ts';
import {prepareDemoImage,demoImageStorage} from '../lib/profile-images.ts';
const data=new Map<string,string>();
// Node's experimental lock manager can keep a rejected synchronous callback locked.
// Browser tab coordination is covered separately with a deterministic lock adapter.
Object.defineProperty(globalThis.navigator,'locks',{value:undefined,configurable:true});
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)},configurable:true});
test('demo persists profile, CAS rejects stale tab, updates own name projections',async()=>{
 data.clear();let store=initialStore();store.groups[0].ratings=[{entryId:store.groups[0].movies[0].entryId,userId:'demo-you',name:'Bạn',score:7}];
 const s=createDemoAccountService({getStore:()=>store,onStoreChange:next=>{store=next;},userId:'demo-you'});
 const profile=await s.updateProfile({name:'  An  ',expectedRevision:0});
 assert.equal(profile.revision,1);assert.equal(readDemoProfile().name,'An');assert.equal(store.groups[0].ratings[0].name,'An');
 await assert.rejects(s.updateProfile({name:'Stale',expectedRevision:0}),/thay đổi|tải lại/i);
});
test('demo derives own ratings after leave and exposes only allowlisted fields',async()=>{
 data.clear();const store=initialStore();const g=store.groups[0];g.members=g.members.filter(m=>m.id!=='demo-you');
 g.ratings=[{entryId:g.movies[0].entryId,userId:'demo-you',name:'Bạn',score:7},{entryId:g.movies[1].entryId,userId:'demo-minh',name:'Minh',score:9}];
 const s=createDemoAccountService({getStore:()=>store,onStoreChange:()=>{},userId:'demo-you'});
 const page=await s.listRatings();assert.equal(page.items.length,1);assert.equal(page.items[0].isCurrentMember,false);
 assert.deepEqual(Object.keys(page.items[0]).sort(),['id','isCurrentMember','poster','score','title','tmdbId','year']);
});
test('pagination keeps duplicate films as separate entries, binary titles and stable cursors',async()=>{
 data.clear();const store=initialStore();const g=store.groups[0],movie=g.movies[0];
 g.movies=Array.from({length:23},(_,i)=>({...movie,title:i<22?'Same':'é',entryId:`entry-${String(i).padStart(2,'0')}`}));
 g.ratings=g.movies.map(m=>({entryId:m.entryId,userId:'demo-you',name:'Bạn',score:8}));
 const s=createDemoAccountService({getStore:()=>store,onStoreChange:()=>{},userId:'demo-you'});
 const first=await s.listRatings(),second=await s.listRatings(first.nextCursor);
 assert.equal(first.items.length,20);assert.equal(second.items.length,3);assert.equal(second.nextCursor,null);
 assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,23);assert.equal(second.items.at(-1)?.title,'é');
});
test('failed persistence does not report success or change name projections',async()=>{
 data.clear();let changed=false;
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage')!;
 Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null,setItem:()=>{throw new Error('quota');}},configurable:true});
 try {
   const s=createDemoAccountService({getStore:initialStore,onStoreChange:()=>{changed=true;},userId:'demo-you'});
   await assert.rejects(s.updateProfile({expectedRevision:0,name:'An'}),/Không thể lưu/);assert.equal(changed,false);
 } finally {Object.defineProperty(globalThis,'localStorage',descriptor);}
});

test('failed group persistence restores the exact prior profile and revision',async()=>{
 for(const previous of [null,JSON.stringify({id:'demo-you',name:'Old',avatarPath:null,coverPath:null,revision:4})]) {
   data.clear();const storageKey='tonight-cinema-account-v1:demo-you';if(previous!==null)data.set(storageKey,previous);
   const store=initialStore(),before=structuredClone(store),revision=readDemoProfile().revision;
   const s=createDemoAccountService({getStore:()=>store,onStoreChange:()=>{throw new Error('group quota');},userId:'demo-you'});
   await assert.rejects(s.updateProfile({name:'New',expectedRevision:revision}),/Không thể lưu/);
   assert.equal(data.get(storageKey)??null,previous);assert.equal(readDemoProfile().revision,revision);assert.deepEqual(store,before);
 }
});

test('asynchronous group persistence failure cannot claim profile success',async()=>{
 data.clear();const s=createDemoAccountService({getStore:initialStore,onStoreChange:async()=>{await Promise.resolve();throw new Error('quota');},userId:'demo-you'});
 await assert.rejects(s.updateProfile({name:'New',expectedRevision:0}),/Không thể lưu/);assert.equal(readDemoProfile().revision,0);
});

test('demo image removed while blob storage is loading cannot return a stale URL',async()=>{
 data.clear();const options={getStore:initialStore,onStoreChange:()=>{},userId:'demo-you',prepareImage:async()=>new Blob(['sanitized'])};
 const images={put:async()=>{},get:async()=>{await s.updateProfile({expectedRevision:1,avatarAssetId:null});return new Blob(['stored']);}};
 const s=createDemoAccountService({...options,images});const upload=await s.uploadImage('avatar',new File(['x'],'a.png',{type:'image/png'}));
 await s.updateProfile({expectedRevision:0,avatarAssetId:upload.assetId});assert.equal(await s.resolveImage('avatar',upload.assetId),null);
});
test('corrupted legacy profile uses defaults without destroying group data',()=>{
 data.clear();data.set('tonight-cinema-account-v1:demo-you','bad JSON');assert.equal(readDemoProfile().name,'Bạn');
 data.set('tonight-cinema-account-v1:demo-you',JSON.stringify({id:'demo-you',name:'An',revision:2,avatarPath:'blob:stale',coverPath:'other/cover/secret'}));
 assert.deepEqual(readDemoProfile(),{id:'demo-you',name:'An',revision:2,avatarPath:null,coverPath:null});
});
test('demo stores blobs and recreates URLs after reload, enforces owner kind and current pointer',async()=>{
 data.clear();const blobs=new Map<string,Blob>();const images={put:async(key:string,blob:Blob)=>{blobs.set(key,blob);},get:async(key:string)=>blobs.get(key)??null};
 const options={getStore:initialStore,onStoreChange:()=>{},userId:'demo-you',images,prepareImage:async()=>new Blob(['sanitized'],{type:'image/webp'})};
 const s=createDemoAccountService(options),upload=await s.uploadImage('avatar',new File(['a'],'a.png',{type:'image/png'}));
 assert.equal(await s.resolveImage('avatar',upload.assetId),null);
 await s.updateProfile({expectedRevision:0,avatarAssetId:upload.assetId});
 const reloaded=createDemoAccountService(options),url=await reloaded.resolveImage('avatar',upload.assetId);
 assert.match(url??'',/^blob:/);assert.ok(!JSON.stringify(readDemoProfile()).includes('blob:'));URL.revokeObjectURL(url!);
 assert.equal(await reloaded.resolveImage('cover',upload.assetId),null);
 await assert.rejects(reloaded.updateProfile({expectedRevision:1,avatarAssetId:'other/avatar/x.webp'}),/không hợp lệ/i);
 await reloaded.updateProfile({expectedRevision:1,avatarAssetId:null});assert.equal(await reloaded.resolveImage('avatar',upload.assetId),null);
});
test('demo image reencodes cropped WebP and closes decoded bitmap on errors',async()=>{
 let closed=0;let size={width:1000,height:700};let draw:unknown[]=[];
 const previousBitmap=globalThis.createImageBitmap,previousDocument=globalThis.document;
 Object.defineProperty(globalThis,'createImageBitmap',{value:async()=>({...size,close:()=>{closed++;}}),configurable:true,writable:true});
 Object.defineProperty(globalThis,'document',{value:{createElement:()=>({getContext:()=>({drawImage:(...args:unknown[])=>{draw=args;}}),toBlob:(cb:(b:Blob)=>void,type:string)=>cb(new Blob(['stripped'],{type}))})},configurable:true,writable:true});
 try {
   const png=new Uint8Array(33);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(8,13);png.set([73,72,68,82],12);new DataView(png.buffer).setUint32(16,1000);new DataView(png.buffer).setUint32(20,700);
   const file=new File([png],'a.png',{type:'image/png'});
   const result=await prepareDemoImage('cover',file);assert.equal(result.type,'image/webp');assert.deepEqual(draw.slice(-2),[1600,600]);
   size={width:10000,height:10000};await assert.rejects(prepareDemoImage('avatar',file),/24 triệu/);assert.equal(closed,2);
   await assert.rejects(prepareDemoImage('avatar',new File(['x'],'x.svg',{type:'image/svg+xml'})),/JPEG/);
   await assert.rejects(prepareDemoImage('avatar',new File(['bad'],'x.png',{type:'image/png'})),/không hợp lệ/);
   const animated=new Uint8Array(45);animated.set(png);animated.set([97,99,84,76],37);
   await assert.rejects(prepareDemoImage('avatar',new File([animated],'x.png',{type:'image/png'})),/ảnh tĩnh/);
 } finally {Object.defineProperty(globalThis,'createImageBitmap',{value:previousBitmap,writable:true,configurable:true});Object.defineProperty(globalThis,'document',{value:previousDocument,writable:true,configurable:true});}
});
test('IndexedDB adapter commits blobs, reads absent images and reports transaction quota failures',async()=>{
 const original=globalThis.indexedDB;const blobs=new Map<string,Blob>();let fail=false,closed=0;
 const db={createObjectStore:()=>{},close:()=>{closed++;},transaction:()=>{
   const tx:{oncomplete?:()=>void;onabort?:()=>void;onerror?:()=>void;objectStore:()=>unknown}={objectStore:()=>({put:(blob:Blob,key:string)=>{blobs.set(key,blob);return {result:key};},get:(key:string)=>({result:blobs.get(key)})})};
   setTimeout(()=>{if(fail)tx.onabort?.();else tx.oncomplete?.();},0);return tx;
 }};
 Object.defineProperty(globalThis,'indexedDB',{value:{open:()=>{
   const request:{result:typeof db;onupgradeneeded?:()=>void;onsuccess?:()=>void}={result:db};
   setTimeout(()=>{request.onupgradeneeded?.();request.onsuccess?.();},0);return request;
 }},configurable:true});
 try {const blob=new Blob(['stored']);await demoImageStorage.put('a',blob);assert.equal(await demoImageStorage.get('a'),blob);assert.equal(await demoImageStorage.get('missing'),null);
   fail=true;await assert.rejects(demoImageStorage.put('a',blob),/dung lượng/);assert.equal(closed,4);
 } finally {Object.defineProperty(globalThis,'indexedDB',{value:original,configurable:true});}
});
test('tab write obtains a profile lock and rereads revision inside lock',async()=>{
 data.clear();let requested='';
 Object.defineProperty(navigator,'locks',{value:{request:async(name:string,callback:()=>Promise<unknown>)=>{requested=name;return callback();}},configurable:true});
 try {
   const s=createDemoAccountService({getStore:initialStore,onStoreChange:()=>{},userId:'demo-you'});
   await s.updateProfile({expectedRevision:0,name:'An'});assert.equal(requested,'tonight-cinema-account-v1:demo-you');
   await assert.rejects(s.updateProfile({expectedRevision:0,name:'Stale'}),/thay đổi/);
 } finally {Object.defineProperty(navigator,'locks',{value:undefined,configurable:true});}
});
