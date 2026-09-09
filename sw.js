const CACHE="boodschappen-cache-v2";
const ACTIVA=["./","./index.html","./style.css","./app.js","./manifest.json","./icoon-192.png","./icoon-512.png"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ACTIVA)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    ])
  );
});

self.addEventListener("fetch",event=>{
  const req=event.request;

  // Voor HTML/JS/CSS eerst internet proberen, zodat updates sneller binnenkomen.
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

  // Voor iconen en overige bestanden cache-first.
  event.respondWith(
    caches.match(req).then(cached=>cached || fetch(req).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(req,copy));
      return response;
    }))
  );
});
