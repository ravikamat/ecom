/* ============================================================
   UI Utilities — Toast, Formatters, Helpers
   ============================================================ */

/* ── Toast Notification System ───────────────────────────── */
const Toast = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 3500) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error', 5000); },
  info(msg) { this.show(msg, 'info'); },
  warning(msg) { this.show(msg, 'warning', 4000); }
};

/* ── Price Formatter ─────────────────────────────────────── */
function formatPrice(amount, fromCurrency) {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';

  const targetCurrency = AppState.displayCurrency || 'USD';
  const rates = AppState.exchangeRates || {};

  // Convert to target currency
  let converted = amount;
  if (fromCurrency && fromCurrency !== targetCurrency && rates[fromCurrency] && rates[targetCurrency]) {
    // Convert from source to USD (base), then to target
    const inUSD = amount / rates[fromCurrency];
    converted = inUSD * rates[targetCurrency];
  }

  // Format based on target currency config
  const config = getCurrencyConfig(targetCurrency);
  const formatted = converted.toLocaleString(config.locale, {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });

  return `${config.symbol}${formatted}`;
}

function getCurrencyConfig(code) {
  const configs = {
    USD: { symbol: '$', locale: 'en-US', decimals: 2 },
    INR: { symbol: '₹', locale: 'en-IN', decimals: 0 },
    GBP: { symbol: '£', locale: 'en-GB', decimals: 2 },
    EUR: { symbol: '€', locale: 'de-DE', decimals: 2 },
    AED: { symbol: 'د.إ', locale: 'ar-AE', decimals: 2 },
    CAD: { symbol: 'C$', locale: 'en-CA', decimals: 2 },
    AUD: { symbol: 'A$', locale: 'en-AU', decimals: 2 },
    JPY: { symbol: '¥', locale: 'ja-JP', decimals: 0 },
    SGD: { symbol: 'S$', locale: 'en-SG', decimals: 2 },
    SAR: { symbol: '﷼', locale: 'ar-SA', decimals: 2 },
    BRL: { symbol: 'R$', locale: 'pt-BR', decimals: 2 },
    MXN: { symbol: 'MX$', locale: 'es-MX', decimals: 2 },
    NGN: { symbol: '₦', locale: 'en-NG', decimals: 0 },
    ZAR: { symbol: 'R', locale: 'en-ZA', decimals: 2 },
    TRY: { symbol: '₺', locale: 'tr-TR', decimals: 2 },
    IDR: { symbol: 'Rp', locale: 'id-ID', decimals: 0 },
    THB: { symbol: '฿', locale: 'th-TH', decimals: 0 },
    MYR: { symbol: 'RM', locale: 'ms-MY', decimals: 2 },
    KRW: { symbol: '₩', locale: 'ko-KR', decimals: 0 },
  };
  return configs[code] || { symbol: code + ' ', locale: 'en-US', decimals: 2 };
}

/* ── Number Formatter ────────────────────────────────────── */
function formatNumber(n, decimals = 0) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/* ── Competition Tag ─────────────────────────────────────── */
function competitionTag(level) {
  const map = {
    'Low': 'tag-green',
    'Medium': 'tag-yellow',
    'High': 'tag-red',
    'Very High': 'tag-purple',
  };
  return `<span class="tag ${map[level] || 'tag-gray'}">${level}</span>`;
}

/* ── Demand Bar ──────────────────────────────────────────── */
function demandBar(score) {
  const cls = score >= 80 ? 'progress-fill-green' : score >= 50 ? '' : 'progress-fill-red';
  return `<div style="display:flex;align-items:center;gap:8px;">
    <span class="price mono">${score}</span>
    <div class="progress-bar" style="width:80px;">
      <div class="progress-fill ${cls}" style="width:${score}%"></div>
    </div>
  </div>`;
}

/* ── Country Flag ────────────────────────────────────────── */
function getFlag(country) {
  if (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country]) {
    return COUNTRY_CONFIG[country].flag || '';
  }
  return '';
}

/* ── Platform Pills ──────────────────────────────────────── */
function platformPills(platforms) {
  return platforms.map(p =>
    `<span class="platform-pill">${p}</span>`
  ).join(' ');
}

/* ── Skeleton Loader ─────────────────────────────────────── */
function showSkeleton(container, count = 3) {
  container.innerHTML = Array(count).fill(
    '<div class="skeleton skeleton-card"></div>'
  ).join('');
}

/* ── Ripple Effect ───────────────────────────────────────── */
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

/* ── Modal Helpers ───────────────────────────────────────── */
function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});

/* ── Debounce ────────────────────────────────────────────── */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ── Date Formatter ──────────────────────────────────────── */
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Safe HTML for inline event data ─────────────────────── */
function safeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, '&#96;');
}

