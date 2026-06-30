import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5186);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
const STORE_PATH = join(DATA_DIR, 'store.json');
const SCAN_SLOTS = (process.env.SCAN_SLOTS || '00:10,12:10').split(',').map((s) => s.trim()).filter(Boolean);
const TIME_ZONE = process.env.TIME_ZONE || 'Asia/Shanghai';
const SHOP_API_ENDPOINT = process.env.SHOP_API_ENDPOINT || '';

const seededStores = [
  {
    id: '7496203341237029489',
    sellerId: '7496203341237029489',
    region: 'MX',
    name: 'TikTok Shop 店铺 1',
    sourceUrl: 'https://vt.tiktok.com/ZS964qMoXJvQ5-Ykgzg/',
    owner: '',
    note: '用户提供店铺链接',
    enabled: true,
    createdAt: new Date().toISOString(),
    lastScanAt: null,
    lastScanStatus: '等待采集'
  },
  {
    id: '7496250791428458775',
    sellerId: '7496250791428458775',
    region: 'MX',
    name: 'TikTok Shop 店铺 2',
    sourceUrl: 'https://vt.tiktok.com/ZS964qmEq4qMD-WBQyV/',
    owner: '',
    note: '用户提供店铺链接',
    enabled: true,
    createdAt: new Date().toISOString(),
    lastScanAt: null,
    lastScanStatus: '等待采集'
  },
  {
    id: '7496125260401773339',
    sellerId: '7496125260401773339',
    region: 'MX',
    name: 'TikTok Shop 店铺 3',
    sourceUrl: 'https://vt.tiktok.com/ZS964qsMDektM-RElYC/',
    owner: '',
    note: '用户提供店铺链接',
    enabled: true,
    createdAt: new Date().toISOString(),
    lastScanAt: null,
    lastScanStatus: '等待采集'
  }
];

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function dateKey(date = new Date(), timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function localClock(date = new Date(), timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function addDays(key, days) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function sendError(response, message, status = 400) {
  sendJson(response, { ok: false, error: message }, status);
}

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await stat(STORE_PATH);
  } catch {
    await saveStore({
      stores: seededStores,
      products: [],
      snapshots: [],
      meta: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        scanHistory: {}
      }
    });
  }
}

function migrateStore(store) {
  store.stores = store.stores || [];
  store.products = store.products || [];
  store.snapshots = store.snapshots || [];
  store.meta = store.meta || {};
  store.meta.scanHistory = store.meta.scanHistory || {};
  for (const item of store.stores) {
    item.id = item.id || item.sellerId;
    item.sellerId = item.sellerId || item.id;
    item.region = item.region || 'MX';
    item.name = item.name || `店铺 ${item.sellerId}`;
    item.sourceUrl = item.sourceUrl || '';
    item.owner = item.owner || '';
    item.note = item.note || '';
    item.enabled = item.enabled !== false;
    item.createdAt = item.createdAt || new Date().toISOString();
    item.lastScanAt = item.lastScanAt || null;
    item.lastScanStatus = item.lastScanStatus || '等待采集';
  }
}

async function loadStore() {
  await ensureStore();
  const store = JSON.parse(await readFile(STORE_PATH, 'utf8'));
  migrateStore(store);
  return store;
}

async function saveStore(store) {
  store.meta = store.meta || {};
  store.meta.updatedAt = new Date().toISOString();
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function decodeRepeated(value, times = 4) {
  let output = value || '';
  for (let i = 0; i < times; i += 1) {
    try {
      const next = decodeURIComponent(output);
      if (next === output) break;
      output = next;
    } catch {
      break;
    }
  }
  return output;
}

function parseStoreLink(input) {
  const raw = String(input || '').trim();
  const output = { sourceUrl: raw, sellerId: '', region: '' };
  if (!raw) return output;

  const sellerMatch = raw.match(/sellerId(?:%253D|%3D|=)(\d+)/i) || raw.match(/seller_id(?:%253D|%3D|=)(\d+)/i);
  if (sellerMatch) output.sellerId = sellerMatch[1];

  const regionMatch = raw.match(/share_region(?:%253D|%3D|=)([A-Z]{2})/i) || raw.match(/region(?:%253D|%3D|=)([A-Z]{2})/i);
  if (regionMatch) output.region = regionMatch[1].toUpperCase();

  try {
    const url = new URL(raw);
    const target = url.searchParams.get('target_url');
    if (target) {
      const decoded = decodeRepeated(target);
      const fromTarget = decoded.match(/sellerId=(\d+)/i);
      if (fromTarget) output.sellerId = fromTarget[1];
    }
    const shareRegion = url.searchParams.get('share_region');
    if (shareRegion) output.region = shareRegion.toUpperCase();
  } catch {
    // Plain IDs are accepted below.
  }

  if (!output.sellerId && /^\d{10,}$/.test(raw)) output.sellerId = raw;
  return output;
}

async function resolveStoreLink(input) {
  const direct = parseStoreLink(input);
  if (direct.sellerId) return direct;
  try {
    const response = await fetch(input, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 TikTokShopGrowthMonitor/0.1'
      }
    });
    const resolved = parseStoreLink(response.url);
    if (resolved.sellerId) return { ...resolved, sourceUrl: input, resolvedUrl: response.url };
    const text = await response.text();
    const fromText = parseStoreLink(text);
    return { ...fromText, sourceUrl: input, resolvedUrl: response.url };
  } catch {
    return direct;
  }
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).replace(/[,\s]/g, '').toLowerCase();
  const multiplier = text.endsWith('k') ? 1000 : text.endsWith('m') ? 1000000 : 1;
  const numeric = Number(text.replace(/[km]$/, ''));
  return Number.isFinite(numeric) ? Math.round(numeric * multiplier) : null;
}

