/* ============================================================
   Cost Calculator Page — Enhanced with Live Market Intelligence
   ============================================================ */

/* ── Debounce timer for live market price ─────────────────── */
let _marketPriceTimer = null;
let _marketComparisonTimer = null;

/* ── Attach debounced listeners on first call ─────────────── */
let _calcListenersBound = false;
function _bindCalcListeners() {
  if (_calcListenersBound) return;
  _calcListenersBound = true;

  const nameInput = document.getElementById('calc-product-name');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      const query = nameInput.value.trim();

      // Debounced live market price (1s)
      clearTimeout(_marketPriceTimer);
      if (query.length >= 3) {
        _marketPriceTimer = setTimeout(() => fetchLiveMarketPrice(), 1000);
      }

      // Debounced market comparison (1.5s) — slightly longer to avoid double-fire
      clearTimeout(_marketComparisonTimer);
      if (query.length >= 3) {
        _marketComparisonTimer = setTimeout(() => _fetchMarketComparison(query), 1500);
      }
    });
  }
}

/* ============================================================
   1. initCalculator() — Live platform fees from AI, fallback
      to local getPlatforms() if offline
   ============================================================ */
async function initCalculator() {
  const country = AppState.selectedCountry;
  const sel = document.getElementById('calc-platform');

  // Bind debounced listeners for product name input
  _bindCalcListeners();

  // Try fetching live platform fee data from AI if online
  let usedLive = false;
  try {
    const online = await AIEngine.checkConnection();
    if (online && sel) {
      const countryName = country === 'all' ? 'USA' : country;
      const countryConf = (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country]) ? COUNTRY_CONFIG[country] : null;
      const curr = countryConf?.currency || AppState.displayCurrency || 'USD';

      const prompt = `List the current e-commerce platform fees for selling in ${countryName}. For each platform return a JSON array:
[
  {
    "name": "Platform Name",
    "id": "platform_slug",
    "feeRef": referral/commission fee as a decimal (e.g. 0.15 for 15%),
    "closing": fixed closing fee per order in ${curr} (number),
    "ship": average shipping fee per order in ${curr} (number),
    "currency": "${curr}"
  }
]
Include ALL major e-commerce platforms for ${countryName} (e.g. Amazon, Flipkart, eBay, Shopee, Meesho, etc. as applicable).
Use accurate 2025-2026 fee structures. Return ONLY JSON array.`;

      const raw = await AIEngine.query(prompt, { temperature: 0.3, max_tokens: 2048 });
      const livePlatforms = AIEngine.parseJSON(raw);

      if (Array.isArray(livePlatforms) && livePlatforms.length > 0) {
        sel.innerHTML = livePlatforms.map(p =>
          `<option value="${p.id || p.name}" data-fee="${p.feeRef || 0.12}" data-closing="${p.closing || 0}" data-ship="${p.ship || 0}" data-currency="${p.currency || curr}">${p.name}${p.feeRef ? ' (' + Math.round(p.feeRef * 100) + '% fee)' : ''}</option>`
        ).join('');
        sel.innerHTML += '<option value="own">Own website (2% payment gateway)</option>';
        usedLive = true;
        Toast.info('📡 Live platform fees loaded via AI');
      }
    }
  } catch (err) {
    console.warn('[Calculator] Live fee fetch failed, falling back to local DB:', err.message);
  }

  // Fallback: local database
  if (!usedLive) {
    const platforms = await getPlatforms(country === 'all' ? undefined : country);
    if (sel && platforms.length > 0) {
      sel.innerHTML = platforms.map(p =>
        `<option value="${p.id}" data-fee="${p.feeRef}" data-closing="${p.closing}" data-ship="${p.ship}" data-currency="${p.currency}">${p.name}</option>`
      ).join('');
      sel.innerHTML += '<option value="own">Own website (2% payment gateway)</option>';
    }
  }

  // Update tax label based on country
  const countryConf = (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country]) ? COUNTRY_CONFIG[country] : null;
  const taxLabel = document.getElementById('calc-tax-label');
  if (taxLabel && countryConf) {
    taxLabel.textContent = `${countryConf.taxName || 'Tax'} paid to supplier (%)`;
  }
  const taxInput = document.getElementById('calc-gst');
  if (taxInput && countryConf) {
    taxInput.value = countryConf.taxRate || 0;
  }

  runCalc();

  // Feature 5: What-If Simulator
  initSimulator();
}

