// ติดตั้ง Service Worker
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Installed');
});

// ให้ดึงข้อมูลตามปกติ
self.addEventListener('fetch', (e) => {
    // โค้ดนี้สามารถพัฒนาต่อเพื่อทำให้แอปใช้งานตอนไม่มีเน็ต (Offline) ได้
});