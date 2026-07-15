/* ============================================================
   Search & Compare — Crawlee Live Scraping + AI Intelligence
   v2.5 — SQLite Persistent + Paginated + URL Reverse Lookup
   ============================================================ */

window._searchPage = 1;
window._searchPerPage = 20;
window._searchLoading = false;
window._searchHasMore = true;
window._searchPrefetched = {};
window._searchListings = {};
window._currentSearchQuery = '';

async function doSearch() {
  const query = document.getElementById('search-input')?.value?.trim();
  const container = document.getElementById('search-results');
  if (!container) return;

  if (!query) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div>
      <div class="empty-state-text">Search any product — we'll scrape Amazon, Google Shopping, Flipkart, eBay in real time</div></div>`;
    return;
  }

  // URL reverse tracking check
  if (query.startsWith('http://') || query.startsWith('https://')) {
    await handleUrlReverseTrack(query, container);
    return;
  }

  // Reset pagination state
  window._searchPage = 1;
  window._searchHasMore = true;
  window._searchPrefetched = {};
  window._searchListings = {};
  window._currentSearchQuery = query;

  await runSearchPage(false);
  await addSearchHistory(query, AppState.selectedCountry);
  window._isAISearch = false;
}

/* ── URL Reverse Track Extraction ─────────────────────────── */
async function handleUrlReverseTrack(url, container) {
  container.innerHTML = `
    <div class="flex-center" style="padding:50px;flex-direction:column;gap:14px;">
      <div class="spinner"></div>
      <strong>Reverse tracking product from URL...</strong>
      <div class="muted" style="font-size:12px;">Scraping page content and extracting details via AI...</div>
    </div>`;
  try {
    const res = await lookupProductFromURL(url);
    container.innerHTML = '';
    if (res && res.product) {
      const prod = res.product;
      const currency = AppState.displayCurrency;
      const convertedPrice = prod.price ? CurrencyEngine.convert(prod.price, prod.currency || currency, currency) : 0;
      
      // Store in listings map for compatibility
      if (!window._searchListings) window._searchListings = {};
      const key = `lookup-${Date.now()}`;
      window._searchListings[key] = { ...prod, price: prod.price, currency: prod.currency, platform: res.platform || 'Web' };

      container.innerHTML = `
        <div class="card" style="margin-bottom:16px; border: 1px solid var(--accent); background:linear-gradient(135deg,rgba(99,102,241,0.03),rgba(16,185,129,0.02));">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
            <div>
              <span class="tag tag-accent" style="margin-bottom:8px;display:inline-block;">🔗 Extracted from ${res.platform || 'Web'}</span>
              <h3 style="margin:0;font-size:20px;color:var(--text-primary); cursor:pointer; text-decoration: underline;" data-action="open-search-detail" data-key="${key}">${prod.name || 'Extracted Product'}</h3>
              <div class="muted" style="margin-top:4px;">Category: ${prod.category || 'General'} | Brand: ${prod.brand || 'N/A'}</div>
            </div>
            <div style="text-align:right;">
              <div class="price mono" style="font-size:22px;font-weight:700;color:var(--positive);">${convertedPrice > 0 ? formatPrice(convertedPrice, currency) : '—'}</div>
              <div class="muted" style="font-size:12px;">Price in ${currency}</div>
            </div>
          </div>
          
          <p style="margin:16px 0;line-height:1.5;color:var(--text-secondary);">${prod.description || 'No description found.'}</p>
          
          <div class="grid-3 mt-sm" style="margin-bottom:16px;">
            <div class="stat-box"><div class="stat-value">${prod.rating ? prod.rating + '★' : '—'}</div><div class="stat-label">Rating</div></div>
            <div class="stat-box"><div class="stat-value">${prod.reviews ? fmtNum(prod.reviews) : '—'}</div><div class="stat-label">Reviews</div></div>
            <div class="stat-box"><div class="stat-value">${prod.inStock ? '✅ In Stock' : '❌ Out of Stock'}</div><div class="stat-label">Stock Status</div></div>
          </div>

          ${prod.keyFeatures && prod.keyFeatures.length ? `
            <div style="margin-bottom:16px;">
              <strong>Key Features:</strong>
              <ul style="margin:8px 0 0 20px;padding:0;color:var(--text-secondary);">
                ${prod.keyFeatures.map(f => `<li>${f}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <a href="${url}" target="_blank" class="btn btn-sm" style="background:var(--accent-soft);color:var(--accent);text-decoration:none;display:inline-flex;align-items:center;height:36px;">↗ View Page</a>
            <button class="btn btn-sm btn-primary" id="btn-save-extracted" style="height:36px;">💾 Save to My List</button>
            <button class="btn btn-sm" style="background:rgba(99,102,241,0.12);color:var(--accent);height:36px;" data-action="open-search-detail" data-key="${key}">📊 Full Analysis</button>
          </div>
        </div>
      `;
      
      // Bind save
      document.getElementById('btn-save-extracted')?.addEventListener('click', async () => {
        const r = await addSaved({
          name: prod.name,
          category: prod.category || '',
          platform: res.platform || 'Web',
          country: AppState.selectedCountry || 'India',
          sp: prod.price || 0,
          currency: prod.currency || 'INR',
          margin: prod.margin || 25,
          demand: prod.demand || 60,
          winnerScore: computeWinnerScore({ demand: prod.demand || 60, margin: prod.margin || 25, competition: prod.competition || 'Medium', platformCount: 1 }),
          source: 'search'
        });
        if (r.success) {
          Toast.success(`Saved "${prod.name}"`);
          const btn = document.getElementById('btn-save-extracted');
          if (btn) { btn.textContent = '✓ Saved'; btn.disabled = true; }
        } else {
          Toast.info(r.message);
        }
      });
    } else {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to parse product. Make sure the URL is a valid store page.</div></div>`;
    }
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-text">Reverse track failed: ${e.message}</div></div>`;
  }
}

/* ── Paginated Search ─────────────────────────────────────── */
async function prefetchNextSearchPage(query, country, page, perPage) {
  if (window._searchPrefetched[page]) return;
  try {
    const res = await fetch('/api/search/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, country, page, perPage }),
    });
    if (res.ok) {
      window._searchPrefetched[page] = await res.json();
    }
  } catch(e) { /* ignore */ }
}

let _searchObserver = null;
function initSearchObserver() {
  const trigger = document.getElementById('search-loading-trigger');
  if (!trigger) return;
  if (_searchObserver) _searchObserver.disconnect();
  _searchObserver = new IntersectionObserver(async (entries) => {
    if (entries[0].isIntersecting && !window._searchLoading && window._searchHasMore) {
      window._searchPage++;
      console.log(`[Search] Scroll triggered. Loading page ${window._searchPage}`);
      await runSearchPage(true);
    }
  }, { rootMargin: '150px' });
  _searchObserver.observe(trigger);
}

async function runSearchPage(append = false) {
  const query = window._currentSearchQuery;
  const container = document.getElementById('search-results');
  if (!container) return;

  const country = AppState.selectedCountry;
  const currency = AppState.displayCurrency;
  const limit = parseInt(document.getElementById('search-limit')?.value || '20');

  window._searchPerPage = limit;

  let trigger = document.getElementById('search-loading-trigger');
  if (!trigger) {
    trigger = document.createElement('div');
    trigger.id = 'search-loading-trigger';
    trigger.style = 'text-align:center;padding:16px;color:var(--text-secondary);font-size:13px;display:none;';
    trigger.innerHTML = `<div class="spinner" style="margin:0 auto 8px;"></div>Loading more products...`;
    container.parentNode.appendChild(trigger);
  }

  if (!append) {
    container.innerHTML = `
      <div class="flex-center" style="padding:50px;flex-direction:column;gap:14px;">
        <div class="spinner"></div>
        <strong>Searching for "${query}"...</strong>
      </div>`;
  } else {
    trigger.style.display = 'block';
  }

  const aiOnline = await AIEngine.checkConnection();
  if (aiOnline) {
    window._searchLoading = true;
    try {
      let data = null;
      if (window._isAISearch) {
        const response = await fetch('/api/search/opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, country }),
        });
        if (!response.ok) throw new Error('AI Search failed');
        data = await response.json();
      } else if (window._searchPrefetched[window._searchPage]) {
        data = window._searchPrefetched[window._searchPage];
        delete window._searchPrefetched[window._searchPage];
      } else {
        const response = await fetch('/api/search/page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, country: country === 'all' ? 'USA' : country, page: window._searchPage, perPage: limit }),
        });
        if (!response.ok) throw new Error('Search failed');
        data = await response.json();
      }

      window._searchHasMore = window._isAISearch ? false : !!data.hasMore;
      const listings = data.items || [];

      if (!append) container.innerHTML = '';

      if (window._isAISearch) {
        window._lastSearchOpportunities = listings;
        if (listings.length === 0) {
          container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🤖</div>
            <div class="empty-state-text">No target variants discovered by AI deep search. Try a different query.</div></div>`;
          window._searchLoading = false;
          return;
        }

        let html = `
          <div class="card" style="margin-bottom:16px;">
            <div class="flex-between" style="margin-bottom:12px;">
              <div class="section-title" style="color:var(--accent);">🤖 AI Research Insights & Ranked Opportunities</div>
              <div class="muted" style="font-size:12px;">Found ${listings.length} target variants across multiple marketplaces</div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product Opportunity</th>
                    <th>Winner Score</th>
                    <th>Demand</th>
                    <th>Margin</th>
                    <th>Sourcing</th>
                    <th>Platforms</th>
                    <th>Avg Price</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
        `;

        html += listings.map((p, i) => {
          const score = p.hero_score || p.provisional_score || 50;
          const demand = p.demand_velocity || 50;
          const margin = p.margin_quality || 30;
          const sp = p.avg_retail_price || p.price || 0;
          const cp = p.avg_cost_price || p.supplier_cost || 0;

          const isSaved = _isProductSaved(p.canonical_name || p.name);
          const rowBg = isSaved ? 'background:rgba(34,197,94,0.06);' : (score >= 75 ? 'background:rgba(255,107,53,0.04);' : '');
          const savedBadge = isSaved ? ' <span class="tag" style="font-size:9px;background:rgba(34,197,94,0.15);color:#22c55e;">✓ Saved</span>' : '';
          
          const specParts = [p.brand, p.size, p.variant, p.material].filter(Boolean).join(', ');
          const specText = specParts ? `<div class="muted" style="font-size:10.5px;margin-top:2px;">Attributes: ${specParts}</div>` : '';

          const supplierText = p.supplier_name 
            ? `<div style="font-weight:600;font-size:11.5px;color:var(--text-primary);">${safeAttr(p.supplier_name)}</div>
               <div class="muted" style="font-size:10px;">Landed: ${formatPrice(cp, currency)}</div>`
            : `<div class="muted" style="font-size:11px;">No active supplier</div>`;

          let sources = [];
          try {
            sources = typeof p.source_set === 'string' ? JSON.parse(p.source_set) : (p.source_set || [p.source || 'unknown']);
          } catch(e) { sources = [p.source || 'unknown']; }
          const sourcePills = sources.map(src => {
            const label = src.charAt(0).toUpperCase() + src.slice(1);
            return `<span class="tag" style="font-size:9px;padding:1px 4px;margin-right:2px;">${label}</span>`;
          }).join('');

          const saveBtn = isSaved
            ? `<button class="btn btn-sm" disabled style="opacity:0.5;cursor:default;">✓ Saved</button>`
            : `<button class="btn btn-sm" onclick="saveSearchOpportunity(${i})">Save</button>`;

          return `
            <tr style="${rowBg}">
              <td>
                <div style="font-weight:600;color:var(--text-primary);">${safeAttr(p.canonical_name || p.name)}</div>
                ${specText}
                ${savedBadge}
              </td>
              <td>${scoreBadge(score, p)}</td>
              <td>${demandBar(demand)}</td>
              <td class="positive-text mono">${margin}%</td>
              <td>${supplierText}</td>
              <td>${sourcePills}</td>
              <td class="price mono">${formatPrice(sp, currency)}</td>
              <td>${saveBtn}</td>
            </tr>
          `;
        }).join('');

        html += `
                </tbody>
              </table>
            </div>
          </div>
        `;
        container.innerHTML = html;
        window._searchLoading = false;
        return;
      }

      if (listings.length > 0) {
        // Group by platform to keep clean results
        const byPlatform = {};
        listings.forEach(l => {
          const p = l.platform || 'Other';
          if (!byPlatform[p]) byPlatform[p] = [];
          byPlatform[p].push(l);
        });

        for (const [platform, items] of Object.entries(byPlatform)) {
          const icon = platform.includes('Amazon') ? '📦' : platform.includes('Google') ? '🔍' : platform.includes('Flipkart') ? '🛒' : platform.includes('eBay') ? '🏷️' : '🌐';
          
          let platCard = container.querySelector(`[data-platform-section="${platform}"]`);
          let tbody;
          if (!platCard) {
            platCard = document.createElement('div');
            platCard.className = 'card';
            platCard.style.marginBottom = '16px';
            platCard.setAttribute('data-platform-section', platform);
            platCard.innerHTML = `
              <div class="flex-between" style="margin-bottom:12px;">
                <div class="section-title">${icon} ${platform}</div>
              </div>
              <div class="table-wrap">
                <table><thead><tr>
                  <th>Product</th><th>Price</th><th>Rating</th><th>Reviews</th><th>Source</th><th>Action</th>
                </tr></thead><tbody class="results-tbody"></tbody></table>
              </div>`;
            container.appendChild(platCard);
          }
          tbody = platCard.querySelector('.results-tbody');

          items.forEach((l, li) => {
            const price = l.price ? CurrencyEngine.convert(l.price, l.currency || currency, currency) : 0;
            const badge = l.bestSeller ? '<span class="tag tag-amber" style="font-size:10px;">Best Seller</span> ' : '';
            const sponsored = l.sponsored ? '<span class="muted" style="font-size:10px;">(Ad)</span>' : '';
            
            const listKey = `search-${window._searchPage}-${platform}-${li}`;
            if (!window._searchListings) window._searchListings = {};
            window._searchListings[listKey] = { ...l, platform };

            const row = document.createElement('tr');
            row.innerHTML = `
              <td style="max-width:280px;white-space:normal;">${badge}<span
                class="search-product-name"
                data-action="open-search-detail"
                data-key="${listKey}"
                title="Click for full analysis"
                style="cursor:pointer;border-bottom:1px dashed var(--accent);color:var(--text-primary);font-weight:600;"
                onmouseover="this.style.color='var(--accent)'"
                onmouseout="this.style.color='var(--text-primary)'"
              >${l.name || '\u2014'}</span> ${sponsored}</td>
              <td class="price mono"><strong>${price > 0 ? formatPrice(price, currency) : (l.priceFormatted || '\u2014')}</strong></td>
              <td class="mono">${l.rating ? l.rating+'\u2605' : '\u2014'}</td>
              <td class="mono">${l.reviews ? fmtNum(l.reviews) : '\u2014'}</td>
              <td class="muted" style="font-size:11px;">${l.url ? `<a href="${l.url}" target="_blank" style="color:var(--accent);font-size:10px;">\u2197 ${l.source||'View'}</a>` : (l.source||'')}</td>
              <td><button class="btn btn-sm" data-action="save-search-live" data-key="${listKey}">Save</button></td>
            `;
            tbody.appendChild(row);
          });
        }

        renderSearchPagination(query, country);
      } else if (!append) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No results found.</div></div>`;
        const existingPager = document.getElementById('search-pagination-bar');
        if (existingPager) existingPager.remove();
      }

      // Prefetch next page in background
      if (window._searchHasMore) {
        prefetchNextSearchPage(query, country, window._searchPage + 1, limit);
      }

    } catch(e) {
      console.error(e);
      if (!append) await doLocalSearch(query, country, currency, container);
    } finally {
      window._searchLoading = false;
      if (trigger) trigger.style.display = 'none';
    }
  } else {
    if (!append) await doLocalSearch(query, country, currency, container);
    if (trigger) trigger.style.display = 'none';
  }
}

/* ── Button handler ──────────────────────────────────────── */
async function aiSmartSearch() {
  window._isAISearch = true;
  await doSearch();
}

/* ── Helpers ─────────────────────────────────────────────── */
function fmtNum(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

/* ── Local Fallback ──────────────────────────────────────── */
async function doLocalSearch(query, country, currency, container) {
  const products = await getProducts({
    country: country === 'all' ? undefined : country,
    search: query,
  });
  if (products.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">No results found in local offline database.</div></div>`;
    return;
  }
  container.innerHTML = '<div class="section-title">Local Database (offline)</div>';
  for (const p of products.slice(0, 10)) {
    container.innerHTML += await renderSearchCard(p, await getPlatforms(p.country), currency);
  }
}

/* ── Render local card ───────────────────────────────────── */
async function renderSearchCard(product, platforms, currency) {
  const pc = product.currency || 'USD';
  const rows = platforms.map(p => {
    const sp = CurrencyEngine.convert(product.supplierPrice * 3 || 0, pc, p.currency || pc);
    const fee = sp * (p.feeRef || 0.12) + (p.closing || 0) + (p.ship || 0);
    const cost = CurrencyEngine.convert(product.supplierPrice || 0, pc, p.currency || pc) + fee + 12;
    const profit = sp - cost - (sp * 0.05);
    const margin = sp > 0 ? ((profit / sp) * 100).toFixed(1) : '0';
    const cls = profit > 0 ? 'positive-text' : 'danger-text';
    return `<tr><td><span class="platform-pill">${p.name}</span></td><td class="price mono">${formatPrice(CurrencyEngine.convert(sp, p.currency||pc, currency), currency)}</td><td class="price mono ${cls}">${formatPrice(CurrencyEngine.convert(profit, p.currency||pc, currency), currency)}</td><td class="${cls} mono">${margin}%</td></tr>`;
  });
  return `<div class="card" style="margin-bottom:12px;"><h3 style="margin:0;">${product.name}</h3><div class="muted">${product.category||''} · ${getFlag(product.country)} ${product.country}</div>${rows.length ? `<div class="table-wrap mt-sm"><table><thead><tr><th>Platform</th><th>Sell</th><th>Profit</th><th>Margin</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : ''}</div>`;
}

/* ── Unified Search Handler — Fixed event listener accumulation ─────────────────────────────────────── */
// IMPORTANT: Only bind this ONCE at page load, not on every render
if (!window._searchHandlerBound) {
  window._searchHandlerBound = true;
  
  document.addEventListener('click', async function(e) {
   // Handle: Save from seeded products
   const saveSeedBtn = e.target.closest('[data-action="save-search"]');
   if (saveSeedBtn) {
     try {
       const id = parseInt(saveSeedBtn.dataset.productId);
       const product = await getLocalProductById(id);
       if (!product) {
         Toast.error('Product not found');
         return;
       }
       const r = await addSaved({
         name: product.name,
         country: product.country,
         category: product.category,
         sp: product.supplierPrice,
         currency: product.currency,
         margin: product.margin || 0,
         source: 'search'
       });
       if (r.success) {
         Toast.success(`Saved "${product.name}"`);
         saveSeedBtn.textContent = '✓ Saved';
         saveSeedBtn.disabled = true;
       } else {
         Toast.info(r.message || 'Save failed');
       }
     } catch (err) {
       console.error('[Search Save] Error:', err);
       Toast.error('Failed to save: ' + (err.message || 'Unknown error'));
     }
     return;
   }

   // Handle: Save from live search results
   const saveLiveBtn = e.target.closest('[data-action="save-search-live"]');
   if (saveLiveBtn) {
     try {
       const key = saveLiveBtn.dataset.key;
       const listing = window._searchListings?.[key];
       if (!listing) {
         Toast.warning('Listing not found in cache');
         return;
       }
       const r = await addSaved({
         name:     listing.name || 'Product',
         category: listing.category || '',
         platform: listing.platform || '',
         country:  AppState.selectedCountry || 'India',
         sp:       listing.price || 0,
         currency: listing.currency || AppState.displayCurrency,
         margin:   listing.margin || 0,
         source:   'search',
       });
       if (r?.success !== false) {
         Toast.success(`Saved "${listing.name}"`);
         saveLiveBtn.textContent = '✓ Saved';
         saveLiveBtn.disabled = true;
         saveLiveBtn.style.opacity = '0.6';
       } else {
         Toast.info(r.message || 'Already saved');
       }
     } catch (err) {
       console.error('[Search Live Save] Error:', err);
       Toast.error('Failed to save: ' + (err.message || 'Unknown error'));
     }
     return;
   }

   // Handle: Open product detail from search results
   const detailBtn = e.target.closest('[data-action="open-search-detail"]');
   if (detailBtn) {
     try {
       const key = detailBtn.dataset.key;
       const listing = window._searchListings?.[key];
       if (!listing) {
         Toast.warning('Listing not found');
         return;
       }
       // Build a product-like object compatible with openProductDetail()
       const p = {
         name:         listing.name || 'Product',
         category:     listing.category || '',
         platform:     listing.platform || '',
         price:        listing.price || 0,
         currency:     listing.currency || AppState.displayCurrency,
         demand:       listing.demand || 60,
         margin:       listing.margin || 0,
         competition:  listing.competition || 'Medium',
         platformCount: 1,
         _winnerScore: computeWinnerScore({ demand: listing.demand || 60, margin: listing.margin || 0, competition: listing.competition || 'Medium', platformCount: 1 }),
       };
       if (typeof openProductDetail === 'function') {
         openProductDetail(p);
       } else {
         Toast.error('Detail viewer not available');
       }
     } catch (err) {
       console.error('[Search Detail] Error:', err);
       Toast.error('Failed to open product detail');
     }
     return;
   }
  });
}

/* ── Image Search Upload Handlers ───────────────────────── */
async function handleImageSearchFile(input) {
  const file = input.files?.[0];
  if (!file) return;

  const previewContainer = document.getElementById('search-image-preview-container');
  const previewImg = document.getElementById('search-image-preview');
  const tagEl = document.getElementById('search-image-tags');
  const searchInput = document.getElementById('search-input');

  if (previewContainer && previewImg && tagEl) {
    previewContainer.style.display = 'flex';
    previewImg.src = URL.createObjectURL(file);
    tagEl.textContent = '⏳ AI is detecting object details (YOLOv8)...';
    tagEl.style.color = 'var(--text-secondary)';
  }

  try {
    const response = await fetch('/api/search/upload', {
      method:  'POST',
      headers: {
        'X-File-Name': file.name,
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Upload failed (status ${response.status})`);
    }

    const data = await response.json();
    if (data.success) {
      const obj = data.detected_object || 'product';
      const col = data.color || '';
      const pat = data.pattern || '';
      const query = data.query || obj;

      if (tagEl) {
        let tagStr = '';
        if (col) tagStr += `🎨 ${col.toUpperCase()} `;
        if (pat && pat !== 'solid') tagStr += `· 📐 ${pat} `;
        tagStr += `· 🎒 detected ${obj.toUpperCase()}`;
        tagEl.textContent = tagStr;
        tagEl.style.color = 'var(--accent)';
      }

      if (searchInput) {
        searchInput.value = query;
      }

      Toast.success(`Image analysis finished: detected ${obj}`);
      // Trigger search automatically
      doSearch();
    } else {
      throw new Error(data.error || 'Unknown analysis error');
    }
  } catch (err) {
    console.error('[ImageSearch]', err);
    if (tagEl) {
      tagEl.textContent = `❌ Detection failed: ${err.message}`;
      tagEl.style.color = 'var(--danger)';
    }
    Toast.error('Failed to analyze image: ' + err.message);
  }
}

