/* ============================================================
   Trending Products — Winner Score + Clickable Products & Platforms
   ============================================================ */

const COMP_INDEX = { 'Low': 25, 'Medium': 50, 'High': 75, 'Very High': 90 };

/* ── Saved Product Name Cache (for flagging) ────────────── */
let _savedNameSet = new Set();

function _normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

async function _refreshSavedNameSet() {
  try {
    const saved = await getSaved();
    _savedNameSet = new Set(saved.map(s => _normalizeName(s.name)));
  } catch(e) {
    console.warn('[Trending] Could not load saved items for flagging:', e.message);
  }
}

function _isProductSaved(name) {
  if (!name || _savedNameSet.size === 0) return false;
  return _savedNameSet.has(_normalizeName(name));
}

/* ── Compute Winner Score ────────────────────────────────── */
function computeWinnerScore(p) {
  const demand = Math.min(100, Math.max(0, p.demand || p.demandScore || 50));
  const margin = Math.min(100, Math.max(0, p.margin || p.profitMargin || 0));
  const compLevel = p.competition || p.competitionLevel || 'Medium';
  const compIdx = COMP_INDEX[compLevel] || 50;
  const platCount = p.platformCount || (Array.isArray(p.platforms) ? p.platforms.length : 1);
  const score = (demand * 0.35) + (margin * 0.30) + ((100 - compIdx) * 0.20) + (Math.min(platCount, 8) * 5);
  return Math.round(Math.min(100, Math.max(0, score)));
}

/* ── Score Badge ─────────────────────────────────────────── */
function scoreBadge(score, p) {
  let color, bg, label;
  if (score >= 75)      { color = '#ff6b35'; bg = 'rgba(255,107,53,0.15)'; label = '🔥 Hot Pick'; }
  else if (score >= 50) { color = '#f59e0b'; bg = 'rgba(245,158,11,0.12)'; label = '✓ Viable'; }
  else                  { color = '#94a3b8'; bg = 'rgba(148,163,184,0.1)';  label = '⚠ Risky'; }

  const demand   = Math.min(100, Math.max(0, p.demand || p.demandScore || 50));
  const margin   = Math.min(100, Math.max(0, p.margin || p.profitMargin || 0));
  const compLevel = p.competition || p.competitionLevel || 'Medium';
  const compIdx  = COMP_INDEX[compLevel] || 50;
  const platCount = p.platformCount || (Array.isArray(p.platforms) ? p.platforms.length : 1);
  const tooltip  = `Score Breakdown:\n• Demand ${demand}/100 × 0.35 = ${(demand*0.35).toFixed(1)}\n• Margin ${margin}% × 0.30 = ${(margin*0.30).toFixed(1)}\n• Competition (100-${compIdx}) × 0.20 = ${((100-compIdx)*0.20).toFixed(1)}\n• Platforms ${platCount} × 5 = ${Math.min(platCount*5,40)}\n─────────\nTotal: ${score}/100`;

  return `<div title="${tooltip}" style="cursor:help;display:inline-flex;align-items:center;gap:6px;">
    <div style="position:relative;width:42px;height:42px;">
      <svg viewBox="0 0 36 36" style="width:42px;height:42px;transform:rotate(-90deg);">
        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="${bg}" stroke-width="3" stroke-dasharray="100,100"/>
        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="${score},100"
              style="transition:stroke-dasharray 0.6s ease;"/>
      </svg>
      <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:${color};">${score}</span>
    </div>
    <span style="font-size:11px;font-weight:600;color:${color};padding:2px 6px;border-radius:4px;background:${bg};">${label}</span>
  </div>`;
}

/* ── Platform Pills (main table — opens product detail modal) ─ */
function renderTrendingPlatformPills(p, idx) {
  const platName  = p.platform || 'Online';
  const price     = p.price || 0;
  const currency  = AppState.displayCurrency;
  const converted = price ? CurrencyEngine.convert(price, p.currency || currency, currency) : 0;
  const priceStr  = converted > 0 ? formatPrice(converted, currency) : '';

  return `<span
    class="platform-pill"
    data-action="open-product-detail"
    data-index="${idx}"
    data-platform="${platName}"
    title="Click for full details — ${platName}"
    style="cursor:pointer;transition:all 0.2s;border:1px solid transparent;"
    onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--accent-soft)'"
    onmouseout="this.style.borderColor='transparent';this.style.background=''"
  >${platName}${priceStr ? ` <strong style="color:var(--positive)">${priceStr}</strong>` : ''}</span>`;
}

/* ── Build platform search URL ───────────────────────────── */
function buildPlatformUrl(platform, productName, country) {
  const q = encodeURIComponent(productName || '');
  const map = {
    'Amazon': country === 'India' ? `https://www.amazon.in/s?k=${q}` : country === 'UK' ? `https://www.amazon.co.uk/s?k=${q}` : `https://www.amazon.com/s?k=${q}`,
    'Amazon India': `https://www.amazon.in/s?k=${q}`,
    'Flipkart': `https://www.flipkart.com/search?q=${q}`,
    'Meesho': `https://www.meesho.com/search?q=${q}`,
    'Myntra': `https://www.myntra.com/${q}`,
    'Snapdeal': `https://www.snapdeal.com/search?keyword=${q}`,
    'eBay': `https://www.ebay.com/sch/i.html?_nkw=${q}`,
    'eBay UK': `https://www.ebay.co.uk/sch/i.html?_nkw=${q}`,
    'Walmart': `https://www.walmart.com/search?q=${q}`,
    'Etsy': `https://www.etsy.com/search?q=${q}`,
    'Noon': `https://www.noon.com/uae-en/search/?q=${q}`,
    'Shopee': `https://shopee.com/search?keyword=${q}`,
    'Lazada': `https://www.lazada.com/catalog/?q=${q}`,
    'Coupang': `https://www.coupang.com/np/search?q=${q}`,
    'Mercado Libre': `https://www.mercadolibre.com/jm/search?as_word=${q}`,
    'Tokopedia': `https://www.tokopedia.com/search?st=product&q=${q}`,
    'Trendyol': `https://www.trendyol.com/sr?q=${q}`,
    'Rakuten': `https://search.rakuten.co.jp/search/mall/${q}/`,
    'Jumia': `https://www.jumia.com/catalog/?q=${q}`,
    'Takealot': `https://www.takealot.com/all?_search=${q}`,
    'Otto': `https://www.otto.de/suche/${q}`,
    'Cdiscount': `https://www.cdiscount.com/search/10/${q}.html`,
    'Kogan': `https://www.kogan.com/au/shop/?q=${q}`,
  };
  return map[platform] || `https://www.google.com/search?q=${q}+${encodeURIComponent(platform)}+buy`;
}

/* ── Build supplier search URL ────────────────────────────── */
function buildSupplierSearchUrl(platform, productName) {
  const q = encodeURIComponent(productName || '');
  const map = {
    'IndiaMART':          `https://www.indiamart.com/search.mp?ss=${q}`,
    'JustDial':           `https://www.justdial.com/search?q=${q}+suppliers&nc=cat`,
    'Alibaba':            `https://www.alibaba.com/trade/search?SearchText=${q}`,
    'TradeIndia':         `https://www.tradeindia.com/search.html?keyword=${q}`,
    'Global Sources':     `https://www.globalsources.com/gsol/I/Product-sourcing/a/9000000014025.htm?keywords=${q}`,
    'Made-in-China':      `https://www.made-in-china.com/multi-search/searched/${q}.html`,
    'Amazon Business':    `https://www.amazon.in/b?node=20414765031&field-keywords=${q}`,
    'Flipkart Wholesale': `https://www.flipkartwholesale.com/search?q=${q}`,
    'Udaan':              `https://udaan.com/search.html#!/search?q=${q}`,
    'Moglix':             `https://www.moglix.com/search?query=${q}`,
    'Meesho Supplier':    `https://supplier.meesho.com/`,
    'IndiaBizForSale':    `https://www.indiabizforsale.com/search?q=${q}`,
    'ExportersIndia':     `https://www.exportersindia.com/search-results.htm?ss=${q}`,
    'DHgate':             `https://www.dhgate.com/wholesale/search.do?act=search&searchkey=${q}`,
    'AliExpress':         `https://www.aliexpress.com/wholesale?SearchText=${q}`,
  };
  return map[platform] || `https://www.google.com/search?q=${q}+${encodeURIComponent(platform)}+wholesale+supplier`;
}

