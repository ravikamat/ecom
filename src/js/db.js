/* ============================================================
   ECO DB Client v2.5 — REST API client replacing Dexie.js
   All data now persists in server-side SQLite (eco.db)
   Drop-in replacement: same function signatures as before
   ============================================================ */

/* ── Migration: send existing Dexie data to SQLite on first boot ── */
async function migrateToSQLite() {
  if (localStorage.getItem('eco_sqlite_migrated')) return;
  try {
    // Try to read from old Dexie DB if it exists
    const dexieData = await _readDexieData();
    if (!dexieData.saved.length && !dexieData.settings.length) {
      localStorage.setItem('eco_sqlite_migrated', '1');
      return;
    }
    const res = await fetch('/api/db/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dexieData),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[DB Migrate] Moved ${data.imported} items to SQLite`);
      localStorage.setItem('eco_sqlite_migrated', '1');
      Toast.success(`✅ Migrated ${data.imported} saved items to persistent database`);
    }
  } catch(e) {
    console.warn('[DB Migrate] Could not migrate:', e.message);
    localStorage.setItem('eco_sqlite_migrated', '1');
  }
}

async function _readDexieData() {
  const saved    = [];
  const settings = [];
  try {
    // Read from Dexie if it still exists
    if (typeof Dexie === 'undefined') return { saved, settings };
    const _tmpDb = new Dexie('ECommerceCommandCenter');
    _tmpDb.version(2).stores({ saved: '++id', settings: 'key' });
    const savedItems = await _tmpDb.saved.toArray().catch(() => []);
    const settItems  = await _tmpDb.settings.toArray().catch(() => []);
    savedItems.forEach(i => saved.push(i));
    settItems.forEach(s => settings.push(s));
    _tmpDb.close();
  } catch(e) { /* Dexie not available */ }
  return { saved, settings };
}

/* ── SETTINGS ─────────────────────────────────────────────── */

const _settingsCache = {};

async function getSetting(key, defaultVal) {
  if (_settingsCache[key] !== undefined) return _settingsCache[key];
  try {
    const res  = await fetch(`/api/db/settings?key=${encodeURIComponent(key)}`);
    const data = await res.json();
    const val  = data.value !== null ? data.value : defaultVal;
    _settingsCache[key] = val;
    return val;
  } catch { return defaultVal; }
}

