const CACHE="boodschappen-cache-v3";
const ACTIVA=["./","./index.html","./style.css","./app.js","./manifest.json","./icoon-192.png","./icoon-512.png"];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ACTIVA)));
});

self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  ]));
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  const url=new URL(req.url);

  // Supabase/API-verkeer nooit uit cache halen.
  if(url.hostname.endsWith(".supabase.co") || url.pathname.includes("/rest/v1/")){
    event.respondWith(fetch(req));
    return;
  }

  if(req.mode==="navigate" || ["script","style"].includes(req.destination)){
    event.respondWith(
      fetch(req).then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy));
        return response;
      }).catch(()=>caches.match(req).then(r=>r||caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached=>cached || fetch(req).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(req,copy));
      return response;
    }))
  );
});
