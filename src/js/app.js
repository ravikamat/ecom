/* ============================================================
   App Initialization, Navigation & Global State
   ============================================================ */

/* ── Global Application State ────────────────────────────── */
const AppState = {
  selectedCountry: 'India',
  displayCurrency: 'INR',
  exchangeRates: {},
  currentPage: 'dashboard',
};

/* ── Navigation ──────────────────────────────────────────── */
function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page)
  );

  AppState.currentPage = page;

  // Render page content
  switch (page) {
    case 'dashboard':  renderDashboard(); break;
    case 'trending':   initTrending(); break;
    case 'search':     break; // Search on demand
    case 'suppliers':  initSupplierPage(); break;
    case 'calculator': initCalculator(); break;
    case 'saved':      renderSaved(); break;
    case 'agent':
      if (typeof Chatbot !== 'undefined') Chatbot.init();
      break;
    case 'discovery':
      if (typeof initDiscoveryStream === 'function') initDiscoveryStream();
      break;
  }

  // Update AI Coach context for the new page
  if (typeof AIBusinessCoach !== 'undefined') {
    setTimeout(() => {
      try {
        const saved = window._lastSavedProducts || [];
        AIBusinessCoach.setContext(page, {
          totalProducts: saved.length,
          avgMargin: saved.length ? Math.round(saved.reduce((s,p) => s + (p.margin||0), 0) / saved.length) : 0,
          reorderCount: saved.filter(p => (p.stock||0) <= (p.reorderPoint||5)).length,
          topProduct: [...saved].sort((a,b) => (b.margin||0) - (a.margin||0))[0]?.name || 'None',
        });
      } catch(e) { /* non-critical */ }
    }, 800);
  }
}

/* ── Country Selector ────────────────────────────────────── */
function onCountryChange(newCountry) {
  AppState.selectedCountry = newCountry;

  // Auto-set currency to country's default
  const config = COUNTRY_CONFIG[newCountry];
  if (config) {
    AppState.displayCurrency = config.currency;
    const currSel = document.getElementById('global-currency');
    if (currSel) currSel.value = config.currency;
  }

  // Save preference
  setSetting('selectedCountry', newCountry);
  setSetting('displayCurrency', AppState.displayCurrency);

  // Re-render current page
  goTo(AppState.currentPage);
}

/* ── Currency Selector ───────────────────────────────────── */
function onCurrencyChange(newCurrency) {
  AppState.displayCurrency = newCurrency;
  setSetting('displayCurrency', newCurrency);

  // Re-render current page
  goTo(AppState.currentPage);
}

/* ── Populate Global Selectors ───────────────────────────── */
function populateSelectors() {
  const countrySel = document.getElementById('global-country');
  const currSel = document.getElementById('global-currency');

  // ✅ FIX: Use documentFragment for batch DOM insertion
  if (countrySel) {
    const fragment = document.createDocumentFragment();
    
    // Add "All Countries" option
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '🌍 All Countries';
    fragment.appendChild(allOption);
    
    // Add country options
    Object.entries(COUNTRY_CONFIG).forEach(([name, conf]) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = `${conf.flag} ${name}`;
      fragment.appendChild(option);
    });
    
    // Clear and add all at once (single reflow)
    countrySel.innerHTML = '';
    countrySel.appendChild(fragment);
    countrySel.value = AppState.selectedCountry;
  }

  if (currSel) {
    const fragment = document.createDocumentFragment();
    
    CURRENCY_LIST.forEach(c => {
      const option = document.createElement('option');
      option.value = c.code;
      option.textContent = `${c.symbol} ${c.code}`;
      fragment.appendChild(option);
    });
    
    currSel.innerHTML = '';
    currSel.appendChild(fragment);
    currSel.value = AppState.displayCurrency;
  }
}

/* ── Theme Toggle ────────────────────────────────────────── */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  setSetting('theme', newTheme);

  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = newTheme === 'light' ? '🌙' : '☀️';
}