/* ============================================================
   2. runCalc() — Core calculation + live market comparison
   ============================================================ */
function runCalc() {
  const base = parseFloat(document.getElementById('calc-base')?.value) || 0;
  const moq = parseFloat(document.getElementById('calc-moq')?.value) || 1;
  const inward = parseFloat(document.getElementById('calc-inward')?.value) || 0;
  const gst = parseFloat(document.getElementById('calc-gst')?.value) || 0;
  const itc = document.getElementById('calc-itc')?.value || 'no';
  const sp = parseFloat(document.getElementById('calc-sp')?.value) || 0;
  const pack = parseFloat(document.getElementById('calc-pack')?.value) || 0;
  const ret = parseFloat(document.getElementById('calc-return')?.value) || 0;
  const ad = parseFloat(document.getElementById('calc-ad')?.value) || 0;
  const misc = parseFloat(document.getElementById('calc-misc')?.value) || 0;

  const currency = AppState.displayCurrency;

  // Get platform fees
  const platSel = document.getElementById('calc-platform');
  let platformFee = 0, ship = 0, closing = 0;

  if (platSel && platSel.value !== 'own') {
    const opt = platSel.selectedOptions[0];
    if (opt) {
      const feeRef = parseFloat(opt.dataset.fee) || 0.12;
      closing = parseFloat(opt.dataset.closing) || 0;
      ship = parseFloat(opt.dataset.ship) || 0;
      platformFee = sp * feeRef;
    }
  } else {
    platformFee = sp * 0.02;
    ship = 0;
    closing = 0;
  }

  const gstCost = base * (gst / 100);
  const productLanded = base + inward + (itc === 'no' ? gstCost : 0);
  const returnReserve = (ret / 100) * sp * 0.15 + (ret > 0 ? 5 : 0);
  const totalCost = productLanded + pack + platformFee + closing + ship + returnReserve + ad + misc;
  const profit = sp - totalCost;
  const margin = sp > 0 ? (profit / sp) * 100 : 0;
  const capital = (productLanded + pack) * moq + (sp * moq * 0.3);
  const be = profit > 0 ? Math.ceil(capital / profit) : Infinity;
  const weeks = profit > 0 ? Math.ceil(be / 35) : Infinity;

  // Update results
  const profitEl = document.getElementById('res-profit');
  if (profitEl) {
    profitEl.textContent = formatPrice(profit, currency);
    profitEl.className = 'value ' + (profit >= 0 ? 'positive-text' : 'danger-text');
  }

  const barEl = document.getElementById('bar-profit');
  if (barEl) {
    barEl.style.width = Math.max(0, Math.min(100, margin + 50)) + '%';
    barEl.className = profit >= 0 ? 'progress-fill progress-fill-green' : 'progress-fill progress-fill-red';
  }

  const marginEl = document.getElementById('res-margin');
  if (marginEl) {
    marginEl.textContent = margin.toFixed(1) + '%';
    marginEl.className = 'value ' + (margin >= 30 ? 'positive-text' : margin >= 15 ? '' : 'danger-text');
  }

  const costEl = document.getElementById('res-cost');
  if (costEl) costEl.textContent = formatPrice(totalCost, currency);

  const capEl = document.getElementById('res-capital');
  if (capEl) capEl.textContent = formatPrice(capital, currency);

  const beEl = document.getElementById('res-breakeven');
  if (beEl) beEl.textContent = be === Infinity ? '∞' : formatNumber(be);

  const weeksEl = document.getElementById('res-weeks');
  if (weeksEl) weeksEl.textContent = weeks === Infinity ? '∞' : weeks;

  // Cost breakdown
  const breakdownEl = document.getElementById('calc-breakdown');
  if (breakdownEl) {
    breakdownEl.innerHTML = `
      Product landed (incl. tax if no ITC): ${formatPrice(productLanded, currency)}<br>
      Packaging: ${formatPrice(pack, currency)}<br>
      Platform referral/commission: ${formatPrice(platformFee, currency)}<br>
      Platform closing/fixed: ${formatPrice(closing, currency)}<br>
      Shipping to customer: ${formatPrice(ship, currency)}<br>
      Return & replacement reserve: ${formatPrice(returnReserve, currency)}<br>
      Ad spend: ${formatPrice(ad, currency)}<br>
      Misc: ${formatPrice(misc, currency)}<br>
      <strong>Total cost: ${formatPrice(totalCost, currency)}</strong>
    `;
  }

  // Store last calc for saving
  window._lastCalc = { base, moq, sp, profit, margin, capital, be, totalCost, currency };

  // Ensure the market comparison container exists
  _ensureMarketComparisonContainer();

  // Keep What-If Simulator in sync
  if (typeof updateSimulator === 'function') updateSimulator();
}


