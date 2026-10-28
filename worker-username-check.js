/** Cloudflare Worker: Optional preflight username availability check via Clerk's official Backend API.
 * This endpoint never creates accounts. Clerk performs the final uniqueness check on signup.
 * CLERK_SECRET_KEY must be a Cloudflare Worker Secret, not committed to git.
 * Configure ALLOWED_ORIGINS with an exact comma-separated allowlist of deployment origins.
 */
const pattern=/^[a-z][a-z0-9_]{3,23}$/;
const json=(data,status=200,origin='')=>new Response(JSON.stringify(data),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff','Vary':'Origin',
   ...(origin?{'Access-Control-Allow-Origin':origin}:{})}
});
export default {async fetch(request,env={}){
 const origin=request.headers.get('Origin')||'';
 const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!allowed.length||!allowed.includes(origin))return json({error:'Origin not allowed'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Vary':'Origin'}});
 if(request.method!=='GET')return json({error:'Method not allowed'},405,origin);
 const path=new URL(request.url);
 if(path.pathname==='/health')return json({ok:true,configured:!!env.CLERK_SECRET_KEY},200,origin);
 if(path.pathname!=='/check')return json({error:'Not found'},404,origin);
 const username=String(path.searchParams.get('username')||'').trim().toLowerCase();
 if(!pattern.test(username))return json({error:'Invalid username'},400,origin);
 if(!env.CLERK_SECRET_KEY)return json({error:'Clerk integration not configured'},503,origin);
 const url=new URL('https://api.clerk.com/v1/users');
 url.searchParams.append('username[]',username);
 url.searchParams.set('limit','1');
 try{
  const res=await fetch(url.toString(),{headers:{'Authorization':'Bearer '+env.CLERK_SECRET_KEY,'Accept':'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!res.ok)return json({error:'Username provider unavailable'},502,origin);
  const payload=await res.json();
  if(!Array.isArray(payload))return json({error:'Invalid provider response'},502,origin);
  const taken=payload.some(x=>String(x?.username||'').toLowerCase()===username);
  return json({available:!taken,checked_at:new Date().toISOString()},200,origin);
 }catch{return json({error:'Username provider unavailable'},502,origin)}
}};
