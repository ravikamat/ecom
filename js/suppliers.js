/* ============================================================
   Supplier Finder Page — Real-Time Data via Scraping + AI
   ============================================================
   Uses:
   - /api/scrape   → Live web scraping (Crawlee) for supplier data
   - /api/ai       → AI proxy for intelligent supplier suggestions
   - AIEngine      → Client-side AI helper (suggestSuppliers, query)
   - getSuppliers() → Local Dexie DB fallback
   ============================================================ */

/* ── All 20 supported countries ──────────────────────────── */
const SUPPLIER_COUNTRIES = [
  'India', 'USA', 'UK', 'UAE', 'Canada', 'Australia',
  'Germany', 'France', 'Japan', 'Singapore', 'Saudi Arabia',
  'Brazil', 'Mexico', 'Nigeria', 'South Africa', 'Turkey',
  'Indonesia', 'Thailand', 'Malaysia', 'South Korea'
];

/* ── Utility: country info lookup ────────────────────────── */
function _getCountryInfo(country) {
  if (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country]) {
    return COUNTRY_CONFIG[country];
  }
  return { currency: 'USD', symbol: '$', flag: '' };
}

/* ── Utility: supplier type → tag class ──────────────────── */
function _supplierTypeClass(type) {
  if (!type) return 'tag-gray';
  const t = type.toLowerCase();
  if (t.includes('manufacturer')) return 'tag-green';
  if (t.includes('wholesal'))     return 'tag-blue';
  if (t.includes('dropship'))     return 'tag-purple';
  if (t.includes('trading'))      return 'tag-yellow';
  if (t.includes('distributor'))  return 'tag-cyan';
  return 'tag-gray';
}

/* ── Utility: star rating HTML ───────────────────────────── */
function _starsHTML(rating) {
  const r = Math.round(Number(rating) * 10) / 10;
  if (isNaN(r) || r <= 0) return '<span class="muted">—</span>';
  const full  = Math.floor(r);
  const half  = r % 1 >= 0.3;
  let html = '';
  for (let i = 0; i < full; i++) html += '★';
  if (half) html += '½';
  return `<span style="color:var(--warning);font-weight:600;">${html}</span> <span class="muted" style="font-size:12px;">${r.toFixed(1)}</span>`;
}

/* ── Utility: price indicator badge ──────────────────────── */
function _priceIndicator(priceData, currency) {
  if (!priceData) return '';
  const cur = currency || AppState.displayCurrency || 'USD';

  // Accept various price shapes
  let min, max, single;
  if (typeof priceData === 'number') {
    single = priceData;
  } else if (typeof priceData === 'object') {
    min = priceData.min || priceData.wholesale || priceData.wholesalePrice || priceData.low;
    max = priceData.max || priceData.retail || priceData.retailPrice || priceData.high;
    single = priceData.price || priceData.unitPrice || priceData.estimatedPrice;
  } else if (typeof priceData === 'string') {
    return `<span class="tag tag-accent">${priceData}</span>`;
  }

  if (min && max) {
    return `<span class="tag tag-accent">${formatPrice(min, cur)} — ${formatPrice(max, cur)}</span>`;
  }
  if (single) {
    return `<span class="tag tag-accent">${formatPrice(single, cur)}</span>`;
  }
  return '';
}


/* ============================================================
   Render a single supplier card
   ============================================================ */
