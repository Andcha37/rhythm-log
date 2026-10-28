/** Pure validators. Trust neither LLM responses nor data received from a browser UI. */
export function extractJson(text) {
  const value = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(value); } catch {
    const start = value.indexOf('{'), end = value.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI가 유효한 JSON을 반환하지 않았습니다.');
    try { return JSON.parse(value.slice(start, end + 1)); }
    catch { throw new Error('AI 출력이 JSON 형식에 맞지 않습니다. 다시 입력하거나 수동 기록하세요.'); }
  }
}
export function validTime(value) {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return false;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if(!m)return false;const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]),hr=Number(m[4]),min=Number(m[5]),sec=Number(m[6]||0);
  const check=new Date(Date.UTC(y,mo-1,day));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()+1!==mo||check.getUTCDate()!==day||hr>23||min>59||sec>59)return false;
  const d=new Date(value);return Number.isFinite(d.getTime());
}
export function validateExtraction(data,{allowMissingTime=false}={}) {
  if(!data || typeof data !== 'object') throw new Error('AI 응답이 객체가 아닙니다.');
  if (data.kind === 'meal') {
    if(!data.meal)throw new Error('식사 정보를 찾지 못했습니다.');
    if(!validTime(data.meal.eaten_at)&&!allowMissingTime)throw new Error('식사 시각을 확인할 수 없습니다.');
    const eatenAt=validTime(data.meal.eaten_at)?data.meal.eaten_at:null;
    if (!Array.isArray(data.meal.items) || data.meal.items.length === 0 || data.meal.items.length > 15)throw new Error('음식 목록이 없거나 너무 깁니다.');
    for (const item of data.meal.items) {
      if(typeof item.name!=='string'||!item.name.trim()||item.name.length>140)throw new Error('유효하지 않은 음식명이 있습니다.');
    }
    return {kind:'meal',meal:{eaten_at:eatenAt,meal_type:['breakfast','lunch','dinner','snack','other'].includes(data.meal.meal_type)?data.meal.meal_type:'other',items:data.meal.items.map(x=>({name:String(x.name).trim(),quantity:finitePositive(x.quantity),unit:String(x.unit||'').slice(0,30)}))},questions:Array.isArray(data.questions)?data.questions.map(String).slice(0,5):[]};
  }
  if (data.kind === 'sleep') {
    if(!data.sleep)throw new Error('수면 정보를 찾지 못했습니다.');
    const start=validTime(data.sleep.start_at)?data.sleep.start_at:null;
    const end=validTime(data.sleep.end_at)?data.sleep.end_at:null;
    if((!start||!end)&&!allowMissingTime)throw new Error('수면 시작·종료 시각을 확인할 수 없습니다.');
    if(start&&end){
      const minutes=(Date.parse(end)-Date.parse(start))/60000;
      if(minutes<=0||minutes>24*60)throw new Error('수면 종료가 시작 이전이거나 24시간을 초과합니다.');
    }
    return {kind:'sleep',sleep:{start_at:start,end_at:end,sleep_type:data.sleep.sleep_type==='nap'?'nap':'main'},questions:Array.isArray(data.questions)?data.questions.map(String).slice(0,5):[]};
  }
  throw new Error('식사/수면 기록으로 분류하지 못했습니다. 수동 입력을 사용하세요.');
}
function finitePositive(x){const n=Number(x);return Number.isFinite(n)&&n>0&&n<=100000?n:null;}
export function numericOrNull(x){if(x===null||x===undefined||String(x).trim()==='')return null;const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=100000?n:null;}
export function sleepMinutes(a,b){return Math.round((Date.parse(b)-Date.parse(a))/60000);}