/* ── Init ─────────────────────────────────────────────────── */
// State variables for infinite scroll & prefetch
window._trendPage = 1;
window._trendPerPage = 20;
window._trendListings = [];
window._trendLoading = false;
window._trendHasMore = true;
window._trendPrefetched = {};

function resetAndRenderTrending() {
  window._trendPage = 1;
  window._trendListings = [];
  window._trendHasMore = true;
  window._trendPrefetched = {};
  const tbody = document.getElementById('trend-body');
  if (tbody) tbody.innerHTML = '';
  renderTrending(false);
}

async function prefetchNextTrendPage(pageToPrefetch, country, category, perPage) {
  if (window._trendPrefetched[pageToPrefetch]) return;
  console.log(`[Trending] Prefetching page ${pageToPrefetch} in background...`);
  try {
    const response = await fetch('/api/trending/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, category, page: pageToPrefetch, perPage }),
    });
    if (response.ok) {
      window._trendPrefetched[pageToPrefetch] = await response.json();
      console.log(`[Trending] Page ${pageToPrefetch} prefetch stored.`);
    }
  } catch (e) {
    console.warn(`[Trending] Prefetch failed for page ${pageToPrefetch}:`, e.message);
  }
}

let _trendObserver = null;
function initTrendObserver() {
  const trigger = document.getElementById('trend-loading-trigger');
  if (!trigger) return;
  if (_trendObserver) _trendObserver.disconnect();
  
  _trendObserver = new IntersectionObserver(async (entries) => {
    if (entries[0].isIntersecting && !window._trendLoading && window._trendHasMore) {
      window._trendPage++;
      console.log(`[Trending] Scroll triggered. Loading page ${window._trendPage}`);
      await renderTrending(true);
    }
  }, { rootMargin: '150px' });
  _trendObserver.observe(trigger);
}

async function initTrending() {
  const catSelect = document.getElementById('trend-category');
  if (catSelect && catSelect.options.length <= 1) {
    const cats = ['Electronics','Fashion','Home & Kitchen','Beauty','Health','Sports','Toys','Automotive','Pet Care','Office','Garden','Food & Beverage'];
    cats.forEach(c => { catSelect.innerHTML += `<option value="${c}">${c}</option>`; });
  }
  resetAndRenderTrending();
}

