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
 for(const m of ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC','Qwen2.5-3B-Instruct-q4f16_1-MLC']) assert.ok(llm.includes(m));
 assert.doesNotMatch(llm,/Qwen2\.5-7B-Instruct|DeepSeek-R1-Distill-Qwen-7B|Llama-3\.2-3B-Instruct/);
 assert.match(llm,/MODELS\['1p5b'\]/);
 assert.match(llm,/prebuiltAppConfig\?\.model_list/);
 assert.match(llm,/CreateMLCEngine\(model/);
});
test('malformed structured model output receives bounded retry through normalized validation',()=>{
 assert.match(llm,/const resolveOutput=\(output\)=>/);
 assert.match(llm,/const obj=extractJson\(output\)/);
 // Model output is validated before the optional generic-food nutrition estimate.
 assert.match(llm,/return enrichMealDraft\(validateExtraction\(obj,\{allowMissingTime:true\}\)\)/);
 assert.match(llm,/try\s*\{\s*return resolveOutput\(output\);\s*\}/);
 assert.match(llm,/추출 형식 재검증/);
 assert.match(llm,/try\s*\{\s*return resolveOutput\(output\);\s*\}/g);
});

test('model selector offers exactly default 1.5B and high-performance 3B',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const chooser=html.match(/<select id="model">([\s\S]*?)<\/select>/)?.[1];
 assert.ok(chooser,'model select exists');
 const options=[...chooser.matchAll(/<option value="([^"]+)"[^>]*>/g)].map(x=>x[1]);
 assert.deepEqual(options,['1p5b','3b']);
 assert.match(chooser,/value="1p5b" selected/);
 assert.doesNotMatch(chooser,/7B|DeepSeek|Llama/);
});

test('JSON output grammar receives a serialized schema string, not undefined',async()=>{
 const {extractionResponseFormat}=await import('../app/llm.js');
 const format=extractionResponseFormat();
 assert.equal(format.type,'json_object');
 assert.equal(typeof format.schema,'string');
 const schema=JSON.parse(format.schema);
 assert.equal(schema.type,'object');
 assert.deepEqual(schema.properties.kind.enum,['meal','sleep','unknown']);
 assert.ok(schema.required.includes('kind'));
 assert.doesNotMatch(llm,/response_format:\\s*\\{type:'json_object'\\}/);
});
