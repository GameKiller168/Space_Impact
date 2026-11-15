'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const web = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(web, 'manifest.webmanifest'), 'utf8'));
const workerCode = fs.readFileSync(path.join(web, 'sw.js'), 'utf8');
const sprites = require('../js/spaceimpact-assets.js').images;
const base = 'https://example.test/projects/space-impact/';
const cacheName = 'space-impact-v0.2.0-beta.1';

function pngInfo(file) {
  const bytes = fs.readFileSync(file);
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  return { bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function pngPixels(info) {
  // These generated PNGs use 8-bit RGBA and unfiltered scanlines.
  assert.equal(info.bytes[24], 8);
  assert.equal(info.bytes[25], 6);
  const compressed = [];
  for (let offset = 8; offset < info.bytes.length;) {
    const length = info.bytes.readUInt32BE(offset);
    const type = info.bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') compressed.push(info.bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const stride = 1 + info.width * 4;
  assert.equal(raw.length, stride * info.height);
  const pixels = [];
  for (let y = 0; y < info.height; y++) {
    assert.equal(raw[y * stride], 0);
    for (let x = 0; x < info.width; x++) {
      const offset = y * stride + 1 + x * 4;
      pixels.push(Array.from(raw.subarray(offset, offset + 4)));
    }
  }
  return pixels;
}

test('manifest describes the installable Space Impact app and matching PNG files', () => {
  assert.equal(manifest.name, 'Space Impact');
  assert.equal(manifest.short_name, 'Space Impact');
  assert.match(manifest.description, /fan-made/i);
  assert.match(manifest.description, /browser/i);
  assert.match(manifest.description, /Nokia 3310/i);
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait');
  assert.equal(manifest.background_color, '#14161a');
  assert.equal(manifest.theme_color, '#14161a');
  const expected = [
    ['icons/icon-192.png', 192, 'any'],
    ['icons/icon-512.png', 512, 'any'],
    ['icons/maskable-192.png', 192, 'maskable'],
    ['icons/maskable-512.png', 512, 'maskable']
  ];
  assert.equal(manifest.icons.length, expected.length);
  for (const [src, size, purpose] of expected) {
    const icon = manifest.icons.find((item) => item.src === src);
    assert.ok(icon, src);
    assert.equal(icon.sizes, `${size}x${size}`);
    assert.equal(icon.type, 'image/png');
    assert.equal(icon.purpose, purpose);
    const info = pngInfo(path.join(web, src));
    assert.deepEqual([info.width, info.height], [size, size]);
  }
  const apple = pngInfo(path.join(web, 'icons/apple-touch-icon.png'));
  assert.deepEqual([apple.width, apple.height], [180, 180]);
});

test('icons use crisp LCD colors and maskable artwork fits the safe circle', () => {
  for (const name of ['icon-192.png', 'icon-512.png', 'maskable-192.png', 'maskable-512.png', 'apple-touch-icon.png']) {
    const info = pngInfo(path.join(web, 'icons', name));
    const maskable = name.startsWith('maskable-');
    let darkPixels = 0;
    const pixels = pngPixels(info);
    pixels.forEach((pixel, index) => {
      const color = pixel.join(',');
      assert.ok(['162,173,138,255', '34,42,28,255', '0,0,0,0'].includes(color), `${name}: ${color}`);
      if (maskable || name === 'apple-touch-icon.png') assert.equal(pixel[3], 255);
      if (color === '34,42,28,255') {
        darkPixels++;
        if (maskable) {
          const x = index % info.width;
          const y = Math.floor(index / info.width);
          assert.ok(Math.hypot(x + 0.5 - info.width / 2, y + 0.5 - info.height / 2) <= info.width * 0.4);
        }
      }
    });
    assert.ok(darkPixels > 0, `${name} contains artwork`);

    // Read the logical LCD scene back from the PNG and compare its pixels to
    // the source bitmaps, including both separate shots.
    const scale = { 'icon-192.png': 5, 'icon-512.png': 14, 'maskable-192.png': 4,
      'maskable-512.png': 12, 'apple-touch-icon.png': 5 }[name];
    const left = Math.floor((info.width - 31 * scale) / 2);
    const top = Math.floor((info.height - 7 * scale) / 2);
    const scene = Array.from({ length: 7 }, () => Array(31).fill('.'));
    for (const [sprite, atX, atY] of [[sprites[0], 0, 0], [sprites[17], 12, 3],
      [sprites[17], 16, 3], [sprites[4], 20, 1]]) {
      sprite.rows.forEach((row, y) => Array.from(row).forEach((pixel, x) => {
        if (pixel === '#') scene[atY + y][atX + x] = '#';
      }));
    }
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 31; x++) {
        const sampleX = left + x * scale + Math.floor(scale / 2);
        const sampleY = top + y * scale + Math.floor(scale / 2);
        const actual = pixels[sampleY * info.width + sampleX].join(',');
        assert.equal(actual, scene[y][x] === '#' ? '34,42,28,255' : '162,173,138,255',
          `${name} source pixel ${x},${y}`);
      }
    }
  }
});

function workerEnvironment() {
  const handlers = new Map();
  const stores = new Map();
  const calls = [];
  const added = [];
  let offline = false;
  let skipped = false;
  let claimed = false;
  const html = `<!doctype html>
    <link href="css/game.css?theme=green&amp;v=2" rel="stylesheet">
    <LINK REL="manifest" HREF="meta/app.webmanifest">
    <link rel='apple-touch-icon' href='icons/apple-touch-icon.png'>
    <link rel="icon" href="data:image/svg+xml,inline">
    <link rel="stylesheet" href="https://cdn.example.test/remote.css">
    <!-- <script src="js/commented-out.js"></script> -->
    <script data-src="js/not-loaded.js"></script>
    <script defer src=js/game.js></script>
    <script src='js/engine.js?revision=1'></script>`;
  const files = new Map([
    [base, html],
    [base + 'index.html', html],
    [base + 'meta/app.webmanifest', JSON.stringify({ icons: [
      { src: '../icons/icon-192.png' },
      { src: '../icons/maskable-512.png' },
      { src: 'data:image/png,inline' },
      { src: 'https://cdn.example.test/remote.png' }
    ] })],
    [base + 'css/game.css?theme=green&v=2', 'css v1'],
    [base + 'icons/apple-touch-icon.png', 'apple icon'],
    [base + 'icons/icon-192.png', 'icon'],
    [base + 'icons/maskable-512.png', 'maskable icon'],
    [base + 'js/game.js', 'game v1'],
    [base + 'js/engine.js?revision=1', 'engine']
  ]);
  function urlOf(request) {
    return new URL(typeof request === 'string' ? request : request.url, base).href;
  }
  async function fetchStub(request) {
    const url = urlOf(request);
    calls.push(url);
    if (offline) throw new TypeError('offline');
    return files.has(url) ? new Response(files.get(url)) : new Response('not found', { status: 404 });
  }
  function createCache() {
    const entries = new Map();
    return {
      async addAll(requests) {
        added.push(Array.from(requests));
        const responses = await Promise.all(Array.from(requests, async (request) => {
          const response = await fetchStub(request);
          if (!response.ok) throw new TypeError('precache failed');
          return [request, response];
        }));
        for (const [request, response] of responses) entries.set(urlOf(request), response.clone());
      },
      async put(request, response) { entries.set(urlOf(request), response.clone()); },
      async match(request, options) {
        const url = urlOf(request);
        if (entries.has(url)) return entries.get(url).clone();
        if (options && options.ignoreSearch) {
          const withoutQuery = (value) => { const parsed = new URL(value); parsed.search = ''; return parsed.href; };
          for (const [key, response] of entries) {
            if (withoutQuery(key) === withoutQuery(url)) return response.clone();
          }
        }
        return undefined;
      }
    };
  }
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, createCache());
      return stores.get(name);
    },
    async keys() { return Array.from(stores.keys()); },
    async delete(name) { return stores.delete(name); }
  };
  const self = {
    location: new URL('sw.js', base),
    addEventListener(type, handler) { handlers.set(type, handler); },
    skipWaiting() { skipped = true; return Promise.resolve(); },
    clients: { claim() { claimed = true; return Promise.resolve(); } }
  };
  vm.runInNewContext(workerCode, { self, caches, fetch: fetchStub, URL, Response }, { filename: 'sw.js' });
  async function lifecycle(type) {
    let pending;
    handlers.get(type)({ waitUntil(promise) { pending = promise; } });
    assert.ok(pending, `${type} must extend its lifetime`);
    return pending;
  }
  async function request(url, options = {}) {
    let pending;
    const req = { method: options.method || 'GET', mode: options.mode || 'cors', url: new URL(url, base).href };
    handlers.get('fetch')({ request: req, respondWith(promise) { pending = promise; } });
    return pending ? await pending : null;
  }
  return {
    lifecycle, request, caches, files, calls, added,
    setOffline(value) { offline = value; },
    get skipped() { return skipped; },
    get claimed() { return claimed; }
  };
}