/* ── Main Render ─────────────────────────────────────────── */
async function renderTrending(append = false) {
  const country     = AppState.selectedCountry;
  const category    = document.getElementById('trend-category')?.value || 'all';
  const sortBy      = document.getElementById('trend-sort')?.value || 'score';
  const scoreFilter = document.getElementById('trend-score-filter')?.value || 'all';
  const limit       = parseInt(document.getElementById('trend-limit')?.value || '20');
  const currency    = AppState.displayCurrency;
  const tbody       = document.getElementById('trend-body');
  const aiContainer = document.getElementById('ai-trending-container');
  const trigger     = document.getElementById('trend-loading-trigger');
  if (!tbody) return;

  window._trendPerPage = limit;
  if (!append) {
    window._trendPage = 1;
    window._trendListings = [];
    window._trendHasMore = true;
    window._trendPrefetched = {};
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;">
      <div class="spinner" style="margin:0 auto 10px;"></div>
      <div>Loading trending products...</div>
    </td></tr>`;
  } else {
    if (trigger) trigger.style.display = 'block';
  }

  // Load saved product names for flagging
  await _refreshSavedNameSet();

  const aiOnline = await AIEngine.checkConnection();
  if (aiOnline) {
    window._trendLoading = true;
    try {
      let data = null;
      if (window._trendPrefetched[window._trendPage]) {
        console.log(`[Trending] Using prefetch cache for page ${window._trendPage}`);
        data = window._trendPrefetched[window._trendPage];
        delete window._trendPrefetched[window._trendPage];
      } else {
        const response = await fetch('/api/trending/page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country: country === 'all' ? 'USA' : country, category, page: window._trendPage, perPage: limit }),
        });
        if (!response.ok) throw new Error('Server error');
        data = await response.json();
      }

      window._trendHasMore = !!data.hasMore;
      let listings = data.items || [];
      
      // Compute scores and store in listings
      listings = listings.map(p => ({ ...p, _winnerScore: p.winnerScore || computeWinnerScore(p) }));

      // Filter by score
      const minScore = scoreFilter !== 'all' ? parseInt(scoreFilter) : 0;
      if (minScore > 0) listings = listings.filter(p => p._winnerScore >= minScore);

      // Sort
      listings.sort((a, b) => {
        if (sortBy === 'score')       return b._winnerScore - a._winnerScore;
        if (sortBy === 'demand')      return (b.demand || 0) - (a.demand || 0);
        if (sortBy === 'margin')      return (b.margin || 0) - (a.margin || 0);
        if (sortBy === 'competition') return (COMP_INDEX[a.competition || 'Medium'] || 50) - (COMP_INDEX[b.competition || 'Medium'] || 50);
        return b._winnerScore - a._winnerScore;
      });

      // Append or replace
      if (!append) tbody.innerHTML = '';
      
      const startIndex = window._trendListings.length;
      window._trendListings = window._trendListings.concat(listings);
      window._lastLiveTrending = window._trendListings; // compat with other functions

      if (listings.length > 0) {
        const html = listings.map((p, i) => {
          const globalIdx = startIndex + i;
          const price     = p.price ? CurrencyEngine.convert(p.price, p.currency || currency, currency) : 0;
          const demandVal = Math.min(100, Math.max(0, p.demand || 50));
          const marginVal = p.margin || p.profitMargin;
          const compLevel = p.competition || 'Medium';
          const score     = p._winnerScore;
          const platCount = p.platformCount || (p.platforms ? p.platforms.length : 1);
          const isSaved   = _isProductSaved(p.name);
          const rowBg     = isSaved ? 'background:rgba(34,197,94,0.06);' : (score >= 75 ? 'background:rgba(255,107,53,0.04);' : '');

          const savedBadge = isSaved ? ' <span class="tag" style="font-size:9px;background:rgba(34,197,94,0.15);color:#22c55e;">✓ Saved</span>' : '';
          const nameCell = `<td>
            <span data-action="open-product-detail" data-index="${globalIdx}"
              style="cursor:pointer;color:var(--text-primary);font-weight:600;text-decoration:none;border-bottom:1px dashed var(--accent);transition:color 0.2s;"
              onmouseover="this.style.color='var(--accent)'"
              onmouseout="this.style.color='var(--text-primary)'">
              ${safeAttr(p.name || '—')}
            </span>
            ${savedBadge}
            ${p.bestSeller ? ' <span class="tag tag-amber" style="font-size:9px;">Best Seller</span>' : ''}
          </td>`;

          const platCell = `<td>
            ${renderTrendingPlatformPills(p, globalIdx)}
            ${platCount > 1 ? `<span class="muted" style="font-size:10px;margin-left:4px;" title="${platCount} platforms selling this">+${platCount-1} more</span>` : ''}
          </td>`;

          const saveBtn = isSaved
            ? `<button class="btn btn-sm" disabled style="opacity:0.5;cursor:default;">✓ Saved</button>`
            : `<button class="btn btn-sm" data-action="save-live-trend" data-index="${globalIdx}">Save</button>`;

          return `<tr style="${rowBg}">
            ${nameCell}
            <td>${scoreBadge(score, p)}</td>
            <td><span class="tag tag-accent">${getFlag(country === 'all' ? 'USA' : country)} ${country === 'all' ? 'USA' : country}</span></td>
            <td>${safeAttr(p.category || '—')}</td>
            <td>${demandBar(demandVal)}</td>
            <td class="positive-text mono">${marginVal != null ? marginVal + '%' : '—'}</td>
            <td>${competitionTag(compLevel)}</td>
            ${platCell}
            <td class="price mono">${price > 0 ? formatPrice(price, currency) : (p.priceFormatted || '—')}</td>
            <td>${saveBtn}</td>
          </tr>`;
        }).join('');

        tbody.innerHTML += html;

        // Init scroll observer on first load
        if (!append) {
          initTrendObserver();
        }
      } else if (!append) {
        tbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;padding:30px;">No results found.</td></tr>';
      }

      // Prefetch next 2 pages in background
      if (window._trendHasMore) {
        prefetchNextTrendPage(window._trendPage + 1, country, category, limit);
        prefetchNextTrendPage(window._trendPage + 2, country, category, limit);
      }

    } catch (err) {
      console.error('[Trending] Page load error:', err);
      if (!append) await renderLocalTrending(tbody, country, category, sortBy, scoreFilter, currency);
    } finally {
      window._trendLoading = false;
      // Keep trigger visible so IntersectionObserver can fire for next page
      if (trigger) {
        trigger.style.display = window._trendHasMore ? 'block' : 'none';
      }
    }
  } else {
    if (!append) await renderLocalTrending(tbody, country, category, sortBy, scoreFilter, currency);
    if (trigger) trigger.style.display = 'none';
  }
}

/* ── Local DB fallback ───────────────────────────────────── */
async function renderLocalTrending(tbody, country, category, sortBy, scoreFilter, currency) {
  let products = await getProducts({
    country: country === 'all' ? undefined : country,
    category: category === 'all' ? undefined : category,
    sort: 'demand',
  });

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;padding:30px;">No products in local DB. Start server for live data.</td></tr>';
    return;
  }

  products = products.map(p => ({ ...p, _winnerScore: computeWinnerScore(p) }));

  const minScore = scoreFilter !== 'all' ? parseInt(scoreFilter) : 0;
  if (minScore > 0) products = products.filter(p => p._winnerScore >= minScore);

  products.sort((a, b) => {
    if (sortBy === 'score')       return b._winnerScore - a._winnerScore;
    if (sortBy === 'demand')      return (b.demand || 0) - (a.demand || 0);
    if (sortBy === 'margin')      return (b.margin || 0) - (a.margin || 0);
    if (sortBy === 'competition') return (COMP_INDEX[a.competition||'Medium']||50) - (COMP_INDEX[b.competition||'Medium']||50);
    return b._winnerScore - a._winnerScore;
  });

  // Store for click handler
  window._lastLiveTrending = products.map(p => ({ ...p, isLocalDB: true }));

  tbody.innerHTML = products.map((p, i) => {
    const price = CurrencyEngine.convert(p.supplierPrice || 0, p.currency || 'USD', currency);
    const score = p._winnerScore;
    const platStr = (p.platforms || []).slice(0, 1).join(', ') || 'Online';
    const url     = buildPlatformUrl(platStr, p.name, p.country);
    return `<tr style="${score >= 75 ? 'background:rgba(255,107,53,0.04);' : ''}">
      <td>
        <span data-action="open-product-detail" data-index="${i}"
          style="cursor:pointer;font-weight:600;border-bottom:1px dashed var(--accent);"
          onmouseover="this.style.color='var(--accent)'"
          onmouseout="this.style.color=''">
          ${safeAttr(p.name || '—')}
        </span>
      </td>
      <td>${scoreBadge(score, p)}</td>
      <td><span class="tag tag-accent">${getFlag(p.country)} ${p.country}</span></td>
      <td>${safeAttr(p.category || '—')}</td>
      <td>${demandBar(p.demand)}</td>
      <td class="positive-text mono">${p.margin}%</td>
      <td>${competitionTag(p.competition || 'Medium')}</td>
      <td><a href="${url}" target="_blank" class="platform-pill" style="text-decoration:none;cursor:pointer;">${safeAttr(platStr)}</a></td>
      <td class="price mono">${formatPrice(price, currency)}</td>
      <td><button class="btn btn-sm" data-action="save-trend" data-id="${p.id}">Save</button></td>
    </tr>`;
  }).join('');
}

/* ── Number formatter ─────────────────────────────────────── */
function fmtK(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

/* ── Product Detail Modal ────────────────────────────────── */
async function openProductDetail(p) {
  const overlay = document.getElementById('product-detail-modal');
  const loading = document.getElementById('pdm-loading');
  const content = document.getElementById('pdm-content');

  // Reset + show overlay
  overlay.classList.remove('hidden');
  loading.style.display = 'block';
  content.style.display = 'none';
  document.getElementById('pdm-name').textContent = p.name || 'Loading...';
  document.getElementById('pdm-category').textContent = p.category || '';
  document.getElementById('pdm-score-row').innerHTML = '';

  const country  = AppState.selectedCountry === 'all' ? 'USA' : AppState.selectedCountry;
  const currency = AppState.displayCurrency;

  try {
    const res = await fetch('/api/product-detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName: p.name, country, currency }),
    });

    if (!res.ok) throw new Error('AI error');
    const data = await res.json();
    const prod = data.product;
    if (!prod) throw new Error('No data');

    _renderProductDetail(prod, p, currency);
  } catch (err) {
    console.error('[ProductDetail]', err);
    // Show basic info from what we already have
    _renderProductDetailFallback(p, currency);
  }
}

function _renderProductDetail(prod, raw, currency) {
  const loading = document.getElementById('pdm-loading');
  const content = document.getElementById('pdm-content');
  const score   = raw._winnerScore || prod.winnerScore || computeWinnerScore(raw);

  // Header
  document.getElementById('pdm-name').textContent     = prod.name || raw.name;
  document.getElementById('pdm-category').textContent = prod.category || raw.category || '';
  document.getElementById('pdm-score-row').innerHTML  = `
    ${scoreBadge(score, raw)}
    ${prod.estimatedMargin ? `<span class="tag tag-green" style="font-size:12px;">💰 ~${prod.estimatedMargin}% margin</span>` : ''}
    ${prod.seasonality?.window ? `<span class="tag" style="font-size:12px;">📅 ${prod.seasonality.window}</span>` : ''}
    ${prod.opportunity ? '' : ''}
  `;

  // Description
  document.getElementById('pdm-description').textContent = prod.description || '—';
  document.getElementById('pdm-why').innerHTML = prod.whySelling
    ? prod.whySelling.split(/\d+\.|•|-/).filter(s => s.trim()).map(s => `<div style="margin-bottom:6px;">• ${safeAttr(s.trim())}</div>`).join('')
    : '—';

  // Metrics with source links
  const cp = prod.estimatedCostPrice || 0;
  const rp = prod.estimatedRetailPrice || 0;
  const country = AppState.selectedCountry === 'all' ? 'USA' : AppState.selectedCountry;
  const q = encodeURIComponent((prod.name || raw.name) + '');
  const sourceLinks = {
    'Cost Price':     `https://www.indiamart.com/search.mp?ss=${q}`,
    'Retail Price':   buildPlatformUrl('Amazon India', prod.name || raw.name, country),
    'Est. Margin':    `https://www.google.com/search?q=${q}+profit+margin+ecommerce`,
    'Min. Order Qty': `https://www.alibaba.com/trade/search?SearchText=${q}`,
  };
  document.getElementById('pdm-metrics').innerHTML = [
    { label: 'Cost Price',     value: cp ? formatPrice(CurrencyEngine.convert(cp, currency, currency), currency) : '—', color: 'var(--danger)' },
    { label: 'Retail Price',   value: rp ? formatPrice(CurrencyEngine.convert(rp, currency, currency), currency) : '—', color: 'var(--positive)' },
    { label: 'Est. Margin',    value: prod.estimatedMargin ? prod.estimatedMargin + '%' : '—', color: 'var(--accent)' },
    { label: 'Min. Order Qty', value: prod.estimatedMOQ || '—', color: 'var(--warning)' },
  ].map(m => `
    <div class="stat-box" style="text-align:center;padding:14px;position:relative;">
      <div style="font-size:20px;font-weight:700;color:${m.color};">${m.value}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">${m.label}</div>
      <a href="${sourceLinks[m.label]}" target="_blank" class="pdm-source-link" title="View source data">🔗 source</a>
    </div>`).join('');

  // Platforms sorted highest to lowest — rendered as cards
  _renderPlatforms(prod.platforms || [], prod.name, currency);

  // Age Groups
  const ageGroups = prod.ageGroups || [];
  const maxAge    = Math.max(...ageGroups.map(a => a.percentage || 0), 1);
  document.getElementById('pdm-age-groups').innerHTML = ageGroups.map(ag => `
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="min-width:55px;font-size:12px;color:var(--text-secondary);">${ag.range}</span>
      <span style="min-width:70px;font-size:11px;color:var(--text-tertiary);">${ag.label}</span>
      <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${ag.percentage||0}%;background:linear-gradient(90deg,var(--accent),var(--chart-2));border-radius:4px;transition:width 0.8s;"></div>
      </div>
      <span style="min-width:36px;font-size:13px;font-weight:600;color:var(--accent);text-align:right;">${ag.percentage||0}%</span>
    </div>`).join('') || '<div class="muted">No age data</div>';

  // Gender
  const g = prod.genderSplit || { male: 50, female: 45, other: 5 };
  document.getElementById('pdm-gender').innerHTML = [
    { label: '♂ Male',   pct: g.male  || 0, color: '#3b82f6' },
    { label: '♀ Female', pct: g.female|| 0, color: '#ec4899' },
    { label: '⚧ Other',  pct: g.other || 0, color: '#8b5cf6' },
  ].map(gd => `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <span style="color:var(--text-secondary);">${gd.label}</span>
        <span style="font-weight:600;color:${gd.color};">${gd.pct}%</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${gd.pct}%;background:${gd.color};border-radius:3px;transition:width 0.8s;"></div>
      </div>
    </div>`).join('');

  // Audience
  document.getElementById('pdm-audience').textContent = prod.targetAudience || '—';

  // Seasonality
  const s = prod.seasonality || {};
  document.getElementById('pdm-seasonality').innerHTML = [
    { icon: '🔥', label: 'Peak Months',      value: (s.peakMonths || []).join(', ') || '—', color: 'var(--positive)' },
    { icon: '❄️', label: 'Low Months',       value: (s.lowMonths  || []).join(', ') || '—', color: 'var(--info)' },
    { icon: '⏱️', label: 'Sell-Through',     value: s.expectedSellThroughDays ? `~${s.expectedSellThroughDays} days` : '—', color: 'var(--warning)' },
  ].map(si => `
    <div style="text-align:center;padding:12px;border-radius:10px;background:var(--bg-elevated);">
      <div style="font-size:22px;margin-bottom:6px;">${si.icon}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;">${si.label}</div>
      <div style="font-size:14px;font-weight:600;color:${si.color};">${si.value}</div>
    </div>`).join('');
  if (s.window) {
    document.getElementById('pdm-seasonality').innerHTML += `
      <div style="grid-column:1/-1;padding:10px 14px;border-radius:8px;background:rgba(99,102,241,0.08);font-size:13px;color:var(--text-secondary);">
        📋 <strong>Window:</strong> ${s.window}
      </div>`;
  }

  // Suppliers
  _renderSuppliers(prod.suppliers || [], prod.name, prod.supplierHint || '');

  // Tips
  const tips = Array.isArray(prod.sellerTips) ? prod.sellerTips : [];
  document.getElementById('pdm-tips').innerHTML = tips.map(t => `<li>${safeAttr(t)}</li>`).join('') || '<li class="muted">No tips</li>';

  // Mistakes
  const mistakes = Array.isArray(prod.commonMistakes) ? prod.commonMistakes : [];
  document.getElementById('pdm-mistakes').innerHTML = mistakes.map(m => `<li>${safeAttr(m)}</li>`).join('') || '<li class="muted">No data</li>';

  // Risks
  const risks = Array.isArray(prod.riskFactors) ? prod.riskFactors : [];
  document.getElementById('pdm-risks').innerHTML = risks.map(r => `<li>${safeAttr(r)}</li>`).join('') || '<li class="muted">No risks listed</li>';

  // Opportunity + Supplier
  document.getElementById('pdm-opportunity').textContent = prod.opportunity || '—';
  document.getElementById('pdm-supplier').textContent    = prod.supplierHint || '—';

  // Show content
  document.getElementById('pdm-loading').style.display = 'none';
  document.getElementById('pdm-content').style.display = 'block';

  // Init profit calculator
  _initProfitCalc(prod, raw, currency);
}