function clearImageSearch() {
  const fileInput = document.getElementById('search-image-file');
  const previewContainer = document.getElementById('search-image-preview-container');
  const searchInput = document.getElementById('search-input');
  if (fileInput) fileInput.value = '';
  if (previewContainer) previewContainer.style.display = 'none';
  if (searchInput) searchInput.value = '';
}

async function saveSearchOpportunity(idx) {
  const p = window._lastSearchOpportunities[idx];
  if (!p) return;
  
  const savedItem = {
    name: p.canonical_name || p.name,
    category: p.category || 'General',
    platform: (typeof p.source_set === 'string' ? JSON.parse(p.source_set) : (p.source_set || ['Amazon']))[0] || 'Amazon',
    country: AppState.selectedCountry || 'India',
    sp: p.avg_retail_price || p.price || 0,
    cp: p.avg_cost_price || p.supplier_cost || 0,
    currency: p.currency || 'INR',
    margin: p.margin_quality || 30,
    demand: p.demand_velocity || 50,
    winner_score: p.hero_score || p.provisional_score || 50,
    moq: 50,
    source: 'search_opportunity',
    note: `Discovered via parallel AI deep search for: "${window._currentSearchQuery}"`
  };

  try {
    const success = await addSaved(savedItem);
    if (success) {
      Toast.success(`Successfully saved "${savedItem.name}" to saved products list!`);
      // Refresh current search results to update "Saved" status
      window._isAISearch = true;
      await runSearchPage(false);
    }
  } catch (err) {
    Toast.error('Failed to save product: ' + err.message);
  }
}