/* ============================================================
   FEATURE 8 — AI LISTING GENERATOR MODAL
   ============================================================ */

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function showListingModal(productName = '', category = '') {
  // Remove any existing listing modal
  closeModal('listing-modal');

  const modal = document.createElement('div');
  modal.id        = 'listing-modal';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;backdrop-filter:blur(4px);';
  modal.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;max-width:620px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,0.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px 0;margin-bottom:16px;">
        <h3 style="margin:0;font-size:18px;">✨ AI Listing Generator</h3>
        <button onclick="closeModal('listing-modal')" style="background:none;border:none;color:var(--text-secondary);font-size:22px;cursor:pointer;line-height:1;">×</button>
      </div>
      <div style="padding:0 24px 24px;">
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
          <div>
            <label class="input-label">Product Name</label>
            <input type="text" id="list-name" class="input" value="${safeAttr(productName)}" placeholder="e.g. Resistance Band Set">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="input-label">Category</label>
              <input type="text" id="list-cat" class="input" value="${safeAttr(category)}" placeholder="Fitness">
            </div>
            <div>
              <label class="input-label">Platform</label>
              <select id="list-platform" class="select">
                <option value="Amazon">Amazon</option>
                <option value="Flipkart">Flipkart</option>
                <option value="Meesho">Meesho</option>
                <option value="Own Website">Own Website</option>
                <option value="Shopee">Shopee</option>
                <option value="eBay">eBay</option>
              </select>
            </div>
          </div>
          <div>
            <label class="input-label">Tone</label>
            <select id="list-tone" class="select">
              <option value="professional">Professional</option>
              <option value="casual">Casual / Friendly</option>
              <option value="luxury">Luxury / Premium</option>
              <option value="urgent">Urgency / FOMO</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" id="list-generate-btn" style="width:100%;">⚡ Generate Listing</button>
        <div id="list-result" style="margin-top:16px;"></div>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal('listing-modal'); });

  document.getElementById('list-generate-btn').addEventListener('click', async () => {
    const btn = document.getElementById('list-generate-btn');
    btn.textContent = '⏳ Generating...'; btn.disabled = true;

    const result = await AIEngine.generateListing(
      document.getElementById('list-name').value,
      document.getElementById('list-cat').value,
      document.getElementById('list-platform').value,
      document.getElementById('list-tone').value
    );

    btn.textContent = '⚡ Generate Listing'; btn.disabled = false;

    const resultEl = document.getElementById('list-result');
    if (!result) {
      resultEl.innerHTML = '<div style="color:var(--danger);padding:12px;border-radius:8px;background:rgba(255,107,107,0.1);">⚠ Generation failed. Check AI connection and try again.</div>';
      return;
    }

    resultEl.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="margin:0;color:var(--positive);">✅ Listing Generated</h4>
          <button class="btn btn-sm" id="copy-all-btn">📋 Copy All</button>
        </div>
        ${_listingField('Title', 'list-title', 'input', result.title || '')}
        ${_listingField('Description', 'list-desc', 'textarea', result.description || '', 3)}
        ${_listingField('Bullet Points', 'list-bullets', 'textarea', (result.bullets || []).join('\\n'), 5)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${_listingField('Meta Title', 'list-meta-title', 'input', result.metaTitle || '')}
          ${_listingField('Meta Description', 'list-meta-desc', 'input', result.metaDescription || '')}
        </div>
        ${_listingField('Keywords', 'list-keywords', 'input', (result.keywords || []).join(', '))}
        ${_listingField('Search Terms', 'list-terms', 'input', result.searchTerms || '')}
      </div>`;

    // Bind copy buttons
    resultEl.querySelectorAll('[data-copy-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.copyTarget);
        if (!target) return;
        navigator.clipboard.writeText(target.value || target.textContent).then(() => Toast.success('Copied!'));
      });
    });

    document.getElementById('copy-all-btn')?.addEventListener('click', copyListing);
  });
}

function _listingField(label, id, tag, value, rows = 1) {
  const el = tag === 'textarea'
    ? `<textarea id="${id}" class="input" rows="${rows}" style="resize:vertical;">${value}</textarea>`
    : `<input type="text" id="${id}" class="input" value="${safeAttr(value)}">`;
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <label class="input-label" style="margin:0;">${label}</label>
      <button class="btn btn-sm" data-copy-target="${id}" style="font-size:10px;padding:2px 8px;">Copy</button>
    </div>
    ${el}
  </div>`;
}

function copyListing() {
  const title   = document.getElementById('list-title')?.value  || '';
  const desc    = document.getElementById('list-desc')?.value   || '';
  const bullets = document.getElementById('list-bullets')?.value || '';
  const full    = `${title}\n\n${desc}\n\n${bullets}`;
  navigator.clipboard.writeText(full).then(() => Toast.success('Full listing copied!'));
}
