/* ============================================================
   Saved List Page
   ============================================================ */

let _autoRefreshInProgress = false; // guard: prevent recursive refresh loops

async function renderSaved(skipAutoRefresh = false) {
  const container = document.getElementById('saved-list');
  if (!container) return;

  const saved = await getSaved();
  const currency = AppState.displayCurrency;

  if (saved.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">No saved items yet. Explore trending products, search, or run the calculator to add items.</div>
      </div>`;
    return;
  }

  const now = Date.now();
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  container.innerHTML = saved.map(s => {
    const sourceClass = s.source === 'trending' ? 'tag-blue'
      : s.source === 'search' ? 'tag-green'
      : s.source === 'supplier' ? 'tag-purple'
      : 'tag-gray';

    const displayPrice = s.sp ? formatPrice(
      CurrencyEngine.convert(s.sp, s.currency || AppState.displayCurrency, currency),
      currency
    ) : '';

    const displayCapital = s.capital ? formatPrice(
      CurrencyEngine.convert(s.capital, s.currency || AppState.displayCurrency, currency),
      currency
    ) : '';

    // Staleness
    const lastRefresh  = new Date(s.lastAutoRefresh || s.updatedAt || s.savedAt || s.date || 0).getTime();
    const lastUpdate   = new Date(s.updatedAt || s.savedAt || s.date || 0).getTime();
    const daysSince    = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
    const isStale      = (now - lastRefresh) > TWO_DAYS_MS;
    const staleColor   = daysSince >= 7 ? 'var(--danger)' : daysSince >= 2 ? 'var(--warning)' : 'var(--positive)';
    const staleText    = daysSince === 0 ? 'Updated today' : `Updated ${daysSince}d ago`;
    const isDeclinig   = s.trendStatus === 'declining';

    return `
    <div class="saved-item ${s.pinned ? 'saved-item-pinned' : ''} ${isDeclinig ? 'saved-item-declining' : ''}" style="cursor:pointer;" data-action="open-detail" data-id="${s.id}">
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="saved-item-name" style="font-weight:600;font-size:14px;border-bottom:1px dashed var(--accent);">${s.name}</span>
          ${isDeclinig ? '<span class="saved-decline-badge" title="Trend declining">🔴 Not in Trend</span>' : ''}
          ${s.pinned ? '<span class="saved-pin-badge" title="Pinned — protected from deletion">📌 Pinned</span>' : ''}
          ${s.platform ? `<span class="tag tag-blue">${s.platform}</span>` : ''}
          <span style="font-size:10px;color:${staleColor};" title="Last data refresh">
            ${isStale && !_autoRefreshInProgress ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--warning);margin-right:3px;animation:pulse 2s infinite;vertical-align:middle;"></span>' : ''}${staleText}
          </span>
        </div>
        <div class="saved-meta" style="margin-top:4px;">
          <span class="tag ${sourceClass}">${s.source}</span>
          ${s.country ? `<span class="tag tag-gray">${getFlag(s.country)} ${s.country}</span>` : ''}
          ${displayPrice ? `<span class="price mono">${displayPrice}</span>` : ''}
          ${s.margin ? `<span class="${s.margin >= 20 ? 'positive-text' : 'danger-text'} mono">${typeof s.margin === 'number' ? s.margin.toFixed(1) : s.margin}% margin</span>` : ''}
          ${displayCapital ? `<span class="muted">Cap ${displayCapital}</span>` : ''}
          ${s.category ? `<span class="muted" style="font-size:11px;">${s.category}</span>` : ''}
        </div>
        <div class="muted" style="font-size:11px;margin-top:4px;">${s.note ? s.note.slice(0,60) + (s.note.length > 60 ? '...' : '') : 'No notes'} • ${formatDate(s.savedAt || s.date)}</div>
      </div>
      <div class="row-actions" style="gap:6px;">
        <button class="btn btn-sm btn-primary" data-action="open-detail" data-id="${s.id}">📊 Details</button>
        <button class="btn btn-sm btn-refresh" data-action="refresh-saved" data-id="${s.id}" title="Refresh current data from AI" id="refresh-btn-${s.id}">🔄</button>
        <button
          class="btn btn-sm ${s.pinned ? 'btn-pin-active' : 'btn-pin'}"
          data-action="pin-saved"
          data-id="${s.id}"
          title="${s.pinned ? 'Unpin — allow deletion' : 'Pin — protect from deletion'}"
        >${s.pinned ? '📌' : '📌'}</button>
        ${s.pinned
          ? `<button class="btn btn-sm btn-danger" disabled title="Unpin first to delete" style="opacity:0.35;cursor:not-allowed;">✕</button>`
          : `<button class="btn btn-sm btn-danger" data-action="delete-saved" data-id="${s.id}">✕</button>`
        }
      </div>
    </div>`;
  }).join('');

  // ── Background auto-refresh for stale items (> 2 days) ──
  // Guard: skip if already running or caller said to skip
  if (skipAutoRefresh || _autoRefreshInProgress) return;

  const staleItems = saved.filter(s => {
    const lastRefresh = new Date(s.lastAutoRefresh || s.updatedAt || s.savedAt || 0).getTime();
    return (now - lastRefresh) > TWO_DAYS_MS;
  }).slice(0, 5); // max 5 per page-open

  if (staleItems.length === 0) return;

  _autoRefreshInProgress = true;
  Toast.info(`🔄 Auto-refreshing ${staleItems.length} stale item${staleItems.length > 1 ? 's' : ''} in background…`);

  // Fire-and-forget — does NOT call renderSaved() to avoid flicker
  (async () => {
    let refreshed = 0;
    for (const item of staleItems) {
      const btn = document.getElementById(`refresh-btn-${item.id}`);
      if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
      try {
        const updated = await refreshSavedProductDetail(item.id);
        if (updated) {
          refreshed++;
          // Update just the stale text in-place — no full re-render, no flicker
          const card = container.querySelector(`[data-id="${item.id}"]`);
          if (card) {
            const staleSpan = card.querySelector('[title="Last data refresh"]');
            if (staleSpan) staleSpan.innerHTML = `<span style="color:var(--positive);font-size:10px;">Updated just now</span>`;
          }
        }
      } catch (e) {
        console.warn('[AutoRefresh] Failed for', item.name, e.message);
      }
      if (btn) { btn.textContent = '🔄'; btn.disabled = false; }
    }
    _autoRefreshInProgress = false;
    if (refreshed > 0) {
      Toast.success(`✅ ${refreshed} item${refreshed > 1 ? 's' : ''} refreshed with latest data`);
    }
  })();
}

// Event delegation for saved list actions
document.addEventListener('click', async function(e) {
  // Open detail modal — product name click or Details button
  // Exclude all action buttons so they don't bubble up to open-detail
  const detailBtn = e.target.closest('[data-action="open-detail"]');
  if (detailBtn
    && !e.target.closest('[data-action="delete-saved"]')
    && !e.target.closest('[data-action="refresh-saved"]')
    && !e.target.closest('[data-action="pin-saved"]')
  ) {
    const id = parseInt(detailBtn.dataset.id);
    if (typeof SavedDetailModal !== 'undefined') {
      SavedDetailModal.open(id, window.db);
    } else if (typeof openSavedProductModal === 'function') {
      openSavedProductModal(id);
    } else {
      console.warn('[Saved] SavedDetailModal not loaded');
    }
    return;
  }

  // Delete saved item
  const delBtn = e.target.closest('[data-action="delete-saved"]');
  if (delBtn) {
    e.stopPropagation();
    const id = parseInt(delBtn.dataset.id);
    // Guard: check if pinned via REST API
    const item = await getSavedById(id);
    if (item?.pinned) {
      Toast.warning('📌 This item is pinned. Unpin it first to delete.');
      return;
    }
    if (!confirm('Remove this product?')) return;
    await deleteSaved(id);
    Toast.success('Item removed');
    await renderSaved(true);
    await renderDashboard();
    return;
  }

  // Pin / Unpin saved item
  const pinBtn = e.target.closest('[data-action="pin-saved"]');
  if (pinBtn) {
    e.stopPropagation();
    const id = parseInt(pinBtn.dataset.id);
    const item = await getSavedById(id);
    if (!item) return;
    const nowPinned = !item.pinned;
    await updateSaved(id, { pinned: nowPinned ? 1 : 0, pinnedAt: nowPinned ? new Date().toISOString() : null });
    Toast.success(nowPinned ? '📌 Product pinned — protected from deletion!' : '🗑 Product unpinned.');
    await renderSaved(true);
    return;
  }

  // Refresh saved item detail
  const refreshBtn = e.target.closest('[data-action="refresh-saved"]');
  if (refreshBtn) {
    e.stopPropagation();
    const id = parseInt(refreshBtn.dataset.id);
    refreshBtn.textContent = '⏳';
    refreshBtn.disabled = true;
    try {
      const updated = await refreshSavedProductDetail(id);
      if (updated) {
        Toast.success('🔄 Details refreshed for ' + (updated.name || 'item'));
      } else {
        Toast.warning('Could not refresh — server may be offline');
      }
    } catch (err) {
      Toast.error('Refresh failed: ' + err.message);
    }
    refreshBtn.textContent = '🔄';
    refreshBtn.disabled = false;
    await renderSaved();
    return;
  }

  const editBtn = e.target.closest('[data-action="edit-note"]');
  if (editBtn) {
    e.preventDefault();
    const id = parseInt(editBtn.dataset.id);
    const item = await db.saved.get(id);
    if (!item) return;

    const note = prompt('Note:', item.note || '');
    if (note !== null) {
      await updateSaved(id, { note });
      Toast.success('Note updated');
      await renderSaved();
    }
    return;
  }
});

async function exportSaved() {
  const saved = await getSaved();

  if (saved.length === 0) {
    Toast.warning('No items to export');
    return;
  }

  const currency = AppState.displayCurrency;

  let csv = 'Name,Source,Country,Price,Margin,Capital,Date,Note\n';
  saved.forEach(s => {
    const price = s.sp ? CurrencyEngine.convert(s.sp, s.currency || 'USD', currency).toFixed(2) : '';
    const capital = s.capital ? CurrencyEngine.convert(s.capital, s.currency || 'USD', currency).toFixed(2) : '';
    csv += `"${(s.name || '').replace(/"/g, '""')}","${s.source || ''}","${s.country || ''}","${price}","${s.margin || ''}","${capital}","${s.date || ''}","${(s.note || '').replace(/"/g, '""')}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ecommerce_products_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();

  Toast.success(`Exported ${saved.length} items to CSV`);
}

/* ============================================================
   FEATURE 6 — BULK IMPORT / EXPORT
   ============================================================ */

// Wire up import file input when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const importFile = document.getElementById('import-file');
  if (importFile) importFile.addEventListener('change', (e) => handleCSVImport(e.target.files[0]));
});

