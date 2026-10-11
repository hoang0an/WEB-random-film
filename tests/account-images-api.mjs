import {readFile, writeFile, unlink} from 'node:fs/promises';
import {transpileModule, ModuleKind, ScriptTarget} from 'typescript';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const fixture = new URL('./.account-images-server-fixture.mjs', import.meta.url);
const routeFixture = new URL('./.account-images-route-fixture.mjs', import.meta.url);
const source = await readFile('lib/account-images-server.ts', 'utf8');
await writeFile(fixture, transpileModule(source, {compilerOptions: {module: ModuleKind.ESNext, target: ScriptTarget.ES2022}}).outputText.replace("import 'server-only';", '').replace("'./account-types.ts'", "'../lib/account-types.ts'"));
try {
  const {createImageHandler} = await import(fixture.href);
  const uid = '00000000-0000-0000-0000-000000000001';
  const assets = [], objects = [];
  let authorized = true;
  const handler = createImageHandler({
    verify: async token => authorized && token === 'valid-token' ? uid : null,
    upload: async (asset, bytes) => {objects.push({asset, bytes});},
    register: async asset => {assets.push(asset);},
  });
  const png = await sharp({create: {width: 64, height: 32, channels: 3, background: '#ff0000'}}).png().toBuffer();
  const req = (body = png, kind = 'avatar', token = 'valid-token', mime = 'image/png') => new Request(`http://localhost/api/account/images?kind=${kind}`, {method: 'POST', body, headers: {'Content-Type': mime, ...(token ? {Authorization: `Bearer ${token}`} : {})}});
  assert.equal((await handler(req(png, 'avatar', ''))).status, 401);
  assert.equal((await handler(req(png, 'other'))).status, 400);
  assert.equal((await handler(req(png, 'avatar', 'valid-token', 'image/svg+xml'))).status, 400);
  assert.equal((await handler(req(Buffer.from('<svg>fake</svg>')))).status, 400);
  assert.equal((await handler(req(png, 'avatar', 'valid-token', 'image/jpeg'))).status, 400);
  assert.equal((await handler(req(Buffer.alloc(3 * 1024 * 1024 + 1)))).status, 413);
  assert.equal(objects.length, 0);
  let response = await handler(req());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(Object.keys(payload), ['assetId']);
  assert.equal(assets[0].ownerId, uid);
  assert.equal(assets[0].kind, 'avatar');
  assert.equal(assets[0].id, payload.assetId);
  assert.match(assets[0].path, new RegExp(`^${uid}/avatar/[a-f0-9-]+\\.webp$`));
  const metadata = await sharp(objects[0].bytes).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.equal(metadata.exif, undefined);
  response = await handler(req(png, 'cover'));
  assert.equal(response.status, 200);
  assert.equal(assets[1].kind, 'cover');
  authorized = false;
  assert.equal((await handler(req())).status, 401);
  assert.equal(objects.length, 2);
  const unavailable = createImageHandler({verify: async () => uid, upload: async () => {throw Error('private service token');}, register: async () => {}});
  const failure = await unavailable(req());
  assert.equal(failure.status, 502);
  assert.ok(!JSON.stringify(await failure.json()).includes('private service token'));
  const order = [];
  const reserved = createImageHandler({verify: async () => uid, register: async () => {order.push('reserve');}, upload: async () => {order.push('upload');}});
  assert.equal((await reserved(req())).status, 200);
  assert.deepEqual(order, ['reserve', 'upload'], 'reserve before upload prevents unregistered orphans');
  let uploadedAfterFailedReservation = false;
  const failedReservation = createImageHandler({verify: async () => uid, register: async () => {throw Error('database down');}, upload: async () => {uploadedAfterFailedReservation = true;}});
  assert.equal((await failedReservation(req())).status, 502);
  assert.equal(uploadedAfterFailedReservation, false);
  // Exercise the actual Route Handler with mocked Supabase HTTP, not just the
  // processing helper: privileged cleanup/reservation/upload order is a contract.
  const routeSource = await readFile('app/api/account/images/route.ts', 'utf8');
  await writeFile(routeFixture, transpileModule(routeSource, {compilerOptions: {module: ModuleKind.ESNext, target: ScriptTarget.ES2022}}).outputText.replace("'@/lib/account-images-server'", "'./.account-images-server-fixture.mjs'"));
  const envKeys = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const realFetch = globalThis.fetch;
  const calls = [];
  let mode = 'normal';
  try {
    const {POST} = await import(routeFixture.href);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal((await POST(req())).status, 503);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://project.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
    globalThis.fetch = async (input, options = {}) => {
      const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      assert.equal(target.host, 'project.test');
      calls.push({path: target.pathname, body: typeof options.body === 'string' ? JSON.parse(options.body) : null});
      if (target.pathname === '/auth/v1/user') return Response.json(mode === 'invalid-auth' ? {message:'invalid'} : {id:uid,aud:'authenticated',email:'test@example.invalid',app_metadata:{},user_metadata:{}}, {status:mode === 'invalid-auth' ? 401 : 200});
      if (target.pathname.endsWith('/claim_account_image_cleanup')) return Response.json([], {status:200});
      if (target.pathname.endsWith('/reserve_account_image')) return mode === 'full' ? Response.json({message:'too_many_pending_images'}, {status:400}) : Response.json(null);
      if (target.pathname.startsWith('/storage/v1/object/account-avatars/')) return Response.json({Key:'stored'}, {status:200});
      throw Error('unexpected service operation');
    };
    calls.length = 0;
    assert.equal((await POST(req())).status, 200);
    assert.deepEqual(calls.map(call => call.path.split('/').at(-1)).filter(value => value === 'claim_account_image_cleanup' || value === 'reserve_account_image'), ['claim_account_image_cleanup','reserve_account_image','claim_account_image_cleanup']);
    const reservation = calls.find(call => call.path.endsWith('/reserve_account_image'));
    const stored = calls.findIndex(call => call.path.startsWith('/storage/v1/object/'));
    assert.equal(reservation.body.p_owner, uid);
    assert.equal(reservation.body.p_kind, 'avatar');
    assert.ok(stored > calls.indexOf(reservation));
    mode = 'full'; calls.length = 0;
    assert.equal((await POST(req())).status, 429);
    assert.ok(!calls.some(call => call.path.startsWith('/storage/v1/object/')));
    mode = 'invalid-auth'; calls.length = 0;
    assert.equal((await POST(req())).status, 401);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    for (const key of envKeys) {if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];}
  }
  console.log('PASS account images: authentication, kind/MIME/bytes/content, immutable owner paths, WebP normalization and sanitized failures');
} finally {await unlink(fixture).catch(() => {}); await unlink(routeFixture).catch(() => {});}
