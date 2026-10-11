import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withAccountProfile} from '../lib/account-integration.ts';
import {initialStore} from '../lib/demo.ts';
test('a stale group snapshot cannot restore an old own name or lose the current avatar', () => {
  const store = initialStore(), group = store.groups[0];
  group.comments.push({id:'c',entryId:group.movies[0].entryId,userId:'demo-you',name:'Old',body:'Keep',createdAt:'2026-10-11'});
  const next = withAccountProfile(store, {id:'demo-you',name:'New',avatarPath:'demo-you/avatar/current.webp',coverPath:'private-cover',revision:2});
  assert.equal(next.groups[0].members.find(p=>p.id==='demo-you')?.name,'New');
  assert.equal(next.groups[0].comments[0].avatarPath,'demo-you/avatar/current.webp');
  assert.equal(next.groups[0].comments[0].body,'Keep');
  assert.equal(next.groups[0].members.find(p=>p.id==='demo-minh')?.name,'Minh');
  assert.ok(!JSON.stringify(next).includes('private-cover'));
  assert.equal(store.groups[0].comments[0].name,'Old');
});
