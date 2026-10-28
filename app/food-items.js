// Deterministic segmentation for Korean meal lists. Never invent quantities.
const AMOUNT=/(\d+(?:\.\d+)?|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(kg|그램|mL|ml|g|공기|개|컵|조각|팩|그릇|봉지|줄|알|인분|모|병|장|접시|캔|큰술|작은술|숟가락)(?=$|\s|[,，;+\/]|과|와|하고|이랑|랑|그리고|및|을|를|먹|섭)/gu;
const COUNTERS={한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10};
// Only explicit separators split unquantified food lists. Spaces alone do not.
const SEPARATOR=/\s*(?:,|，|;|\+)\s*|\s+(?:그리고|및|과|와|하고|랑|이랑)\s+/gu;
const PREFIX=/^(?:(?:(?:과|와|그리고|및|하고|랑|이랑)(?=\s)\s+)|(?:\+|,|，|;)\s*)+/u;
const SUFFIX=/(?:\s+(?:과|와|그리고|및|하고|랑|이랑)|\s*(?:\+|,|，|;))\s*$/u;
const BARE=/^[\p{L}][\p{L}\p{N}\s()\-]{0,139}$/u;
const NON_FOOD=/(?:사고|구매|주문|운동|준비|포장|버렸|마셨지만|먹지|안먹|못먹)/u;
function clean(raw){return raw.replace(PREFIX,'').replace(SUFFIX,'').trim().replace(/(?:을|를)$/u,'').trim();}
function segments(raw){return raw.split(SEPARATOR).map(clean).filter(Boolean);}
function simpleName(name){return BARE.test(name)&&!NON_FOOD.test(name)&&!/(?:\d+(?:\.\d+)?\s*(?:kg|그램|ml|g|공기|개|컵|접시|인분))/.test(name);}
export function extractFoodItems(value){
 const text=String(value||'').trim();if(!text||text.length>1500)return null;
 const parts=[];let cursor=0,m,count=0;
 const rx=new RegExp(AMOUNT.source,'gu');
 while((m=rx.exec(text))!==null){
  const between=text.slice(cursor,m.index);const names=segments(between);
  if(!names.length||names.some(n=>!simpleName(n)))return null;
  for(const name of names.slice(0,-1))parts.push({name,quantity:null,unit:''});
  const q=Object.hasOwn(COUNTERS,m[1])?COUNTERS[m[1]]:Number(m[1]);
  if(!Number.isFinite(q)||q<=0||q>100000)return null;
  parts.push({name:names.at(-1),quantity:q,unit:m[2]==='그램'?'g':m[2]});
  cursor=rx.lastIndex;
  if(++count>15||parts.length>15)return null;
 }
 const trailing=text.slice(cursor).trim();
 if(trailing){
  if(!parts.length){
   // Bare lists need an explicit delimiter. A single vague dish falls back to AI.
   if(!SEPARATOR.test(trailing))return null;
   SEPARATOR.lastIndex=0;
   const names=segments(trailing);
   if(names.length<2||names.some(n=>!simpleName(n)))return null;
   parts.push(...names.map(name=>({name,quantity:null,unit:''})));
  }else{
   // Without a separator, a trailing phrase could be an unrelated action.
   if(!PREFIX.test(trailing))return null;
   const names=segments(trailing);
   if(!names.length||names.some(n=>!simpleName(n)))return null;
   parts.push(...names.map(name=>({name,quantity:null,unit:''})));
  }
 }
 return parts.length>=1&&parts.length<=15?parts:null;
}
