// ============================================================
// ECO Supplier Discovery Engine v1.0
// Multi-source supplier scraping with AI keyword generation
// and self-improving contact extraction
// ============================================================

import { CheerioCrawler, RequestQueue } from 'crawlee';
import * as cheerio from 'cheerio';
import axios from 'axios';

// ─── Configuration ─────────────────────────────────────────
const CONFIG = {
  maxSourcesPerProduct: 15,
  maxPagesPerSource: 3,
  requestTimeout: 30000,
  minDelay: 2000,
  maxDelay: 5000,
  emailRegex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phoneRegex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g,
  mobileRegex: /(?:\+91[-\s]?)?[6-9]\d{9}/g,
  confidenceThreshold: 0.45,
  feedbackDecay: 0.95,
  explorationRate: 0.15,
  nimEndpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
  nimModel: 'z-ai/glm-5.2',
  nimFallback: 'minimaxai/minimax-m3'
};

// ─── Source Registry (Epsilon-Greedy Selection) ──────────────
class SourceRegistry {
  constructor(db) {
    this.db = db;
    this.sources = new Map();
  }

  async loadSources() {
    // If using better-sqlite3, `all` might not be async, but assuming db wrapper gives async interface
    const rows = this.db.prepare ? this.db.prepare(`
      SELECT domain, source_type, success_rate, avg_contacts_found, 
             last_used, quality_score, is_active, attempt_count, success_count
      FROM supplier_sources ORDER BY quality_score DESC
    `).all() : await this.db.all(`
      SELECT domain, source_type, success_rate, avg_contacts_found, 
             last_used, quality_score, is_active, attempt_count, success_count
      FROM supplier_sources ORDER BY quality_score DESC
    `);
    
    const rowsArray = Array.isArray(rows) ? rows : (rows || []);
    for (const row of rowsArray) {
      this.sources.set(row.domain, {
        type: row.source_type,
        successRate: row.success_rate,
        avgContacts: row.avg_contacts_found,
        lastUsed: row.last_used,
        quality: row.quality_score,
        active: row.is_active === 1,
        attemptCount: row.attempt_count || 0,
        successCount: row.success_count || 0
      });
    }
  }

  selectSources(count = 10) {
    const active = Array.from(this.sources.entries()).filter(([_, s]) => s.active);
    const exploration = Math.random() < CONFIG.explorationRate;
    let selected;
    if (exploration && active.length > count) {
      selected = active.sort(() => Math.random() - 0.5).slice(0, count);
    } else {
      selected = active.sort((a, b) => b[1].quality - a[1].quality).slice(0, count);
    }
    return selected.map(([domain, meta]) => ({ domain, ...meta }));
  }

  async updateFeedback(domain, contactsFound, wasUseful) {
    const src = this.sources.get(domain);
    if (!src) return;
    src.attemptCount++;
    if (contactsFound > 0) src.successCount++;
    const newSuccessRate = src.attemptCount > 0 ? src.successCount / src.attemptCount : 0;
    const contactQuality = Math.min(contactsFound / 3, 1);
    const feedback = wasUseful ? 1.0 : (contactsFound > 0 ? 0.5 : 0.0);
    src.quality = CONFIG.feedbackDecay * src.quality + (1 - CONFIG.feedbackDecay) * feedback;
    
    if (this.db.prepare) {
      this.db.prepare(`
        UPDATE supplier_sources 
        SET success_rate = ?, avg_contacts_found = ?, quality_score = ?, 
            last_used = datetime('now'), attempt_count = ?, success_count = ?
        WHERE domain = ?
      `).run(newSuccessRate, contactQuality, src.quality, src.attemptCount, src.successCount, domain);
    } else {
      await this.db.run(`
        UPDATE supplier_sources 
        SET success_rate = ?, avg_contacts_found = ?, quality_score = ?, 
            last_used = datetime('now'), attempt_count = ?, success_count = ?
        WHERE domain = ?
      `, [newSuccessRate, contactQuality, src.quality, src.attemptCount, src.successCount, domain]);
    }
  }
}

