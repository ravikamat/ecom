/* ============================================================
   ECO Discovery Stream UI
   Endless AI-powered product discovery feed — SSE streaming
   ============================================================ */

class DiscoveryStreamUI {
  constructor() {
    this.eventSource    = null;
    this.sessionId      = null;
    this.container      = null;
    this.isStreaming    = false;
    this.productsTotal  = 0;
    this.savedCount     = 0;
    this.currentCategory = null;
    this._feedEl        = null;
    this._statusEl      = null;
    this._phaseEl       = null;
    this._barEl         = null;
    this._catPillsEl    = null;
    this._statsProducts = null;
    this._statsSaved    = null;
    this._statsCat      = null;
    this._activeProducts = new Map(); // id → product
  }

  mount(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this._renderShell();
    this._bindEvents();
  }

  // ── Shell HTML ────────────────────────────────────────────────
  _renderShell() {
    this.container.innerHTML = `
      <div class="ds-root">

        <!-- ── Header ── -->
        <div class="ds-header">
          <div class="ds-header-left">
            <div class="ds-logo">🌊</div>
            <div>
              <div class="ds-title">Endless Discovery Stream</div>
              <div class="ds-subtitle">AI scouts → Scraper mines → Products stream live</div>
            </div>
          </div>
          <div class="ds-stats-row">
            <div class="ds-stat">
              <div class="ds-stat-val" id="dss-cat">—</div>
              <div class="ds-stat-lbl">Category</div>
            </div>
            <div class="ds-stat">
              <div class="ds-stat-val" id="dss-count">0</div>
              <div class="ds-stat-lbl">Found</div>
            </div>
            <div class="ds-stat">
              <div class="ds-stat-val" id="dss-saved">0</div>
              <div class="ds-stat-lbl">Saved</div>
            </div>
          </div>
        </div>

        <!-- ── Location Setup ── -->
        <div class="ds-setup" id="ds-setup">
          <div class="ds-setup-card">
            <div class="ds-setup-icon">🌍</div>
            <h3>Where should we search?</h3>
            <p>The AI will scout trending categories, pick the best sites, generate search queries, and stream products to you one by one — non-stop.</p>
            <div class="ds-setup-fields">
              <div class="ds-field">
                <label>Country</label>
                <select id="ds-country" class="select">
                  <option value="India" selected>🇮🇳 India</option>
                  <option value="USA">🇺🇸 USA</option>
                  <option value="UK">🇬🇧 UK</option>
                  <option value="UAE">🇦🇪 UAE</option>
                  <option value="Australia">🇦🇺 Australia</option>
                  <option value="Canada">🇨🇦 Canada</option>
                </select>
              </div>
              <div class="ds-field">
                <label>City <span class="ds-optional">(optional)</span></label>
                <input type="text" id="ds-city" class="input" placeholder="e.g. Mumbai, Delhi…">
              </div>
              <div class="ds-field">
                <label>Currency</label>
                <select id="ds-currency" class="select">
                  <option value="INR" selected>₹ INR</option>
                  <option value="USD">$ USD</option>
                  <option value="GBP">£ GBP</option>
                  <option value="AED">د.إ AED</option>
                </select>
              </div>
            </div>
            <button class="btn btn-ai ds-start-btn" id="ds-start">
              🚀 Start Endless Discovery
            </button>
          </div>
        </div>

        <!-- ── Pipeline Status Bar ── -->
        <div class="ds-pipeline" id="ds-pipeline" style="display:none">
          <div class="ds-pipeline-phases">
            <div class="ds-phase" id="dsp-init">🔧 Init</div>
            <div class="ds-phase-arrow">→</div>
            <div class="ds-phase" id="dsp-scout">🔍 Scout</div>
            <div class="ds-phase-arrow">→</div>
            <div class="ds-phase" id="dsp-planning">🧠 Plan</div>
            <div class="ds-phase-arrow">→</div>
            <div class="ds-phase" id="dsp-scraping">🕷 Scrape</div>
            <div class="ds-phase-arrow">→</div>
            <div class="ds-phase" id="dsp-enriching">✨ Enrich</div>
          </div>
          <div class="ds-status-msg" id="ds-status-msg">Initializing...</div>
          <div class="ds-progress-wrap">
            <div class="ds-progress-bar" id="ds-progress-bar"></div>
          </div>
        </div>

        <!-- ── Category Pills ── -->
        <div class="ds-cats" id="ds-cats"></div>

        <!-- ── Product Feed ── -->
        <div class="ds-feed" id="ds-feed">
          <div class="ds-feed-empty" id="ds-feed-empty" style="display:none">
            <div class="ds-feed-empty-icon">🌊</div>
            <div>Products will stream in here one by one…</div>
          </div>
        </div>

        <!-- ── Controls ── -->
        <div class="ds-controls" id="ds-controls" style="display:none">
          <button class="btn btn-danger" id="ds-stop">⏹ Stop</button>
          <button class="btn btn-secondary" id="ds-new-session">🔄 New Session</button>
        </div>

      </div>
    `;

    // Cache refs
    this._feedEl        = document.getElementById('ds-feed');
    this._statusEl      = document.getElementById('ds-status-msg');
    this._catPillsEl    = document.getElementById('ds-cats');
    this._statsProducts = document.getElementById('dss-count');
    this._statsSaved    = document.getElementById('dss-saved');
    this._statsCat      = document.getElementById('dss-cat');
  }

