const CACHE_VERSION = 'die-maintenance-pwa-v3-no-module-ocr';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './features/camera-ocr.js',
    './icon-192.png',
    './icon-512.png'
];

const OCR_LIBRARY_HOSTS = [
    'cdn.jsdelivr.net',
    'unpkg.com',
    'docs.opencv.org',
    'tessdata.projectnaptha.com',
    'ui-avatars.com'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key !== CACHE_VERSION)
                .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);
    const isSameOrigin = requestUrl.origin === self.location.origin;
    const isOcrLibrary = OCR_LIBRARY_HOSTS.includes(requestUrl.hostname);

    if (isSameOrigin) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    if (isOcrLibrary) {
        event.respondWith(networkFirstThenCache(event.request));
    }
});

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, response.clone()).catch(() => undefined);
        return response;
    } catch (error) {
        if (request.mode === 'navigate') {
            const fallback = await caches.match('./index.html');
            if (fallback) return fallback;
        }
        throw error;
    }
}

async function networkFirstThenCache(request) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const response = await fetch(request);
        cache.put(request, response.clone()).catch(() => undefined);
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}