/* ── Keyboard Shortcuts ──────────────────────────────────── */
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  switch (e.key) {
    case '1': goTo('dashboard'); break;
    case '2': goTo('trending'); break;
    case '3': goTo('search'); break;
    case '4': goTo('suppliers'); break;
    case '5': goTo('calculator'); break;
    case '6': goTo('saved'); break;
    case '7': goTo('agent'); break;
  }

  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    goTo('search');
    setTimeout(() => document.getElementById('search-input')?.focus(), 100);
  }
});

/* ── Settings Modal ──────────────────────────────────────── */
async function openSettings() {
  showModal('settings-modal');
  // Load both keys from server DB (not localStorage)
  try {
    const [primaryRes, fallbackRes] = await Promise.all([
      fetch('/api/db/settings?key=nvidia_api_key'),
      fetch('/api/db/settings?key=minimax_api_key')
    ]);
    const primary = await primaryRes.json();
    const fallback = await fallbackRes.json();

    const glmInput = document.getElementById('settings-glm-key');
    const mmInput = document.getElementById('settings-minimax-key');
    if (glmInput) glmInput.value = primary.value || '';
    if (mmInput) mmInput.value = fallback.value || '';

    _updateKeyStatus('glm', primary.value);
    _updateKeyStatus('minimax', fallback.value);
  } catch (e) {
    console.warn('[Settings] Failed to load keys:', e);
  }
  // Check Ollama status
  updateOllamaStatus();
}

async function updateOllamaStatus() {
  const badge = document.getElementById('ollama-status-badge');
  const detail = document.getElementById('ollama-status-detail');
  try {
    const res = await fetch('/api/ollama/status');
    const data = await res.json();
    if (badge) {
      badge.style.background = data.available ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)';
      badge.style.color = data.available ? 'var(--positive)' : 'var(--danger)';
      badge.textContent = data.available ? '✅ Online' : '❌ Offline';
    }
    if (detail) {
      const modeLabel = {
        'ollama-promoted': '⚡ Ollama promoted to secondary (cloud is slow)',
        'cloud-primary-ollama-fallback': '☁️ Cloud primary · Ollama on standby',
        'cloud-only': '☁️ Cloud only (Ollama not running)',
      }[data.mode] || data.mode;
      const latency = data.cloudAvgLatencyMs ? `Cloud avg: ${data.cloudAvgLatencyMs}ms` : 'No cloud calls yet';
      const modelList = data.models?.length ? data.models.map(m => m.name).join(', ') : 'No models detected';
      detail.innerHTML = `
        <div>Mode: <strong>${modeLabel}</strong></div>
        <div style="margin-top:2px;">${latency} · Models: ${modelList}</div>`;
    }
  } catch {
    if (badge) { badge.textContent = '⚠️ Unknown'; badge.style.color = 'var(--warning)'; }
    if (detail) detail.textContent = 'Could not reach /api/ollama/status';
  }
}


function _updateKeyStatus(prefix, value) {
  const el = document.getElementById(`${prefix}-key-status`);
  if (!el) return;
  if (value && value.length > 10) {
    const masked = value.slice(0, 8) + '••••••••' + value.slice(-4);
    el.innerHTML = `<span style="color:var(--positive);font-size:11px;font-weight:400;">✓ Active: ${masked}</span>`;
  } else {
    el.innerHTML = '<span style="color:var(--danger);font-size:11px;font-weight:400;">✗ Not configured</span>';
  }
}

async function saveApiKey(keyType = 'primary') {
  const inputId = keyType === 'fallback' ? 'settings-minimax-key' : 'settings-glm-key';
  const statusPrefix = keyType === 'fallback' ? 'minimax' : 'glm';
  const label = keyType === 'fallback' ? 'MiniMax-M3' : 'GLM-5.2';
  const input = document.getElementById(inputId);
  const key = input?.value?.trim();

  if (!key) {
    _updateKeyStatusMsg(statusPrefix, '⚠ Enter a key first', 'var(--danger)');
    return;
  }

  _updateKeyStatusMsg(statusPrefix, '⏳ Saving...', 'var(--warning)');

  try {
    const res = await fetch('/api/set-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, keyType }),
    });

    if (res.ok) {
      _updateKeyStatusMsg(statusPrefix, '✓ Saved & applied!', 'var(--positive)');
      Toast.success(`${label} key saved! AI features active.`);
      setTimeout(() => AIEngine.checkConnection(), 1000);
    } else {
      const err = await res.json().catch(() => ({}));
      _updateKeyStatusMsg(statusPrefix, `✗ ${err.error || 'Server error'}`, 'var(--danger)');
    }
  } catch (e) {
    _updateKeyStatusMsg(statusPrefix, '⚠ Server offline', 'var(--warning)');
  }
}

