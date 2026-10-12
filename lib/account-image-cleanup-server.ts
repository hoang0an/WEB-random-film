import 'server-only';
import {timingSafeEqual} from 'node:crypto';

type Asset = {id: string; ownerId: string; kind: 'avatar' | 'cover'; path: string};
export type CleanupDependencies = {
  acquire(signal: AbortSignal): Promise<unknown>;
  claim(token: string, owner: string, signal: AbortSignal): Promise<unknown>;
  remove(asset: Asset, signal: AbortSignal): Promise<boolean>;
  deleteRegistry(asset: Asset, signal: AbortSignal): Promise<boolean>;
  release(token: string, signal: AbortSignal): Promise<boolean>;
};
type Report = {status: 'complete' | 'busy' | 'partial'; owners: number; candidates: number; removed: number; failed: number};
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export async function runAccountImageCleanup(deps: CleanupDependencies, options: {now?: () => number; budgetMs?: number; requestTimeoutMs?: number} = {}): Promise<Report> {
  const now = options.now || Date.now;
  const deadline = now() + Math.min(45000, Math.max(1, options.budgetMs ?? 45000));
  const report: Report = {status: 'complete', owners: 0, candidates: 0, removed: 0, failed: 0};
  let token: string | undefined;
  let halted = false;
  const operation = async <T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const remaining = deadline - now();
    if (remaining <= 0 || halted) throw new Error('deadline');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(() => {controller.signal.throwIfAborted(); if (now() >= deadline || halted) throw new Error('deadline'); return fn(controller.signal);}), new Promise<never>((_, reject) => {
        timer = setTimeout(() => {halted = true; controller.abort(); reject(new Error('timeout'));}, Math.min(remaining, options.requestTimeoutMs ?? 5000));
      })]);
    } finally {clearTimeout(timer);}
  };
  try {
    const lease = await operation(signal => deps.acquire(signal));
    // Capture a canonical token before validating the rest, so malformed results
    // still release only that token, never an arbitrary provider value.
    if (record(lease) && uuid(lease.token)) token = lease.token;
    if (!record(lease) || typeof lease.busy !== 'boolean' || !Array.isArray(lease.owners) || lease.owners.length > 20 || !lease.owners.every(uuid) || new Set(lease.owners).size !== lease.owners.length) throw new Error('invalid lease');
    if (lease.busy) {
      if (lease.token !== null || lease.owners.length) throw new Error('invalid busy lease');
      report.status = 'busy'; return report;
    }
    if (lease.token === null && lease.owners.length === 0) return report;
    if (!token || lease.owners.length === 0) throw new Error('invalid token');
    for (const owner of lease.owners as string[]) {
      if (now() >= deadline || halted) {report.status = 'partial'; break;}
      report.owners++;
      let rows: unknown;
      try {rows = await operation(signal => deps.claim(token!, owner, signal));}
      catch {report.failed++; report.status = 'partial'; continue;}
      if (!Array.isArray(rows) || rows.length > 20) {report.failed++; report.status = 'partial'; continue;}
      report.candidates += rows.length;
      if (report.candidates > 400) throw new Error('candidate limit');
      const seen = new Set<string>();
      const assets: Asset[] = [];
      for (const row of rows) {
        if (!record(row) || !uuid(row.id) || (row.kind !== 'avatar' && row.kind !== 'cover') || row.path !== `${owner}/${row.kind}/${row.id}.webp` || seen.has(row.id)) {report.failed++; report.status = 'partial'; continue;}
        seen.add(row.id); assets.push({id: row.id, ownerId: owner, kind: row.kind, path: row.path as string});
      }
      let index = 0;
      const consumer = async () => {
        while (index < assets.length) {
          if (now() >= deadline || halted) {report.status = 'partial'; return;}
          const asset = assets[index++];
          try {
            // A timeout or ambiguous response leaves the deleting row retryable.
            if (!await operation(signal => deps.remove(asset, signal))) throw new Error('uncertain removal');
            if (!await operation(signal => deps.deleteRegistry(asset, signal))) throw new Error('uncertain registry deletion');
            report.removed++;
          } catch {report.failed++; report.status = 'partial';}
        }
      };
      await Promise.all([consumer(), consumer()]);
    }
  } catch {report.failed++; report.status = 'partial';}
  finally {
    if (token && !halted) {
      try {if (!await operation(signal => deps.release(token!, signal))) report.status = 'partial';}
      catch {report.status = 'partial';}
      // If the deadline prevents release, the database's 90-second lease expires.
    }
    // A timed-out HTTP/SQL operation might still be running remotely. Start no
    // further requests and retain the lease until expiry instead of overlapping
    // a retry run. Aborting fetch is not proof the database statement stopped.
  }
  return report;
}

