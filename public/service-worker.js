const CACHE='rhythm-log-shell-v05';
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./','./manifest.webmanifest','./assets/icon.svg'])));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
 self.clients.claim();
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 const u=new URL(req.url);
 // Never cache Clerk/Supabase/AI provider traffic or personal data.
 if(req.method!=='GET'||u.origin!==self.location.origin)return;
 event.respondWith(fetch(req).then(response=>{
  if(response.ok && (u.pathname.includes('/assets/')||u.pathname.endsWith('/manifest.webmanifest')||u.pathname.endsWith('/'))) {
   const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)));
  }
  return response;
 }).catch(()=>caches.match(req)));
});
