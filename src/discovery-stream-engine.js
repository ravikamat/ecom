// ============================================================
// ECO Discovery Stream Engine v2.0
// Endless self-improving product discovery pipeline
// Phases: Location → Category Scout → Site Intel → Product Miner → SSE Stream → Feedback Loop
// ============================================================

import https from 'node:https';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import * as cheerio from 'cheerio';
import { dbUpsertDiscoveredProduct, dbBoostProductScore } from '../db/sqlite.js';
import { compressPayloadSmart } from './intelligence-layer/ai-gateway.js';

const STREAM_CONFIG = {
  nimEndpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
  nimModel: 'z-ai/glm-5.2',
  nimFallback: 'minimaxai/minimax-m3',
  maxStreamProducts: 300,
  productsBeforeCategoryCheck: 8,
  minSaveRateToContinue: 0.20,
  streamDelayMs: 1200,
  scrapeTimeoutMs: 20000,
  maxConcurrentSources: 3,
  maxProductsPerMineRound: 10,
};

// ─── Native HTTPS POST helper ───────────────────────────────────────
function nimPost(payload, apiKey, timeoutMs = 22000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'integrate.api.nvidia.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${apiKey}`,
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('AI response parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('AI request timeout')));
    req.write(body);
    req.end();
  });
}

// ─── Ollama (Qwen local fast model) HTTP POST helper ───────────────────────
function ollamaPost(prompt, maxTokens = 1200, temperature = 0.65, timeoutMs = 30000) {
  const compressed = compressPayloadSmart(prompt, 6000);
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'qwen3:1.7b',
      prompt: compressed,
      stream: false,
      options: { temperature, num_predict: maxTokens },
    });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed.response || '');
        } catch (e) { reject(new Error('Ollama parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Ollama timeout')));
    req.write(body); req.end();
  });
}



// ─── Native HTTPS GET helper ────────────────────────────────────────
function webGet(urlStr, timeoutMs = 18000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const proto = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
      },
    };
    const req = proto.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('GET timeout')));
    req.end();
  });
}

// ─── Safe JSON extractor ────────────────────────────────────────────
function safeParseJSON(text, fallback = null) {
  if (!text) return fallback;
  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    const objMatch = clean.match(/\{[\s\S]*\}/);
    const target = arrMatch || objMatch;
    if (target) return JSON.parse(target[0]);
    return JSON.parse(clean);
  } catch { return fallback; }
}

// ─── Temporal Memory ────────────────────────────────────────────────
class TemporalMemory {
  constructor(db) {
    this.db = db;
    this.sessions = new Map();
  }

  initSession(sessionId, location) {
    const state = {
      sessionId,
      location,
      startedAt: Date.now(),
      productsEmitted: 0,
      productsSaved: 0,
      currentCategory: null,
      categoryHistory: [],
      exhaustedCategories: new Set(),
      lastCategorySwitch: 0,
      savedSinceCategorySwitch: 0,
    };
    this.sessions.set(sessionId, state);
    try {
      this.db.prepare(
        `INSERT OR REPLACE INTO discovery_sessions (session_id, location, started_at, status) VALUES (?,?,datetime('now'),'active')`
      ).run(sessionId, JSON.stringify(location));
    } catch {}
    return state;
  }

  getSession(id) { return this.sessions.get(id); }

  closeSession(id) {
    try { this.db.prepare(`UPDATE discovery_sessions SET status='complete' WHERE session_id=?`).run(id); } catch {}
    this.sessions.delete(id);
  }

  getBestCategories(country) {
    try {
      return this.db.prepare(
        `SELECT category, avg_save_rate FROM category_heatmap WHERE country=? ORDER BY avg_save_rate DESC LIMIT 12`
      ).all(country);
    } catch { return []; }
  }

  recordProduct(sessionId, product, wasSaved) {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.productsEmitted++;
    if (wasSaved) { s.productsSaved++; s.savedSinceCategorySwitch++; }
    try {
      this.db.prepare(
        `INSERT INTO stream_products (session_id, product_data, was_saved, emitted_at) VALUES (?,?,?,datetime('now'))`
      ).run(sessionId, JSON.stringify(product), wasSaved ? 1 : 0);
    } catch {}
  }

