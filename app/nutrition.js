// Generic food estimates, not measured intake or verified product labels.
// Only explicit quantities and supported units are converted. Review is required.
const foods=[
 [/^(?:닭가슴살|닭가슴살구이)$/,[165,31,0,3.6],{팩:100,개:100,인분:150}],
 [/^(?:밥|쌀밥|흰쌀밥|백미밥|공깃밥)$/,[130,2.7,28.2,0.3],{공기:210,그릇:210,인분:210}],
 [/^(?:계란|달걀|삶은계란|삶은달걀)$/,[155,13,1.1,11],{개:50,알:50,인분:100}],
 [/^바나나$/,[89,1.1,23,0.3],{개:120,인분:120}],
 [/^(?:우유|흰우유)$/,[61,3.2,4.8,3.3],{컵:200,팩:200,병:200,인분:200}],
 [/^(?:김밥|기본김밥)$/,[150,5,24,4],{줄:250,인분:250}],
 [/^두부$/,[82,8.1,1.9,4.8],{모:300,인분:150}],
 [/^(?:고구마|찐고구마)$/,[86,1.6,20,0.1],{개:150,인분:150}],
 [/^(?:오트밀|귀리)$/,[389,17,66,7],{컵:80,인분:40}],
 [/^사과$/,[52,0.3,14,0.2],{개:180,인분:180}]
];
const round=x=>Math.round(x*10)/10;
export const isEstimatedNote=note=>typeof note==='string'&&note.startsWith('추정(참고용):');
export function estimateItem(item){
 if(!item||typeof item.name!=='string')return item;
 if(['calories_kcal','protein_g','carbs_g','fat_g'].some(k=>item[k]!==null&&item[k]!==undefined))return item;
 const name=item.name.normalize('NFKC').replace(/[\s()]/g,'').replace(/[을를]$/,'');
 const row=foods.find(([regex])=>regex.test(name));
 if(!row)return item;
 const [,,units]=row,qty=Number(item.quantity),unit=String(item.unit||'').trim().toLowerCase();
 if(item.quantity===null||item.quantity===undefined||!Number.isFinite(qty)||qty<=0)return item;
 let grams,note='';
 if(unit==='g'||unit==='그램')grams=qty;
 else if(unit==='kg')grams=qty*1000;
 else if(unit==='ml'&&/^(?:우유|흰우유)$/.test(name)){grams=qty;note='1mL≈1g';}
 else if(Object.hasOwn(units,unit)){grams=qty*units[unit];note=`1${unit}≈${units[unit]}g`;}
 else return item;
 if(!Number.isFinite(grams)||grams<=0||grams>5000)return item;
 const [calories_kcal,protein_g,carbs_g,fat_g]=row[1].map(n=>round(n*grams/100));
 return {...item,calories_kcal,protein_g,carbs_g,fat_g,nutrition_source:'unknown',
  source_note:`추정(참고용): 일반 식품 평균치${note?' · '+note:''}; 제품·조리법에 따라 차이`};
}
export function enrichMealDraft(draft){
 if(draft?.kind!=='meal'||!Array.isArray(draft.meal?.items))return draft;
 return {...draft,meal:{...draft.meal,items:draft.meal.items.map(estimateItem)}};
}
