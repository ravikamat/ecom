/**
 * ECO Competitor Tracker v2.2
 * Monitors competitor prices, stock status, and Buy Box probability
 * Pure vanilla JS — no dependencies.
 */

const CompetitorTracker = (function() {
  'use strict';

  // ─── Storage ───
  const STORAGE_KEY = 'eco_competitors';

  function getStoredCompetitors() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) { return []; }
  }

  function saveStoredCompetitors(competitors) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(competitors));
  }

  // ─── Add/Remove Competitors ───
  function addCompetitor(productId, competitorUrl, platform, productName) {
    const competitors = getStoredCompetitors();
    const id = Date.now().toString(36);
    competitors.push({
      id,
      productId,
      url: competitorUrl,
      platform: platform || detectPlatform(competitorUrl),
      productName,
      addedAt: new Date().toISOString(),
      history: []
    });
    saveStoredCompetitors(competitors);
    return id;
  }

  function removeCompetitor(competitorId) {
    const competitors = getStoredCompetitors().filter(c => c.id !== competitorId);
    saveStoredCompetitors(competitors);
  }

  function getCompetitorsForProduct(productId) {
    return getStoredCompetitors().filter(c => c.productId === productId);
  }

  function detectPlatform(url) {
    if (url.includes('amazon')) return 'Amazon';
    if (url.includes('flipkart')) return 'Flipkart';
    if (url.includes('meesho')) return 'Meesho';
    if (url.includes('ebay')) return 'eBay';
    if (url.includes('etsy')) return 'Etsy';
    if (url.includes('snapdeal')) return 'Snapdeal';
    if (url.includes('myntra')) return 'Myntra';
    if (url.includes('jiomart')) return 'JioMart';
    return 'Other';
  }

  // ─── Price Scraping (via backend proxy) ───
  async function scrapeCompetitorPrice(competitorId) {
    const competitors = getStoredCompetitors();
    const comp = competitors.find(c => c.id === competitorId);
    if (!comp) return null;

    try {
      const res = await fetch(`/api/scrape/competitor?url=${encodeURIComponent(comp.url)}`);
      if (!res.ok) throw new Error('Scrape failed');
      const data = await res.json();

      const snapshot = {
        timestamp: new Date().toISOString(),
        price: data.price,
        currency: data.currency || 'INR',
        stockStatus: data.stockStatus || 'unknown',
        rating: data.rating,
        reviewCount: data.reviewCount,
        seller: data.seller,
        sellerRating: data.sellerRating,
        deliveryDays: data.deliveryDays,
        isPrime: data.isPrime || false,
        isFBA: data.isFBA || false,
        buyBoxWinner: data.buyBoxWinner || false
      };

      comp.history = comp.history || [];
      comp.history.push(snapshot);
      // Keep last 50 snapshots
      if (comp.history.length > 50) comp.history = comp.history.slice(-50);
      saveStoredCompetitors(competitors);

      return snapshot;
    } catch (e) {
      console.warn('Competitor scrape failed:', e);
      return null;
    }
  }

  // ─── Check All Competitors (background loop) ───
  async function checkAllCompetitors() {
    const competitors = getStoredCompetitors();
    const alerts = [];

    for (const comp of competitors) {
      const latest = await scrapeCompetitorPrice(comp.id);
      if (!latest) continue;

      const prev = comp.history.length > 1 ? comp.history[comp.history.length - 2] : null;
      if (prev && latest.price !== prev.price) {
        const change = ((latest.price - prev.price) / prev.price * 100).toFixed(1);
        const direction = latest.price < prev.price ? 'dropped' : 'raised';
        alerts.push({
          type: 'price_change',
          competitorId: comp.id,
          productId: comp.productId,
          productName: comp.productName,
          platform: comp.platform,
          oldPrice: prev.price,
          newPrice: latest.price,
          changePercent: change,
          direction,
          timestamp: latest.timestamp
        });
      }

      if (prev && prev.stockStatus !== latest.stockStatus && latest.stockStatus === 'out of stock') {
        alerts.push({
          type: 'stockout',
          competitorId: comp.id,
          productId: comp.productId,
          productName: comp.productName,
          platform: comp.platform,
          timestamp: latest.timestamp
        });
      }
    }

    return alerts;
  }

  // ─── Buy Box Win Probability ───
  function calculateBuyBoxProbability(product, competitors) {
    // Amazon-style Buy Box factors
    const factors = {
      price: 0.30,
      rating: 0.20,
      fulfillment: 0.20,
      sellerMetrics: 0.15,
      shipping: 0.10,
      responseTime: 0.05
    };

    const myScore = {
      price: normalizePrice(product.sellingPrice, competitors),
      rating: (product.rating || 4.0) / 5.0,
      fulfillment: product.isFBA ? 1.0 : product.isPrime ? 0.8 : 0.5,
      sellerMetrics: (product.sellerRating || 90) / 100,
      shipping: product.deliveryDays ? Math.max(0, 1 - product.deliveryDays / 10) : 0.5,
      responseTime: product.responseTimeHours ? Math.max(0, 1 - product.responseTimeHours / 24) : 0.5
    };

    let myWeighted = 0;
    for (const [key, weight] of Object.entries(factors)) {
      myWeighted += (myScore[key] || 0.5) * weight;
    }

    const compScores = competitors.map(c => {
      const latest = c.history?.[c.history.length - 1];
      if (!latest) return { score: 0, name: c.platform };
      const score = {
        price: normalizePrice(latest.price, competitors),
        rating: (latest.rating || 4.0) / 5.0,
        fulfillment: latest.isFBA ? 1.0 : latest.isPrime ? 0.8 : 0.5,
        sellerMetrics: (latest.sellerRating || 90) / 100,
        shipping: latest.deliveryDays ? Math.max(0, 1 - latest.deliveryDays / 10) : 0.5,
        responseTime: 0.5
      };
      let weighted = 0;
      for (const [key, weight] of Object.entries(factors)) {
        weighted += (score[key] || 0.5) * weight;
      }
      return { score: weighted, name: c.platform, price: latest.price };
    });

    const allScores = [{ score: myWeighted, name: 'You', isMe: true }, ...compScores];
    allScores.sort((a, b) => b.score - a.score);

    const myRank = allScores.findIndex(s => s.isMe) + 1;
    const total = allScores.length;
    const winProb = myRank === 1 ? 0.7 + (myWeighted - (allScores[1]?.score || 0)) * 0.3
                  : myRank === 2 ? 0.4
                  : myRank === 3 ? 0.2
                  : 0.1;

    return {
      winProbability: Math.min(0.95, Math.max(0.05, winProb)),
      myRank,
      totalCompetitors: total,
      myScore: myWeighted,
      competitorScores: allScores,
      factors: myScore
    };
  }

  function normalizePrice(price, competitors) {
    const prices = competitors.map(c => c.history?.[c.history.length - 1]?.price).filter(Boolean);
    prices.push(price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (max === min) return 1;
    return 1 - ((price - min) / (max - min)); // Lower price = higher score
  }

  // ─── AI Pricing Strategy ───
  async function suggestPricingStrategy(product, competitors) {
    const prompt = `Given my product and competitor data, suggest the best pricing strategy.

My Product:
- Price: ${product.sellingPrice}
- Rating: ${product.rating}
- Platform: ${product.platform}
- Margin: ${product.grossMargin}%

Competitors: ${JSON.stringify(competitors.map(c => ({
      platform: c.platform,
      price: c.history?.[c.history.length - 1]?.price,
      rating: c.history?.[c.history.length - 1]?.rating,
      stock: c.history?.[c.history.length - 1]?.stockStatus
    })))}

Return ONLY JSON: { "strategy": "match|undercut|hold|bundle|premium", "recommendedPrice": number, "rationale": "...", "riskLevel": "low|medium|high" }`;

    try {
      if (typeof callNvidiaAI === 'function') {
        const res = await callNvidiaAI(prompt, 'You are an Amazon pricing strategist.');
        return JSON.parse(res);
      }
    } catch (e) {}

    // Fallback heuristic
    const compPrices = competitors.map(c => c.history?.[c.history.length - 1]?.price).filter(Boolean);
    const avgCompPrice = compPrices.length ? compPrices.reduce((a, b) => a + b, 0) / compPrices.length : product.sellingPrice;

    if (product.sellingPrice > avgCompPrice * 1.1) {
      return { strategy: 'undercut', recommendedPrice: Math.round(avgCompPrice * 0.98), rationale: 'Your price is 10%+ above average competitor. Consider matching or slightly undercutting to win Buy Box.', riskLevel: 'medium' };
    }
    if (product.sellingPrice < avgCompPrice * 0.9) {
      return { strategy: 'premium', recommendedPrice: Math.round(avgCompPrice * 1.02), rationale: 'You are priced below market. Room to increase margin without losing competitiveness.', riskLevel: 'low' };
    }
    return { strategy: 'hold', recommendedPrice: product.sellingPrice, rationale: 'Your price is aligned with market. Monitor competitor moves.', riskLevel: 'low' };
  }

  // ─── UI Renderer ───
  function renderCompetitorTable(container, productId, product) {
    const competitors = getCompetitorsForProduct(productId);
    const buyBox = calculateBuyBoxProbability(product, competitors);

    container.innerHTML = `
      <div class="competitor-section">
        <div class="competitor-header">
          <h4>Competitor Intelligence</h4>
          <div class="buy-box-prob">
            <span class="buy-box-label">Buy Box Win Probability</span>
            <div class="buy-box-bar">
              <div class="buy-box-fill" style="width: ${buyBox.winProbability * 100}%"></div>
            </div>
            <span class="buy-box-value">${(buyBox.winProbability * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div class="competitor-add">
          <input type="url" id="new-comp-url" placeholder="Paste competitor product URL..." />
          <button id="btn-add-comp" class="btn btn-primary">Track</button>
        </div>
        <div class="competitor-list">
          ${competitors.length === 0 ? '<div class="empty-state">No competitors tracked yet. Add URLs above.</div>' : ''}
          ${competitors.map(c => {
            const latest = c.history?.[c.history.length - 1];
            const prev = c.history?.[c.history.length - 2];
            const priceChange = latest && prev ? ((latest.price - prev.price) / prev.price * 100).toFixed(1) : 0;
            const priceArrow = priceChange > 0 ? '↑' : priceChange < 0 ? '↓' : '→';
            const priceColor = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'same';
            return `
              <div class="competitor-card">
                <div class="comp-platform">${c.platform}</div>
                <div class="comp-price ${priceColor}">${latest ? 'Rs' + latest.price.toLocaleString() : 'N/A'} ${priceArrow} ${Math.abs(priceChange)}%</div>
                <div class="comp-stock">${latest ? (latest.stockStatus === 'in stock' ? 'In Stock' : 'Out of Stock') : 'Unknown'}</div>
                <div class="comp-rating">${latest ? '★' + latest.rating + ' (' + latest.reviewCount + ')' : ''}</div>
                <div class="comp-seller">${latest?.seller || ''}</div>
                <button class="btn-remove-comp" data-id="${c.id}">✕</button>
              </div>
            `;
          }).join('')}
        </div>
        ${competitors.length > 0 ? `
          <div class="competitor-strategy">
            <h5>AI Pricing Strategy</h5>
            <div id="pricing-strategy-result">Click "Analyze" to get AI recommendation...</div>
            <button id="btn-analyze-pricing" class="btn btn-primary">Analyze with AI</button>
          </div>
        ` : ''}
      </div>
    `;

    const addBtn = container.querySelector('#btn-add-comp');
    const urlInput = container.querySelector('#new-comp-url');
    const removeBtns = container.querySelectorAll('.btn-remove-comp');
    const analyzeBtn = container.querySelector('#btn-analyze-pricing');

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        addCompetitor(productId, url, null, product.name);
        urlInput.value = '';
        renderCompetitorTable(container, productId, product);
      });
    }

    removeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        removeCompetitor(btn.dataset.id);
        renderCompetitorTable(container, productId, product);
      });
    });

    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', async () => {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';
        const strategy = await suggestPricingStrategy(product, competitors);
        const resultDiv = container.querySelector('#pricing-strategy-result');
        resultDiv.innerHTML = `
          <div class="strategy-card ${strategy.riskLevel}">
            <div class="strategy-name">${strategy.strategy.toUpperCase()}</div>
            <div class="strategy-price">Recommended: ${(typeof getCurrencyConfig === 'function' ? getCurrencyConfig(AppState?.displayCurrency || 'INR').symbol : '₹')}${strategy.recommendedPrice.toLocaleString()}</div>
            <div class="strategy-rationale">${strategy.rationale}</div>
            <div class="strategy-risk">Risk: ${strategy.riskLevel}</div>
          </div>
        `;
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze with AI';
      });
    }
  }

  // ─── Public API ───
  return {
    addCompetitor,
    removeCompetitor,
    getCompetitorsForProduct,
    scrapeCompetitorPrice,
    checkAllCompetitors,
    calculateBuyBoxProbability,
    suggestPricingStrategy,
    renderCompetitorTable,
    detectPlatform
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CompetitorTracker;
}
