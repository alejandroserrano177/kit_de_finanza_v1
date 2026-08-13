const CACHE_NAME="kit-finanzas-v3-0";
const ASSETS=["./","./index.html","./style.css","./app.js"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin){
    event.respondWith(
      fetch(event.request).then(response=>{
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
        return response;
      }).catch(()=>caches.match(event.request).then(r=>r||caches.match("./index.html")))
    );
  }
});
