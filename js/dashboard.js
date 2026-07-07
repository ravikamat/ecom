/* ============================================================
   Dashboard — Live Real-Time Market Data
   Fetches live data via /api/scrape on every load
   ============================================================ */

async function renderDashboard() {
  const stats = await getDashboardStats();
  const country = AppState.selectedCountry;
  const currency = AppState.displayCurrency;
  const countryConf = (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country])
    ? COUNTRY_CONFIG[country] : { currency: 'USD' };

  // Update local stat cards
  document.getElementById('dash-saved').textContent = stats.savedCount ?? 0;
  document.getElementById('dash-suppliers').textContent = stats.supplierCount ?? 0;
  document.getElementById('dash-avg-margin').textContent = (stats.avgMargin ?? 0) + '%';

  const cap = CurrencyEngine.convert(stats.totalCapital ?? 0, countryConf.currency, currency);
  document.getElementById('dash-capital').textContent = formatPrice(cap, currency);

  // Fetch live market data
  await renderMarketSnapshot();

  // Feature 9: Inventory forecast
  renderInventoryForecast();
}

async function renderMarketSnapshot() {
  const country = AppState.selectedCountry;
  const currency = AppState.displayCurrency;
  const tbody = document.getElementById('market-snapshot-body');
  if (!tbody) return;

  const aiOnline = await AIEngine.checkConnection();

  if (aiOnline) {
    // Show loading state
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;">
      <div class="spinner" style="margin:0 auto 10px;"></div>
      <div class="muted">Fetching live market data for ${country === 'all' ? 'worldwide' : country}...</div>
    </td></tr>`;

    try {
      const countryName = country === 'all' ? 'USA' : country;
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `trending best selling products ${new Date().getFullYear()}`, country: countryName }),
      });

      if (!response.ok) throw new Error('Server error');
      const data = await response.json();
      const combined = data.combined || {};

      // ── Market Overview Stats ───
      const insightContainer = document.getElementById('ai-insight-container');
      const ov = combined.marketOverview;
      if (ov && insightContainer) {
        insightContainer.innerHTML = `
          <div class="card" style="margin-top:12px;">
            <div class="flex-between" style="margin-bottom:10px;">
              <div class="section-title">📡 Live Market Pulse</div>
              <span class="tag tag-green" style="font-size:10px;">LIVE · ${new Date(data.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="grid-4">
              <div class="stat-box">
                <div class="stat-value">${_dashFmt(ov.estimatedMonthlySales)}</div>
                <div class="stat-label">Monthly Sales</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${formatPrice(ov.avgPrice || 0, currency)}</div>
                <div class="stat-label">Avg Price</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${demandBar(ov.demandScore || 50)}</div>
                <div class="stat-label">Demand</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${competitionTag(ov.competitionLevel || 'Medium')}</div>
                <div class="stat-label">Competition</div>
              </div>
            </div>
            ${ov.seasonality ? `<div class="muted mt-sm" style="font-size:12px;">📅 ${ov.seasonality}</div>` : ''}
          </div>`;
      }

      // ── Platform Breakdown Table ───
      const platforms = combined.platformStats || [];
      if (platforms.length > 0) {
        tbody.innerHTML = platforms.map(p => {
          const marginCls = (p.profitMargin || 0) >= 25 ? 'positive-text' : (p.profitMargin || 0) >= 10 ? 'warning-text' : 'danger-text';
          return `<tr>
            <td><strong>${p.platform}</strong></td>
            <td class="mono">${_dashFmt(p.estimatedMonthlySales)} sales/mo</td>
            <td class="${marginCls} mono">${p.profitMargin || 0}%</td>
            <td>${p.rating ? demandBar(p.rating * 20) : '—'}</td>
            <td>${competitionTag(p.estimatedSellers > 1000 ? 'Very High' : p.estimatedSellers > 200 ? 'High' : p.estimatedSellers > 50 ? 'Medium' : 'Low')}</td>
          </tr>`;
        }).join('');
      } else {
        // Fallback: show live listings as categories
        const listings = combined.liveListings || [];
        if (listings.length > 0) {
          const byPlatform = {};
          listings.forEach(l => {
            const p = l.platform || 'Other';
            if (!byPlatform[p]) byPlatform[p] = { prices: [], count: 0 };
            byPlatform[p].count++;
            if (l.price) byPlatform[p].prices.push(l.price);
          });

          tbody.innerHTML = Object.entries(byPlatform).map(([platform, data]) => {
            const avg = data.prices.length > 0 ? data.prices.reduce((a, b) => a + b, 0) / data.prices.length : 0;
            return `<tr>
              <td><strong>${platform}</strong></td>
              <td class="mono">${data.count} products</td>
              <td class="price mono">${avg > 0 ? formatPrice(avg, currency) : '—'}</td>
              <td>—</td>
              <td><span class="tag tag-green" style="font-size:10px;">Live</span></td>
            </tr>`;
          }).join('');
        } else {
          await _renderLocalSnapshot(tbody, country, currency);
        }
      }

      // ── Recommendation ───
      const rec = combined.recommendation;
      if (rec && insightContainer) {
        const vc = rec.verdict?.includes('Worth') ? 'positive-text' : rec.verdict?.includes('risk') ? 'danger-text' : 'warning-text';
        insightContainer.innerHTML += `
          <div class="card ai-result" style="margin-top:12px;">
            <div class="ai-badge">AI Market Verdict</div>
            <div class="${vc}" style="font-size:18px;font-weight:700;margin-top:8px;">${rec.verdict || '—'}</div>
            ${rec.bestPlatform ? `<div class="muted mt-sm">Best platform: <strong>${rec.bestPlatform}</strong></div>` : ''}
            ${rec.tip ? `<div style="padding:10px;border-radius:var(--radius-sm);background:var(--accent-soft);font-size:13px;color:var(--accent-hover);margin-top:10px;">💡 ${rec.tip}</div>` : ''}
          </div>`;
      }

    } catch (err) {
      console.error('[Dashboard] Live fetch error:', err);
      await _renderLocalSnapshot(tbody, country, currency);
    }
  } else {
    // Offline — local DB
    await _renderLocalSnapshot(tbody, country, currency);
  }
}

/* ── Local DB fallback ───────────────────────────────────── */
async function _renderLocalSnapshot(tbody, country, currency) {
  const products = await getProducts({ country: country === 'all' ? undefined : country });

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:16px;">No market data. Start server: node server.js</td></tr>';
    return;
  }

  const catMap = {};
  products.forEach(p => {
    if (!catMap[p.category]) catMap[p.category] = { margins: [], demands: [], comps: [], count: 0 };
    catMap[p.category].margins.push(p.margin || 0);
    catMap[p.category].demands.push(p.demand || 0);
    catMap[p.category].comps.push(p.competition || 'Medium');
    catMap[p.category].count++;
  });

  const categories = Object.entries(catMap)
    .map(([cat, data]) => ({
      category: cat,
      avgMargin: Math.round(data.margins.reduce((a, b) => a + b, 0) / data.margins.length),
      avgDemand: Math.round(data.demands.reduce((a, b) => a + b, 0) / data.demands.length),
      topComp: data.comps.sort((a, b) =>
        data.comps.filter(c => c === b).length - data.comps.filter(c => c === a).length
      )[0],
      count: data.count,
    }))
    .sort((a, b) => b.avgMargin - a.avgMargin)
    .slice(0, 8);

  tbody.innerHTML = categories.map(c => `
    <tr>
      <td><strong>${c.category}</strong></td>
      <td>${c.count} products</td>
      <td class="positive-text mono">${c.avgMargin}%</td>
      <td>${demandBar(c.avgDemand)}</td>
      <td>${competitionTag(c.topComp)}</td>
    </tr>
  `).join('');
}

/* ── AI Market Insight (button) ──────────────────────────── */
async function aiMarketInsight() {
  const country = AppState.selectedCountry;
  const container = document.getElementById('ai-insight-container');
  if (!container) return;

  container.innerHTML = '<div class="flex-center" style="padding:20px;"><div class="spinner"></div><span class="muted">AI analyzing market...</span></div>';

  const result = await AIEngine.analyzeMarket(country);

  if (!result) {
    container.innerHTML = '<div class="muted" style="padding:12px;">AI analysis unavailable.</div>';
    return;
  }

  container.innerHTML = `
    <div class="card ai-result" style="margin-top:12px;">
      <div class="ai-badge">AI Market Insight</div>
      <p style="margin:10px 0;color:var(--text-secondary);font-size:14px;line-height:1.6;">${result.summary || ''}</p>
      ${result.topCategories ? `
        <div class="section-title">Top Categories</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          ${result.topCategories.map(c => `<span class="tag tag-accent">${c.name} · ${c.avgMargin || c.growthRate}</span>`).join('')}
        </div>
      ` : ''}
      ${result.opportunities ? `
        <div class="section-title">Opportunities</div>
        <ul style="color:var(--text-secondary);font-size:13px;padding-left:16px;margin-bottom:12px;">
          ${result.opportunities.map(o => `<li style="margin-bottom:4px;">${o}</li>`).join('')}
        </ul>
      ` : ''}
      ${result.tip ? `
        <div style="padding:10px;border-radius:var(--radius-sm);background:var(--accent-soft);font-size:13px;color:var(--accent-hover);">
          💡 <strong>Tip:</strong> ${result.tip}
        </div>
      ` : ''}
    </div>
  `;
}

/* ── Helper ──────────────────────────────────────────────── */
function _dashFmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

/* ============================================================
   FEATURE 9 — INVENTORY FORECASTING
   ============================================================ */
async function renderInventoryForecast() {
  const container = document.getElementById('inventory-forecast');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center;padding:20px;"><div class="spinner" style="margin:0 auto 8px;"></div><div class="muted">Calculating inventory forecast...</div></div>`;

  const saved = await getSaved();
  if (!saved.length) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--text-secondary);">
      <div style="font-size:32px;margin-bottom:8px;">📦</div>
      <div>No saved products yet. Save items from the Calculator or Trending pages to see inventory forecasts.</div>
    </div>`;
    return;
  }

  // Build forecast rows
  const forecasts = saved.map(item => {
    const stock  = item.moq || 30;
    const daily  = item.dailySales || 5;
    const daysLeft = stock > 0 ? Math.floor(stock / daily) : 0;
    const suggestedReorder = Math.max(item.moq || 30, daily * 45);
    let status = 'ok';
    if (daysLeft < 15) status = 'critical';
    else if (daysLeft < 30) status = 'warning';
    return { ...item, stock, daily, daysLeft, suggestedReorder, status };
  });

  const needsAttention = forecasts.filter(f => f.status !== 'ok');
  const criticals      = forecasts.filter(f => f.status === 'critical');

  container.innerHTML = `
    ${needsAttention.length ? `
      <div class="card" style="margin-bottom:12px;padding:14px 16px;background:rgba(255,107,107,0.08);border-color:rgba(255,107,107,0.3);display:flex;align-items:center;gap:12px;">
        <div style="font-size:24px;">⚠️</div>
        <div>
          <strong>${criticals.length} critical, ${needsAttention.length - criticals.length} warning</strong>
          <div class="muted" style="font-size:12px;">${criticals.length ? `Reorder within ${Math.min(...criticals.map(n => n.daysLeft))} days to avoid stockout.` : 'Plan reorders soon.'}</div>
        </div>
      </div>` : ''}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Product</th>
          <th>Stock (MOQ)</th>
          <th>Daily Sales</th>
          <th>Days Left</th>
          <th>Status</th>
          <th>Suggest Reorder</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${forecasts.map(f => `
            <tr style="${f.status === 'critical' ? 'background:rgba(255,107,107,0.04);' : f.status === 'warning' ? 'background:rgba(255,193,7,0.04);' : ''}">
              <td><strong>${f.name}</strong>${f.platform ? `<br><span class="muted" style="font-size:11px;">${f.platform}</span>` : ''}</td>
              <td>${f.stock}</td>
              <td>
                <input type="number" class="input velocity-inp" data-id="${f.id}"
                  value="${f.daily}" min="1" max="500"
                  style="width:60px;padding:4px 6px;text-align:center;font-size:13px;"
                  title="Edit daily sales velocity">
              </td>
              <td class="${f.daysLeft < 15 ? 'danger-text' : f.daysLeft < 30 ? '' : 'positive-text'}" style="font-weight:600;">
                ${f.daysLeft}d
              </td>
              <td>
                <span class="tag ${f.status === 'critical' ? 'tag-red' : f.status === 'warning' ? 'tag-yellow' : 'tag-green'}" style="white-space:nowrap;">
                  ${f.status === 'critical' ? '🔴 Reorder Now' : f.status === 'warning' ? '⚠️ Plan Reorder' : '✅ OK'}
                </span>
              </td>
              <td class="mono">${f.suggestedReorder} units</td>
              <td>
                <button class="btn btn-sm reorder-plan-btn" data-name="${f.name}" data-qty="${f.suggestedReorder}" style="white-space:nowrap;">📦 Plan</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // Bind velocity inputs (debounced save)
  let _velTimer = null;
  container.querySelectorAll('.velocity-inp').forEach(input => {
    input.addEventListener('change', async () => {
      clearTimeout(_velTimer);
      _velTimer = setTimeout(async () => {
        const id  = parseInt(input.dataset.id);
        const val = Math.max(1, parseInt(input.value) || 1);
        // Update saved item's dailySales
        const item = await db.saved.get(id);
        if (item) { item.dailySales = val; await db.saved.put(item); }
        Toast.success('Velocity updated');
        renderInventoryForecast(); // refresh
      }, 500);
    });
  });

  // Bind reorder plan buttons
  container.querySelectorAll('.reorder-plan-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      Toast.success(`📦 Reorder plan: ${btn.dataset.qty} units of "${btn.dataset.name}" noted`);
    });
  });
}