async function exportFullCSV() {
  const saved = await getSaved();
  if (!saved.length) { Toast.warning('No items to export'); return; }

  const headers = [
    'name','source','country','category','basePrice','sellingPrice',
    'platform','moq','landedCost','totalCost','profit','margin',
    'capital','breakEven','date','note'
  ];

  const rows = saved.map(item => [
    item.name, item.source, item.country, item.category,
    item.basePrice || '', item.sellingPrice || item.sp || '',
    item.platform || '', item.moq || '',
    item.landedCost || '', item.totalCost || '',
    item.profit || '', item.margin || '',
    item.capital || '', item.be || '',
    item.date || '', item.note || ''
  ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `eco_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  Toast.success(`Exported ${saved.length} items`);
}

function _parseCSVLine(line) {
  const result = []; let current = '', inQuotes = false;
  for (const char of line) {
    if (char === '"')          { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else                       { current += char; }
  }
  result.push(current.trim());
  return result.map(v => v.replace(/^"|"$/g, ''));
}

async function handleCSVImport(file) {
  if (!file) return;
  Toast.info('Importing CSV...');
  const text    = await file.text();
  const lines   = text.split('\n').filter(l => l.trim());
  const headers = _parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));
  const results = { success: 0, failed: 0, errors: [] };

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = _parseCSVLine(lines[i]);
      if (values.length < 2) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

      if (!row.name) { results.failed++; results.errors.push(`Row ${i}: Missing name`); continue; }

      const sp   = parseFloat(row.sellingprice || row.sp || 0);
      const base = parseFloat(row.baseprice || row.base || 0);
      let calc   = { margin: 0, capital: 0, be: Infinity, landed: base, totalCost: base, profit: 0 };

      if (typeof calculateProductFull === 'function' && (base > 0 || sp > 0)) {
        calc = calculateProductFull({
          basePrice: base, moq: parseInt(row.moq) || 30,
          inward: parseFloat(row.inward) || 8, gst: parseFloat(row.gst) || 18,
          itc: row.itc || 'no', platform: row.platform || 'amazon',
          sellingPrice: sp, packaging: parseFloat(row.packaging) || 12,
          returnRate: parseFloat(row.returnrate || row.returnRate) || 10,
          adSpend: parseFloat(row.adspend) || 0, misc: 4,
        });
      }

      const item = {
        name: row.name, source: 'import',
        country: row.country || AppState.selectedCountry || 'India',
        category: row.category || 'General',
        basePrice: base, sp, platform: row.platform || 'amazon',
        moq: parseInt(row.moq) || 30,
        margin: Math.round(calc.margin * 10) / 10,
        capital: Math.round(calc.capital),
        be: isFinite(calc.be) ? calc.be : 0,
        landedCost: Math.round(calc.landed),
        totalCost: Math.round(calc.totalCost),
        profit: Math.round(calc.profit),
        date: new Date().toISOString(),
        note: row.note || `Imported from CSV row ${i}`,
        currency: AppState.displayCurrency,
      };

      await addSaved(item);
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push(`Row ${i}: ${err.message}`);
    }
  }

  if (results.errors.length) console.warn('[Import errors]', results.errors.slice(0, 10));
  Toast[results.failed ? 'warning' : 'success'](`Import: ${results.success} added, ${results.failed} failed`);

  // Reset file input so same file can be re-imported
  const fi = document.getElementById('import-file');
  if (fi) fi.value = '';

  await renderSaved();
  await renderDashboard();
}

async function clearAllSavedItems() {
  if (!confirm('Are you sure you want to delete all unpinned saved products?')) return;
  const success = await clearUnpinned();
  if (success) {
    Toast.success('Cleared all unpinned items');
    await renderSaved();
    await renderDashboard();
  } else {
    Toast.error('Failed to clear items');
  }
}