  recordCategoryOutcome(session) {
    const emitted = session.productsEmitted - session.lastCategorySwitch;
    const saved = session.savedSinceCategorySwitch;
    const saveRate = emitted > 0 ? saved / emitted : 0;
    if (session.currentCategory && emitted >= STREAM_CONFIG.productsBeforeCategoryCheck
        && saveRate < STREAM_CONFIG.minSaveRateToContinue) {
      session.exhaustedCategories.add(session.currentCategory);
    }
    try {
      this.db.prepare(
        `INSERT INTO category_heatmap (country,category,avg_save_rate,last_discovery_count,updated_at)
         VALUES (?,?,?,?,datetime('now'))
         ON CONFLICT(country,category) DO UPDATE SET
           avg_save_rate=(avg_save_rate*0.7+excluded.avg_save_rate*0.3),
           last_discovery_count=last_discovery_count+excluded.last_discovery_count,
           updated_at=datetime('now')`
      ).run(session.location.country, session.currentCategory, saveRate, emitted);
    } catch {}
  }

  updateSiteScore(domain, category, country, wasSaved, margin) {
    const qs = wasSaved ? 0.9 : (margin > 40 ? 0.5 : 0.1);
    try {
      this.db.prepare(
        `INSERT INTO site_intelligence (domain,category,country,quality_score,success_rate,avg_margin,last_used)
         VALUES (?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(domain,category,country) DO UPDATE SET
           quality_score=(quality_score*0.85+excluded.quality_score*0.15),
           success_rate=(success_rate*0.85+excluded.success_rate*0.15),
           avg_margin=(avg_margin*0.85+excluded.avg_margin*0.15),
           last_used=datetime('now')`
      ).run(domain, category, country, qs, wasSaved ? 1 : 0, margin || 0);
    } catch {}
  }

  getBestSites(category, country) {
    try {
      return this.db.prepare(
        `SELECT domain,quality_score FROM site_intelligence WHERE category=? AND country=? AND is_active=1 ORDER BY quality_score DESC LIMIT 4`
      ).all(category, country);
    } catch { return []; }
  }

  shouldSwitchCategory(session) {
    const emitted = session.productsEmitted - session.lastCategorySwitch;
    if (emitted < STREAM_CONFIG.productsBeforeCategoryCheck) return false;
    const rate = session.savedSinceCategorySwitch / emitted;
    return rate < STREAM_CONFIG.minSaveRateToContinue;
  }

  doSwitchCategory(session) {
    this.recordCategoryOutcome(session);
    session.lastCategorySwitch = session.productsEmitted;
    session.savedSinceCategorySwitch = 0;
    if (session.currentCategory) session.categoryHistory.push(session.currentCategory);
  }
}

// ─── AI Orchestrator ────────────────────────────────────────────────
class AIOrchestrator {
  constructor(primaryKey, fallbackKey) {
    this.primaryKey = primaryKey;
    this.fallbackKey = fallbackKey;
  }

  async _call(prompt, maxTokens = 1200, temperature = 0.65) {
    const payload = {
      model: STREAM_CONFIG.nimModel,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    };
    // Tier 1: GLM-5.2 (primary cloud)
    try {
      const res = await nimPost(payload, this.primaryKey);
      const text = res?.choices?.[0]?.message?.content || '';
      if (text) return text;
      throw new Error('Empty response from GLM');
    } catch (e) {
      console.warn('[AI] GLM-5.2 failed:', e.message);
    }
    // Tier 2: MiniMax-M3 (cloud fallback)
    if (this.fallbackKey) {
      try {
        const res = await nimPost({ ...payload, model: STREAM_CONFIG.nimFallback }, this.fallbackKey);
        const text = res?.choices?.[0]?.message?.content || '';
        if (text) return text;
        throw new Error('Empty response from MiniMax');
      } catch (e) {
        console.warn('[AI] MiniMax-M3 failed:', e.message);
      }
    }
    // Tier 3: Qwen 3.6 via Ollama (local — no internet needed)
    try {
      console.log('[AI] Both cloud AIs failed — switching to Qwen 3.6 (local Ollama)...');
      const text = await ollamaPost(prompt, maxTokens, temperature);
      if (text) return text;
      throw new Error('Empty response from Ollama');
    } catch (e) {
      console.warn('[AI] Ollama Qwen also failed:', e.message);
    }
    throw new Error('All AI providers exhausted (GLM + MiniMax + Ollama)');
  }