function _renderSupplierCard(s, idx) {
  const typeClass = _supplierTypeClass(s.type);
  const flag = getFlag(s.country) || '';
  const city = s.city || '';
  const location = [city, s.country].filter(Boolean).join(', ');
  const moqVal = s.moq != null ? s.moq : '—';
  const moqUnit = s.moqUnit || 'pcs';
  const products = Array.isArray(s.products) ? s.products : (s.products ? [s.products] : []);
  const rating = s.rating || 0;
  const contact = s.contact || s.email || s.website || s.phone || '';
  const notes = s.notes || s.description || '';
  const price = _priceIndicator(s.price || s.priceRange || s.unitPrice || s.wholesalePrice, s.currency);
  const source = s._source || '';
  const uid = s.id || `live-${idx}`;
  const leadTime = s.leadTime || '';
  const platforms = Array.isArray(s.platforms) ? s.platforms : [];

  return `
  <div class="card supplier-card" style="margin-bottom:12px; animation: fadeIn 0.3s ease ${Math.min(idx * 0.06, 0.5)}s both;">
    <div class="supplier-header">
      <div style="flex:1;min-width:0;">
        <h3 style="margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${safeAttr(s.name)}
          ${source ? `<span class="tag tag-accent" style="font-size:10px;padding:2px 6px;font-weight:500;">${safeAttr(source)}</span>` : ''}
        </h3>
        <div class="saved-meta" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
          <span class="tag ${typeClass}">${safeAttr(s.type || 'Supplier')}</span>
          ${location ? `<span class="tag tag-gray">${flag} ${safeAttr(location)}</span>` : ''}
          ${moqVal !== '—' ? `<span class="moq-badge">MOQ ${formatNumber(moqVal)} ${safeAttr(moqUnit)}</span>` : ''}
          ${price}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:18px;">${_starsHTML(rating)}</div>
        <div class="muted" style="font-size:11px;">Rating</div>
      </div>
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-top:8px;line-height:1.7;">
      ${products.length ? `<strong>Products:</strong> ${products.map(p => safeAttr(p)).join(', ')}<br>` : ''}
      ${contact ? `<strong>Contact:</strong> ${safeAttr(contact)}<br>` : ''}
      ${leadTime ? `<strong>Lead time:</strong> ${safeAttr(leadTime)}<br>` : ''}
      ${platforms.length ? `<strong>Platforms:</strong> ${platforms.map(p => safeAttr(p)).join(', ')}<br>` : ''}
      ${notes ? `<strong>Notes:</strong> ${safeAttr(notes)}` : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      <button class="btn btn-sm" data-action="save-supplier" data-uid="${safeAttr(String(uid))}"
              data-supplier='${safeAttr(JSON.stringify({ name: s.name, country: s.country, type: s.type, city: city, moq: moqVal, rating: rating, contact: contact, source: 'supplier' }))}'>
        Save supplier
      </button>
      ${contact && (contact.includes('@') || contact.includes('http') || contact.includes('www'))
        ? `<a class="btn btn-sm btn-outline" href="${contact.startsWith('http') ? safeAttr(contact) : (contact.includes('@') ? 'mailto:' + safeAttr(contact) : 'https://' + safeAttr(contact))}" target="_blank" rel="noopener">Contact ↗</a>`
        : ''}
    </div>
  </div>`;
}


/* ============================================================
   initSupplierPage()  — Called on page load
   ============================================================ */
