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
test('known generic food produces explicitly unverified kcal estimate',()=>{
 const r=tryFastExtract('오늘 점심 12시 밥 1공기',now);
 assert.equal(r?.kind,'meal');
 assert.equal(r.meal.items[0].calories_kcal,273);
 assert.equal(r.meal.items[0].nutrition_source,'unknown');
 assert.match(r.meal.items[0].source_note,/추정\(참고용\)/);
});
test('Korean counters without clock remain quick but require manual time',()=>{
 const r=tryFastExtract('어제 점심 김밥 두 줄 먹었어',now);
 assert.equal(r?.extractor,'rules');
 assert.equal(r.meal.eaten_at,null);
 assert.equal(r.meal.items[0].quantity,2);
 assert.equal(r.meal.items[0].calories_kcal,750);
 assert.ok(r.questions.length);
});

test('colloquial cross-midnight sleep bypasses slow model and fills both fields',()=>{
 const r=tryFastExtract('어젯밤 11시부터 아침 7시까지 잤어',now);
 assert.equal(r?.kind,'sleep');assert.equal(r?.extractor,'rules');
 assert.ok(r.sleep.start_at);assert.ok(r.sleep.end_at);
 assert.ok(r.questions.length);
});
test('insufficient sleep clock information opens editable review without guessing',()=>{
 const r=tryFastExtract('어제 잘 못 잤어',now);
 assert.equal(r?.kind,'sleep');assert.equal(r.sleep.start_at,null);
 assert.equal(r.sleep.end_at,null);assert.ok(r.questions.length);
});
test('food names that include 잠 should not be mistaken for sleep',()=>{
 assert.equal(tryFastExtract('어제 점심 12시 잠봉뵈르 1개',now)?.kind,'meal');
});
