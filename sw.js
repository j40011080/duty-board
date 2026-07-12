// 勤務看板 Service Worker
// 這裡採用「網路優先」策略：優先抓最新內容，只有離線時才用快取，
// 避免大家看到舊的勤務資料。

const CACHE_NAME = "duty-board-cache-v2";
const APP_SHELL = [
  "./index.html",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Cache Storage 只能存 GET 請求；版本偵測用的 HEAD 請求（以及其他非 GET
  // 請求）單純透傳給網路，不寫入快取，避免多餘的錯誤。
  if(event.request.method !== "GET"){
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