async function testApiKey(keyType = 'primary') {
  const inputId = keyType === 'fallback' ? 'settings-minimax-key' : 'settings-glm-key';
  const statusPrefix = keyType === 'fallback' ? 'minimax' : 'glm';
  const input = document.getElementById(inputId);
  const key = input?.value?.trim();

  if (!key) {
    _updateKeyStatusMsg(statusPrefix, '⚠ Enter a key first', 'var(--danger)');
    return;
  }

  _updateKeyStatusMsg(statusPrefix, '⏳ Testing...', 'var(--warning)');

  try {
    const res = await fetch('/api/set-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, keyType, testOnly: true }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.valid) {
      _updateKeyStatusMsg(statusPrefix, '✓ Key is valid!', 'var(--positive)');
      Toast.success('API key is valid and working!');
    } else {
      _updateKeyStatusMsg(statusPrefix, `✗ ${data.error || 'Invalid key'}`, 'var(--danger)');
    }
  } catch (e) {
    _updateKeyStatusMsg(statusPrefix, '⚠ Server offline', 'var(--warning)');
  }
}

function _updateKeyStatusMsg(prefix, text, color) {
  const el = document.getElementById(`${prefix}-key-status`);
  if (!el) return;
  el.innerHTML = `<span style="color:${color};font-size:11px;font-weight:400;">${text}</span>`;
}

function resetAllData() {
  if (confirm('This will delete ALL data including saved items, settings, and the product database. Continue?')) {
    resetDatabase();
  }
}

async function seedDatabase() {
  // Database seeding is now handled server-side in SQLite on startup.
  console.log('[App] Database seeding is managed server-side.');
}

async function migrateFromLocalStorage() {
  try {
    const storedKey = localStorage.getItem('nvidia_api_key');
    if (storedKey) {
      const currentSetting = await getSetting('nvidia_api_key');
      if (!currentSetting) {
        await setSetting('nvidia_api_key', storedKey);
        console.log('[App] Migrated nvidia_api_key setting to SQLite settings.');
      }
    }
  } catch (e) {
    console.warn('[App] LocalStorage migration warning:', e.message);
  }
}

/* ── App Boot ────────────────────────────────────────────── */
async function initApp() {
  console.log('[App] Starting Solo E-Commerce Command Center v2...');

  // Seed database on first load
  await seedDatabase();

  // Migrate old localStorage data
  await migrateFromLocalStorage();

  // Load saved preferences
  const savedCountry = await getSetting('selectedCountry', 'India');
  const savedCurrency = await getSetting('displayCurrency', 'INR');
  const savedTheme = await getSetting('theme', 'dark');

  AppState.selectedCountry = savedCountry;
  AppState.displayCurrency = savedCurrency;

  // Apply theme
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.textContent = savedTheme === 'light' ? '🌙' : '☀️';

  // Populate selectors
  populateSelectors();

  // Initialize currency engine
  await CurrencyEngine.init();

  // Bind nav buttons
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => goTo(b.dataset.page));
  });

  // Bind global selectors
  document.getElementById('global-country')?.addEventListener('change', function() {
    onCountryChange(this.value);
  });

  document.getElementById('global-currency')?.addEventListener('change', function() {
    onCurrencyChange(this.value);
  });

  // Check AI connectivity (initial)
  await checkConnectivity();
  // Heartbeat: re-check AI every 60 seconds for auto-recovery
  setInterval(checkConnectivity, 60000);

  // Boot dashboard
  goTo('dashboard');

  // v2.2: Initialize AI Business Coach
  if (typeof AIBusinessCoach !== 'undefined') {
    AIBusinessCoach.init();
    console.log('[App] AIBusinessCoach initialized ✓');
  }

  console.log('[App] Ready ✓ (v2.5 — SQLite Persistent)');

  // Request notification permission once
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
  }

  // Run auto-refresh immediately (catches stale items from offline period)
  setTimeout(() => {
    if (typeof autoRefreshSavedProducts === 'function') autoRefreshSavedProducts();
  }, 8000);

  // Then every 2 hours
  setInterval(() => {
    if (typeof autoRefreshSavedProducts === 'function') autoRefreshSavedProducts();
  }, 2 * 60 * 60 * 1000);
}

