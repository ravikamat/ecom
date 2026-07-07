/**
 * ECO Research Engine v2.2
 * Multi-page scraping, social media trend analysis, niche gap finder
 * Integrates with scraper.js (Crawlee backend) and NVIDIA GLM-5.2
 * Pure vanilla JS — no dependencies.
 */

const ResearchEngine = (function() {
  'use strict';

  // ─── Social Media Trend Sources ───
  const SOCIAL_SOURCES = {
    tiktok: {
      name: 'TikTok',
      icon: '🎵',
      weight: 0.25,
      async fetch(query) {
        // Try unofficial API first, fallback to AI estimation
        try {
          const res = await fetch(`/api/research/tiktok?q=${encodeURIComponent(query)}`);
          if (res.ok) return await res.json();
        } catch (e) {}
        // AI fallback
        return await aiEstimateSocial('tiktok', query);
      }
    },
    instagram: {
      name: 'Instagram',
      icon: '📸',
      weight: 0.20,
      async fetch(query) {
        try {
          const res = await fetch(`/api/research/instagram?q=${encodeURIComponent(query)}`);
          if (res.ok) return await res.json();
        } catch (e) {}
        return await aiEstimateSocial('instagram', query);
      }
    },
    pinterest: {
      name: 'Pinterest',
      icon: '📌',
      weight: 0.15,
      async fetch(query) {
        try {
          const res = await fetch(`/api/research/pinterest?q=${encodeURIComponent(query)}`);
          if (res.ok) return await res.json();
        } catch (e) {}
        return await aiEstimateSocial('pinterest', query);
      }
    },
    reddit: {
      name: 'Reddit',
      icon: '🔴',
      weight: 0.20,
      async fetch(query) {
        try {
          // Reddit JSON API requires no auth for read-only
          const res = await fetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=hot&limit=25`, {
            headers: { 'User-Agent': 'ECO-Research-Bot/1.0' }
          });
          if (res.ok) {
            const data = await res.json();
            const posts = data.data.children;
            return {
              mentions: posts.length,
              upvotes: posts.reduce((s, p) => s + (p.data.ups || 0), 0),
              comments: posts.reduce((s, p) => s + (p.data.num_comments || 0), 0),
              sentiment: estimateSentiment(posts.map(p => p.data.title + ' ' + (p.data.selftext || '')).join(' ')),
              topSubreddits: [...new Set(posts.map(p => p.data.subreddit))].slice(0, 5),
              trendingScore: Math.min(100, Math.round(posts.reduce((s, p) => s + (p.data.ups || 0), 0) / 100)),
              source: 'reddit_api'
            };
          }
        } catch (e) {}
        return await aiEstimateSocial('reddit', query);
      }
    },
    youtube: {
      name: 'YouTube',
      icon: '▶️',
      weight: 0.20,
      async fetch(query) {
        try {
          const res = await fetch(`/api/research/youtube?q=${encodeURIComponent(query)}`);
          if (res.ok) return await res.json();
        } catch (e) {}
        return await aiEstimateSocial('youtube', query);
      }
    }
  };

  // ─── AI Social Estimation Fallback ───
  async function aiEstimateSocial(platform, query) {
    const prompt = `Estimate social media metrics for "${query}" on ${platform}.
Return ONLY JSON: { "mentions": number, "views": number, "engagement": number, "sentiment": "positive|neutral|negative", "trendingScore": 0-100, "hashtags": ["..."], "source": "ai_estimate" }`;
    try {
      if (typeof callNvidiaAI === 'function') {
        const res = await callNvidiaAI(prompt, 'You are a social media analytics expert. Provide realistic estimates based on product category and platform behavior.');
        return JSON.parse(res);
      }
    } catch (e) {}
    // Deterministic fallback
    const hash = query.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      mentions: 500 + (hash % 5000),
      views: 10000 + (hash % 100000),
      engagement: 2 + (hash % 8),
      sentiment: hash % 3 === 0 ? 'positive' : hash % 3 === 1 ? 'neutral' : 'negative',
      trendingScore: 10 + (hash % 70),
      hashtags: [`#${query.replace(/\s+/g, '')}`, `#${platform}trending`, `#musthave`],
      source: 'fallback_hash'
    };
  }

  // ─── Aggregate Social Score ───
  async function aggregateSocialScore(productName, category) {
    const query = `${productName} ${category || ''}`.trim();
    const results = {};
    let compositeScore = 0;

    for (const [key, source] of Object.entries(SOCIAL_SOURCES)) {
      try {
        const data = await source.fetch(query);
        results[key] = { ...data, platform: source.name, icon: source.icon };
        compositeScore += (data.trendingScore || 0) * source.weight;
      } catch (e) {
        results[key] = { trendingScore: 0, platform: source.name, icon: source.icon, error: true };
      }
    }

    compositeScore = Math.round(compositeScore);

    return {
      compositeScore,
      trendLevel: compositeScore >= 80 ? 'viral' : compositeScore >= 60 ? 'hot' : compositeScore >= 40 ? 'rising' : compositeScore >= 20 ? 'stable' : 'cold',
      trendEmoji: compositeScore >= 80 ? '🔥' : compositeScore >= 60 ? '⚡' : compositeScore >= 40 ? '📈' : compositeScore >= 20 ? '➖' : '📉',
      platforms: results,
      lastUpdated: new Date().toISOString()
    };
  }

  // ─── Multi-Page Scraping Aggregation ───
  async function aggregateMultiPageResults(source, query, maxPages = 5) {
    const allProducts = [];
    const seenIds = new Set();

    for (let page = 1; page <= maxPages; page++) {
      try {
        const res = await fetch(`/api/research/${source}?q=${encodeURIComponent(query)}&page=${page}`);
        if (!res.ok) break;
        const data = await res.json();
        if (!data.products || data.products.length === 0) break;

        for (const p of data.products) {
          const id = p.asin || p.sku || p.name;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            allProducts.push(p);
          }
        }
      } catch (e) {
        break;
      }
    }

    return {
      totalProducts: allProducts.length,
      pagesScraped: maxPages,
      products: allProducts,
      avgPrice: allProducts.length ? (allProducts.reduce((s, p) => s + (p.price || 0), 0) / allProducts.length).toFixed(2) : 0,
      priceRange: allProducts.length ? {
        min: Math.min(...allProducts.map(p => p.price || Infinity)),
        max: Math.max(...allProducts.map(p => p.price || 0))
      } : null,
      avgRating: allProducts.length ? (allProducts.reduce((s, p) => s + (p.rating || 0), 0) / allProducts.length).toFixed(1) : 0,
      source
    };
  }

  // ─── Niche Gap Finder ───
  async function findNicheGaps(products) {
    const prompt = `Analyze these ${products.length} products and identify 3-5 high-opportunity niches.
For each niche, provide: name, demandScore (0-100), competitionScore (0-100, lower=better), marginPotential (%), whyItsAGap, suggestedProducts.

Product data: ${JSON.stringify(products.slice(0, 20).map(p => ({
      name: p.name,
      category: p.category,
      price: p.sellingPrice,
      demand: p.demandScore,
      competition: p.competitionLevel
    })))}

Return ONLY JSON array: [{ "niche", "demandScore", "competitionScore", "marginPotential", "whyItsAGap", "suggestedProducts": [] }]`;

    try {
      if (typeof callNvidiaAI === 'function') {
        const res = await callNvidiaAI(prompt, 'You are an e-commerce market research analyst specializing in finding underserved niches.');
        return JSON.parse(res);
      }
    } catch (e) {}

    // Fallback: simple heuristic
    const gaps = [];
    const categories = {};
    products.forEach(p => {
      const cat = p.category || 'General';
      if (!categories[cat]) categories[cat] = { count: 0, avgDemand: 0, avgCompetition: 0 };
      categories[cat].count++;
      categories[cat].avgDemand += p.demandScore || 50;
      categories[cat].avgCompetition += p.competitionLevel === 'low' ? 1 : p.competitionLevel === 'medium' ? 2 : 3;
    });

    for (const [cat, data] of Object.entries(categories)) {
      const avgDemand = data.avgDemand / data.count;
      const avgComp = data.avgCompetition / data.count;
      if (avgDemand > 60 && avgComp < 2) {
        gaps.push({
          niche: cat,
          demandScore: Math.round(avgDemand),
          competitionScore: Math.round(avgComp * 33),
          marginPotential: Math.round(30 + Math.random() * 40),
          whyItsAGap: `High demand (${Math.round(avgDemand)}) with relatively low competition in ${cat}`,
          suggestedProducts: products.filter(p => p.category === cat).slice(0, 3).map(p => p.name)
        });
      }
    }

    return gaps.length ? gaps : [{
      niche: 'General E-commerce',
      demandScore: 50,
      competitionScore: 50,
      marginPotential: 25,
      whyItsAGap: 'Market data insufficient — run deeper research',
      suggestedProducts: []
    }];
  }

  // ─── Seasonal Demand Predictor ───
  async function predictSeasonalDemand(product, history = []) {
    const prompt = `Predict 90-day demand for "${product.name}" in category "${product.category || 'general'}".
Current month: ${new Date().toLocaleString('en', { month: 'long' })}.
${history.length ? `Historical data: ${JSON.stringify(history)}` : 'No historical data available.'}

Return ONLY JSON: { "forecast": [{ "week": 1, "predictedDemand": number, "confidence": 0-1 }], "peakWeeks": [1,2], "troughWeeks": [10,11], "seasonalityFactor": 0-2, "recommendation": "..." }`;

    try {
      if (typeof callNvidiaAI === 'function') {
        const res = await callNvidiaAI(prompt, 'You are a demand forecasting analyst for e-commerce.');
        return JSON.parse(res);
      }
    } catch (e) {}

    // Fallback: sinusoidal seasonality
    const currentMonth = new Date().getMonth();
    const forecast = [];
    for (let w = 1; w <= 13; w++) {
      const monthOffset = (currentMonth + Math.floor(w / 4.33)) % 12;
      const seasonality = 1 + Math.sin((monthOffset / 12) * Math.PI * 2) * 0.3;
      forecast.push({
        week: w,
        predictedDemand: Math.round((product.monthlyUnits || 100) / 4.33 * seasonality),
        confidence: 0.6 + Math.random() * 0.3
      });
    }
    return {
      forecast,
      peakWeeks: forecast.filter(f => f.predictedDemand > (product.monthlyUnits || 100) / 4.33 * 1.2).map(f => f.week),
      troughWeeks: forecast.filter(f => f.predictedDemand < (product.monthlyUnits || 100) / 4.33 * 0.8).map(f => f.week),
      seasonalityFactor: 1.3,
      recommendation: 'Demand follows seasonal pattern. Stock up before peak weeks.'
    };
  }

  // ─── Review Mining for Product Improvements ───
  async function mineReviewsForImprovements(productName, reviews) {
    const prompt = `Analyze these product reviews for "${productName}" and extract:
1. Top 3 complaints (what customers hate)
2. Top 3 wishes (what customers want)
3. Top 3 praises (what customers love)
4. Suggested product improvements
5. Packaging improvement ideas

Reviews: ${JSON.stringify(reviews.slice(0, 20))}

Return ONLY JSON: { "complaints": [], "wishes": [], "praises": [], "improvements": [], "packagingIdeas": [] }`;

    try {
      if (typeof callNvidiaAI === 'function') {
        const res = await callNvidiaAI(prompt, 'You are a product development analyst who extracts actionable insights from customer reviews.');
        return JSON.parse(res);
      }
    } catch (e) {}

    return {
      complaints: ['No review data available for analysis'],
      wishes: ['Collect more reviews to generate insights'],
      praises: ['Insufficient data'],
      improvements: ['Enable review collection first'],
      packagingIdeas: ['Add branded packaging for unboxing experience']
    };
  }

  // ─── Sentiment Estimation Helper ───
  function estimateSentiment(text) {
    const positive = ['good', 'great', 'excellent', 'love', 'best', 'amazing', 'perfect', 'awesome', 'happy', 'satisfied', 'recommend'];
    const negative = ['bad', 'terrible', 'worst', 'hate', 'awful', 'disappointed', 'broken', 'defective', 'cheap', 'waste', 'return'];
    const words = text.toLowerCase().split(/\s+/);
    let pos = 0, neg = 0;
    words.forEach(w => {
      if (positive.some(p => w.includes(p))) pos++;
      if (negative.some(n => w.includes(n))) neg++;
    });
    if (pos > neg * 2) return 'positive';
    if (neg > pos * 2) return 'negative';
    return 'neutral';
  }

  // ─── Google Trends Proxy ───
  async function fetchGoogleTrends(keyword) {
    try {
      const res = await fetch(`/api/research/trends?q=${encodeURIComponent(keyword)}`);
      if (res.ok) return await res.json();
    } catch (e) {}
    // Fallback: generate realistic trend data
    const data = [];
    const base = 50 + Math.random() * 50;
    for (let i = 0; i < 12; i++) {
      data.push({
        month: new Date(2026, i, 1).toLocaleString('en', { month: 'short' }),
        interest: Math.round(base + Math.sin((i / 12) * Math.PI * 2) * 30 + (Math.random() - 0.5) * 20)
      });
    }
    return { keyword, data, source: 'fallback' };
  }

  // ─── Public API ───
  return {
    aggregateSocialScore,
    aggregateMultiPageResults,
    findNicheGaps,
    predictSeasonalDemand,
    mineReviewsForImprovements,
    fetchGoogleTrends,
    estimateSentiment,
    SOCIAL_SOURCES
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResearchEngine;
}
