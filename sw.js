// 勤務看板 Service Worker
// 這裡採用「網路優先」策略：優先抓最新內容，只有離線時才用快取，
// 避免大家看到舊的勤務資料。

const CACHE_NAME = "duty-board-cache-v2";
const APP_SHELL = [
  "./index.html",
  "./manifest.json",
  "./icon.svg"
];

// 你的 Firebase Realtime Database URL（從 index.html 的 firebaseConfig 抓來的）。
// 除錯用：不管 push 收到的內容解不解析得出來，都先記一筆到這裡，
// 之後在 Firebase 主控台的 pushDebugLog 節點就能看到「當時真的收到什麼」。
const DEBUG_LOG_URL = "https://beigang0711-default-rtdb.asia-southeast1.firebasedatabase.app/pushDebugLog.json";

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
  // 先把「原始、還沒解析過」的內容留一份，不管等一下解不解析得出來都能記錄。
  const rawText = event.data ? (() => { try { return event.data.text(); } catch (e) { return '(讀取 raw text 失敗：' + e.message + ')'; } })() : '(event.data 是 null)';

  let payload = {};
  let parseError = '';
  try { payload = event.data ? event.data.json() : {}; } catch (e) { parseError = e.message; payload = {}; }

  const title = payload.title || '北港分隊 勤務看板';
  const body = payload.body || '';
  const options = {
    body,
    icon: './icon.svg',
    badge: './icon.svg',
    data: { url: payload.url || './' }
  };

  // 除錯紀錄：每次收到 push 都記一筆，之後回頭比對哪次是空白的、當時原始內容長怎樣。
  // 用 event.waitUntil 是為了讓瀏覽器知道「這個非同步動作還沒做完，先別把 SW 睡掉」，
  // 就算失敗也用 .catch 吞掉，不能讓記錄本身害通知顯示不出來。
  event.waitUntil(
    Promise.all([
      fetch(DEBUG_LOG_URL, {
        method: 'POST',
        body: JSON.stringify({
          ts: Date.now(),
          raw: rawText,
          parsedTitle: title,
          parsedBody: body,
          parseError: parseError || null
        })
      }).catch(() => {}),
      self.registration.showNotification(title, options)
    ])
  );
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