/* ── Market Comparison (shown under results) ────────────── */
function _ensureMarketComparisonContainer() {
  if (document.getElementById('market-comparison-container')) return;
  const breakdownCard = document.getElementById('calc-breakdown')?.closest('.card');
  if (breakdownCard) {
    const div = document.createElement('div');
    div.id = 'market-comparison-container';
    div.style.marginTop = '12px';
    breakdownCard.parentNode.insertBefore(div, breakdownCard.nextSibling);
  }
}

async function _fetchMarketComparison(productName) {
  if (!productName || productName.length < 3) return;

  const container = document.getElementById('market-comparison-container');
  if (!container) return;

  const country = AppState.selectedCountry;
  const currency = AppState.displayCurrency;
  const countryName = country === 'all' ? 'USA' : country;

  container.innerHTML = `
    <div class="card" style="margin-top:8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span class="tag tag-accent">📊 Market Comparison</span>
        <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>
        <span class="muted" style="font-size:12px;">Fetching competitor prices...</span>
      </div>
    </div>`;

  try {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: productName, country: countryName }),
    });

    if (!response.ok) throw new Error(`Server error ${response.status}`);
    const data = await response.json();
    const combined = data.combined || {};
    const listings = (combined.liveListings || []).slice(0, 5);

    if (listings.length === 0) {
      container.innerHTML = `
        <div class="card" style="margin-top:8px;">
          <div class="tag tag-accent" style="margin-bottom:6px;">📊 Market Comparison</div>
          <div class="muted" style="font-size:12px;">No competitor listings found for "${productName}".</div>
        </div>`;
      return;
    }

    const sp = parseFloat(document.getElementById('calc-sp')?.value) || 0;

    let rows = listings.map(p => {
      const price = p.price ? CurrencyEngine.convert(p.price, p.currency || currency, currency) : 0;
      const diff = sp > 0 && price > 0 ? ((sp - price) / price * 100).toFixed(1) : null;
      const diffClass = diff !== null ? (parseFloat(diff) > 0 ? 'danger-text' : 'positive-text') : '';
      const diffLabel = diff !== null ? (parseFloat(diff) > 0 ? `+${diff}% higher` : `${diff}% lower`) : '—';

      return `<tr>
        <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.name || ''}">${p.name || '—'}</td>
        <td><span class="tag" style="font-size:10px;">${p.platform || p.source || 'Online'}</span></td>
        <td class="mono" style="font-size:12px;">${price > 0 ? formatPrice(price, currency) : (p.priceFormatted || '—')}</td>
        <td class="${diffClass}" style="font-size:11px;">${diffLabel}</td>
      </tr>`;
    }).join('');

    // Calculate avg market price
    const prices = listings.filter(p => p.price > 0).map(p => CurrencyEngine.convert(p.price, p.currency || currency, currency));
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

    container.innerHTML = `
      <div class="card" style="margin-top:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span class="tag tag-accent">📊 Market Comparison</span>
          ${avgPrice > 0 ? `<span class="muted" style="font-size:11px;">Avg market: <strong>${formatPrice(avgPrice, currency)}</strong></span>` : ''}
        </div>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid var(--border);opacity:0.7;">
            <th style="text-align:left;padding:4px 6px;font-weight:500;">Product</th>
            <th style="text-align:left;padding:4px 6px;font-weight:500;">Source</th>
            <th style="text-align:left;padding:4px 6px;font-weight:500;">Price</th>
            <th style="text-align:left;padding:4px 6px;font-weight:500;">vs. You</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${combined.marketOverview ? `
          <div style="margin-top:8px;padding:8px;border-radius:var(--radius-sm);background:var(--accent-soft);font-size:11px;color:var(--text-secondary);">
            ${combined.marketOverview.competitionLevel ? `Competition: <strong>${combined.marketOverview.competitionLevel}</strong> · ` : ''}
            ${combined.marketOverview.demandScore ? `Demand: <strong>${combined.marketOverview.demandScore}/100</strong>` : ''}
            ${combined.marketOverview.seasonality ? ` · 📅 ${combined.marketOverview.seasonality}` : ''}
          </div>` : ''}
      </div>`;
  } catch (err) {
    console.warn('[Calculator] Market comparison failed:', err.message);
    container.innerHTML = `
      <div class="card" style="margin-top:8px;">
        <div class="tag tag-accent" style="margin-bottom:6px;">📊 Market Comparison</div>
        <div class="muted" style="font-size:12px;">Could not fetch competitor data. Is the server running?</div>
      </div>`;
  }
}


