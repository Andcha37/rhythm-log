import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsername,usernameValid} from '../app/username.js';
import worker from '../worker-username-check.js';
const origin='https://example.github.io';
const req=username=>new Request('https://test.workers.dev/check?username='+encodeURIComponent(username),{headers:{Origin:origin}});
const env={ALLOWED_ORIGINS:origin,CLERK_SECRET_KEY:'test-secret'};
test('Username validation: normalized, ASCII-only, length bounded',()=>{
 assert.equal(normalizeUsername('  Andy_07 '),'andy_07');
 assert.equal(usernameValid('Andy_07'),true);
 for(const name of ['ab','3name','가나다라','a bcd','a'.repeat(25)])assert.equal(usernameValid(name),false,name);
});
test('Worker refuses unapproved origin',async()=>{
 const r=await worker.fetch(new Request('https://test.workers.dev/check?username=andy',{headers:{Origin:'https://attacker.example'}}),env);
 assert.equal(r.status,403);
});
test('Worker refuses check without server secret',async()=>{
 const r=await worker.fetch(req('andy99'),{ALLOWED_ORIGINS:origin});
 assert.equal(r.status,503);
});
test('Worker checks exact username, not substring',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify([{username:'andy999'}]),{status:200});
 try{const r=await worker.fetch(req('andy99'),env);assert.equal(r.status,200);assert.equal((await r.json()).available,true);}finally{globalThis.fetch=old}
});
test('Worker marks taken usernames',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify([{username:'Andy99'}]),{status:200});
 try{const r=await worker.fetch(req('andy99'),env);assert.equal((await r.json()).available,false);}finally{globalThis.fetch=old}
});