test('install discovers page references and manifest icons, including subdirectory paths', async () => {
  const env = workerEnvironment();
  await env.lifecycle('install');
  assert.equal(env.skipped, true);
  assert.equal(env.added.length, 1);
  assert.deepEqual(new Set(env.added[0]), new Set([
    base, base + 'index.html', base + 'css/game.css?theme=green&v=2',
    base + 'meta/app.webmanifest', base + 'icons/apple-touch-icon.png',
    base + 'icons/icon-192.png', base + 'icons/maskable-512.png',
    base + 'js/game.js', base + 'js/engine.js?revision=1'
  ]));
  const cache = await env.caches.open(cacheName);
  for (const url of env.added[0]) assert.ok(await cache.match(url), `${url} was cached`);
});

test('a failed precache aborts installation without skipping the waiting worker', async () => {
  const env = workerEnvironment();
  env.files.delete(base + 'js/game.js');
  await assert.rejects(env.lifecycle('install'), /precache failed/);
  assert.equal(env.skipped, false);
});

test('network first updates the cache; offline requests use cached assets or the page', async () => {
  const env = workerEnvironment();
  await env.lifecycle('install');
  env.files.set(base + 'js/game.js', 'game v2');
  assert.equal(await (await env.request('js/game.js')).text(), 'game v2');
  env.setOffline(true);
  assert.equal(await (await env.request('js/game.js?cache-buster=2')).text(), 'game v2');
  assert.match(await (await env.request('a-page', { mode: 'navigate' })).text(), /<!doctype html>/);
  const missing = await env.request('js/missing.js');
  assert.equal(missing.type, 'error');
  assert.equal(missing.status, 0);
});

