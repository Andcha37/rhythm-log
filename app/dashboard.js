// Pure calendar and series calculations. Dates are local calendar days, not UTC buckets.
const MS_DAY=86400000;
const DAY_LIMIT=366;
const DAY_PATTERN=/^(\d{4})-(\d{2})-(\d{2})$/;

export function localDateKey(value=new Date()){
 const d=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(d.getTime()))throw Error('날짜를 확인해 주세요.');
 return String(d.getFullYear()).padStart(4,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function dateStamp(value){
 const m=DAY_PATTERN.exec(String(value));
 if(!m)throw Error('시작일과 종료일을 정확하게 선택해 주세요.');
 const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]);
 const timestamp=Date.UTC(y,mo-1,day);
 const d=new Date(timestamp);
 if(d.getUTCFullYear()!==y||d.getUTCMonth()+1!==mo||d.getUTCDate()!==day)
  throw Error('존재하지 않는 날짜입니다.');
 return timestamp;
}
export function selectRange(start,end,{today=new Date(),maxDays=DAY_LIMIT}={}){
 const first=dateStamp(start),last=dateStamp(end),now=dateStamp(localDateKey(today));
 if(first>last)throw Error('시작일은 종료일보다 늦을 수 없습니다.');
 if(last>now)throw Error('조회 종료일은 오늘 이후일 수 없습니다.');
 const count=Math.round((last-first)/MS_DAY)+1;
 if(count>maxDays)throw Error('한 번에 최대 '+maxDays+'일까지 조회할 수 있습니다.');
 return {start,end,count};
}
export function presetRange(n,today=new Date()){
 if(!Number.isInteger(n)||n<1||n>DAY_LIMIT)throw Error('잘못된 조회 기간입니다.');
 const end=localDateKey(today),begin=new Date(today);
 begin.setHours(12,0,0,0);
 begin.setDate(begin.getDate()-n+1);
 return selectRange(localDateKey(begin),end,{today});
}
export function rangeDates(range){
 const start=dateStamp(range.start),count=selectRange(range.start,range.end,{today:new Date(Math.max(Date.now(),dateStamp(range.end))),maxDays:DAY_LIMIT}).count;
 return Array.from({length:count},(_,i)=>new Date(start+i*MS_DAY).toISOString().slice(0,10));
}
export function queryBounds(range){
 const valid=selectRange(range.start,range.end,{today:new Date(Math.max(Date.now(),dateStamp(range.end)))});
 const from=new Date(valid.start+'T00:00:00');
 const endDay=new Date(valid.end+'T00:00:00');
 endDay.setDate(endDay.getDate()+1);
 return {from:from.toISOString(),to:endDay.toISOString()};
}
export function aggregateDashboard({meals=[],items=[],sleep=[]},range){
 const dates=rangeDates(range),byMeal=new Map(),groupedMeals=new Map(),groupedSleep=new Map();
 for(const item of items){
  const group=byMeal.get(item.meal_id)||[];
  group.push(item);byMeal.set(item.meal_id,group);
 }
 for(const meal of meals){
  if(!meal?.eaten_at)continue;
  const date=localDateKey(meal.eaten_at),group=groupedMeals.get(date)||[];
  group.push(meal);groupedMeals.set(date,group);
 }
 for(const session of sleep){
  if(!session?.end_at)continue;
  const date=localDateKey(session.end_at),group=groupedSleep.get(date)||[];
  group.push(session);groupedSleep.set(date,group);
 }
 const calories=meal=>{
  const food=byMeal.get(meal.id)||[];
  if(!food.length||food.some(x=>x.calories_kcal===null||x.calories_kcal===undefined))return null;
  return food.reduce((sum,x)=>sum+Number(x.calories_kcal),0);
 };
 const mealSeries=[],sleepSeries=[],durations=[];
 let mealsCount=0,totalCalories=0,completeMeals=0,partialDays=0;
 for(const date of dates){
  const ms=groupedMeals.get(date)||[],ss=groupedSleep.get(date)||[];
  mealsCount+=ms.length;
  const caloric=ms.map(calories),known=caloric.filter(v=>v!==null);
  const partial=ms.length>known.length;
  if(partial)partialDays++;
  totalCalories+=known.reduce((a,b)=>a+b,0);
  completeMeals+=known.length;
  mealSeries.push({date,value:known.length?known.reduce((a,b)=>a+b,0):null,partial});
  const sessions=ss.map(s=>Number(s.duration_minutes)).filter(v=>Number.isFinite(v)&&v>0);
  durations.push(...sessions);
  sleepSeries.push({date,value:sessions.length?sessions.reduce((a,b)=>a+b,0)/60:null});
 }
 return {mealSeries,sleepSeries,mealsCount,
  meanSleepHours:durations.length?durations.reduce((a,b)=>a+b,0)/durations.length/60:null,
  totalCalories:completeMeals?totalCalories:null,completeMeals,partialDays};
}