/* ── Render Platforms as Seller List (sortable table) ──────── */
function _renderPlatforms(platforms, productName, currency) {
  const container = document.getElementById('pdm-platforms');
  const sorts     = document.getElementById('pdm-platform-sorts');
  const meta      = document.getElementById('pdm-platforms-meta');
  if (!container) return;

  const PLAT_COLORS = {
    'Amazon':       '#f97316', 'Amazon India': '#f97316',
    'Flipkart':     '#2563eb', 'Meesho':       '#d946ef',
    'Myntra':       '#ec4899', 'Snapdeal':     '#ef4444',
    'eBay':         '#f59e0b', 'eBay UK':      '#f59e0b',
    'Walmart':      '#0284c7', 'Etsy':         '#f97316',
    'Noon':         '#facc15', 'Shopee':       '#f97316',
    'Lazada':       '#7c3aed', 'Coupang':      '#e11d48',
    'Tokopedia':    '#22c55e', 'Trendyol':     '#f97316',
    'Rakuten':      '#dc2626', 'Jumia':        '#f59e0b',
    'Takealot':     '#1d4ed8', 'JioMart':      '#0ea5e9',
    'Nykaa':        '#db2777', 'Paytm Mall':   '#0ea5e9',
  };

  if (!platforms || platforms.length === 0) {
    const country = AppState.selectedCountry;
    platforms = country === 'India' ? [
      { name: 'Amazon India', monthlySales: 85000, price: 0, rating: 4.3, reviews: 12000, margin: 28, feePercent: 8,  competition: 'High',   trend: 'Rising'   },
      { name: 'Flipkart',     monthlySales: 72000, price: 0, rating: 4.1, reviews: 9500,  margin: 25, feePercent: 9,  competition: 'High',   trend: 'Rising'   },
      { name: 'Meesho',       monthlySales: 55000, price: 0, rating: 3.9, reviews: 7200,  margin: 35, feePercent: 0,  competition: 'Medium', trend: 'Rising'   },
      { name: 'Myntra',       monthlySales: 30000, price: 0, rating: 4.2, reviews: 5100,  margin: 30, feePercent: 10, competition: 'Medium', trend: 'Stable'   },
      { name: 'JioMart',      monthlySales: 12000, price: 0, rating: 3.8, reviews: 1800,  margin: 22, feePercent: 5,  competition: 'Low',    trend: 'Rising'   },
      { name: 'Snapdeal',     monthlySales: 10000, price: 0, rating: 3.6, reviews: 3200,  margin: 32, feePercent: 7,  competition: 'Low',    trend: 'Declining'},
      { name: 'Nykaa',        monthlySales: 8000,  price: 0, rating: 4.0, reviews: 2100,  margin: 27, feePercent: 12, competition: 'Low',    trend: 'Stable'   },
      { name: 'Paytm Mall',   monthlySales: 7000,  price: 0, rating: 3.7, reviews: 1200,  margin: 20, feePercent: 6,  competition: 'Low',    trend: 'Declining'},
    ] : [
      { name: 'Amazon',  monthlySales: 120000, price: 0, rating: 4.5, reviews: 25000, margin: 25, feePercent: 8,  competition: 'High',   trend: 'Rising' },
      { name: 'Walmart', monthlySales: 80000,  price: 0, rating: 4.2, reviews: 14000, margin: 28, feePercent: 6,  competition: 'High',   trend: 'Stable' },
      { name: 'eBay',    monthlySales: 45000,  price: 0, rating: 4.0, reviews: 9000,  margin: 32, feePercent: 10, competition: 'Medium', trend: 'Stable' },
      { name: 'Etsy',    monthlySales: 20000,  price: 0, rating: 4.4, reviews: 5500,  margin: 40, feePercent: 5,  competition: 'Low',    trend: 'Rising' },
    ];
  }

  const SORTS = [
    { key: 'sales',  label: '📦 Sales',  fn: (a, b) => (b.monthlySales || 0) - (a.monthlySales || 0) },
    { key: 'price',  label: '💰 Price',  fn: (a, b) => (a.price || 0) - (b.price || 0) },
    { key: 'margin', label: '📈 Margin', fn: (a, b) => (b.margin || 0) - (a.margin || 0) },
    { key: 'rating', label: '⭐ Rating', fn: (a, b) => (b.rating || 0) - (a.rating || 0) },
  ];

  // Switch container to table layout
  container.style.display = 'block';
  meta.textContent = `${platforms.length} websites selling this product — click any row to visit`;

  function renderList(sortKey) {
    const sorted   = [...platforms].sort(SORTS.find(s => s.key === sortKey)?.fn || SORTS[0].fn);
    const maxSales = Math.max(...sorted.map(p => p.monthlySales || 0), 1);

    container.innerHTML = `
      <table class="pdm-seller-table">
        <thead><tr>
          <th style="width:36px;">#</th>
          <th>Platform</th>
          <th>Selling Price</th>
          <th>Monthly Sales</th>
          <th>Margin</th>
          <th>Fee</th>
          <th>Trend</th>
          <th>Rating</th>
          <th>Visit</th>
        </tr></thead>
        <tbody>${sorted.map((pl, i) => {
          const color     = PLAT_COLORS[pl.name] || 'var(--accent)';
          const url       = pl.url || buildPlatformUrl(pl.name, productName, AppState.selectedCountry);
          const priceConv = pl.price ? CurrencyEngine.convert(pl.price, pl.currency || currency, currency) : 0;
          const pct       = Math.round(((pl.monthlySales || 0) / maxSales) * 100);
          const trendIcon = pl.trend === 'Rising' ? '↑' : pl.trend === 'Declining' ? '↓' : '→';
          const trendC    = pl.trend === 'Rising' ? 'var(--positive)' : pl.trend === 'Declining' ? 'var(--danger)' : 'var(--warning)';
          const medal     = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
          const starsFull = Math.round(pl.rating || 0);
          const starStr   = '★'.repeat(starsFull) + '☆'.repeat(5 - starsFull);
          return `<tr class="pdm-seller-row" style="border-left:3px solid ${color}30;"
            onmouseover="this.style.background='${color}0a';this.style.borderLeftColor='${color}'"
            onmouseout="this.style.background='';this.style.borderLeftColor='${color}30'">
            <td style="font-size:15px;text-align:center;">${medal}</td>
            <td><a href="${url}" target="_blank" style="font-weight:700;color:${color};font-size:12px;background:${color}15;padding:3px 8px;border-radius:5px;text-decoration:none;white-space:nowrap;" onmouseover="this.style.background='${color}30'" onmouseout="this.style.background='${color}15'">${pl.name}</a></td>
            <td style="font-weight:700;color:var(--positive);">${priceConv > 0 ? formatPrice(priceConv, currency) : '—'}</td>
            <td>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:12px;color:var(--text-secondary);white-space:nowrap;">${pl.monthlySales ? fmtK(pl.monthlySales) + ' /mo' : '—'}</span>
                <div style="width:50px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;flex-shrink:0;"><div style="height:100%;width:${pct}%;background:${color};transition:width 0.8s;"></div></div>
              </div>
            </td>
            <td style="color:var(--accent);font-weight:600;">${pl.margin ? pl.margin + '%' : '—'}</td>
            <td style="color:var(--warning);">${pl.feePercent != null ? pl.feePercent + '%' : '—'}</td>
            <td style="color:${trendC};font-weight:600;white-space:nowrap;">${trendIcon} ${pl.trend || '—'}</td>
            <td style="color:#f59e0b;font-size:11px;" title="${pl.rating}/5${pl.reviews ? ' • ' + fmtK(pl.reviews) + ' reviews' : ''}">${starStr}</td>
            <td><a href="${url}" target="_blank" class="pdm-visit-link" style="background:${color}15;color:${color};border:1px solid ${color}44;" onmouseover="this.style.background='${color}30'" onmouseout="this.style.background='${color}15'">↗ Visit</a></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;

    sorts.querySelectorAll('[data-plat-sort]').forEach(btn => {
      const active = btn.dataset.platSort === sortKey;
      btn.style.background  = active ? 'var(--accent)' : 'var(--bg-elevated)';
      btn.style.color       = active ? '#fff' : 'var(--text-secondary)';
      btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
    });
  }

  sorts.innerHTML = SORTS.map(s => `
    <button data-plat-sort="${s.key}"
      style="padding:4px 12px;border-radius:20px;border:1px solid var(--border);font-size:12px;cursor:pointer;transition:all 0.2s;background:${s.key==='sales'?'var(--accent)':'var(--bg-elevated)'};color:${s.key==='sales'?'#fff':'var(--text-secondary)'};">${s.label}</button>
  `).join('');

  sorts.querySelectorAll('[data-plat-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.platSort;
      renderList(key);
    });
  });

  renderList('sales');
}