function normalizeProduct(storeId, item) {
  const productId = String(item.productId || item.id || item.product_id || item.product_id_str || '').trim();
  if (!productId) return null;
  return {
    id: `${storeId}:${productId}`,
    storeId,
    productId,
    title: String(item.title || item.name || item.productName || '未命名商品').trim(),
    image: item.image || item.cover || item.thumbnail || '',
    url: item.url || item.productUrl || '',
    price: item.price ?? item.salePrice ?? '',
    sold: numberValue(item.sold ?? item.sales ?? item.volume ?? item.unitsSold),
    revenue: numberValue(item.revenue ?? item.gmv),
    lastSeenAt: new Date().toISOString()
  };
}

function upsertProduct(store, product) {
  const existing = store.products.find((item) => item.id === product.id);
  if (existing) Object.assign(existing, product);
  else store.products.push(product);
}

function upsertSnapshot(store, product) {
  const key = dateKey();
  const existing = store.snapshots.find((item) => item.productId === product.id && item.snapshotDate === key);
  const next = {
    productId: product.id,
    storeId: product.storeId,
    snapshotDate: key,
    sold: product.sold,
    revenue: product.revenue,
    price: product.price,
    capturedAt: new Date().toISOString()
  };
  if (existing) Object.assign(existing, next);
  else store.snapshots.push(next);
}

async function fetchProductsForStore(shop) {
  if (!SHOP_API_ENDPOINT) {
    return {
      ok: false,
      products: [],
      message: '已解析店铺 ID；商品列表需要接入 TikTok Shop 可访问接口或运营导出的商品数据。'
    };
  }
  const url = new URL(SHOP_API_ENDPOINT);
  url.searchParams.set('sellerId', shop.sellerId);
  url.searchParams.set('region', shop.region || 'MX');
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`商品接口返回 ${response.status}`);
  const data = await response.json();
  const list = Array.isArray(data) ? data : data.products || data.data || [];
  return { ok: true, products: list, message: `采集 ${list.length} 个商品` };
}

async function scanStores(store, stores = store.stores.filter((item) => item.enabled)) {
  const results = [];
  for (const shop of stores) {
    try {
      const fetched = await fetchProductsForStore(shop);
      let count = 0;
      for (const item of fetched.products) {
        const product = normalizeProduct(shop.id, item);
        if (!product) continue;
        upsertProduct(store, product);
        upsertSnapshot(store, product);
        count += 1;
      }
      shop.lastScanAt = new Date().toISOString();
      shop.lastScanStatus = fetched.message;
      results.push({ storeId: shop.id, ok: fetched.ok, count, message: fetched.message });
    } catch (error) {
      shop.lastScanAt = new Date().toISOString();
      shop.lastScanStatus = error.message;
      results.push({ storeId: shop.id, ok: false, count: 0, message: error.message });
    }
  }
  await saveStore(store);
  return results;
}

function snapshotMap(store) {
  const map = new Map();
  for (const row of store.snapshots) {
    if (!map.has(row.productId)) map.set(row.productId, new Map());
    map.get(row.productId).set(row.snapshotDate, row);
  }
  return map;
}

function growth(current, previous) {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return null;
  return current - previous;
}

function buildDashboard(store) {
  const today = dateKey();
  const snapshots = snapshotMap(store);
  const storesById = new Map(store.stores.map((item) => [item.id, item]));

  const rows = store.products.map((product) => {
    const productSnapshots = snapshots.get(product.id) || new Map();
    const currentSold = product.sold ?? productSnapshots.get(today)?.sold ?? null;
    const valueAt = (days) => productSnapshots.get(addDays(today, -days))?.sold ?? null;
    const d1 = growth(currentSold, valueAt(1));
    const d3 = growth(currentSold, valueAt(3));
    const d7 = growth(currentSold, valueAt(7));
    const d10 = growth(currentSold, valueAt(10));
    const shop = storesById.get(product.storeId);
    return {
      ...product,
      storeName: shop?.name || product.storeId,
      sellerId: shop?.sellerId || product.storeId,
      region: shop?.region || '',
      currentSold,
      d1,
      d3,
      d7,
      d10
    };
  });

  return {
    stores: store.stores,
    products: rows,
    meta: {
      ...store.meta,
      storeCount: store.stores.length,
      enabledStoreCount: store.stores.filter((item) => item.enabled).length,
      productCount: rows.length,
      snapshotCount: store.snapshots.length,
      scanSlots: SCAN_SLOTS,
      timeZone: TIME_ZONE,
      hasShopApi: Boolean(SHOP_API_ENDPOINT)
    }
  };
}