export function createCleanupHandler(deps: {secret(): string | undefined; createDependencies(): CleanupDependencies}) {
  return async (request: Request): Promise<Response> => {
    const headers = {'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store'};
    const response = (body: unknown, status = 200) => Response.json(body, {status, headers});
    if (request.method !== 'GET') return new Response(null, {status: 405, headers: {...headers, Allow: 'GET'}});
    const secret = deps.secret();
    if (!secret || /\s/.test(secret)) return response({error: 'maintenance_unavailable'}, 503);
    const supplied = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    const expectedBytes = Buffer.from(secret), actualBytes = Buffer.from(supplied || '');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return response({error: 'unauthorized'}, 401);
    if (new URL(request.url).search) return response({error: 'unexpected_query'}, 400);
    try {
      const report = await runAccountImageCleanup(deps.createDependencies());
      return response(report, report.status === 'partial' ? 502 : 200);
    } catch {return response({error: 'maintenance_unavailable'}, 502);}
  };
}

// HTTP requests use explicit service credentials only after maintenance auth.
// Redirects, cached responses and caller-selected paths are never accepted.
export function createCleanupHttpDependencies(url: string, secret: string, transport: typeof fetch = fetch): CleanupDependencies {
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('invalid backend');
  const headers = {apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json'};
  const request = async (path: string, body: unknown, signal: AbortSignal, method = 'POST', extra: Record<string, string> = {}) => {
    const result = await transport(`${origin.origin}${path}`, {method, headers: {...headers, ...extra}, body: JSON.stringify(body), signal, cache: 'no-store', redirect: 'error'});
    if (!result.ok) throw new Error('backend unavailable');
    return result.json();
  };
  return {
    acquire: signal => request('/rest/v1/rpc/acquire_account_image_cleanup', {}, signal),
    claim: (token, owner, signal) => request('/rest/v1/rpc/claim_scheduled_account_image_cleanup', {p_token: token, p_owner: owner}, signal),
    release: async (token, signal) => await request('/rest/v1/rpc/release_account_image_cleanup', {p_token: token}, signal) === true,
    remove: async (asset, signal) => {
      const data: unknown = await request(`/storage/v1/object/${asset.kind === 'avatar' ? 'account-avatars' : 'account-covers'}`, {prefixes: [asset.path]}, signal, 'DELETE');
      if (Array.isArray(data) && data.length === 1 && record(data[0]) && data[0].name === asset.path) return true;
      if (!Array.isArray(data) || data.length !== 0) return false;
      // A previous Storage removal may have succeeded while registry deletion
      // failed. Empty removal alone is not evidence of absence: confirm using
      // the canonical authenticated metadata endpoint before retrying the row.
      const bucket = asset.kind === 'avatar' ? 'account-avatars' : 'account-covers';
      const result = await transport(`${origin.origin}/storage/v1/object/info/${bucket}/${asset.path}`, {headers, signal, cache: 'no-store', redirect: 'error'});
      if (result.status !== 400 && result.status !== 404) return false;
      const error: unknown = await result.json();
      return record(error) && String(error.statusCode) === '404' && error.error === 'not_found' && error.message === 'Object not found';
    },
    deleteRegistry: async (asset, signal) => {
      const query = new URLSearchParams({id: `eq.${asset.id}`, owner_id: `eq.${asset.ownerId}`, path: `eq.${asset.path}`, state: 'eq.deleting', select: 'id'});
      const data: unknown = await request(`/rest/v1/account_image_assets?${query}`, undefined, signal, 'DELETE', {Prefer: 'return=representation'});
      return Array.isArray(data) && data.length === 1 && record(data[0]) && data[0].id === asset.id;
    },
  };
}
