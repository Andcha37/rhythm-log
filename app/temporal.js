// Deterministic interpretation of explicitly stated Korean calendar/clock expressions.
// Never infer a missing clock time or invent a meal date.
const two=n=>String(n).padStart(2,'0');
export function localTimestamp(date){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return null;
 const offsetMinutes=-date.getTimezoneOffset(),sign=offsetMinutes>=0?'+':'-';
 const abs=Math.abs(offsetMinutes);
 return `${date.getFullYear()}-${two(date.getMonth()+1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}${sign}${two(Math.floor(abs/60))}:${two(abs%60)}`;
}
export function referenceDates(now=new Date()){
 const d=n=>{const date=new Date(now);date.setDate(date.getDate()+n);return localTimestamp(date).slice(0,10);};
 return {today:d(0),yesterday:d(-1),dayBeforeYesterday:d(-2),tomorrow:d(1)};
}
function calendarDate(text,now){
 const rel=/그저께|그제|어젯밤|어젯|어제|오늘|내일/.exec(text);
 if(rel){const shift=/그저께|그제/.test(rel[0])?-2:/어젯|어제/.test(rel[0])?-1:rel[0]==='내일'?1:0;const d=new Date(now);d.setDate(d.getDate()+shift);return [d.getFullYear(),d.getMonth()+1,d.getDate()];}
 const iso=/(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})\s*일?/.exec(text);
 if(iso)return [Number(iso[1]),Number(iso[2]),Number(iso[3])];
 const md=/(\d{1,2})월\s*(\d{1,2})일/.exec(text);
 if(md)return [now.getFullYear(),Number(md[1]),Number(md[2])];
 return null;
}
function clockTime(text){
 const m=/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분?)?|(\d{1,2}):(\d{2})/.exec(text);
 if(!m)return null;
 let hour=Number(m[1]??m[3]),min=Number(m[2]??m[4]??0);
 if(hour>23||min>59)return null;
 const prior=text.slice(Math.max(0,m.index-20),m.index);
 const marker=/(오전|오후|새벽|아침|점심|저녁|밤)(?:\s*\S{0,5})?$/.exec(prior)?.[1];
 if(hour<12){
  if(marker==='오후'||marker==='저녁'||marker==='밤'||marker==='점심')hour+=12;
  else if(!marker && hour<=12)return null; // 7시 alone does not say AM/PM
 }else if(hour===12 && (marker==='오전'||marker==='새벽'))hour=0;
 return [hour,min];
}
export function resolveMealTimeFromText(text,now=new Date()){
 const ymd=calendarDate(String(text),now),hm=clockTime(String(text));
 if(!ymd||!hm)return null;
 const [y,mo,day]=ymd,[h,min]=hm,d=new Date(y,mo-1,day,h,min,0,0);
 if(d.getFullYear()!==y||d.getMonth()+1!==mo||d.getDate()!==day||d.getHours()!==h||d.getMinutes()!==min)return null;
 return localTimestamp(d);
}
// Parse only source-grounded sleep clocks. A dated endpoint allows the other
// date to be inferred for an overnight interval, but not a missing clock time.
const SLEEP_CLOCK=/(오전|오후|새벽|아침|점심|저녁|밤|낮)?\s*(\d{1,2})(?:\s*시(?!간)(?:\s*(\d{1,2})\s*분?)?|:(\d{2}))/gu;
function sleepClocks(text,now){
 const clocks=[],rx=new RegExp(SLEEP_CLOCK.source,'gu');
 let previousEnd=0,m;
 while((m=rx.exec(text))!==null){
  const prefix=text.slice(previousEnd,m.index),marker=m[1]||'';
  const h=Number(m[2]),minute=Number(m[3]??m[4]??0);
  previousEnd=rx.lastIndex;
  if(h>23||minute>59)return [];
  const next=text.slice(rx.lastIndex),nextClockIndex=next.search(rx);
  const after=next.slice(0,nextClockIndex<0?undefined:nextClockIndex);
  const digital=m[4]!==undefined;
  let hour=h;
  if(marker==='밤'&&h===12)return []; // "밤 12시" has an ambiguous calendar date.
  if(h<=12){
   if(/오후|저녁|밤|점심|낮/.test(marker)){if(h<12)hour+=12;}
   else if(/오전|새벽|아침/.test(marker)){if(h===12)hour=0;}
   else if(!digital&&h<12&&/(?:일어났|일어남|일어나|기상|깼|깨었|눈을\s*떴)/.test(after)){hour=h;}
   else if(!digital&&h<12)return [];
  }
  clocks.push({date:calendarDate(prefix,now),hour,minute,after});
 }
 return clocks;
}
function sleepDate(ymd,clock){
 if(!ymd||!clock)return null;
 const [year,month,day]=ymd,d=new Date(year,month-1,day,clock.hour,clock.minute,0,0);
 return d.getFullYear()===year&&d.getMonth()+1===month&&d.getDate()===day&&d.getHours()===clock.hour&&d.getMinutes()===clock.minute?d:null;
}
function sleepResult(start,end,note){
 if(!start||!end)return null;
 const duration=(end.getTime()-start.getTime())/60000;
 if(duration<=0||duration>1440)return null;
 return {start_at:localTimestamp(start),end_at:localTimestamp(end),...(note?{inference_note:note}:{})};
}
export function resolveSleepTimesFromText(text,now=new Date()){
 const raw=String(text||''),clocks=sleepClocks(raw,now);
 if(clocks.length===2){
  const [first,second]=clocks;
  if(!first.date&&!second.date)return null;
  let start=sleepDate(first.date||second.date,first);
  let end=sleepDate(second.date||first.date,second);
  if(!start||!end)return null;
  let note;
  if(!second.date&&end<=start){
   end.setDate(end.getDate()+1);
   note='종료 날짜는 자정을 넘긴 수면으로 해석했습니다. 확인해 주세요.';
  }else if(!first.date&&start>=end){
   start.setDate(start.getDate()-1);
   note='시작 날짜는 전날로 해석했습니다. 확인해 주세요.';
  }
  return sleepResult(start,end,note);
 }
 if(clocks.length!==1)return null;
 // A stated duration can derive an endpoint, never a guessed sleep duration.
 const one=clocks[0];
 if(!one.date)return null;
 const duration=/(\d{1,2})\s*시간(?:\s*(\d{1,2})\s*분)?/.exec(raw);
 if(!duration)return null;
 const minutes=Number(duration[1])*60+Number(duration[2]||0);
 if(minutes<=0||minutes>1440||Number(duration[2]||0)>59)return null;
 const endpoint=sleepDate(one.date,one);
 if(!endpoint)return null;
 const roleText=one.after.split(/\d{1,2}\s*시간/)[0];
 const awake=/(?:일어났|일어남|일어나|기상|깼|깨었|눈을\s*떴)/.test(roleText);
 const asleep=/(?:잠들|잤|자고|자서|취침|잠을\s*잤)/.test(roleText);
 if(awake===asleep)return null;
 const start=awake?new Date(endpoint.getTime()-minutes*60000):endpoint;
 const end=awake?endpoint:new Date(endpoint.getTime()+minutes*60000);
 return sleepResult(start,end,'수면시간을 이용해 '+(awake?'시작':'종료')+' 시각을 계산했습니다. 확인해 주세요.');
}
export function normalizeModelTimestamp(value){
 if(typeof value!=='string')return null;
 const s=value.trim();
 if(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(s))return s;
 const m=/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?$/.exec(s);
 if(!m)return null;
 const [y,mo,day,h,mi,sec]=m.slice(1).map(Number);
 const d=new Date(y,mo-1,day,h,mi,sec||0);
 if(d.getFullYear()!==y||d.getMonth()+1!==mo||d.getDate()!==day||d.getHours()!==h||d.getMinutes()!==mi)return null;
 return localTimestamp(d);
}
