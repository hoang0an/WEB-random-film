import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canDeleteMovie,canEditOwn,canLeaveGroup,isGroupOwner} from '../lib/group-permissions.ts';
import type {Group,Entry} from '../lib/domain.ts';
const g={ownerId:'a',members:[{id:'a'},{id:'b'}]} as Group;
test('pending movie author or owner only, watched history protected',()=>{
 const movie={addedBy:'b',watchedAt:null} as Entry;
 assert.ok(canDeleteMovie(g,movie,'a'));assert.ok(canDeleteMovie(g,movie,'b'));
 assert.equal(canDeleteMovie(g,movie,'c'),false);
 assert.equal(canDeleteMovie(g,{...movie,addedBy:'a'},'b'),false);
 assert.equal(canDeleteMovie(g,{...movie,watchedAt:'2026-10-10'},'a'),false);
});
test('ownership never overrides contribution authorship or membership',()=>{
 assert.equal(canEditOwn(g,'b','a'),false);assert.ok(canEditOwn(g,'b','b'));
 assert.equal(canEditOwn(g,'c','c'),false);assert.ok(isGroupOwner(g,'a'));
 assert.equal(canLeaveGroup(g,'a'),false);assert.ok(canLeaveGroup(g,'b'));
 assert.equal(canLeaveGroup(g,'c'),false);
});