  async scoutCategories(location, knownRanking = []) {
    const knownStr = knownRanking.length
      ? `Top performing categories (by user engagement): ${knownRanking.map(c => c.category).join(', ')}.`
      : '';
    const month = new Date().toLocaleString('default', { month: 'long' });
    const prompt = `You are an e-commerce trend analyst for ${location.country}${location.city ? ', ' + location.city : ''}.
What are the 10 hottest product categories RIGHT NOW in ${month}?
Consider local demand, seasonal trends, social commerce.
${knownStr}

Return ONLY a JSON array:
[{"name":"Category","reason":"Short reason","confidence":"high|medium|low"}]`;

    try {
      const raw = await this._call(prompt, 900, 0.72);
      const parsed = safeParseJSON(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) { console.warn('[AI] scoutCategories failed:', e.message); }
    return this._fallbackCategories(location.country);
  }

  async selectSites(category, location, existingScores = []) {
    const scoreStr = existingScores.length
      ? existingScores.map(s => `${s.domain}(${s.quality_score?.toFixed(2) || '?'})`).join(', ')
      : 'no history yet';
    const prompt = `For category "${category}" in ${location.country}, which 4 websites have the best real-time product listings with accurate prices?
Known sites: ${scoreStr}

Return ONLY JSON array:
[{"domain":"amazon.in","priority":1}]`;

    try {
      const raw = await this._call(prompt, 500, 0.5);
      const parsed = safeParseJSON(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) { console.warn('[AI] selectSites failed:', e.message); }
    return this._fallbackSites(location.country);
  }

  async planQueries(category, location, site) {
    const prompt = `Generate 6 specific search queries to find BEST SELLING, HIGH MARGIN products in "${category}" on ${site} for ${location.country}.
Mix: brand names, trending keywords, "best seller", price ranges, feature keywords.

Return ONLY a JSON array of query strings:
["query 1","query 2"]`;

    try {
      const raw = await this._call(prompt, 600, 0.75);
      const parsed = safeParseJSON(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 6);
    } catch (e) { console.warn('[AI] planQueries failed:', e.message); }
    return [
      `best selling ${category} ${location.country} 2026`,
      `trending ${category} buy online`,
      `top rated ${category} under 2000`,
      `${category} high margin reseller`,
    ];
  }

  async enrichProduct(raw, category, location) {
    const prompt = `Analyze this product for a reseller in ${location.country}. Be concise and realistic.
Name: "${raw.name}"
Price: ${raw.price} ${location.currency || 'INR'}
Category: ${category}, Platform: ${raw.platform || '?'}, Rating: ${raw.rating || '?'}, Reviews: ${raw.reviews || '?'}

Return ONLY JSON (no markdown):
{"estimatedCost":450,"estimatedMargin":62,"demandScore":78,"competitionLevel":"medium","whyTrending":"one sentence","sellerTip":"one tip","confidence":"medium"}`;

    try {
      const raw2 = await this._call(prompt, 450, 0.5);
      const parsed = safeParseJSON(raw2);
      if (parsed && typeof parsed.estimatedMargin === 'number') return parsed;
    } catch (e) { console.warn('[AI] enrichProduct failed:', e.message); }
    return {
      estimatedCost: Math.round(raw.price * 0.38),
      estimatedMargin: 55,
      demandScore: 60,
      competitionLevel: 'medium',
      whyTrending: 'Popular product in this category',
      sellerTip: 'Compare supplier pricing before ordering',
      confidence: 'low',
    };
  }

  _fallbackCategories(country) {
    return [
      { name: 'Mobile Accessories', reason: 'High volume, repeat buyers', confidence: 'high' },
      { name: 'Kitchen & Dining', reason: 'Evergreen home essentials', confidence: 'high' },
      { name: 'Health & Wellness', reason: 'Growing demand', confidence: 'high' },
      { name: 'Beauty & Personal Care', reason: 'Repeat purchase cycle', confidence: 'high' },
      { name: 'Electronics', reason: 'Year-round demand', confidence: 'medium' },
      { name: 'Home Decor', reason: 'Seasonal peaks', confidence: 'medium' },
      { name: 'Fashion Accessories', reason: 'Trend-driven', confidence: 'medium' },
      { name: 'Fitness & Sports', reason: 'Health trends', confidence: 'medium' },
      { name: 'Baby & Kids', reason: 'Gift season demand', confidence: 'medium' },
      { name: 'Office Supplies', reason: 'WFH market', confidence: 'low' },
    ];
  }

  _fallbackSites(country) {
    if (country === 'India') return [{ domain: 'amazon.in', priority: 1 }, { domain: 'flipkart.com', priority: 2 }];
    if (country === 'USA') return [{ domain: 'amazon.com', priority: 1 }, { domain: 'ebay.com', priority: 2 }];
    return [{ domain: 'amazon.com', priority: 1 }];
  }
}

// ─── Product Miner ──────────────────────────────────────────────────
class ProductMiner {
  constructor() { this.seenNames = new Set(); }

  resetSeen() { this.seenNames = new Set(); }

  async mine(category, queries, sites, location) {
    const allListings = [];
    const sitesToUse = sites.slice(0, STREAM_CONFIG.maxConcurrentSources);

    const results = await Promise.allSettled(
      sitesToUse.map(async (site) => {
        const domain = typeof site === 'string' ? site : (site.domain || 'amazon.in');
        const listings = [];
        for (const query of queries.slice(0, 3)) {
          try {
            const found = await this._scrapeSite(domain, query, location);
            listings.push(...found);
          } catch (e) { console.warn(`[Miner] ${domain}/${query}: ${e.message}`); }
        }
        return listings;
      })
    );

    results.forEach(r => { if (r.status === 'fulfilled') allListings.push(...r.value); });

    const unique = [];
    for (const item of allListings) {
      if (!item.name || item.price <= 0) continue;
      const norm = item.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45);
      if (!this.seenNames.has(norm)) {
        this.seenNames.add(norm);
        unique.push(item);
      }
    }
    return unique.sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
  }

  async _scrapeSite(domain, query, location) {
    const urls = this._buildUrls(domain, query, location);
    const listings = [];
    for (const url of urls.slice(0, 2)) {
      try {
        const html = await webGet(url, STREAM_CONFIG.scrapeTimeoutMs);
        const $ = cheerio.load(html);
        const parsed = this._parse($, domain);
        listings.push(...parsed);
        if (parsed.length > 4) break;
      } catch {}
    }
    return listings;
  }

  _buildUrls(domain, query, location) {
    const q = encodeURIComponent(query);
    const country = location.country || 'India';
    const tld = country === 'India' ? 'in' :
                country === 'UK' ? 'co.uk' :
                country === 'Australia' ? 'com.au' :
                country === 'Canada' ? 'ca' : 'com';

    const GOOGLE_DOMAINS = {
      'India':     'https://www.google.co.in/search?tbm=shop&q=',
      'USA':       'https://www.google.com/search?tbm=shop&q=',
      'UK':        'https://www.google.co.uk/search?tbm=shop&q=',
      'Germany':   'https://www.google.de/search?tbm=shop&q=',
      'Australia': 'https://www.google.com.au/search?tbm=shop&q=',
      'Canada':    'https://www.google.ca/search?tbm=shop&q=',
      'UAE':       'https://www.google.ae/search?tbm=shop&q=',
      'Singapore': 'https://www.google.com.sg/search?tbm=shop&q=',
    };

    if (domain.includes('amazon')) return [`https://www.amazon.${tld}/s?k=${q}`];
    if (domain.includes('flipkart')) return [`https://www.flipkart.com/search?q=${q}`];
    if (domain.includes('meesho')) return [`https://www.meesho.com/search?q=${q}`];
    if (domain.includes('ebay')) return [`https://www.ebay.${tld}/sch/i.html?_nkw=${q}`];
    return [`${GOOGLE_DOMAINS[country] || GOOGLE_DOMAINS['USA']}${q}+buy+online`];
  }

  _parse($, domain) {
    const items = [];
    try {
      if (domain.includes('amazon')) {
        $('[data-component-type="s-search-result"]').each((_, el) => {
          const name = $(el).find('h2 .a-text-normal').first().text().trim() ||
                       $(el).find('h2 a span').first().text().trim();
          const price = parseInt($(el).find('.a-price-whole').first().text().replace(/[^\d]/g, '')) || 0;
          const rating = parseFloat(($(el).find('.a-icon-alt').first().text().match(/[\d.]+/) || [])[0]) || 0;
          const reviews = parseInt($(el).find('a[href*="reviews"] span').first().text().replace(/[^\d]/g, '')) || 0;
          const url = 'https://amazon.in' + ($(el).find('h2 a').attr('href') || '');
          if (name && price > 50) items.push({ name, price, rating, reviews, url, source: domain, platform: 'Amazon' });
        });
      } else if (domain.includes('flipkart')) {
        $('[data-id], ._1AtVbE').each((_, el) => {
          const name = $(el).find('._4rR01T, .s1Q9rs').first().text().trim();
          const price = parseInt($(el).find('._30jeq3').first().text().replace(/[^\d]/g, '')) || 0;
          const rating = parseFloat($(el).find('._3LWZlK').first().text()) || 0;
          const href = $(el).find('a').attr('href') || '';
          const url = href.startsWith('http') ? href : `https://www.flipkart.com${href}`;
          if (name && price > 50) items.push({ name, price, rating, reviews: 0, url, source: domain, platform: 'Flipkart' });
        });
      } else {
        // Generic fallback
        const priceRe = /[₹$£€]?\s?[\d,]{3,}/;
        $('a').each((_, el) => {
          const text = $(el).text().trim();
          if (text.length < 10 || text.length > 100) return;
          const href = $(el).attr('href') || '';
          if (!href.startsWith('http')) return;
          const pText = $(el).closest('div, li').text();
          const m = pText.match(priceRe);
          const price = m ? parseInt(m[0].replace(/[^\d]/g, '')) : 0;
          if (price > 50) items.push({ name: text, price, rating: 0, reviews: 0, url: href, source: domain, platform: 'Web' });
        });
      }
    } catch {}
    return items.slice(0, 25);
  }
}

// ─── Main Discovery Stream Engine ───────────────────────────────────
export class DiscoveryStreamEngine extends EventEmitter {
  constructor({ db, primaryApiKey, fallbackApiKey }) {
    super();
    this.db      = db;
    this.memory  = new TemporalMemory(db);
    this.ai      = new AIOrchestrator(primaryApiKey, fallbackApiKey);
    this.miner   = new ProductMiner();
    this.active  = new Map(); // sessionId → AbortController
  }

