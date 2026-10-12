import 'server-only';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {ACCOUNT_IMAGE_LIMIT, ACCOUNT_IMAGE_PIXEL_LIMIT, type ImageKind} from './account-types.ts';

export type ImageAsset = {id: string; ownerId: string; kind: ImageKind; path: string};
type Dependencies = {
  verify(token: string, signal: AbortSignal): Promise<string | null>;
  upload(asset: ImageAsset, bytes: Buffer, signal: AbortSignal): Promise<void>;
  register(asset: ImageAsset, signal: AbortSignal): Promise<void>;
  cleanup?(ownerId: string, signal: AbortSignal): Promise<void>;
};
export class ImageInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {super(message); this.status = status;}
}
async function readLimited(request: Request, signal: AbortSignal): Promise<Buffer> {
  if (Number(request.headers.get('content-length')) > ACCOUNT_IMAGE_LIMIT) throw new ImageInputError('Ảnh vượt quá 3 MiB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ImageInputError('Chưa chọn ảnh.');
  const parts: Uint8Array[] = [];
  let length = 0;
  const abort = () => {void reader.cancel().catch(() => {});};
  signal.addEventListener('abort', abort, {once: true});
  try {
    while (true) {
      signal.throwIfAborted();
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > ACCOUNT_IMAGE_LIMIT) {await reader.cancel(); throw new ImageInputError('Ảnh vượt quá 3 MiB.', 413);}
      parts.push(value);
    }
    if (!length) throw new ImageInputError('Ảnh không có dữ liệu.');
    return Buffer.concat(parts, length);
  } finally {signal.removeEventListener('abort', abort); reader.releaseLock();}
}
function checkStaticPng(bytes: Buffer): void {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) throw new Error('invalid PNG signature');
  // Sharp may expose APNG as a single page. Inspect only actual chunk headers:
  // payload text containing an animation name must remain a valid static PNG.
  let offset = signature.length;
  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    if (remaining < 12) throw new Error('truncated PNG chunk');
    const length = bytes.readUInt32BE(offset);
    if (length > remaining - 12) throw new Error('truncated PNG payload or CRC');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw new Error('animated PNG');
    offset += length + 12;
  }
  // Sharp still validates CRCs, image structure and pixels during decoding.
}
async function normalizeImage(bytes: Buffer, mime: string, kind: ImageKind): Promise<Buffer> {
  try {
    if (mime === 'image/png') checkStaticPng(bytes);
    const image = sharp(bytes, {limitInputPixels: ACCOUNT_IMAGE_PIXEL_LIMIT, failOn: 'warning'});
    const meta = await image.metadata();
    const allowed = {jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp'};
    if (!meta.format || !(meta.format in allowed) || allowed[meta.format as keyof typeof allowed] !== mime ||
        !meta.width || !meta.height || meta.width * meta.height > ACCOUNT_IMAGE_PIXEL_LIMIT || (meta.pages || 1) > 1) throw new Error('invalid image');
    return await image.rotate().resize(kind === 'avatar' ? 512 : 1600, kind === 'avatar' ? 512 : 600, {fit: 'cover', position: 'centre'}).webp({quality: 82}).toBuffer();
  } catch {throw new ImageInputError('Ảnh không hợp lệ. Chọn JPEG, PNG hoặc WebP tĩnh dưới 24 triệu pixel.');}
}

export function createImageHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const headers = {'Cache-Control': 'no-store'};
    const operation = async () => {
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
      if (!token) return Response.json({error: 'Hãy đăng nhập để đổi ảnh.'}, {status: 401, headers});
      const ownerId = await deps.verify(token, controller.signal);
      if (!ownerId) return Response.json({error: 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'}, {status: 401, headers});
      const kind = new URL(request.url).searchParams.get('kind');
      if (kind !== 'avatar' && kind !== 'cover') throw new ImageInputError('Loại ảnh không hợp lệ.');
      const mime = request.headers.get('content-type')?.split(';')[0].trim() || '';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new ImageInputError('Chọn JPEG, PNG hoặc WebP.');
      const bytes = await normalizeImage(await readLimited(request, controller.signal), mime, kind);
      controller.signal.throwIfAborted();
      const id = randomUUID();
      const asset: ImageAsset = {id, ownerId, kind, path: `${ownerId}/${kind}/${id}.webp`};
      await deps.register(asset, controller.signal);
      controller.signal.throwIfAborted();
      await deps.upload(asset, bytes, controller.signal);
      controller.signal.throwIfAborted();
      // Cleanup runs after registration. A lost response does not justify deleting
      // this new asset; the registry grace period handles unattached uploads.
      if (deps.cleanup) await deps.cleanup(ownerId, controller.signal).catch(() => {});
      return Response.json({assetId: id}, {headers});
    };
    try {
      const timeout = new Promise<never>((_, reject) => {timer = setTimeout(() => {controller.abort(); reject(new Error('image_timeout'));}, 20000);});
      return await Promise.race([operation(), timeout]);
    } catch (error) {
      return Response.json({error: error instanceof ImageInputError ? error.message : 'Chưa xác nhận được upload ảnh. Hãy tải lại tài khoản trước khi thử lại.'}, {status: error instanceof ImageInputError ? error.status : 502, headers});
    } finally {clearTimeout(timer);}
  };
}
