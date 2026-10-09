import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '../lib/domain.ts';
import { easeOutCubic, stopAngle, TAU, wheelCards } from '../lib/movie-wheel.ts';

test('every winner lands at the front after complete turns, including rerolls', () => {
  for (const count of [1,2,6,10]) for (let index=0;index<count;index++) for(const start of [0,1.1,19.8,80]) {
    const end=stopAngle(start,index,count);
    assert.ok(end-start>=2*TAU-1e-10);
    assert.ok(Math.abs(Math.sin(end+index*TAU/count))<1e-10);
    assert.ok(Math.cos(end+index*TAU/count)>0.999999);
  }
});
test('trajectory moves forwards, slows down and finishes exactly', () => {
  assert.equal(easeOutCubic(0),0); assert.equal(easeOutCubic(1),1);
  assert.equal(easeOutCubic(2),1); assert.equal(easeOutCubic(-1),0);
  let previousSpeed=Infinity;
  for(let i=0;i<100;i++) {
    const speed=easeOutCubic((i+1)/100)-easeOutCubic(i/100);
    assert.ok(speed>=0 && speed<=previousSpeed); previousSpeed=speed;
  }
});
test('large visual decks are capped, include actual winner and never mutate the draw pool', () => {
  const pool=Array.from({length:50},(_,i)=>({entryId:String(i)})) as Entry[];
  const before=JSON.stringify(pool);
  const cards=wheelCards(pool,'49');
  assert.equal(cards.length,10); assert.equal(cards.at(-1)?.entryId,'49');
  assert.equal(new Set(cards.map(m=>m.entryId)).size,10);
  assert.equal(JSON.stringify(pool),before);
  assert.deepEqual(wheelCards([]),[]);
});