/* ── Profit Calculator ────────────────────────────────────── */
function _initProfitCalc(prod, raw, currency) {
  const cpDef  = prod.estimatedCostPrice   || Math.round((prod.estimatedRetailPrice || 0) * 0.4);
  const spDef  = prod.estimatedRetailPrice || raw.price || 0;
  const cpIn   = document.getElementById('pdm-cp');
  const spIn   = document.getElementById('pdm-sp');
  const shipIn = document.getElementById('pdm-ship');
  const packIn = document.getElementById('pdm-pack');
  const qtyIn  = document.getElementById('pdm-qty');
  const platSel= document.getElementById('pdm-plat');
  const results= document.getElementById('pdm-calc-results');
  const saveBtn= document.getElementById('pdm-save-btn');
  const toggle = document.getElementById('pdm-calc-toggle');
  const body   = document.getElementById('pdm-calc-body');
  if (!cpIn) return;

  if (cpDef > 0) cpIn.value = Math.round(cpDef);
  if (spDef > 0) spIn.value = Math.round(spDef);

  // Toggle
  if (toggle && !toggle._bound) {
    toggle._bound = true;
    toggle.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      toggle.textContent = open ? '▼ Show' : '▲ Hide';
    });
  }

  function recalc() {
    const cp   = parseFloat(cpIn.value)   || 0;
    const sp   = parseFloat(spIn.value)   || 0;
    const ship = parseFloat(shipIn.value) || 0;
    const pack = parseFloat(packIn.value) || 0;
    const qty  = parseInt(qtyIn.value)    || 1;
    const fee  = parseFloat(platSel.value)|| 0.15;
    if (!cp || !sp) { results.style.display = 'none'; saveBtn.style.display = 'none'; return; }
    const commission   = sp * fee;
    const totalCost    = cp + ship + pack + commission;
    const profit       = sp - totalCost;
    const margin       = (profit / sp) * 100;
    const roi          = (profit / cp) * 100;
    const monthlyProfit= profit * qty;
    const breakeven    = profit > 0 ? Math.ceil(totalCost / profit) : '∞';
    const fmt = v => formatPrice(CurrencyEngine.convert(v, currency, currency), currency);
    document.getElementById('pcr-profit').textContent    = fmt(profit);
    document.getElementById('pcr-margin').textContent    = margin.toFixed(1) + '%';
    document.getElementById('pcr-roi').textContent       = roi.toFixed(1) + '%';
    document.getElementById('pcr-monthly').textContent   = fmt(monthlyProfit);
    document.getElementById('pcr-breakeven').textContent = breakeven + (typeof breakeven === 'number' ? ' units' : '');
    const mEl = document.getElementById('pcr-margin');
    mEl.style.color = margin >= 20 ? 'var(--positive)' : margin >= 10 ? 'var(--warning)' : 'var(--danger)';
    results.style.display = 'grid';
    saveBtn.style.display = profit > 0 ? 'block' : 'none';
  }

  // Remove old listeners by cloning
  [cpIn, spIn, shipIn, packIn, qtyIn, platSel].forEach(el => {
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener('input', recalc);
  });

  recalc();

  // Re-acquire refs after cloning
  const saveBtnFresh = document.getElementById('pdm-save-btn');
  saveBtnFresh.onclick = async () => {
    const cp      = parseFloat(document.getElementById('pdm-cp').value)   || 0;
    const sp      = parseFloat(document.getElementById('pdm-sp').value)   || 0;
    const ship    = parseFloat(document.getElementById('pdm-ship').value) || 0;
    const pack    = parseFloat(document.getElementById('pdm-pack').value) || 0;
    const qty     = parseInt(document.getElementById('pdm-qty').value)    || 1;
    const platEl  = document.getElementById('pdm-plat');
    const fee     = parseFloat(platEl.value) || 0.15;
    const platName= platEl.options[platEl.selectedIndex].text.split(' (')[0];
    const profit  = sp - (cp + ship + pack + sp * fee);
    const margin  = ((profit / sp) * 100);
    const result  = await addSaved({
      name:        prod.name || raw.name,
      category:    prod.category || raw.category || '',
      country:     AppState.selectedCountry === 'all' ? 'India' : AppState.selectedCountry,
      platform:    platName,
      sp, cp, currency: AppState.displayCurrency || 'INR',
      margin:      +margin.toFixed(1),
      winnerScore: raw._winnerScore || computeWinnerScore(raw),
      demand:      raw.demand || 50,
      source:      'trending',
      note:        `Cost: ${cp} | Ship: ${ship} | Pack: ${pack} | Fee: ${(fee*100).toFixed(0)}%`,
      moq:         prod.estimatedMOQ || 50,
    });
    if (result.success === false) {
      Toast.warning('⚠ Already in your saved list!');
    } else {
      Toast.success('💾 Saved with profit numbers!');
      saveBtnFresh.textContent = '✅ Saved!';
      saveBtnFresh.disabled = true;
      setTimeout(() => { saveBtnFresh.textContent = '💾 Save to My List with These Numbers'; saveBtnFresh.disabled = false; }, 2500);
    }
  };
}

