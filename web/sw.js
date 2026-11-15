/* Discover the page's local assets at install time so the cache follows it. */
'use strict';

const VERSION = '0.2.0';
const CACHE_PREFIX = 'space-impact-v';
const CACHE = CACHE_PREFIX + VERSION;
const ROOT_URL = new URL('./', self.location.href).href;
const INDEX_URL = new URL('./index.html', self.location.href).href;

function attribute(tag, name) {
  const pattern = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]+))', 'i');
  const match = pattern.exec(tag);
  if (!match) return null;
  return (match[1] || match[2] || match[3] || '').replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, function (entity) {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    const number = lower[2] === 'x' ? parseInt(lower.slice(3, -1), 16) : parseInt(lower.slice(2, -1), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}

function localUrl(value, base) {
  if (!value || value.charAt(0) === '#') return null;
  try {
    const url = new URL(value, base);
    if (url.origin !== self.location.origin || !/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    return url.href;
  } catch (error) {
    return null;
  }
}

async function discoverAssets() {
  const response = await fetch(INDEX_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Could not fetch index.html for offline installation');
  const html = (await response.text()).replace(/<!--[\s\S]*?-->/g, '');
  const assets = new Set([ROOT_URL, INDEX_URL]);
  const manifests = new Set();
  const tags = /<(script|link)\b[^>]*>/gi;
  let match;
  while ((match = tags.exec(html))) {
    const isLink = match[1].toLowerCase() === 'link';
    const url = localUrl(attribute(match[0], isLink ? 'href' : 'src'), INDEX_URL);
    if (!url) continue;
    assets.add(url);
    const rel = isLink ? attribute(match[0], 'rel') : null;
    if (rel && rel.toLowerCase().split(/\s+/).includes('manifest')) manifests.add(url);
  }

  // Manifest icon paths are relative to the manifest, not to index.html.
  for (const manifestUrl of manifests) {
    const manifestResponse = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!manifestResponse.ok) throw new Error('Could not fetch manifest for offline installation');
    const manifest = await manifestResponse.json();
    for (const icon of manifest.icons || []) {
      const url = localUrl(icon.src, manifestUrl);
      if (url) assets.add(url);
    }
  }
  return Array.from(assets);
}

self.addEventListener('install', function (event) {
  event.waitUntil(discoverAssets()
    .then(function (assets) { return caches.open(CACHE).then(function (cache) { return cache.addAll(assets); }); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys()
    .then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.startsWith(CACHE_PREFIX) && key !== CACHE;
      }).map(function (key) { return caches.delete(key); }));
    })
    .then(function () { return self.clients.claim(); }));
});

// Network first; a failed network request falls back to this version's cache.
self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(function (response) {
    if (!response.ok) return response;
    const copy = response.clone();
    return caches.open(CACHE).then(function (cache) { return cache.put(request, copy); })
      .catch(function () { /* The network response remains usable if caching fails. */ })
      .then(function () { return response; });
  }, function () {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(request, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (request.mode === 'navigate') return cache.match(INDEX_URL);
        return null;
      });
    }).then(function (hit) { return hit || Response.error(); });
  }));
});
