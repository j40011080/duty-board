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

// 推播送來的是「data-only」訊息（Cloudflare Worker 那邊只送 data 欄位、
// 不送 notification 欄位），這樣才能保證一定會進到這個 push 事件由我們
// 自己組通知內容——如果讓瀏覽器用內建的 notification 欄位自動顯示，有些
// 瀏覽器會自動顯示一次、這裡又手動顯示一次，同一則通知會跳兩次。
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }

  const title = payload.title || '北港分隊 勤務看板';
  const body = payload.body || '';
  const options = {
    body,
    icon: './icon.svg',
    badge: './icon.svg',
    data: { url: payload.url || './' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 點通知時：如果已經有分頁開著這個網頁，直接切過去；沒有的話才開新分頁。
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
