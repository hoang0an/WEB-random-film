import 'server-only';
import {ACCOUNT_IMAGE_LIMIT, type ImageKind} from './account-types.ts';

export const accountImageReadHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Vary': 'Authorization',
};
type Dependencies = {
  verify(token: string, signal: AbortSignal): Promise<string | null>;
  authorize(token: string, kind: ImageKind, path: string, signal: AbortSignal): Promise<unknown>;
  download(kind: ImageKind, path: string, signal: AbortSignal): Promise<Response>;
};
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export function accountImageReadError(status: number): Response {
  return Response.json({error: 'Account image unavailable.'}, {status, headers: accountImageReadHeaders});
}
async function bufferImage(response: Response, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing body');
  const cancel = () => {void reader.cancel().catch(() => {});};
  signal.addEventListener('abort', cancel, {once: true});
  try {
    if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim() !== 'image/webp' || Number(response.headers.get('content-length')) > ACCOUNT_IMAGE_LIMIT) throw new Error('invalid image');
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      signal.throwIfAborted();
      const {done, value} = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > ACCOUNT_IMAGE_LIMIT) throw new Error('oversized image');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    if (size < 12 || Buffer.from(bytes.subarray(0, 4)).toString('ascii') !== 'RIFF' || Buffer.from(bytes.subarray(8, 12)).toString('ascii') !== 'WEBP') throw new Error('invalid WebP');
    return bytes;
  } catch (error) {cancel(); throw error;}
  finally {signal.removeEventListener('abort', cancel); reader.releaseLock();}
}

// The shorter deadline is an injected fixture option, never a request parameter.
export function createImageReadHandler(deps: Dependencies, deadlineMs = 10000) {
  return async (request: Request): Promise<Response> => {
    const controller = new AbortController();
    const expires = performance.now() + deadlineMs;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort: (reason: Error) => void = () => {};
    const aborted = new Promise<never>((_, reject) => {rejectAbort = reject;});
    const abort = () => {controller.abort(); rejectAbort(new Error('aborted'));};
    const check = () => {
      if (performance.now() >= expires) {timedOut = true; controller.abort();}
      controller.signal.throwIfAborted();
    };
    request.signal.addEventListener('abort', abort, {once: true});
    const operation = async () => {
      check();
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
      if (!token) return accountImageReadError(401);
      const params = new URL(request.url).searchParams;
      const kind = params.get('kind');
      const path = params.get('path');
      if ((kind !== 'avatar' && kind !== 'cover') || !path || params.getAll('kind').length !== 1 || params.getAll('path').length !== 1 || !new RegExp(`^${uuid}/${kind}/${uuid}\\.webp$`).test(path)) return accountImageReadError(400);
      const user = await deps.verify(token, controller.signal);
      check();
      if (!user) return accountImageReadError(401);
      const allowed = await deps.authorize(token, kind, path, controller.signal);
      check();
      if (typeof allowed !== 'boolean') throw new Error('invalid permission result');
      if (!allowed) return accountImageReadError(404);
      const response = await deps.download(kind, path, controller.signal);
      if (controller.signal.aborted) {void response.body?.cancel().catch(() => {}); controller.signal.throwIfAborted();}
      const bytes = await bufferImage(response, controller.signal);
      check();
      // A fresh DB query is the grant point; no prior permission result is reused.
      const current = await deps.authorize(token, kind, path, controller.signal);
      check();
      if (typeof current !== 'boolean') throw new Error('invalid permission result');
      if (!current) return accountImageReadError(404);
      return new Response(bytes, {headers: {...accountImageReadHeaders, 'Content-Type': 'image/webp', 'Content-Length': String(bytes.byteLength), 'X-Content-Type-Options': 'nosniff'}});
    };
    try {
      timer = setTimeout(() => {timedOut = true; abort();}, deadlineMs);
      if (request.signal.aborted) abort();
      return await Promise.race([operation(), aborted]);
    } catch {return accountImageReadError(timedOut ? 504 : request.signal.aborted ? 499 : 502);}
    finally {clearTimeout(timer); request.signal.removeEventListener('abort', abort);}
  };
}