async function setSetting(key, value) {
  _settingsCache[key] = value;
  try {
    await fetch('/api/db/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
  } catch(e) { console.warn('[Settings] Save failed:', e.message); }
}

/* ── SAVED PRODUCTS ───────────────────────────────────────── */

async function getSaved(opts = {}) {
  try {
    const params = new URLSearchParams();
    if (opts.country && opts.country !== 'all') params.set('country', opts.country);
    if (opts.source)  params.set('source',  opts.source);
    if (opts.search)  params.set('search',  opts.search);
    if (opts.limit)   params.set('limit',   opts.limit);
    if (opts.offset)  params.set('offset',  opts.offset);
    const res  = await fetch(`/api/db/saved?${params}`);
    const data = await res.json();
    return _normalizeSaved(data.items || []);
  } catch(e) {
    console.warn('[getSaved] Error:', e.message);
    return [];
  }
}

async function getSavedById(id) {
  try {
    const res = await fetch(`/api/db/saved/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data || null;
  } catch { return null; }
}

async function addSaved(item) {
  if (!item.name) return { success: false, message: 'Name required' };
  try {
    const res  = await fetch('/api/db/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:        item.name,
        category:    item.category || '',
        platform:    item.platform || '',
        country:     item.country  || AppState?.selectedCountry || 'India',
        sp:          parseFloat(item.sp   || item.sellingPrice || 0),
        cp:          parseFloat(item.cp   || item.costPrice    || 0),
        currency:    item.currency || AppState?.displayCurrency || 'INR',
        margin:      parseFloat(item.margin || 0),
        demand:      parseInt(item.demand || item.demandScore || 50),
        winnerScore: parseInt(item.winnerScore || item._winnerScore || 0),
        moq:         parseInt(item.moq || 50),
        source:      item.source || 'trending',
        note:        item.note   || '',
        trendStatus: item.trendStatus || 'active',
      }),
    });
    const data = await res.json();
    return data;
  } catch(e) {
    console.warn('[addSaved] Error:', e.message);
    return { success: false, message: e.message };
  }
}

async function updateSaved(id, updates) {
  try {
    await fetch(`/api/db/saved/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return true;
  } catch(e) {
    console.warn('[updateSaved] Error:', e.message);
    return false;
  }
}

async function deleteSaved(id) {
  try {
    const res = await fetch(`/api/db/saved/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch(e) {
    console.warn('[deleteSaved] Error:', e.message);
    return false;
  }
}

async function pinSaved(id, pinned) {
  try {
    await fetch(`/api/db/pin/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
    return true;
  } catch { return false; }
}

async function clearUnpinned() {
  try {
    const res = await fetch('/api/db/clear', { method: 'POST' });
    return res.ok;
  } catch { return false; }
}

async function resetDatabase() {
  try {
    await fetch('/api/db/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'all' })
    });
    // Clear all localStorage entries for this app
    const keysToRemove = Object.keys(localStorage).filter(k =>
      k.startsWith('eco_') || k === 'nvidia_api_key' || k === '_settingsCache'
    );
    keysToRemove.forEach(k => localStorage.removeItem(k));
    if (typeof Toast !== 'undefined') Toast.success('All data cleared! Reloading...');
    setTimeout(() => window.location.reload(), 1500);
  } catch(e) {
    console.error('[DB] Reset failed:', e.message);
    if (typeof Toast !== 'undefined') Toast.error('Reset failed: ' + e.message);
  }
}

async function getDashboardStats() {
  try {
    const res = await fetch('/api/db/dashboard-stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return await res.json();
  } catch(e) {
    console.warn('[getDashboardStats] Error:', e.message);
    return { savedCount: 0, supplierCount: 0, avgMargin: 0, totalCapital: 0 };
  }
}

async function getLocalProductById(id) {
  try {
    const res = await fetch(`/api/db/products/${id}`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/* ── EXCHANGE RATES ───────────────────────────────────────── */

async function getExchangeRates() {
  try {
    const res  = await fetch('/api/db/rates');
    const data = await res.json();
    return data;
  } catch { return {}; }
}

async function saveExchangeRates(rates) {
  try {
    await fetch('/api/db/rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rates),
    });
  } catch { /* ignore */ }
}

/* ── PRODUCT LISTINGS (ecom content) ─────────────────────── */

async function getProductListings(savedProductId) {
  try {
    const res  = await fetch(`/api/db/listings/${savedProductId}`);
    const data = await res.json();
    return data.listings || [];
  } catch { return []; }
}

async function generateProductListings(savedProductId, productName, category, country, platforms) {
  try {
    const res = await fetch('/api/db/listings/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedProductId, productName, category, country, platforms }),
    });
    return await res.json();
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/* ── AUTO-REFRESH SAVED PRODUCTS ─────────────────────────── */

async function autoRefreshSavedProducts() {
  try {
    const all   = await getSaved();
    const now   = Date.now();
    const stale = all.filter(item => {
      const last = new Date(item.last_auto_refresh || item.lastAutoRefresh || item.saved_at || item.savedAt || 0).getTime();
      return (now - last) > 48 * 60 * 60 * 1000; // 48 hours
    }).slice(0, 3); // max 3 per cycle

    for (const item of stale) {
      try {
        const updated = await refreshSavedProductDetail(item.id);
        if (updated) {
          console.log(`[AutoRefresh] Updated "${item.name}"`);
          // Check for declining trend
          if (updated.winnerScore && item.winner_score) {
            const drop = item.winner_score - updated.winnerScore;
            if (drop > 15) {
              _notifyTrendDecline(item.name, drop);
              await updateSaved(item.id, { trendStatus: 'declining', trend_flagged_at: new Date().toISOString() });
            }
          }
        }
      } catch(e) { console.warn('[AutoRefresh] Item failed:', e.message); }
    }
  } catch(e) { console.warn('[AutoRefresh] Error:', e.message); }
}

async function refreshSavedProductDetail(id) {
  try {
    const item = await getSavedById(parseInt(id));
    if (!item) return null;

    const res = await fetch('/api/product-detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName: item.name, country: item.country || 'India', currency: item.currency || 'INR' }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    const prod = data.product;
    if (!prod) throw new Error('No data');

    const newScore  = prod.winnerScore || item.winner_score || 0;
    await updateSaved(id, {
      updated_at:       new Date().toISOString(),
      last_auto_refresh: new Date().toISOString(),
      winner_score:     newScore,
      demand:           prod.demandScore    || item.demand,
      margin:           prod.estimatedMargin || item.margin,
      trend_status:     'active',
    });
    return { ...item, ...prod, winnerScore: newScore };
  } catch(e) {
    console.warn('[refreshDetail] Error:', e.message);
    return null;
  }
}

function _notifyTrendDecline(productName, scoreDrop) {
  try {
    if (typeof Toast !== 'undefined') {
      Toast.warning(`📉 "${productName}" trend declining (−${Math.round(scoreDrop)} pts)`);
    }
    if (Notification.permission === 'granted') {
      new Notification('📉 Trend Alert — ECO', {
        body: `${productName} is declining. Score dropped ${Math.round(scoreDrop)} pts.`,
        icon: '/favicon.ico',
        tag:  'trend-decline-' + productName,
      });
    }
  } catch(e) { /* ignore */ }
}

/* ── NORMALIZE (SQLite snake_case → camelCase for UI compat) ── */

function _normalizeSaved(items) {
  return items.map(item => ({
    ...item,
    // Map snake_case DB cols to camelCase used by UI
    winnerScore:      item.winner_score    ?? item.winnerScore    ?? 0,
    trendStatus:      item.trend_status    ?? item.trendStatus    ?? 'active',
    trendFlaggedAt:   item.trend_flagged_at ?? item.trendFlaggedAt ?? null,
    savedAt:          item.saved_at        ?? item.savedAt        ?? new Date().toISOString(),
    updatedAt:        item.updated_at      ?? item.updatedAt      ?? new Date().toISOString(),
    lastAutoRefresh:  item.last_auto_refresh ?? item.lastAutoRefresh ?? null,
  }));
}

/* ── URL LOOKUP (Reverse scrape product from URL) ─────────── */

async function lookupProductFromURL(url) {
  try {
    const res  = await fetch('/api/url-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(35000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Lookup failed');
    }
    return await res.json();
  } catch(e) {
    console.warn('[URL Lookup] Error:', e.message);
    throw e;
  }
}

/* ── SEEDED TABLES GETTERS ────────────────────────────────── */

async function getProducts(opts = {}) {
  try {
    const params = new URLSearchParams();
    if (opts.country && opts.country !== 'all') params.set('country', opts.country);
    if (opts.category && opts.category !== 'all') params.set('category', opts.category);
    if (opts.search) params.set('search', opts.search);
    if (opts.limit) params.set('limit', opts.limit);
    if (opts.offset) params.set('offset', opts.offset);
    const res = await fetch(`/api/db/products?${params}`);
    return res.ok ? await res.json() : [];
  } catch(e) {
    console.warn('[getProducts] Error:', e.message);
    return [];
  }
}

async function getSuppliers(opts = {}) {
  try {
    const params = new URLSearchParams();
    if (opts.country && opts.country !== 'all') params.set('country', opts.country);
    if (opts.type && opts.type !== 'all') params.set('type', opts.type);
    if (opts.category && opts.category !== 'all') params.set('category', opts.category);
    if (opts.search) params.set('search', opts.search);
    if (opts.limit) params.set('limit', opts.limit);
    if (opts.offset) params.set('offset', opts.offset);
    const res = await fetch(`/api/db/suppliers?${params}`);
    return res.ok ? await res.json() : [];
  } catch(e) {
    console.warn('[getSuppliers] Error:', e.message);
    return [];
  }
}

async function getPlatforms(country) {
  try {
    const params = new URLSearchParams();
    if (country) params.set('country', country);
    const res = await fetch(`/api/db/platforms?${params}`);
    return res.ok ? await res.json() : [];
  } catch(e) {
    console.warn('[getPlatforms] Error:', e.message);
    return [];
  }
}

// LocalStorage-based Competitors fallback
function _getCompsFromStore() {
  try {
    return JSON.parse(localStorage.getItem('eco_competitors') || '[]');
  } catch { return []; }
}

function _saveCompsToStore(comps) {
  localStorage.setItem('eco_competitors', JSON.stringify(comps));
}

async function getCompetitors(productId) {
  const comps = _getCompsFromStore();
  if (productId === undefined) return comps;
  return comps.filter(c => c.productId === parseInt(productId));
}

async function addCompetitor(productId, url, platform) {
  const comps = _getCompsFromStore();
  const id = comps.length ? Math.max(...comps.map(c => c.id || 0)) + 1 : 1;
  const newComp = {
    id,
    productId: parseInt(productId),
    url,
    platform,
    lastPrice: null,
    lastStockStatus: 'Unknown',
    lastChecked: null
  };
  comps.push(newComp);
  _saveCompsToStore(comps);
  return newComp;
}

async function updateCompetitorPrice(id, price, stockStatus) {
  const comps = _getCompsFromStore();
  const comp = comps.find(c => c.id === parseInt(id));
  if (comp) {
    comp.lastPrice = price;
    comp.lastStockStatus = stockStatus || 'In Stock';
    comp.lastChecked = new Date().toISOString();
    _saveCompsToStore(comps);
    return true;
  }
  return false;
}

/* ── BACKWARD COMPAT: Old Dexie function names ────────────── */
// Keep these so any existing code calling them still works

window.db = {
  // 'products' in the modal context refers to saved items
  products: {
    get: async (id) => getSavedById(id),
    put: async (item) => {
      if (item?.id) return updateSaved(item.id, item);
    },
    delete: async (id) => deleteSaved(id),
  },
  suppliers: {
    get: async (id) => {
      try {
        const res = await fetch(`/api/db/suppliers/${id}`);
        return res.ok ? await res.json() : null;
      } catch { return null; }
    }
  },
  saved: {
    get: async (id) => getSavedById(id),
    update: async (id, updates) => updateSaved(id, updates),
    put: async (item) => updateSaved(item.id, item)
  },
  competitors: {
    toArray: async () => {
      return _getCompsFromStore();
    },
    add: async (comp) => {
      return addCompetitor(comp.productId, comp.url, comp.platform);
    },
    update: async (id, updates) => {
      const comps = _getCompsFromStore();
      const comp = comps.find(c => c.id === parseInt(id));
      if (comp) {
        Object.assign(comp, updates);
        _saveCompsToStore(comps);
        return 1;
      }
      return 0;
    },
    delete: async (id) => {
      let comps = _getCompsFromStore();
      const initialLength = comps.length;
      comps = comps.filter(c => c.id !== parseInt(id));
      _saveCompsToStore(comps);
      return initialLength - comps.length;
    }
  }
};

window.addSaved      = addSaved;
window.getSaved      = getSaved;
window.getSavedById  = getSavedById;
window.updateSaved   = updateSaved;
window.deleteSaved   = deleteSaved;
window.pinSaved      = pinSaved;
window.clearUnpinned = clearUnpinned;
window.resetDatabase = resetDatabase;
window.getSetting    = getSetting;
window.setSetting    = setSetting;
window.getProducts   = getProducts;
window.getSuppliers  = getSuppliers;
window.getPlatforms  = getPlatforms;
window.getDashboardStats = getDashboardStats;
window.getLocalProductById = getLocalProductById;
window.autoRefreshSavedProducts = autoRefreshSavedProducts;
window.refreshSavedProductDetail = refreshSavedProductDetail;
window.getProductListings       = getProductListings;
window.generateProductListings  = generateProductListings;
window.lookupProductFromURL     = lookupProductFromURL;
window.getExchangeRates         = getExchangeRates;
window.saveExchangeRates        = saveExchangeRates;
window.getCompetitors           = getCompetitors;
window.addCompetitor            = addCompetitor;
window.updateCompetitorPrice    = updateCompetitorPrice;

// Run auto-migration from Dexie browser storage to server SQLite on startup
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(migrateToSQLite, 3000);
});

