import test from 'node:test';
import assert from 'node:assert/strict';
import {completeWithModelRecovery,isModelNotLoadedError} from '../app/llm.js';

const unloaded=new Error('Model not loaded before trying to complete ChatCompletionRequest. Please ensure you have called MLCEngine.reload(model) to load the model before initiating APIs.');
test('detects the exact WebLLM no-model error',()=>{
 assert.equal(isModelNotLoadedError(unloaded),true);
 assert.equal(isModelNotLoadedError(new Error('WebGPU device lost for another reason')),false);
});
test('unloaded model triggers one rebuild then retries the same request',async()=>{
 let loaded=false,attempts=0,resets=0;
 const notices=[];
 const got=await completeWithModelRecovery(async()=>{
  attempts++;
  if(!loaded)throw unloaded;
  return {choices:[{message:{content:'{"kind":"meal"}'}}]};
 },async()=>{resets++;loaded=true;},message=>notices.push(message));
 assert.equal(attempts,2);assert.equal(resets,1);
 assert.equal(got.choices[0].message.content,'{"kind":"meal"}');
 assert.equal(notices.length,1);
});
test('unrelated errors never trigger a costly model reload',async()=>{
 let resets=0;
 await assert.rejects(
  completeWithModelRecovery(async()=>{throw new Error('invalid grammar')},async()=>{resets++}),
  /invalid grammar/
 );
 assert.equal(resets,0);
});
test('repeated model failure stops after a single repair and displays guidance',async()=>{
 let attempts=0,resets=0;
 await assert.rejects(
  completeWithModelRecovery(async()=>{attempts++;throw unloaded},async()=>{resets++}),
  /기본 1.5B 모델/
 );
 assert.equal(attempts,2);assert.equal(resets,1);
});
test('failed rebuild never loops or hides the original rebuild error',async()=>{
 let attempts=0;
 await assert.rejects(
  completeWithModelRecovery(async()=>{attempts++;throw unloaded},async()=>{throw new Error('GPU 메모리 부족')}),
  /GPU 메모리 부족/
 );
 assert.equal(attempts,1);
});
