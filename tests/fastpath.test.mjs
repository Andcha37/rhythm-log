import test from 'node:test';
import assert from 'node:assert/strict';
import {tryFastExtract} from '../app/fastpath.js';
const now=new Date(2026,9,29,12,0,0);
test('explicit quantified Korean meal uses model-free parsing',()=>{
 const r=tryFastExtract('어제 저녁 7시 닭가슴살 200g과 밥 1공기',now);
 assert.equal(r?.extractor,'rules');
 assert.equal(r.kind,'meal');
 assert.equal(r.meal.meal_type,'dinner');
 assert.deepEqual(r.meal.items.map(i=>[i.name,i.quantity,i.unit]),[['닭가슴살',200,'g'],['밥',1,'공기']]);
 assert.equal(Date.parse(r.meal.eaten_at),new Date(2026,9,28,19).getTime());
});
test('explicit sleeping window uses model-free parsing',()=>{
 const r=tryFastExtract('어젯밤 11시 30분부터 오늘 아침 7시 10분까지 잤어',now);
 assert.equal(r?.kind,'sleep');
 assert.equal(r.extractor,'rules');
 assert.equal(Date.parse(r.sleep.start_at),new Date(2026,9,28,23,30).getTime());
 assert.equal(Date.parse(r.sleep.end_at),new Date(2026,9,29,7,10).getTime());
});
test('vague and uncertain expressions must fall back, never guess',()=>{
 for(const s of ['어제 저녁 닭가슴살 먹었어','어제 7시 닭가슴살 200g','어제 저녁 7시 닭가슴살을 조금 먹었어','어제 저녁 7시 닭가슴살 200g 사고 왔어']){
  assert.equal(tryFastExtract(s,now),null,s);
 }
});
test('fast path does not invent calories or macros',()=>{
 const r=tryFastExtract('오늘 점심 12시 밥 1공기',now);
 assert.equal(r?.kind,'meal');
 assert.equal('calories_kcal' in r.meal.items[0],false);
});
