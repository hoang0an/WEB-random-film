import test from 'node:test';
import assert from 'node:assert/strict';
import {withRequestDeadline,RequestTimeoutError} from '../lib/request-deadline.ts';

test('deadline rejects a request that never settles and aborts its transport',async()=>{
  let signal:AbortSignal|undefined;
  await assert.rejects(withRequestDeadline(s=>{signal=s;return new Promise<never>(()=>{});},10),RequestTimeoutError);
  assert.equal(signal?.aborted,true);
});
test('deadline includes time before fetch and ignores a late success',async()=>{
  let complete!:(value:string)=>void;
  const request=withRequestDeadline(()=>new Promise<string>(resolve=>{complete=resolve;}),10);
  await assert.rejects(request,RequestTimeoutError);
  complete('late commit');
  await assert.rejects(request,RequestTimeoutError);
});
test('a completed request returns its value without aborting later',async()=>{
  let signal:AbortSignal|undefined;
  assert.equal(await withRequestDeadline(s=>{signal=s;return Promise.resolve(42);},10),42);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(signal?.aborted,false);
});
test('service rejection and synchronous errors preserve their identity',async()=>{
  const failure=new Error('forbidden');
  await assert.rejects(withRequestDeadline(()=>Promise.reject(failure),10),e=>e===failure);
  await assert.rejects(withRequestDeadline(()=>{throw failure;},10),e=>e===failure);
});