// ─── AI Keyword Generator ──────────────────────────────────────
class KeywordGenerator {
  constructor(apiKey, fallbackKey) {
    this.apiKey = apiKey;
    this.fallbackKey = fallbackKey;
  }

  async generate(productName, category = '', geo = 'India') {
    const prompt = `You are a supplier sourcing expert. Generate 12 high-conversion search queries to find wholesale suppliers, manufacturers, and distributors for this product.

Product: "${productName}"
Category: ${category || 'general'}
Target Geography: ${geo}

Rules:
- Include variations: "wholesale", "manufacturer", "bulk supplier", "distributor", "exporter", "factory"
- Include B2B portal names: IndiaMART, TradeIndia, Alibaba, ExportersIndia
- Include contact-finding patterns: "contact", "phone", "email", "address"
- Mix Hindi/English terms for Indian markets where relevant
- Return ONLY a JSON array of strings. No markdown, no explanation.

Example: ["wholesale cotton t-shirts manufacturer Mumbai contact", "bulk t-shirt supplier IndiaMART phone"]`;

    try {
      const result = await this.callNIM(CONFIG.nimModel, prompt, this.apiKey);
      return this.parseKeywords(result, productName);
    } catch (e) {
      console.log('Primary NIM failed, trying fallback:', e.message);
      const result = await this.callNIM(CONFIG.nimFallback, prompt, this.fallbackKey);
      return this.parseKeywords(result, productName);
    }
  }

  async callNIM(model, prompt, key) {
    const res = await axios.post(CONFIG.nimEndpoint, {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 800,
      reasoning_effort: 'medium'
    }, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (key || '') },
      timeout: 15000
    });
    return res.data.choices[0].message.content;
  }

  parseKeywords(raw, productName) {
    try {
      const match = raw.match(/\[[\s\S]*?\]/);
      const arr = match ? JSON.parse(match[0]) : JSON.parse(raw);
      return arr.filter(k => typeof k === 'string' && k.length > 3).slice(0, 12);
    } catch {
      return this.fallbackKeywords(productName);
    }
  }

  fallbackKeywords(productName) {
    const bases = ['wholesale', 'manufacturer', 'bulk supplier', 'distributor', 'factory', 'exporter'];
    const portals = ['IndiaMART', 'TradeIndia', 'Alibaba', 'ExportersIndia'];
    const queries = [];
    bases.forEach(b => queries.push(`${b} ${productName}`));
    portals.forEach(p => queries.push(`${productName} ${p}`));
    queries.push(`${productName} supplier contact number`, `${productName} manufacturer address`);
    return queries;
  }
}

// ─── Contact Extractor ───────────────────────────────────────
class ContactExtractor {
  constructor() {
    this.addressIndicators = [
      'address', 'addr', 'location', 'situated', 'based in', 'head office',
      'ho:', 'regd office', 'factory', 'works:', 'plot no', 'street', 'road',
      'near', 'opposite', 'opp.', 'landmark', 'pincode', 'pin code', 'zip'
    ];
  }

  extract($, url) {
    const result = {
      emails: new Set(),
      phones: new Set(),
      mobiles: new Set(),
      addresses: [],
      website: null,
      companyName: null,
      sourceUrl: url,
      confidence: 0,
      extractionMethod: []
    };

    result.companyName = this.extractCompanyName($, url);
    const bodyText = $('body').text();

    // Emails
    (bodyText.match(CONFIG.emailRegex) || []).forEach(e => {
      if (this.isValidEmail(e)) result.emails.add(e.toLowerCase());
    });

    // Phones
    (bodyText.match(CONFIG.phoneRegex) || []).forEach(p => result.phones.add(this.normalizePhone(p)));
    (bodyText.match(CONFIG.mobileRegex) || []).forEach(m => result.mobiles.add(this.normalizePhone(m)));

    // Addresses
    result.addresses = this.extractAddresses($, bodyText);

    // Website
    result.website = this.extractWebsite($, url);

    // Confidence
    result.confidence = this.calculateConfidence(result);
    result.extractionMethod = this.tagMethods(result);

    return {
      ...result,
      emails: Array.from(result.emails),
      phones: Array.from(result.phones),
      mobiles: Array.from(result.mobiles)
    };
  }

