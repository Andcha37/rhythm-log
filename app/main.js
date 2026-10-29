import {CLERK_PUBLISHABLE_KEY,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,USERNAME_CHECK_URL} from './config.js';
import {Clerk} from '@clerk/clerk-js';
import {createClient} from '@supabase/supabase-js';
import {normalizeUsername,usernameValid} from './username.js';
import {extractEntry} from './llm.js';
import {numericOrNull,sleepMinutes} from './parse.js';
import {isEstimatedNote} from './nutrition.js';
import {presetRange,selectRange,queryBounds,aggregateDashboard} from './dashboard.js';
const $=id=>document.getElementById(id);
const BASE=['dashboard','capture','meals','sleep','reports','settings'];
const LABELS={dashboard:['DAILY OVERVIEW','오늘의 리듬'],capture:['NATURAL LANGUAGE','새로운 기록'],meals:['MEAL JOURNAL','식사 기록'],sleep:['SLEEP JOURNAL','수면 기록'],reports:['PERSONAL INSIGHTS','추이와 분석'],settings:['YOUR ACCOUNT','설정 및 데이터']};
let db,clerk,user,signupMode=false,checkedUsername=null,records={meals:[],items:[],sleep:[]},draft=null,editing=null,currentTab='dashboard',installEvent;
let dashboardRange=presetRange(14),dashboardRequest=0;
const modelStatus=$('ai-status');
function showStatus(message){$('global-status').textContent=message||'';}
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function fmt(dt){return new Date(dt).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function dateKey(dt){const d=new Date(dt);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dateTimeLocal(value){if(value===null||value===undefined||value==='')return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function fromLocal(s){const d=new Date(s);if(!s||!Number.isFinite(d.getTime())||dateTimeLocal(d.toISOString())!==s.slice(0,16))throw Error('유효한 날짜와 시간을 입력해 주세요.');return d.toISOString();}
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
 editing=null;draft=null;$('review').hidden=true;
 dashboardRequest++;user=next;setAuthVisible(!!user);
 if(!user){records={meals:[],items:[],sleep:[]};$('dashboard-range-status').textContent='';clearDashboard();renderAuthMode();return;}
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
 $('check-username').textContent=USERNAME_CHECK_URL?'아이디 중복 확인':'아이디 형식 확인';
 $('username-check-status').textContent=signupMode&&!USERNAME_CHECK_URL?'중복 여부는 회원가입할 때 Clerk에서 자동 확인합니다.':'';
 $('auth-status').textContent='';
}
function errorMessage(err){
 const detail=err?.errors?.[0];
 if(detail?.code==='form_identifier_exists')return '이미 사용 중인 아이디입니다. 다른 아이디를 입력하세요.';
 if(detail?.code==='form_username_invalid')return 'Clerk가 허용하지 않는 아이디 형식입니다. 다른 아이디를 입력하세요.';
 if(detail?.code==='form_password_pwned')return '안전하지 않은 비밀번호입니다. 다른 비밀번호를 사용하세요.';
 return detail?.longMessage||detail?.message||err?.message||'인증 요청을 처리하지 못했습니다.';
}
async function checkUsername(){
 const username=normalizeUsername($('username').value);
 checkedUsername=null;
 if(!usernameValid(username)){$('username-check-status').textContent='영문·숫자·밑줄 4~24자이며 영문으로 시작해야 합니다.';return;}
 if(!USERNAME_CHECK_URL){$('username-check-status').textContent='아이디 형식이 올바릅니다. 중복 여부는 가입할 때 Clerk에서 자동 검사합니다.';return;}
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
 if(password.length<15){$('auth-status').textContent='비밀번호는 15자 이상 입력하세요.';return;}
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
  renderAll();await loadDashboardRange();if(user?.id===uid)showStatus('');
 }catch(e){if(user)showStatus('데이터 불러오기 실패: '+(e?.message||e));}
}
// Fetch the selected calendar window independently of the latest-500-record journals.
// Supabase's default row limit is commonly 1,000, so every query is paginated.
async function fetchDashboardRows(table,uid,{field,bounds,mealIds}={}){
 const batchSize=500,rows=[];
 for(let offset=0;;offset+=batchSize){
  let query=db.from(table).select('*').eq('user_id',uid);
  if(field)query=query.gte(field,bounds.from).lt(field,bounds.to).order(field,{ascending:true});
  if(mealIds)query=query.in('meal_id',mealIds).order('meal_id',{ascending:true});
  const {data,error}=await query.order('id',{ascending:true}).range(offset,offset+batchSize-1);
  if(error)throw error;
  rows.push(...(data||[]));
  if(rows.length>50000)throw Error('해당 기간의 기록이 너무 많습니다. 조회 구간을 줄여 주세요.');
  if(!data||data.length<batchSize)break;
 }
 return rows;
}
async function fetchDashboardData(uid,period){
 const bounds=queryBounds(period);
 const [meals,sleep]=await Promise.all([
  fetchDashboardRows('meals',uid,{field:'eaten_at',bounds}),
  fetchDashboardRows('sleep_sessions',uid,{field:'end_at',bounds})
 ]);
 const ids=meals.map(m=>m.id),chunks=[];
 for(let i=0;i<ids.length;i+=70)chunks.push(ids.slice(i,i+70));
 const pages=await Promise.all(chunks.map(mealIds=>fetchDashboardRows('meal_items',uid,{mealIds})));
 return {meals,items:pages.flat(),sleep};
}
function clearDashboard(){
 for(const id of ['metric-meals','metric-sleep','metric-cal'])$(id).textContent='—';
 $('sleep-chart').replaceChildren();$('meal-chart').replaceChildren();
}
function paintDashboard(data,period){
 const metrics=aggregateDashboard(data,period);
 $('metric-meals').textContent=metrics.mealsCount;
 $('metric-sleep').textContent=metrics.meanSleepHours===null?'미기록':metrics.meanSleepHours.toFixed(1)+' h';
 $('metric-cal').textContent=metrics.totalCalories===null?'미기록':Math.round(metrics.totalCalories).toLocaleString();
 $('sleep-chart-period').textContent=period.count+'일';
 $('meal-chart-period').textContent=period.count+'일';
 paintChart($('sleep-chart'),metrics.sleepSeries,'h');
 paintChart($('meal-chart'),metrics.mealSeries,'',true);
 $('dashboard-details').textContent=period.start+' ~ '+period.end+' ('+period.count+'일) · 열량이 완전히 기록된 식사 '+metrics.completeMeals+'건 · 부분/누락 영양값 포함 '+metrics.partialDays+'일. 미기록 날짜는 0으로 계산하지 않습니다.';
}
async function loadDashboardRange(){
 if(!user||!db)return;
 const uid=user.id,requested=++dashboardRequest,period={...dashboardRange};
 clearDashboard();
 $('dashboard-range-status').textContent='선택한 기간의 기록을 불러오는 중…';
 try{
  const data=await fetchDashboardData(uid,period);
  if(!user||user.id!==uid||requested!==dashboardRequest)return;
  paintDashboard(data,period);
  $('dashboard-range-status').textContent='조회 완료: '+period.start+' ~ '+period.end+' · '+period.count+'일';
 }catch(e){
  if(!user||user.id!==uid||requested!==dashboardRequest)return;
  $('dashboard-range-status').textContent='기간 조회 실패: '+(e?.message||e);
 }
}
function syncDashboardRange(){
 $('range-start').value=dashboardRange.start;
 $('range-end').value=dashboardRange.end;
 $('range-end').max=dateKey(new Date());
 $('range-start').max=dateKey(new Date());
 document.querySelectorAll('[data-range-days]').forEach(button=>{
  const n=Number(button.dataset.rangeDays);
  const preset=presetRange(n);
  const active=preset.start===dashboardRange.start&&preset.end===dashboardRange.end;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 });
}
async function applyDashboardRange(start,end){
 try{
  const next=selectRange(start,end);
  dashboardRange=next;
  syncDashboardRange();
  await loadDashboardRange();
 }catch(e){
  $('dashboard-range-status').textContent=e?.message||'조회 날짜를 확인해 주세요.';
 }
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
 where.replaceChildren();where.style.minWidth=Math.max(320,series.length*46)+'px';
 const values=series.map(x=>x.value).filter(v=>v!==null);const max=Math.max(...values,1);
 const labelEvery=series.length>70?7:series.length>35?3:1;
 for(const [index,day] of series.entries()){
  const col=node('div','chartcol'),bar=node('div','bar'+(isKcal?' cal':'')),shown=day.value===null?'·':(isKcal?Math.round(day.value):day.value.toFixed(1))+unit;
  const value=node('div','barvalue',series.length>35?'':shown);
  bar.style.height=day.value===null?'0px':Math.max(4,day.value/max*146)+'px';
  col.title=day.date+' · '+(day.value===null?'미기록':shown)+(day.partial?' (부분 기록)':'');
  const label=node('label','',index%labelEvery===0||index===series.length-1?day.date.slice(5):'');
  col.append(value,bar,label);where.append(col);
 }
}
function renderAll(){
 // Journal and 14-day report remain unchanged; the dashboard loads its own date range.
 const {groupedMeals,groupedSleep}=grouped(),last14=days(14);
 const sleepSeries=last14.map(date=>{const ss=groupedSleep.get(date);return {date,value:ss?.length?ss.reduce((t,s)=>t+s.duration_minutes,0)/60:null};});
 const mealSeries=last14.map(date=>{const mm=groupedMeals.get(date);if(!mm?.length)return {date,value:null};const vals=mm.map(mealKcal);const known=vals.filter(v=>v!==null);return {date,value:known.length?known.reduce((a,b)=>a+b,0):null,partial:known.length<vals.length};});
 renderList('meal-list','meal');renderList('sleep-list','sleep');renderRecent();renderReport(last14,mealSeries,sleepSeries);
}
function renderList(id,type){
 const where=$(id);where.replaceChildren();const data=type==='meal'?records.meals:records.sleep;
 if(!data.length)return empty(where,type==='meal'?'기록된 식사가 아직 없습니다.':'기록된 수면이 아직 없습니다.');
 for(const a of data){const row=node('div','rowrecord'),left=node('div'),right=node('div','right');
  const title=type==='meal'?itemsFor(a).map(i=>i.name).join(', ')||a.meal_type:(a.sleep_type==='nap'?'낮잠':'수면')+' · '+(a.duration_minutes/60).toFixed(1)+'시간';
  left.append(node('strong','',title),node('small','',type==='meal'?fmt(a.eaten_at):fmt(a.start_at)+' ~ '+fmt(a.end_at)));
  if(type==='meal')right.append(node('span','',mealKcal(a)===null?'열량 미기록':(itemsFor(a).some(i=>isEstimatedNote(i.source_note))?'약 ':'')+Math.round(mealKcal(a))+' kcal'));
  const edit=node('button','secondary','수정');edit.type='button';edit.onclick=()=>editRecord(type,a);right.append(edit);
  const del=node('button','delete','삭제');del.onclick=()=>removeRecord(type,a);right.append(del);row.append(left,right);where.append(row);
 }
}
function renderRecent(){const where=$('recent-list');where.replaceChildren();const all=[...records.meals.map(m=>({t:m.eaten_at,name:'식사 · '+itemsFor(m).map(x=>x.name).join(', ')})),...records.sleep.map(s=>({t:s.end_at,name:'수면 · '+(s.duration_minutes/60).toFixed(1)+'시간'}))].sort((a,b)=>Date.parse(b.t)-Date.parse(a.t)).slice(0,6);
 if(!all.length)return empty(where,'아직 기록이 없습니다. 자연어로 첫 기록을 추가해 보세요.');for(const a of all){const row=node('div','rowrecord');row.append(node('strong','',a.name),node('small','',fmt(a.t)));where.append(row);}
}
function renderReport(last14,meals,sleep){
 const foodDays=meals.filter(x=>x.value!==null),sleepDays=sleep.filter(x=>x.value!==null),partial=meals.filter(x=>x.partial).length;
 const q=$('quality-report');q.replaceChildren();const addStat=(label,value)=>{const r=node('div','statline');r.append(node('span','',label),node('b','',value));q.append(r);};
 addStat('열량이 기록된 날짜',foodDays.length+' / 14일');addStat('추정치 포함 음식',records.items.filter(i=>isEstimatedNote(i.source_note)&&last14.includes(dateKey(records.meals.find(m=>m.id===i.meal_id)?.eaten_at||0))).length+'개');addStat('열량 일부 누락 날짜',partial+'일');addStat('수면이 기록된 날짜',sleepDays.length+' / 14일');addStat('기록된 전체 수면 횟수',records.sleep.filter(x=>last14.includes(dateKey(x.end_at))).length+'회');
 const where=$('insight-report');where.replaceChildren();
 if(!sleepDays.length&&!foodDays.length)return empty(where,'분석할 기록이 아직 충분하지 않습니다.');
 if(sleepDays.length)where.append(node('p','noticebox',`수면 기록이 있는 ${sleepDays.length}일의 일별 총 수면 평균은 ${(sleepDays.reduce((a,b)=>a+b.value,0)/sleepDays.length).toFixed(1)}시간입니다. 누락된 날짜는 평균에서 제외했어요.`));
 if(foodDays.length)where.append(node('p','noticebox',`열량을 기록한 ${foodDays.length}일의 평균 기록 열량은 ${Math.round(foodDays.reduce((a,b)=>a+b.value,0)/foodDays.length).toLocaleString()}kcal입니다. 일부 음식의 영양값이 빠진 날짜는 실제 섭취량보다 작게 나타날 수 있어요.`));
}
function cancelEdit(){
 editing=null;draft=null;$('review').hidden=true;$('entry-text').value='';
 $('save-entry').textContent='확인 후 저장';$('cancel-edit').hidden=true;
 modelStatus.textContent='수정을 취소했습니다.';
}
function editRecord(type,entry){
 if(!user||entry.user_id!==user.id)return;
 editing={id:entry.id,type,userId:user.id};
 $('entry-text').value=entry.raw_text||'';
 if(type==='meal'){
  const items=itemsFor(entry);
  if(!items.length){editing=null;showStatus('음식 항목을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.');return;}
  draft={kind:'meal',meal:{eaten_at:entry.eaten_at,meal_type:entry.meal_type,items:items.map(i=>({
   name:i.name,quantity:i.quantity,unit:i.unit,calories_kcal:i.calories_kcal,
   protein_g:i.protein_g,carbs_g:i.carbs_g,fat_g:i.fat_g,
   nutrition_source:i.nutrition_source,source_note:i.source_note
  }))},questions:[]};
 }else{
  draft={kind:'sleep',sleep:{start_at:entry.start_at,end_at:entry.end_at,
   sleep_type:entry.sleep_type,quality:entry.quality},questions:[]};
 }
 go('capture');renderReview();
 $('save-entry').textContent='수정 내용 저장';$('cancel-edit').hidden=false;
 modelStatus.textContent='기존 기록 수정 중입니다. 변경 후 저장하거나 취소하세요.';
 $('review').scrollIntoView({behavior:'smooth',block:'start'});
}
async function removeRecord(type,entry){
 if(!confirm('선택한 기록을 삭제할까요? 삭제하면 되돌릴 수 없습니다.'))return;
 try{const table=type==='meal'?'meals':'sleep_sessions';const {error}=await db.from(table).delete().eq('id',entry.id).eq('user_id',user.id);if(error)throw error;await refresh();}catch(e){showStatus('삭제 실패: '+(e?.message||e));}
}
function field(parent,label,type,value,name){const wrap=node('div','field'),lbl=node('label','',label),input=node(type==='select'?'select':'input');if(type!=='select')input.type=type;input.dataset.name=name;if(value!==undefined&&value!==null)input.value=value;wrap.append(lbl,input);parent.append(wrap);return input;}
function selectField(parent,label,options,value,name){const wrap=node('div','field'),lbl=node('label','',label),sel=node('select');sel.dataset.name=name;for(const [val,text] of options){const op=node('option','',text);op.value=val;sel.append(op);}sel.value=value;wrap.append(lbl,sel);parent.append(wrap);return sel;}
function renderReview(){
 $('review-title').textContent=editing?'기록 수정':'저장 전 확인';
 const box=$('review-fields');box.replaceChildren();$('review').hidden=false;
 $('save-entry').disabled=false;
 const note=draft.kind==='sleep'?'수면 시작 및 종료 시각을 확인하세요. 원문에 없는 시각은 임의로 채우지 않습니다.':`음식 ${draft.meal.items.length}개 분리됨. 각 음식의 양과 날짜·시각을 확인하세요. 일반 식품 영양성분은 참고용 추정값입니다.`;
 $('review-note').textContent=note+(draft.questions?.length?' 확인 사항: '+draft.questions.join(' / '):'');
 if(draft.kind==='meal'){
  const meta=node('div','formgrid');field(meta,'먹은 일시','datetime-local',dateTimeLocal(draft.meal.eaten_at),'eaten_at');selectField(meta,'식사 유형',[['breakfast','아침'],['lunch','점심'],['dinner','저녁'],['snack','간식'],['other','기타']],draft.meal.meal_type,'meal_type');box.append(meta);
  draft.meal.items.forEach((item,index)=>{const card=node('div','foodline');card.append(node('h4','',`음식 ${index+1}${isEstimatedNote(item.source_note)?' · 참고용 추정':''}`));const grid=node('div','formgrid');field(grid,'음식명','text',item.name,'name');field(grid,'양','number',item.quantity,'quantity');field(grid,'단위','text',item.unit,'unit');field(grid,'열량 kcal (선택)','number',item.calories_kcal,'calories_kcal');field(grid,'단백질 g (선택)','number',item.protein_g,'protein_g');field(grid,'탄수화물 g (선택)','number',item.carbs_g,'carbs_g');field(grid,'지방 g (선택)','number',item.fat_g,'fat_g');selectField(grid,'영양값 출처',[['unknown',isEstimatedNote(item.source_note)?'자동 추정 · 미검증':'미기록 / 미검증'],['user_provided','직접 입력'],['verified_label','제품 영양표시'],['verified_database','검증된 식품 데이터']],item.nutrition_source||'unknown','nutrition_source');card.append(grid);field(card,'영양 정보 출처 메모 (선택)','text',item.source_note,'source_note');
  if(draft.meal.items.length>1){const remove=node('button','secondary','− 이 음식 삭제');remove.type='button';remove.onclick=()=>{try{const current=collectDraftFromUI({allowMissingMealTime:true});current.items.splice(index,1);draft.meal={...draft.meal,...current};renderReview();}catch(err){showStatus(err?.message||'음식을 삭제할 수 없습니다.');}};card.append(remove);}
  box.append(card);});
  const plus=node('button','secondary','＋ 음식 추가');plus.type='button';plus.onclick=()=>{const saved=collectDraftFromUI({allowMissingMealTime:true});if(saved.items.length>=15){showStatus('한 기록은 음식 최대 15개까지 저장합니다.');return;}draft.meal.items=[...saved.items,{name:'',quantity:null,unit:'',nutrition_source:'unknown'}];draft.meal.eaten_at=saved.eaten_at;draft.meal.meal_type=saved.meal_type;renderReview();};box.append(plus);
 }else{
  const meta=node('div','formgrid');const start=field(meta,'수면 시작 · 필수','datetime-local',dateTimeLocal(draft.sleep.start_at),'start_at');const end=field(meta,'수면 종료 · 필수','datetime-local',dateTimeLocal(draft.sleep.end_at),'end_at');start.required=true;end.required=true;
  selectField(meta,'수면 유형',[['main','주 수면'],['nap','낮잠']],draft.sleep.sleep_type,'sleep_type');selectField(meta,'주관적 수면의 질',[['','선택 안 함'],['1','1 · 매우 나쁨'],['2','2'],['3','3 · 보통'],['4','4'],['5','5 · 매우 좋음']],draft.sleep.quality===null||draft.sleep.quality===undefined?'':String(draft.sleep.quality),'quality');box.append(meta);
  const guidance=node('p','muted small');box.append(guidance);
  const check=()=>{const a=start.value,b=end.value,minutes=a&&b?(new Date(b)-new Date(a))/60000:NaN;const valid=Number.isFinite(minutes)&&minutes>0&&minutes<=1440&&start.validity.valid&&end.validity.valid;
   $('save-entry').disabled=!valid;
   guidance.textContent=!a||!b?'시작·종료 시각을 모두 입력하면 저장 버튼이 활성화됩니다.':valid?'수면시간 '+(minutes/60).toFixed(1)+'시간 · 저장할 수 있습니다.':'종료 시각은 시작보다 나중이어야 하고, 수면시간은 24시간 이하여야 합니다.';};
  start.addEventListener('input',check);end.addEventListener('input',check);check();
 }
}
function collectDraftFromUI({allowMissingMealTime=false}={}){
 const root=$('review-fields');const get=(key)=>root.querySelector(`[data-name="${key}"]`)?.value||'';
 if(draft.kind==='sleep')return {start_at:fromLocal(get('start_at')),end_at:fromLocal(get('end_at')),sleep_type:get('sleep_type'),quality:get('quality')?Number(get('quality')):null};
 const list=[...root.querySelectorAll('.foodline')].map(line=>{const val=(key)=>line.querySelector(`[data-name="${key}"]`)?.value||'';const name=val('name').trim();if(!name)throw Error('음식명을 입력하세요.');
  return {name,quantity:numericOrNull(val('quantity')),unit:val('unit').trim(),calories_kcal:numericOrNull(val('calories_kcal')),protein_g:numericOrNull(val('protein_g')),carbs_g:numericOrNull(val('carbs_g')),fat_g:numericOrNull(val('fat_g')),nutrition_source:val('nutrition_source'),source_note:val('source_note').trim()};});
 const time=get('eaten_at');
 return {eaten_at:time?fromLocal(time):(allowMissingMealTime?null:fromLocal(time)),meal_type:get('meal_type'),items:list};
}
async function analyze(){
 if(editing){modelStatus.textContent='먼저 기존 기록 수정을 저장하거나 취소하세요.';return;}
 const raw=$('entry-text').value.trim();if(!raw){modelStatus.textContent='먼저 내용을 입력하세요.';return;}
 if(/(?:식사|먹었|먹은|점심|저녁|아침|음식)/.test(raw)&&/(?:잠들|잤어|수면|기상|잠을)/.test(raw)){modelStatus.textContent='식사와 수면을 한 번에 입력하셨네요. 데이터 누락을 막기 위해 각각 별도 기록으로 입력해 주세요.';return;}
 $('analyze').disabled=true;$('review').hidden=true;
 try{const started=performance.now();modelStatus.textContent='분석 준비 중…';draft=await extractEntry(raw,$('model').value,s=>modelStatus.textContent=s);renderReview();const elapsed=((performance.now()-started)/1000).toFixed(1);const missing=draft.kind==='sleep'&&(!draft.sleep.start_at||!draft.sleep.end_at);modelStatus.textContent=missing?`수면 기록 인식 (${elapsed}초). 시작·종료 시각을 입력해야 저장할 수 있습니다.`:draft.kind==='meal'?`${draft.extractor==='rules'?'즉시 추출':'AI 추출'} 완료 (${elapsed}초). 음식 ${draft.meal.items.length}개를 각각 분리했습니다. 확인 후 저장하세요.`:`추출 완료 (${elapsed}초). 날짜·시각·내용을 확인하고 저장하세요.`;}
 catch(e){modelStatus.textContent=e?.message||String(e);}
 finally{$('analyze').disabled=false;}
}
function manual(kind){
 if(editing){modelStatus.textContent='먼저 기존 기록 수정을 저장하거나 취소하세요.';return;}
 editing=null;$('cancel-edit').hidden=true;$('save-entry').textContent='확인 후 저장';
 const now=new Date(),later=new Date(now.getTime()+8*3600000);
 draft=kind==='meal'?{kind:'meal',meal:{eaten_at:now.toISOString(),meal_type:'other',items:[{name:'',quantity:null,unit:'',nutrition_source:'unknown'}]},questions:[]}:{kind:'sleep',sleep:{start_at:now.toISOString(),end_at:later.toISOString(),sleep_type:'main'},questions:[]};
 renderReview();modelStatus.textContent='수동 입력 모드입니다. 날짜와 시간 및 내용을 직접 검토해주세요.';
}
async function saveDraft(){
 if(!draft||!user)return;const button=$('save-entry');button.disabled=true;
 try{if(editing&&editing.userId!==user.id)throw Error('계정이 변경되었습니다. 수정을 중단하세요.');
 const data=collectDraftFromUI(),raw=$('entry-text').value.trim(),tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Seoul';
  if(draft.kind==='meal'){
   if(data.items.length===0||data.items.length>15)throw Error('음식은 1~15개까지 입력하세요.');
   for(const item of data.items){if((item.calories_kcal!==null||item.protein_g!==null||item.carbs_g!==null||item.fat_g!==null)&&item.nutrition_source==='unknown'&&!isEstimatedNote(item.source_note))throw Error('영양성분을 직접 입력했다면 출처 유형을 선택하세요. 자동 추정값은 미검증 상태로 저장됩니다.');}
   const params={p_eaten_at:data.eaten_at,p_timezone:tz,p_meal_type:data.meal_type,p_raw_text:raw,p_notes:'',p_items:data.items};
   const {error}=editing?await db.rpc('update_meal',{p_meal_id:editing.id,...params}):await db.rpc('create_meal',params);if(error)throw error;
  }else{
   if(sleepMinutes(data.start_at,data.end_at)<=0||sleepMinutes(data.start_at,data.end_at)>1440)throw Error('수면 시작과 종료를 확인하세요 (최대 24시간).');
   const fields={start_at:data.start_at,end_at:data.end_at,sleep_type:data.sleep_type,quality:data.quality,raw_text:raw};
   const result=editing?await db.from('sleep_sessions').update(fields).eq('id',editing.id).eq('user_id',user.id).select('id'):await db.from('sleep_sessions').insert({user_id:user.id,...fields});
   if(result.error)throw result.error;
   if(editing&&result.data?.length!==1)throw Error('수정할 기록을 찾지 못했거나 권한이 없습니다.');
  }
  const wasEdit=!!editing;editing=null;draft=null;$('review').hidden=true;$('entry-text').value='';
  $('save-entry').textContent='확인 후 저장';$('cancel-edit').hidden=true;
  modelStatus.textContent=wasEdit?'수정 성공. 내 기록에 반영되었습니다.':'저장 성공. 내 기록에 반영되었습니다.';
  await refresh();go(data.items?'meals':'sleep');showStatus(wasEdit?'기존 기록 수정이 완료됐습니다.':'기록이 정상적으로 저장됐습니다.');
 }catch(e){const message='저장하지 못했습니다: '+(e?.message||e);modelStatus.textContent=message;showStatus(message);}
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
 lines.push('자동 추정 영양값은 일반 식품 평균치로 검증되지 않았습니다.');
 lines.push('누락 또는 부분 기록이 포함될 수 있으므로 실제 섭취 열량을 확정할 수 없습니다.');
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
 syncDashboardRange();
 document.querySelectorAll('[data-range-days]').forEach(b=>b.onclick=()=>applyDashboardRange(presetRange(Number(b.dataset.rangeDays)).start,presetRange(Number(b.dataset.rangeDays)).end));
 $('range-apply').onclick=()=>applyDashboardRange($('range-start').value,$('range-end').value);
 document.querySelectorAll('.navitem').forEach(b=>b.addEventListener('click',()=>go(b.dataset.tab)));
 document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.goto)));
 $('mode-login').onclick=()=>{signupMode=false;renderAuthMode()};
 $('mode-signup').onclick=()=>{signupMode=true;renderAuthMode()};
 $('check-username').onclick=checkUsername;
 $('username').addEventListener('input',()=>{checkedUsername=null;$('username-check-status').textContent=USERNAME_CHECK_URL?'아이디를 수정했습니다. 다시 중복 확인해 주세요.':'아이디를 수정했습니다. 형식을 확인해 주세요. 중복 여부는 가입 시 자동 검사됩니다.';});
 $('auth-submit').onclick=authAction;
 $('password').addEventListener('keydown',e=>{if(e.key==='Enter')authAction()});
 $('signout').onclick=async()=>{if(clerk)await clerk.signOut();};
 $('refresh').onclick=refresh;$('download-report').onclick=downloadReport;$('analyze').onclick=analyze;$('manual-meal').onclick=()=>manual('meal');$('manual-sleep').onclick=()=>manual('sleep');$('save-entry').onclick=saveDraft;$('cancel-edit').onclick=cancelEdit;$('export').onclick=exportData;$('purge-records').onclick=purgeRecords;
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;$('install').hidden=false;});$('install').onclick=async()=>{if(installEvent){installEvent.prompt();await installEvent.userChoice;installEvent=null;$('install').hidden=true;}};
}
events();connect();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
