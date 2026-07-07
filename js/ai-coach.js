/**
 * ECO AI Business Coach v2.2
 * Floating widget with context-aware advice, weekly reports, Q&A
 * Integrates with NVIDIA GLM-5.2 via ai-engine.js
 * Pure vanilla JS — no dependencies.
 */

const AIBusinessCoach = (function() {
  'use strict';

  let isOpen = false;
  let currentContext = { page: 'dashboard', data: {} };

  // ─── Context-Aware Advice Prompts ───
  const CONTEXT_PROMPTS = {
    dashboard: (data) => `You are an e-commerce business coach. Analyze this seller's dashboard data and give ONE specific, actionable insight in 2-3 sentences.

Data:
- Total products saved: ${data.totalProducts || 0}
- Average margin: ${data.avgMargin || 0}%
- Products needing reorder: ${data.reorderCount || 0}
- Total working capital needed: Rs${data.workingCapital || 0}
- Top performing product: ${data.topProduct || 'None'}
- Lowest margin product: ${data.worstProduct || 'None'}

Focus on: what they should do THIS WEEK to improve profitability. Be direct, no fluff.`,

    saved: (data) => `You are an e-commerce business coach. This seller is viewing their saved products list.

Data:
- Saved products: ${data.totalProducts || 0}
- Products with low margin (<20%): ${data.lowMarginCount || 0}
- Products not yet exported: ${data.unexportedCount || 0}
- Products with no supplier contact: ${data.noSupplierCount || 0}

Give ONE specific action they should take right now.`,

    calculator: (data) => `You are an e-commerce business coach. This seller is calculating costs for a product.

Data:
- Product: ${data.productName || 'Unknown'}
- Selling price: Rs${data.sellingPrice || 0}
- Base cost: Rs${data.basePrice || 0}
- Projected margin: ${data.margin || 0}%
- Ad spend per unit: Rs${data.adSpend || 0}
- Platform fees: ${data.platformFees || 0}%

Give ONE specific recommendation to improve unit economics. Be specific with numbers.`,

    trending: (data) => `You are an e-commerce business coach. This seller is browsing trending products.

Data:
- Current filter: ${data.filter || 'All'}
- Top trend score in view: ${data.topTrendScore || 0}
- Products with <3 suppliers: ${data.lowSupplierCount || 0}
- Social viral products: ${data.viralCount || 0}

Identify ONE high-opportunity product type or niche they should investigate immediately.`,

    search: (data) => `You are an e-commerce business coach. This seller just searched for "${data.query || ''}".

Data:
- Search results: ${data.resultCount || 0}
- Average competitor price: Rs${data.avgCompetitorPrice || 0}
- Price gap from cheapest supplier: Rs${data.priceGap || 0}

Suggest ONE sourcing or pricing strategy based on these results.`,

    supplier: (data) => `You are an e-commerce business coach. This seller is viewing supplier details.

Data:
- Supplier: ${data.supplierName || 'Unknown'}
- Reliability score: ${data.reliability || 0}/100
- Response time: ${data.responseTime || 'Unknown'}
- Products from this supplier: ${data.productCount || 0}

Advise on whether to proceed with this supplier and what terms to negotiate.`,

    inventory: (data) => `You are an e-commerce business coach. This seller is managing inventory.

Data:
- Products in stock: ${data.inStock || 0}
- Products needing reorder: ${data.reorderNeeded || 0}
- Dead stock items: ${data.deadStock || 0}
- Average days of inventory: ${data.avgDays || 0}

Give ONE inventory optimization action for this week.`
  };

  // ─── Initialize Widget ───
  function init(containerSelector = 'body') {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const widget = document.createElement('div');
    widget.id = 'ai-coach-widget';
    widget.innerHTML = `
      <button id="coach-toggle" class="coach-toggle" aria-label="AI Business Coach">
        <span class="coach-icon">🧠</span>
        <span class="coach-pulse"></span>
      </button>
      <div id="coach-panel" class="coach-panel hidden">
        <div class="coach-header">
          <h4>🧠 AI Business Coach</h4>
          <button id="coach-close" class="coach-close">✕</button>
        </div>
        <div class="coach-body">
          <div id="coach-message" class="coach-message">
            <div class="coach-typing">
              <span></span><span></span><span></span>
            </div>
          </div>
          <div id="coach-actions" class="coach-actions"></div>
        </div>
        <div class="coach-footer">
          <input type="text" id="coach-input" placeholder="Ask me anything about your business..." />
          <button id="coach-send" class="coach-send">➤</button>
        </div>
      </div>
    `;
    container.appendChild(widget);

    // Event listeners
    document.getElementById('coach-toggle').addEventListener('click', togglePanel);
    document.getElementById('coach-close').addEventListener('click', closePanel);
    document.getElementById('coach-send').addEventListener('click', handleUserQuestion);
    document.getElementById('coach-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleUserQuestion();
    });

    // Keyboard shortcut: Ctrl+/
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        togglePanel();
      }
    });

    // Auto-show advice on page change
    setTimeout(() => generateContextualAdvice(), 2000);
  }

  // ─── Panel Controls ───
  function togglePanel() {
    const panel = document.getElementById('coach-panel');
    isOpen = !isOpen;
    panel.classList.toggle('hidden', !isOpen);
    if (isOpen) {
      document.getElementById('coach-input').focus();
      generateContextualAdvice();
    }
  }

  function closePanel() {
    isOpen = false;
    document.getElementById('coach-panel').classList.add('hidden');
  }

  // ─── Set Context ───
  function setContext(page, data = {}) {
    currentContext = { page, data };
    if (isOpen) generateContextualAdvice();
  }

  // ─── Generate Contextual Advice ───
  async function generateContextualAdvice() {
    const messageDiv = document.getElementById('coach-message');
    const actionsDiv = document.getElementById('coach-actions');

    showTyping(messageDiv);

    const promptFn = CONTEXT_PROMPTS[currentContext.page];
    if (!promptFn) {
      showMessage(messageDiv, 'Welcome to your AI Business Coach! Ask me anything about your products, margins, or strategy.');
      return;
    }

    const prompt = promptFn(currentContext.data);

    try {
      let advice = '';
      if (typeof callNvidiaAI === 'function') {
        advice = await callNvidiaAI(prompt, 'You are a direct, no-nonsense e-commerce business coach. Give specific, actionable advice with numbers. Never be vague. Max 3 sentences.');
      } else {
        advice = getFallbackAdvice(currentContext.page, currentContext.data);
      }
      showMessage(messageDiv, advice);
      generateQuickActions(actionsDiv, currentContext.page, currentContext.data);
    } catch (e) {
      showMessage(messageDiv, getFallbackAdvice(currentContext.page, currentContext.data));
    }
  }

  // ─── Handle User Question ───
  async function handleUserQuestion() {
    const input = document.getElementById('coach-input');
    const question = input.value.trim();
    if (!question) return;

    const messageDiv = document.getElementById('coach-message');
    const actionsDiv = document.getElementById('coach-actions');

    // Show user question
    showMessage(messageDiv, `<strong>You:</strong> ${question}`);
    input.value = '';

    showTyping(messageDiv);

    const contextData = JSON.stringify(currentContext.data).substring(0, 500);
    const prompt = `Seller asks: "${question}"
Current page: ${currentContext.page}
Business data: ${contextData}

Answer in 2-3 sentences. Be specific, use numbers where possible. If you need more data, say exactly what. If the question is outside e-commerce, say "I specialize in e-commerce advice."`;

    try {
      let answer = '';
      if (typeof callNvidiaAI === 'function') {
        answer = await callNvidiaAI(prompt, 'You are an e-commerce business coach. Give concise, actionable answers. Use bullet points for lists.');
      } else {
        answer = getFallbackAnswer(question, currentContext.page);
      }
      showMessage(messageDiv, `<strong>Coach:</strong> ${answer}`);
    } catch (e) {
      showMessage(messageDiv, `<strong>Coach:</strong> ${getFallbackAnswer(question, currentContext.page)}`);
    }
  }

  // ─── Weekly Report ───
  async function generateWeeklyReport(businessData) {
    const prompt = `Generate a weekly business report for this e-commerce seller.

Data:
${JSON.stringify(businessData, null, 2)}

Format as markdown with these sections:
1. **Executive Summary** (2 sentences)
2. **Key Metrics** (bullet points with numbers)
3. **Top Performers** (best 3 products)
4. **Alerts** (what needs attention)
5. **Action Items** (3 specific tasks for next week)
6. **AI Recommendations** (2 strategic suggestions)

Keep it under 400 words. Use emojis for visual scanning.`;

    try {
      if (typeof callNvidiaAI === 'function') {
        return await callNvidiaAI(prompt, 'You are a senior e-commerce analyst writing weekly reports.');
      }
    } catch (e) {}

    return getFallbackWeeklyReport(businessData);
  }

  // ─── Quick Actions Generator ───
  function generateQuickActions(container, page, data) {
    const actions = {
      dashboard: [
        { label: 'View Low Margin Products', action: () => navigateTo('saved', { filter: 'low-margin' }) },
        { label: 'Check Inventory Alerts', action: () => navigateTo('inventory') },
        { label: 'Generate Weekly Report', action: () => generateWeeklyReport(data) }
      ],
      saved: [
        { label: 'Export Best Products', action: () => exportTopProducts() },
        { label: 'Contact Suppliers', action: () => navigateTo('suppliers') },
        { label: 'Run Price Analysis', action: () => runPriceAnalysis() }
      ],
      calculator: [
        { label: 'Compare Platforms', action: () => showPlatformComparison() },
        { label: 'Check Tax Impact', action: () => showTaxBreakdown() },
        { label: 'Save This Product', action: () => saveCurrentProduct() }
      ],
      trending: [
        { label: 'Deep Research Top Pick', action: () => deepResearchTop() },
        { label: 'Save Viral Products', action: () => saveViralProducts() },
        { label: 'Check Social Buzz', action: () => showSocialTrends() }
      ]
    };

    const pageActions = actions[page] || [];
    container.innerHTML = pageActions.map(a =>
      `<button class="coach-action-btn" data-action="${a.label}">${a.label}</button>`
    ).join('');

    container.querySelectorAll('.coach-action-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (pageActions[i]) pageActions[i].action();
      });
    });
  }

  // ─── UI Helpers ───
  function showTyping(container) {
    container.innerHTML = `
      <div class="coach-typing">
        <span></span><span></span><span></span>
      </div>
    `;
  }

  function showMessage(container, html) {
    container.innerHTML = `<div class="coach-bubble">${html}</div>`;
  }

  // ─── Fallback Advice (No AI) ───
  function getFallbackAdvice(page, data) {
    const advices = {
      dashboard: data.avgMargin < 20
        ? `Your average margin is ${data.avgMargin}%, which is below the healthy 30% benchmark. Focus on products with margins above 35% — consider raising prices on ${data.worstProduct || 'low-margin items'} or negotiating better supplier terms.`
        : `Strong portfolio! Your ${data.topProduct || 'top product'} is performing well. With ${data.reorderCount || 0} products needing reorder, prioritize restocking to avoid stockouts.`,

      saved: data.lowMarginCount > 0
        ? `${data.lowMarginCount} of your saved products have margins below 20%. Review pricing or find alternative suppliers. Start with the worst performer.`
        : `All your saved products look healthy. ${data.unexportedCount || 0} products haven't been exported yet — pick your top 3 and list them today.`,

      calculator: data.margin < 15
        ? `Warning: Your projected margin is only ${data.margin}%. At this level, one return or ad cost spike wipes out profit. Try raising price by 15% or cutting COGS by negotiating MOQ.`
        : `${data.margin}% margin is solid. To improve further: reduce packaging costs (switch to poly mailers) or bundle with a low-cost accessory to increase AOV.`,

      trending: data.viralCount > 0
        ? `${data.viralCount} products are trending on social media right now. These have short windows — contact suppliers immediately for exclusive terms before competition catches up.`
        : `No viral products in current view. Try filtering by "Rising" demand or search for seasonal items. Q4 prep starts now — holiday products are your next big opportunity.`,

      search: data.priceGap > 0
        ? `There's a Rs${data.priceGap} gap between your target price and the cheapest supplier. That's your margin. Negotiate hard on the ${data.query || 'product'} — mention volume commitment.`
        : `Prices are tight in this category. Differentiate with better listing quality, faster shipping, or bundle offers rather than competing on price alone.`,

      supplier: (data.reliability || 0) > 70
        ? `${data.supplierName} has a ${data.reliability}/100 reliability score — a strong partner. Negotiate for net-30 payment terms and exclusive rights for your territory.`
        : `This supplier's reliability is ${data.reliability || 'unknown'}. Order a small test batch first. Use escrow or 30% advance only. Document everything in writing.`,

      inventory: data.reorderNeeded > 0
        ? `${data.reorderNeeded} products need restocking urgently. Prioritize by profit margin — restock high-margin items first. Consider air freight for the most urgent.`
        : `Inventory looks healthy with ${data.avgDays || 0} days average coverage. Use this buffer to negotiate better payment terms with suppliers.`
    };

    return advices[page] || 'How can I help you grow your business today?';
  }

  function getFallbackAnswer(question, page) {
    const q = question.toLowerCase();
    if (q.includes('margin') || q.includes('profit')) {
      return 'Focus on products with 30%+ gross margin. If your margin is below 20%, either raise prices by 10-15% or negotiate 20% lower COGS with your supplier. Bundle low-margin items with high-margin accessories.';
    }
    if (q.includes('supplier') || q.includes('negotiate')) {
      return 'Always anchor with market price, not supplier price. Ask for sample first. Propose 30% advance, 70% on delivery. For MOQ, offer higher per-unit price for lower minimum. Mention monthly volume commitment.';
    }
    if (q.includes('tax') || q.includes('gst')) {
      return 'If your turnover is under Rs1 crore, consider presumptive taxation (Section 44AD): 6% on digital sales, 8% on cash. No books needed. File GSTR-1 monthly, GSTR-3B quarterly if under Rs5 crore.';
    }
    if (q.includes('inventory') || q.includes('stock')) {
      return 'Use the formula: Reorder Point = (Lead Time × Daily Sales) + Safety Stock. Safety Stock = 1.65 × √(Lead Time) × StdDev(Demand). For most sellers, 2 weeks of safety stock covers 95% of demand variance.';
    }
    if (q.includes('marketing') || q.includes('ads') || q.includes('facebook') || q.includes('google')) {
      return 'Start with ROAS target of 3x. If below 2.5x, pause and optimize: improve product images, add social proof in creatives, narrow audience to lookalike of past buyers. Retargeting typically has 5x+ ROAS.';
    }
    if (q.includes('product') || q.includes('trending') || q.includes('niche')) {
      return 'Look for: high search volume + low competition + 40%+ margin + light weight (<500g) + non-fragile + evergreen demand. Avoid seasonal-only unless you have capital for inventory swings. Validate with 10-unit test orders.';
    }
    return 'Great question! For more specific advice, try asking about: margins, suppliers, taxes, inventory, marketing, or trending products. I can also generate a full weekly report for you.';
  }

  function getFallbackWeeklyReport(data) {
    return `## Weekly Business Report

**Executive Summary:** You have ${data.totalProducts || 0} products with an average margin of ${data.avgMargin || 0}%. ${data.reorderCount || 0} items need attention.

**Key Metrics:**
- Total Revenue Potential: Rs${data.revenuePotential || 0}
- Avg Margin: ${data.avgMargin || 0}%
- Working Capital Locked: Rs${data.workingCapital || 0}
- Inventory Alerts: ${data.reorderCount || 0}

**Top Performers:**
1. ${data.topProduct || 'N/A'}
2. ${data.secondProduct || 'N/A'}
3. ${data.thirdProduct || 'N/A'}

**Alerts:**
${data.reorderCount > 0 ? '- ⚠️ ' + data.reorderCount + ' products need reorder' : '- ✅ No urgent inventory alerts'}
${data.lowMarginCount > 0 ? '- ⚠️ ' + data.lowMarginCount + ' products have margins < 20%' : ''}

**Action Items:**
1. ${data.reorderCount > 0 ? 'Restock ' + data.reorderCount + ' products immediately' : 'Review pricing on top 5 products'}
2. Contact suppliers for ${data.noSupplierCount || 0} products without supplier info
3. Export ${data.unexportedCount || 0} products to your primary platform

**AI Recommendations:**
- ${data.avgMargin < 25 ? 'Raise prices on low-margin items by 10-15%' : 'Maintain current pricing — margins are healthy'}
- ${data.reorderCount > 3 ? 'Consolidate orders with fewer suppliers to negotiate volume discounts' : 'Diversify supplier base to reduce risk'}
`;
  }

  // ─── Navigation Helpers (stubs — wire to your router) ───
  function navigateTo(page, params) {
    if (typeof window.navigateTo === 'function') {
      window.navigateTo(page, params);
    } else {
      console.log('Navigate to:', page, params);
    }
  }

  function exportTopProducts() {
    console.log('Export top products');
  }

  function runPriceAnalysis() {
    console.log('Run price analysis');
  }

  function showPlatformComparison() {
    console.log('Show platform comparison');
  }

  function showTaxBreakdown() {
    console.log('Show tax breakdown');
  }

  function saveCurrentProduct() {
    console.log('Save current product');
  }

  function deepResearchTop() {
    console.log('Deep research top product');
  }

  function saveViralProducts() {
    console.log('Save viral products');
  }

  function showSocialTrends() {
    console.log('Show social trends');
  }

  // ─── Public API ───
  return {
    init,
    setContext,
    generateContextualAdvice,
    handleUserQuestion,
    generateWeeklyReport,
    togglePanel,
    closePanel
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIBusinessCoach;
}
