import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {createImageHandler, ImageInputError} from '@/lib/account-images-server';
import {accountImageReadError, createImageReadHandler} from '@/lib/account-image-read-server';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !secret) return accountImageReadError(503);
  const handler = createImageReadHandler({
    async verify(token, signal) {
      const response = await fetch(`${url}/auth/v1/user`, {headers: {apikey: publicKey, Authorization: `Bearer ${token}`}, cache: 'no-store', redirect: 'error', signal});
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new Error('authentication unavailable');
      const user = await response.json();
      if (typeof user.id !== 'string' || !user.id) throw new Error('invalid authentication response');
      return user.id;
    },
    async authorize(token, kind, path, signal) {
      // Two independent requests use the actor JWT against the project writer.
      const response = await fetch(`${url}/rest/v1/rpc/can_read_my_account_image`, {
        method: 'POST', headers: {apikey: publicKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({p_kind: kind, p_path: path}), cache: 'no-store', redirect: 'error', signal,
      });
      if (!response.ok) throw new Error('permission unavailable');
      return response.json();
    },
    download(kind, path, signal) {
      const bucket = kind === 'avatar' ? 'account-avatars' : 'account-covers';
      return fetch(`${url}/storage/v1/object/${bucket}/${path}`, {headers: {apikey: secret, Authorization: `Bearer ${secret}`}, cache: 'no-store', redirect: 'error', signal});
    },
  });
  return handler(request);
}
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !secret) return Response.json({error: 'Chưa cấu hình dịch vụ ảnh tài khoản.'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  // Cookie credentials are not accepted: only an explicit user bearer token.
  let admin: SupabaseClient;
  async function cleanupOwner(ownerId: string) {
    const {data, error} = await admin.rpc('claim_account_image_cleanup', {p_owner: ownerId});
    if (error) throw new Error('cleanup unavailable');
    for (const asset of data || []) {
      const prefix = `${ownerId}/${asset.kind}/`;
      if (!['avatar', 'cover'].includes(asset.kind) || typeof asset.path !== 'string' || !asset.path.startsWith(prefix) || !/^[a-f0-9-]+\.webp$/.test(asset.path.slice(prefix.length))) continue;
      const {error: removeError} = await admin.storage.from(asset.kind === 'avatar' ? 'account-avatars' : 'account-covers').remove([asset.path]);
      if (!removeError) await admin.from('account_image_assets').delete().eq('id', asset.id).eq('owner_id', ownerId).eq('state', 'deleting');
    }
  }
  const handler = createImageHandler({
    async verify(token, signal) {
      const options = {auth: {persistSession: false, autoRefreshToken: false}, global: {fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {...init, signal})}};
      const auth = createClient(url, publicKey, options);
      const {data, error} = await auth.auth.getUser(token);
      if (error || !data.user) return null;
      admin = createClient(url, secret, options);
      // Expired reservations must be reclaimed before applying the pending cap.
      await cleanupOwner(data.user.id);
      return data.user.id;
    },
    async upload(asset, bytes) {
      // CDN hits can outlive a membership/attachment change even with a user JWT.
      // New account images must revalidate instead of keeping an old read grant.
      const {error} = await admin.storage.from(asset.kind === 'avatar' ? 'account-avatars' : 'account-covers').upload(asset.path, bytes, {contentType: 'image/webp', upsert: false, cacheControl: '0'});
      if (error) throw new Error('storage upload failed');
    },
    async register(asset) {
      const {error} = await admin.rpc('reserve_account_image', {p_id: asset.id, p_owner: asset.ownerId, p_kind: asset.kind, p_path: asset.path});
      if (error?.message === 'too_many_pending_images') throw new ImageInputError('Bạn tải ảnh quá nhanh. Hãy đợi một chút rồi thử lại.', 429);
      if (error) throw new Error('asset registration uncertain');
    },
    cleanup: cleanupOwner,
  });
  return handler(request);
}
