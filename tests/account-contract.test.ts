import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAccountName, validateImageInput, ACCOUNT_IMAGE_LIMIT} from '../lib/account-types.ts';

test('account name is normalized with existing 1–80 bounds', () => {
  assert.equal(normalizeAccountName('  An  '), 'An');
  assert.throws(() => normalizeAccountName('  '));
  assert.throws(() => normalizeAccountName('x'.repeat(81)));
});
test('image contract rejects unsupported and oversized files', () => {
  assert.doesNotThrow(() => validateImageInput({size: 120, type: 'image/png'}));
  assert.throws(() => validateImageInput({size: 0, type: 'image/png'}));
  assert.throws(() => validateImageInput({size: ACCOUNT_IMAGE_LIMIT + 1, type: 'image/jpeg'}));
  assert.throws(() => validateImageInput({size: 100, type: 'image/svg+xml'}));
});
