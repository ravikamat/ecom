/* ============================================================
   AI Engine — Routes through local proxy at /api/ai
   Proxy forwards to NVIDIA API (z-ai/glm-5.2)
   ============================================================ */

const AIEngine = {
  proxyUrl: '/api/ai',
  isLoading: false,
  isOnline: true,

  /* ── Connectivity Check (cached 30s to avoid spamming) ── */
  _lastStatusCheck: 0,
  _lastStatusResult: false,

  async checkConnection() {
    const now = Date.now();
    if (now - this._lastStatusCheck < 30000 && this._lastStatusCheck > 0) {
      return this._lastStatusResult;
    }
    try {
      // Use /api/ai/health (gateway 3-tier) with fallback to /api/ai-status
      const res = await fetch('/api/ai/health', { method: 'GET', signal: AbortSignal.timeout(3000) })
        .catch(() => fetch('/api/ai-status', { method: 'GET', signal: AbortSignal.timeout(3000) }));
      const data = await res.json();
      // Online if ANY of: GLM, MiniMax, Ollama is up
      const online = data.glm === 'up' || data.minimax === 'up' || data.ollama === 'up'
                  || data.ollama_local === true || data.enabled === true;
      this.isOnline = online;
      this._lastStatusCheck = now;
      this._lastStatusResult = online;
      return online;
    } catch (e) {
      console.warn('[AI] Connection check failed:', e.message);
      this.isOnline = false;
      this._lastStatusResult = false;
      return false;
    }
  },


  /* ── Core Query ────────────────────────────────────────── */
  async query(prompt, options = {}) {
    if (this.isLoading) {
      Toast.warning('AI is processing another request. Please wait.');
      return null;
    }

    // Check connectivity
    const online = await this.checkConnection();
    if (!online) {
      Toast.error('AI server not reachable. Make sure you started the server with: node server.js');
      return null;
    }

    this.isLoading = true;

    try {
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 4096,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      console.log('[AI] Raw response length:', content?.length || 0);
      console.log('[AI] Raw response preview:', content?.substring(0, 300));

      if (!content) throw new Error('Empty response from AI');

      return content;
    } catch (err) {
      console.error('[AI] Query failed:', err);
      Toast.error(`AI error: ${err.message}`);
      return null;
    } finally {
      this.isLoading = false;
    }
  },

  /* ── JSON Parser (handles markdown code blocks) ────────── */
  parseJSON(text) {
    if (!text) return null;

    // 1. Try direct parse
    try {
      const parsed = JSON.parse(text);
      console.log('[AI] Direct JSON parse succeeded');
      return parsed;
    } catch { /* continue */ }

    // 2. Extract from markdown code blocks
    const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      try {
        const parsed = JSON.parse(codeMatch[1].trim());
        console.log('[AI] Parsed JSON from code block');
        return parsed;
      } catch { /* continue */ }
    }

    // 3. Find JSON array using bracket balancing
    const arrStart = text.indexOf('[');
    if (arrStart !== -1) {
      let depth = 0;
      for (let i = arrStart; i < text.length; i++) {
        if (text[i] === '[') depth++;
        else if (text[i] === ']') depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.substring(arrStart, i + 1));
            console.log('[AI] Parsed JSON array via bracket balancing');
            return parsed;
          } catch { break; }
        }
      }
    }

    // 4. Find JSON object using bracket balancing
    const objStart = text.indexOf('{');
    if (objStart !== -1) {
      let depth = 0;
      for (let i = objStart; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.substring(objStart, i + 1));
            console.log('[AI] Parsed JSON object via bracket balancing');
            return parsed;
          } catch { break; }
        }
      }
    }

    console.error('[AI] Failed to parse JSON from response:', text.substring(0, 200));
    return null;
  },

  /* ── Smart Product Search (REAL-TIME via AI) ───────────── */
  async searchProducts(query, country) {
    const countryInfo = (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country])
      ? COUNTRY_CONFIG[country] : { currency: 'USD', symbol: '$' };

    const prompt = `Find the top 8 real, currently trending and profitable products related to "${query}" that can be sold in ${country} on e-commerce platforms.

For each product, provide realistic 2025-2026 market data in JSON array format:
[
  {
    "name": "Specific product name",
    "category": "Category",
    "sellingPrice": estimated retail selling price number in ${countryInfo.currency},
    "costPrice": estimated wholesale/supplier cost number in ${countryInfo.currency},
    "margin": profit margin percentage number,
    "demand": demand score 0-100 number,
    "competition": "Low" or "Medium" or "High" or "Very High",
    "platforms": ["platform1", "platform2"],
    "supplierTip": "where to source this product",
    "moq": minimum order quantity number
  }
]

Important: Use realistic prices in ${countryInfo.currency} for ${country}. Include specific product names, not generic categories. Base on actual 2025-2026 e-commerce trends.`;

    const result = await this.query(prompt);
    return this.parseJSON(result);
  },

  /* ── Trending Discovery (REAL-TIME) ────────────────────── */
  async discoverTrending(country, category) {
    const countryInfo = (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country])
      ? COUNTRY_CONFIG[country] : { currency: 'USD', symbol: '$' };

    const catFilter = category && category !== 'all' ? ` in the "${category}" category` : '';

    const prompt = `What are the top 10 trending, high-demand products to sell on e-commerce platforms in ${country}${catFilter} right now in 2025-2026?

Return as a JSON array with realistic data:
[
  {
    "name": "Specific product name",
    "category": "Category",
    "sellingPrice": selling price number in ${countryInfo.currency},
    "costPrice": wholesale cost number in ${countryInfo.currency},
    "margin": profit margin percentage number,
    "demand": demand score 0-100 number,
    "competition": "Low" or "Medium" or "High" or "Very High",
    "platforms": ["best platform 1", "best platform 2"],
    "supplierTip": "brief sourcing tip",
    "moq": typical MOQ number,
    "whyTrending": "one line reason why this is trending"
  }
]

Focus on products with good profit margins (>25%) and realistic pricing for the ${country} market.`;

    try {
      const result = await this.query(prompt);
      const parsed = this.parseJSON(result);
      if (parsed && Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('[AIEngine] Discover trending query failed, using database/static fallback:', e.message);
    }

    // Local database fallback
    try {
      const limit = 10;
      const res = await fetch(`/api/db/products?country=${encodeURIComponent(country)}&category=${encodeURIComponent(category)}&limit=${limit}`);
      if (res.ok) {
        const products = await res.json();
        if (products && products.length > 0) {
          return products.map(p => ({
            name: p.name,
            category: p.category || 'General',
            sellingPrice: p.supplierPrice ? Math.round(p.supplierPrice * 1.5) : 1200,
            costPrice: p.supplierPrice || 800,
            margin: p.margin || 33,
            demand: p.demand || 65,
            competition: p.competition || 'Medium',
            platforms: ['Amazon', 'Flipkart'],
            supplierTip: `Source from local verified supplier rating ${p.rating || 4.2}/5`,
            moq: 50,
            whyTrending: `Verified local high-margin listing with strong ${p.demand || 65}% demand score`
          }));
        }
      }
    } catch(e) {
      console.warn('[AIEngine] Database fallback failed:', e.message);
    }

    // Static fallback if API is also unreachable
    return [
      {
        name: "Ergonomic Memory Foam Seat Cushion",
        category: "Office",
        sellingPrice: countryInfo.currency === 'INR' ? 1499 : 29,
        costPrice: countryInfo.currency === 'INR' ? 600 : 12,
        margin: 60,
        demand: 85,
        competition: "Medium",
        platforms: ["Amazon", "Shopify"],
        supplierTip: "Source from Ningbo Comfort Cushion Co. on Alibaba",
        moq: 100,
        whyTrending: "Rising demand due to remote office setups and ergonomic wellness trends"
      },
      {
        name: "Insulated Stainless Steel Gym Bottle (40oz)",
        category: "Sports",
        sellingPrice: countryInfo.currency === 'INR' ? 1899 : 35,
        costPrice: countryInfo.currency === 'INR' ? 750 : 14,
        margin: 60,
        demand: 92,
        competition: "High",
        platforms: ["Amazon", "Flipkart"],
        supplierTip: "Look for double-wall vacuum insulation suppliers",
        moq: 200,
        whyTrending: "Viral social media trends for high-capacity aesthetic drinkware"
      }
    ];
  },

  /* ── Market Analysis ───────────────────────────────────── */
  async analyzeMarket(country, category) {
    const prompt = `Provide a brief e-commerce market analysis for ${category || 'general products'} in ${country} for 2025-2026.

Return as JSON:
{
  "summary": "2-3 sentence market overview",
  "topCategories": [{"name": "category", "growthRate": "XX%", "avgMargin": "XX%"}],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "risks": ["risk 1", "risk 2"],
  "bestPlatforms": ["platform 1", "platform 2"],
  "tip": "one key actionable tip for a solo entrepreneur"
}`;

    const result = await this.query(prompt);
    return this.parseJSON(result);
  },

  /* ── Supplier Suggestions ──────────────────────────────── */
  async suggestSuppliers(product, country) {
    const prompt = `Suggest real sourcing strategies for "${product}" to sell in ${country}.

Return as JSON:
{
  "strategies": [
    {
      "source": "sourcing country or platform name",
      "type": "Manufacturer or Wholesaler or Dropshipper",
      "estimatedCost": "price range string",
      "moq": "minimum order description",
      "leadTime": "shipping time",
      "pros": ["pro1", "pro2"],
      "cons": ["con1"]
    }
  ],
  "recommendedPlatforms": ["platform1", "platform2"],
  "tip": "best approach for a beginner with limited capital"
}`;

    const result = await this.query(prompt);
    return this.parseJSON(result);
  },

  /* ── Price Optimizer ───────────────────────────────────── */
  async optimizePrice(productData) {
    const prompt = `Given this e-commerce product data, suggest optimal pricing strategy:

Product: ${productData.name || 'Custom product'}
Cost per unit: ${productData.cost} ${productData.currency || 'USD'}
Platform: ${productData.platform}
Country: ${productData.country}
Category: ${productData.category || 'General'}

Return as JSON:
{
  "suggestedPrice": number,
  "priceRange": {"min": number, "max": number},
  "expectedMargin": number,
  "pricingStrategy": "brief strategy description",
  "competitorPriceRange": "estimated range string",
  "tip": "pricing tip"
}`;

    const result = await this.query(prompt);
    return this.parseJSON(result);
  },

  /* ── Real-Time Price Search ────────────────────────────── */
  async searchPrices(productName, country) {
    const countryInfo = (typeof COUNTRY_CONFIG !== 'undefined' && COUNTRY_CONFIG[country])
      ? COUNTRY_CONFIG[country] : { currency: 'USD', symbol: '$' };

    const prompt = `For the product "${productName}" in ${country}, provide estimated current market prices across major e-commerce platforms.

Return as JSON:
{
  "product": "${productName}",
  "country": "${country}",
  "currency": "${countryInfo.currency}",
  "platforms": [
    {
      "name": "Platform name",
      "sellingPrice": estimated price number,
      "estimatedFees": estimated platform fees number,
      "estimatedProfit": estimated profit number,
      "margin": margin percentage number,
      "rating": "how competitive this platform is for this product"
    }
  ],
  "bestPlatform": "name of recommended platform",
  "wholesalePrice": estimated wholesale cost number,
  "tip": "selling tip for this product"
}`;

    const result = await this.query(prompt);
    return this.parseJSON(result);
  },

  /* ── Feature 8: AI Listing Generator ────────────────────── */
  async generateListing(productName, category, platform, tone = 'professional') {
    const prompt = `Generate an e-commerce product listing for "${productName}" in category "${category}" for platform "${platform}" with a ${tone} tone.

Return ONLY this JSON (no markdown, no extra text):
{
  "title": "SEO-optimized product title (max 80 chars for Amazon, 60 for Flipkart)",
  "description": "2-3 sentence compelling description",
  "bullets": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
  "metaTitle": "Meta title for SEO (50-60 chars)",
  "metaDescription": "Meta description (150-160 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "searchTerms": "backend search terms comma separated"
}`;
    try {
      const response = await this.query(prompt, { temperature: 0.5, max_tokens: 1024 });
      return this.parseJSON(response);
    } catch (err) {
      console.error('[AI] Listing generation failed:', err);
      return null;
    }
  },

  /* ── v2.2: Supplier Email Generator ─────────────────────── */
  async generateSupplierEmail(params) {
    if (typeof SupplierCommunicator !== 'undefined') {
      return SupplierCommunicator.generateEmail(params);
    }
    return null;
  },

  /* ── v2.2: Supplier WhatsApp Generator ──────────────────── */
  async generateSupplierWhatsApp(params) {
    if (typeof SupplierCommunicator !== 'undefined') {
      return SupplierCommunicator.generateWhatsApp(params);
    }
    return null;
  },

  /* ── v2.2: Query with system prompt (used by AI Coach) ──── */
  async queryWithSystem(userMessage, systemPrompt, options = {}) {
    const online = await this.checkConnection();
    if (!online) return '⚠️ AI server not reachable. Please start the server with: node server.js';

    try {
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: options.temperature || 0.7,
          max_tokens:  options.max_tokens  || 600,
        }),
      });
      if (!response.ok) throw new Error('Server error: ' + response.status);
      const data = await response.json();
      return data.content || data.choices?.[0]?.message?.content || '';
    } catch (err) {
      console.error('[AI] System query failed:', err);
      return '⚠️ AI temporarily unavailable. Please try again.';
    }
  },
};


/* ─── Global callNvidiaAI shim ──────────────────────────────────
   Required by: financial-engine, tax-engine, ai-coach,
                research-engine, supplier-communicator,
                competitor-tracker, saved-detail-modal
   Routes through /api/ai proxy → Llama / MiniMax fallback
   ─────────────────────────────────────────────────────────────── */
window.callNvidiaAI = async function callNvidiaAI(userPrompt, systemPrompt = '', options = {}) {
  try {
    // Build messages with proper role separation
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: options.temperature || 0.7,
        max_tokens:  options.max_tokens  || 2048,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.warn('[callNvidiaAI] HTTP', response.status);
      return null;
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.warn('[callNvidiaAI] Failed:', err.message);
    return null;
  }
};