  extractCompanyName($, url) {
    const selectors = ['h1.company-name', '.company-name', '.supplier-name', '[itemprop="name"]', 'h1', '.business-name', '.seller-name', '.vendor-name', 'title'];
    for (const sel of selectors) {
      const text = $(sel).first().text().trim();
      if (text && text.length > 2 && text.length < 100) return text.replace(/\s+/g, ' ');
    }
    try {
      return new URL(url).hostname.replace(/^www\./, '').split('.')[0];
    } catch { return null; }
  }

  extractAddresses($, text) {
    const addresses = [];
    $('[itemprop="address"], [itemtype*="PostalAddress"]').each((_, el) => {
      const addr = $(el).text().trim();
      if (addr.length > 10 && addr.length < 300) addresses.push(addr);
    });
    const lines = text.split(/[\n\r]+|<br\s*\/?>|<p>/i);
    for (const line of lines) {
      const clean = line.replace(/\s+/g, ' ').trim();
      const lower = clean.toLowerCase();
      const hasIndicator = this.addressIndicators.some(ind => lower.includes(ind));
      const hasNumber = /\d/.test(clean);
      if (hasIndicator && hasNumber && clean.length > 15 && clean.length < 300) {
        if (!/menu|home|about|contact|login|search|cart|privacy/i.test(clean)) {
          addresses.push(clean);
        }
      }
    }
    return [...new Set(addresses)].slice(0, 3);
  }

  extractWebsite($, currentUrl) {
    const links = $('a[href^="http"]');
    const currentDomain = new URL(currentUrl).hostname;
    for (let i = 0; i < links.length; i++) {
      try {
        const href = $(links[i]).attr('href');
        const url = new URL(href);
        if (url.hostname !== currentDomain && !url.hostname.includes('google')) return href;
      } catch { continue; }
    }
    return currentUrl;
  }

  isValidEmail(email) {
    const blacklist = ['example.com', 'test.com', 'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'email.com', 'domain.com'];
    const domain = email.split('@')[1]?.toLowerCase();
    return domain && !blacklist.includes(domain) && email.length < 60;
  }

  normalizePhone(phone) {
    return phone.replace(/[^\d+]/g, '').replace(/^0/, '+91');
  }

  calculateConfidence(result) {
    let score = 0;
    if (result.companyName) score += 0.2;
    if (result.emails.size > 0) score += 0.3;
    if (result.mobiles.size > 0) score += 0.25;
    if (result.phones.size > 0) score += 0.1;
    if (result.addresses.length > 0) score += 0.15;
    return Math.min(score, 1.0);
  }

  tagMethods(result) {
    const methods = [];
    if (result.emails.size > 0) methods.push('regex_email');
    if (result.mobiles.size > 0) methods.push('regex_mobile');
    if (result.addresses.length > 0) methods.push('pattern_address');
    return methods;
  }
}

// ─── Multi-Source Scraper ────────────────────────────────────
class SupplierScraper {
  constructor(registry, extractor, db) {
    this.registry = registry;
    this.extractor = extractor;
    this.db = db;
  }

