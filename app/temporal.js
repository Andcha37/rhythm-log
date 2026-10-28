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
export function resolveSleepTimesFromText(text,now=new Date()){
 const segments=String(text).split('부터');
 if(segments.length!==2)return null;
 const start=resolveMealTimeFromText(segments[0],now);
 const end=resolveMealTimeFromText(segments[1].split('까지')[0],now);
 if(!start||!end||Date.parse(end)<=Date.parse(start))return null;
 return {start_at:start,end_at:end};
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
