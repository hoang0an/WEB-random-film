import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawMovie, averageRating, validScore, type Entry } from '../lib/domain.ts';
const entries = [{entryId: 'a', watchedAt: null}, {entryId: 'b', watchedAt: null}, {entryId: 'c', watchedAt: '2026-10-09'}] as Entry[];
test('draw excludes watched and immediately skipped movies', () => {
  for (let i = 0; i < 100; i++) assert.equal(drawMovie(entries, 'a')?.entryId, 'b');
});
test('empty and only skipped movie return null', () => {
  assert.equal(drawMovie([], null), null);
  assert.equal(drawMovie(entries.slice(0, 1), 'a'), null);
});
test('both endpoints of random pool are selectable', () => {
  assert.equal(drawMovie(entries, null, () => 0)?.entryId, 'a');
  assert.equal(drawMovie(entries, null, () => 0.999)?.entryId, 'b');
});
test('unrated is null; scores use all members', () => {
  assert.equal(averageRating([]), null);
  assert.equal(averageRating([{score: 8}, {score: 9}] as any), 8.5);
});
test('valid score boundaries and half points', () => {
  for (const n of [1, 1.5, 9.5, 10]) assert.ok(validScore(n));
  for (const n of [0, 10.5, 8.2, NaN, Infinity]) assert.ok(!validScore(n));
});