  async discover(productName, keywords, category = '', geo = 'India') {
    const allSuppliers = [];
    const seenDomains = new Set();

    // Phase 1: Google Search
    const googleResults = await this.scrapeGoogle(productName, keywords);

    // Phase 2: B2B Portals
    const b2bResults = await this.scrapeB2BPortals(productName, keywords);

    // Phase 3: Deep crawl for contacts
    const allUrls = [...googleResults, ...b2bResults].filter(u => {
      const domain = this.getDomain(u);
      if (seenDomains.has(domain)) return false;
      seenDomains.add(domain);
      return true;
    }).slice(0, CONFIG.maxSourcesPerProduct);

    if (allUrls.length === 0) return [];

    const requestQueue = await RequestQueue.open();
    for (const url of allUrls) {
      await requestQueue.addRequest({ url, userData: { productName, phase: 'contact' } });
    }

    const crawler = new CheerioCrawler({
      requestQueue,
      requestHandler: async ({ request, $ }) => {
        const contacts = this.extractor.extract($, request.url);
        if (contacts.confidence >= CONFIG.confidenceThreshold) {
          allSuppliers.push({
            ...contacts,
            productName,
            category,
            geo,
            discoveredAt: new Date().toISOString(),
            sourceDomain: this.getDomain(request.url)
          });
        }
      },
      maxRequestsPerCrawl: CONFIG.maxSourcesPerProduct * CONFIG.maxPagesPerSource,
      requestTimeout: { timeoutSecs: 30 },
      maxConcurrency: 2,
      preNavigationHooks: [async () => {
        await new Promise(r => setTimeout(r, CONFIG.minDelay + Math.random() * (CONFIG.maxDelay - CONFIG.minDelay)));
      }]
    });

    await crawler.run();
    const deduped = this.deduplicate(allSuppliers);
    await this.saveSuppliers(deduped);
    return deduped;
  }

