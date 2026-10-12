import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import ts from 'typescript';

// The platform preflight can extract initial values without executing mutations.
// Keep this deliberately bounded: no evaluation of variables or expressions.
function literalValue(node, depth = 0) {
  assert.ok(depth <= 8, 'configuration literal depth must be bounded');
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) {
    assert.ok(node.elements.length <= 20, 'configuration array must be bounded');
    return node.elements.map(value => literalValue(value, depth + 1));
  }
  if (ts.isObjectLiteralExpression(node)) {
    assert.ok(node.properties.length <= 20, 'configuration object must be bounded');
    const result = {};
    for (const property of node.properties) {
      assert.ok(ts.isPropertyAssignment(property), 'configuration requires literal property assignments');
      assert.ok(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name), 'configuration requires static property names');
      const key = property.name.text;
      assert.ok(!Object.hasOwn(result, key), 'configuration requires unique property names');
      Object.defineProperty(result, key, {value: literalValue(property.initializer, depth + 1), enumerable: true});
    }
    return result;
  }
  assert.fail(`configuration preflight requires literals; found ${ts.SyntaxKind[node.kind]}`);
}

const source = ts.createSourceFile('vercel.ts', readFileSync('vercel.ts', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const exports = source.statements.filter(statement => statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
assert.equal(exports.length, 1, 'configuration must have one exported declaration');
const exportedConfig = exports[0];
assert.ok(ts.isVariableStatement(exportedConfig), 'configuration must be an exported variable');
assert.ok(exportedConfig.declarationList.flags & ts.NodeFlags.Const, 'configuration must be a const object with mutable properties');
assert.equal(exportedConfig.declarationList.declarations.length, 1, 'configuration must have one declaration');
const declaration = exportedConfig.declarationList.declarations[0];
assert.ok(ts.isIdentifier(declaration.name) && declaration.name.text === 'config', 'configuration must export config');
assert.ok(declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer), 'configuration must initialize a literal object');
assert.deepEqual(literalValue(declaration.initializer), {
  functions: {
    'app/api/account/images/route.ts': {regions: ['hnd1']},
    'app/api/maintenance/account-images/route.ts': {regions: ['hnd1'], maxDuration: 60},
  },
  crons: [],
}, 'initial extracted configuration must be Preview-safe');

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
console.log('PASS Vercel config: literal Preview preflight, isolated environment regions, Production-only daily cron, scoped function limits and pinned dependency');
