import {readFile, writeFile, unlink} from 'node:fs/promises';
import {transpileModule, ModuleKind, ScriptTarget} from 'typescript';
import assert from 'node:assert/strict';
const fixture = new URL('./.account-image-cleanup-fixture.mjs', import.meta.url);
const routeFixture = new URL('./.account-image-cleanup-route-fixture.mjs', import.meta.url);
await writeFile(fixture, transpileModule(await readFile('lib/account-image-cleanup-server.ts', 'utf8'), {compilerOptions: {module: ModuleKind.ESNext, target: ScriptTarget.ES2022}}).outputText.replace("import 'server-only';", ''));
try {
  const {createCleanupHandler, runAccountImageCleanup, createCleanupHttpDependencies} = await import(fixture.href);
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const token = uuid(999), owner = uuid(1);
  const asset = n => ({id: uuid(n), kind: 'avatar', path: `${owner}/avatar/${uuid(n)}.webp`});
  let admin = 0;
  const handler = createCleanupHandler({secret: () => 'private-secret', createDependencies: () => {admin++; throw new Error('must not create');}});
  for (const [authorization, status] of [[null, 401], ['Bearer wrong', 401], ['Bearer private-secret', 502]]) {
    const response = await handler(new Request('http://localhost/api/maintenance/account-images', {headers: authorization ? {authorization} : {}}));
    assert.equal(response.status, status); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.ok(!(await response.text()).includes('private-secret'));
  }
  assert.equal(admin, 1);
  const head = await handler(new Request('http://localhost', {method: 'HEAD', headers: {authorization: 'Bearer private-secret'}}));
  assert.equal(head.status, 405); assert.equal(head.headers.get('Cache-Control'), 'no-store'); assert.equal(admin, 1);
  assert.equal((await createCleanupHandler({secret: () => undefined, createDependencies: () => {throw new Error('admin');}})(new Request('http://localhost'))).status, 503);
  assert.equal((await handler(new Request('http://localhost?owner=secret', {headers: {authorization: 'Bearer private-secret'}}))).status, 400);
  assert.equal(admin, 1);
  const calls = [], deps = {
    acquire: async () => ({busy: false, token, owners: [owner]}),
    claim: async () => [asset(2), asset(3)],
    remove: async a => {calls.push(`remove:${a.id}`); return true;},
    deleteRegistry: async a => {calls.push(`delete:${a.id}`); return true;},
    release: async () => {calls.push('release'); return true;},
  };
  let report = await runAccountImageCleanup(deps);
  assert.equal(report.removed, 2); assert.equal(report.status, 'complete'); assert.equal(calls.at(-1), 'release');
  calls.length = 0;
  report = await runAccountImageCleanup({...deps, remove: async () => false});
  assert.equal(report.failed, 2); assert.equal(report.removed, 0); assert.deepEqual(calls, ['release']);
  report = await runAccountImageCleanup({...deps, remove: async () => {throw new Error('secret path provider error');}});
  assert.equal(report.failed, 2); assert.ok(!JSON.stringify(report).includes('secret'));
  report = await runAccountImageCleanup({...deps, deleteRegistry: async () => false}); assert.equal(report.failed, 2);
  calls.length = 0;
  report = await runAccountImageCleanup({...deps, claim: async () => [{...asset(2), path: '../escape'}]});
  assert.equal(report.failed, 1); assert.deepEqual(calls, ['release']);
  report = await runAccountImageCleanup({...deps, acquire: async () => ({busy: true, token: null, owners: []})}); assert.equal(report.status, 'busy');
  report = await runAccountImageCleanup({...deps, acquire: async () => ({busy: false, token: null, owners: []})}); assert.equal(report.status, 'complete');
  report = await runAccountImageCleanup({...deps, acquire: async () => ({busy: false, token, owners: Array(21).fill(owner)})}); assert.equal(report.status, 'partial');
  report = await runAccountImageCleanup({...deps, claim: async () => Array(21).fill(asset(2))}); assert.equal(report.removed, 0); assert.equal(report.status, 'partial');
  report = await runAccountImageCleanup({...deps, claim: async () => {throw new Error('invalid_cleanup_lease');}}); assert.equal(report.status, 'partial');
  report = await runAccountImageCleanup({...deps, release: async () => false}); assert.equal(report.status, 'partial');
  let concurrent = 0, peak = 0;
  report = await runAccountImageCleanup({...deps, claim: async () => Array.from({length: 20}, (_, i) => asset(i + 2)), remove: async () => {peak = Math.max(peak, ++concurrent); await new Promise(r => setTimeout(r, 1)); concurrent--; return true;}});
  assert.equal(report.removed, 20); assert.equal(peak, 2);
  let clock = 0;
  calls.length = 0;
  report = await runAccountImageCleanup({...deps, claim: async () => {clock = 45000; return [asset(2)];}}, {now: () => clock});
  assert.equal(report.status, 'partial'); assert.deepEqual(calls, []);
  const started = Date.now();
  report = await runAccountImageCleanup({...deps, claim: () => new Promise(() => {})}, {budgetMs: 40, requestTimeoutMs: 5});
  assert.equal(report.status, 'partial'); assert.ok(Date.now() - started < 200);
  let lateRemoves = 0, lateDeletes = 0, lateReleases = 0;
  report = await runAccountImageCleanup({...deps, claim: async () => Array.from({length: 20}, (_, i) => asset(i + 2)), remove: async () => {lateRemoves++; return new Promise(() => {});}, deleteRegistry: async () => {lateDeletes++; return true;}, release: async () => {lateReleases++; return true;}}, {budgetMs: 40, requestTimeoutMs: 5});
  assert.equal(report.status, 'partial'); assert.equal(lateRemoves, 2); assert.equal(lateDeletes, 0); assert.equal(lateReleases, 0);
  // Full permitted shape consumes exactly 400 candidates and never exceeds two Storage operations.
  const owners = Array.from({length: 20}, (_, i) => uuid(i + 1));
  report = await runAccountImageCleanup({...deps, acquire: async () => ({busy: false, token, owners}), claim: async (_, o) => Array.from({length: 20}, (_, i) => ({id: uuid(i + 100), kind: 'cover', path: `${o}/cover/${uuid(i + 100)}.webp`}))});
  assert.equal(report.candidates, 400); assert.equal(report.removed, 400);
  const httpCalls = [];
  const httpAsset = {...asset(2), ownerId: owner};
  const transport = async (url, init) => {httpCalls.push({url, init}); return Response.json(url.includes('/object/info/') ? {statusCode: '404', error: 'not_found', message: 'Object not found'} : [], {status: url.includes('/object/info/') ? 400 : 200});};
  const http = createCleanupHttpDependencies('https://test.supabase.co', 'service-private', transport);
  assert.equal(await http.remove(httpAsset, new AbortController().signal), true, 'previously removed object is recoverable through confirmed metadata absence');
  assert.ok(httpCalls[1].url.endsWith(httpAsset.path));
  assert.equal(httpCalls[0].init.redirect, 'error'); assert.equal(httpCalls[0].init.cache, 'no-store');
  assert.equal(await createCleanupHttpDependencies('https://test.supabase.co', 'key', async () => Response.json([])).remove(httpAsset, new AbortController().signal), false);
  const registry = createCleanupHttpDependencies('https://test.supabase.co', 'key', async (url, init) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('owner_id'), `eq.${owner}`); assert.equal(params.get('path'), `eq.${httpAsset.path}`); assert.equal(params.get('state'), 'eq.deleting');
    assert.equal(init.headers.Prefer, 'return=representation'); return Response.json([{id: httpAsset.id}]);
  });
  assert.equal(await registry.deleteRegistry(httpAsset, new AbortController().signal), true);
  assert.throws(() => createCleanupHttpDependencies('http://example.com', 'key'));
  await writeFile(routeFixture, transpileModule(await readFile('app/api/maintenance/account-images/route.ts', 'utf8'), {compilerOptions: {module: ModuleKind.ESNext, target: ScriptTarget.ES2022}}).outputText.replace("'@/lib/account-image-cleanup-server'", "'./.account-image-cleanup-fixture.mjs'"));
  const route = await import(routeFixture.href);
  assert.equal(route.runtime, 'nodejs'); assert.equal(route.maxDuration, 60);
  const saved = {cron: process.env.CRON_SECRET, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY};
  try {
    delete process.env.CRON_SECRET; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal((await route.GET(new Request('http://localhost'))).status, 503);
    process.env.CRON_SECRET = 'private-secret';
    assert.equal((await route.GET(new Request('http://localhost'))).status, 401);
    assert.equal((await route.GET(new Request('http://localhost', {headers: {authorization: 'Bearer private-secret'}}))).status, 502);
    for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const result = await route[method](); assert.equal(result.status, 405); assert.equal(result.headers.get('Cache-Control'), 'no-store');
    }
  } finally {
    for (const [name, value] of [['CRON_SECRET', saved.cron], ['NEXT_PUBLIC_SUPABASE_URL', saved.url], ['SUPABASE_SERVICE_ROLE_KEY', saved.key]]) {if (value === undefined) delete process.env[name]; else process.env[name] = value;}
  }
  console.log('Scheduled cleanup API/worker checks PASS');
} finally {await unlink(fixture).catch(() => {}); await unlink(routeFixture).catch(() => {});}
