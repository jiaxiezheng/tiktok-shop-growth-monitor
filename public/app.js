const state = {
  dashboard: null,
  metric: 'currentSold',
  direction: 'desc'
};

const metricLabels = {
  currentSold: '当前销量',
  d1: '昨日动销',
  d3: '近 3 日动销',
  d7: '近 7 日动销',
  d10: '近 10 日动销'
};

const els = {
  statusText: document.querySelector('#statusText'),
  scanButton: document.querySelector('#scanButton'),
  storeCount: document.querySelector('#storeCount'),
  productCount: document.querySelector('#productCount'),
  snapshotCount: document.querySelector('#snapshotCount'),
  scanSlots: document.querySelector('#scanSlots'),
  addStoreForm: document.querySelector('#addStoreForm'),
  storeUrlInput: document.querySelector('#storeUrlInput'),
  storeOwnerInput: document.querySelector('#storeOwnerInput'),
  storeNoteInput: document.querySelector('#storeNoteInput'),
  storeList: document.querySelector('#storeList'),
  productRows: document.querySelector('#productRows'),
  tableTitle: document.querySelector('#tableTitle'),
  updatedAt: document.querySelector('#updatedAt'),
  regionFilter: document.querySelector('#regionFilter'),
  storeFilter: document.querySelector('#storeFilter'),
  keywordInput: document.querySelector('#keywordInput'),
  metricSelect: document.querySelector('#metricSelect'),
  directionSelect: document.querySelector('#directionSelect'),
  minSoldInput: document.querySelector('#minSoldInput'),
  minGrowthInput: document.querySelector('#minGrowthInput'),
  importText: document.querySelector('#importText'),
  importButton: document.querySelector('#importButton'),
  importHint: document.querySelector('#importHint')
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || data.ok === false) throw new Error(data.error || `请求失败 ${response.status}`);
  return data;
}

function fmt(value) {
  if (value === null || value === undefined || value === '') return '数据不足';
  return Number(value).toLocaleString('en-US');
}

function fmtTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function option(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function setStatus(text) {
  els.statusText.textContent = text;
}

async function loadDashboard() {
  state.dashboard = await api('/api/dashboard');
  render();
}

async function addStore(event) {
  event.preventDefault();
  const url = els.storeUrlInput.value.trim();
  if (!url) return;
  setStatus('正在添加店铺...');
  try {
    const result = await api('/api/stores', {
      method: 'POST',
      body: JSON.stringify({
        url,
        owner: els.storeOwnerInput.value.trim(),
        note: els.storeNoteInput.value.trim()
      })
    });
    state.dashboard = result.dashboard;
    els.storeUrlInput.value = '';
    els.storeOwnerInput.value = '';
    els.storeNoteInput.value = '';
    setStatus('店铺已添加');
    render();
  } catch (error) {
    setStatus(error.message);
  }
}

async function scan() {
  setStatus('正在采集店铺商品...');
  els.scanButton.disabled = true;
  try {
    const result = await api('/api/scan', { method: 'POST' });
    state.dashboard = result.dashboard;
    const failed = result.results.filter((item) => !item.ok).length;
    setStatus(failed ? '已完成店铺检查；商品列表接口暂未接入。' : '采集完成');
    render();
  } catch (error) {
    setStatus(error.message);
  } finally {
    els.scanButton.disabled = false;
  }
}

async function deleteStore(id) {
  if (!confirm('删除这个店铺以及它的商品快照？')) return;
  const result = await api(`/api/stores/${encodeURIComponent(id)}`, { method: 'DELETE' });
  state.dashboard = result.dashboard;
  render();
}

async function updateStore(id, patch) {
  const result = await api(`/api/stores/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  state.dashboard = result.dashboard;
  render();
}

async function importSnapshot() {
  const csv = els.importText.value.trim();
  if (!csv) return;
  try {
    const result = await api('/api/import', {
      method: 'POST',
      body: JSON.stringify({ csv })
    });
    state.dashboard = result.dashboard;
    els.importHint.textContent = `已导入 ${result.count} 条商品快照`;
    els.importText.value = '';
    render();
  } catch (error) {
    els.importHint.textContent = error.message;
  }
}

function renderFilters() {
  const stores = state.dashboard.stores;
  const currentRegion = els.regionFilter.value || 'all';
  const currentStore = els.storeFilter.value || 'all';
  const regions = [...new Set(stores.map((item) => item.region).filter(Boolean))].sort();

  els.regionFilter.innerHTML = option('all', '全部地区') + regions.map((item) => option(item, item)).join('');
  els.storeFilter.innerHTML = option('all', '全部店铺') + stores.map((item) => option(item.id, `${item.name} · ${item.sellerId}`)).join('');
  els.regionFilter.value = regions.includes(currentRegion) ? currentRegion : 'all';
  els.storeFilter.value = stores.some((item) => item.id === currentStore) ? currentStore : 'all';

  els.metricSelect.innerHTML = Object.entries(metricLabels).map(([value, label]) => option(value, label)).join('');
  els.metricSelect.value = state.metric;
  els.directionSelect.value = state.direction;
}

function renderStores() {
  els.storeList.innerHTML = state.dashboard.stores.map((shop) => `
    <article class="store-card">
      <div class="store-top">
        <div>
          <strong>${escapeHtml(shop.name)}</strong>
          <span>${escapeHtml(shop.sellerId)}</span>
        </div>
        <button class="danger" data-delete="${escapeHtml(shop.id)}">删除</button>
      </div>
      <div class="store-meta">${escapeHtml(shop.region)} · 添加人：${escapeHtml(shop.owner || '未填')} · ${escapeHtml(shop.note || '无备注')}</div>
      <div class="store-meta">上次：${fmtTime(shop.lastScanAt)} · ${escapeHtml(shop.lastScanStatus || '等待采集')}</div>
      <div class="store-edit">
        <input data-field="name" data-id="${escapeHtml(shop.id)}" value="${escapeHtml(shop.name)}" />
        <input data-field="owner" data-id="${escapeHtml(shop.id)}" value="${escapeHtml(shop.owner || '')}" placeholder="添加人" />
        <input data-field="note" data-id="${escapeHtml(shop.id)}" value="${escapeHtml(shop.note || '')}" placeholder="备注" />
      </div>
    </article>
  `).join('');

  els.storeList.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteStore(button.dataset.delete));
  });
  els.storeList.querySelectorAll('input[data-field]').forEach((input) => {
    input.addEventListener('change', () => updateStore(input.dataset.id, { [input.dataset.field]: input.value }));
  });
}

function filteredProducts() {
  const region = els.regionFilter.value;
  const storeId = els.storeFilter.value;
  const keyword = els.keywordInput.value.trim().toLowerCase();
  const minSold = Number(els.minSoldInput.value);
  const minGrowth = Number(els.minGrowthInput.value);
  const useMinSold = Number.isFinite(minSold) && els.minSoldInput.value !== '';
  const useMinGrowth = Number.isFinite(minGrowth) && els.minGrowthInput.value !== '';

  return state.dashboard.products
    .filter((item) => region === 'all' || item.region === region)
    .filter((item) => storeId === 'all' || item.storeId === storeId)
    .filter((item) => {
      if (!keyword) return true;
      return [item.title, item.productId, item.storeName, item.sellerId, item.region]
        .some((value) => String(value || '').toLowerCase().includes(keyword));
    })
    .filter((item) => !useMinSold || (item.currentSold ?? 0) >= minSold)
    .filter((item) => !useMinGrowth || (item[state.metric] ?? -Infinity) >= minGrowth)
    .sort((a, b) => {
      const av = a[state.metric] ?? -Infinity;
      const bv = b[state.metric] ?? -Infinity;
      return state.direction === 'desc' ? bv - av : av - bv;
    });
}

function renderProducts() {
  const rows = filteredProducts();
  els.tableTitle.textContent = `${metricLabels[state.metric]}排序`;
  els.productRows.innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td data-label="商品">
        <div class="product">
          <div class="thumb">${item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : '无图'}</div>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.productId)}</span>
            ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank">打开商品</a>` : ''}
          </div>
        </div>
      </td>
      <td data-label="店铺">${escapeHtml(item.storeName)}<span class="muted">${escapeHtml(item.region)}</span></td>
      <td data-label="当前销量">${fmt(item.currentSold)}</td>
      <td data-label="昨日" class="growth">${fmt(item.d1)}</td>
      <td data-label="3 日">${fmt(item.d3)}</td>
      <td data-label="7 日">${fmt(item.d7)}</td>
      <td data-label="10 日">${fmt(item.d10)}</td>
      <td data-label="价格/GMV">${escapeHtml(item.price || '-')}<span class="muted">GMV ${fmt(item.revenue)}</span></td>
    </tr>
  `).join('') : `
    <tr>
      <td colspan="8" class="empty">现在还没有商品数据。已能管理店铺，真实商品动销需要接入 TikTok Shop 商品数据源，或先从运营表导入快照。</td>
    </tr>
  `;
}

function render() {
  const meta = state.dashboard.meta;
  els.storeCount.textContent = `${meta.enabledStoreCount}/${meta.storeCount}`;
  els.productCount.textContent = fmt(meta.productCount);
  els.snapshotCount.textContent = fmt(meta.snapshotCount);
  els.scanSlots.textContent = meta.scanSlots.join(' / ');
  els.updatedAt.textContent = `更新于 ${fmtTime(meta.updatedAt)}`;
  renderFilters();
  renderStores();
  renderProducts();
}

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    state.metric = button.dataset.metric;
    renderProducts();
  });
});

els.metricSelect.addEventListener('change', () => {
  state.metric = els.metricSelect.value;
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item.dataset.metric === state.metric));
  renderProducts();
});
els.directionSelect.addEventListener('change', () => {
  state.direction = els.directionSelect.value;
  renderProducts();
});
['change', 'input'].forEach((eventName) => {
  [els.regionFilter, els.storeFilter, els.keywordInput, els.minSoldInput, els.minGrowthInput].forEach((el) => el.addEventListener(eventName, renderProducts));
});

els.addStoreForm.addEventListener('submit', addStore);
els.scanButton.addEventListener('click', scan);
els.importButton.addEventListener('click', importSnapshot);

loadDashboard().catch((error) => setStatus(error.message));
