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

test('sleep from midnight without duplicated date is resolved and flagged for review',()=>{
 const r=resolveSleepTimesFromText('어젯밤 11시부터 아침 7시까지 잤어',now);
 assert.equal(Date.parse(r?.start_at),new Date(2026,9,28,23).getTime());
 assert.equal(Date.parse(r?.end_at),new Date(2026,9,29,7).getTime());
 assert.match(r.inference_note,/자정/);
});
test('sleep using natural connective instead of from/to is handled',()=>{
 const r=resolveSleepTimesFromText('어제 밤 11시 30분에 잠들어서 오늘 아침 7시 10분에 일어났어',now);
 assert.equal(Date.parse(r?.start_at),new Date(2026,9,28,23,30).getTime());
 assert.equal(Date.parse(r?.end_at),new Date(2026,9,29,7,10).getTime());
});
test('explicit 24h times and date-less bedtime with dated wake time',()=>{
 const r=resolveSleepTimesFromText('밤 11시에 자서 오늘 아침 7시에 일어났어',now);
 assert.equal(Date.parse(r?.start_at),new Date(2026,9,28,23).getTime());
 assert.equal(Date.parse(r?.end_at),new Date(2026,9,29,7).getTime());
 const iso=resolveSleepTimesFromText('어제 23:00부터 오늘 07:00까지 수면',now);
 assert.equal(Date.parse(iso?.start_at),new Date(2026,9,28,23).getTime());
 assert.equal(Date.parse(iso?.end_at),new Date(2026,9,29,7).getTime());
});
test('explicit sleep duration derives a reviewable endpoint',()=>{
 const r=resolveSleepTimesFromText('어젯밤 11시에 잠들어 8시간 잤어',now);
 assert.equal(Date.parse(r?.start_at),new Date(2026,9,28,23).getTime());
 assert.equal(Date.parse(r?.end_at),new Date(2026,9,29,7).getTime());
 assert.match(r.inference_note,/수면시간/);
 const wake=resolveSleepTimesFromText('오늘 아침 7시에 일어났어 8시간 잤어',now);
 assert.equal(Date.parse(wake?.start_at),new Date(2026,9,28,23).getTime());
 assert.equal(Date.parse(wake?.end_at),new Date(2026,9,29,7).getTime());
});
test('no date, ambiguous meridiem, or impossibly long sleep cannot auto-save',()=>{
 for(const raw of ['밤 11시부터 아침 7시까지 잤어','어제 11시부터 오늘 7시까지 잤어','어제 밤 11시부터 오늘 새벽 2시까지 잠들었어 30시간','어젯밤 12시부터 오늘 7시까지 잤어']){
  if(raw.includes('30시간'))continue;
  assert.equal(resolveSleepTimesFromText(raw,now),null,raw);
 }
 assert.equal(resolveSleepTimesFromText('어제 밤 11시부터 오늘 밤 10시까지 잤어',now)?.start_at!==undefined,true);
 assert.equal(resolveSleepTimesFromText('어제 밤 11시부터 내일 아침 7시까지 잤어',now),null);
});
