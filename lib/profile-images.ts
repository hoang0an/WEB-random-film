import {ACCOUNT_IMAGE_PIXEL_LIMIT,validateImageInput} from './account-types.ts';
import type {ImageKind} from './account-types.ts';

/** Reencoding removes metadata; private/demo images never enter public Next image caches. */
export async function prepareDemoImage(kind: ImageKind,file:File):Promise<Blob> {
  validateImageInput(file);
  await checkStaticImage(file);
  const bitmap=await createImageBitmap(file);
  try {
    if(bitmap.width*bitmap.height>ACCOUNT_IMAGE_PIXEL_LIMIT) throw new Error('Ảnh vượt quá 24 triệu pixel.');
    const width=kind==='avatar'?512:1600,height=kind==='avatar'?512:600;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');if(!context) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
    const scale=Math.max(width/bitmap.width,height/bitmap.height);
    const sw=width/scale,sh=height/scale;
    context.drawImage(bitmap,(bitmap.width-sw)/2,(bitmap.height-sh)/2,sw,sh,0,0,width,height);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Không thể xử lý ảnh.')),'image/webp',0.85));
  } finally {bitmap.close();}
}
async function checkStaticImage(file:File) {
  const bytes=new Uint8Array(await file.arrayBuffer());const view=new DataView(bytes.buffer);
  const text=(offset:number,length:number)=>String.fromCharCode(...bytes.slice(offset,offset+length));
  const invalid=()=>{throw new Error('Nội dung ảnh JPEG, PNG hoặc WebP không hợp lệ.');};
  const animated=()=>{throw new Error('Chỉ hỗ trợ ảnh tĩnh JPEG, PNG hoặc WebP.');};
  if(file.type==='image/jpeg') {if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255) invalid();return;}
  if(file.type==='image/png') {
    if(bytes.length<24||text(1,3)!=='PNG'||bytes[0]!==137) invalid();
    if(view.getUint32(16)*view.getUint32(20)>ACCOUNT_IMAGE_PIXEL_LIMIT) throw new Error('Ảnh vượt quá 24 triệu pixel.');
    for(let offset=8;offset+12<=bytes.length;) {
      const size=view.getUint32(offset);if(text(offset+4,4)==='acTL') animated();
      if(size>bytes.length-offset-12) invalid();offset+=size+12;
    }
  } else {
    if(bytes.length<12||text(0,4)!=='RIFF'||text(8,4)!=='WEBP') invalid();
    for(let offset=12;offset+8<=bytes.length;) {
      const size=view.getUint32(offset+4,true),chunk=text(offset,4);
      if(chunk==='ANIM'||chunk==='ANMF'||(chunk==='VP8X'&&bytes[offset+8]&2)) animated();
      if(size>bytes.length-offset-8) invalid();offset+=8+size+(size%2);
    }
  }
}
export type DemoImageStorage={put(path:string,blob:Blob):Promise<void>;get(path:string):Promise<Blob|null>};
export const demoImageStorage:DemoImageStorage={
  async put(path,blob){await transact('readwrite',store=>store.put(blob,path));},
  async get(path){return (await transact('readonly',store=>store.get(path)) as Blob|undefined)??null;}
};
async function transact(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest):Promise<unknown> {
  if(typeof indexedDB==='undefined') throw new Error('Trình duyệt không hỗ trợ lưu ảnh demo.');
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('tonight-cinema-account-images-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images');request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('Không thể mở kho ảnh demo.'));
    request.onblocked=()=>reject(new Error('Kho ảnh đang bị chặn bởi tab khác. Hãy đóng tab đó và thử lại.'));
  });
  try {return await new Promise((resolve,reject)=>{
    const transaction=db.transaction('images',mode);const request=operation(transaction.objectStore('images'));
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onerror=transaction.onabort=()=>reject(new Error('Không thể lưu hoặc đọc ảnh demo. Kiểm tra dung lượng trình duyệt.'));
  });} finally {db.close();}
}
