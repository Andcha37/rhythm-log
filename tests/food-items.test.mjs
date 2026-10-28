import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFoodItems} from '../app/food-items.js';

test('joins and missing spaces cannot silently merge quantities into food names',()=>{
 const cases=[
  ['닭가슴살 200g과 밥 1공기',['닭가슴살','밥']],
  ['밥 1공기 닭가슴살 200g',['밥','닭가슴살']],
  ['밥 1공기하고 계란 2개',['밥','계란']],
  ['계란 2개랑 바나나 1개',['계란','바나나']],
  ['닭가슴살200g 밥 1공기',['닭가슴살','밥']],
  ['닭가슴살 200g + 밥 1공기',['닭가슴살','밥']],
  ['계란 2개 사과 1개',['계란','사과']],
  ['계란 2개, 우유 200ml, 김밥 한 줄',['계란','우유','김밥']]
 ];
 for(const [raw,expected] of cases)assert.deepEqual(extractFoodItems(raw)?.map(x=>x.name),expected,raw);
});
test('missing quantities stay null; compound dish names remain intact',()=>{
 assert.deepEqual(extractFoodItems('밥 1공기, 김치, 고기 100g'),[
  {name:'밥',quantity:1,unit:'공기'},
  {name:'김치',quantity:null,unit:''},
  {name:'고기',quantity:100,unit:'g'}
 ]);
 assert.deepEqual(extractFoodItems('김치볶음밥 1인분'),[{name:'김치볶음밥',quantity:1,unit:'인분'}]);
 assert.equal(extractFoodItems('밥 1공기, 김치').length,2);
});
test('unsupported or non-eating descriptions are not blindly saved',()=>{
 for(const raw of ['닭가슴살 200g 주문했어','닭가슴살 200g 사고 왔어','김치','닭가슴살 200g 먹지 않았어'])
  assert.equal(extractFoodItems(raw),null,raw);
});
