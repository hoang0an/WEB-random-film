import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAuthService } from '../lib/auth-service.ts';

function fixture(error: unknown = null) {
  const calls: {method: string; args: unknown[]}[] = [];
  const auth = Object.fromEntries(['signUp', 'signInWithPassword', 'resend', 'resetPasswordForEmail', 'updateUser', 'signOut', 'signInWithOAuth'].map(method => [method, async (...args: unknown[]) => {
    calls.push({method, args}); return {data: {session: null}, error};
  }]));
  return {calls, service: createAuthService({auth} as unknown as SupabaseClient)};
}

test('signup normalizes email and name, preserves password and returns no-session result', async () => {
  const {calls, service} = fixture();
  const result = await service.signup({email: ' an@example.com ', password: ' secret12 ', name: ' An '}, 'https://cinema.example', 'AbC123');
  assert.equal(result.session, null);
  assert.deepEqual(calls, [{method: 'signUp', args: [{email: 'an@example.com', password: ' secret12 ', options: {data: {name: 'An'}, emailRedirectTo: 'https://cinema.example/auth/callback?invite=AbC123'}}]}]);
});
test('login preserves password; resend uses only email and safe redirect', async () => {
  const {calls, service} = fixture();
  await service.login(' an@example.com ', ' old ');
  await service.resend(' an@example.com ', 'https://cinema.example', 'https://evil.example');
  assert.deepEqual(calls[0], {method: 'signInWithPassword', args: [{email: 'an@example.com', password: ' old '}]});
  assert.deepEqual(calls[1], {method: 'resend', args: [{type: 'signup', email: 'an@example.com', options: {emailRedirectTo: 'https://cinema.example/auth/callback'}}]});
});
test('recovery uses fixed reset route; update and logout use SDK contracts', async () => {
  const {calls, service} = fixture();
  await service.recover(' an@example.com ', 'https://cinema.example');
  await service.updatePassword(' next1234 ');
  await service.logout();
  assert.deepEqual(calls, [
    {method: 'resetPasswordForEmail', args: ['an@example.com', {redirectTo: 'https://cinema.example/auth/reset-password'}]},
    {method: 'updateUser', args: [{password: ' next1234 '}]},
    {method: 'signOut', args: [{scope: 'local'}]},
  ]);
  await service.recover('an@example.com', 'https://cinema.example', 'INVITE1');
  assert.deepEqual(calls[3].args, ['an@example.com', {redirectTo: 'https://cinema.example/auth/reset-password?invite=INVITE1'}]);
});
test('disabled Google never calls SDK, enabled Google uses callback invite', async () => {
  const {calls, service} = fixture();
  await assert.rejects(service.google(false, 'https://cinema.example'));
  assert.equal(calls.length, 0);
  await service.google(true, 'https://cinema.example', 'INVITE1');
  assert.deepEqual(calls[0], {method: 'signInWithOAuth', args: [{provider: 'google', options: {redirectTo: 'https://cinema.example/auth/callback?invite=INVITE1'}}]});
});
test('SDK errors propagate for every operation', async () => {
  const error = new Error('mock failure');
  const {service} = fixture(error);
  for (const operation of [
    () => service.signup({email: 'a@example.com', password: 'secret12', name: 'An'}, 'https://cinema.example'),
    () => service.login('a@example.com', 'secret12'),
    () => service.resend('a@example.com', 'https://cinema.example'),
    () => service.recover('a@example.com', 'https://cinema.example'),
    () => service.updatePassword('secret12'),
    () => service.logout(),
    () => service.google(true, 'https://cinema.example'),
  ]) await assert.rejects(operation, error);
});
