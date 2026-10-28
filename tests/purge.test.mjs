import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/002_user_data_purge.sql',import.meta.url),'utf8');
const app=readFileSync(new URL('../app/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('purge function executes as invoker, not security definer',()=>{
  assert.match(migration,/security invoker/i);
  assert.doesNotMatch(migration,/security definer/i);
});
test('deletion is filtered by authenticated user',()=>{
  assert.match(migration,/auth\.jwt\(\)->>'sub'/);
  for (const table of ['meal_items','meals','sleep_sessions']) assert.match(migration,new RegExp(`delete from public\\.${table} where user_id = me`));
});
test('purge is authenticated only and requires confirmation',()=>{
  assert.match(migration,/grant execute on function public\.purge_my_records\(\) to authenticated/);
  assert.match(app,/window\.prompt\([^\n]*전체삭제/);
  assert.match(app,/if\(answer!=='전체삭제'\)return/);
  assert.match(html,/id="purge-records"/);
});