async function initSupplierPage() {
  // 1. Populate country filter with ALL 20 countries
  const sel = document.getElementById('supplier-country');
  if (sel) {
    sel.innerHTML = '<option value="all">All countries</option>';
    SUPPLIER_COUNTRIES.forEach(c => {
      const flag = getFlag(c);
      sel.innerHTML += `<option value="${safeAttr(c)}">${flag} ${c}</option>`;
    });
  }

  // 2. Attempt to load initial real-time data
  const container = document.getElementById('supplier-results');
  if (!container) return;

  showSkeleton(container, 4);

  let aiOnline = false;
  try {
    aiOnline = await AIEngine.checkConnection();
  } catch { /* offline */ }

  if (aiOnline) {
    // Fetch AI-suggested featured suppliers for the user's country
    const country = AppState.selectedCountry || 'USA';
    try {
      const prompt = `List 8 real, well-known supplier companies or sourcing platforms that serve e-commerce sellers in ${country}. Include manufacturers, wholesalers, and dropshippers.

Return as JSON array ONLY:
[
  {
    "name": "Company name",
    "type": "Manufacturer" or "Wholesaler" or "Dropshipper" or "Trading Company" or "Distributor",
    "country": "Country where they operate",
    "city": "Main city",
    "moq": minimum order quantity number,
    "rating": rating out of 5 number,
    "products": ["product category 1", "product category 2"],
    "contact": "website URL",
    "notes": "brief description of what they offer",
    "priceRange": "low-high price description",
    "leadTime": "typical lead time"
  }
]

Use real company names and realistic data for 2025-2026.`;

      const raw = await AIEngine.query(prompt, { temperature: 0.6, max_tokens: 4096 });
      const suppliers = AIEngine.parseJSON(raw);

      if (Array.isArray(suppliers) && suppliers.length > 0) {
        const enriched = suppliers.map(s => ({ ...s, _source: 'AI Featured' }));
        container.innerHTML = `
          <div class="ai-badge" style="margin-bottom:12px;">🌐 Featured Suppliers for ${getFlag(country)} ${country}</div>
          ${enriched.map((s, i) => _renderSupplierCard(s, i)).join('')}
          <div class="muted" style="text-align:center;padding:12px;font-size:12px;">
            Powered by AI · Search above to find specific suppliers via live scraping
          </div>`;
        return;
      }
    } catch (e) {
      console.warn('[Suppliers] AI featured load failed:', e);
    }
  }

  // 3. Fallback: show local DB suppliers
  await _loadLocalSuppliers(container);
}