  updateKeys(primary, fallback) {
    this.ai.primaryKey = primary;
    this.ai.fallbackKey = fallback;
  }

  async startStream(sessionId, location, sseWrite) {
    if (this.active.has(sessionId)) {
      sseWrite({ type: 'error', message: 'Session already active' });
      return;
    }

    const ctrl = new AbortController();
    this.active.set(sessionId, ctrl);
    const session = this.memory.initSession(sessionId, location);

    sseWrite({ type: 'status', phase: 'init', message: `Initializing discovery for ${location.country}...` });

    try {
      // Phase 2 — Scout categories
      sseWrite({ type: 'status', phase: 'scout', message: `AI scouting trending categories in ${location.country}...` });
      const knownRanking = this.memory.getBestCategories(location.country);
      let categories = await this.ai.scoutCategories(location, knownRanking);
      sseWrite({ type: 'categories', categories });

      let catIndex = 0;
      this.miner.resetSeen();

      // ── Endless discovery loop ───────────────────────────────
      while (!ctrl.signal.aborted && session.productsEmitted < STREAM_CONFIG.maxStreamProducts) {

        // Category selection / switch
        if (!session.currentCategory || this.memory.shouldSwitchCategory(session)) {
          this.memory.doSwitchCategory(session);

          let nextCat = null;
          // Prefer DB heatmap rankings
          const dbRanked = this.memory.getBestCategories(location.country)
            .filter(r => !session.exhaustedCategories.has(r.category));
          if (dbRanked.length > 0) {
            nextCat = dbRanked[0].category;
          } else if (catIndex < categories.length) {
            const c = categories[catIndex++];
            if (!session.exhaustedCategories.has(c.name)) nextCat = c.name;
          }

          if (!nextCat) {
            // All exhausted — rescout
            sseWrite({ type: 'status', phase: 'scout', message: 'All categories tried, re-scouting...' });
            session.exhaustedCategories.clear();
            catIndex = 0;
            categories = await this.ai.scoutCategories(location, []);
            sseWrite({ type: 'categories', categories });
            continue;
          }

          session.currentCategory = nextCat;
          sseWrite({ type: 'category_switch', category: nextCat, message: `Now exploring: ${nextCat}` });
        }

        const cat = session.currentCategory;

        // Phase 3 — Site intel
        const existingSites = this.memory.getBestSites(cat, location.country);
        const sites = existingSites.length >= 2
          ? existingSites
          : await this.ai.selectSites(cat, location, existingSites);

        // Phase 4 — Plan queries
        sseWrite({ type: 'status', phase: 'planning', message: `Planning search queries for ${cat}...` });
        const primarySite = existingSites[0]?.domain || sites[0]?.domain || 'amazon.in';
        const queries = await this.ai.planQueries(cat, location, primarySite);
        sseWrite({ type: 'queries', category: cat, queries });

        // Phase 4b — Scrape
        sseWrite({ type: 'status', phase: 'scraping', message: `Scraping ${sites.length} sites for ${cat}...` });
        let rawProducts = [];
        try {
          rawProducts = await this.miner.mine(cat, queries, sites, location);
        } catch (e) { console.warn('[Stream] Mine error:', e.message); }

        if (rawProducts.length === 0) {
          session.exhaustedCategories.add(cat);
          sseWrite({ type: 'status', phase: 'mining', message: `No results for ${cat}, switching category...` });
          continue;
        }

        // Phase 5 — Enrich + stream one by one
        const batch = rawProducts.slice(0, STREAM_CONFIG.maxProductsPerMineRound);
        for (const raw of batch) {
          if (ctrl.signal.aborted) break;

          sseWrite({ type: 'status', phase: 'enriching', message: `AI analyzing: ${raw.name.slice(0, 42)}...` });
          const enrich = await this.ai.enrichProduct(raw, cat, location);

          const product = {
            id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            sessionId,
            name: raw.name,
            category: cat,
            price: raw.price,
            currency: location.currency || 'INR',
            costPrice: enrich.estimatedCost,
            margin: enrich.estimatedMargin,
            demandScore: enrich.demandScore,
            competition: enrich.competitionLevel,
            whyTrending: enrich.whyTrending,
            sellerTip: enrich.sellerTip,
            confidence: enrich.confidence,
            rating: raw.rating,
            reviews: raw.reviews,
            sourceUrl: raw.url,
            sourceDomain: raw.source,
            platform: raw.platform,
            location: { country: location.country, city: location.city || '' },
            emittedAt: new Date().toISOString(),
          };

          sseWrite({ type: 'product', product });
          this.memory.recordProduct(sessionId, product, false);
          this.memory.updateSiteScore(raw.source, cat, location.country, false, enrich.estimatedMargin);

          // Persist to temp_trending_products for Trending top-100
          try { dbUpsertDiscoveredProduct(product); } catch (e) { /* non-fatal */ }

          await new Promise(r => setTimeout(r, STREAM_CONFIG.streamDelayMs));
        }
      }

      sseWrite({ type: 'complete', message: 'Discovery session finished.' });

    } catch (e) {
      console.error('[Stream] Session error:', e.message);
      sseWrite({ type: 'error', message: e.message });
    } finally {
      this.active.delete(sessionId);
      this.memory.closeSession(sessionId);
    }
  }

  handleSave(sessionId, product) {
    const s = this.memory.getSession(sessionId);
    if (!s) return;
    this.memory.recordProduct(sessionId, product, true);
    if (product.sourceDomain && product.category)
      this.memory.updateSiteScore(product.sourceDomain, product.category, s.location.country, true, product.margin);
    // Boost hero_score in persistent DB
    try { dbBoostProductScore(product.name, s.location.country, 8); } catch {}
  }

  handleSkip(sessionId, product) {
    this.memory.recordProduct(sessionId, product, false);
    const s = this.memory.getSession(sessionId);
    if (s && product.sourceDomain && product.category)
      this.memory.updateSiteScore(product.sourceDomain, product.category, s.location.country, false, product.margin);
    // Penalise hero_score in persistent DB
    try { dbBoostProductScore(product.name, s?.location.country || 'India', -3); } catch {}
  }

  stopStream(sessionId) {
    const ctrl = this.active.get(sessionId);
    if (ctrl) { ctrl.abort(); this.active.delete(sessionId); }
  }
}
