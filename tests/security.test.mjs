import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../supabase/migrations/001_initial.sql',import.meta.url),'utf8');
const app=readFileSync(new URL('../app/main.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
test('RLS is enabled on all three private tables',()=>{for(const table of ['meals','meal_items','sleep_sessions'])assert.match(schema,new RegExp(`alter table public\\.${table} enable row level security;`));});
test('each table has owner scoped CRUD policies',()=>{for(const [table,prefix] of [['meals','meals'],['meal_items','meal_items'],['sleep_sessions','sleep']]){for(const operation of ['select','insert','update','delete'])assert.match(schema,new RegExp(`create policy ${prefix}_${operation} on public\\.${table} for ${operation}`));}});
test('composite food owner foreign key is present',()=>assert.match(schema,/foreign key\(meal_id,user_id\) references public\.meals\(id,user_id\)/));
test('user client has no elevated database token',()=>assert.doesNotMatch(app,/service_role|SUPABASE_SERVICE_KEY/));
test('service worker does not cache user data API',()=>assert.match(worker,/u\.origin!==self\.location\.origin/));
test('Clerk JWT subject is the RLS owner, not browser-supplied UUID auth',()=>{
 assert.match(schema,/user_id text not null/);
 assert.match(schema,/auth\.jwt\(\)->>'sub'/);
 assert.doesNotMatch(schema,/auth\.uid\(\)|references auth\.users/);
});
test('No plain-text password or Clerk server secret is embedded in browser config',()=>{
 const config=readFileSync(new URL('../app/config.js',import.meta.url),'utf8');
 assert.doesNotMatch(config,/CLERK_SECRET_KEY|service_role/);
});