/* ── Fallback: render local DB suppliers ─────────────────── */
async function _loadLocalSuppliers(container) {
  try {
    const suppliers = await getSuppliers({});
    if (suppliers.length > 0) {
      const enriched = suppliers.map(s => ({ ...s, _source: 'Local DB' }));
      container.innerHTML = enriched.map((s, i) => _renderSupplierCard(s, i)).join('');
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏭</div>
          <div class="empty-state-text">No suppliers found. Search for a product to discover suppliers.</div>
        </div>`;
    }
  } catch {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">Could not load suppliers. Try searching for a product above.</div>
      </div>`;
  }
}


/* ============================================================
   doSupplierSearch()  — Real-time search via scraping + AI
   ============================================================ */
async function doSupplierSearch() {
  const query = document.getElementById('supplier-input')?.value?.trim();
  const type = document.getElementById('supplier-type')?.value || 'all';
  const supplierCountry = document.getElementById('supplier-country')?.value || 'all';
  const container = document.getElementById('supplier-results');
  if (!container) return;

  if (!query) {
    // No query → reload page defaults
    await initSupplierPage();
    return;
  }

  showSkeleton(container, 5);
  Toast.info(`🔍 Searching suppliers for "${query}"...`);

  const country = supplierCountry === 'all' ? (AppState.selectedCountry || 'USA') : supplierCountry;
  const countryInfo = _getCountryInfo(country);
  const allSuppliers = [];
  const dataSources = [];

  // ── 1. Live scrape via /api/scrape ────────────────────────
  let scrapePromise = _fetchScrapedSuppliers(query, country, countryInfo.currency);

  // ── 2. AI-generated suppliers ─────────────────────────────
  let aiPromise = _fetchAISuppliers(query, country, countryInfo.currency);

  // ── 3. Local DB suppliers (always available) ──────────────
  let localPromise = getSuppliers({
    search: query.toLowerCase(),
    type: type === 'all' ? undefined : type,
    country: supplierCountry === 'all' ? undefined : supplierCountry,
  });

  // Run all three in parallel
  const [scrapeResult, aiResult, localResult] = await Promise.allSettled([
    scrapePromise, aiPromise, localPromise
  ]);

  // Process scrape results
  if (scrapeResult.status === 'fulfilled' && scrapeResult.value.length > 0) {
    dataSources.push(`Live Scraping (${scrapeResult.value.length})`);
    allSuppliers.push(...scrapeResult.value);
  }

  // Process AI results
  if (aiResult.status === 'fulfilled' && aiResult.value.length > 0) {
    dataSources.push(`AI Intelligence (${aiResult.value.length})`);
    allSuppliers.push(...aiResult.value);
  }

  // Process local DB results
  if (localResult.status === 'fulfilled' && localResult.value.length > 0) {
    dataSources.push(`Local Database (${localResult.value.length})`);
    const localEnriched = localResult.value.map(s => ({ ...s, _source: 'Local DB' }));
    allSuppliers.push(...localEnriched);
  }

  // ── Filter by type if selected ────────────────────────────
  let filtered = allSuppliers;
  if (type && type !== 'all') {
    filtered = allSuppliers.filter(s => {
      const sType = (s.type || '').toLowerCase();
      return sType.includes(type.toLowerCase());
    });
    // If filter yields nothing, keep all
    if (filtered.length === 0) filtered = allSuppliers;
  }

  // ── De-duplicate by name similarity ───────────────────────
  const seen = new Set();
  const unique = filtered.filter(s => {
    const key = (s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 25);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Render ────────────────────────────────────────────────
  if (unique.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏭</div>
        <div class="empty-state-text">No suppliers found for "${safeAttr(query)}". Try a different search term or broaden your filters.</div>
      </div>`;
    return;
  }

  const sourcesBadge = dataSources.length
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">${dataSources.map(src => `<span class="tag tag-accent" style="font-size:11px;">${safeAttr(src)}</span>`).join('')}</div>`
    : '';

  container.innerHTML = `
    ${sourcesBadge}
    <div class="muted" style="margin-bottom:8px;font-size:13px;">Found ${unique.length} supplier${unique.length !== 1 ? 's' : ''} for "<strong>${safeAttr(query)}</strong>" in ${getFlag(country)} ${safeAttr(country)}</div>
    ${unique.map((s, i) => _renderSupplierCard(s, i)).join('')}`;

  Toast.success(`Found ${unique.length} suppliers from ${dataSources.length} source${dataSources.length !== 1 ? 's' : ''}`);
}


/* ── Fetch supplier data from /api/scrape response ───────── */
async function _fetchScrapedSuppliers(query, country, currency) {
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query + ' supplier wholesale', country }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const suppliers = [];

    // Extract supplier data from the combined response
    const combined = data.combined || {};

    // From supplierData block (AI-generated within scrape)
    if (combined.supplierData) {
      const sd = combined.supplierData;
      if (sd.topSources && Array.isArray(sd.topSources)) {
        sd.topSources.forEach(src => {
          suppliers.push({
            name: typeof src === 'string' ? src : (src.name || 'Unknown'),
            type: typeof src === 'object' ? (src.type || 'Wholesaler') : 'Wholesaler',
            country: country,
            city: typeof src === 'object' ? (src.city || '') : '',
            moq: sd.moq || null,
            rating: typeof src === 'object' ? (src.rating || 4.0) : 4.0,
            products: [query],
            contact: typeof src === 'object' ? (src.contact || src.website || '') : '',
            notes: typeof src === 'object' ? (src.description || '') : '',
            price: { wholesale: sd.wholesalePrice, bulk: sd.bulkPrice },
            currency: currency,
            leadTime: sd.leadTime || '',
            _source: 'Live Scrape',
          });
        });
      }
    }

    // From live listings — extract sellers/brands as supplier leads
    if (combined.liveListings && Array.isArray(combined.liveListings)) {
      const sellerMap = new Map();
      combined.liveListings.forEach(listing => {
        const seller = listing.seller || listing.brand || listing.store || '';
        if (seller && !sellerMap.has(seller.toLowerCase())) {
          sellerMap.set(seller.toLowerCase(), {
            name: seller,
            type: 'Retailer / Distributor',
            country: country,
            city: '',
            moq: 1,
            rating: listing.rating || listing.stars || 0,
            products: [listing.name || query],
            contact: listing.url || listing.link || '',
            notes: listing.source ? `Found on ${listing.source}` : '',
            price: listing.price || listing.numericPrice || null,
            currency: currency,
            platforms: listing.source ? [listing.source] : [],
            _source: 'Live Scrape',
          });
        }
      });
      suppliers.push(...sellerMap.values());
    }

    // From competitors
    if (combined.competitors && Array.isArray(combined.competitors)) {
      combined.competitors.forEach(comp => {
        if (comp.name) {
          suppliers.push({
            name: comp.name,
            type: 'Competitor / Seller',
            country: country,
            city: '',
            moq: null,
            rating: 0,
            products: [query],
            contact: '',
            notes: comp.platform ? `Sells on ${comp.platform}` : '',
            price: comp.price || null,
            currency: currency,
            _source: 'Live Scrape',
          });
        }
      });
    }

    return suppliers;
  } catch (e) {
    console.warn('[Suppliers] Scrape fetch failed:', e.message);
    return [];
  }
}


/* ── Fetch AI-generated suppliers ────────────────────────── */
async function _fetchAISuppliers(query, country, currency) {
  try {
    const online = await AIEngine.checkConnection();
    if (!online) return [];

    const prompt = `Find 6 real supplier companies, wholesalers, manufacturers, or sourcing platforms for "${query}" that can serve e-commerce sellers in ${country}.

Return as JSON array ONLY:
[
  {
    "name": "Actual company or platform name",
    "type": "Manufacturer" or "Wholesaler" or "Dropshipper" or "Trading Company",
    "country": "Country they are based in",
    "city": "City",
    "moq": minimum order quantity number,
    "rating": rating out of 5 number (realistic),
    "products": ["specific product 1", "specific product 2"],
    "contact": "website or email",
    "notes": "1-2 sentence description",
    "wholesalePrice": estimated unit price number in ${currency},
    "leadTime": "estimated shipping/lead time"
  }
]

Use real, verifiable supplier names. Include a mix of domestic and international sources. Prices in ${currency}.`;

    const raw = await AIEngine.query(prompt, { temperature: 0.5, max_tokens: 3000 });
    const parsed = AIEngine.parseJSON(raw);

    if (Array.isArray(parsed)) {
      return parsed.map(s => ({
        ...s,
        currency: currency,
        price: s.wholesalePrice || s.price || s.unitPrice || null,
        _source: 'AI Suggested',
      }));
    }

    return [];
  } catch (e) {
    console.warn('[Suppliers] AI supplier fetch failed:', e.message);
    return [];
  }
}


/* ============================================================
   aiSuggestSuppliers()  — Detailed AI sourcing strategies
   ============================================================ */
async function aiSuggestSuppliers() {
  const query = document.getElementById('supplier-input')?.value?.trim();
  if (!query) {
    Toast.warning('Enter a product name to get AI suggestions');
    return;
  }

  const country = AppState.selectedCountry || 'USA';
  const container = document.getElementById('supplier-results');
  if (!container) return;

  // Create or replace the AI results section
  const existing = document.getElementById('ai-supplier-results');
  if (existing) existing.remove();

  const aiDiv = document.createElement('div');
  aiDiv.id = 'ai-supplier-results';
  aiDiv.innerHTML = `
    <div class="card ai-result" style="margin-bottom:16px;">
      <div class="flex-center" style="padding:20px;">
        <div class="spinner"></div>
        <span class="muted" style="margin-left:8px;">AI is analyzing sourcing strategies for "${safeAttr(query)}"...</span>
      </div>
    </div>`;
  container.prepend(aiDiv);

  try {
    const online = await AIEngine.checkConnection();
    if (!online) {
      aiDiv.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <div class="muted" style="padding:16px;">⚠️ AI server not reachable. Start the server with: <code>node server.js</code></div>
        </div>`;
      return;
    }

    const result = await AIEngine.suggestSuppliers(query, country);

    if (!result) {
      aiDiv.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <div class="muted" style="padding:16px;">AI suggestions unavailable. Try again later.</div>
        </div>`;
      return;
    }

    // Render the strategies
    const strategiesHTML = (result.strategies || []).map(s => `
      <div style="padding:12px 0;border-bottom:1px solid var(--border);">
        <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
          <strong style="font-size:14px;">${safeAttr(s.source || '—')}</strong>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span class="tag ${_supplierTypeClass(s.type)}">${safeAttr(s.type || '—')}</span>
          </div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:13px;color:var(--text-secondary);">
          <span>💰 Cost: <strong>${safeAttr(s.estimatedCost || '—')}</strong></span>
          <span>📦 MOQ: <strong>${safeAttr(s.moq || '—')}</strong></span>
          <span>🚚 Lead time: <strong>${safeAttr(s.leadTime || '—')}</strong></span>
        </div>
        ${s.pros && s.pros.length ? `<div style="font-size:12px;color:var(--positive);margin-top:6px;">✓ ${s.pros.map(p => safeAttr(p)).join(' · ')}</div>` : ''}
        ${s.cons && s.cons.length ? `<div style="font-size:12px;color:var(--danger);margin-top:3px;">✕ ${s.cons.map(c => safeAttr(c)).join(' · ')}</div>` : ''}
      </div>
    `).join('');

    const platformsHTML = (result.recommendedPlatforms || []).length
      ? `<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">
           <span class="muted" style="font-size:12px;">Recommended platforms:</span>
           ${result.recommendedPlatforms.map(p => `<span class="platform-pill">${safeAttr(p)}</span>`).join('')}
         </div>`
      : '';

    const tipHTML = result.tip
      ? `<div style="padding:10px;border-radius:var(--radius-sm);background:var(--accent-soft);font-size:13px;color:var(--accent-hover);margin-top:12px;">
           💡 <strong>Pro Tip:</strong> ${safeAttr(result.tip)}
         </div>`
      : '';

    aiDiv.innerHTML = `
      <div class="card ai-result" style="margin-bottom:16px;">
        <div class="ai-badge" style="margin-bottom:12px;">🧠 AI Sourcing Strategies — ${safeAttr(query)} in ${getFlag(country)} ${safeAttr(country)}</div>
        ${strategiesHTML}
        ${platformsHTML}
        ${tipHTML}
      </div>`;

    Toast.success('AI sourcing analysis complete');

  } catch (e) {
    console.error('[Suppliers] AI suggest failed:', e);
    aiDiv.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <div class="muted" style="padding:16px;">⚠️ AI analysis failed: ${safeAttr(e.message || 'Unknown error')}</div>
      </div>`;
  }
}


/* ============================================================
   Event delegation — Save supplier button
   ============================================================ */
document.addEventListener('click', async function(e) {
  const btn = e.target.closest('[data-action="save-supplier"]');
  if (!btn) return;

  let supplierData = null;

  // Try data-supplier JSON attribute first (for live/AI suppliers)
  const jsonAttr = btn.dataset.supplier;
  if (jsonAttr) {
    try {
      supplierData = JSON.parse(jsonAttr);
    } catch { /* fall through */ }
  }

  // Fallback: lookup in local DB by ID
  if (!supplierData) {
    const uid = btn.dataset.uid || btn.dataset.id;
    if (uid && !uid.startsWith('live-')) {
      const id = parseInt(uid);
      if (!isNaN(id)) {
        try {
          const supplier = await db.suppliers.get(id);
          if (supplier) {
            supplierData = {
              name: supplier.name,
              country: supplier.country,
              type: supplier.type,
              city: supplier.city,
              moq: supplier.moq,
              rating: supplier.rating,
              contact: supplier.contact,
              source: 'supplier',
            };
          }
        } catch { /* continue */ }
      }
    }
  }

  if (!supplierData) {
    Toast.error('Could not read supplier data');
    return;
  }

  // Ensure source field
  supplierData.source = supplierData.source || 'supplier';

  const result = await addSaved(supplierData);

  if (result.success) {
    Toast.success(`Saved supplier "${supplierData.name}"`);
    btn.textContent = '✓ Saved';
    btn.disabled = true;
    btn.style.opacity = '0.6';
  } else {
    Toast.info(result.message || 'Already saved');
  }
});