let _lastAiState = null; // Track previous state for smart toasts
async function checkConnectivity() {
  const statusEl = document.getElementById('connection-status');
  const btn = document.getElementById('server-status-btn');
  if (!statusEl) return;

  const aiOnline = await AIEngine.checkConnection();
  const prevState = _lastAiState;

  if (aiOnline) {
    _lastAiState = 'online';
    statusEl.textContent = '🟢 AI Online';
    statusEl.title = 'AI proxy server is running. Real-time search and AI features are available.';
    statusEl.className = 'connection-badge online';
    if (btn) {
      btn.textContent = '🟢 Server Active';
      btn.style.color = '#10b981';
      btn.style.borderColor = 'rgba(16,185,129,0.3)';
      btn.style.background = 'rgba(16,185,129,0.06)';
    }
    // Recovery toast — only if we were previously offline
    if (prevState && prevState !== 'online') {
      Toast.success('✅ AI connection restored! All features are back online.');
    }
  } else if (navigator.onLine) {
    _lastAiState = 'ai-offline';
    statusEl.textContent = '🟡 AI Offline';
    statusEl.title = 'AI proxy not running. Start with: node server.js\nLocal database features still work.';
    statusEl.className = 'connection-badge partial';
    if (btn) {
      btn.textContent = '🔴 Server Stopped';
      btn.style.color = '#ef4444';
      btn.style.borderColor = 'rgba(239,68,68,0.3)';
      btn.style.background = 'rgba(239,68,68,0.06)';
    }
    // Only show toast on first detection, not every 60s
    if (prevState === 'online') {
      Toast.warning('⚠️ AI server went offline. Features using AI will fall back to local Qwen model.');
    }
  } else {
    _lastAiState = 'offline';
    statusEl.textContent = '🔴 Offline';
    statusEl.title = 'No internet connection. Using cached data only.';
    statusEl.className = 'connection-badge offline';
    if (btn) {
      btn.textContent = '🔴 Server Stopped';
      btn.style.color = '#ef4444';
      btn.style.borderColor = 'rgba(239,68,68,0.3)';
      btn.style.background = 'rgba(239,68,68,0.06)';
    }
    if (prevState === 'online') {
      Toast.error('🔴 Internet connection lost. Working in offline mode.');
    }
  }
}

window._isServerSuspended = false;

function toggleServerDropdown(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('server-control-dropdown');
  if (!dropdown) return;

  const isShow = dropdown.classList.contains('show');
  
  // Close all other dropdowns
  document.querySelectorAll('.server-dropdown').forEach(d => d.classList.remove('show'));

  if (!isShow) {
    if (window._isServerSuspended) {
      dropdown.innerHTML = `
        <button class="server-dropdown-item success" onclick="executeServerAction('start')">
          <span>▶️</span> Start Server
        </button>
      `;
    } else {
      dropdown.innerHTML = `
        <button class="server-dropdown-item" onclick="executeServerAction('restart')">
          <span>🔄</span> Restart Server
        </button>
        <button class="server-dropdown-item danger" onclick="executeServerAction('stop')">
          <span>🛑</span> Stop Server
        </button>
      `;
    }
    dropdown.classList.add('show');
  }
}

// Close dropdown on clicking outside
document.addEventListener('click', () => {
  const dropdown = document.getElementById('server-control-dropdown');
  if (dropdown) dropdown.classList.remove('show');
});

