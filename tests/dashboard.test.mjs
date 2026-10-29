import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRange,presetRange,rangeDates,queryBounds,aggregateDashboard} from '../app/dashboard.js';

const now=new Date(2026,9,29,12);
test('preset ranges update start and end and include today',()=>{
 assert.deepEqual(presetRange(7,now),{start:'2026-10-23',end:'2026-10-29',count:7});
 assert.deepEqual(presetRange(14,now),{start:'2026-10-16',end:'2026-10-29',count:14});
 assert.deepEqual(presetRange(30,now),{start:'2026-09-30',end:'2026-10-29',count:30});
 assert.deepEqual(presetRange(90,now),{start:'2026-08-01',end:'2026-10-29',count:90});
});
test('custom window includes both endpoints and handles leap days',()=>{
 const range=selectRange('2024-02-28','2024-03-01',{today:now});
 assert.deepEqual(rangeDates(range),['2024-02-28','2024-02-29','2024-03-01']);
 const bounds=queryBounds(range);
 assert.equal(Date.parse(bounds.to)-Date.parse(bounds.from),3*86400000);
});
test('invalid, future, reversed and overly long ranges are rejected',()=>{
 for(const [start,end] of [
  ['2026-02-30','2026-03-01'],['2026-10-30','2026-10-29'],
  ['2026-10-01','2026-10-30'],['2025-01-01','2026-10-29'],
  ['2026-2-01','2026-10-29']
 ])assert.throws(()=>selectRange(start,end,{today:now}),undefined,start+' / '+end);
});
test('selected calendar days drive metrics, sleep is assigned to wake day',()=>{
 const range=selectRange('2026-10-27','2026-10-29',{today:now});
 const rows={meals:[
   {id:'m1',eaten_at:'2026-10-27T12:00:00Z'},
   {id:'m2',eaten_at:'2026-10-27T13:00:00Z'},
   {id:'m3',eaten_at:'2026-10-29T12:00:00Z'},
   {id:'old',eaten_at:'2026-10-10T12:00:00Z'}
 ],items:[
   {meal_id:'m1',calories_kcal:500},
   {meal_id:'m2',calories_kcal:null},
   {meal_id:'m3',calories_kcal:300},
   {meal_id:'old',calories_kcal:999}
 ],sleep:[
   {start_at:'2026-10-28T00:00:00Z',end_at:'2026-10-28T08:00:00Z',duration_minutes:480}
 ]};
 const got=aggregateDashboard(rows,range);
 assert.equal(got.mealsCount,3);assert.equal(got.totalCalories,800);
 assert.equal(got.partialDays,1);assert.equal(got.completeMeals,2);
 assert.equal(got.meanSleepHours,8);
 assert.deepEqual(got.mealSeries.map(x=>x.value),[500,null,300]);
 assert.deepEqual(got.sleepSeries.map(x=>x.value),[null,8,null]);
});
test('missing nutrition and missing days are not treated as zero calories',()=>{
 const range=selectRange('2026-10-28','2026-10-29',{today:now});
 const got=aggregateDashboard({meals:[{id:'m',eaten_at:'2026-10-28T12:00:00Z'}],items:[],sleep:[]},range);
 assert.equal(got.totalCalories,null);
 assert.deepEqual(got.mealSeries.map(x=>x.value),[null,null]);
 assert.equal(got.meanSleepHours,null);
});
test('dashboard markup binds custom range selectors and independent refresh',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const main=readFileSync(new URL('../app/main.js',import.meta.url),'utf8');
 for(const id of ['range-start','range-end','range-apply','dashboard-range-status','sleep-chart-period','meal-chart-period'])assert.ok(html.includes('id="'+id+'"'));
 for(const n of [7,14,30,90])assert.ok(html.includes('data-range-days="'+n+'"'));
 assert.match(main,/fetchDashboardRows\('meals'/);
 assert.match(main,/fetchDashboardRows\('meal_items'/);
 assert.match(main,/fetchDashboardRows\('sleep_sessions'/);
 assert.match(main,/await loadDashboardRange\(\)/);
 assert.match(main,/\.range\(offset,offset\+batchSize-1\)/);
});