  async scrapeGoogle(productName, keywords) {
    const urls = [];
    const searchQueries = keywords.slice(0, 6);
    for (const query of searchQueries) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20`;
      try {
        const { data } = await axios.get(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 10000
        });
        const $ = cheerio.load(data);
        $('a[href^="http"]').each((_, el) => {
          const href = $(el).attr('href');
          if (href && !href.includes('google.com') && !href.includes('youtube.com')) urls.push(href);
        });
      } catch (e) {
        console.log(`Google search failed for "${query}": ${e.message}`);
      }
    }
    return [...new Set(urls)];
  }

  async scrapeB2BPortals(productName, keywords) {
    const urls = [];
    const portals = [
      { name: 'indiamart', searchUrl: (q) => `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(q)}` },
      { name: 'tradeindia', searchUrl: (q) => `https://www.tradeindia.com/search.html?keyword=${encodeURIComponent(q)}` },
      { name: 'exportersindia', searchUrl: (q) => `https://www.exportersindia.com/search.php?term=${encodeURIComponent(q)}` }
    ];
    for (const portal of portals) {
      try {
        const url = portal.searchUrl(productName);
        const { data } = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 10000
        });
        const $ = cheerio.load(data);
        $('a[href^="http"]').each((_, el) => {
          const href = $(el).attr('href');
          if (href && href.includes(portal.name)) {
            urls.push(href.startsWith('http') ? href : `https://${portal.name}.com${href}`);
          }
        });
      } catch (e) {
        console.log(`${portal.name} scrape failed: ${e.message}`);
      }
    }
    return [...new Set(urls)];
  }

  deduplicate(suppliers) {
    const byDomain = new Map();
    for (const s of suppliers) {
      const domain = this.getDomain(s.sourceUrl);
      const existing = byDomain.get(domain);
      if (!existing || s.confidence > existing.confidence) byDomain.set(domain, s);
    }
    return Array.from(byDomain.values());
  }

  getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  }

  async saveSuppliers(suppliers) {
    for (const s of suppliers) {
      if (this.db.prepare) {
        this.db.prepare(`
          INSERT OR REPLACE INTO discovered_suppliers 
          (id, product_name, category, company_name, emails, phones, mobiles, 
           addresses, website, source_url, source_domain, confidence, trust_score,
           geo, discovered_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.hashId(s.sourceUrl),
          s.productName, s.category, s.companyName,
          JSON.stringify(s.emails), JSON.stringify(s.phones), JSON.stringify(s.mobiles),
          JSON.stringify(s.addresses), s.website, s.sourceUrl, s.sourceDomain,
          s.confidence, this.calculateTrust(s), s.geo, s.discoveredAt, 'new'
        );
      } else {
        await this.db.run(`
          INSERT OR REPLACE INTO discovered_suppliers 
          (id, product_name, category, company_name, emails, phones, mobiles, 
           addresses, website, source_url, source_domain, confidence, trust_score,
           geo, discovered_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          this.hashId(s.sourceUrl),
          s.productName, s.category, s.companyName,
          JSON.stringify(s.emails), JSON.stringify(s.phones), JSON.stringify(s.mobiles),
          JSON.stringify(s.addresses), s.website, s.sourceUrl, s.sourceDomain,
          s.confidence, this.calculateTrust(s), s.geo, s.discoveredAt, 'new'
        ]);
      }
    }
  }

  hashId(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sup_${Math.abs(hash).toString(36)}`;
  }

  calculateTrust(s) {
    let score = (s.confidence || 0) * 50;
    if (s.emails?.length > 0) score += 15;
    if (s.mobiles?.length > 0) score += 15;
    if (s.addresses?.length > 0) score += 10;
    if (s.website) score += 10;
    return Math.min(Math.round(score), 100);
  }
}

// ─── Learning Loop ─────────────────────────────────────────────
class LearningLoop {
  constructor(db, registry) {
    this.db = db;
    this.registry = registry;
  }

  async recordFeedback(supplierId, feedback) {
    let supplier;
    if (this.db.prepare) {
      supplier = this.db.prepare('SELECT * FROM discovered_suppliers WHERE id = ?').get(supplierId);
    } else {
      supplier = await this.db.get('SELECT * FROM discovered_suppliers WHERE id = ?', [supplierId]);
    }
    
    if (!supplier) return;
    const contactsFound = (JSON.parse(supplier.emails || '[]').length + JSON.parse(supplier.phones || '[]').length);
    await this.registry.updateFeedback(supplier.source_domain, contactsFound, feedback.wasUseful);
    
    if (this.db.prepare) {
      this.db.prepare(`
        INSERT INTO keyword_feedback (keyword, product_category, success, used_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(supplier.product_name, supplier.category, feedback.wasUseful ? 1 : 0);
    } else {
      await this.db.run(`
        INSERT INTO keyword_feedback (keyword, product_category, success, used_at)
        VALUES (?, ?, ?, datetime('now'))
      `, [supplier.product_name, supplier.category, feedback.wasUseful ? 1 : 0]);
    }
    
    await this.maybeRetrainKeywords();
  }

  async maybeRetrainKeywords() {
    let count;
    if (this.db.prepare) {
      count = this.db.prepare('SELECT COUNT(*) as c FROM keyword_feedback WHERE used_at > datetime("now", "-7 days")').get();
    } else {
      count = await this.db.get('SELECT COUNT(*) as c FROM keyword_feedback WHERE used_at > datetime("now", "-7 days")');
    }
    
    if (count.c < 50) return;
    
    let topKeywords;
    if (this.db.prepare) {
      topKeywords = this.db.prepare(`
        SELECT keyword, AVG(success) as avg_success, COUNT(*) as uses
        FROM keyword_feedback WHERE used_at > datetime("now", "-30 days")
        GROUP BY keyword HAVING uses >= 5 ORDER BY avg_success DESC LIMIT 20
      `).all();
    } else {
      topKeywords = await this.db.all(`
        SELECT keyword, AVG(success) as avg_success, COUNT(*) as uses
        FROM keyword_feedback WHERE used_at > datetime("now", "-30 days")
        GROUP BY keyword HAVING uses >= 5 ORDER BY avg_success DESC LIMIT 20
      `);
    }
    
    for (const kw of topKeywords) {
      if (this.db.prepare) {
        this.db.prepare(`
          INSERT OR REPLACE INTO keyword_templates (keyword, score, category, updated_at)
          VALUES (?, ?, ?, datetime('now'))
        `).run(kw.keyword, kw.avg_success, 'general');
      } else {
        await this.db.run(`
          INSERT OR REPLACE INTO keyword_templates (keyword, score, category, updated_at)
          VALUES (?, ?, ?, datetime('now'))
        `, [kw.keyword, kw.avg_success, 'general']);
      }
    }
    console.log(`Learning loop: Updated ${topKeywords.length} keyword templates`);
  }

  async getImprovedKeywords(productName, category) {
    let templates;
    if (this.db.prepare) {
      templates = this.db.prepare(`
        SELECT keyword, score FROM keyword_templates
        WHERE category = ? OR category = 'general' ORDER BY score DESC LIMIT 10
      `).all(category);
    } else {
      templates = await this.db.all(`
        SELECT keyword, score FROM keyword_templates
        WHERE category = ? OR category = 'general' ORDER BY score DESC LIMIT 10
      `, [category]);
    }
    
    return templates.map(t => t.keyword.replace(/\[product\]/gi, productName));
  }

  async autoDiscover(trendingProducts) {
    const results = [];
    for (const product of trendingProducts) {
      let recent;
      if (this.db.prepare) {
        recent = this.db.prepare(`
          SELECT COUNT(*) as c FROM discovered_suppliers 
          WHERE product_name = ? AND discovered_at > datetime('now', '-3 days')
        `).get(product.name);
      } else {
        recent = await this.db.get(`
          SELECT COUNT(*) as c FROM discovered_suppliers 
          WHERE product_name = ? AND discovered_at > datetime('now', '-3 days')
        `, [product.name]);
      }
      
      if (recent.c > 0) continue;
      results.push({ product: product.name, status: 'queued', message: 'Scheduled for auto-discovery' });
    }
    return results;
  }
}

