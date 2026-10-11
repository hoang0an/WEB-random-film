// Offline preparation only. No network, database or hosting changes.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('docs/release/manifest.json','utf8'));
const baseline=execFileSync('git',['show',manifest.pr2_head+':supabase/schema.sql']);
const migration=(await readFile('supabase/migrations/20261010_group_self_management.sql','utf8')).replaceAll('\r\n','\n');
const sha=value=>createHash('sha256').update(value).digest('hex');
assert.equal(sha(baseline),manifest.pr2_baseline_sha256);
assert.equal(sha(migration),manifest.pr3_migration_sha256);
await mkdir('test-results/release',{recursive:true});
await writeFile('test-results/release/pr2-baseline.sql',baseline);
await writeFile('test-results/release/pr3-migration.sql',migration);
console.log('PASS pinned PR2 baseline and PR3 additive migration checksums; prepared files only.');