  // ── Events ────────────────────────────────────────────────────
  _bindEvents() {
    document.getElementById('ds-start')?.addEventListener('click', () => this._start());
    document.getElementById('ds-stop')?.addEventListener('click',  () => this._stop());
    document.getElementById('ds-new-session')?.addEventListener('click', () => {
      this._stop();
      this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.productsTotal = 0; this.savedCount = 0;
      document.getElementById('ds-setup').style.display = '';
      document.getElementById('ds-pipeline').style.display = 'none';
      document.getElementById('ds-controls').style.display = 'none';
      document.getElementById('ds-cats').innerHTML = '';
      document.getElementById('ds-feed').innerHTML = `<div class="ds-feed-empty" id="ds-feed-empty" style="display:none"><div class="ds-feed-empty-icon">🌊</div><div>Products will stream in here one by one…</div></div>`;
      this._feedEl = document.getElementById('ds-feed');
      this._updateStats();
    });

    // Global delegation for save/skip on product cards
    document.getElementById('ds-feed')?.addEventListener('click', (e) => {
      const card = e.target.closest('.ds-card');
      if (!card) return;
      const pid = card.dataset.id;
      if (!pid) return;
      const product = this._activeProducts.get(pid);
      if (!product) return;

      if (e.target.closest('[data-action="ds-save"]')) {
        this._saveProduct(card, product);
      } else if (e.target.closest('[data-action="ds-skip"]')) {
        this._skipProduct(card, product);
      }
    });
  }