async function executeServerAction(action) {
  const dropdown = document.getElementById('server-control-dropdown');
  if (dropdown) dropdown.classList.remove('show');
  const btn = document.getElementById('server-status-btn');

  if (action === 'restart') {
    if (!confirm('Restart background workers?\n\nThe server stays alive — this resets the research worker loop without interrupting the page.')) return;
    if (btn) { btn.innerHTML = '🔄 Restarting…'; btn.style.color = '#f59e0b'; btn.style.borderColor = 'rgba(245,158,11,0.3)'; btn.style.background = 'rgba(245,158,11,0.06)'; btn.disabled = true; }
    try {
      const res = await fetch('/api/server/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' })
      });
      if (res.ok) {
        window._isServerSuspended = false;
        Toast.success('✅ Server workers restarted successfully!');
      } else {
        Toast.error('Failed to restart.');
      }
    } catch (e) {
      Toast.error('Error: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; updateServerButtonUI(); }
    }

  } else if (action === 'stop') {
    if (!confirm('Suspend the server?\n\nThis will pause all scrapers and background research workers. The page will still work.')) return;
    if (btn) { btn.innerHTML = '⏳ Stopping…'; btn.disabled = true; }
    try {
      const res = await fetch('/api/server/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      if (res.ok) {
        window._isServerSuspended = true;
        updateServerButtonUI();
        Toast.warning('🛑 Server suspended. Background workers paused.');
      } else {
        Toast.error('Failed to stop server.');
        updateServerButtonUI();
      }
    } catch (e) {
      Toast.error('Error: ' + e.message);
      updateServerButtonUI();
    } finally {
      if (btn) btn.disabled = false;
    }

  } else if (action === 'start') {
    if (btn) { btn.innerHTML = '⏳ Resuming…'; btn.disabled = true; }
    try {
      const res = await fetch('/api/server/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      if (res.ok) {
        window._isServerSuspended = false;
        updateServerButtonUI();
        Toast.success('✅ Server active. Background workers resumed.');
      } else {
        Toast.error('Failed to start server.');
        updateServerButtonUI();
      }
    } catch (e) {
      Toast.error('Error: ' + e.message);
      updateServerButtonUI();
    } finally {
      if (btn) btn.disabled = false;
    }
  }
}


function updateServerButtonUI() {
  const btn = document.getElementById('server-status-btn');
  if (!btn) return;
  if (window._isServerSuspended) {
    btn.innerHTML = '🔴 Server Stopped';
    btn.style.color = '#ef4444';
    btn.style.borderColor = 'rgba(239,68,68,0.3)';
    btn.style.background = 'rgba(239,68,68,0.06)';
  } else {
    btn.innerHTML = '🟢 Server Active';
    btn.style.color = '#10b981';
    btn.style.borderColor = 'rgba(16,185,129,0.3)';
    btn.style.background = 'rgba(16,185,129,0.06)';
  }
}

// Bind to window so inline onclick attribute can access it
window.toggleServerDropdown = toggleServerDropdown;
window.executeServerAction = executeServerAction;
window.updateServerButtonUI = updateServerButtonUI;

// Re-check connectivity when online/offline status changes
window.addEventListener('online',  () => { checkConnectivity(); Toast.success('🌐 Back online'); document.body.classList.remove('offline'); });
window.addEventListener('offline', () => { Toast.warning('📡 You are offline. Using cached data.'); document.body.classList.add('offline'); });

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

/* ============================================================
   FEATURE 10 — PWA: SERVICE WORKER + INSTALL PROMPT
   ============================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        console.log('[SW] Registered, scope:', reg.scope);

        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              Toast.info('🔄 App update available! Refresh to get the latest version.');
            }
          });
        });
      })
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

// Install prompt (A2HS)
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;

  // Show install section on dashboard
  const section = document.getElementById('install-pwa-section');
  const btn     = document.getElementById('install-pwa-btn');
  if (section) section.style.display = '';
  if (btn)     btn.style.display     = 'inline-flex';

  btn?.addEventListener('click', () => {
    _deferredInstallPrompt?.prompt();
    _deferredInstallPrompt?.userChoice.then(choice => {
      if (choice.outcome === 'accepted') Toast.success('✅ App installed!');
      _deferredInstallPrompt = null;
      if (section) section.style.display = 'none';
    });
  }, { once: true });
});

// Hide install button once installed
window.addEventListener('appinstalled', () => {
  const section = document.getElementById('install-pwa-section');
  if (section) section.style.display = 'none';
  Toast.success('📱 App successfully installed!');
});
