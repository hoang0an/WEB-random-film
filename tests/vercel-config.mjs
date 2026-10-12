import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';

for (const environment of ['production', 'preview', 'development', undefined]) {
  const env = {...process.env};
  if (environment === undefined) delete env.VERCEL_ENV;
  else env.VERCEL_ENV = environment;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const {config}=await import('./vercel.ts');process.stdout.write(JSON.stringify(config));"], {env, encoding: 'utf8'});
  assert.equal(result.status, 0, `${environment}: configuration must load: ${result.stderr}`);
  const config = JSON.parse(result.stdout);
  const region = environment === 'production' ? 'sin1' : 'hnd1';
  assert.deepEqual(Object.keys(config.functions).sort(), ['app/api/account/images/route.ts', 'app/api/maintenance/account-images/route.ts']);
  assert.deepEqual(config.functions['app/api/account/images/route.ts'], {regions: [region]});
  assert.deepEqual(config.functions['app/api/maintenance/account-images/route.ts'], {regions: [region], maxDuration: 60});
  assert.deepEqual(config.crons, environment === 'production' ? [{path: '/api/maintenance/account-images', schedule: '0 18 * * *'}] : []);
  assert.equal(config.regions, undefined, 'other functions must retain their existing defaults');
}
assert.equal(existsSync('vercel.json'), false, 'only one Vercel configuration file');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
assert.equal(pkg.dependencies['@vercel/config'], '0.12.0');
assert.equal(lock.packages['node_modules/@vercel/config'].version, '0.12.0');
assert.equal(lock.packages['node_modules/@vercel/config'].integrity, 'sha512-VogSFNNBrUCbukjiZCZ6rkO52NLhv3Xspi9Rx54hTPqkVsp3v6V0M8+qdLDkducsenEEDRDPOJFXsRi9synvoA==');
console.log('PASS Vercel config: isolated environment regions, Production-only daily cron, scoped function limits and pinned dependency');
