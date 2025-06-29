// Service Worker 版本號
const CACHE_NAME = 'angel-numbers-cache-v1';

// 需要快取的文件列表
// 確保這裡包含了所有靜態資源，包括 HTML, CSS, JavaScript, CSV 檔案
const urlsToCache = [
  './', // 快取根目錄，即 index.html
  './index.html',
  './style.css',
  './script.js',
  './angel_numbers.csv', // 確保 CSV 檔案也被快取
  // 您還需要根據 manifest.json 中的路徑，確保 icons 資料夾下的圖標也被快取
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// 安裝 Service Worker
// 當瀏覽器第一次安裝 Service Worker 時觸發
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: 開啟快取並快取所有 URL');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Service Worker: 快取失敗', error);
      })
  );
});

// 攔截網路請求
// 當瀏覽器嘗試請求資源時觸發
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 如果快取中存在資源，則返回快取中的版本
        if (response) {
          console.log('Service Worker: 從快取中獲取:', event.request.url);
          return response;
        }
        // 否則，從網路獲取資源
        console.log('Service Worker: 從網路獲取:', event.request.url);
        return fetch(event.request)
          .then((fetchResponse) => {
            // 如果網路請求成功，快取回應並返回
            // 檢查回應是否有效 (HTTP狀態碼 200) 且不是不透明回應 (opaque response)
            if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
              return fetchResponse;
            }
            const responseToCache = fetchResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            return fetchResponse;
          })
          .catch((fetchError) => {
            console.error('Service Worker: 網路請求失敗:', event.request.url, fetchError);
            // 您可以在這裡添加離線頁面或錯誤頁面的回退邏輯
            // 例如，如果網路不可用，返回一個預設的離線頁面
            // return caches.match('/offline.html');
          });
      })
  );
});

// 激活 Service Worker
// 當 Service Worker 啟動後，清理舊的快取版本
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 刪除舊的快取:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