  // ── Start SSE Stream ──────────────────────────────────────────
  _start() {
    const country  = document.getElementById('ds-country')?.value || 'India';
    const city     = document.getElementById('ds-city')?.value    || '';
    const currency = document.getElementById('ds-currency')?.value || 'INR';

    document.getElementById('ds-setup').style.display = 'none';
    document.getElementById('ds-pipeline').style.display = '';
    document.getElementById('ds-controls').style.display = 'flex';

    const feedEmpty = document.getElementById('ds-feed-empty');
    if (feedEmpty) feedEmpty.style.display = '';

    this.isStreaming = true;
    this.productsTotal = 0;
    this.savedCount = 0;
    this._updateStats();

    const url = `/api/discovery/stream?country=${encodeURIComponent(country)}&city=${encodeURIComponent(city)}&currency=${encodeURIComponent(currency)}&sessionId=${this.sessionId}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        this._handleEvent(data);
      } catch {}
    };

    this.eventSource.onerror = () => {
      if (this.isStreaming) {
        this._setStatus('error', 'Connection interrupted. The server may be processing. Retrying…');
      }
    };
  }

  // ── Stop stream ───────────────────────────────────────────────
  _stop() {
    this.isStreaming = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    // Tell server to abort
    fetch(`/api/discovery/stream/${this.sessionId}`, { method: 'DELETE' }).catch(() => {});
    this._setPhase('');
    this._setStatus('stopped', 'Stream stopped.');
    document.getElementById('ds-feed-empty') && (document.getElementById('ds-feed-empty').style.display = 'none');
  }

  // ── SSE Event Router ──────────────────────────────────────────
  _handleEvent(data) {
    switch (data.type) {
      case 'status':
        this._setStatus(data.phase, data.message);
        this._setPhase(data.phase);
        break;
      case 'categories':
        this._renderCategoryPills(data.categories || []);
        break;
      case 'category_switch':
        this.currentCategory = data.category;
        this._statsCat.textContent = data.category || '—';
        this._setPhase('scout');
        this._highlightCategoryPill(data.category);
        break;
      case 'queries':
        this._setStatus('planning', `Searching: ${(data.queries || []).slice(0, 2).join(' · ')}…`);
        break;
      case 'product':
        this._renderProduct(data.product);
        break;
      case 'error':
        this._setStatus('error', data.message);
        break;
      case 'complete':
        this._setStatus('complete', 'Stream finished — all categories explored.');
        this._stop();
        break;
    }
  }

  // ── Phase Indicator ───────────────────────────────────────────
  _setPhase(phase) {
    ['dsp-init','dsp-scout','dsp-planning','dsp-scraping','dsp-enriching'].forEach(id => {
      document.getElementById(id)?.classList.remove('ds-phase-active');
    });
    const phaseMap = {
      init: 'dsp-init', scout: 'dsp-scout', planning: 'dsp-planning',
      scraping: 'dsp-scraping', enriching: 'dsp-enriching',
    };
    if (phaseMap[phase]) {
      document.getElementById(phaseMap[phase])?.classList.add('ds-phase-active');
    }
  }

  _setStatus(phase, message) {
    if (this._statusEl) this._statusEl.textContent = message || '';
  }

  // ── Category Pills ────────────────────────────────────────────
  _renderCategoryPills(categories) {
    if (!this._catPillsEl) return;
    this._catPillsEl.innerHTML = categories.map(c => `
      <div class="ds-cat-pill" data-cat="${c.name || c}">
        ${c.name || c}
        ${c.confidence === 'high' ? '<span class="ds-cat-hot">🔥</span>' : ''}
      </div>
    `).join('');
  }

  _highlightCategoryPill(category) {
    if (!this._catPillsEl) return;
    this._catPillsEl.querySelectorAll('.ds-cat-pill').forEach(el => {
      el.classList.toggle('ds-cat-active', el.dataset.cat === category);
    });
  }

  // ── Product Card Renderer ─────────────────────────────────────
  _renderProduct(product) {
    if (!product || !this._feedEl) return;
    const feedEmpty = document.getElementById('ds-feed-empty');
    if (feedEmpty) feedEmpty.style.display = 'none';

    this._activeProducts.set(product.id, product);
    this.productsTotal++;
    this._updateStats();

    const currency = product.currency || 'INR';
    const sym = { INR: '₹', USD: '$', GBP: '£', AED: 'د.إ' }[currency] || currency;

    const marginColor = product.margin >= 60 ? '#10b981' : product.margin >= 40 ? '#f59e0b' : '#ef4444';
    const demandBars  = Math.round((product.demandScore || 50) / 10);
    const confIcon    = { high: '🟢', medium: '🟡', low: '🔴' }[product.confidence] || '⚪';
    const compIcon    = { low: '✅', medium: '⚠️', high: '❌' }[product.competition] || '—';

    const card = document.createElement('div');
    card.className = 'ds-card ds-card-entering';
    card.dataset.id = product.id;
    card.innerHTML = `
      <div class="ds-card-header">
        <div class="ds-card-category">${product.category || '—'}</div>
        <div class="ds-card-platform">${product.platform || '—'}</div>
      </div>

      <div class="ds-card-name">${this._esc(product.name)}</div>

      <div class="ds-card-why">💡 ${this._esc(product.whyTrending || '—')}</div>

      <div class="ds-card-metrics">
        <div class="ds-metric">
          <div class="ds-metric-val">${sym}${(product.price || 0).toLocaleString()}</div>
          <div class="ds-metric-lbl">Sell Price</div>
        </div>
        <div class="ds-metric">
          <div class="ds-metric-val">${sym}${(product.costPrice || 0).toLocaleString()}</div>
          <div class="ds-metric-lbl">Est. Cost</div>
        </div>
        <div class="ds-metric">
          <div class="ds-metric-val" style="color:${marginColor}">${product.margin || 0}%</div>
          <div class="ds-metric-lbl">Margin</div>
        </div>
        <div class="ds-metric">
          <div class="ds-metric-val">${'█'.repeat(demandBars)}${'░'.repeat(10 - demandBars)}</div>
          <div class="ds-metric-lbl">Demand ${product.demandScore || 0}/100</div>
        </div>
        <div class="ds-metric">
          <div class="ds-metric-val">${compIcon} ${product.competition || '—'}</div>
          <div class="ds-metric-lbl">Competition</div>
        </div>
        <div class="ds-metric">
          <div class="ds-metric-val">${confIcon} ${product.confidence || '—'}</div>
          <div class="ds-metric-lbl">Confidence</div>
        </div>
      </div>

      ${product.rating || product.reviews ? `
      <div class="ds-card-social">
        ${product.rating ? `⭐ ${product.rating}` : ''}
        ${product.reviews ? `&nbsp;·&nbsp; ${product.reviews.toLocaleString()} reviews` : ''}
      </div>` : ''}

      <div class="ds-card-tip">🎯 ${this._esc(product.sellerTip || '—')}</div>

      <div class="ds-card-actions">
        ${product.sourceUrl ? `<a href="${product.sourceUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost ds-view-btn">↗ View</a>` : ''}
        <button class="btn btn-sm btn-secondary" data-action="ds-skip">✕ Skip</button>
        <button class="btn btn-sm btn-primary" data-action="ds-save">💾 Save</button>
      </div>
    `;

    // Prepend so newest is at top
    this._feedEl.insertBefore(card, this._feedEl.firstChild);

    // Animate in
    requestAnimationFrame(() => {
      card.classList.remove('ds-card-entering');
      card.classList.add('ds-card-visible');
    });

    // Trim feed to keep only last 50 cards in DOM
    const cards = this._feedEl.querySelectorAll('.ds-card');
    if (cards.length > 50) {
      for (let i = 50; i < cards.length; i++) cards[i].remove();
    }
  }

  // ── Product Actions ───────────────────────────────────────────
  _saveProduct(card, product) {
    // Visual feedback
    card.classList.add('ds-card-saving');
    card.querySelector('[data-action="ds-save"]').textContent = '✓ Saved';
    card.querySelector('[data-action="ds-save"]').disabled = true;

    // Send feedback to server
    fetch('/api/discovery/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, productId: product.id, product, action: 'save' }),
    }).catch(() => {});

    // Save to persistent DB — use addSaved (SQLite-backed) with correct field names
    const savePayload = {
      name:        product.name,
      category:    product.category,
      sp:          product.price       || product.sellingPrice || 0,   // M9 fix: price → sp
      cp:          product.costPrice   || product.cost          || 0,  // M9 fix: costPrice → cp
      margin:      product.margin,
      demand:      product.demandScore,
      competition: product.competition,
      country:     product.location?.country || 'India',
      platform:    product.platform,
      currency:    product.currency,
      source:      'discovery_stream',
      note:        product.whyTrending || '',
    };

    if (typeof addSaved === 'function') {
      addSaved(savePayload).catch(() => {});
    } else if (typeof saveProduct === 'function') {
      // Legacy fallback
      saveProduct({
        name:        product.name,
        category:    product.category,
        sp:          product.price       || product.sellingPrice || 0,
        cp:          product.costPrice   || product.cost          || 0,
        margin:      product.margin,
        demand:      product.demandScore,
        competition: product.competition,
        country:     product.location?.country || 'India',
        sourceUrl:   product.sourceUrl,
        platform:    product.platform,
        whyTrending: product.whyTrending,
        sellerTip:   product.sellerTip,
        currency:    product.currency,
        rating:      product.rating,
        reviews:     product.reviews,
      });
    }

    this.savedCount++;
    this._updateStats();
  }

  _skipProduct(card, product) {
    card.classList.add('ds-card-skipping');
    setTimeout(() => card.remove(), 350);

    fetch('/api/discovery/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, productId: product.id, product, action: 'skip' }),
    }).catch(() => {});

    this._activeProducts.delete(product.id);
  }

  // ── Helpers ───────────────────────────────────────────────────
  _updateStats() {
    if (this._statsProducts) this._statsProducts.textContent = this.productsTotal;
    if (this._statsSaved)    this._statsSaved.textContent    = this.savedCount;
    if (this._statsCat)      this._statsCat.textContent      = this.currentCategory || '—';
  }

  _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

// ── Global instance (mounted by app.js navigation) ───────────────────
let _discoveryStreamUI = null;

function initDiscoveryStream() {
  if (!_discoveryStreamUI) {
    _discoveryStreamUI = new DiscoveryStreamUI();
  }
  _discoveryStreamUI.mount('discovery-stream-container');
}
