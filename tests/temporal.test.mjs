import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMealTimeFromText,resolveSleepTimesFromText,referenceDates,normalizeModelTimestamp} from '../app/temporal.js';
const now=new Date(2026,9,29,12,0,0);
test('yesterday dinner 7pm resolves without LLM guessing',()=>{
 const time=resolveMealTimeFromText('어제 저녁 7시 닭가슴살 200g과 밥 한 공기를 먹었어',now);
 assert.equal(Date.parse(time),new Date(2026,9,28,19,0,0).getTime());
});
test('tonight and this morning sleep range crosses midnight',()=>{
 const time=resolveSleepTimesFromText('어젯밤 11시 30분부터 오늘 아침 7시 10분까지 잤어',now);
 assert.ok(time);
 assert.equal(Date.parse(time.start_at),new Date(2026,9,28,23,30).getTime());
 assert.equal(Date.parse(time.end_at),new Date(2026,9,29,7,10).getTime());
});
test('unspecified time is not invented',()=>{
 assert.equal(resolveMealTimeFromText('어제 저녁 닭가슴살 200g 먹었어',now),null);
 assert.equal(resolveMealTimeFromText('어제 7시 밥 먹었어',now),null);
});
test('invalid dates and timestamps are rejected',()=>{
 assert.equal(resolveMealTimeFromText('2026-02-30 저녁 7시 먹었어',now),null);
 assert.equal(normalizeModelTimestamp('2026-02-30 19:00'),null);
});
test('browser-local ISO-like output is normalized without inventing clock time',()=>{
 const time=normalizeModelTimestamp('2026-10-28 19:00');
 assert.equal(Date.parse(time),new Date(2026,9,28,19,0,0).getTime());
 assert.equal(normalizeModelTimestamp('어제 저녁'),null);
});
test('reference dates correctly cross a month',()=>{
 const dates=referenceDates(new Date(2026,10,1,9));
 assert.deepEqual([dates.today,dates.yesterday],['2026-11-01','2026-10-31']);
});