test('HTTP errors remain network responses and non-GET or cross-origin requests pass through', async () => {
  const env = workerEnvironment();
  await env.lifecycle('install');
  env.files.delete(base + 'js/game.js');
  assert.equal((await env.request('js/game.js')).status, 404);
  assert.equal(await env.request('js/game.js', { method: 'POST' }), null);
  assert.equal(await env.request('https://another.example/game.js'), null);
});

test('activation deletes older Space Impact caches and preserves unrelated apps', async () => {
  const env = workerEnvironment();
  await env.lifecycle('install');
  await env.caches.open('space-impact-v0.1.0');
  await env.caches.open('another-app-v1');
  await env.lifecycle('activate');
  assert.equal(env.claimed, true);
  assert.deepEqual(new Set(await env.caches.keys()), new Set([cacheName, 'another-app-v1']));
});

test('the current page and its linked manifest can be served from the cache', async () => {
  const env = workerEnvironment();
  const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8').replace('</head>',
    '<link rel="manifest" href="manifest.webmanifest">\n' +
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n</head>');
  env.files.clear();
  env.files.set(base, html);
  env.files.set(base + 'index.html', html);
  env.files.set(base + 'manifest.webmanifest', JSON.stringify(manifest));
  for (const directory of ['css', 'js', 'icons']) {
    for (const name of fs.readdirSync(path.join(web, directory))) {
      env.files.set(base + directory + '/' + name, fs.readFileSync(path.join(web, directory, name)));
    }
  }
  await env.lifecycle('install');
  env.setOffline(true);
  const page = await env.request('./', { mode: 'navigate' });
  assert.equal(page.status, 200);
  for (const match of html.matchAll(/<(?:script\s+src|link\s+rel="stylesheet"\s+href)="([^"]+)"/g)) {
    const response = await env.request(match[1]);
    assert.equal(response.status, 200, `${match[1]} should be available offline`);
  }
  for (const icon of manifest.icons) {
    assert.equal((await env.request(icon.src)).status, 200, `${icon.src} should be available offline`);
  }
  assert.equal((await env.request('icons/apple-touch-icon.png')).status, 200);
});
