import {readFile, writeFile, unlink} from 'node:fs/promises';
import {transpileModule, ModuleKind, ScriptTarget} from 'typescript';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {deflateSync} from 'node:zlib';
// Actual PNG chunks and CRCs ensure the regression is a decodable APNG,
// rather than an invalid file rejected incidentally by Sharp.
function pngChunk(type, body) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  let value = 0xffffffff;
  for (const byte of Buffer.concat([name, body])) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  crc.writeUInt32BE((value ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, body, crc]);
}
function animatedPng(frames = 2) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const header = Buffer.alloc(13); header.writeUInt32BE(8); header.writeUInt32BE(8, 4); header[8] = 8; header[9] = 2;
  const control = Buffer.alloc(8); control.writeUInt32BE(frames);
  const frame = sequence => {
    const body = Buffer.alloc(26); body.writeUInt32BE(sequence); body.writeUInt32BE(8, 4); body.writeUInt32BE(8, 8);
    body.writeUInt16BE(1, 20); body.writeUInt16BE(10, 22); return pngChunk('fcTL', body);
  };
  const pixels = value => {
    const bytes = Buffer.alloc(8 * 25, value); for (let y = 0; y < 8; y++) bytes[y * 25] = 0;
    return deflateSync(bytes);
  };
  const chunks = [pngChunk('IHDR', header), pngChunk('acTL', control), frame(0), pngChunk('IDAT', pixels(180))];
  if (frames === 2) {
    const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
    chunks.push(frame(1), pngChunk('fdAT', Buffer.concat([sequence, pixels(60)])));
  }
  return Buffer.concat([signature, ...chunks, pngChunk('IEND', Buffer.alloc(0))]);
}
const fixture = new URL('./.account-images-server-fixture.mjs', import.meta.url);
const routeFixture = new URL('./.account-images-route-fixture.mjs', import.meta.url);
const readFixture = new URL('./.account-image-read-fixture.mjs', import.meta.url);
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
  const apng = animatedPng();
  await sharp(apng).raw().toBuffer();
  const rejectedEffects = [];
  const rejectHandler = createImageHandler({verify: async () => uid, register: async () => {rejectedEffects.push('register');}, upload: async () => {rejectedEffects.push('upload');}, cleanup: async () => {rejectedEffects.push('cleanup');}});
  assert.equal((await rejectHandler(req(apng))).status, 400, 'valid two-frame APNG must be rejected');
  assert.deepEqual(rejectedEffects, [], 'rejected normalization must never register/upload/post-cleanup');
  const insertBeforeEnd = chunk => Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
  const oversizedLength = Buffer.from(png); oversizedLength.writeUInt32BE(0xffffffff, 8);
  const payloadOverflow = Buffer.from(png); payloadOverflow.writeUInt32BE(png.length, 8);
  const animationCases = [
    ['one-frame APNG', animatedPng(1)],
    ['acTL chunk', insertBeforeEnd(pngChunk('acTL', Buffer.alloc(8)))],
    ['fcTL chunk', insertBeforeEnd(pngChunk('fcTL', Buffer.alloc(26)))],
    ['fdAT chunk', insertBeforeEnd(pngChunk('fdAT', Buffer.alloc(4)))],
  ];
  const invalidPngCases = [
    ...animationCases,
    ['truncated signature', png.subarray(0, 7)],
    ['truncated chunk header', png.subarray(0, 15)],
    ['truncated CRC', png.subarray(0, -1)],
    ['truncated chunk payload', png.subarray(0, 25)],
    ['extreme declared length', oversizedLength],
    ['length exceeds remaining bytes', payloadOverflow],
  ];
  for (const [label, bytes] of invalidPngCases) {
    rejectedEffects.length = 0;
    assert.equal((await rejectHandler(req(bytes))).status, 400, label);
    assert.deepEqual(rejectedEffects, [], `${label}: no register/upload/post-cleanup`);
  }
  // A PNG text payload is not an animation header. Valid CRC avoids a decoder
  // error masking a false-positive byte-search implementation.
  const textPng = insertBeforeEnd(pngChunk('tEXt', Buffer.from('Comment\0literal acTL fcTL fdAT names')));
  const formats = [
    ['PNG text', textPng, 'image/png'],
    ['JPEG', await sharp(png).jpeg().toBuffer(), 'image/jpeg'],
    ['WebP', await sharp(png).webp().toBuffer(), 'image/webp'],
  ];
  for (const [label, bytes, mime] of formats) {
    const normalized = [];
    const staticHandler = createImageHandler({verify: async () => uid, register: async () => {}, upload: async (_asset, output) => {normalized.push(output);}});
    assert.equal((await staticHandler(req(bytes, 'avatar', 'valid-token', mime))).status, 200, label);
    const metadata = await sharp(normalized[0]).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512);
  }
  const frames = Buffer.alloc(8 * 16 * 3, 180); frames.fill(60, 8 * 8 * 3);
  const animatedWebp = await sharp(frames, {raw: {width: 8, height: 16, channels: 3, pageHeight: 8}}).webp({loop: 0, delay: [100, 100]}).toBuffer();
  assert.equal((await sharp(animatedWebp).metadata()).pages, 2, 'fixture has two actual WebP frames');
  rejectedEffects.length = 0;
  assert.equal((await rejectHandler(req(animatedWebp, 'avatar', 'valid-token', 'image/webp'))).status, 400);
  assert.deepEqual(rejectedEffects, []);
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
  await writeFile(readFixture, transpileModule(await readFile('lib/account-image-read-server.ts', 'utf8'), {compilerOptions: {module: ModuleKind.ESNext, target: ScriptTarget.ES2022}}).outputText.replace("import 'server-only';", '').replace("'./account-types.ts'", "'../lib/account-types.ts'"));
  await writeFile(routeFixture, transpileModule(routeSource, {compilerOptions: {module: ModuleKind.ESNext, target: ScriptTarget.ES2022}}).outputText.replace("'@/lib/account-images-server'", "'./.account-images-server-fixture.mjs'").replace("'@/lib/account-image-read-server'", "'./.account-image-read-fixture.mjs'"));
  const envKeys = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const realFetch = globalThis.fetch;
  const calls = [];
  let mode = 'normal';
  try {
    const {POST, GET} = await import(routeFixture.href);
    assert.equal(typeof GET, 'function', 'account image reads must use an authorized server GET proxy');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal((await POST(req())).status, 503);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://project.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
    globalThis.fetch = async (input, options = {}) => {
      const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      assert.equal(target.host, 'project.test');
      calls.push({path: target.pathname, body: typeof options.body === 'string' ? JSON.parse(options.body) : null, cacheControl: new Headers(options.headers).get('cache-control')});
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
    assert.equal(calls[stored].cacheControl, 'max-age=0', 'account image objects must not retain a CDN grant after membership changes');
    for (const [label, bytes] of [['two-frame APNG', apng], ...invalidPngCases]) {
      calls.length = 0;
      assert.equal((await POST(req(bytes))).status, 400, `Route: ${label}`);
      assert.deepEqual(calls.map(call => call.path), ['/auth/v1/user', '/rest/v1/rpc/claim_account_image_cleanup'], `${label}: only auth and existing pre-normalization cleanup; no reserve/upload/post-cleanup`);
    }
    mode = 'full'; calls.length = 0;
    assert.equal((await POST(req())).status, 429);
    assert.ok(!calls.some(call => call.path.startsWith('/storage/v1/object/')));
    mode = 'invalid-auth'; calls.length = 0;
    assert.equal((await POST(req())).status, 401);
    assert.equal(calls.length, 1);
    const path = `${uid}/avatar/00000000-0000-0000-0000-000000000002.webp`;
    const getReq = (query = `kind=avatar&path=${path}`, token = 'actor-token', signal) => new Request(`http://localhost/api/account/images?${query}`, {headers: token ? {Authorization: `Bearer ${token}`} : {Cookie: 'session=actor-token'}, signal});
    const webp = await sharp(png).webp().toBuffer();
    const noStore = response => {
      assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
      assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
      assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
      assert.equal(response.headers.get('vary'), 'Authorization');
      return response;
    };
    let rpcMode = 'allow', rpcCount = 0, downloads = 0, authCount = 0;
    globalThis.fetch = async (input, options) => {
      const target = new URL(input);
      assert.equal(target.host, 'project.test');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      const headers = new Headers(options.headers);
      if (target.pathname === '/auth/v1/user') {
        authCount++;
        assert.equal(headers.get('apikey'), 'public-test-key');
        assert.equal(headers.get('authorization'), 'Bearer actor-token');
        return mode === 'invalid-auth' ? Response.json({}, {status:401}) : mode === 'auth-error' ? Response.json({message:'private secret'}, {status:500}) : Response.json({id:uid});
      }
      if (target.pathname === '/rest/v1/rpc/can_read_my_account_image') {
        rpcCount++;
        assert.equal(headers.get('apikey'), 'public-test-key');
        assert.equal(headers.get('authorization'), 'Bearer actor-token');
        assert.deepEqual(JSON.parse(options.body), {p_kind:'avatar',p_path:path});
        if (rpcMode === 'error') return Response.json({message:'private secret'}, {status:500});
        return Response.json(rpcMode === 'malformed' ? 'true' : rpcMode === 'deny' ? false : true);
      }
      assert.equal(target.pathname, `/storage/v1/object/account-avatars/${path}`);
      downloads++;
      assert.equal(headers.get('apikey'), 'server-only-test-key');
      assert.equal(headers.get('authorization'), 'Bearer server-only-test-key');
      if (mode === 'storage-error') return Response.json({message:'private secret'}, {status:500});
      return new Response(webp, {headers:{'Content-Type':mode === 'mime-error' ? 'image/png' : 'image/webp'}});
    };
    mode = 'normal';
    assert.equal(noStore(await GET(getReq(undefined, ''))).status, 401);
    assert.equal(noStore(await GET(getReq('kind=avatar&path=../secret'))).status, 400);
    assert.equal(noStore(await GET(getReq(`kind=cover&path=${path}`))).status, 400);
    assert.equal(noStore(await GET(getReq(`kind=avatar&kind=avatar&path=${path}`))).status, 400);
    assert.equal(authCount, 0);
    for (const [rpc, status] of [['deny',404],['malformed',502],['error',502]]) {
      rpcMode = rpc;
      assert.equal(noStore(await GET(getReq())).status, status);
      assert.equal(downloads, 0);
    }
    rpcMode = 'allow'; rpcCount = 0;
    const downloaded = noStore(await GET(getReq()));
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), webp);
    assert.equal(rpcCount, 2);
    for (const [failureMode, status] of [['invalid-auth',401],['auth-error',502],['storage-error',502],['mime-error',502]]) {
      mode = failureMode;
      const failed = noStore(await GET(getReq()));
      assert.equal(failed.status, status);
      assert.ok(!(await failed.text()).includes('private secret'));
    }
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(noStore(await GET(getReq())).status, 503);
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';

    const {createImageReadHandler} = await import(readFixture.href);
    const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise,resolve};};
    // Explicit Storage barriers establish leave/replace before the final snapshot.
    for (const reason of ['leave','replace','remove']) {
      const entered = deferred(), release = deferred();
      let permission = true, checks = 0;
      const delayed = createImageReadHandler({verify:async()=>uid,authorize:async()=>{checks++;return permission;},download:async()=>{entered.resolve();await release.promise;return new Response(webp,{headers:{'Content-Type':'image/webp'}});}});
      const pending = delayed(getReq());
      await entered.promise; permission = false; release.resolve();
      assert.equal(noStore(await pending).status,404,reason);
      assert.equal(checks,2);
    }
    let permission = true, checks = 0;
    const granted = createImageReadHandler({verify:async()=>uid,authorize:async()=>{checks++;const snapshot = permission;if(checks === 2) permission = false;return snapshot;},download:async()=>new Response(webp,{headers:{'Content-Type':'image/webp'}})});
    assert.equal(noStore(await granted(getReq())).status,200,'leave after final snapshot allows completion');
    assert.equal(noStore(await granted(getReq())).status,404,'retry obtains a fresh permission');
    let timedSignal, finalChecks = 0;
    const slow = createImageReadHandler({verify:async()=>uid,authorize:async()=>{finalChecks++;return true;},download:async(_kind,_path,signal)=>{timedSignal=signal;return new Promise(()=>{});}},20);
    assert.equal(noStore(await slow(getReq())).status,504);
    assert.equal(timedSignal.aborted,true); assert.equal(finalChecks,1);
    const disconnected = new AbortController();
    const pendingDisconnect = slow(getReq(undefined,'actor-token',disconnected.signal));
    disconnected.abort();
    assert.equal(noStore(await pendingDisconnect).status,499);
    const late = deferred();
    let lateChecks = 0;
    const lateDownload = createImageReadHandler({verify:async()=>uid,authorize:async()=>{lateChecks++;return true;},download:async()=>{await late.promise;return new Response(webp,{headers:{'Content-Type':'image/webp'}});}},20);
    assert.equal(noStore(await lateDownload(getReq())).status,504);
    late.resolve(); await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(lateChecks,1,'late Storage completion must never authorize/send after timeout');
    let canceled = false;
    const hangingBody = createImageReadHandler({verify:async()=>uid,authorize:async()=>true,download:async()=>new Response(new ReadableStream({cancel(){canceled=true;}}),{headers:{'Content-Type':'image/webp'}})},20);
    assert.equal(noStore(await hangingBody(getReq())).status,504);
    assert.equal(canceled,true,'timeout cancels a hanging Storage body');
    for (const finalResult of ['malformed','error','timeout']) {
      let count = 0;
      const finalFailure = createImageReadHandler({verify:async()=>uid,authorize:async()=>{
        if (++count === 1) return true;
        if(finalResult === 'error') throw new Error('server-only-test-key');
        if(finalResult === 'timeout') return new Promise(()=>{});
        return 'true';
      },download:async()=>new Response(webp,{headers:{'Content-Type':'image/webp'}})},20);
      const failure = noStore(await finalFailure(getReq()));
      assert.equal(failure.status,finalResult === 'timeout' ? 504 : 502);
      assert.ok(!(await failure.text()).includes('server-only-test-key'));
    }
    for (const invalid of [new Response(webp,{headers:{'Content-Type':'image/webp','Content-Length':String(3*1024*1024+1)}}),new Response(Buffer.alloc(3*1024*1024+1),{headers:{'Content-Type':'image/webp'}}),new Response(Buffer.alloc(12),{headers:{'Content-Type':'image/webp'}})]) {
      let count = 0;
      const bounded = createImageReadHandler({verify:async()=>uid,authorize:async()=>{count++;return true;},download:async()=>invalid});
      assert.equal(noStore(await bounded(getReq())).status,502);
      assert.equal(count,1,'invalid download must never reach final authorization');
    }
  } finally {
    globalThis.fetch = realFetch;
    for (const key of envKeys) {if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];}
  }
  console.log('PASS account images: POST normalization/reservation; GET actor JWT, double authorization, leave/replace barriers, bounded WebP, timeout/abort and no-store sanitized responses');
} finally {
  // Keep generated sources only for the optional Node coverage reporter, which
  // reads them after this module completes. Normal runs always clean up.
  if (process.env.ACCOUNT_IMAGE_COVERAGE !== '1') {
    await unlink(fixture).catch(() => {}); await unlink(routeFixture).catch(() => {}); await unlink(readFixture).catch(() => {});
  }
}
