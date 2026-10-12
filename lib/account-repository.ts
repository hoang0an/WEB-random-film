import type {SupabaseClient} from '@supabase/supabase-js';
import type {AccountProfile, AccountService, AccountUpdate, ImageKind, PersonalRating} from './account-types.ts';
import {ACCOUNT_IMAGE_LIMIT, normalizeAccountName, validateImageInput} from './account-types.ts';
import {RequestTimeoutError, withRequestDeadline} from './request-deadline.ts';
import {readableError} from './repository-errors.ts';

export function accountError(error: unknown): Error {
  const message=error instanceof Error ? error.message : String((error as {message?:string})?.message ?? error);
  if (/revision_conflict|stale_revision/i.test(message)) return new Error('Hồ sơ đã thay đổi ở tab khác. Hãy tải lại trước khi lưu.');
  if (/invalid_asset|asset_not|image_asset/i.test(message)) return new Error('Ảnh không còn hợp lệ. Hãy chọn và tải ảnh lại.');
  if (/invalid_name/i.test(message)) return new Error('Tên cần từ 1 đến 80 ký tự.');
  if (/unauthorized|jwt|auth_required/i.test(message)) return new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  return new Error(readableError(error));
}
function profile(raw: Record<string,unknown>): AccountProfile {
  if (!raw || typeof raw.id!=='string' || typeof raw.name!=='string' || !Number.isSafeInteger(raw.revision)) throw new Error('Phản hồi hồ sơ không hợp lệ.');
  return {id:raw.id,name:raw.name,avatarPath:typeof raw.avatar_path==='string'?raw.avatar_path:null,coverPath:typeof raw.cover_path==='string'?raw.cover_path:null,revision:raw.revision as number};
}
export function createLiveAccountService(client: SupabaseClient): AccountService {
  let actor: string | null=null;
  async function checkActor() {
    const result=await withRequestDeadline(()=>client.auth.getUser(),10000);
    const id=result.data.user?.id;
    if (result.error || !id) throw new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
    if (actor && actor!==id) throw new Error('Tài khoản đã thay đổi. Hãy mở lại hồ sơ.');
    actor=id;return id;
  }
  async function rpc(name:string,args:Record<string,unknown>,mutation=false) {
    await checkActor();
    const {data:sessionData,error:sessionError}=await withRequestDeadline(()=>client.auth.getSession(),10000);
    if(sessionError||!sessionData.session||sessionData.session.user.id!==actor) throw new Error('Phiên đăng nhập đã thay đổi. Hãy mở lại hồ sơ.');
    // The SDK normally reads the mutable session when fetch starts. Pin this
    // actor's token so a switch cannot submit the pending edit as another user.
    const token=sessionData.session.access_token;
    const {data,error}=await withRequestDeadline(signal=>client.rpc(name,args).setHeader('Authorization',`Bearer ${token}`).abortSignal(signal),mutation?15000:10000);
    await checkActor();
    if(error) throw accountError(error);
    return data;
  }
  async function getProfile() {const value=profile(await rpc('get_my_account',{}));if(value.id!==actor) throw new Error('Tài khoản đã thay đổi.');return value;}
  return {
    getProfile,
    async updateProfile(update:AccountUpdate) {
      const name=update.name===undefined?null:normalizeAccountName(update.name);
      if(!Number.isSafeInteger(update.expectedRevision)||update.expectedRevision<0) throw new Error('Hãy tải lại hồ sơ trước khi lưu.');
      const args={p_name:name,p_avatar_asset:update.avatarAssetId??null,p_cover_asset:update.coverAssetId??null,p_change_avatar:update.avatarAssetId!==undefined,p_change_cover:update.coverAssetId!==undefined,p_expected_revision:update.expectedRevision};
      try {const value=profile(await rpc('update_my_account',args,true));if(value.id!==actor) throw new Error('Tài khoản đã thay đổi. Hãy mở lại hồ sơ.');return value;}
      catch(error) {
        // Never replay a write: the server might have committed it before transport failed.
        if(error instanceof RequestTimeoutError || /fetch|network|Không thể kết nối/i.test(String(error))) {
          try {
            const current=await getProfile();
            const imageMatches=(kind:ImageKind,asset:string|null|undefined)=>asset===undefined || (asset===null?current[kind==='avatar'?'avatarPath':'coverPath']===null:current[kind==='avatar'?'avatarPath':'coverPath']?.split('/').at(-1)?.split('.')[0]===asset);
            if(current.revision===update.expectedRevision+1 && (name===null||current.name===name) && imageMatches('avatar',update.avatarAssetId)&&imageMatches('cover',update.coverAssetId)) return current;
          } catch {/* Surface uncertain outcome below; keep the original pointer in the UI. */}
          throw new Error('Chưa xác nhận được hồ sơ đã lưu. Hãy tải lại và kiểm tra trước khi thử lại.');
        }
        throw accountError(error);
      }
    },
    async listRatings(cursor) {
      const raw=await rpc('list_my_ratings',{p_limit:20,p_cursor_title:cursor?.title??null,p_cursor_id:cursor?.id??null});
      if(!raw || !Array.isArray(raw.items)) throw new Error('Phản hồi điểm cá nhân không hợp lệ.');
      const items:PersonalRating[]=raw.items.map((r:Record<string,unknown>)=>({id:String(r.id),tmdbId:Number(r.tmdb_id),title:String(r.title),year:String(r.year??''),poster:typeof r.poster==='string'?r.poster:null,score:Number(r.score),isCurrentMember:r.is_current_member===true}));
      return {items,nextCursor:raw.next_cursor?{title:String(raw.next_cursor.title),id:String(raw.next_cursor.id)}:null};
    },
    async uploadImage(kind,file) {
      validateImageInput(file);await checkActor();
      return withRequestDeadline(async signal=>{
        const {data,error}=await client.auth.getSession();
        if(error||!data.session||data.session.user.id!==actor) throw new Error('Phiên đăng nhập đã thay đổi.');
        const response=await fetch(`/api/account/images?kind=${kind}`,{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':file.type},body:file,signal,credentials:'same-origin'});
        const result=await response.json();await checkActor();
        if(!response.ok) throw accountError(new Error(response.status===401?'auth_required':response.status===413?'Ảnh cần nhỏ hơn hoặc bằng 3 MiB.':response.status===429?'Bạn tải ảnh quá nhanh. Hãy đợi một chút.':response.status===503?'Dịch vụ ảnh chưa sẵn sàng. Hãy thử lại sau.':result.error||'Không thể tải ảnh.'));
        if(typeof result.assetId!=='string'||!result.assetId) throw new Error('Phản hồi tải ảnh không hợp lệ.');
        return {assetId:result.assetId};
      });
    },
    async resolveImage(kind,path) {
      await checkActor();
      const {data:sessionData,error:sessionError}=await withRequestDeadline(()=>client.auth.getSession(),10000);
      if(sessionError||!sessionData.session||sessionData.session.user.id!==actor) throw new Error('Phiên đăng nhập đã thay đổi. Hãy mở lại hồ sơ.');
      // Pin the verified actor token. The server checks live permissions for
      // this exact asset; browser Storage paths never grant read capabilities.
      const token=sessionData.session.access_token;
      const query=new URLSearchParams({kind,path});
      const blob=await withRequestDeadline(async signal=>{
        const response=await fetch(`/api/account/images?${query}`,{method:'GET',headers:{Authorization:`Bearer ${token}`},credentials:'same-origin',cache:'no-store',signal});
        if(response.status===401) throw accountError(new Error('auth_required'));
        if(response.status===403||response.status===404) return null;
        if(!response.ok) throw new Error('Không thể tải ảnh tài khoản. Hãy thử lại sau.');
        if(response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='image/webp') throw new Error('Phản hồi ảnh không hợp lệ.');
        const length=response.headers.get('Content-Length');
        if(length!==null&&(!/^\d+$/.test(length)||Number(length)>ACCOUNT_IMAGE_LIMIT)) throw new Error('Phản hồi ảnh không hợp lệ.');
        const value=await response.blob();
        if(signal.aborted) throw new RequestTimeoutError();
        if(value.size<=0||value.size>ACCOUNT_IMAGE_LIMIT) throw new Error('Phản hồi ảnh không hợp lệ.');
        return value;
      },10000);
      const url=blob?URL.createObjectURL(blob):null;
      try {await checkActor();return url;}
      catch(error) {if(url)URL.revokeObjectURL(url);throw error;}
    }
  };
}
