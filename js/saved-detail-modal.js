/**
 * ECO Saved Product Detail Modal v2.2
 * Full-screen modal with tabs: Overview | Financials | Operations | Marketing | Supplier | Export
 * Pure vanilla JS — no dependencies.
 */

const SavedDetailModal = (function() {
  'use strict';

  let currentProduct = null;
  let currentTab = 'overview';

  // ─── Open Modal ───
  async function open(productId, db) {
    if (!db || !db.products) {
      console.error('DB not available');
      return;
    }

    currentProduct = await db.products.get(productId);
    if (!currentProduct) {
      console.error('Product not found:', productId);
      return;
    }

    // Normalize property names for financial-engine and templates
    currentProduct.sellingPrice = currentProduct.sp || currentProduct.sellingPrice || 0;
    currentProduct.basePrice = currentProduct.cp || currentProduct.basePrice || 0;
    currentProduct.costPrice = currentProduct.cp || currentProduct.costPrice || 0;
    currentProduct.monthlyUnits = currentProduct.moq * 3 || currentProduct.monthlyUnits || 100;
    currentProduct.dailySalesRate = currentProduct.dailySales || 3;
    currentProduct.platformFees = currentProduct.platformFees || currentProduct.sellingPrice * 0.15;
    currentProduct.shippingCost = currentProduct.shippingCost || 50;
    currentProduct.packagingCost = currentProduct.packagingCost || 12;
    currentProduct.adSpendMonthly = currentProduct.adSpendMonthly || 0;
    currentProduct.returnRate = currentProduct.returnRate || 0.10;

    // Ensure financials are calculated
    if (!currentProduct.ebitda && typeof FinancialEngine !== 'undefined') {
      const analysis = FinancialEngine.analyzeProduct(currentProduct);
      Object.assign(currentProduct, analysis);
      await db.products.put(currentProduct);
    }

    renderModal();
    bindEvents();
    showTab('overview');
  }

  // ─── Render Modal Structure ───
  function renderModal() {
    const existing = document.getElementById('saved-detail-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'saved-detail-modal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-container modal-lg">
        <div class="modal-header">
          <div class="modal-product-title">
            <img src="${currentProduct.imageUrl || 'https://via.placeholder.com/60'}" alt="" class="modal-thumb">
            <div>
              <h3>${escapeHtml(currentProduct.name)}</h3>
              <span class="modal-category">${currentProduct.category || 'General'} · ${currentProduct.platform || 'Multi-platform'}</span>
            </div>
          </div>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab active" data-tab="overview">Overview</button>
          <button class="modal-tab" data-tab="financials">Financials</button>
          <button class="modal-tab" data-tab="operations">Operations</button>
          <button class="modal-tab" data-tab="marketing">Marketing</button>
          <button class="modal-tab" data-tab="supplier">Supplier</button>
          <button class="modal-tab" data-tab="export">Export</button>
        </div>
        <div class="modal-body" id="modal-body">
          <!-- Content injected by showTab -->
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-edit-btn">✏️ Edit</button>
          <button class="btn btn-danger" id="modal-delete-btn">🗑️ Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  // ─── Show Tab ───
  function showTab(tabName) {
    currentTab = tabName;
    const body = document.getElementById('modal-body');
    if (!body) return;

    // Update tab buttons
    document.querySelectorAll('.modal-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Render content
    switch (tabName) {
      case 'overview': renderOverview(body); break;
      case 'financials': renderFinancials(body); break;
      case 'operations': renderOperations(body); break;
      case 'marketing': renderMarketing(body); break;
      case 'supplier': renderSupplier(body); break;
      case 'export': renderExport(body); break;
    }
  }

  // ─── Overview Tab ───
  function renderOverview(container) {
    const p = currentProduct;
    container.innerHTML = `
      <div class="tab-grid-2">
        <div class="info-card">
          <h5>Product Info</h5>
          <div class="info-row"><span>SKU</span><span>${p.sku || 'Not set'}</span></div>
          <div class="info-row"><span>HSN Code</span><span>${p.hsnCode || 'Not set'}</span></div>
          <div class="info-row"><span>GST Rate</span><span>${p.gstRate || 18}%</span></div>
          <div class="info-row"><span>Brand</span><span>${p.brand || 'Generic'}</span></div>
          <div class="info-row"><span>Country</span><span>${p.country || 'India'}</span></div>
          <div class="info-row"><span>Saved</span><span>${new Date(p.savedAt).toLocaleDateString()}</span></div>
        </div>
        <div class="info-card">
          <h5>Pricing</h5>
          <div class="info-row"><span>Base Cost</span><span>Rs${(p.basePrice || 0).toLocaleString()}</span></div>
          <div class="info-row"><span>Selling Price</span><span>Rs${(p.sellingPrice || 0).toLocaleString()}</span></div>
          <div class="info-row"><span>MRP</span><span>Rs${(p.mrp || Math.round((p.sellingPrice || 0) * 1.3)).toLocaleString()}</span></div>
          <div class="info-row"><span>Platform Fee</span><span>${p.platformFees || 0}%</span></div>
          <div class="info-row"><span>Shipping</span><span>Rs${(p.shippingCost || 0).toLocaleString()}</span></div>
          <div class="info-row"><span>Packaging</span><span>Rs${(p.packagingCost || 0).toLocaleString()}</span></div>
        </div>
        <div class="info-card">
          <h5>Market Data</h5>
          <div class="info-row"><span>Demand Score</span><span class="score-bar"><span class="score-fill" style="width:${p.demandScore || 0}%"></span>${p.demandScore || 0}/100</span></div>
          <div class="info-row"><span>Competition</span><span class="badge ${(p.competitionLevel || 'medium').toLowerCase()}">${p.competitionLevel || 'Medium'}</span></div>
          <div class="info-row"><span>Rating</span><span>★${p.rating || 0} (${p.reviews || 0} reviews)</span></div>
          <div class="info-row"><span>Trend</span><span>${p.trendDirection || 'Stable'}</span></div>
          <div class="info-row"><span>Social Buzz</span><span>${p.socialBuzz?.composite || 0}/100</span></div>
        </div>
        <div class="info-card">
          <h5>Quick Stats</h5>
          <div class="stat-grid">
            <div class="stat-item">
              <div class="stat-value">${(p.grossMargin || 0).toFixed(1)}%</div>
              <div class="stat-label">Gross Margin</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">Rs${Math.round(p.netProfit || 0).toLocaleString()}</div>
              <div class="stat-label">Net Profit/mo</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${p.breakEvenDays || 0}</div>
              <div class="stat-label">Break-even Days</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${(p.roi || 0).toFixed(0)}%</div>
              <div class="stat-label">ROI</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ─── Financials Tab ───
  function renderFinancials(container) {
    const p = currentProduct;
    const analysis = typeof FinancialEngine !== 'undefined' ? FinancialEngine.analyzeProduct(p) : p;

    container.innerHTML = `
      <div class="tab-grid-3">
        <div class="metric-card ${getMetricColor(analysis.grossMargin, 'margin')}">
          <div class="metric-label">Gross Margin</div>
          <div class="metric-value">${(analysis.grossMargin || 0).toFixed(1)}%</div>
          <div class="metric-sub">Rs${Math.round(analysis.grossProfit || 0).toLocaleString()} profit</div>
        </div>
        <div class="metric-card ${getMetricColor(analysis.ebitdaMargin, 'margin')}">
          <div class="metric-label">EBITDA Margin</div>
          <div class="metric-value">${(analysis.ebitdaMargin || 0).toFixed(1)}%</div>
          <div class="metric-sub">Rs${Math.round(analysis.ebitda || 0).toLocaleString()}/month</div>
        </div>
        <div class="metric-card ${getMetricColor(analysis.netProfitMargin, 'margin')}">
          <div class="metric-label">Net Profit Margin</div>
          <div class="metric-value">${(analysis.netProfitMargin || 0).toFixed(1)}%</div>
          <div class="metric-sub">Rs${Math.round(analysis.netProfit || 0).toLocaleString()}/month</div>
        </div>
        <div class="metric-card ${getMetricColor(analysis.roi, 'roi')}">
          <div class="metric-label">ROI</div>
          <div class="metric-value">${(analysis.roi || 0).toFixed(0)}%</div>
          <div class="metric-sub">On Rs${Math.round(analysis.investment || 0).toLocaleString()} investment</div>
        </div>
        <div class="metric-card ${getMetricColor(analysis.roas, 'roas')}">
          <div class="metric-label">ROAS</div>
          <div class="metric-value">${(analysis.roas || 0).toFixed(1)}x</div>
          <div class="metric-sub">Revenue per ad rupee</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">LTV:CAC Ratio</div>
          <div class="metric-value">${(analysis.ltvCacRatio || 0).toFixed(1)}</div>
          <div class="metric-sub">${analysis.ltvCacRatio >= 3 ? 'Healthy' : analysis.ltvCacRatio >= 1.5 ? 'Watch' : 'Unsustainable'}</div>
        </div>
      </div>
      <div class="financial-section">
        <h5>Unit Economics</h5>
        <div class="unit-econ-grid">
          <div class="econ-row">
            <span class="econ-label">Revenue per unit</span>
            <span class="econ-value">Rs${(analysis.unitEconomics?.revenue || 0).toLocaleString()}</span>
          </div>
          <div class="econ-row">
            <span class="econ-label">Total cost per unit</span>
            <span class="econ-value negative">Rs${(analysis.unitEconomics?.totalCost || 0).toLocaleString()}</span>
          </div>
          <div class="econ-row highlight">
            <span class="econ-label">Profit per unit</span>
            <span class="econ-value positive">Rs${(analysis.unitEconomics?.profit || 0).toLocaleString()}</span>
          </div>
          <div class="econ-row">
            <span class="econ-label">Margin per unit</span>
            <span class="econ-value">${(analysis.unitEconomics?.margin || 0).toFixed(1)}%</span>
          </div>
        </div>
      </div>
      <div class="financial-section">
        <h5>Break-Even Analysis</h5>
        <div class="be-grid">
          <div class="be-item">
            <div class="be-value">${Math.round(analysis.breakEvenUnits || 0).toLocaleString()}</div>
            <div class="be-label">Units to break even</div>
          </div>
          <div class="be-item">
            <div class="be-value">${Math.round(analysis.breakEvenDays || 0)}</div>
            <div class="be-label">Days to break even</div>
          </div>
          <div class="be-item">
            <div class="be-value">${(analysis.paybackPeriod || 0).toFixed(1)}</div>
            <div class="be-label">Payback period (months)</div>
          </div>
          <div class="be-item">
            <div class="be-value">${Math.round(analysis.workingCapital || 0).toLocaleString()}</div>
            <div class="be-label">Working capital needed</div>
          </div>
        </div>
      </div>
      <div class="financial-section">
        <h5>13-Week Cash Flow Projection</h5>
        <div class="cashflow-chart" id="cashflow-chart"></div>
      </div>
    `;

    // Render cash flow mini chart
    setTimeout(() => {
      if (typeof FinancialEngine !== 'undefined') {
        const cf = FinancialEngine.generateCashFlowProjection(p);
        renderMiniChart(document.getElementById('cashflow-chart'), cf, 'cashBalance');
      }
    }, 50);
  }

  // ─── Operations Tab ───
  function renderOperations(container) {
    const p = currentProduct;
    const daysRemaining = p.currentStock && p.dailySalesVelocity
      ? Math.round(p.currentStock / p.dailySalesVelocity)
      : Math.round(p.reorderPoint / 3) || 30;
    const status = daysRemaining < 15 ? 'critical' : daysRemaining < 30 ? 'warning' : 'ok';
    const statusLabel = daysRemaining < 15 ? '🔴 Reorder Now' : daysRemaining < 30 ? '🟡 Plan Reorder' : '🟢 OK';

    container.innerHTML = `
      <div class="tab-grid-2">
        <div class="info-card">
          <h5>Inventory Status</h5>
          <div class="inventory-status ${status}">
            <div class="status-badge-large">${statusLabel}</div>
            <div class="status-detail">${daysRemaining} days of stock remaining</div>
          </div>
          <div class="info-row"><span>Current Stock</span><span><input type="number" id="op-stock" value="${p.currentStock || p.moq || 100}" class="inline-input"></span></div>
          <div class="info-row"><span>Daily Sales Velocity</span><span><input type="number" id="op-velocity" value="${p.dailySalesVelocity || 3}" class="inline-input"></span></div>
          <div class="info-row"><span>Lead Time</span><span>${p.leadTime || 14} days</span></div>
          <div class="info-row"><span>Reorder Point</span><span>${Math.round(p.reorderPoint || (p.leadTime || 14) * (p.dailySalesVelocity || 3))} units</span></div>
          <div class="info-row"><span>Safety Stock</span><span>${Math.round(p.safetyStock || 15)} units</span></div>
          <div class="info-row"><span>EOQ</span><span>${Math.round(p.economicOrderQuantity || 200)} units</span></div>
          <button id="btn-update-inventory" class="btn btn-primary btn-sm">Update & Recalculate</button>
        </div>
        <div class="info-card">
          <h5>Competitor Tracking</h5>
          <div id="competitor-tracker-panel"></div>
        </div>
      </div>
      <div class="info-card">
        <h5>Compliance Checklist</h5>
        <div id="compliance-checklist"></div>
      </div>
    `;

    // Competitor tracker
    setTimeout(() => {
      const compPanel = document.getElementById('competitor-tracker-panel');
      if (compPanel && typeof CompetitorTracker !== 'undefined') {
        CompetitorTracker.renderCompetitorTable(compPanel, p.id, p);
      }
    }, 50);

    // Compliance checklist
    setTimeout(() => {
      const compList = document.getElementById('compliance-checklist');
      if (compList && typeof TaxEngine !== 'undefined') {
        const checklist = TaxEngine.getComplianceChecklist(p.category);
        compList.innerHTML = checklist.map(item => `
          <div class="checklist-item">
            <input type="checkbox" ${item.required ? 'checked disabled' : ''}>
            <span class="checklist-name">${item.item} ${item.required ? '<span class="required">*</span>' : ''}</span>
            <span class="checklist-desc">${item.description}</span>
          </div>
        `).join('');
      }
    }, 50);

    // Update inventory handler
    setTimeout(() => {
      const updateBtn = document.getElementById('btn-update-inventory');
      if (updateBtn) {
        updateBtn.addEventListener('click', async () => {
          updateBtn.disabled = true;
          const originalText = updateBtn.textContent;
          updateBtn.textContent = 'Updating...';
          try {
            const stockEl = document.getElementById('op-stock');
            const velocityEl = document.getElementById('op-velocity');
            
            if (!stockEl || !velocityEl) {
              throw new Error('Form elements not found');
            }
            
            const stock = parseInt(stockEl.value) || 0;
            const velocity = parseInt(velocityEl.value) || 0;
            p.currentStock = stock;
            p.dailySalesVelocity = velocity;
            p.daysRemaining = velocity > 0 ? Math.round(stock / velocity) : 0;
            
            // Recalculate reorder point
            if (typeof FinancialEngine !== 'undefined') {
              p.reorderPoint = FinancialEngine.calculateReorderPoint(p.leadTime || 14, velocity, p.safetyStock || 15);
              p.economicOrderQuantity = FinancialEngine.calculateEOQ((velocity * 365), 500, 10);
            }
            
            // Save
            if (!window.db || !window.db.products) {
              throw new Error('Database not available');
            }
            
            const result = await window.db.products.put(p);
            if (result === false) {
              throw new Error('Save operation returned false');
            }
            
            updateBtn.textContent = '✅ Updated!';
            if (typeof Toast !== 'undefined') {
              Toast.success('Inventory updated & recalculated');
            }
            showTab('operations');
            setTimeout(() => {
              updateBtn.textContent = originalText;
              updateBtn.disabled = false;
            }, 2000);
          } catch (err) {
            console.error('[UpdateInventory] Error:', err);
            updateBtn.textContent = '❌ Error';
            if (typeof Toast !== 'undefined') {
              Toast.error('Failed to update inventory: ' + (err.message || 'Unknown error'));
            }
            setTimeout(() => {
              updateBtn.textContent = originalText;
              updateBtn.disabled = false;
            }, 3000);
          }
        });
      }
    }, 50);
  }

  // ─── Marketing Tab ───
  function renderMarketing(container) {
    const p = currentProduct;
    container.innerHTML = `
      <div class="tab-grid-2">
        <div class="info-card">
          <h5>Listing Content</h5>
          <div class="field-group">
            <label>Title</label>
            <textarea id="mk-title" rows="2" class="field-textarea">${p.listingTitle || p.name || ''}</textarea>
          </div>
          <div class="field-group">
            <label>Description</label>
            <textarea id="mk-desc" rows="4" class="field-textarea">${p.listingDescription || p.description || ''}</textarea>
          </div>
          <div class="field-group">
            <label>Bullet Points</label>
            ${(p.bulletPoints || ['', '', '', '', '']).map((b, i) =>
              `<input type="text" id="mk-bullet-${i}" value="${b}" class="field-input" placeholder="Bullet ${i+1}">`
            ).join('')}
          </div>
          <div class="field-group">
            <label>Backend Keywords</label>
            <input type="text" id="mk-keywords" value="${(p.backendKeywords || []).join(', ')}" class="field-input" placeholder="Comma-separated keywords">
          </div>
          <button id="btn-ai-listing" class="btn btn-primary">🤖 Generate with AI</button>
          <button id="btn-save-listing" class="btn btn-secondary">💾 Save Listing</button>
        </div>
        <div class="info-card">
          <h5>SEO Score</h5>
          <div class="seo-score-circle">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#e0e0e0" stroke-width="8"/>
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--primary)" stroke-width="8"
                stroke-dasharray="${(p.listingScore || 50) * 2.83} 283" stroke-linecap="round" transform="rotate(-90 50 50)"/>
            </svg>
            <div class="seo-score-value">${p.listingScore || 50}</div>
          </div>
          <div class="seo-breakdown">
            <div class="seo-item"><span>Title length</span><span>${(p.listingTitle || '').length}/200</span></div>
            <div class="seo-item"><span>Bullet points</span><span>${(p.bulletPoints || []).filter(Boolean).length}/5</span></div>
            <div class="seo-item"><span>Description</span><span>${(p.listingDescription || '').length}/2000</span></div>
            <div class="seo-item"><span>Keywords</span><span>${(p.backendKeywords || []).length}/250</span></div>
            <div class="seo-item"><span>Images</span><span>${[p.imageUrl, p.imageUrl2, p.imageUrl3].filter(Boolean).length}/5+</span></div>
          </div>
        </div>
      </div>
      <div class="info-card">
        <h5>Ad Copy</h5>
        <div class="ad-copy-tabs">
          <button class="ad-tab active" data-ad="google">Google Ads</button>
          <button class="ad-tab" data-ad="facebook">Facebook</button>
          <button class="ad-tab" data-ad="amazon">Amazon PPC</button>
        </div>
        <div id="ad-copy-content" class="ad-copy-content">
          <div class="ad-preview">
            <div class="ad-headline">${p.adCopyGoogle?.headline || p.name}</div>
            <div class="ad-desc">${p.adCopyGoogle?.description || p.description?.substring(0, 90) || ''}</div>
            <div class="ad-url">www.yourstore.com/${(p.name || '').replace(/\s+/g, '-').toLowerCase()}</div>
          </div>
        </div>
        <button id="btn-gen-adcopy" class="btn btn-primary">Generate Ad Copy with AI</button>
      </div>
    `;

    // AI listing generator
    setTimeout(() => {
      const aiBtn = document.getElementById('btn-ai-listing');
      if (aiBtn) {
        aiBtn.addEventListener('click', async () => {
          aiBtn.disabled = true;
          aiBtn.textContent = 'Generating...';
          try {
            if (typeof callNvidiaAI !== 'function') {
              throw new Error('AI function not available');
            }
            const prompt = `Generate an SEO-optimized Amazon listing for: ${p.name}, Category: ${p.category}, Price: Rs${p.sellingPrice}. Return JSON: {title, description, bullets:[], backendKeywords:[], searchTerms:[]}`;
            const res = await callNvidiaAI(prompt, 'You are an Amazon SEO expert.');
            if (!res) {
              throw new Error('No response from AI');
            }
            const data = JSON.parse(res);
            document.getElementById('mk-title').value = data.title || '';
            document.getElementById('mk-desc').value = data.description || '';
            data.bullets?.forEach((b, i) => {
              const el = document.getElementById(`mk-bullet-${i}`);
              if (el) el.value = b;
            });
            document.getElementById('mk-keywords').value = (data.backendKeywords || []).join(', ');
            if (typeof Toast !== 'undefined') {
              Toast.success('Listing generated with AI');
            }
          } catch (e) {
            console.warn('[AI Listing Generation] Error:', e.message);
            if (typeof Toast !== 'undefined') {
              Toast.error('AI generation failed: ' + (e.message || 'Unknown error'));
            }
          } finally {
            aiBtn.disabled = false;
            aiBtn.textContent = '🤖 Generate with AI';
          }
        });
      }

      const saveBtn = document.getElementById('btn-save-listing');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
          try {
            // Get form values
            const titleEl = document.getElementById('mk-title');
            const descEl = document.getElementById('mk-desc');
            const keywordsEl = document.getElementById('mk-keywords');
            
            if (!titleEl || !descEl || !keywordsEl) {
              throw new Error('Form elements not found');
            }
            
            p.listingTitle = titleEl.value;
            p.listingDescription = descEl.value;
            p.bulletPoints = [0,1,2,3,4].map(i => {
              const el = document.getElementById(`mk-bullet-${i}`);
              return el ? el.value : '';
            }).filter(Boolean);
            p.backendKeywords = keywordsEl.value.split(',').map(k => k.trim()).filter(Boolean);
            
            // Save to DB
            if (!window.db || !window.db.products) {
              throw new Error('Database not available');
            }
            
            const result = await window.db.products.put(p);
            if (result === false) {
              throw new Error('Save operation returned false');
            }
            
            saveBtn.textContent = '✅ Saved!';
            setTimeout(() => {
              saveBtn.textContent = '💾 Save Listing';
              saveBtn.disabled = false;
            }, 2000);
          } catch (err) {
            console.error('[SaveListing] Error:', err);
            saveBtn.textContent = '❌ Error: ' + (err.message || 'Unknown error');
            if (typeof Toast !== 'undefined') {
              Toast.error('Failed to save listing: ' + (err.message || 'Unknown error'));
            }
            setTimeout(() => {
              saveBtn.textContent = '💾 Save Listing';
              saveBtn.disabled = false;
            }, 3000);
          }
        });
      }

      // Ad Copy switcher
      container.querySelectorAll('.ad-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.ad-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _updateAdCopyDisplay(p, btn.dataset.ad);
        });
      });

      // AI Ad Copy generator
      const adcopyBtn = document.getElementById('btn-gen-adcopy');
      if (adcopyBtn) {
        adcopyBtn.addEventListener('click', async () => {
          adcopyBtn.disabled = true;
          adcopyBtn.textContent = 'Generating...';
          try {
            if (typeof callNvidiaAI !== 'function') {
              throw new Error('AI function not available');
            }
            const prompt = `Generate Google, Facebook, and Amazon PPC ad copies for: ${p.name}, Category: ${p.category}. Return JSON: {
              "google": {"headline": "...", "description": "..."},
              "facebook": {"primaryText": "...", "headline": "...", "description": "..."},
              "amazon": {"headline": "...", "description": "..."}
            }`;
            const res = await callNvidiaAI(prompt, 'You are an e-commerce copywriting expert.');
            if (!res) {
              throw new Error('No response from AI');
            }
            const data = JSON.parse(res);
            p.adCopyGoogle = data.google || {};
            p.adCopyFacebook = data.facebook || {};
            p.adCopyAmazon = data.amazon || {};

            const activeTab = container.querySelector('.ad-tab.active');
            _updateAdCopyDisplay(p, activeTab ? activeTab.dataset.ad : 'google');
            if (typeof Toast !== 'undefined') {
              Toast.success('Ad copies generated with AI');
            }
          } catch (e) {
            console.warn('[AI AdCopy Generation] Error:', e.message);
            if (typeof Toast !== 'undefined') {
              Toast.error('Ad copy generation failed: ' + (e.message || 'Unknown error'));
            }
          } finally {
            adcopyBtn.disabled = false;
            adcopyBtn.textContent = 'Generate Ad Copy with AI';
          }
        });
      }
    }, 50);
  }

  // ─── Supplier Tab ───
  function renderSupplier(container) {
    const p = currentProduct;
    const supplier = {
      supplierName: p.supplierName || 'Unknown Supplier',
      supplierEmail: p.supplierEmail || '',
      supplierPhone: p.supplierPhone || '',
      supplierWhatsApp: p.supplierWhatsApp || '',
      businessName: p.businessName || 'My Store',
      contactName: p.contactName || 'Buyer',
      territory: p.country || 'India'
    };

    container.innerHTML = `
      <div class="tab-grid-2">
        <div class="info-card">
          <h5>Supplier Details</h5>
          <div class="info-row"><span>Name</span><span>${supplier.supplierName}</span></div>
          <div class="info-row"><span>Email</span><span>${supplier.supplierEmail || '<span class="missing">Not set</span>'}</span></div>
          <div class="info-row"><span>Phone</span><span>${supplier.supplierPhone || '<span class="missing">Not set</span>'}</span></div>
          <div class="info-row"><span>WhatsApp</span><span>${supplier.supplierWhatsApp || '<span class="missing">Not set</span>'}</span></div>
          <div class="info-row"><span>MOQ</span><span>${p.supplierMOQ || p.moq || 'N/A'}</span></div>
          <div class="info-row"><span>Listed Price</span><span>Rs${(p.supplierPrice || p.basePrice || 0).toLocaleString()}</span></div>
          <div class="info-row"><span>Lead Time</span><span>${p.leadTime || 14} days</span></div>
          <div class="info-row"><span>Reliability</span><span>${p.supplierReliabilityScore || 'N/A'}/100</span></div>
        </div>
        <div class="info-card">
          <h5>Communication History</h5>
          <div id="comm-history-panel"></div>
        </div>
      </div>
      <div class="comm-tabs">
        <button class="comm-tab active" data-comm="email">✉️ Email</button>
        <button class="comm-tab" data-comm="whatsapp">📱 WhatsApp</button>
      </div>
      <div id="comm-composer-panel"></div>
    `;

    // Communication history
    setTimeout(() => {
      const histPanel = document.getElementById('comm-history-panel');
      if (histPanel && typeof SupplierCommunicator !== 'undefined') {
        SupplierCommunicator.getCommunicationHistory(p.id, window.db).then(logs => {
          SupplierCommunicator.renderCommunicationHistory(histPanel, logs);
        });
      }
    }, 50);

    // Email/WhatsApp composer
    setTimeout(() => {
      const composerPanel = document.getElementById('comm-composer-panel');
      const commTabs = document.querySelectorAll('.comm-tab');

      function renderComposer(type) {
        if (!composerPanel) return;
        composerPanel.innerHTML = '';
        if (type === 'email' && typeof SupplierCommunicator !== 'undefined') {
          SupplierCommunicator.renderEmailComposer(composerPanel, p, supplier,
            (result) => console.log('Email generated:', result),
            (sent) => {
              if (typeof SupplierCommunicator !== 'undefined') {
                SupplierCommunicator.saveCommunicationLog(p.id, 'email', sent.body, null, window.db);
              }
            }
          );
        } else if (type === 'whatsapp' && typeof SupplierCommunicator !== 'undefined') {
          SupplierCommunicator.renderWhatsAppComposer(composerPanel, p, supplier,
            (result) => console.log('WhatsApp generated:', result),
            (sent) => {
              if (typeof SupplierCommunicator !== 'undefined') {
                SupplierCommunicator.saveCommunicationLog(p.id, 'whatsapp', sent.body, null, window.db);
              }
            }
          );
        }
      }

      commTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          commTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          renderComposer(tab.dataset.comm);
        });
      });

      renderComposer('email');
    }, 50);
  }

  // ─── Export Tab ───
  function renderExport(container) {
    const p = currentProduct;
    const platforms = [
      { id: 'amazon', name: 'Amazon', color: '#FF9900', icon: '🟠' },
      { id: 'flipkart', name: 'Flipkart', color: '#2874F0', icon: '🔵' },
      { id: 'meesho', name: 'Meesho', color: '#9C27B0', icon: '🟣' },
      { id: 'ebay', name: 'eBay', color: '#E53238', icon: '🔴' },
      { id: 'shopify', name: 'Shopify', color: '#96BF48', icon: '🟢' },
      { id: 'etsy', name: 'Etsy', color: '#F56400', icon: '🟠' },
      { id: 'google', name: 'Google Shopping', color: '#4285F4', icon: '🔵' },
      { id: 'facebook', name: 'Facebook Catalog', color: '#1877F2', icon: '🔵' }
    ];

    container.innerHTML = `
      <div class="export-grid">
        ${platforms.map(plat => {
          const validation = typeof ExportEngine !== 'undefined'
            ? ExportEngine.validateForPlatform(p, plat.id)
            : { valid: true, errors: [], warnings: [] };
          return `
            <div class="export-card ${validation.valid ? 'valid' : 'invalid'}">
              <div class="export-platform" style="border-color: ${plat.color}">
                <span class="export-icon">${plat.icon}</span>
                <span class="export-name">${plat.name}</span>
              </div>
              <div class="export-status">
                ${validation.valid
                  ? '<span class="badge good">✓ Ready</span>'
                  : `<span class="badge bad">${validation.errors.length} errors</span>`
                }
                ${validation.warnings.length > 0 ? `<span class="badge warn">${validation.warnings.length} warnings</span>` : ''}
              </div>
              <div class="export-errors">
                ${validation.errors.map(e => `<div class="error-item">❌ ${e}</div>`).join('')}
                ${validation.warnings.map(w => `<div class="warn-item">⚠️ ${w}</div>`).join('')}
              </div>
              <button class="btn btn-export" data-platform="${plat.id}" ${!validation.valid ? 'disabled' : ''}>
                📥 Download ${plat.name} File
              </button>
            </div>
          `;
        }).join('')}
      </div>
      <div class="export-bulk">
        <h5>Bulk Export</h5>
        <p>Export all saved products at once:</p>
        <button id="btn-export-all-csv" class="btn btn-secondary">📤 Export All as CSV</button>
        <button id="btn-export-catalog-pdf" class="btn btn-secondary">📄 Generate Catalog PDF</button>
      </div>
    `;

    // Platform export handlers
    setTimeout(() => {
      container.querySelectorAll('.btn-export').forEach(btn => {
        btn.addEventListener('click', () => {
          const platform = btn.dataset.platform;
          if (typeof ExportEngine !== 'undefined') {
            let result;
            switch (platform) {
              case 'amazon': result = ExportEngine.generateAmazonFlatFile([p]); break;
              case 'flipkart': result = ExportEngine.generateFlipkartCSV([p]); break;
              case 'meesho': result = ExportEngine.generateMeeshoCSV([p]); break;
              case 'ebay': result = ExportEngine.generateEbayCSV([p]); break;
              case 'shopify': result = ExportEngine.generateShopifyJSON([p]); break;
              case 'etsy': result = ExportEngine.generateEtsyCSV([p]); break;
              case 'google': result = ExportEngine.generateGoogleShoppingXML([p]); break;
              case 'facebook': result = ExportEngine.generateFacebookCatalogCSV([p]); break;
            }
            if (result) {
              ExportEngine.download(result.content, result.filename, result.mime);
              p[`exportedTo${platform.charAt(0).toUpperCase() + platform.slice(1)}`] = true;
              p.lastExportedAt = new Date().toISOString();
              if (window.db && window.db.products) {
                window.db.products.put(p);
              }
            }
          }
        });
      });

      // Bulk export CSV listener
      const csvAllBtn = document.getElementById('btn-export-all-csv');
      if (csvAllBtn) {
        csvAllBtn.addEventListener('click', () => {
          if (typeof exportFullCSV === 'function') {
            exportFullCSV();
          } else {
            Toast.error('CSV export function not found');
          }
        });
      }

      // Catalog PDF listener
      const pdfBtn = document.getElementById('btn-export-catalog-pdf');
      if (pdfBtn) {
        pdfBtn.addEventListener('click', () => {
          const printWindow = window.open('', '_blank');
          printWindow.document.write(`
            <html>
            <head>
              <title>Product Catalog - ${escapeHtml(p.name)}</title>
              <style>
                body { font-family: system-ui, sans-serif; padding: 40px; color: #333; }
                .header { border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 20px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                h1 { color: #6366f1; margin: 0; }
                .price { font-size: 24px; font-weight: bold; color: #10b981; }
                .section { margin-top: 30px; }
                .section-title { font-weight: bold; font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>${escapeHtml(p.name)}</h1>
                <p>Category: ${escapeHtml(p.category) || 'General'} | Source: ${escapeHtml(p.source) || 'Discover'}</p>
              </div>
              <div class="grid">
                <div>
                  <div class="section-title">Pricing Details</div>
                  <p>Selling Price: <span class="price">${escapeHtml(p.currency)} ${(p.sellingPrice || 0).toLocaleString()}</span></p>
                  <p>Cost Price: ${escapeHtml(p.currency)} ${(p.costPrice || 0).toLocaleString()}</p>
                  <p>Margin: ${p.margin}%</p>
                  <p>MOQ: ${p.moq} units</p>
                </div>
                <div>
                  <div class="section-title">Market Data</div>
                  <p>Demand Score: ${p.demand}/100</p>
                  <p>Winner Score: ${p.winner_score}/100</p>
                  <p>Trend Status: ${escapeHtml(p.trend_status)}</p>
                </div>
              </div>
              <div class="section">
                <div class="section-title">Notes & Details</div>
                <p>${escapeHtml(p.note) || 'No notes added yet.'}</p>
              </div>
              <script>
                window.onload = function() { window.print(); }
              </script>
            </body>
            </html>
          `);
          printWindow.document.close();
        });
      }
    }, 50);
  }

  // ─── Bind Events ───
  function bindEvents() {
    // Clean up old listeners before adding new ones (prevents accumulation)
    const oldModal = document.getElementById('saved-detail-modal');
    if (!oldModal) return;

    // Close
    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) {
      closeBtn.onclick = null;
      closeBtn.addEventListener('click', close);
    }

    const modalOverlay = document.getElementById('saved-detail-modal');
    if (modalOverlay) {
      modalOverlay.onclick = null;
      modalOverlay.addEventListener('click', (e) => {
        if (e.target.id === 'saved-detail-modal') close();
      });
    }

    // Escape key handler - bind only once to document
    const escapeHandler = (e) => {
      if (e.key === 'Escape') close();
    };
    document.removeEventListener('keydown', escapeHandler);
    document.addEventListener('keydown', escapeHandler);

    // Tabs
    const tabs = document.querySelectorAll('.modal-tab');
    tabs.forEach(tab => {
      tab.onclick = null;
      tab.addEventListener('click', () => showTab(tab.dataset.tab));
    });

    // Edit
    const editBtn = document.getElementById('modal-edit-btn');
    if (editBtn) {
      editBtn.onclick = null;
      editBtn.addEventListener('click', async () => {
        try {
          const newSp = prompt('Change Selling Price:', currentProduct.sp || currentProduct.sellingPrice);
          if (newSp === null) return;
          const newCp = prompt('Change Cost Price (Base):', currentProduct.cp || currentProduct.basePrice);
          if (newCp === null) return;
          const newMoq = prompt('Change MOQ:', currentProduct.moq);
          if (newMoq === null) return;
          const newNote = prompt('Change Note:', currentProduct.note);
          if (newNote === null) return;

          const updates = {
            sp: parseFloat(newSp) || 0,
          cp: parseFloat(newCp) || 0,
          moq: parseInt(newMoq) || 50,
          note: newNote
        };

        if (!window.db || !window.db.saved) {
          throw new Error('Database not available');
        }
        const result = await window.db.saved.update(currentProduct.id, updates);
        if (result === false) {
          throw new Error('Update operation returned false');
        }
        Toast.success('Product updated!');
        close();
        if (typeof renderSaved === 'function') {
          renderSaved();
        }
      } catch (err) {
        console.error('[Edit] Error:', err);
        Toast.error('Failed to update product: ' + (err.message || 'Unknown error'));
      }
    });

    // Delete
    document.getElementById('modal-delete-btn').addEventListener('click', async () => {
      if (confirm('Delete this product? This cannot be undone.')) {
        try {
          if (!window.db || !window.db.products) {
            throw new Error('Database not available');
          }
          const result = await window.db.products.delete(currentProduct.id);
          if (result === false) {
            throw new Error('Delete operation returned false');
          }
          Toast.success('Product deleted!');
          close();
          if (typeof renderSaved === 'function') {
            renderSaved();
          }
        } catch (err) {
          console.error('[Delete] Error:', err);
          Toast.error('Failed to delete product: ' + (err.message || 'Unknown error'));
        }
      }
    });
  }

  // ─── Close ───
  function close() {
    const modal = document.getElementById('saved-detail-modal');
    if (modal) {
      modal.remove();
      document.body.style.overflow = '';
    }
    currentProduct = null;
  }

  // ─── Helpers ───
  function _updateAdCopyDisplay(p, type) {
    const container = document.getElementById('ad-copy-content');
    if (!container) return;

    if (type === 'google') {
      container.innerHTML = `
        <div class="ad-preview">
          <div class="ad-headline">${p.adCopyGoogle?.headline || p.name}</div>
          <div class="ad-desc">${p.adCopyGoogle?.description || p.description?.substring(0, 90) || ''}</div>
          <div class="ad-url">www.yourstore.com/${(p.name || '').replace(/\s+/g, '-').toLowerCase()}</div>
        </div>`;
    } else if (type === 'facebook') {
      container.innerHTML = `
        <div class="ad-preview fb-preview">
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">Sponsored</div>
          <div class="ad-desc" style="font-size:14px;margin-bottom:8px;">${p.adCopyFacebook?.primaryText || p.description || ''}</div>
          <div style="border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface);">
            <div style="height:120px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;color:var(--accent);font-weight:bold;">Ad Creative Image</div>
            <div style="padding:8px;">
              <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;">${p.platform || 'Facebook'}</div>
              <div class="ad-headline" style="font-size:14px;font-weight:bold;">${p.adCopyFacebook?.headline || p.name}</div>
              <div class="ad-desc" style="font-size:12px;color:var(--text-tertiary);">${p.adCopyFacebook?.description || ''}</div>
            </div>
          </div>
        </div>`;
    } else if (type === 'amazon') {
      container.innerHTML = `
        <div class="ad-preview">
          <div class="ad-headline" style="color:var(--warning);font-size:13px;font-weight:600;text-transform:uppercase;">Sponsored</div>
          <div class="ad-headline" style="font-size:15px;font-weight:bold;margin:4px 0;">${p.adCopyAmazon?.headline || p.name}</div>
          <div class="ad-desc" style="font-size:13px;">${p.adCopyAmazon?.description || p.description?.substring(0, 120) || ''}</div>
          <div style="margin-top:6px;font-size:12px;color:var(--text-tertiary);">★★★★★ (100+)</div>
        </div>`;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getMetricColor(value, type) {
    const thresholds = {
      margin: { good: 30, warn: 15 },
      roi: { good: 50, warn: 20 },
      roas: { good: 3, warn: 1.5 }
    };
    const t = thresholds[type];
    if (!t) return '';
    if (value >= t.good) return 'good';
    if (value >= t.warn) return 'warn';
    return 'bad';
  }

  function renderMiniChart(container, data, key) {
    if (!container || !data.length) return;
    const max = Math.max(...data.map(d => d[key]));
    const min = Math.min(...data.map(d => d[key]));
    const range = max - min || 1;
    const bars = data.map((d, i) => {
      const height = ((d[key] - min) / range) * 100;
      const color = d[key] >= 0 ? 'var(--primary)' : 'var(--danger)';
      return `<div class="mini-bar" style="height:${Math.max(5, height)}%;background:${color}" title="Week ${d.week}: Rs${d[key].toLocaleString()}"></div>`;
    }).join('');
    container.innerHTML = `<div class="mini-chart">${bars}</div>`;
  }

  // ─── Public API ───
  return {
    open,
    close,
    showTab
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SavedDetailModal;
}