// Bind to window to allow inline onclick trigger in HTML
window.aiSmartSearch = aiSmartSearch;
window.saveSearchOpportunity = saveSearchOpportunity;

function renderSearchPagination(query, country) {
  if (window._isAISearch) {
    const existingPager = document.getElementById('search-pagination-bar');
    if (existingPager) existingPager.remove();
    return;
  }

  const container = document.getElementById('search-results');
  if (!container) return;

  // Remove existing pager if any
  const existingPager = document.getElementById('search-pagination-bar');
  if (existingPager) existingPager.remove();

  const pager = document.createElement('div');
  pager.id = 'search-pagination-bar';
  pager.className = 'flex-center mt-md';
  pager.style.gap = '8px';
  pager.style.padding = '20px 0';

  const currentPage = window._searchPage || 1;

  // Prev Button
  const prevBtn = document.createElement('button');
  prevBtn.className = `btn btn-sm ${currentPage <= 1 ? 'disabled' : ''}`;
  prevBtn.textContent = '◀ Prev';
  prevBtn.style.padding = '6px 12px';
  prevBtn.onclick = () => {
    if (currentPage > 1) {
      window._searchPage = currentPage - 1;
      runSearchPage(false);
    }
  };
  pager.appendChild(prevBtn);

  // Render pages 1 to 5
  for (let p = 1; p <= 5; p++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `btn ${currentPage === p ? 'btn-primary' : 'btn-secondary'} btn-sm`;
    pageBtn.textContent = p;
    pageBtn.style.padding = '6px 12px';
    pageBtn.onclick = () => {
      window._searchPage = p;
      runSearchPage(false);
    };
    pager.appendChild(pageBtn);
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = `btn btn-sm ${!window._searchHasMore ? 'disabled' : ''}`;
  nextBtn.textContent = 'Next ▶';
  nextBtn.style.padding = '6px 12px';
  nextBtn.onclick = () => {
    if (window._searchHasMore) {
      window._searchPage = currentPage + 1;
      runSearchPage(false);
    }
  };
  pager.appendChild(nextBtn);

  container.appendChild(pager);
}

window.renderSearchPagination = renderSearchPagination;
