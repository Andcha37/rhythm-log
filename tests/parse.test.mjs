import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJson,validateExtraction,sleepMinutes,numericOrNull} from '../app/parse.js';
test('parses JSON in fences',()=>assert.deepEqual(extractJson('```json\n{"kind":"unknown"}\n```'),{kind:'unknown'}));
test('meal normalizer excludes invented nutritional fields',()=>{
 const obj=validateExtraction({kind:'meal',meal:{eaten_at:'2026-10-28T19:00:00+09:00',meal_type:'dinner',items:[{name:'밥',quantity:1,unit:'공기',calories_kcal:9999}]}});
 assert.equal('calories_kcal' in obj.meal.items[0],false);
});
test('rejects ambiguous sleep end time',()=>assert.throws(()=>validateExtraction({kind:'sleep',sleep:{start_at:'2026-10-28T23:00:00+09:00'}})));
test('duration calculation spans midnight',()=>assert.equal(sleepMinutes('2026-10-28T23:00:00+09:00','2026-10-29T07:30:00+09:00'),510));
test('blank nutrition is unknown, not zero',()=>assert.equal(numericOrNull(''),null));
test('rejects impossible calendar date',()=>assert.throws(()=>validateExtraction({kind:'meal',meal:{eaten_at:'2026-02-30T19:00:00+09:00',items:[{name:'밥'}]}})));
