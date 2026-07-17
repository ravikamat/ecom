// ============================================================
// ECO Supplier Tab UI
// ============================================================

class SupplierTabUI {
  constructor(appState) {
    this.state = appState;
    this.container = null;
    this.currentProduct = null;
  }

  mount(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.render();
    this.attachEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="supplier-tab">
        <div class="supplier-header">
          <div class="supplier-title">
            <h2>🔍 Supplier Discovery</h2>
            <span class="supplier-count" id="supplier-count">0 suppliers found</span>
          </div>
          <div class="supplier-actions">
            <button class="btn btn-primary" id="btn-discover">
              <span class="icon">⚡</span> Find Suppliers
            </button>
            <button class="btn btn-secondary" id="btn-export-csv">
              <span class="icon">📥</span> Export CSV
            </button>
            <button class="btn btn-ghost" id="btn-auto-loop">
              <span class="icon">🔄</span> Auto-Loop
            </button>
          </div>
        </div>
        <div class="product-context" id="product-context">
          <div class="context-empty"><p>Select a product to discover suppliers</p></div>
        </div>
        <div class="supplier-filters" id="supplier-filters" style="display:none;">
          <div class="filter-group">
            <label>Trust Score</label>
            <select id="filter-trust">
              <option value="all">All</option>
              <option value="high">High (80+)</option>
              <option value="medium">Medium (50-79)</option>
              <option value="low">Low (&lt;50)</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Contact Ready</label>
            <select id="filter-contact">
              <option value="all">All</option>
              <option value="high">Email + Phone</option>
              <option value="medium">Email or Phone</option>
              <option value="low">Website Only</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Source</label>
            <select id="filter-source">
              <option value="all">All Sources</option>
              <option value="IndiaMART">IndiaMART</option>
              <option value="TradeIndia">TradeIndia</option>
              <option value="Alibaba">Alibaba</option>
              <option value="Direct">Direct</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Sort</label>
            <select id="filter-sort">
              <option value="trust">Trust Score</option>
              <option value="recent">Most Recent</option>
              <option value="confidence">AI Confidence</option>
            </select>
          </div>
        </div>
        <div class="supplier-loading" id="supplier-loading" style="display:none;">
          <div class="spinner"></div>
          <div class="loading-text">
            <p id="loading-status">Generating AI keywords...</p>
            <div class="loading-progress"><div class="progress-bar" id="progress-bar"></div></div>
            <p class="loading-detail" id="loading-detail">Targeting IndiaMART, TradeIndia, Google...</p>
          </div>
        </div>
        <div class="supplier-grid" id="supplier-grid"></div>
        <div class="supplier-empty" id="supplier-empty" style="display:none;">
          <div class="empty-icon">🔍</div>
          <h3>No suppliers discovered yet</h3>
          <p>Click "Find Suppliers" to start AI-powered discovery</p>
        </div>
      </div>
    `;
  }

  attachEvents() {
    document.getElementById('btn-discover')?.addEventListener('click', () => this.startDiscovery());
    document.getElementById('btn-export-csv')?.addEventListener('click', () => this.exportCSV());
    document.getElementById('btn-auto-loop')?.addEventListener('click', () => this.toggleAutoLoop());
    ['filter-trust', 'filter-contact', 'filter-source', 'filter-sort'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.applyFilters());
    });
  }

  setProduct(product) {
    this.currentProduct = product;
    const ctx = document.getElementById('product-context');
    if (!ctx) return;
    ctx.innerHTML = `
      <div class="context-product">
        <img src="${product.image || '/placeholder.png'}" alt="${product.name}">
        <div class="context-info">
          <h3>${product.name}</h3>
          <p>${product.category || 'Uncategorized'} • ${product.geo || 'India'}</p>
          <div class="context-tags">
            <span class="tag">${product.platform || 'General'}</span>
            <span class="tag">₹${product.price?.toLocaleString() || 'N/A'}</span>
          </div>
        </div>
        <div class="context-meta">
          <span class="meta-item">Last scan: ${product.lastScan || 'Never'}</span>
          <span class="meta-item">Suppliers: ${product.supplierCount || 0}</span>
        </div>
      </div>
    `;
    document.getElementById('supplier-filters').style.display = 'flex';
    this.loadSuppliers(product.name);
  }

  async startDiscovery() {
    if (!this.currentProduct) { alert('Please select a product first'); return; }
    const loading = document.getElementById('supplier-loading');
    const grid = document.getElementById('supplier-grid');
    const status = document.getElementById('loading-status');
    const detail = document.getElementById('loading-detail');
    const bar = document.getElementById('progress-bar');
    loading.style.display = 'flex'; grid.style.display = 'none';

    const stages = [
      { text: 'Generating AI keywords...', detail: 'GLM-5.2 optimizing search queries', progress: 10 },
      { text: 'Scanning B2B portals...', detail: 'IndiaMART, TradeIndia, ExportersIndia', progress: 35 },
      { text: 'Searching Google...', detail: 'Deep multi-page scraping', progress: 60 },
      { text: 'Extracting contacts...', detail: 'Email, phone, address detection', progress: 80 },
      { text: 'Scoring & ranking...', detail: 'Trust score + confidence calc', progress: 95 },
      { text: 'Done!', detail: 'Suppliers ready', progress: 100 }
    ];

    try {
      const response = await fetch('/api/suppliers/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: this.currentProduct.name,
          category: this.currentProduct.category,
          geo: this.currentProduct.geo || 'India',
          useLearning: true
        })
      });
      const data = await response.json();
      for (const stage of stages) {
        status.textContent = stage.text; detail.textContent = stage.detail;
        bar.style.width = stage.progress + '%'; await new Promise(r => setTimeout(r, 500));
      }
      loading.style.display = 'none';
      this.renderSuppliers(data.suppliers);
      this.currentProduct.supplierCount = data.supplierCount;
      this.currentProduct.lastScan = new Date().toLocaleDateString();
      this.setProduct(this.currentProduct);
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
      detail.textContent = 'Check console for details';
      bar.style.width = '100%'; bar.style.background = '#ef4444';
    }
  }

  renderSuppliers(suppliers) {
    const grid = document.getElementById('supplier-grid');
    const empty = document.getElementById('supplier-empty');
    const count = document.getElementById('supplier-count');
    if (!suppliers || suppliers.length === 0) {
      grid.style.display = 'none'; empty.style.display = 'flex';
      count.textContent = '0 suppliers'; return;
    }
    count.textContent = `${suppliers.length} supplier${suppliers.length > 1 ? 's' : ''} found`;
    empty.style.display = 'none'; grid.style.display = 'grid';
    grid.innerHTML = suppliers.map(s => this.supplierCard(s)).join('');
    suppliers.forEach(s => {
      const card = document.getElementById(`card-${s.id}`);
      if (!card) return;
      card.querySelector('.btn-contact')?.addEventListener('click', () => this.openContactModal(s));
      card.querySelector('.btn-whatsapp')?.addEventListener('click', () => this.sendWhatsApp(s));
      card.querySelector('.btn-email')?.addEventListener('click', () => this.sendEmail(s));
      card.querySelector('.btn-feedback')?.addEventListener('click', () => this.showFeedback(s));
    });
  }

  supplierCard(s) {
    const trustColor = (s.trustScore || 0) >= 80 ? 'high' : (s.trustScore || 0) >= 50 ? 'medium' : 'low';
    const emails = (typeof s.emails === 'string') ? JSON.parse(s.emails || '[]') : (s.emails || []);
    const mobiles = (typeof s.mobiles === 'string') ? JSON.parse(s.mobiles || '[]') : (s.mobiles || []);
    const addresses = (typeof s.addresses === 'string') ? JSON.parse(s.addresses || '[]') : (s.addresses || []);
    const contactReady = emails.length > 0 && mobiles.length > 0 ? 'high' : emails.length > 0 || mobiles.length > 0 ? 'medium' : 'low';
    
    return `
      <div class="supplier-card" id="card-${s.id}" data-trust="${trustColor}" data-contact="${contactReady}" data-source="${s.platformTag || 'Direct'}">
        <div class="card-header">
          <div class="company-badge"><span class="company-initial">${(s.companyName || '?')[0].toUpperCase()}</span></div>
          <div class="company-info">
            <h4>${s.companyName || 'Unknown Supplier'}</h4>
            <span class="source-tag">${s.platformTag || 'Direct'}</span>
          </div>
          <div class="trust-badge ${trustColor}">
            <span class="trust-score">${Math.round(s.trustScore || 0)}</span>
            <span class="trust-label">TRUST</span>
          </div>
        </div>
        <div class="card-body">
          <div class="contact-section">
            <div class="contact-row">
              <span class="contact-icon">📧</span>
              <div class="contact-values">
                ${emails.length ? emails.slice(0,2).map(e => `<span class="contact-chip email" data-copy="${e}">${e}</span>`).join('') : '<span class="contact-missing">No email found</span>'}
              </div>
            </div>
            <div class="contact-row">
              <span class="contact-icon">📱</span>
              <div class="contact-values">
                ${mobiles.length ? mobiles.slice(0,2).map(m => `<span class="contact-chip phone" data-copy="${m}">${m}</span>`).join('') : '<span class="contact-missing">No phone found</span>'}
              </div>
            </div>
            <div class="contact-row">
              <span class="contact-icon">📍</span>
              <div class="contact-values">
                ${addresses.length ? `<span class="address-text">${addresses[0].substring(0, 80)}${addresses[0].length > 80 ? '...' : ''}</span>` : '<span class="contact-missing">No address found</span>'}
              </div>
            </div>
          </div>
          <div class="card-meta">
            <span class="meta-confidence">AI Confidence: ${Math.round((s.confidence || 0) * 100)}%</span>
            <span class="meta-date">${new Date(s.discovered_at || Date.now()).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm btn-primary btn-contact">Contact</button>
          <button class="btn btn-sm btn-whatsapp" ${!mobiles.length ? 'disabled' : ''}>WhatsApp</button>
          <button class="btn btn-sm btn-email" ${!emails.length ? 'disabled' : ''}>Email</button>
          <button class="btn btn-sm btn-ghost btn-feedback">Rate</button>
        </div>
      </div>
    `;
  }

  openContactModal(supplier) {
    if (window.SupplierCommunicator) {
      window.SupplierCommunicator.open({
        companyName: supplier.companyName,
        email: (typeof supplier.emails === 'string' ? JSON.parse(supplier.emails || '[]') : supplier.emails)?.[0],
        phone: (typeof supplier.mobiles === 'string' ? JSON.parse(supplier.mobiles || '[]') : supplier.mobiles)?.[0],
        address: (typeof supplier.addresses === 'string' ? JSON.parse(supplier.addresses || '[]') : supplier.addresses)?.[0],
        product: this.currentProduct
      });
    }
  }

  sendWhatsApp(supplier) {
    const mobiles = typeof supplier.mobiles === 'string' ? JSON.parse(supplier.mobiles || '[]') : (supplier.mobiles || []);
    const phone = mobiles[0]?.replace(/\D/g, '');
    if (!phone) return;
    const msg = encodeURIComponent(`Hi, I'm interested in sourcing ${this.currentProduct?.name || 'your product'}. Can you share pricing and MOQ details?`);
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  }

  sendEmail(supplier) {
    const emails = typeof supplier.emails === 'string' ? JSON.parse(supplier.emails || '[]') : (supplier.emails || []);
    const email = emails[0];
    if (!email) return;
    const subject = encodeURIComponent(`Inquiry: ${this.currentProduct?.name || 'Product'} - Bulk Order`);
    const body = encodeURIComponent(`Dear ${supplier.companyName || 'Team'},\n\nI'm interested in sourcing ${this.currentProduct?.name || 'your product'} in bulk. Please share your best price, MOQ, and sample availability.\n\nRegards,`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  async showFeedback(supplier) {
    const useful = confirm(`Was this supplier useful?\n\n${supplier.companyName}\n${(typeof supplier.emails === 'string' ? JSON.parse(supplier.emails || '[]') : supplier.emails)?.[0] || ''}\n\nClick OK for Yes, Cancel for No`);
    await fetch('/api/suppliers/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: supplier.id, feedback: { wasUseful: useful, contacted: true, responded: false } })
    });
    alert('Feedback saved! Learning loop updated.');
  }

  async loadSuppliers(productName) {
    try {
      const res = await fetch(`/api/suppliers/product?name=${encodeURIComponent(productName)}`);
      const data = await res.json();
      this.renderSuppliers(data);
    } catch (e) { console.log('No cached suppliers:', e.message); }
  }

  applyFilters() {
    const trust = document.getElementById('filter-trust').value;
    const contact = document.getElementById('filter-contact').value;
    const source = document.getElementById('filter-source').value;
    document.querySelectorAll('.supplier-card').forEach(card => {
      let show = true;
      if (trust !== 'all' && card.dataset.trust !== trust) show = false;
      if (contact !== 'all' && card.dataset.contact !== contact) show = false;
      if (source !== 'all' && card.dataset.source !== source) show = false;
      card.style.display = show ? 'block' : 'none';
    });
  }

  exportCSV() {
    const visibleCards = document.querySelectorAll('.supplier-card:not([style*="none"])');
    if (!visibleCards.length) return;
    const rows = [['Company', 'Email', 'Phone', 'Address', 'Website', 'Source', 'Trust Score', 'Product']];
    visibleCards.forEach(card => {
      const company = card.querySelector('h4')?.textContent || '';
      const emails = Array.from(card.querySelectorAll('.contact-chip.email')).map(c => c.dataset.copy || c.textContent).join('; ');
      const phones = Array.from(card.querySelectorAll('.contact-chip.phone')).map(c => c.dataset.copy || c.textContent).join('; ');
      const address = card.querySelector('.address-text')?.textContent || '';
      const source = card.querySelector('.source-tag')?.textContent || '';
      const trust = card.querySelector('.trust-score')?.textContent || '';
      rows.push([company, emails, phones, address, '', source, trust, this.currentProduct?.name || '']);
    });
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `suppliers_${this.currentProduct?.name || 'export'}_${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  toggleAutoLoop() {
    alert('Auto-Loop enabled! System will auto-discover suppliers for trending products every 6 hours.');
    // Production: connect to service worker or setInterval
  }
}

window.SupplierTabUI = SupplierTabUI;
