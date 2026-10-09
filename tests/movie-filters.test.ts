import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMovies } from '../lib/movie-filters.ts';
import { drawMovie, type Entry } from '../lib/domain.ts';

const movies: Entry[] = [120,121,150,151,null].map((runtime,i) => ({id:i,title:String(i),year:'2026',runtime,overview:'',poster:null,entryId:String(i),addedBy:'you',addedName:'Bạn',watchedAt:null,...(i < 4 ? {genres: i%2 ? ['Hài'] : ['Hành động']} : {})}));
test('duration ranges include boundaries and exclude missing metadata only when active', () => {
  assert.equal(filterMovies(movies,'','all').length,5);
  assert.deepEqual(filterMovies(movies,'','short').map(m=>m.runtime),[120]);
  assert.deepEqual(filterMovies(movies,'','medium').map(m=>m.runtime),[121,150]);
  assert.deepEqual(filterMovies(movies,'','long').map(m=>m.runtime),[151]);
});
test('genre and duration intersect without mutating the input or filling unknown genre', () => {
  const before=structuredClone(movies);
  assert.deepEqual(filterMovies(movies,'Hài','medium').map(m=>m.entryId),['1']);
  assert.equal(filterMovies(movies,'Hoạt hình','all').length,0);
  assert.deepEqual(movies,before);
});
test('existing random keeps excluding watched and previous winners within filtered candidates', () => {
  const pool=filterMovies(movies,'Hài','all');
  assert.equal(drawMovie(pool,'1',()=>0)?.entryId,'3');
  assert.equal(drawMovie(pool.map(m=>({...m,watchedAt:'2026-10-09'})),null,()=>0),null);
  assert.equal(drawMovie(filterMovies(movies,'Hành động','short'),'0'),null);
});