/* ============================================================
   3. saveCalcProduct() — Save to user's list
   ============================================================ */
function saveCalcProduct() {
  const name = document.getElementById('calc-product-name')?.value?.trim() || 'Calculator product';
  const calc = window._lastCalc;
  if (!calc) return;

  const country = AppState.selectedCountry;

  addSaved({
    name: name,
    sp: calc.sp,
    profit: calc.profit,
    margin: parseFloat(calc.margin.toFixed(1)),
    capital: Math.round(calc.capital),
    be: calc.be === Infinity ? '∞' : calc.be,
    totalCost: calc.totalCost,
    currency: calc.currency,
    country: country,
    source: 'calculator',
  }).then(result => {
    if (result.success) {
      Toast.success(`Saved "${name}" to your list`);
    } else {
      Toast.info(result.message);
    }
  });
}


/* ============================================================
   4. aiOptimizePrice() — AI + live scrape data combined
   ============================================================ */
async function aiOptimizePrice() {
  const name = document.getElementById('calc-product-name')?.value?.trim() || 'Product';
  const base = parseFloat(document.getElementById('calc-base')?.value) || 0;
  const country = AppState.selectedCountry;
  const currency = AppState.displayCurrency;
  const platSel = document.getElementById('calc-platform');
  const platform = platSel ? platSel.selectedOptions[0]?.textContent || 'Online' : 'Online';

  const container = document.getElementById('ai-calc-container');
  if (!container) return;

  container.innerHTML = `
    <div class="flex-center" style="flex-direction:column;gap:8px;padding:20px;">
      <div class="spinner"></div>
      <span class="muted">AI is analyzing pricing & scraping live competitor data...</span>
    </div>`;

  // Run AI optimization and live scraping in parallel
  const countryName = country === 'all' ? 'USA' : country;

  const [aiResult, scrapeResult] = await Promise.allSettled([
    AIEngine.optimizePrice({ name, cost: base, currency, platform, country }),
    _safeScrape(name, countryName),
  ]);

  const result = aiResult.status === 'fulfilled' ? aiResult.value : null;
  const scrapeData = scrapeResult.status === 'fulfilled' ? scrapeResult.value : null;

  if (!result && !scrapeData) {
    container.innerHTML = '<div class="muted">AI optimization unavailable and no live data found.</div>';
    return;
  }

  // Extract live pricing stats from scrape
  const listings = scrapeData?.combined?.liveListings || [];
  const livePrices = listings.filter(p => p.price > 0).map(p => CurrencyEngine.convert(p.price, p.currency || currency, currency));
  const liveAvg = livePrices.length > 0 ? livePrices.reduce((a, b) => a + b, 0) / livePrices.length : 0;
  const liveMin = livePrices.length > 0 ? Math.min(...livePrices) : 0;
  const liveMax = livePrices.length > 0 ? Math.max(...livePrices) : 0;

  // Build the recommendation card
  let html = `<div class="card ai-result" style="margin-top:12px;">`;
  html += `<div class="ai-badge" style="margin-bottom:10px;">AI Price Recommendation</div>`;

  if (result) {
    if (result.suggestedPrice) {
      html += `<div class="stat-value positive-text">${formatPrice(result.suggestedPrice, currency)}</div>
               <div class="muted">Suggested selling price</div>`;
    }
    if (result.priceRange) {
      html += `<div class="muted mt-sm">AI range: ${formatPrice(result.priceRange.min, currency)} — ${formatPrice(result.priceRange.max, currency)}</div>`;
    }
    if (result.expectedMargin) {
      html += `<div class="muted">Expected margin: <span class="positive-text">${result.expectedMargin}%</span></div>`;
    }
  }

  // Live data overlay
  if (livePrices.length > 0) {
    html += `
      <div style="margin-top:12px;padding:10px;border-radius:var(--radius-sm);background:var(--surface);border:1px solid var(--border);">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">🕷️ Live Market Data (${livePrices.length} products scraped)</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;">
          <div><span class="muted">Low</span><br><strong>${formatPrice(liveMin, currency)}</strong></div>
          <div><span class="muted">Average</span><br><strong class="positive-text">${formatPrice(liveAvg, currency)}</strong></div>
          <div><span class="muted">High</span><br><strong>${formatPrice(liveMax, currency)}</strong></div>
        </div>
      </div>`;
  }

  if (result?.pricingStrategy) {
    html += `<p style="color:var(--text-secondary);font-size:13px;margin-top:10px;">${result.pricingStrategy}</p>`;
  }

  if (result?.tip) {
    html += `
      <div style="padding:10px;border-radius:var(--radius-sm);background:var(--accent-soft);font-size:13px;color:var(--accent-hover);margin-top:10px;">
        💡 ${result.tip}
      </div>`;
  }

  // Smart suggestion combining AI + live
  if (result?.suggestedPrice && liveAvg > 0) {
    const blended = Math.round((result.suggestedPrice * 0.6 + liveAvg * 0.4) * 100) / 100;
    const sp = parseFloat(document.getElementById('calc-sp')?.value) || 0;
    const yourVsBlended = sp > 0 ? ((sp - blended) / blended * 100).toFixed(1) : null;

    html += `
      <div style="margin-top:10px;padding:10px;border-radius:var(--radius-sm);background:linear-gradient(135deg, var(--accent-soft), transparent);border:1px solid var(--accent);">
        <div style="font-size:12px;font-weight:600;color:var(--accent);">🎯 Smart Price (AI + Live blend)</div>
        <div class="stat-value" style="font-size:20px;margin:4px 0;">${formatPrice(blended, currency)}</div>
        ${yourVsBlended !== null ? `<div class="muted" style="font-size:11px;">Your price is ${parseFloat(yourVsBlended) > 0 ? yourVsBlended + '% above' : Math.abs(parseFloat(yourVsBlended)) + '% below'} this target</div>` : ''}
      </div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}


/* ============================================================
   5. fetchLiveMarketPrice() — Scrape live prices and show
      mini table below the calculator
   ============================================================ */
async function fetchLiveMarketPrice() {
  const nameInput = document.getElementById('calc-product-name');
  const productName = nameInput?.value?.trim();
  if (!productName || productName.length < 3) return;

  const country = AppState.selectedCountry;
  const currency = AppState.displayCurrency;
  const countryName = country === 'all' ? 'USA' : country;

  // Ensure the container exists
  let container = document.getElementById('live-market-prices');
  if (!container) {
    const calcSection = document.getElementById('page-calculator');
    if (!calcSection) return;
    container = document.createElement('div');
    container.id = 'live-market-prices';
    container.style.marginTop = '16px';
    // Insert after the calc-grid
    const calcGrid = calcSection.querySelector('.calc-grid');
    if (calcGrid) {
      calcGrid.parentNode.insertBefore(container, calcGrid.nextSibling);
    } else {
      calcSection.appendChild(container);
    }
  }

  container.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span class="tag tag-green">🔍 Live Market Prices</span>
        <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>
        <span class="muted" style="font-size:12px;">Scraping Amazon, Google Shopping, eBay...</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        ${[1,2,3].map(() => '<div style="height:40px;background:var(--surface);border-radius:var(--radius-sm);animation:pulse 1.5s ease-in-out infinite;"></div>').join('')}
      </div>
    </div>`;

  try {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: productName, country: countryName }),
    });

    if (!response.ok) throw new Error(`Server error ${response.status}`);
    const data = await response.json();
    const combined = data.combined || {};
    const listings = (combined.liveListings || []).slice(0, 10);

    if (listings.length === 0) {
      container.innerHTML = `
        <div class="card">
          <span class="tag tag-green" style="margin-bottom:8px;">🔍 Live Market Prices</span>
          <div class="muted" style="font-size:13px;">No live listings found for "${productName}" in ${countryName}. Try a different product name.</div>
        </div>`;
      return;
    }

    // Build price stats
    const prices = listings.filter(p => p.price > 0).map(p => CurrencyEngine.convert(p.price, p.currency || currency, currency));
    const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const min = prices.length > 0 ? Math.min(...prices) : 0;
    const max = prices.length > 0 ? Math.max(...prices) : 0;

    // Group by platform/source
    const bySource = {};
    listings.forEach(p => {
      const src = p.platform || p.source || 'Other';
      const key = src.replace(/\s*\(.*?\)\s*/g, ''); // strip "(Live)" etc.
      if (!bySource[key]) bySource[key] = [];
      bySource[key].push(p);
    });

    // Build the table rows
    const rows = listings.map(p => {
      const price = p.price ? CurrencyEngine.convert(p.price, p.currency || currency, currency) : 0;
      const src = (p.platform || p.source || 'Online').replace(/\s*\(Live\)\s*/gi, '');
      const rating = p.rating ? `${p.rating}★` : '';
      const reviews = p.reviews ? `(${_fmtCompact(p.reviews)})` : '';

      return `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px;font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.name || ''}">${p.name || '—'}</td>
        <td style="padding:6px;"><span class="tag" style="font-size:10px;">${src}</span></td>
        <td style="padding:6px;font-size:12px;" class="mono">${price > 0 ? formatPrice(price, currency) : (p.priceFormatted || '—')}</td>
        <td style="padding:6px;font-size:11px;color:var(--text-secondary);">${rating} ${reviews}</td>
      </tr>`;
    }).join('');

    // Determine sources
    const sources = Object.keys(bySource);
    const sourceTags = sources.map(s => `<span class="tag" style="font-size:10px;margin:2px;">${s} (${bySource[s].length})</span>`).join('');

    container.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="tag tag-green">🔍 Live Market Prices</span>
            <span class="muted" style="font-size:11px;">${listings.length} products found</span>
          </div>
          <span class="muted" style="font-size:10px;">${new Date(data.timestamp).toLocaleTimeString()}</span>
        </div>

        ${prices.length > 0 ? `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">
          <div style="padding:8px;border-radius:var(--radius-sm);background:var(--surface);text-align:center;">
            <div class="muted" style="font-size:10px;">Lowest</div>
            <div style="font-size:14px;font-weight:600;">${formatPrice(min, currency)}</div>
          </div>
          <div style="padding:8px;border-radius:var(--radius-sm);background:var(--surface);text-align:center;">
            <div class="muted" style="font-size:10px;">Average</div>
            <div style="font-size:14px;font-weight:600;color:var(--accent);">${formatPrice(avg, currency)}</div>
          </div>
          <div style="padding:8px;border-radius:var(--radius-sm);background:var(--surface);text-align:center;">
            <div class="muted" style="font-size:10px;">Highest</div>
            <div style="font-size:14px;font-weight:600;">${formatPrice(max, currency)}</div>
          </div>
          <div style="padding:8px;border-radius:var(--radius-sm);background:var(--surface);text-align:center;">
            <div class="muted" style="font-size:10px;">Sources</div>
            <div style="font-size:14px;font-weight:600;">${sources.length}</div>
          </div>
        </div>` : ''}

        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">
          ${sourceTags}
        </div>

        <div class="table-wrap">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="border-bottom:2px solid var(--border);">
              <th style="text-align:left;padding:6px;font-size:11px;font-weight:600;color:var(--text-secondary);">Product</th>
              <th style="text-align:left;padding:6px;font-size:11px;font-weight:600;color:var(--text-secondary);">Source</th>
              <th style="text-align:left;padding:6px;font-size:11px;font-weight:600;color:var(--text-secondary);">Price</th>
              <th style="text-align:left;padding:6px;font-size:11px;font-weight:600;color:var(--text-secondary);">Rating</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        ${combined.marketOverview ? `
          <div style="margin-top:10px;padding:10px;border-radius:var(--radius-sm);background:var(--accent-soft);font-size:12px;color:var(--text-secondary);">
            <strong>Market Insight:</strong>
            ${combined.marketOverview.competitionLevel ? ` Competition: <strong>${combined.marketOverview.competitionLevel}</strong>` : ''}
            ${combined.marketOverview.demandScore ? ` · Demand: <strong>${combined.marketOverview.demandScore}/100</strong>` : ''}
            ${combined.marketOverview.estimatedMonthlySales ? ` · ~${_fmtCompact(combined.marketOverview.estimatedMonthlySales)} sales/mo` : ''}
            ${combined.marketOverview.seasonality ? `<br>📅 ${combined.marketOverview.seasonality}` : ''}
          </div>` : ''}
      </div>`;

  } catch (err) {
    console.warn('[Calculator] Live market price fetch failed:', err.message);
    container.innerHTML = `
      <div class="card">
        <span class="tag tag-green" style="margin-bottom:8px;">🔍 Live Market Prices</span>
        <div class="muted" style="font-size:13px;">Could not fetch live prices. Make sure the server is running (<code>node server.js</code>).</div>
      </div>`;
  }
}


/* ── Helpers (private to this file) ──────────────────────── */

/** Safe wrapper around /api/scrape — returns null on failure */
async function _safeScrape(query, country) {
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, country }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Compact number formatter: 1234 → "1.2K", 1234567 → "1.2M" */
function _fmtCompact(n) {
  if (!n || isNaN(n)) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

/* ============================================================
   REUSABLE CALCULATION — used by What-If + CSV Import
   ============================================================ */
function calculateProductFull(params) {
  const {
    basePrice = 0, moq = 1, inward = 0, gst = 18, itc = 'no',
    platform = 'amazon', sellingPrice = 0, packaging = 12,
    returnRate = 10, adSpend = 0, misc = 4
  } = params;

  const gstCost = basePrice * (gst / 100);
  const landed  = basePrice + inward + (itc === 'no' ? gstCost : 0);

  let pFee = 0, ship = 0, closing = 0;
  if (platform === 'amazon')   { pFee = sellingPrice * 0.13; closing = 12; ship = 55; }
  else if (platform === 'flipkart') { pFee = sellingPrice * 0.12; ship = 45; }
  else if (platform === 'own') { pFee = sellingPrice * 0.02; ship = 55; }
  else if (platform === 'meesho') { pFee = 0; ship = 0; }

  const retRes    = (returnRate / 100) * sellingPrice * 0.15 + (returnRate > 0 ? 5 : 0);
  const totalCost = landed + packaging + pFee + closing + ship + retRes + adSpend + misc;
  const profit    = sellingPrice - totalCost;
  const margin    = sellingPrice > 0 ? ((profit / sellingPrice) * 100) : 0;
  const capital   = (landed + packaging) * moq + (sellingPrice * moq * 0.3);
  const be        = profit > 0 ? Math.ceil(capital / profit) : Infinity;

  return {
    landed, packaging, pFee, closing, ship, retRes, adSpend, misc,
    totalCost, profit, margin, capital, be,
    weeks: profit > 0 ? Math.ceil(be / 35) : Infinity
  };
}

/* ============================================================
   FEATURE 5 — WHAT-IF SIMULATOR
   ============================================================ */
let _simState = null;

function initSimulator() {
  ['sim-price', 'sim-ret', 'sim-daily', 'sim-ad'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateSimulator);
  });
  document.getElementById('sim-best-price')?.addEventListener('click', findBestPrice);
  updateSimulator(); // initial render
}

function updateSimulator() {
  const baseSp   = parseFloat(document.getElementById('calc-sp')?.value   || 349) || 349;
  const baseCost = parseFloat(document.getElementById('calc-base')?.value || 0)   || 0;
  const platform = document.getElementById('calc-platform')?.value || 'amazon';
  const pack     = parseFloat(document.getElementById('calc-pack')?.value || 12)  || 12;

  const priceMod = parseInt(document.getElementById('sim-price')?.value || 100) / 100;
  const retRate  = parseInt(document.getElementById('sim-ret')?.value  || 10);
  const daily    = parseInt(document.getElementById('sim-daily')?.value || 5);
  const adSpend  = parseInt(document.getElementById('sim-ad')?.value   || 0);

  const newSp = Math.round(baseSp * priceMod);

  let pFee = 0, ship = 0, closing = 0;
  if (platform === 'amazon')      { pFee = newSp * 0.13; closing = 12; ship = 55; }
  else if (platform === 'flipkart') { pFee = newSp * 0.12; ship = 45; }
  else if (platform === 'own')    { pFee = newSp * 0.02; ship = 55; }

  const itc      = document.getElementById('calc-itc')?.value || 'no';
  const inward   = parseFloat(document.getElementById('calc-inward')?.value || 0)  || 0;
  const gst      = parseFloat(document.getElementById('calc-gst')?.value || 18)    || 18;
  const gstCost  = baseCost * (gst / 100);
  const landed   = baseCost + inward + (itc === 'no' ? gstCost : 0);

  const retRes     = (retRate / 100) * newSp * 0.15 + (retRate > 0 ? 5 : 0);
  const misc       = parseFloat(document.getElementById('calc-misc')?.value || 4) || 4;
  const totalCost  = landed + pack + pFee + closing + ship + retRes + adSpend + misc;
  const unitProfit = newSp - totalCost;
  const monthly    = unitProfit * daily * 30;
  const annual     = monthly * 12;

  const weeks   = Array.from({ length: 12 }, (_, i) => unitProfit * daily * 7 * (i + 1));
  const maxWeek = Math.max(...weeks.map(Math.abs), 1);

  const cur = AppState?.displayCurrency || 'INR';
  const config = typeof getCurrencyConfig === 'function' ? getCurrencyConfig(cur) : { symbol: cur + ' ', locale: 'en-US' };
  const sym = config.symbol;
  const locale = config.locale;

  // Update labels
  const priceValEl = document.getElementById('sim-price-val');
  if (priceValEl) priceValEl.textContent = `${Math.round(priceMod * 100)}% (${sym}${newSp})`;
  const retEl = document.getElementById('sim-ret-val');
  if (retEl)   retEl.textContent   = `${retRate}%`;
  const dailyEl = document.getElementById('sim-daily-val');
  if (dailyEl) dailyEl.textContent = daily;
  const adEl = document.getElementById('sim-ad-val');
  if (adEl)    adEl.textContent    = `${sym}${adSpend}`;

  // Profit displays
  const profitEl = document.getElementById('sim-profit');
  if (profitEl) {
    profitEl.textContent = `${sym}${Math.round(monthly).toLocaleString(locale)}`;
    profitEl.className = 'num ' + (monthly >= 0 ? 'good' : 'bad');
  }
  const annualEl = document.getElementById('sim-annual');
  if (annualEl) {
    annualEl.textContent = `${sym}${Math.round(annual).toLocaleString(locale)}`;
    annualEl.className = 'num ' + (annual >= 0 ? 'good' : 'bad');
  }

  // 12-week bar chart
  const chartEl = document.getElementById('sim-chart');
  if (chartEl) {
    chartEl.innerHTML = weeks.map((w, i) => {
      const height = Math.max(4, Math.abs(w) / maxWeek * 60);
      const color  = w >= 0 ? 'var(--positive)' : 'var(--danger)';
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">
        <div style="width:100%;height:${height}px;background:${color};border-radius:2px 2px 0 0;transition:height 0.3s;" title="Week ${i + 1}: ${sym}${Math.round(w).toLocaleString(locale)}"></div>
        <span style="font-size:9px;color:var(--text-tertiary);">W${i + 1}</span>
      </div>`;
    }).join('');
  }

  _simState = { baseCost, platform, pack, retRate, daily, adSpend, misc };
}