/* ── Render Suppliers ────────────────────────────────────── */
function _renderSuppliers(suppliers, productName, hint) {
  const container = document.getElementById('pdm-suppliers');
  const filters   = document.getElementById('pdm-supplier-filters');
  const meta      = document.getElementById('pdm-suppliers-meta');
  if (!container) return;

  // Platform color map
  const PLAT_COLORS = {
    'IndiaMART':          '#f97316',
    'JustDial':           '#3b82f6',
    'Alibaba':            '#f59e0b',
    'TradeIndia':         '#10b981',
    'Global Sources':     '#8b5cf6',
    'Made-in-China':      '#ef4444',
    'Amazon Business':    '#1d4ed8',
    'Flipkart Wholesale': '#7c3aed',
    'Udaan':              '#0891b2',
    'Moglix':             '#dc2626',
    'Meesho Supplier':    '#db2777',
    'AliExpress':         '#e11d48',
    'DHgate':             '#d97706',
    'ExportersIndia':     '#059669',
    'IndiaBizForSale':    '#64748b',
  };

  // If AI returned no suppliers, build a default fallback set
  if (!suppliers || suppliers.length === 0) {
    suppliers = [
      { name: 'Search on IndiaMART',    platform: 'IndiaMART',      type: 'Wholesaler',    location: 'India',  moq: 50,   leadTimeDays: 3,  rating: 4.2, verified: true,  tags: ['GST Verified'] },
      { name: 'Search on Alibaba',      platform: 'Alibaba',        type: 'Manufacturer',  location: 'China',  moq: 100,  leadTimeDays: 15, rating: 4.5, verified: true,  tags: ['Export Ready', 'ISO Certified'] },
      { name: 'Search on TradeIndia',   platform: 'TradeIndia',     type: 'Distributor',   location: 'India',  moq: 25,   leadTimeDays: 5,  rating: 3.9, verified: false, tags: [] },
      { name: 'Search on JustDial',     platform: 'JustDial',       type: 'Local Supplier',location: 'India',  moq: 10,   leadTimeDays: 1,  rating: 4.0, verified: true,  tags: ['Local'] },
      { name: 'Search on Global Sources', platform: 'Global Sources', type: 'Manufacturer', location: 'China', moq: 500,  leadTimeDays: 20, rating: 4.3, verified: true,  tags: ['Export Ready'] },
      { name: 'Search on Udaan',        platform: 'Udaan',           type: 'Wholesaler',   location: 'India',  moq: 20,   leadTimeDays: 2,  rating: 4.1, verified: true,  tags: ['GST Verified'] },
    ];
  }

  // Build filter tabs by type
  const types = [...new Set(suppliers.map(s => s.type || 'Other'))];
  let activeFilter = 'All';
  meta.textContent = `${suppliers.length} suppliers found`;

  function renderCards(filter) {
    const shown = filter === 'All' ? suppliers : suppliers.filter(s => s.type === filter);
    container.innerHTML = shown.map(s => {
      const color   = PLAT_COLORS[s.platform] || 'var(--accent)';
      const url     = s.searchUrl || buildSupplierSearchUrl(s.platform, productName);
      const stars   = '★'.repeat(Math.round(s.rating || 0)) + '☆'.repeat(5 - Math.round(s.rating || 0));
      const tags    = (s.tags || []).map(t => `<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:var(--bg-elevated);color:var(--text-secondary);border:1px solid var(--border);">${t}</span>`).join('');
      const minP    = s.minPrice ? formatPrice(s.minPrice, AppState.displayCurrency) : '';
      const maxP    = s.maxPrice ? formatPrice(s.maxPrice, AppState.displayCurrency) : '';
      const priceStr = s.priceRange || (minP && maxP ? `${minP} – ${maxP}` : minP || maxP || '—');

      return `<div style="border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--bg-card);transition:border-color 0.2s;position:relative;"
        onmouseover="this.style.borderColor='${color}'" onmouseout="this.style.borderColor='var(--border)'">

        <!-- Platform badge -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:5px;background:${color}22;color:${color};border:1px solid ${color}44;">${s.platform}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            ${s.verified ? `<span style="font-size:10px;color:#10b981;font-weight:600;">✓ Verified</span>` : ''}
            <span style="font-size:11px;color:#f59e0b;" title="Rating: ${s.rating || '—'}">${stars}</span>
          </div>
        </div>

        <!-- Name -->
        <div style="font-weight:600;font-size:14px;color:var(--text-primary);margin-bottom:6px;">${s.name}</div>

        <!-- Type + Location -->
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;display:flex;gap:10px;flex-wrap:wrap;">
          <span>🏭 ${s.type || '—'}</span>
          <span>📍 ${s.location || '—'}</span>
          ${s.yearsInBusiness ? `<span>🕐 ${s.yearsInBusiness}y exp</span>` : ''}
        </div>

        <!-- Price + MOQ + Lead time -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
          <div style="padding:6px 8px;border-radius:6px;background:var(--bg-elevated);">
            <div style="font-size:10px;color:var(--text-tertiary);">Price / unit</div>
            <div style="font-size:13px;font-weight:600;color:var(--positive);">${priceStr}</div>
          </div>
          <div style="padding:6px 8px;border-radius:6px;background:var(--bg-elevated);">
            <div style="font-size:10px;color:var(--text-tertiary);">Min. Order</div>
            <div style="font-size:13px;font-weight:600;color:var(--warning);">${s.moq ? s.moq + ' pcs' : '—'}</div>
          </div>
          ${s.supplyCapacity ? `<div style="padding:6px 8px;border-radius:6px;background:var(--bg-elevated);">
            <div style="font-size:10px;color:var(--text-tertiary);">Capacity</div>
            <div style="font-size:12px;font-weight:600;color:var(--accent);">${s.supplyCapacity}</div>
          </div>` : ''}
          ${s.leadTimeDays ? `<div style="padding:6px 8px;border-radius:6px;background:var(--bg-elevated);">
            <div style="font-size:10px;color:var(--text-tertiary);">Lead Time</div>
            <div style="font-size:12px;font-weight:600;color:var(--info);">${s.leadTimeDays} days</div>
          </div>` : ''}
        </div>

        <!-- Tags -->
        ${tags ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">${tags}</div>` : ''}

        <!-- Search button — stays on page, no navigation away -->
        <button onclick="_openSupplierSearch('${url.replace(/'/g,"\\'")}')"
          style="width:100%;padding:8px;border-radius:8px;border:1px solid ${color}44;background:${color}11;color:${color};font-weight:600;font-size:12px;cursor:pointer;transition:all 0.2s;"
          onmouseover="this.style.background='${color}22'" onmouseout="this.style.background='${color}11'">
          🔍 View Suppliers on ${s.platform}
        </button>
      </div>`;
    }).join('');

    // Update filter active state
    filters.querySelectorAll('[data-supplier-filter]').forEach(btn => {
      const isActive = btn.dataset.supplierFilter === filter;
      btn.style.background  = isActive ? 'var(--accent)' : 'var(--bg-elevated)';
      btn.style.color       = isActive ? '#fff' : 'var(--text-secondary)';
      btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    });
  }

  // Build filter tabs
  filters.innerHTML = ['All', ...types].map(t => `
    <button data-supplier-filter="${t}"
      style="padding:4px 12px;border-radius:20px;border:1px solid var(--border);font-size:12px;cursor:pointer;transition:all 0.2s;background:${t==='All'?'var(--accent)':'var(--bg-elevated)'};color:${t==='All'?'#fff':'var(--text-secondary)'};"
      onclick="_supplierFilterClick(this,'${t}')">${t}</button>
  `).join('');

  window._supplierFilterActive = 'All';
  window._supplierRenderCards  = renderCards;
  renderCards('All');

  // Hint row at bottom
  if (hint) {
    container.innerHTML += `<div style="grid-column:1/-1;padding:10px 12px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);font-size:13px;color:var(--text-secondary);">
      💡 <strong>Source tip:</strong> ${hint}
    </div>`;
  }
}

function _supplierFilterClick(btn, filter) {
  window._supplierFilterActive = filter;
  if (window._supplierRenderCards) window._supplierRenderCards(filter);
}

function _openSupplierSearch(url) {
  // Open supplier platform in a floating panel inside the page
  const existing = document.getElementById('supplier-preview-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'supplier-preview-panel';
  panel.style.cssText = `
    position:fixed;bottom:0;right:0;width:480px;height:62vh;
    background:var(--bg-card);border:1px solid var(--border);
    border-radius:16px 0 0 0;z-index:99999;box-shadow:-4px -4px 40px rgba(0,0,0,0.5);
    display:flex;flex-direction:column;overflow:hidden;
  `;
  panel.innerHTML = `
    <div style="padding:12px 16px;background:var(--bg-elevated);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <span style="font-weight:600;font-size:13px;">🏭 Supplier Search</span>
      <div style="display:flex;gap:8px;">
        <a href="${url}" target="_blank" style="font-size:12px;color:var(--accent);text-decoration:none;padding:4px 8px;border:1px solid var(--accent);border-radius:6px;">Open in new tab ↗</a>
        <button onclick="document.getElementById('supplier-preview-panel').remove()" style="background:none;border:none;color:var(--text-secondary);font-size:18px;cursor:pointer;">✕</button>
      </div>
    </div>
    <iframe src="${url}" style="flex:1;width:100%;border:none;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  `;
  document.body.appendChild(panel);
}

function _renderProductDetailFallback(p, currency) {
  // Basic fallback when API fails — populate from local product data
  const fakeProduct = {
    name: p.name,
    category: p.category || '',
    description: `${p.name} — a trending product in the ${p.category || 'General'} category.`,
    whySelling: 'Strong demand trend, competitive pricing, and multi-platform availability.',
    platforms: [{ name: p.platform || 'Online', price: p.price || 0, currency, monthlySales: p.monthlySales || 1000, trend: 'Rising', url: buildPlatformUrl(p.platform || 'Online', p.name, AppState.selectedCountry) }],
    ageGroups: [{ range:'18-24',percentage:20,label:'Gen Z'},{range:'25-34',percentage:35,label:'Millennials'},{range:'35-44',percentage:25,label:'Gen X'},{range:'45-60',percentage:15,label:'Boomers'},{range:'60+',percentage:5,label:'Seniors'}],
    genderSplit: { male: 50, female: 45, other: 5 },
    targetAudience: 'General consumer audience with interest in this category.',
    seasonality: { peakMonths: ['Oct','Nov','Dec'], lowMonths: ['Feb','Mar'], window: 'Year-round with seasonal peaks', expectedSellThroughDays: 30 },
    suppliers: [
      { name: 'IndiaMART Suppliers', platform: 'IndiaMART', type: 'Wholesaler', location: 'India', moq: 50, leadTimeDays: 3, rating: 4.2, verified: true, tags: ['GST Verified'], searchUrl: buildSupplierSearchUrl('IndiaMART', p.name) },
      { name: 'JustDial Local Dealers', platform: 'JustDial', type: 'Local Supplier', location: 'India', moq: 10, leadTimeDays: 1, rating: 4.0, verified: true, tags: ['Local'], searchUrl: buildSupplierSearchUrl('JustDial', p.name) },
      { name: 'Alibaba Manufacturers', platform: 'Alibaba', type: 'Manufacturer', location: 'China', moq: 100, leadTimeDays: 15, rating: 4.5, verified: true, tags: ['Export Ready', 'ISO Certified'], searchUrl: buildSupplierSearchUrl('Alibaba', p.name) },
      { name: 'TradeIndia Distributors', platform: 'TradeIndia', type: 'Distributor', location: 'India', moq: 25, leadTimeDays: 5, rating: 3.9, verified: false, tags: [], searchUrl: buildSupplierSearchUrl('TradeIndia', p.name) },
      { name: 'Global Sources', platform: 'Global Sources', type: 'Manufacturer', location: 'China', moq: 500, leadTimeDays: 20, rating: 4.3, verified: true, tags: ['Export Ready'], searchUrl: buildSupplierSearchUrl('Global Sources', p.name) },
      { name: 'Udaan B2B Wholesale', platform: 'Udaan', type: 'Wholesaler', location: 'India', moq: 20, leadTimeDays: 2, rating: 4.1, verified: true, tags: ['GST Verified'], searchUrl: buildSupplierSearchUrl('Udaan', p.name) },
    ],
    sellerTips: ['Research competitor pricing before listing', 'Use high-quality product photos', 'Optimise product title with keywords', 'Offer bundle deals to increase AOV', 'Monitor reviews weekly'],
    commonMistakes: ['Underpricing to compete on price alone', 'Poor product description', 'Ignoring return policy impact on ranking'],
    riskFactors: ['High competition may compress margins', 'Seasonal demand fluctuations'],
    opportunity: 'This product shows strong selling potential based on market data.',
    supplierHint: 'Check Alibaba, IndiaMART, or local wholesalers for bulk pricing.',
    estimatedMOQ: 50,
    estimatedCostPrice: (p.price || 0) * 0.4,
    estimatedRetailPrice: p.price || 0,
    estimatedMargin: p.margin || 25,
    winnerScore: p._winnerScore || 60,
  };
  _renderProductDetail(fakeProduct, p, currency);
}

function closeProductDetail() {
  document.getElementById('product-detail-modal').classList.add('hidden');
}

/* ── AI Discover ─────────────────────────────────────────── */
async function aiDiscoverTrending() {
  const country   = AppState.selectedCountry;
  const category  = document.getElementById('trend-category')?.value || 'all';
  const currency  = AppState.displayCurrency;
  const container = document.getElementById('ai-trending-container');
  if (!container) return;

  container.innerHTML = `
    <div class="flex-center mt-md" style="flex-direction:column;gap:10px;padding:30px;">
      <div class="spinner"></div>
      <span class="muted">AI discovering winning products in ${country === 'all' ? 'worldwide' : country}...</span>
    </div>`;

  const result = await AIEngine.discoverTrending(country === 'all' ? 'worldwide' : country, category);

  if (!result || !Array.isArray(result) || result.length === 0) {
    container.innerHTML = '<div class="muted mt-md" style="padding:12px;">AI returned no results. Try again.</div>';
    return;
  }

  const scored = result.map(p => ({
    ...p,
    _winnerScore: p.winnerScore || computeWinnerScore({ demand: p.demand || 50, margin: p.margin || 0, competition: p.competition || 'Medium', platformCount: p.platformCount || 2 }),
  })).sort((a, b) => b._winnerScore - a._winnerScore);

  window._lastAITrendingResults = scored;
  window._lastAITrendingCountry = country;

  const countryConf = (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country]) ? COUNTRY_CONFIG[country] : { currency: 'USD' };
  const srcCurrency = countryConf.currency || 'USD';
  const hotCount    = scored.filter(p => p._winnerScore >= 75).length;

  container.innerHTML = `
    <div class="card ai-result mt-md">
      <div class="flex-between" style="margin-bottom:14px;">
        <div class="ai-badge">AI Trending — ${country === 'all' ? 'Worldwide' : country}</div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${hotCount > 0 ? `<span style="color:#ff6b35;font-weight:600;font-size:13px;">🔥 ${hotCount} Hot Picks</span>` : ''}
          <span class="muted">${scored.length} products · Click name for deep analysis</span>
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Product</th><th>Winner Score</th><th>Category</th><th>Cost</th><th>Sell Price</th>
          <th>Margin</th><th>Demand</th><th>Competition</th><th>Social 🔥</th><th>Why Trending</th><th>Action</th>
        </tr></thead><tbody>
          ${scored.map((p, i) => {
            const cost = CurrencyEngine.convert(p.costPrice  || 0, srcCurrency, currency);
            const sell = CurrencyEngine.convert(p.sellingPrice || 0, srcCurrency, currency);
            const score = p._winnerScore;
            return `<tr style="${score >= 75 ? 'background:rgba(255,107,53,0.04);' : ''}">
              <td>
                <span data-action="open-product-detail-ai" data-index="${i}"
                  style="cursor:pointer;font-weight:600;border-bottom:1px dashed var(--accent);"
                  onmouseover="this.style.color='var(--accent)'"
                  onmouseout="this.style.color=''">
                  ${p.name || '—'}
                </span>
              </td>
              <td>${scoreBadge(score, { demand: p.demand, margin: p.margin, competition: p.competition, platformCount: p.platformCount || 2 })}</td>
              <td><span class="tag tag-gray">${p.category || '—'}</span></td>
              <td class="price mono">${formatPrice(cost, currency)}</td>
              <td class="price mono">${formatPrice(sell, currency)}</td>
              <td class="positive-text mono">${p.margin || 0}%</td>
              <td>${demandBar(p.demand || 50)}</td>
              <td>${competitionTag(p.competition || 'Medium')}</td>
              <td>
                ${(() => { const v = typeof calculateViralScore === 'function' ? calculateViralScore(p.name) : {score:0,breakdown:{}}; const badge = v.score >= 80 ? '🔥' : v.score >= 50 ? '⚡' : ''; return v.score > 0 ? `<div class="social-buzz-mini"><div class="viral-score">${v.score}${badge}</div><div class="social-bars"><div class="s-bar s-tiktok" style="width:${(v.breakdown.tiktok||0)*2.5}%"></div><div class="s-bar s-insta" style="width:${(v.breakdown.instagram||0)*3.3}%"></div><div class="s-bar s-fb" style="width:${(v.breakdown.facebook||0)*5}%"></div></div></div>` : '<span class="muted">—</span>'; })()}
              </td>
              <td class="muted" style="max-width:180px;font-size:12px;white-space:normal;">${p.whyTrending || '—'}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-sm" data-action="save-ai-trending" data-index="${i}">Save</button>
                <button class="btn btn-sm" style="margin-left:4px;background:var(--accent-soft);color:var(--accent);" data-action="ai-listing-trending" data-name="${(p.name||'').replace(/"/g,'')}", data-cat="${(p.category||'').replace(/"/g,'')}">✨ Listing</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody></table>
      </div>
    </div>`;
}

/* ── Event Delegation ────────────────────────────────────── */
document.addEventListener('click', async function(e) {

  // ── Open product detail (live listings)
  const pdBtn = e.target.closest('[data-action="open-product-detail"]');
  if (pdBtn) {
    const idx = parseInt(pdBtn.dataset.index);
    const listings = window._lastLiveTrending;
    if (listings && listings[idx]) openProductDetail(listings[idx]);
    return;
  }

  // ── Open product detail (AI discover listings)
  const pdAiBtn = e.target.closest('[data-action="open-product-detail-ai"]');
  if (pdAiBtn) {
    const idx = parseInt(pdAiBtn.dataset.index);
    const results = window._lastAITrendingResults;
    if (results && results[idx]) openProductDetail(results[idx]);
    return;
  }

  // ── Click platform pill → open platform product page
  const platBtn = e.target.closest('[data-action="open-platform"]');
  if (platBtn) {
    const url = platBtn.dataset.url;
    if (url) window.open(url, '_blank', 'noopener');
    return;
  }

  // ── AI Listing Generator
  const listingBtn = e.target.closest('[data-action="ai-listing-trending"]');
  if (listingBtn) {
    const name = listingBtn.dataset.name || '';
    const cat  = listingBtn.dataset.cat  || '';
    if (typeof showListingModal === 'function') showListingModal(name, cat);
    return;
  }

  // ── Save from local DB
  const trendBtn = e.target.closest('[data-action="save-trend"]');
  if (trendBtn) {
    const id      = parseInt(trendBtn.dataset.id);
    const product = await db.products.get(id);
    if (!product) return;
    const r = await addSaved({ name: product.name, country: product.country, category: product.category, margin: product.margin, sp: product.supplierPrice, currency: product.currency, source: 'trending' });
    if (r.success) { Toast.success(`Saved "${product.name}"`); trendBtn.textContent = '✓'; trendBtn.disabled = true; }
    else Toast.info(r.message);
    return;
  }

  // ── Save from LIVE trending
  const liveBtn = e.target.closest('[data-action="save-live-trend"]');
  if (liveBtn) {
    const idx = parseInt(liveBtn.dataset.index);
    const listings = window._lastLiveTrending;
    if (!listings || !listings[idx]) return;
    const p = listings[idx];
    const country = AppState.selectedCountry === 'all' ? 'USA' : AppState.selectedCountry;
    const r = await addSaved({ name: p.name, country, category: p.category || '', sp: p.price || 0, currency: p.currency || AppState.displayCurrency, margin: p.margin || 0, winnerScore: p._winnerScore, source: 'live-trending' });
    if (r.success) {
      Toast.success(`Saved "${p.name}"`);
      liveBtn.textContent = '✓ Saved';
      liveBtn.disabled = true;
      liveBtn.style.opacity = '0.5';
      // Update saved cache and add badge to name
      _savedNameSet.add(_normalizeName(p.name));
      const row = liveBtn.closest('tr');
      if (row) {
        row.style.background = 'rgba(34,197,94,0.06)';
        const nameSpan = row.querySelector('[data-action="open-product-detail"]');
        if (nameSpan && !nameSpan.parentElement.querySelector('.tag[style*="22c55e"]')) {
          nameSpan.insertAdjacentHTML('afterend', ' <span class="tag" style="font-size:9px;background:rgba(34,197,94,0.15);color:#22c55e;">✓ Saved</span>');
        }
      }
    }
    else Toast.info(r.message);
    return;
  }

  // ── Save from AI trending
  const aiBtn = e.target.closest('[data-action="save-ai-trending"]');
  if (aiBtn) {
    const idx      = parseInt(aiBtn.dataset.index);
    const results  = window._lastAITrendingResults;
    const country  = window._lastAITrendingCountry || AppState.selectedCountry;
    if (!results || !results[idx]) return;
    const p = results[idx];
    const countryConf = (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country]) ? COUNTRY_CONFIG[country] : { currency: 'USD' };
    const r = await addSaved({ name: p.name, country, category: p.category, sp: p.sellingPrice, margin: p.margin || 0, winnerScore: p._winnerScore, currency: countryConf.currency, source: 'ai-trending' });
    if (r.success) { Toast.success(`Saved "${p.name}"`); aiBtn.textContent = '✓'; aiBtn.disabled = true; }
    else Toast.info(r.message);
  }
});

// Close with Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeProductDetail();
});

/* ── Deep Research: AI↔Scraper Feedback Loop ─────────────── */
async function deepResearchTrending() {
  const btn = document.getElementById('btn-deep-research');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '🔬 Researching...';

  const category = document.getElementById('trend-category')?.value || 'all';
  const country  = AppState.selectedCountry || 'all';

  try {
    const res = await fetch('/api/trending/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, category, maxRounds: 3 }),
      signal: AbortSignal.timeout(180000), // 3 min timeout for deep research
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    const items = data.items || [];

    if (items.length === 0) {
      Toast.warning('Deep research found no products. Try a different category.');
      return;
    }

    // Render into existing trending table
    const tbody = document.getElementById('trend-body');
    if (!tbody) return;

    // Clear existing and render deep research results
    tbody.innerHTML = '';
    const currency = AppState.displayCurrency || 'INR';

    // Store for click handler — reuse existing live trending handlers
    window._lastLiveTrending = items;
    window._allTrendProducts = items;
    window._trendHasMore = false;


    items.forEach((p, i) => {
      p._winnerScore = p.aiScore || computeWinnerScore(p);
      const score = p._winnerScore;
      const badge = scoreBadge(score, p);
      const priceDisplay = p.price ? formatPrice(
        CurrencyEngine.convert(parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0, currency, currency), currency
      ) : '—';
      const isSaved = _isProductSaved(p.name);
      const saveBtn = isSaved
        ? `<button class="btn btn-sm" disabled style="opacity:0.5;cursor:default;">✓ Saved</button>`
        : `<button class="btn btn-sm" data-action="save-live-trend" data-index="${i}">Save</button>`;

      tbody.innerHTML += `<tr class="product-row" data-idx="${i}">
        <td>
          <span data-action="open-product-detail" data-index="${i}"
            style="cursor:pointer;font-weight:600;border-bottom:1px dashed var(--accent);color:var(--text-primary);"
            onmouseover="this.style.color='var(--accent)'"
            onmouseout="this.style.color='var(--text-primary)'">
            ${p.name || '—'}
          </span>
          ${isSaved ? ' <span class="tag" style="font-size:9px;background:rgba(34,197,94,0.15);color:#22c55e;">✓ Saved</span>' : ''}
        </td>
        <td>${badge}</td>
        <td>${p.country || country}</td>
        <td><span class="tag">${p.category || '—'}</span></td>
        <td>${p.aiDemand != null ? demandBar(p.aiDemand) : demandBar(p.demand || 50)}</td>
        <td class="positive-text mono">${p.aiMargin != null ? p.aiMargin + '%' : (p.margin ? p.margin + '%' : '—')}</td>
        <td>${competitionTag(p.competition || 'Medium')}</td>
        <td>${renderTrendingPlatformPills(p, i)}</td>
        <td class="price mono">${priceDisplay}</td>
        <td>${saveBtn}</td>
      </tr>`;
    });


    Toast.success(`🔬 Deep research complete: ${data.rounds} rounds, ${data.total} products found!`);
  } catch (e) {
    Toast.error('Deep research failed: ' + e.message);
    console.error('[DeepResearch]', e);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔬 Deep Research';
  }
}
