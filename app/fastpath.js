// Local high-confidence parser: use WebLLM only for inputs beyond these patterns.
import {resolveMealTimeFromText,resolveSleepTimesFromText} from './temporal.js';
import {validateExtraction} from './parse.js';
import {enrichMealDraft} from './nutrition.js';
import {extractFoodItems} from './food-items.js';
const CLOCK=/(?:\d{1,2}\s*시(?:\s*\d{1,2}\s*분?)?|\d{1,2}:\d{2})(?:에|쯤|경)?/u;
const MEAL_END=/\s*(?:(?:을|를)\s*)?(?:먹었어|먹었어요|먹었다|먹었습니다|먹었음|먹음|먹었지|먹었네|먹고|섭취했어|섭취했어요|섭취했다|섭취함)\s*[.!?]?\s*$/u;
export function tryFastExtract(text,now=new Date()){
 const raw=String(text||'').trim();
 if(!raw||raw.length>400)return null;
 if(/잠들|잤|잠을|자고|자서|취침|기상|일어났|일어남|일어나|수면|낮잠|깼|깨었/.test(raw)){
   const times=resolveSleepTimesFromText(raw,now);
   const questions=times?.inference_note?[times.inference_note]:times?[]:['수면 시작·종료의 날짜와 시간을 확인해 주세요. 예: 어젯밤 11시부터 오늘 아침 7시까지 잤어'];
   // Even incomplete sleep logs are reviewable immediately rather than
   // spending 30+ seconds on a model likely to hallucinate missing clocks.
   const sleep={start_at:times?.start_at||null,end_at:times?.end_at||null,sleep_type:/낮잠/.test(raw)?'nap':'main'};
   return {...validateExtraction({kind:'sleep',sleep,questions},{allowMissingTime:!times}),extractor:'rules'};
 }
 const at=resolveMealTimeFromText(raw,now),clock=CLOCK.exec(raw);
 // A missing clock stays null and must be reviewed; it is never filled from the meal label.
 const head=!clock?/^(?:(?:그저께|그제|어제|오늘|내일)\s*)?(?:아침|점심|저녁|간식)(?:에|으로)?\s*/u.exec(raw):null;
 if(!clock&&!head)return null;
 let rest=(clock?raw.slice(clock.index+clock[0].length):raw.slice(head[0].length)).replace(MEAL_END,'').replace(/[.!?]\s*$/,'').trim();
 if(!rest)return null;
 const items=extractFoodItems(rest);
 if(!items)return null;
 const prefix=clock?raw.slice(0,clock.index):head[0];
 const meal_type=/아침/.test(prefix)?'breakfast':/점심/.test(prefix)?'lunch':/저녁|밤/.test(prefix)?'dinner':/간식/.test(prefix)?'snack':'other';
 const questions=at?[]:['식사 날짜와 시간을 직접 확인해 주세요.'];
 if(items.some(item=>item.quantity===null))questions.push('일부 음식의 양이 빠져 있습니다. 저장 전에 확인해 주세요.');
 return {...enrichMealDraft(validateExtraction({kind:'meal',meal:{eaten_at:at,meal_type,items},questions},{allowMissingTime:!at})),extractor:'rules'};
}