function findBestPrice() {
  if (!_simState) { updateSimulator(); }
  const { baseCost, platform, pack, retRate, daily, adSpend, misc } = _simState || {};
  const baseSp = parseFloat(document.getElementById('calc-sp')?.value || 349) || 349;
  const cur    = AppState?.displayCurrency || 'INR';
  const config = typeof getCurrencyConfig === 'function' ? getCurrencyConfig(cur) : { symbol: cur + ' ', locale: 'en-US' };
  const sym    = config.symbol;
  const locale = config.locale;

  let bestMonthly = -Infinity, bestPrice = baseSp, bestMargin = 0;

  for (let mod = 70; mod <= 130; mod += 5) {
    const sp = Math.round(baseSp * (mod / 100));
    let pFee = 0, ship = 0, closing = 0;
    if (platform === 'amazon')      { pFee = sp * 0.13; closing = 12; ship = 55; }
    else if (platform === 'flipkart') { pFee = sp * 0.12; ship = 45; }
    else if (platform === 'own')    { pFee = sp * 0.02; ship = 55; }
    const retRes = (retRate / 100) * sp * 0.15 + (retRate > 0 ? 5 : 0);
    const total  = (baseCost||0) + (pack||0) + pFee + closing + ship + retRes + (adSpend||0) + (misc||4);
    const profit = sp - total;
    const monthly = profit * (daily||5) * 30;
    if (monthly > bestMonthly) { bestMonthly = monthly; bestPrice = sp; bestMargin = ((profit / sp) * 100); }
  }

  Toast.success(`Best price: ${sym}${bestPrice} · margin: ${bestMargin.toFixed(1)}% · monthly: ${sym}${Math.round(bestMonthly).toLocaleString(locale)}`);
  const bestMod = Math.round((bestPrice / baseSp) * 100);
  const slider  = document.getElementById('sim-price');
  if (slider)  { slider.value = bestMod; updateSimulator(); }
}