// ─── Main Engine API ───────────────────────────────────────────
class SupplierDiscoveryEngine {
  constructor(config) {
    this.db = config.db;
    this.apiKey = config.nimApiKey;
    this.fallbackKey = config.nimFallbackKey;
    this.registry = new SourceRegistry(this.db);
    this.keywordGen = new KeywordGenerator(this.apiKey, this.fallbackKey);
    this.extractor = new ContactExtractor();
    this.scraper = new SupplierScraper(this.registry, this.extractor, this.db);
    this.learning = new LearningLoop(this.db, this.registry);
  }

  async init() {
    await this.registry.loadSources();
  }

  async findSuppliers({ productName, category, geo, useLearning = true }) {
    const startTime = Date.now();
    let keywords;
    if (useLearning) {
      const learned = await this.learning.getImprovedKeywords(productName, category);
      keywords = learned.length > 0 ? learned : await this.keywordGen.generate(productName, category, geo);
    } else {
      keywords = await this.keywordGen.generate(productName, category, geo);
    }
    const suppliers = await this.scraper.discover(productName, keywords, category, geo);
    const enriched = suppliers.map(s => ({
      ...s,
      trustScore: this.scraper.calculateTrust(s),
      platformTag: this.tagPlatform(s.sourceDomain),
      contactReadiness: s.emails.length > 0 && s.mobiles.length > 0 ? 'high' : 
                       s.emails.length > 0 || s.mobiles.length > 0 ? 'medium' : 'low'
    }));
    return {
      productName, keywordsUsed: keywords, supplierCount: enriched.length,
      suppliers: enriched, executionTime: Date.now() - startTime, learningEnabled: useLearning
    };
  }

  tagPlatform(domain) {
    if (domain.includes('indiamart')) return 'IndiaMART';
    if (domain.includes('tradeindia')) return 'TradeIndia';
    if (domain.includes('alibaba')) return 'Alibaba';
    if (domain.includes('1688')) return '1688';
    if (domain.includes('exportersindia')) return 'ExportersIndia';
    if (domain.includes('made-in-china')) return 'Made-in-China';
    return 'Direct';
  }

  async submitFeedback(supplierId, feedback) {
    await this.learning.recordFeedback(supplierId, feedback);
    return { success: true, message: 'Feedback recorded. Learning loop updated.' };
  }

  async getSuppliersForProduct(productName) {
    if (this.db.prepare) {
      return this.db.prepare(`
        SELECT * FROM discovered_suppliers 
        WHERE product_name = ? ORDER BY confidence DESC, discovered_at DESC
      `).all(productName);
    } else {
      return await this.db.all(`
        SELECT * FROM discovered_suppliers 
        WHERE product_name = ? ORDER BY confidence DESC, discovered_at DESC
      `, [productName]);
    }
  }
}

export { SupplierDiscoveryEngine, ContactExtractor, KeywordGenerator };


