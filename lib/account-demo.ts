import type {AccountProfile,AccountService,PersonalRating} from './account-types.ts';
import {normalizeAccountName} from './account-types.ts';
import type {Store} from './domain.ts';
import {demoUser} from './demo.ts';
import {demoImageStorage,prepareDemoImage} from './profile-images.ts';
import type {DemoImageStorage} from './profile-images.ts';
const key=(id:string)=>`tonight-cinema-account-v1:${id}`;
export function readDemoProfile(userId=demoUser.id):AccountProfile {
  const fallback={id:userId,name:userId===demoUser.id?demoUser.name:'Bạn',avatarPath:null,coverPath:null,revision:0};
  if(typeof localStorage==='undefined') return fallback;
  try {const raw=JSON.parse(localStorage.getItem(key(userId))??'null');
    if(!raw||raw.id!==userId||typeof raw.name!=='string'||!Number.isSafeInteger(raw.revision)||raw.revision<0) return fallback;
    return {id:userId,name:normalizeAccountName(raw.name),avatarPath:typeof raw.avatarPath==='string'&&raw.avatarPath.startsWith(`${userId}/avatar/`)?raw.avatarPath:null,coverPath:typeof raw.coverPath==='string'&&raw.coverPath.startsWith(`${userId}/cover/`)?raw.coverPath:null,revision:raw.revision};
  } catch{return fallback;}
}
type Options={getStore:()=>Store;onStoreChange:(next:Store)=>void|Promise<void>;userId:string;images?:DemoImageStorage;prepareImage?:typeof prepareDemoImage};
export function createDemoAccountService({getStore,onStoreChange,userId,images=demoImageStorage,prepareImage=prepareDemoImage}:Options):AccountService {
  const uploaded=new Set<string>();
  return {
    async getProfile(){return readDemoProfile(userId);},
    async updateProfile(update) {
      const write=async()=>{
        const current=readDemoProfile(userId);
        if(current.revision!==update.expectedRevision) throw new Error('Hồ sơ đã thay đổi ở tab khác. Hãy tải lại.');
        for(const [kind,asset] of [['avatar',update.avatarAssetId],['cover',update.coverAssetId]] as const) {
          if(asset!=null&&(!uploaded.has(asset)||!asset.startsWith(`${userId}/${kind}/`))) throw new Error('Ảnh không hợp lệ. Hãy tải ảnh lại.');
        }
        const next={...current,name:update.name===undefined?current.name:normalizeAccountName(update.name),avatarPath:update.avatarAssetId===undefined?current.avatarPath:update.avatarAssetId,coverPath:update.coverAssetId===undefined?current.coverPath:update.coverAssetId,revision:current.revision+1};
        const store=getStore();
        const renamed={...store,groups:store.groups.map(g=>({...g,members:g.members.map(p=>p.id===userId?{...p,name:next.name}:p),movies:g.movies.map(m=>m.addedBy===userId?{...m,addedName:next.name}:m),ratings:g.ratings.map(r=>r.userId===userId?{...r,name:next.name}:r),comments:g.comments.map(c=>c.userId===userId?{...c,name:next.name}:c)}))};
        if(typeof localStorage==='undefined') throw new Error('Không thể lưu hồ sơ demo trong trình duyệt này.');
        let previous:string|null;
        try {previous=localStorage.getItem(key(userId));localStorage.setItem(key(userId),JSON.stringify(next));} catch {throw new Error('Không thể lưu hồ sơ demo. Kiểm tra dung lượng trình duyệt.');}
        try {await onStoreChange(renamed);} catch {
          try {
            if(previous===null) localStorage.removeItem(key(userId));
            else localStorage.setItem(key(userId),previous);
          } catch {throw new Error('Chưa xác nhận được hồ sơ demo đã lưu. Hãy tải lại và kiểm tra trước khi thử lại.');}
          throw new Error('Không thể lưu hồ sơ demo. Kiểm tra dung lượng trình duyệt.');
        }
        return next;
      };
      // Serialize same-origin tabs where Web Locks is available; reread revision inside the lock.
      if(typeof navigator!=='undefined'&&navigator.locks) return navigator.locks.request(key(userId),async()=>write());
      return write();
    },
    async listRatings(cursor) {
      const items:PersonalRating[]=getStore().groups.flatMap(g=>g.ratings.filter(r=>r.userId===userId).flatMap(r=>{
        const movie=g.movies.find(m=>m.entryId===r.entryId);return movie?[{id:movie.entryId,tmdbId:movie.id,title:movie.title,year:movie.year,poster:movie.poster,score:r.score,isCurrentMember:g.members.some(m=>m.id===userId)}]:[];
      }));
      const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
      items.sort((a,b)=>compare(a.title,b.title)||compare(a.id,b.id));
      const remaining=cursor?items.filter(r=>compare(r.title,cursor.title)>0||(r.title===cursor.title&&compare(r.id,cursor.id)>0)):items;
      const page=remaining.slice(0,20),last=page.at(-1);
      return {items:page,nextCursor:remaining.length>20&&last?{title:last.title,id:last.id}:null};
    },
    async uploadImage(kind,file) {
      const blob=await prepareImage(kind,file);const assetId=`${userId}/${kind}/${crypto.randomUUID()}.webp`;
      await images.put(assetId,blob);uploaded.add(assetId);return {assetId};
    },
    async resolveImage(kind,path) {
      if(!path.startsWith(`${userId}/${kind}/`)) return null;
      const current=readDemoProfile(userId);if(path!==current[kind==='avatar'?'avatarPath':'coverPath']) return null;
      const blob=await images.get(path);
      if(path!==readDemoProfile(userId)[kind==='avatar'?'avatarPath':'coverPath']) return null;
      return blob?URL.createObjectURL(blob):null;
    }
  };
}
