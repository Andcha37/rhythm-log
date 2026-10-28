import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const llm=readFileSync(new URL('../app/llm.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
test('WebLLM is bundled by Vite, not imported from a third-party CDN',()=>{
 assert.equal(pkg.dependencies['@mlc-ai/web-llm'],'0.2.86');
 assert.match(llm,/import\('@mlc-ai\/web-llm'\)/);
 assert.doesNotMatch(llm,/import\(['"]https?:\/\//);
});
test('selected models are registered, checked, and initialized in the browser',()=>{
 for(const m of ['Qwen2.5-7B-Instruct-q4f16_1-MLC','Llama-3.2-3B-Instruct-q4f16_1-MLC']) assert.ok(llm.includes(m));
 assert.match(llm,/prebuiltAppConfig\?\.model_list/);
 assert.match(llm,/CreateMLCEngine\(model/);
});
test('malformed structured model output receives bounded retry',()=>{
 assert.match(llm,/추출 형식 재검증/);
 assert.match(llm,/validateExtraction\(extractJson\(output\)\)/);
});
