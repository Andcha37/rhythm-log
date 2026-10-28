import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateItem,enrichMealDraft,isEstimatedNote} from '../app/nutrition.js';
test('grams give nutrition estimate with unverified provenance',()=>{
 const x=estimateItem({name:'닭가슴살',quantity:200,unit:'g'});
 assert.equal(x.calories_kcal,330);assert.equal(x.protein_g,62);
 assert.equal(x.nutrition_source,'unknown');assert.ok(isEstimatedNote(x.source_note));
});
test('generic Korean portion sizes are documented assumptions',()=>{
 const x=estimateItem({name:'김밥',quantity:2,unit:'줄'});
 assert.equal(x.calories_kcal,750);assert.match(x.source_note,/1줄≈250g/);
});
test('unknown foods, quantities and units stay unestimated',()=>{
 assert.equal(estimateItem({name:'특제찌개',quantity:1,unit:'그릇'}).calories_kcal,undefined);
 assert.equal(estimateItem({name:'계란',quantity:null,unit:'개'}).calories_kcal,undefined);
 assert.equal(estimateItem({name:'계란',quantity:1,unit:'통'}).calories_kcal,undefined);
});
test('provided nutrition is not overwritten',()=>{
 const x=estimateItem({name:'밥',quantity:1,unit:'공기',calories_kcal:310});
 assert.equal(x.calories_kcal,310);assert.equal(x.nutrition_source,undefined);
});
test('mixed recognized and unrecognized items preserve unknowns',()=>{
 const x=enrichMealDraft({kind:'meal',meal:{items:[{name:'바나나',quantity:1,unit:'개'},{name:'특제소스',quantity:10,unit:'g'}]}});
 assert.equal(x.meal.items[0].calories_kcal,106.8);
 assert.equal(x.meal.items[1].calories_kcal,undefined);
});
