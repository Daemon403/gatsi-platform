import assert from 'node:assert/strict';
import test from 'node:test';

const cacheStores = new Map();
const handlers = new Map();
const cacheKey = (request) => typeof request === 'string' ? request : request.url;
const cacheFor = (name) => {
  if (!cacheStores.has(name)) cacheStores.set(name, new Map());
  const entries = cacheStores.get(name);
  return {
    put: async (request, response) => { entries.set(cacheKey(request), response.clone()); },
  };
};

globalThis.caches = {
  open: async (name) => cacheFor(name),
  keys: async () => [...cacheStores.keys()],
  delete: async (name) => cacheStores.delete(name),
  match: async (request) => {
    const key = cacheKey(request);
    for (const entries of cacheStores.values()) {
      const response = entries.get(key);
      if (response) return response.clone();
    }
    return undefined;
  },
};

let claimed = false;
let skippedWaiting = false;
globalThis.self = {
  registration: { scope: 'https://gatsi.test/' },
  location: { origin: 'https://gatsi.test' },
  clients: { claim: async () => { claimed = true; } },
  skipWaiting: async () => { skippedWaiting = true; },
  addEventListener: (name, handler) => handlers.set(name, handler),
};

const indexHtml = '<!doctype html><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script>';
let networkRequests = [];
globalThis.fetch = async (request) => {
  const url = cacheKey(request);
  networkRequests.push(url);
  if (url.endsWith('/index.html')) return new Response(indexHtml, { status: 200, headers: { 'content-type': 'text/html' } });
  if (url.endsWith('/assets/app.css')) return new Response('body{}', { status: 200 });
  if (url.endsWith('/assets/app.js')) return new Response('export {}', { status: 200 });
  throw new Error(`Unexpected request: ${url}`);
};

await import('../public/sw.js');

const runWaitUntil = async (name) => {
  let promise;
  handlers.get(name)({ waitUntil: (value) => { promise = value; } });
  await promise;
};

test('pre-caches the production shell and serves it for offline navigation', async () => {
  await runWaitUntil('install');
  assert.equal(skippedWaiting, true);
  assert.deepEqual(networkRequests.sort(), [
    'https://gatsi.test/assets/app.css',
    'https://gatsi.test/assets/app.js',
    '/index.html',
  ].sort());

  await runWaitUntil('activate');
  assert.equal(claimed, true);

  globalThis.fetch = async () => { throw new Error('offline'); };
  let responsePromise;
  handlers.get('fetch')({
    request: { method: 'GET', mode: 'navigate', url: 'https://gatsi.test/orders/new' },
    respondWith: (value) => { responsePromise = value; },
  });
  const response = await responsePromise;
  assert.equal(await response.text(), indexHtml);
});

test('serves a cached hashed asset without touching the network', async () => {
  let requested = false;
  globalThis.fetch = async () => { requested = true; throw new Error('offline'); };
  let responsePromise;
  handlers.get('fetch')({
    request: { method: 'GET', mode: 'cors', url: 'https://gatsi.test/assets/app.js' },
    respondWith: (value) => { responsePromise = value; },
  });
  const response = await responsePromise;
  assert.equal(await response.text(), 'export {}');
  assert.equal(requested, false);
});