function parseCsv(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [storeId, productId, title, sold, price, revenue, url, image] = line.split(',').map((item) => item?.trim() || '');
      return { storeId, productId, title, sold, price, revenue, url, image };
    });
}

async function importProducts(store, rows) {
  let count = 0;
  for (const row of rows) {
    const storeId = row.storeId || row.sellerId;
    const shop = store.stores.find((item) => item.id === storeId || item.sellerId === storeId);
    if (!shop) continue;
    const product = normalizeProduct(shop.id, row);
    if (!product) continue;
    upsertProduct(store, product);
    upsertSnapshot(store, product);
    count += 1;
  }
  await saveStore(store);
  return count;
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = pathname.replace(/\.\.+/g, '');
  const filePath = join(__dirname, 'public', safePath);
  try {
    const buffer = await readFile(filePath);
    response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(buffer);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const store = await loadStore();

  if (request.method === 'GET' && url.pathname === '/api/dashboard') {
    sendJson(response, buildDashboard(store));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/stores') {
    const body = await readBody(request);
    const parsed = await resolveStoreLink(body.url || body.sellerId);
    if (!parsed.sellerId) {
      sendError(response, '没有从链接里解析到 sellerId。这个链接可能需要 App 或登录态。', 422);
      return;
    }
    if (store.stores.some((item) => item.sellerId === parsed.sellerId)) {
      sendError(response, '这个店铺已经添加过了，不能重复添加。', 409);
      return;
    }
    store.stores.push({
      id: parsed.sellerId,
      sellerId: parsed.sellerId,
      region: body.region || parsed.region || 'MX',
      name: body.name || `TikTok Shop ${parsed.sellerId}`,
      sourceUrl: parsed.sourceUrl,
      resolvedUrl: parsed.resolvedUrl || '',
      owner: body.owner || '',
      note: body.note || '',
      enabled: true,
      createdAt: new Date().toISOString(),
      lastScanAt: null,
      lastScanStatus: '等待采集'
    });
    await saveStore(store);
    sendJson(response, { ok: true, dashboard: buildDashboard(store) });
    return;
  }

  if (request.method === 'PATCH' && url.pathname.startsWith('/api/stores/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readBody(request);
    const shop = store.stores.find((item) => item.id === id);
    if (!shop) return sendError(response, '店铺不存在', 404);
    for (const key of ['name', 'region', 'owner', 'note']) {
      if (body[key] !== undefined) shop[key] = String(body[key]);
    }
    if (body.enabled !== undefined) shop.enabled = Boolean(body.enabled);
    await saveStore(store);
    sendJson(response, { ok: true, dashboard: buildDashboard(store) });
    return;
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/stores/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    store.stores = store.stores.filter((item) => item.id !== id);
    const productIds = new Set(store.products.filter((item) => item.storeId === id).map((item) => item.id));
    store.products = store.products.filter((item) => item.storeId !== id);
    store.snapshots = store.snapshots.filter((item) => !productIds.has(item.productId));
    await saveStore(store);
    sendJson(response, { ok: true, dashboard: buildDashboard(store) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/scan') {
    const results = await scanStores(store);
    sendJson(response, { ok: true, results, dashboard: buildDashboard(store) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/import') {
    const body = await readBody(request);
    const rows = Array.isArray(body.rows) ? body.rows : parseCsv(body.csv);
    const count = await importProducts(store, rows);
    sendJson(response, { ok: true, count, dashboard: buildDashboard(store) });
    return;
  }

  sendError(response, '接口不存在', 404);
}

async function tickSchedule() {
  const store = await loadStore();
  const key = `${dateKey()}-${localClock()}`;
  if (!SCAN_SLOTS.includes(localClock())) return;
  if (store.meta.scanHistory[key]) return;
  store.meta.scanHistory[key] = new Date().toISOString();
  await saveStore(store);
  await scanStores(store);
}

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith('/api/')) await handleApi(request, response);
    else await serveStatic(request, response);
  } catch (error) {
    sendError(response, error.message || '服务器错误', 500);
  }
});

await ensureStore();
setInterval(() => tickSchedule().catch((error) => console.error(error)), 30_000);
server.listen(PORT, HOST, () => {
  console.log(`TikTok Shop Growth Monitor running at http://${HOST}:${PORT}`);
});
