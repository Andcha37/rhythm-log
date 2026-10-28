import {CLERK_PUBLISHABLE_KEY,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,USERNAME_CHECK_URL} from './config.js';
import {Clerk} from '@clerk/clerk-js';
import {createClient} from '@supabase/supabase-js';
import {normalizeUsername,usernameValid} from './username.js';
import {extractEntry} from './llm.js';
import {numericOrNull,sleepMinutes} from './parse.js';
const $=id=>document.getElementById(id);
const BASE=['dashboard','capture','meals','sleep','reports','settings'];
const LABELS={dashboard:['DAILY OVERVIEW','오늘의 리듬'],capture:['NATURAL LANGUAGE','새로운 기록'],meals:['MEAL JOURNAL','식사 기록'],sleep:['SLEEP JOURNAL','수면 기록'],reports:['PERSONAL INSIGHTS','추이와 분석'],settings:['YOUR ACCOUNT','설정 및 데이터']};
let db,clerk,user,signupMode=false,checkedUsername=null,records={meals:[],items:[],sleep:[]},draft=null,currentTab='dashboard',installEvent;
const modelStatus=$('ai-status');
function showStatus(message){$('global-status').textContent=message||'';}
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function fmt(dt){return new Date(dt).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function dateKey(dt){const d=new Date(dt);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dateTimeLocal(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function fromLocal(s){const d=new Date(s);if(!s||!Number.isFinite(d.getTime()))throw Error('날짜와 시간을 확인해 주세요.');return d.toISOString();}
function days(n){const arr=[];for(let i=n-1;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);arr.push(dateKey(d));}return arr;}
function empty(where,message){where.replaceChildren(node('p','empty',message));}
function go(tab){if(!BASE.includes(tab))return;currentTab=tab;for(const x of BASE)$(x+'-panel').hidden=x!==tab;document.querySelectorAll('.navitem').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('section-label').textContent=LABELS[tab][0];$('section-title').textContent=LABELS[tab][1];if(tab==='capture')setTimeout(()=>$('entry-text').focus(),10);window.scrollTo({top:0,behavior:'smooth'});}
function setAuthVisible(signed){$('auth').hidden=signed;$('workspace').hidden=!signed;}
// Clerk stores real usernames and passwords. Supabase accepts its verified session JWT,
// and the database enforces row ownership from auth.jwt()->>'sub'.
async function connect(){
 if(!CLERK_PUBLISHABLE_KEY.startsWith('pk_')||!SUPABASE_URL.startsWith('https://')||SUPABASE_URL.includes('YOUR_PROJECT')||SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_')){
  $('auth-status').textContent='배포 전 설정 필요: Clerk publishable key와 Supabase URL·publishable key를 app/config.js에 연결해 주세요.';
  $('auth-submit').disabled=true;$('check-username').disabled=true;return;
 }
 try{
  clerk=new Clerk(CLERK_PUBLISHABLE_KEY);
  await clerk.load();
  db=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
   accessToken:async()=>clerk.session?.getToken()??null,
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  clerk.addListener(({user:nextUser})=>{queueMicrotask(()=>applySession(nextUser));});
  await applySession(clerk.user);
 }catch(e){$('auth-status').textContent='인증 서비스 연결 실패: '+(e?.message||'설정과 네트워크를 확인하세요.');}
}
async function applySession(identity){
 const next=identity?{id:identity.id,username:identity.username||'사용자'}:null;
 if(next?.id===user?.id&&!$('workspace').hidden)return;
 user=next;setAuthVisible(!!user);
 if(!user){records={meals:[],items:[],sleep:[]};renderAuthMode();return;}
 $('user-label').textContent='@'+user.username;
 $('setting-username').textContent=user.username;
 go('dashboard');await refresh();
}
function renderAuthMode(){
 $('auth-title').textContent=signupMode?'새 계정 만들기':'나만의 기록 시작하기';
 $('mode-login').classList.toggle('active',!signupMode);
 $('mode-signup').classList.toggle('active',signupMode);
 $('username-check-row').hidden=!signupMode;
 $('confirm-row').hidden=!signupMode;
 $('password').autocomplete=signupMode?'new-password':'current-password';
 $('auth-submit').textContent=signupMode?'아이디로 회원가입':'로그인';
 checkedUsername=null;
 $('username-check-status').textContent='';
 $('auth-status').textContent='';
}
function errorMessage(err){
 const detail=err?.errors?.[0];
 if(detail?.code==='form_identifier_exists'||detail?.code==='form_username_invalid')return '이미 사용 중이거나 허용되지 않는 아이디입니다.';
 if(detail?.code==='form_password_pwned')return '안전하지 않은 비밀번호입니다. 다른 비밀번호를 사용하세요.';
 return detail?.longMessage||detail?.message||err?.message||'인증 요청을 처리하지 못했습니다.';
}
async function checkUsername(){
 const username=normalizeUsername($('username').value);
 checkedUsername=null;
 if(!usernameValid(username)){$('username-check-status').textContent='영문·숫자·밑줄 4~24자이며 영문으로 시작해야 합니다.';return;}
 if(!USERNAME_CHECK_URL){$('username-check-status').textContent='중복 조회 서버를 아직 설정하지 않았습니다. 가입 시 Clerk 서버에서 중복을 최종 검사합니다.';return;}
 $('check-username').disabled=true;
 $('username-check-status').textContent='중복 확인 중…';
 try{
  const endpoint=new URL(USERNAME_CHECK_URL);
  endpoint.searchParams.set('username',username);
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
  let resp;try{resp=await fetch(endpoint,{signal:ctl.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});}finally{clearTimeout(timer)}
  const result=await resp.json();
  if(!resp.ok||typeof result.available!=='boolean')throw Error(result.error||'확인 실패');
  if(normalizeUsername($('username').value)!==username)return;
  if(result.available){checkedUsername=username;$('username-check-status').textContent='사용할 수 있는 아이디입니다. (가입 시 재확인)';}
  else $('username-check-status').textContent='이미 사용 중인 아이디입니다.';
 }catch(e){$('username-check-status').textContent='중복 조회 실패: '+(e?.message||'잠시 후 다시 시도하세요.');}
 finally{$('check-username').disabled=false;}
}
async function authAction(){
 if(!clerk){$('auth-status').textContent='먼저 인증 설정을 완료해 주세요.';return;}
 const username=normalizeUsername($('username').value),password=$('password').value;
 if(!usernameValid(username)){$('auth-status').textContent='아이디는 영문으로 시작하는 4~24자 영문·숫자·밑줄이어야 합니다.';return;}
 if(password.length<8){$('auth-status').textContent='비밀번호를 8자 이상 입력하세요.';return;}
 if(signupMode&&password!==$('password-confirm').value){$('auth-status').textContent='비밀번호 확인이 일치하지 않습니다.';return;}
 if(signupMode&&USERNAME_CHECK_URL&&checkedUsername!==username){$('auth-status').textContent='먼저 아이디 중복 확인을 완료하세요.';return;}
 $('auth-submit').disabled=true;$('auth-status').textContent='계정 처리 중…';
 try{
  if(signupMode){
   const attempt=await clerk.client.signUp.create({username,password});
   if(attempt.status!=='complete'||!attempt.createdSessionId)throw Error('가입 조건 미완료: Clerk에서 아이디와 비밀번호만 필수로 설정했는지 확인하세요.');
   await clerk.setActive({session:attempt.createdSessionId});
  }else{
   const attempt=await clerk.client.signIn.create({identifier:username,password,strategy:'password'});
   if(attempt.status!=='complete'||!attempt.createdSessionId)throw Error('추가 인증이 필요합니다. Clerk 설정을 확인하세요.');
   await clerk.setActive({session:attempt.createdSessionId});
  }
  $('password').value='';$('password-confirm').value='';
  await applySession(clerk.user);
 }catch(err){$('auth-status').textContent=errorMessage(err);if(signupMode)checkedUsername=null;}
 finally{$('auth-submit').disabled=false;}
}
async function refresh(){
 if(!user||!db)return;
 showStatus('내 기록 동기화 중…');
 try{
  const uid=user.id;
  const [m,i,s]=await Promise.all([
   db.from('meals').select('*').eq('user_id',uid).order('eaten_at',{ascending:false}).limit(500),
   db.from('meal_items').select('*').eq('user_id',uid).limit(2000),
   db.from('sleep_sessions').select('*').eq('user_id',uid).order('end_at',{ascending:false}).limit(500)
  ]);
  for(const r of [m,i,s])if(r.error)throw r.error;
  // Reject stale requests after logout or account switching.
  if(!user || user.id!==uid)return;
  records={meals:m.data||[],items:i.data||[],sleep:s.data||[]};
  renderAll();showStatus('');
 }catch(e){if(user)showStatus('데이터 불러오기 실패: '+(e?.message||e));}
}
function itemsFor(meal){return records.items.filter(i=>i.meal_id===meal.id);}
function mealKcal(meal){const items=itemsFor(meal);if(!items.length||items.some(i=>i.calories_kcal===null))return null;return items.reduce((t,i)=>t+Number(i.calories_kcal),0);}
function grouped(){
 const groupedMeals=new Map(),groupedSleep=new Map();
 for(const m of records.meals){const d=dateKey(m.eaten_at);const arr=groupedMeals.get(d)||[];arr.push(m);groupedMeals.set(d,arr);}
 // Associate cross-midnight sessions with the wake date.
 for(const s of records.sleep){const d=dateKey(s.end_at);const arr=groupedSleep.get(d)||[];arr.push(s);groupedSleep.set(d,arr);}
 return {groupedMeals,groupedSleep};
}
function paintChart(where,series,unit,isKcal=false){
 where.replaceChildren();const values=series.map(x=>x.value).filter(v=>v!==null);const max=Math.max(...values,1);
 for(const day of series){const col=node('div','chartcol'),bar=node('div','bar'+(isKcal?' cal':''));const value=node('div','barvalue',day.value===null?'·':(isKcal?Math.round(day.value):day.value.toFixed(1))+unit);
  bar.style.height=day.value===null?'0px':Math.max(4,day.value/max*146)+'px';bar.title=day.date+' · '+(day.value===null?'미기록':day.value+unit)+(day.partial?' (부분 기록)':'');
  const label=node('label','',day.date.slice(5));col.append(value,bar,label);where.append(col);
 }
}
function renderAll(){
 const {groupedMeals,groupedSleep}=grouped(),last7=days(7),last14=days(14);
 const meals7=last7.reduce((n,d)=>n+(groupedMeals.get(d)?.length||0),0);
 const sleepEntries=last7.flatMap(d=>groupedSleep.get(d)||[]),mean=sleepEntries.length?sleepEntries.reduce((t,s)=>t+s.duration_minutes,0)/sleepEntries.length/60:null;
 const mealEntries=last7.flatMap(d=>groupedMeals.get(d)||[]),known=mealEntries.map(mealKcal).filter(v=>v!==null),total=known.reduce((a,b)=>a+b,0);
 $('metric-meals').textContent=meals7;$('metric-sleep').textContent=mean===null?'미기록':mean.toFixed(1)+' h';$('metric-cal').textContent=known.length?Math.round(total).toLocaleString():'미기록';
 const sleepSeries=last14.map(date=>{const ss=groupedSleep.get(date);return {date,value:ss?.length?ss.reduce((t,s)=>t+s.duration_minutes,0)/60:null}});
 const mealSeries=last14.map(date=>{const mm=groupedMeals.get(date);if(!mm?.length)return {date,value:null};const vals=mm.map(mealKcal);const known=vals.filter(v=>v!==null);return {date,value:known.length?known.reduce((a,b)=>a+b,0):null,partial:known.length<vals.length};});
 paintChart($('sleep-chart'),sleepSeries,'h');paintChart($('meal-chart'),mealSeries,'',true);
 renderList('meal-list','meal');renderList('sleep-list','sleep');renderRecent();renderReport(last14,mealSeries,sleepSeries);
}
function renderList(id,type){
 const where=$(id);where.replaceChildren();const data=type==='meal'?records.meals:records.sleep;
 if(!data.length)return empty(where,type==='meal'?'기록된 식사가 아직 없습니다.':'기록된 수면이 아직 없습니다.');
 for(const a of data){const row=node('div','rowrecord'),left=node('div'),right=node('div','right');
  const title=type==='meal'?itemsFor(a).map(i=>i.name).join(', ')||a.meal_type:(a.sleep_type==='nap'?'낮잠':'수면')+' · '+(a.duration_minutes/60).toFixed(1)+'시간';
  left.append(node('strong','',title),node('small','',type==='meal'?fmt(a.eaten_at):fmt(a.start_at)+' ~ '+fmt(a.end_at)));
  if(type==='meal')right.append(node('span','',mealKcal(a)===null?'열량 미기록':Math.round(mealKcal(a))+' kcal'));
  const del=node('button','delete','삭제');del.onclick=()=>removeRecord(type,a);right.append(del);row.append(left,right);where.append(row);
 }
}
function renderRecent(){const where=$('recent-list');where.replaceChildren();const all=[...records.meals.map(m=>({t:m.eaten_at,name:'식사 · '+itemsFor(m).map(x=>x.name).join(', ')})),...records.sleep.map(s=>({t:s.end_at,name:'수면 · '+(s.duration_minutes/60).toFixed(1)+'시간'}))].sort((a,b)=>Date.parse(b.t)-Date.parse(a.t)).slice(0,6);
 if(!all.length)return empty(where,'아직 기록이 없습니다. 자연어로 첫 기록을 추가해 보세요.');for(const a of all){const row=node('div','rowrecord');row.append(node('strong','',a.name),node('small','',fmt(a.t)));where.append(row);}
}
function renderReport(last14,meals,sleep){
 const foodDays=meals.filter(x=>x.value!==null),sleepDays=sleep.filter(x=>x.value!==null),partial=meals.filter(x=>x.partial).length;
 const q=$('quality-report');q.replaceChildren();const addStat=(label,value)=>{const r=node('div','statline');r.append(node('span','',label),node('b','',value));q.append(r);};
 addStat('열량이 기록된 날짜',foodDays.length+' / 14일');addStat('열량 일부 누락 날짜',partial+'일');addStat('수면이 기록된 날짜',sleepDays.length+' / 14일');addStat('기록된 전체 수면 횟수',records.sleep.filter(x=>last14.includes(dateKey(x.end_at))).length+'회');
 const where=$('insight-report');where.replaceChildren();
 if(!sleepDays.length&&!foodDays.length)return empty(where,'분석할 기록이 아직 충분하지 않습니다.');
 if(sleepDays.length)where.append(node('p','noticebox',`수면 기록이 있는 ${sleepDays.length}일의 일별 총 수면 평균은 ${(sleepDays.reduce((a,b)=>a+b.value,0)/sleepDays.length).toFixed(1)}시간입니다. 누락된 날짜는 평균에서 제외했어요.`));
 if(foodDays.length)where.append(node('p','noticebox',`열량을 기록한 ${foodDays.length}일의 평균 기록 열량은 ${Math.round(foodDays.reduce((a,b)=>a+b.value,0)/foodDays.length).toLocaleString()}kcal입니다. 일부 음식의 영양값이 빠진 날짜는 실제 섭취량보다 작게 나타날 수 있어요.`));
}
async function removeRecord(type,entry){
 if(!confirm('선택한 기록을 삭제할까요? 삭제하면 되돌릴 수 없습니다.'))return;
 try{const table=type==='meal'?'meals':'sleep_sessions';const {error}=await db.from(table).delete().eq('id',entry.id).eq('user_id',user.id);if(error)throw error;await refresh();}catch(e){showStatus('삭제 실패: '+(e?.message||e));}
}
function field(parent,label,type,value,name){const wrap=node('div','field'),lbl=node('label','',label),input=node(type==='select'?'select':'input');if(type!=='select')input.type=type;input.dataset.name=name;if(value!==undefined&&value!==null)input.value=value;wrap.append(lbl,input);parent.append(wrap);return input;}
function selectField(parent,label,options,value,name){const wrap=node('div','field'),lbl=node('label','',label),sel=node('select');sel.dataset.name=name;for(const [val,text] of options){const op=node('option','',text);op.value=val;sel.append(op);}sel.value=value;wrap.append(lbl,sel);parent.append(wrap);return sel;}
function renderReview(){
 const box=$('review-fields');box.replaceChildren();$('review').hidden=false;
 $('review-note').textContent='AI 출력은 초안입니다. 날짜·시각·음식 양을 확인하세요. 열량은 제공된 자료가 없으면 미기록으로 저장합니다.'+(draft.questions?.length?' 확인 사항: '+draft.questions.join(' / '):'');
 if(draft.kind==='meal'){
  const meta=node('div','formgrid');field(meta,'먹은 일시','datetime-local',dateTimeLocal(draft.meal.eaten_at),'eaten_at');selectField(meta,'식사 유형',[['breakfast','아침'],['lunch','점심'],['dinner','저녁'],['snack','간식'],['other','기타']],draft.meal.meal_type,'meal_type');box.append(meta);
  draft.meal.items.forEach((item,index)=>{const card=node('div','foodline');card.append(node('h4','',`음식 ${index+1}`));const grid=node('div','formgrid');field(grid,'음식명','text',item.name,'name');field(grid,'양','number',item.quantity,'quantity');field(grid,'단위','text',item.unit,'unit');field(grid,'열량 kcal (선택)','number',item.calories_kcal,'calories_kcal');field(grid,'단백질 g (선택)','number',item.protein_g,'protein_g');field(grid,'탄수화물 g (선택)','number',item.carbs_g,'carbs_g');field(grid,'지방 g (선택)','number',item.fat_g,'fat_g');selectField(grid,'영양값 출처',[['unknown','미기록'],['user_provided','직접 입력'],['verified_label','제품 영양표시'],['verified_database','검증된 식품 데이터']],item.nutrition_source||'unknown','nutrition_source');card.append(grid);field(card,'영양 정보 출처 메모 (선택)','text',item.source_note,'source_note');box.append(card);});
  const plus=node('button','secondary','＋ 음식 추가');plus.type='button';plus.onclick=()=>{const saved=collectDraftFromUI();if(saved.items.length>=15){showStatus('한 기록은 음식 최대 15개까지 저장합니다.');return;}draft.meal.items=[...saved.items,{name:'',quantity:null,unit:'',nutrition_source:'unknown'}];draft.meal.eaten_at=saved.eaten_at;draft.meal.meal_type=saved.meal_type;renderReview();};box.append(plus);
 }else{
  const meta=node('div','formgrid');field(meta,'수면 시작','datetime-local',dateTimeLocal(draft.sleep.start_at),'start_at');field(meta,'수면 종료','datetime-local',dateTimeLocal(draft.sleep.end_at),'end_at');selectField(meta,'수면 유형',[['main','주 수면'],['nap','낮잠']],draft.sleep.sleep_type,'sleep_type');selectField(meta,'주관적 수면의 질',[['','선택 안 함'],['1','1 · 매우 나쁨'],['2','2'],['3','3 · 보통'],['4','4'],['5','5 · 매우 좋음']],'','quality');box.append(meta);
 }
}
function collectDraftFromUI(){
 const root=$('review-fields');const get=(key)=>root.querySelector(`[data-name="${key}"]`)?.value||'';
 if(draft.kind==='sleep')return {start_at:fromLocal(get('start_at')),end_at:fromLocal(get('end_at')),sleep_type:get('sleep_type'),quality:get('quality')?Number(get('quality')):null};
 const list=[...root.querySelectorAll('.foodline')].map(line=>{const val=(key)=>line.querySelector(`[data-name="${key}"]`)?.value||'';const name=val('name').trim();if(!name)throw Error('음식명을 입력하세요.');
  return {name,quantity:numericOrNull(val('quantity')),unit:val('unit').trim(),calories_kcal:numericOrNull(val('calories_kcal')),protein_g:numericOrNull(val('protein_g')),carbs_g:numericOrNull(val('carbs_g')),fat_g:numericOrNull(val('fat_g')),nutrition_source:val('nutrition_source'),source_note:val('source_note').trim()};});
 return {eaten_at:fromLocal(get('eaten_at')),meal_type:get('meal_type'),items:list};
}
async function analyze(){
 const raw=$('entry-text').value.trim();if(!raw){modelStatus.textContent='먼저 내용을 입력하세요.';return;}
 if(/(?:식사|먹었|먹은|점심|저녁|아침|음식)/.test(raw)&&/(?:잠들|잤어|수면|기상|잠을)/.test(raw)){modelStatus.textContent='식사와 수면을 한 번에 입력하셨네요. 데이터 누락을 막기 위해 각각 별도 기록으로 입력해 주세요.';return;}
 $('analyze').disabled=true;$('review').hidden=true;
 try{modelStatus.textContent='AI 모델 연결 준비 중…';draft=await extractEntry(raw,$('model').value,s=>modelStatus.textContent=s);renderReview();modelStatus.textContent='분석 완료. 검토 후 저장 버튼을 누르세요.';}
 catch(e){modelStatus.textContent=e?.message||String(e);}
 finally{$('analyze').disabled=false;}
}
function manual(kind){
 const now=new Date(),later=new Date(now.getTime()+8*3600000);
 draft=kind==='meal'?{kind:'meal',meal:{eaten_at:now.toISOString(),meal_type:'other',items:[{name:'',quantity:null,unit:'',nutrition_source:'unknown'}]},questions:[]}:{kind:'sleep',sleep:{start_at:now.toISOString(),end_at:later.toISOString(),sleep_type:'main'},questions:[]};
 renderReview();modelStatus.textContent='수동 입력 모드입니다. 날짜와 시간 및 내용을 직접 검토해주세요.';
}
async function saveDraft(){
 if(!draft||!user)return;const button=$('save-entry');button.disabled=true;
 try{const data=collectDraftFromUI(),raw=$('entry-text').value.trim(),tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Seoul';
  if(draft.kind==='meal'){
   if(data.items.length===0||data.items.length>15)throw Error('음식은 1~15개까지 입력하세요.');
   for(const item of data.items){if((item.calories_kcal!==null||item.protein_g!==null||item.carbs_g!==null||item.fat_g!==null)&&item.nutrition_source==='unknown')throw Error('영양성분을 입력했다면 해당 음식의 출처 유형을 선택하세요.');}
   const {error}=await db.rpc('create_meal',{p_eaten_at:data.eaten_at,p_timezone:tz,p_meal_type:data.meal_type,p_raw_text:raw,p_notes:'',p_items:data.items});if(error)throw error;
  }else{
   if(sleepMinutes(data.start_at,data.end_at)<=0||sleepMinutes(data.start_at,data.end_at)>1440)throw Error('수면 시작과 종료를 확인하세요 (최대 24시간).');
   const {error}=await db.from('sleep_sessions').insert({user_id:user.id,start_at:data.start_at,end_at:data.end_at,sleep_type:data.sleep_type,quality:data.quality,raw_text:raw});if(error)throw error;
  }
  draft=null;$('review').hidden=true;$('entry-text').value='';modelStatus.textContent='저장 성공. 내 기록에 반영되었습니다.';
  await refresh();go(data.items?'meals':'sleep');
 }catch(e){modelStatus.textContent='저장하지 못했습니다: '+(e?.message||e);}
 finally{button.disabled=false;}
}
function downloadReport(){
 const {groupedMeals,groupedSleep}=grouped(),dates=days(14);
 const lines=['RHYTHM LOG · 14일 기록 요약','범위: '+dates[0]+' ~ '+dates.at(-1),'※ 개인 입력 기록에 기반한 기술통계이며 건강 진단이나 섭취량 권고가 아닙니다.',''];
 const sleepVals=[],kcalVals=[];
 for(const day of dates){
  const ms=groupedMeals.get(day)||[],ss=groupedSleep.get(day)||[];
  const kcal=ms.map(mealKcal);const kcalKnown=kcal.filter(x=>x!==null);
  if(ss.length)sleepVals.push(ss.reduce((a,x)=>a+x.duration_minutes,0)/60);
  if(kcalKnown.length)kcalVals.push(kcalKnown.reduce((a,b)=>a+b,0));
  lines.push(`${day}: 식사 ${ms.length}건 | 열량 ${!ms.length?'미기록':!kcalKnown.length?'미기록':Math.round(kcalKnown.reduce((a,b)=>a+b,0))+'kcal'+(kcalKnown.length<ms.length?' (부분기록)':'')} | 수면 ${ss.length?ss.reduce((a,x)=>a+x.duration_minutes,0)/60+'시간':'미기록'}`);
 }
 lines.push('',`기록된 수면 날짜 평균: ${sleepVals.length?(sleepVals.reduce((a,b)=>a+b,0)/sleepVals.length).toFixed(1)+'시간 (n='+sleepVals.length+')':'미기록'}`);
 lines.push(`알려진 음식 열량의 기록 날짜 평균: ${kcalVals.length?Math.round(kcalVals.reduce((a,b)=>a+b,0)/kcalVals.length)+'kcal (n='+kcalVals.length+')':'미기록'}`);
 lines.push('누락 또는 부분 기록이 포함될 수 있으므로 실제 섭취 열량의 추정치가 아닙니다.');
 const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='rhythm-report-'+dates.at(-1)+'.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}

async function purgeRecords(){
 if(!user||!db)return;
 const answer=window.prompt('복구할 수 없는 전체 기록 삭제입니다. 계속하려면 "전체삭제"를 정확히 입력하세요.','');
 if(answer!=='전체삭제')return;
 const uid=user.id;
 const button=$('purge-records');button.disabled=true;
 showStatus('내 기록 전체 삭제 중…');
 try{
  const {error}=await db.rpc('purge_my_records');
  if(error)throw error;
  if(!user||user.id!==uid)return;
  records={meals:[],items:[],sleep:[]};renderAll();
  showStatus('식사·음식·수면 기록 전체 삭제를 완료했습니다. 계정은 유지됩니다.');
 }catch(err){showStatus('삭제 실패: '+(err?.message||err));}
 finally{button.disabled=false;}
}

function exportData(){if(!user)return;const payload={exported_at:new Date().toISOString(),username:user.username,records};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=node('a');anchor.href=url;anchor.download='rhythm-log-export-'+dateKey(new Date())+'.json';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}
function events(){
 document.querySelectorAll('.navitem').forEach(b=>b.addEventListener('click',()=>go(b.dataset.tab)));
 document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.goto)));
 $('mode-login').onclick=()=>{signupMode=false;renderAuthMode()};
 $('mode-signup').onclick=()=>{signupMode=true;renderAuthMode()};
 $('check-username').onclick=checkUsername;
 $('username').addEventListener('input',()=>{checkedUsername=null;$('username-check-status').textContent='아이디를 수정했습니다. 다시 중복 확인해 주세요.';});
 $('auth-submit').onclick=authAction;
 $('password').addEventListener('keydown',e=>{if(e.key==='Enter')authAction()});
 $('signout').onclick=async()=>{if(clerk)await clerk.signOut();};
 $('refresh').onclick=refresh;$('download-report').onclick=downloadReport;$('analyze').onclick=analyze;$('manual-meal').onclick=()=>manual('meal');$('manual-sleep').onclick=()=>manual('sleep');$('save-entry').onclick=saveDraft;$('export').onclick=exportData;$('purge-records').onclick=purgeRecords;
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;$('install').hidden=false;});$('install').onclick=async()=>{if(installEvent){installEvent.prompt();await installEvent.userChoice;installEvent=null;$('install').hidden=true;}};
}
events();connect();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
