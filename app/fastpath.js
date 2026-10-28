// Local high-confidence parser: use WebLLM only for inputs beyond these patterns.
import {resolveMealTimeFromText,resolveSleepTimesFromText} from './temporal.js';
import {validateExtraction} from './parse.js';
const CLOCK=/(?:\d{1,2}\s*시(?:\s*\d{1,2}\s*분?)?|\d{1,2}:\d{2})(?:에|쯤|경)?/u;
const ITEM=/^\s*(?:(?:그리고|과|와|,)\s*)?([\p{L}][\p{L}\p{N}\s()\-]{0,49}?)\s+(\d+(?:\.\d+)?)\s*(그램|kg|mL|ml|g|공기|개|컵|조각|팩|그릇|봉지)(?=\s*(?:과|와|그리고|,|$))/u;
const MEAL_END=/\s*(?:(?:을|를)\s*)?(?:먹었어|먹었어요|먹었다|먹었습니다|먹었음|먹음|먹었지|먹었네|먹고|섭취했어|섭취했어요|섭취했다|섭취함)\s*[.!?]?\s*$/u;
export function tryFastExtract(text,now=new Date()){
 const raw=String(text||'').trim();
 if(!raw||raw.length>400)return null;
 if(/잠|잤|수면|취침|기상|일어났/.test(raw)){
   const times=resolveSleepTimesFromText(raw,now);
   if(times)return {...validateExtraction({kind:'sleep',sleep:{...times,sleep_type:'main'},questions:[]}),extractor:'rules'};
   return null;
 }
 const at=resolveMealTimeFromText(raw,now),clock=CLOCK.exec(raw);
 if(!at||!clock)return null;
 let rest=raw.slice(clock.index+clock[0].length).replace(MEAL_END,'').replace(/[.!?]\s*$/,'').trim();
 if(!rest)return null;
 const items=[];
 while(rest.trim()&&items.length<15){
   const m=ITEM.exec(rest);
   if(!m)return null;
   const name=m[1].trim().replace(/(?:을|를)$/u,'');
   if(!name||/(?:\s과\s|\s와\s|그리고|,)/u.test(name))return null;
   const quantity=Number(m[2]);
   if(!Number.isFinite(quantity)||quantity<=0)return null;
   items.push({name,quantity,unit:m[3]==='그램'?'g':m[3]});
   rest=rest.slice(m[0].length);
 }
 if(rest.trim()||!items.length)return null;
 const prefix=raw.slice(0,clock.index);
 const meal_type=/아침/.test(prefix)?'breakfast':/점심/.test(prefix)?'lunch':/저녁|밤/.test(prefix)?'dinner':/간식/.test(prefix)?'snack':'other';
 return {...validateExtraction({kind:'meal',meal:{eaten_at:at,meal_type,items},questions:[]}),extractor:'rules'};
}
