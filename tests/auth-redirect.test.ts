import test from 'node:test';
import assert from 'node:assert/strict';
import { validInvite, authRedirect, homeRedirect, linkError } from '../lib/auth-redirect.ts';
test('only alphanumeric invite codes up to 64 characters survive redirects', () => {
  for (const value of ['', 'https://evil.example', '../abc', 'x'.repeat(65), null]) assert.equal(validInvite(value), null);
  assert.equal(validInvite('AbC123'), 'AbC123');
  assert.equal(authRedirect('https://cinema.example', 'callback', 'AbC123'), 'https://cinema.example/auth/callback?invite=AbC123');
  assert.equal(authRedirect('https://cinema.example', 'reset-password', 'x&next=https://evil.example'), 'https://cinema.example/auth/reset-password');
  assert.equal(homeRedirect('ABC'), '/?invite=ABC');
  assert.equal(homeRedirect('https://evil.example'), '/');
});
test('callback errors cannot be ignored just because a stored session exists', () => {
  assert.equal(linkError('?error=access_denied&error_code=otp_expired', ''), 'Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu liên kết mới.');
  assert.equal(linkError('', '#error_description=private+detail'), 'Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu liên kết mới.');
  assert.equal(linkError('?invite=ABC', '#type=recovery'), null);
});
