const BUILD='2.6';
const CACHE=`exercise-vault-${BUILD}`;
const APP_SHELL=['./','./index.html','./styles.css?v=2.6','./app.js?v=2.6','./manifest.webmanifest?v=2.6'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Force fresh bytes into the offline fallback cache during every deployment.
    await Promise.all(APP_SHELL.map(async url=>{
      try{
        const request=new Request(url,{cache:'reload'});
        const response=await fetch(request);
        if(response.ok)await cache.put(request,response.clone());
      }catch{}
    }));
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE && k.startsWith('exercise-vault-')).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  event.respondWith((async()=>{
    // Always prefer the network and bypass the HTTP cache for our own app files.
    // Cache is only an offline fallback, so a new GitHub Pages deployment wins.
    try{
      const fresh=await fetch(event.request,{cache:'no-store'});
      if(fresh && fresh.ok){
        const cache=await caches.open(CACHE);
        cache.put(event.request,fresh.clone()).catch(()=>{});
      }
      return fresh;
    }catch{
      const cached=await caches.match(event.request,{ignoreSearch:false});
      if(cached)return cached;
      // Navigation fallback for offline use.
      if(event.request.mode==='navigate'){
        return (await caches.match('./index.html')) || Response.error();
      }
      return Response.error();
    }
  })());
});
