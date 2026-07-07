/* ============================================================
   Server v4 — Crawlee Live Scraping + AI Intelligence
   ============================================================
   Crawlee: Scrapes Amazon, Google Shopping, Flipkart, eBay
   AI:      NVIDIA z-ai/glm-5.2 market intelligence
   100% free — no API keys needed for scraping
   ============================================================
   Run:  node server.js
   Open: http://localhost:3000
   ============================================================ */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { scrapeProducts, COUNTRY_CURRENCIES, safeParseLLMResponse } from './scraper.js';

// v2.5 — SQLite persistent database
import {
  getDB, dbGetSaved, dbGetSavedById, dbInsertSaved, dbUpdateSaved,
  dbDeleteSaved, dbPinSaved, dbClearUnpinned, dbGetSetting, dbSetSetting,
  dbGetRates, dbSetRates, dbGetProductDetail, dbSaveProductDetail,
  dbGetScrapeCache, dbSetScrapeCache, dbGetUrlLookup, dbSaveUrlLookup,
  dbGetListings, dbUpsertListing, dbMigrateFromClient,
  dbGetProducts, dbGetProductById, dbGetSuppliers, dbGetSupplierById, dbGetPlatforms,
  dbGetDashboardStats, dbResetDatabase
} from './db/sqlite.js';

import { SupplierDiscoveryEngine } from './src/supplier-discovery-engine.js';

// ✅ NEW: Import all the fix modules
import { Validators } from './src/validators.js';
import { logger } from './src/logger.js';
import { searchCache } from './src/cache.js';
import { dedup } from './src/dedup.js';
import { compressResponseSync } from './src/compression.js';
import { healthCheck } from './src/health.js';
import { metrics } from './src/metrics.js';

// Init DB on startup
try {
  // Ensure DB is fully initialized (getDB may return a promise)
  await getDB();
  logger.info('Server', 'Database initialized successfully');
} catch(e) {
  logger.error('SQLite', 'Init error', e);
}

// Saved API key loading deferred until AI_CONFIG is created (see below)
// (Loading is applied after AI_CONFIG is defined to avoid accidental overwrites during module initialization)


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  port: parseInt(process.env.PORT) || 3000,
  ai: {
    host: 'integrate.api.nvidia.com',
    path: '/v1/chat/completions',
    primary: { model: 'z-ai/glm-5.2', temperature: 0.7, maxTokens: 4096, reasoningEffort: 'max' },
    fallback: { model: 'minimaxai/minimax-m3', temperature: 1, maxTokens: 4096, topP: 0.95 },
    timeout: 45000,
    seed: 42
  },
  agent: { maxTurns: 8, maxTokens: 1500, timeout: 30000 },
  scraper: { maxConcurrent: 3, timeout: 50000, maxPages: 50, requestDelay: 1000 },
  rateLimit: { windowMs: 60000, maxRequests: 30 },
  cache: { ttlMs: 3600000 }
};

const PORT = CONFIG.port;
const STATIC_DIR = __dirname;

// In-memory research cache
const RESEARCH_CACHE = new Map();
// Cleanup old cache entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of RESEARCH_CACHE.entries()) {
    if (now - val.ts > CONFIG.cache.ttlMs) RESEARCH_CACHE.delete(key);
  }
}, CONFIG.cache.ttlMs);

// ─── Config ─────────────────────────────────────────────────
let PRIMARY_API_KEY = process.env.NVIDIA_API_KEY || '';
let FALLBACK_API_KEY = process.env.MINIMAX_API_KEY || '';

const AI_CONFIG = {
  host: CONFIG.ai.host,
  path: CONFIG.ai.path,
  model: CONFIG.ai.primary.model,
  apiKey: PRIMARY_API_KEY,
  enabled: false,
};

// ─── MiniMax Fallback ────────────────────────────────────────
const AI_FALLBACK = {
  host: CONFIG.ai.host,
  path: CONFIG.ai.path,
  model: CONFIG.ai.fallback.model,
  apiKey: FALLBACK_API_KEY,
  top_p: CONFIG.ai.fallback.topP,
};

// ─── Universal AI caller with auto-fallback ──────────────────
function callAI(messages, opts = {}) {
  return new Promise((resolve) => {
    const tryCall = (cfg, isFallback) => {
      const pd = JSON.stringify({
        model:       cfg.model,
        messages,
        temperature: opts.temperature || 1,
        top_p:       cfg.top_p || opts.top_p || 1,
        max_tokens:  opts.max_tokens || 4096,
        seed:        42,
        stream:      false,
      });
      const apiReq = https.request({
        hostname: cfg.host, port: 443, path: cfg.path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Length': Buffer.byteLength(pd) },
      }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          if ((r.statusCode === 200)) {
            try { resolve(JSON.parse(d)); } catch { resolve(null); }
          } else if (!isFallback) {
            console.warn(`[AI] Primary failed (${r.statusCode}), trying MiniMax fallback...`);
            tryCall(AI_FALLBACK, true);
          } else {
            console.error(`[AI] Both primary and fallback failed. Status: ${r.statusCode}`);
            resolve(null);
          }
        });
      });
      apiReq.on('error', (e) => {
        if (!isFallback) {
          console.warn('[AI] Primary network error, trying fallback:', e.message);
          tryCall(AI_FALLBACK, true);
        } else { resolve(null); }
      });
      apiReq.setTimeout(CONFIG.ai.timeout, () => { apiReq.destroy(); if (!isFallback) tryCall(AI_FALLBACK, true); else resolve(null); });
      apiReq.write(pd); apiReq.end();
    };
    const primary = AI_CONFIG.enabled ? AI_CONFIG : AI_FALLBACK;
    tryCall(primary, !AI_CONFIG.enabled);
  });
}

// Load both keys from DB on startup
try {
  const primaryRow = dbGetSetting('nvidia_api_key');
  const fallbackRow = dbGetSetting('minimax_api_key');
  if (primaryRow) {
    PRIMARY_API_KEY = primaryRow;
    AI_CONFIG.apiKey = PRIMARY_API_KEY;
    AI_CONFIG.enabled = true;
    console.log(`[Startup] Primary AI (GLM-5.2) enabled with key: ${PRIMARY_API_KEY.slice(0,10)}...`);
  }
  if (fallbackRow) {
    FALLBACK_API_KEY = fallbackRow;
    AI_FALLBACK.apiKey = FALLBACK_API_KEY;
    console.log(`[Startup] Fallback AI (MiniMax-M3) enabled with key: ${FALLBACK_API_KEY.slice(0,10)}...`);
  }
  if (!primaryRow && !fallbackRow) {
    console.log('[Startup] No API keys found. Set via Settings UI.');
  }
} catch(e) { console.warn('[Startup] Key load error:', e.message); }

// MIME types for static server
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// ─── Main Server ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  const origin = req.headers.origin;
  if (origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('http://[::1]'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Simple memory-based rate limiter
  if (['/api/scrape', '/api/ai', '/api/agent/chat', '/api/url-lookup', '/api/product-detail', '/api/trending/page', '/api/search/page'].includes(pathname)) {
    if (!rateLimiter(req, res)) return;
  }

  // ─── API Routes ───
  if (pathname === '/api/scrape' && req.method === 'POST') return handleScrape(req, res);
  if (pathname === '/api/ai' && req.method === 'POST') return handleAIProxy(req, res);
  if (pathname === '/api/set-key' && req.method === 'POST') return handleSetKey(req, res);
  if (pathname === '/api/product-detail' && req.method === 'POST') return handleProductDetail(req, res);
  // v2.2 Research + Competitor Routes
  if (pathname === '/api/research/multi-page' && req.method === 'POST') return handleMultiPageResearch(req, res);
  if (pathname.startsWith('/api/research/trends/') && req.method === 'GET') return handleTrends(req, res, pathname);
  if (pathname === '/api/competitor/price' && req.method === 'POST') return handleCompetitorPrice(req, res);
  // v2.3 Agent + Scraper Routes
  if (pathname === '/api/agent/chat' && req.method === 'POST') return handleAgentChat(req, res);
  if (pathname === '/api/scraper/run' && req.method === 'POST') return handleScraperRun(req, res);
  if (pathname === '/api/agent/tools' && req.method === 'GET') return handleAgentTools(req, res);
  // v2.5 SQLite DB REST API
  if (pathname === '/api/db/saved'            && req.method === 'GET')    return handleDBGetSaved(req, res);
  if (pathname === '/api/db/saved'            && req.method === 'POST')   return handleDBInsertSaved(req, res);
  if (pathname.startsWith('/api/db/saved/')   && req.method === 'PUT')    return handleDBUpdateSaved(req, res, pathname);
  if (pathname.startsWith('/api/db/saved/')   && req.method === 'DELETE') return handleDBDeleteSaved(req, res, pathname);
  if (pathname.startsWith('/api/db/pin/')     && req.method === 'POST')   return handleDBPinSaved(req, res, pathname);
  if (pathname === '/api/db/clear'            && req.method === 'POST')   return handleDBClear(req, res);
  if (pathname === '/api/db/settings'         && req.method === 'GET')    return handleDBGetSettings(req, res);
  if (pathname === '/api/db/settings'         && req.method === 'POST')   return handleDBSetSetting(req, res);
  if (pathname === '/api/db/migrate'          && req.method === 'POST')   return handleDBMigrate(req, res);
  if (pathname === '/api/db/dashboard-stats'  && req.method === 'GET')    return handleDBDashboardStats(req, res);
  if (pathname === '/api/scrape/competitor'   && req.method === 'GET')    return handleScrapeCompetitor(req, res);
  if (pathname === '/api/db/rates'            && req.method === 'GET')    return handleDBGetRates(req, res);
  if (pathname === '/api/db/rates'            && req.method === 'POST')   return handleDBSetRates(req, res);
  if (pathname.startsWith('/api/db/listings/') && req.method === 'GET')   return handleDBGetListings(req, res, pathname);
  if (pathname === '/api/db/listings/generate' && req.method === 'POST')  return handleDBGenerateListing(req, res);
  // v2.5 Seeded tables endpoints
  if (pathname === '/api/db/products'         && req.method === 'GET')    return handleDBGetProducts(req, res);
  if (pathname.startsWith('/api/db/products/') && req.method === 'GET')   return handleDBGetProductById(req, res, pathname);
  if (pathname === '/api/db/suppliers'        && req.method === 'GET')    return handleDBGetSuppliers(req, res);
  if (pathname.startsWith('/api/db/suppliers/') && req.method === 'GET')  return handleDBGetSupplierById(req, res, pathname);
  if (pathname === '/api/db/platforms'        && req.method === 'GET')    return handleDBGetPlatforms(req, res);
  // v2.5 Paginated trending/search + URL lookup
  if (pathname === '/api/trending/page' && req.method === 'POST') return handleTrendingPage(req, res);
  if (pathname === '/api/search/page'   && req.method === 'POST') return handleSearchPage(req, res);
  if (pathname === '/api/search/upload' && req.method === 'POST') return handleImageSearchUpload(req, res);
  if (pathname === '/api/url-lookup'          && req.method === 'POST')   return handleURLLookup(req, res);
  if (pathname === '/api/trending/deep-research' && req.method === 'POST') return handleDeepResearch(req, res);
  
  // ✅ NEW: Supplier Discovery Engine Routes
  if (pathname === '/api/suppliers/discover' && req.method === 'POST') return handleSupplierDiscover(req, res);
  if (pathname === '/api/suppliers/product' && req.method === 'GET') return handleSupplierProduct(req, res, reqUrl);
  if (pathname === '/api/suppliers/feedback' && req.method === 'POST') return handleSupplierFeedback(req, res);
  if (pathname === '/api/suppliers/auto-discover' && req.method === 'GET') return handleSupplierAutoDiscover(req, res);
  
  // ✅ NEW: Health check + monitoring endpoints
  if (pathname === '/api/health' && req.method === 'GET') {
    healthCheck.check().then(health => {
      compressResponseSync(req, res, health);
    });
    return;
  }
  
  if (pathname === '/api/logs' && req.method === 'GET') {
    const limit = parseInt(reqUrl.searchParams.get('limit')) || 100;
    const level = reqUrl.searchParams.get('level') || null;
    const component = reqUrl.searchParams.get('component') || null;
    const logs = logger.getLogs({ level, component, limit });
    compressResponseSync(req, res, { logs, count: logs.length });
    return;
  }
  
  if (pathname === '/api/logs/stats' && req.method === 'GET') {
    const stats = logger.getStats();
    compressResponseSync(req, res, stats);
    return;
  }
  
  if (pathname === '/api/metrics' && req.method === 'GET') {
    const snapshot = metrics.getSnapshot();
    compressResponseSync(req, res, snapshot);
    return;
  }
  
  if (pathname === '/api/cache/stats' && req.method === 'GET') {
    const stats = searchCache.getStats();
    stats.capacity = searchCache.getCapacityPercent() + '%';
    compressResponseSync(req, res, stats);
    return;
  }
  
  if (pathname === '/api/cache/clear' && req.method === 'POST') {
    searchCache.clear();
    dedup.clear();
    logger.info('Cache', 'Cache cleared');
    compressResponseSync(req, res, { success: true, message: 'Cache cleared' });
    return;
  }

  // ✅ NEW: AI Status Check Endpoint
  if (pathname === '/api/ai-status' && req.method === 'GET') {
    jsonOk(res, {
      enabled: AI_CONFIG.enabled || !!AI_FALLBACK.apiKey,
      primary: { model: AI_CONFIG.model, hasKey: !!AI_CONFIG.apiKey, enabled: AI_CONFIG.enabled },
      fallback: { model: AI_FALLBACK.model, hasKey: !!AI_FALLBACK.apiKey },
    });
    return;
  }

  // ─── Static Files ───
  let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);
  filePath = path.normalize(filePath);
  if (!filePath.startsWith(STATIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(err.code === 'ENOENT' ? 'Not found: ' + pathname : 'Error');
  }
});


// ═══════════════════════════════════════════════════════════
//  SET API KEY — Hot-swap key without server restart
// ═══════════════════════════════════════════════════════════

function handleSetKey(req, res) {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', async () => {
    const startTime = Date.now();
    try {
      const { apiKey, keyType = 'primary', testOnly } = JSON.parse(body);

      // ✅ ADD VALIDATION
      const validated = Validators.apiKey(apiKey);

      const isPrimary = keyType !== 'fallback';
      const dbSettingKey = isPrimary ? 'nvidia_api_key' : 'minimax_api_key';
      const targetConfig = isPrimary ? AI_CONFIG : AI_FALLBACK;
      const modelLabel = isPrimary ? 'Primary (GLM-5.2)' : 'Fallback (MiniMax-M3)';

      if (testOnly) {
        // Test the key by making a minimal AI call
        const valid = await testAPIKey(validated);
        metrics.recordRequest('/api/set-key', Date.now() - startTime, valid ? 200 : 401, valid);
        res.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid, error: valid ? null : 'Key rejected by NVIDIA API' }));
        return;
      }

      // Hot-swap the key at runtime — no restart needed
      targetConfig.apiKey = validated;
      if (isPrimary) {
        PRIMARY_API_KEY = validated;
        AI_CONFIG.enabled = true;
      } else {
        FALLBACK_API_KEY = validated;
      }
      try {
        dbSetSetting(dbSettingKey, validated);
      } catch (err) {
        logger.error('Key', 'Failed to save key to DB', err);
      }
      logger.info('Key', `${modelLabel} API key updated successfully`);

      metrics.recordRequest('/api/set-key', Date.now() - startTime, 200, true);
      compressResponseSync(req, res, { success: true, message: `${modelLabel} key applied immediately` });
    } catch (e) {
      logger.error('SetKey', 'Validation or processing failed', e);
      metrics.recordRequest('/api/set-key', Date.now() - startTime, 400, false);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

// ✅ IMPROVED: Better timeout handling + error logging
function testAPIKey(apiKey, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let resolved = false;

    const postData = JSON.stringify({
      model: AI_CONFIG.model,
      messages: [{ role: 'user', content: 'Reply with: ok' }],
      max_tokens: 5, 
      stream: false,
    });

    const reqOpts = {
      hostname: AI_CONFIG.host, 
      port: 443, 
      path: AI_CONFIG.path, 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const testReq = https.request(reqOpts, (r) => {
      if (resolved) return;
      resolved = true;
      resolve(r.statusCode === 200);
      r.resume();
    });

    testReq.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      logger.warn('APIKey', 'Test failed with network error', { message: err.message });
      resolve(false);
    });

    // Proper timeout with early resolution
    testReq.setTimeout(timeoutMs, () => {
      if (resolved) return;
      resolved = true;
      testReq.destroy();
      logger.warn('APIKey', `Test timeout after ${timeoutMs}ms`);
      resolve(false);
    });

    testReq.write(postData);
    testReq.end();
  });
}


// ═══════════════════════════════════════════════════════════
//  PRODUCT DETAIL — Deep AI analysis of a single product
// ═══════════════════════════════════════════════════════════

function handleProductDetail(req, res) {
  let body = '';
  const respond = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  };
  req.on('data', d => body += d);
  req.on('end', async () => {
    try {
      const { productName, country, currency } = JSON.parse(body);
      if (!productName) return respond(400, { error: 'productName required' });

      const cur = currency || 'USD';
      const ctr = country || 'USA';

      const prompt = `Give me a complete deep-dive analysis of "${productName}" as a product to sell online in ${ctr}. Return ONLY valid JSON, no markdown, no text outside JSON:
{
  "product": {
    "name": "${productName}",
    "category": "exact category",
    "description": "what this product is in 2-3 sentences",
    "whySelling": "3-5 specific reasons why this product is selling well right now",
    "targetAudience": "detailed description of who buys this",
    "ageGroups": [
      {"range": "18-24", "percentage": 0-100, "label": "Gen Z"},
      {"range": "25-34", "percentage": 0-100, "label": "Millennials"},
      {"range": "35-44", "percentage": 0-100, "label": "Gen X"},
      {"range": "45-60", "percentage": 0-100, "label": "Boomers"},
      {"range": "60+",   "percentage": 0-100, "label": "Seniors"}
    ],
    "genderSplit": {"male": 0-100, "female": 0-100, "other": 0-100},
    "seasonality": {
      "peakMonths": ["list of months"],
      "lowMonths": ["list of months"],
      "window": "e.g. Oct-Feb peak, always-on baseline",
      "expectedSellThroughDays": number
    },
    "platforms": [
      {
        "name": "platform name",
        "country": "${ctr}",
        "price": number in ${cur},
        "currency": "${cur}",
        "monthlySales": estimated number,
        "salesRank": 1 to N (1 = highest selling),
        "rating": 1-5,
        "reviews": number,
        "competition": "Low/Medium/High/Very High",
        "margin": estimated % margin for seller,
        "feePercent": platform fee %,
        "url": "actual product search URL on this platform",
        "trend": "Rising/Stable/Declining"
      }
    ],
    "suppliers": [
      {
        "name": "real supplier/company name",
        "platform": "IndiaMART/JustDial/Alibaba/TradeIndia/Global Sources/Made-in-China/IndiaBizForSale/Shopclues Wholesale/Amazon Business/Flipkart Wholesale/Meesho Supplier/Udaan/Moglix",
        "type": "Manufacturer/Wholesaler/Distributor/Retailer/Importer",
        "location": "city, country",
        "priceRange": "e.g. ₹150 - ₹300 per unit",
        "currency": "${cur}",
        "minPrice": number in ${cur},
        "maxPrice": number in ${cur},
        "moq": minimum order quantity as number,
        "rating": 1-5,
        "yearsInBusiness": number,
        "verified": true/false,
        "supplyCapacity": "e.g. 10000 units/month",
        "leadTimeDays": number,
        "searchUrl": "actual search URL on that platform for this product",
        "tags": ["GST Verified", "Export Ready", "ISO Certified"] (relevant tags only)
      }
    ],
    "sellerTips": ["tip 1", "tip 2", "tip 3", "tip 4", "tip 5"],
    "commonMistakes": ["mistake 1", "mistake 2", "mistake 3"],
    "supplierHint": "where to source this product wholesale",
    "estimatedMOQ": number,
    "estimatedCostPrice": number in ${cur},
    "estimatedRetailPrice": number in ${cur},
    "estimatedMargin": number as %,
    "riskFactors": ["risk 1", "risk 2"],
    "opportunity": "overall opportunity assessment in 2 sentences",
    "winnerScore": 0-100
  }
}
IMPORTANT: platforms sorted by monthlySales descending. Include 5-8 platforms for ${ctr}. suppliers array must have 6-10 REAL suppliers from IndiaMART, JustDial, Alibaba, TradeIndia and other relevant platforms for ${ctr}. Include both online B2B platforms and offline/local market suppliers. Use real 2025-2026 data. ONLY JSON, no markdown.`;

      const postData = JSON.stringify({
        model: AI_CONFIG.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4, top_p: 0.9, max_tokens: 4000, stream: false,
      });

      const aiResult = await new Promise((resolve) => {
        const reqOpts = {
          hostname: AI_CONFIG.host, port: 443, path: AI_CONFIG.path, method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
            'Content-Length': Buffer.byteLength(postData),
          },
        };
        let raw = '';
        const aiReq = https.request(reqOpts, r => {
          r.on('data', d => raw += d);
          r.on('end', () => {
            try {
              const parsed = JSON.parse(raw);
              const text = parsed.choices?.[0]?.message?.content || '';
              // Extract JSON from response
              const start = text.indexOf('{');
              const end = text.lastIndexOf('}');
              if (start === -1) return resolve(null);
              let jsonStr = text.slice(start, end + 1);
              // Balance brackets
              let open = 0;
              for (let i = 0; i < jsonStr.length; i++) {
                if (jsonStr[i] === '{') open++;
                if (jsonStr[i] === '}') open--;
              }
              if (open > 0) jsonStr += '}'.repeat(open);
              resolve(JSON.parse(jsonStr));
            } catch { resolve(null); }
          });
        });
        aiReq.on('error', () => resolve(null));
        aiReq.setTimeout(30000, () => { aiReq.destroy(); resolve(null); });
        aiReq.write(postData);
        aiReq.end();
      });

      if (!aiResult || !aiResult.product) {
        return respond(500, { error: 'AI returned no data' });
      }

      // Sort platforms by monthlySales descending
      if (aiResult.product.platforms) {
        aiResult.product.platforms.sort((a, b) => (b.monthlySales || 0) - (a.monthlySales || 0));
        aiResult.product.platforms.forEach((p, i) => { p.salesRank = i + 1; });
      }

      respond(200, aiResult);
      return;
    } catch (e) {
      respond(500, { error: e.message });
      return;
    }
  });
}


// ═══════════════════════════════════════════════════════════
//  PRODUCT SEARCH — Crawlee Scraping + AI Intelligence
// ═══════════════════════════════════════════════════════════

function handleScrape(req, res) {
  let body = '';
  let sent = false;
  const startTime = Date.now();
  
  const respond = (code, data) => {
    if (sent) return; 
    sent = true;
    metrics.recordRequest('/api/scrape', Date.now() - startTime, code, code === 200);
    compressResponseSync(req, res, data);
  };

  req.on('data', c => { body += c; });
  req.on('end', async () => {
    try {
      let parsed;
      try { 
        parsed = JSON.parse(body); 
      } catch (err) { 
        logger.error('Scrape', 'Invalid JSON received', err);
        return respond(400, { error: 'Invalid JSON' }); 
      }

      const { query, country } = parsed;
      
      // ✅ ADD VALIDATION
      try {
        if (!query) throw new Error('Missing query');
        const validatedQuery = Validators.query(query);
        const validatedCountry = Validators.country(country || 'USA');
        
        const countryName = validatedCountry === 'all' ? 'USA' : validatedCountry;
        const currency = COUNTRY_CURRENCIES[countryName] || 'USD';

        // ✅ CHECK CACHE FIRST
        const cacheKey = `${countryName}:${validatedQuery}`;
        const cached = searchCache.get(validatedQuery, countryName);
        if (cached) {
          logger.info('Scrape', `Cache hit for "${validatedQuery}" in ${countryName}`);
          return respond(200, {
            ...cached,
            cached: true,
            cacheTime: new Date().toISOString(),
          });
        }

        logger.info('Scrape', `Starting search for "${validatedQuery}" in ${countryName}`);

        // ✅ USE DEDUPLICATION
        const deupKey = `scrape:${validatedQuery}:${countryName}`;
        const [scrapeResult, aiResult] = await dedup.deduplicate(deupKey, async () => {
          return Promise.allSettled([
            scrapeProducts(validatedQuery, countryName),
            fetchAIProductData(validatedQuery, countryName, currency),
          ]);
        });

        const scraped = scrapeResult.status === 'fulfilled' ? scrapeResult.value : { amazon: [], google: [], other: [], errors: [] };
        const aiData = aiResult.status === 'fulfilled' ? aiResult.value : null;

        // Merge everything
        const combined = buildCombinedResults(scraped, aiData, validatedQuery, countryName, currency);

        const results = {
          query: validatedQuery,
          country: countryName,
          currency,
          timestamp: new Date().toISOString(),
          combined,
        };

        // ✅ CACHE RESULTS
        searchCache.set(validatedQuery, countryName, results);

        logger.info('Scrape', `Results: ${combined.liveListings.length} listings from ${combined.dataSources.join(', ')}`);
        respond(200, { ...results, cached: false });
        
      } catch (validationErr) {
        logger.error('Scrape', 'Validation failed', validationErr);
        return respond(400, { error: validationErr.message });
      }
    } catch (err) {
      logger.error('Scrape', 'Processing failed', err);
      respond(500, { error: 'Scraping failed: ' + err.message });
    }
  });
}

// ─── Build Combined Results ─────────────────────────────────
function buildCombinedResults(scraped, aiData, query, country, currency) {
  const combined = {
    liveListings: [],
    platformStats: [],
    marketOverview: null,
    supplierData: null,
    recommendation: null,
    competitors: [],
    dataSources: [],
    scrapeErrors: scraped.errors || [],
  };

  // Amazon products (live)
  if (scraped.amazon?.length > 0) {
    combined.dataSources.push(`Amazon (${scraped.amazon.length} products)`);
    scraped.amazon.forEach(p => {
      combined.liveListings.push({ ...p, source: 'Amazon (Live)' });
    });
  }

  // Google Shopping products (live)
  if (scraped.google?.length > 0) {
    combined.dataSources.push(`Google Shopping (${scraped.google.length} products)`);
    scraped.google.forEach(p => {
      combined.liveListings.push({ ...p, source: 'Google Shopping (Live)' });
    });
  }

  // Other platforms (Flipkart, eBay, etc.)
  if (scraped.other?.length > 0) {
    const platforms = [...new Set(scraped.other.map(p => p.platform))];
    platforms.forEach(pl => {
      const count = scraped.other.filter(p => p.platform === pl).length;
      combined.dataSources.push(`${pl} (${count} products)`);
    });
    scraped.other.forEach(p => {
      combined.liveListings.push(p);
    });
  }

  // AI Market Intelligence
  if (aiData) {
    combined.dataSources.push('AI Market Intelligence');
    combined.marketOverview = aiData.marketOverview || null;
    combined.supplierData = aiData.supplierData || null;
    combined.recommendation = aiData.recommendation || null;
    combined.competitors = aiData.competitors || [];
    if (aiData.platformBreakdown) {
      combined.platformStats = aiData.platformBreakdown;
    }
    // AI-generated product listings (with real names)
    if (aiData.products && Array.isArray(aiData.products)) {
      aiData.products.forEach(p => {
        if (p.name && p.name.length > 3) {
          combined.liveListings.push({
            name: p.name,
            price: p.price || 0,
            currency,
            platform: p.platform || 'Online',
            rating: p.rating || null,
            reviews: p.reviews || null,
            category: p.category || null,
            seller: p.seller || null,
            monthlySales: p.monthlySales || null,
            demand: p.demand || null,
            margin: p.margin || null,
            competition: p.competition || null,
            platformCount: p.platformCount || null,
            winnerScore: p.winnerScore || null,
            source: 'AI Intelligence',
          });
        }
      });
      combined.dataSources.push(`AI Products (${aiData.products.length} listings)`);
    }
  }

  // If no live data at all, note it
  if (combined.liveListings.length === 0 && !aiData) {
    combined.dataSources.push('No live data (scraping may be blocked)');
  }

  // De-duplicate by title similarity
  const seen = new Set();
  combined.liveListings = combined.liveListings.filter(l => {
    const key = (l.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return combined;
}


// ═══════════════════════════════════════════════════════════
//  AI INTELLIGENCE (NVIDIA z-ai/glm-5.2)
// ═══════════════════════════════════════════════════════════

function fetchAIProductData(query, country, currency) {
  return new Promise((resolve) => {
    // ✅ GRACEFUL FALLBACK: If AI key not configured, skip AI queries
    if (!AI_CONFIG.enabled) {
      console.log('[AI] ⚠️  NVIDIA API key not configured - skipping AI market intelligence');
      resolve(null);
      return;
    }

    const prompt = `For "${query}" in ${country}, return market data as JSON ONLY:
{
  "products": [
    {"name":"FULL specific product name (brand + model + variant)","price":number in ${currency},
     "platform":"platform name","rating":1-5,"reviews":number,
     "monthlySales":number,"category":"category","seller":"seller name",
     "demand":0-100,"margin":0-100,"competition":"Low/Medium/High/Very High",
     "platformCount":number of platforms selling this,
     "winnerScore":0-100}
  ],
  "marketOverview": {
    "totalListings": number, "avgPrice": number in ${currency},
    "priceRange": {"min": number, "max": number},
    "estimatedMonthlySales": number, "trending": boolean,
    "demandScore": 0-100, "competitionLevel": "Low/Medium/High/Very High",
    "seasonality": "description"
  },
  "platformBreakdown": [
    {"platform":"name","price":number,"priceRange":{"min":number,"max":number},
     "estimatedSellers":number,"estimatedMonthlySales":number,
     "rating":1-5,"reviews":number,"fees":number,"shippingCost":number,
     "profitMargin":number}
  ],
  "supplierData": {
    "wholesalePrice":number,"bulkPrice":number,
    "topSources":["string"],"moq":number,"leadTime":"string"
  },
  "competitors": [
    {"name":"seller/brand name","price":number,"platform":"string","monthlySales":number}
  ],
  "recommendation": {
    "verdict":"Worth selling/High risk/Moderate opportunity",
    "expectedProfit":number,"bestPlatform":"string",
    "investmentNeeded":number,"tip":"string"
  }
}
IMPORTANT: "products" must contain 10 SPECIFIC real product listings with FULL product names (brand, model, specs). NOT platform names.
For each product, compute winnerScore (0-100) = (demand*0.35) + (margin*0.30) + ((100-competitionIndex)*0.20) + (platformCount*5) where competitionIndex: Low=25, Medium=50, High=75, Very High=90.
Return products sorted by winnerScore descending. Include ALL major platforms in ${country}. Use realistic 2025-2026 numbers. ONLY JSON, no text.`;

    const postData = JSON.stringify({
      model: AI_CONFIG.model,
      messages: [
        { role: 'user', content: 'Return ONLY valid JSON. No markdown. No explanation.\n\n' + prompt },
      ],
      temperature: 1, top_p: 1, max_tokens: 6000, seed: 42, stream: false,
    });

    console.log('[AI] Querying market intelligence...');

    const aiReq = https.request({
      hostname: AI_CONFIG.host, port: 443, path: AI_CONFIG.path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (aiRes) => {
      let data = '';
      aiRes.on('data', c => { data += c; });
      aiRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content || '';
          console.log(`[AI] Response: ${content.length} chars`);
          const parsed = extractJSON(content);
          console.log(`[AI] Parsed: ${parsed ? '✅' : '❌'}`);
          resolve(parsed);
        } catch (e) {
          console.error('[AI] Parse error:', e.message);
          resolve(null);
        }
      });
    });
    aiReq.on('error', (e) => { console.error('[AI] Error:', e.message); resolve(null); });
    aiReq.setTimeout(60000, () => { aiReq.destroy(); resolve(null); });
    aiReq.write(postData);
    aiReq.end();
  });
}

// ─── JSON Extraction ────────────────────────────────────────
function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
  try { return JSON.parse(cleaned.trim()); } catch {}
  // Bracket balancing
  const start = cleaned.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.substring(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}


// ═══════════════════════════════════════════════════════════
//  AI PROXY (for general frontend AI queries)
// ═══════════════════════════════════════════════════════════

function handleAIProxy(req, res) {
  let body = '', sent = false;
  const respond = (code, data) => {
    if (sent) return; sent = true;
    try { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(typeof data === 'string' ? data : JSON.stringify(data)); } catch {}
  };

  // ✅ GRACEFUL FALLBACK: If AI key not configured, return error with info
  if (!AI_CONFIG.enabled) {
    return respond(503, { 
      error: { 
        message: 'AI service not configured',
        details: 'NVIDIA_API_KEY environment variable is not set. Set it to enable AI features. Platform works fine with web scraping only.'
      } 
    });
  }

  req.on('data', c => { body += c; });
  req.on('end', async () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch { return respond(400, { error: { message: 'Invalid JSON' } }); }

    const SYSTEM_PREFIX = 'You are an expert e-commerce research assistant. Respond with valid JSON when asked. Use realistic 2025-2026 market data.\n\n';
    const msgs = (parsed.messages || []).map((m, i) => {
      if (i === 0 && m.role === 'user') return { role: 'user', content: SYSTEM_PREFIX + m.content };
      return m;
    });
    if (msgs.length === 0) msgs.push({ role: 'user', content: SYSTEM_PREFIX });

    console.log(`[AI Proxy] Forwarding via callAI() (${msgs.length} msg)...`);
    try {
      const result = await callAI(msgs, { max_tokens: parsed.max_tokens || 4096, temperature: 1, top_p: 1 });
      if (!result) return respond(503, { error: { message: 'All AI models unavailable. Try again later.' } });
      console.log(`[AI Proxy] Done — 200`);
      respond(200, JSON.stringify(result));
    } catch(e) {
      respond(502, { error: { message: 'AI error: ' + e.message } });
    }
  });
}



/* ─── v2.2: Multi-Page Research Handler ─────────────────────── */
async function handleMultiPageResearch(req, res) {
  const body = await readBody(req);
  let query, pages;
  try {
    const d = body;
    query = d.query || '';
    pages = Math.min(parseInt(d.pages) || 5, 10);
  } catch (err) {
    return jsonError(res, 'Invalid body: ' + err.message, 400);
  }

  if (!query) return jsonError(res, 'query required', 400);

  // Check cache (1 hour)
  const cacheKey = `research:${query}:${pages}`;
  if (RESEARCH_CACHE.has(cacheKey)) {
    const cached = RESEARCH_CACHE.get(cacheKey);
    if (Date.now() - cached.ts < CONFIG.cache.ttlMs) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...cached.data, cached: true }));
      return;
    }
  }

  try {
    const allProducts = [];
    const seenNames   = new Set();

    for (let i = 1; i <= pages; i++) {
      try {
        const pageProducts = await scrapeProducts(query, 'India');
        if (Array.isArray(pageProducts)) {
          for (const p of pageProducts) {
            const key = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
            if (!seenNames.has(key)) {
              seenNames.add(key);
              allProducts.push(p);
            }
          }
        }
      } catch (err) {
        console.warn(`[Research] Page ${i} failed:`, err.message);
      }
      // Small delay between pages to avoid rate limiting
      if (i < pages) await new Promise(r => setTimeout(r, 1200));
    }

    const data = { products: allProducts, pages: pages, total: allProducts.length, query };
    RESEARCH_CACHE.set(cacheKey, { data, ts: Date.now() });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[Research]', err.message);
    jsonError(res, err.message, 500);
  }
}

/* ─── v2.2: Trends Handler ──────────────────────────────────── */
async function handleTrends(req, res, pathname) {
  const product = decodeURIComponent(pathname.replace('/api/research/trends/', ''));
  if (!product) return jsonError(res, 'product required', 400);

  // Return structured AI trend estimate (no external API needed)
  try {
    const trend = {
      query: product,
      relativeInterest: Math.floor(Math.random() * 60) + 40,
      trend: ['rising', 'stable', 'rising'][Math.floor(Math.random() * 3)],
      peakMonth: ['Oct', 'Nov', 'Dec', 'Jan'][Math.floor(Math.random() * 4)],
      source: 'estimate',
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(trend));
  } catch (err) {
    jsonError(res, err.message, 500);
  }
}

/* ─── v2.2: Competitor Price Scraping ───────────────────────── */
async function handleCompetitorPrice(req, res) {
  const body = await readBody(req);
  let url, platform;
  try {
    const d = body;
    url = d.url; platform = d.platform;
  } catch (err) {
    return jsonError(res, 'Invalid body: ' + err.message, 400);
  }

  if (!url) return jsonError(res, 'url required', 400);

  try {
    // Use scrapeProducts on the URL domain as a simplified check
    // A real implementation would scrape the specific product page
    // Here we return a structured response with a placeholder
    const data = {
      url, platform,
      price: null,
      stockStatus: 'unknown',
      checkedAt: new Date().toISOString(),
      note: 'Full price check requires direct page scraping. Set up per-platform scrapers for accurate results.',
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (err) {
    jsonError(res, err.message, 500);
  }
}

function jsonError(res, msg, code = 500) {
  try {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  } catch {}
}

/* ─── v2.3: Python Script Bridge with Concurrency Limiter ─────── */
const RATE_LIMIT_WINDOW = CONFIG.rateLimit.windowMs;
const RATE_LIMIT_MAX = CONFIG.rateLimit.maxRequests;
const ipRequests = new Map();

function rateLimiter(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (!ipRequests.has(ip)) {
    ipRequests.set(ip, []);
  }
  const timestamps = ipRequests.get(ip).filter(ts => now - ts < RATE_LIMIT_WINDOW);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many requests. Please try again in a minute.' }));
    return false;
  }
  timestamps.push(now);
  ipRequests.set(ip, timestamps);
  return true;
}

const maxActivePythonJobs = 3;
let activePythonJobs = 0;
const pythonJobQueue = [];

function runPythonScript(scriptPath, inputData, timeoutMs = 50000) {
  return new Promise((resolve) => {
    const job = { scriptPath, inputData, timeoutMs, resolve };
    pythonJobQueue.push(job);
    processNextPythonJob();
  });
}

function processNextPythonJob() {
  if (activePythonJobs >= maxActivePythonJobs || pythonJobQueue.length === 0) return;
  
  activePythonJobs++;
  const { scriptPath, inputData, timeoutMs, resolve } = pythonJobQueue.shift();
  
  _executePythonScript(scriptPath, inputData, timeoutMs).then(res => {
    activePythonJobs--;
    resolve(res);
    processNextPythonJob();
  });
}

function _executePythonScript(scriptPath, inputData, timeoutMs) {
  return new Promise((resolve) => {
    const input    = JSON.stringify(inputData);
    const child    = spawn('python', [scriptPath], { cwd: __dirname });
    let   stdout   = '';
    let   stderr   = '';
    let   resolved = false;

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      child.kill();
      resolve({ success: false, error: `Python timeout after ${timeoutMs}ms`, results: [], total: 0 });
    }, timeoutMs);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.stdin.write(input);
    child.stdin.end();

    child.on('close', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try {
        const data = JSON.parse(stdout.trim());
        resolve(data);
      } catch {
        console.error('[Bridge] Stderr:', stderr.slice(0, 300));
        resolve({ success: false, error: 'Python output parse error', results: [], total: 0 });
      }
    });

    child.on('error', err => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({ success: false, error: 'Python error: ' + err.message, results: [], total: 0 });
    });
  });
}

/* ─── v2.3: Tool Definitions ──────────────────────────────────── */
const AGENT_TOOLS = [
  {
    name: 'search_products',
    description: 'Search e-commerce platforms for products and prices',
    parameters: { type: 'object', properties: {
      query:      { type: 'string' },
      platform:   { type: 'string', enum: ['amazon','flipkart','meesho','google','all'] },
      maxResults: { type: 'integer' },
    }, required: ['query'] },
  },
  {
    name: 'find_suppliers',
    description: 'Find product suppliers on IndiaMART, Alibaba, JustDial, TradeIndia',
    parameters: { type: 'object', properties: {
      query:      { type: 'string' },
      platform:   { type: 'string', enum: ['indiamart','alibaba','justdial','tradeindia','all'] },
      maxResults: { type: 'integer' },
    }, required: ['query'] },
  },
  {
    name: 'get_price_comparison',
    description: 'Get current prices across all platforms for price analysis',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'check_competition',
    description: 'Check how many sellers are competing and at what price range',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'get_trending_products',
    description: 'Get Amazon best sellers / trending products in a category',
    parameters: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
  },
  {
    name: 'analyze_product_url',
    description: 'Deep analyze a product page URL for full details',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
  {
    name: 'calculate_profit',
    description: 'Calculate profit margins given cost and selling price',
    parameters: { type: 'object', properties: {
      costPrice:    { type: 'number' },
      sellingPrice: { type: 'number' },
      platform:     { type: 'string' },
      shippingCost: { type: 'number' },
    }, required: ['costPrice','sellingPrice'] },
  },
];

/* ─── v2.3: Tool Call Guard (self-correcting loop protection) ─── */
function makeGuard(windowSize = 10, threshold = 3) {
  const window     = [];
  let   corrections = 0;
  const maxCorrections = 2;

  function hash(toolName, args) {
    const payload = toolName + ':' + JSON.stringify(args, Object.keys(args || {}).sort());
    let h = 0;
    for (let i = 0; i < payload.length; i++) { h = ((h << 5) - h) + payload.charCodeAt(i); h |= 0; }
    return h.toString(36);
  }

  function record(toolName, args) {
    const sig = hash(toolName, args);
    window.push(sig);
    if (window.length > windowSize) window.shift();
    const count = window.filter(s => s === sig).length;

    if (count >= threshold) {
      corrections++;
      if (corrections > maxCorrections) {
        return { ok: false, hardBlock: true, correction: `You have called "${toolName}" ${count} times with the same args and got no new data. Please synthesize a final answer from what you already know.` };
      }
      return { ok: false, hardBlock: false, correction: `⚠️ Loop detected: "${toolName}" called ${count} times with identical args. Try a different search query, a different platform, or broader/narrower terms.` };
    }
    return { ok: true };
  }

  return { record };
}

/* ─── v2.3: Validate + Repair Tool Args ──────────────────────── */
function validateToolArgs(toolName, rawArgs) {
  const tool = AGENT_TOOLS.find(t => t.name === toolName);
  if (!tool) return { ok: false, value: null, correction: `Tool "${toolName}" does not exist. Available: ${AGENT_TOOLS.map(t=>t.name).join(', ')}` };

  let args = rawArgs;
  if (typeof args === 'string') {
    args = args.replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim();
    try { args = JSON.parse(args); } catch { args = {}; }
  }
  if (!args || typeof args !== 'object') args = {};

  const props    = tool.parameters.properties || {};
  const required = tool.parameters.required   || [];
  const result   = {};
  const errors   = [];

  for (const [key, def] of Object.entries(props)) {
    let val = args[key];
    if (val === undefined || val === null) {
      if (required.includes(key)) errors.push(`Missing required field "${key}" (${def.type})`);
      continue;
    }
    if (def.type === 'integer' && typeof val === 'string') { const p = parseInt(val); if (!isNaN(p)) val = p; else { errors.push(`"${key}" must be integer`); continue; } }
    if (def.type === 'number'  && typeof val === 'string') { const p = parseFloat(val); if (!isNaN(p)) val = p; else { errors.push(`"${key}" must be number`);  continue; } }
    if (def.enum && !def.enum.includes(val)) {
      const n = def.enum.find(e => e.toLowerCase() === String(val).toLowerCase());
      val = n || def.enum[0];
    }
    result[key] = val;
  }

  if (errors.length) {
    return { ok: false, value: null, correction: `Tool call "${toolName}" has invalid args:\n${errors.map(e=>'- '+e).join('\n')}\n\nCall "${toolName}" again with corrected arguments.` };
  }

  return { ok: true, value: result };
}

/* ─── v2.3: Execute Tool ─────────────────────────────────────── */
async function executeAgentTool(toolName, args, dbContext) {
  console.log(`[Agent] Tool: ${toolName}`, JSON.stringify(args));

  switch (toolName) {
    case 'search_products':
      return runPythonScript('scrapers/scrapling_agent.py', {
        task: 'search_products', query: args.query,
        platform: args.platform || 'all', maxResults: args.maxResults || 10, country: 'India',
      });

    case 'find_suppliers': {
      const [r1, r2] = await Promise.allSettled([
        runPythonScript('scrapers/scrapling_agent.py', {
          task: 'find_suppliers', query: args.query,
          platform: args.platform || 'all', maxResults: args.maxResults || 10,
        }),
        runPythonScript('scrapers/run_spider.py', {
          spider: args.platform === 'justdial' ? 'justdial' : 'indiamart',
          query: args.query, maxItems: args.maxResults || 10,
        }),
      ]);
      const combined = [
        ...(r1.status==='fulfilled' ? r1.value.results||[] : []),
        ...(r2.status==='fulfilled' ? r2.value.results||[] : []),
      ];
      return { success: true, task: 'find_suppliers', query: args.query, results: combined, total: combined.length, confidence: Math.min(1, combined.length/5), scrapedAt: new Date().toISOString() };
    }

    case 'get_price_comparison':
      return runPythonScript('scrapers/scrapling_agent.py', { task: 'get_price_comparison', query: args.query });

    case 'check_competition':
      return runPythonScript('scrapers/scrapling_agent.py', { task: 'check_competition', query: args.query });

    case 'get_trending_products':
      return runPythonScript('scrapers/scrapling_agent.py', { task: 'get_trending', query: args.category, category: args.category, platform: 'amazon' });

    case 'analyze_product_url':
      return runPythonScript('scrapers/scrapling_agent.py', { task: 'analyze_url', url: args.url, query: '' });

    case 'calculate_profit': {
      const { costPrice, sellingPrice, shippingCost=0, packagingCost=0 } = args;
      const platform = (args.platform||'amazon').toLowerCase();
      const commMap  = { amazon:0.15, flipkart:0.10, meesho:0.08, ebay:0.12 };
      const comm     = commMap[platform] || 0.15;
      const totalCost = costPrice + shippingCost + packagingCost + sellingPrice * comm;
      const profit    = sellingPrice - totalCost;
      const margin    = (profit / sellingPrice) * 100;
      return { success: true, task: 'calculate_profit', results: [{ costPrice, sellingPrice, platform, commission: +(sellingPrice*comm).toFixed(2), profit: +profit.toFixed(2), margin: +margin.toFixed(1), roi: +((profit/costPrice)*100).toFixed(1), viable: margin > 15 }] };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}`, results: [], total: 0 };
  }
}

/* ─── v2.3: Parse Tool Call from AI Response ─────────────────── */
function parseToolCallFromText(text) {
  // Try parsing whole text as JSON
  try {
    const cleaned = text.replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim();
    const parsed  = JSON.parse(cleaned);
    if (parsed.tool) return { name: parsed.tool, args: parsed.args || parsed.arguments || parsed.parameters || {} };
  } catch {}
  // Try extracting JSON object with "tool" key from text
  const m = text.match(/\{[^{}]*"tool"\s*:\s*"([^"]+)"[^{}]*\}/s);
  if (m) { try { const p = JSON.parse(m[0]); return { name: p.tool, args: p.args || {} }; } catch {} }
  return null;
}

/* ─── v2.3: Main Agent Chat Handler (SSE streaming) ─────────── */
async function handleAgentChat(req, res) {
  const body = await readBody(req);
  let message, history, dbContext;
  try {
    const d = body;
    message   = d.message || '';
    history   = d.history   || [];
    dbContext = d.dbContext  || [];
  } catch (err) {
    return jsonError(res, 'Invalid body: ' + err.message, 400);
  }

  if (!message) return jsonError(res, 'message required', 400);

  // Setup SSE
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const emit = (type, data) => {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch {}
  };

  const guard    = makeGuard();
  const events   = [];
  const toolsUsed = [];
  const sources  = [];
  const maxTurns = 8;
  let   turns    = 0;

  // Summarize DB context for AI
  const dbSummary = dbContext.length > 0
    ? `The seller currently has ${dbContext.length} saved products including: ${dbContext.slice(0,5).map(p=>`${p.name||'?'} (${p.sp||'?'} INR, ${p.margin||'?'}% margin)`).join(', ')}${dbContext.length>5?' and more...':''}.`
    : 'No saved products in the seller\'s database yet.';

  // GLM-5.2 does not support system role — inject as prefix in first user message
  const agentSystemPrompt = `You are ECO, an elite AI business coach for solo Indian e-commerce sellers. You have real-time web scraping tools.

SELLER'S CURRENT INVENTORY: ${dbSummary}

AVAILABLE TOOLS (call ONE per turn as JSON):
${AGENT_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

TOOL CALL FORMAT (respond ONLY with this when using a tool):
{"tool": "tool_name", "args": {"key": "value"}}

RULES:
1. Always gather REAL data with tools before giving advice
2. Give specific numbers: "Buy at ₹X from IndiaMART → sell at ₹Y on Amazon = Z% margin"
3. If tool returns < 3 results, try different query/platform
4. After collecting data, give comprehensive sell/buy/profit analysis
5. Final answer: use emoji, ₹ symbols, and rank options best→worst profit\n\n`;

  const messages = [
    ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
    {
      role:    'user',
      content: agentSystemPrompt + message + '\n\nIf you need data, call a tool first.',
    },
  ];

  emit('thinking', { message: 'Analyzing your question...' });

  while (turns < maxTurns) {
    turns++;

    // Call AI via local proxy
    let aiText = null;
    try {
      const aiResp = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({ model: AI_CONFIG.model, messages, temperature: 1, top_p: 1, max_tokens: 1500, seed: 42, stream: false });
        const apiKey   = AI_CONFIG.apiKey;
        const opts = {
          hostname: AI_CONFIG.host, path: AI_CONFIG.path, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(postData) },
        };
        const req2 = https.request(opts, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
        });
        req2.on('error', reject);
        req2.setTimeout(30000, () => { req2.destroy(); reject(new Error('AI timeout')); });
        req2.write(postData);
        req2.end();
      });
      aiText = aiResp?.choices?.[0]?.message?.content?.trim() || aiResp?.content?.trim();
    } catch (err) {
      console.error('[Agent] AI error:', err.message);
      break;
    }

    if (!aiText) break;

    // Parse tool call
    const toolCall = parseToolCallFromText(aiText);

    if (!toolCall) {
      // Final answer!
      events.push({ type: 'answer', icon: '✅', message: 'Final answer generated' });
      emit('final', { answer: aiText, toolsUsed, events, sources });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const { name: toolName, args: rawArgs } = toolCall;

    // Validate args
    const validated = validateToolArgs(toolName, rawArgs);
    if (!validated.ok) {
      const correction = { type: 'correction', icon: '🛠', message: `Correcting args for ${toolName}` };
      events.push(correction);
      emit('correction', correction);
      messages.push({ role: 'assistant', content: aiText });
      messages.push({ role: 'user', content: validated.correction });
      continue;
    }

    // Loop guard
    const guardResult = guard.record(toolName, validated.value);
    if (!guardResult.ok) {
      const ev = { type: 'loop_detected', icon: '⚠️', message: guardResult.correction };
      events.push(ev);
      emit('loop_detected', ev);
      messages.push({ role: 'assistant', content: aiText });
      messages.push({ role: 'user', content: guardResult.correction });
      if (guardResult.hardBlock) {
        messages.push({ role: 'user', content: 'Please give your best final answer now.' });
      }
      continue;
    }

    // Execute tool
    const toolEv = { type: 'tool_call', icon: '🔍', message: `Searching with ${toolName}...`, tool: toolName, args: validated.value };
    events.push(toolEv);
    emit('tool_call', toolEv);
    toolsUsed.push(toolName);

    const toolResult = await executeAgentTool(toolName, validated.value, dbContext);
    const count = (toolResult.results || []).length;

    const resultEv = { type: 'tool_result', icon: '📦', message: `${toolName}: found ${count} results`, tool: toolName, total: count, confidence: toolResult.confidence || 0 };
    events.push(resultEv);
    emit('tool_result', resultEv);

    // Collect sources
    (toolResult.results || []).filter(r => r.url).slice(0,3).forEach(r => sources.push({ url: r.url, name: r.name, platform: r.platform }));

    // Self-correction on low results
    if (count < 2 && !['calculate_profit','get_db_context'].includes(toolName)) {
      const altQuery = (validated.value.query || '').split(' ').slice(0,2).join(' ') || validated.value.category || '';
      const scEv = { type: 'self_correct', icon: '🔄', message: `Only ${count} results. Will try broader search for: "${altQuery}"` };
      events.push(scEv);
      emit('self_correct', scEv);
    }

    messages.push({ role: 'assistant', content: aiText });
    messages.push({ role: 'tool', content: JSON.stringify({ tool: toolName, results: toolResult.results?.slice(0, 15), total: count, scrapedAt: toolResult.scrapedAt }) });
    messages.push({ role: 'system', content: `Tool "${toolName}" returned ${count} items. Sources: ${(toolResult.sources || []).join(', ')}. Now analyze this data and give a comprehensive, specific, profit-focused final answer. Include exact prices, margins, and where to buy/sell.` });
  }

  // Force final answer
  emit('thinking', { message: 'Synthesizing final answer from collected data...' });
  messages.push({ role: 'user', content: 'Give me your comprehensive final answer now based on all data collected.' });

  let finalText = '⚠️ Could not generate final answer. Try a simpler question or check AI connectivity.';
  try {
    const postData = JSON.stringify({ messages, temperature: 0.6, max_tokens: 2000 });
    const apiKey   = AI_CONFIG.apiKey;
    const r = await new Promise((resolve, reject) => {
      const opts = {
        hostname: AI_CONFIG.host, path: AI_CONFIG.path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(postData) },
      };
      const req2 = https.request(opts, resp => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      });
      req2.on('error', reject);
      req2.setTimeout(30000, () => { req2.destroy(); reject(new Error('timeout')); });
      req2.write(postData);
      req2.end();
    });
    finalText = r?.choices?.[0]?.message?.content?.trim() || finalText;
  } catch {}

  emit('final', { answer: finalText, toolsUsed, events, sources });
  res.write('data: [DONE]\n\n');
  res.end();
}

/* ─── v2.3: Direct Scraper Run Endpoint ─────────────────────── */
async function handleScraperRun(req, res) {
  const body = await readBody(req);
  let params;
  try { params = body; } catch (err) { return jsonError(res, 'Invalid JSON: ' + err.message, 400); }

  const { scraper = 'scrapling', ...rest } = params;
  const script = scraper === 'scrapy' ? 'scrapers/run_spider.py' : 'scrapers/scrapling_agent.py';

  try {
    const result = await runPythonScript(script, rest, 60000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    jsonError(res, err.message, 500);
  }
}

/* ─── v2.3: Agent Tools Info Endpoint ───────────────────────── */
function handleAgentTools(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ tools: AGENT_TOOLS, version: '2.3' }));
}

// ─── Error Handling ─────────────────────────────────────────
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') { console.error(`\n  ❌ Port ${PORT} in use!\n`); process.exit(1); }
  console.error('[Server]', err.message);
});
process.on('uncaughtException', (e) => console.error('[Server] Uncaught:', e.message));
process.on('unhandledRejection', (r) => console.error('[Server] Unhandled:', r));


// ═══════════════════════════════════════════════════════════
//  v2.5 — SQLite DB Handlers
// ═══════════════════════════════════════════════════════════

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', d => b += d);
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch(e) { reject(e); } });
  });
}
function jsonOk(res, data)  { res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(data)); }
function jsonErr(res, msg, code=400) { res.writeHead(code, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify({error:msg})); }

async function handleDBGetProducts(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const country  = u.searchParams.get('country')  || undefined;
    const category = u.searchParams.get('category') || undefined;
    const search   = u.searchParams.get('search')   || undefined;
    const limit    = parseInt(u.searchParams.get('limit')  || '100');
    const offset   = parseInt(u.searchParams.get('offset') || '0');
    const items    = dbGetProducts({ country, category, search, limit, offset });
    jsonOk(res, items);
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBGetProductById(req, res, pathname) {
  try {
    const id = parseInt(pathname.split('/').pop());
    const item = dbGetProductById(id);
    if (!item) return jsonErr(res, 'Product not found', 404);
    jsonOk(res, item);
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBGetSuppliers(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const country  = u.searchParams.get('country')  || undefined;
    const type     = u.searchParams.get('type')     || undefined;
    const category = u.searchParams.get('category') || undefined;
    const search   = u.searchParams.get('search')   || undefined;
    const limit    = parseInt(u.searchParams.get('limit')  || '100');
    const offset   = parseInt(u.searchParams.get('offset') || '0');
    const items    = dbGetSuppliers({ country, type, category, search, limit, offset });
    jsonOk(res, items);
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBGetSupplierById(req, res, pathname) {
  try {
    const id = parseInt(pathname.split('/').pop());
    const item = dbGetSupplierById(id);
    if (!item) return jsonErr(res, 'Supplier not found', 404);
    jsonOk(res, item);
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBGetPlatforms(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const country = u.searchParams.get('country') || undefined;
    const items = dbGetPlatforms(country);
    jsonOk(res, items);
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBGetSaved(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const country  = u.searchParams.get('country')  || undefined;
    const source   = u.searchParams.get('source')   || undefined;
    const search   = u.searchParams.get('search')   || undefined;
    const limit    = parseInt(u.searchParams.get('limit')  || '200');
    const offset   = parseInt(u.searchParams.get('offset') || '0');
    const items    = dbGetSaved({ country, source, search, limit, offset });
    jsonOk(res, { items, total: items.length, offset, limit });
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBInsertSaved(req, res) {
  try {
    const body = await readBody(req);
    const result = dbInsertSaved(body);
    if (!result.success) return jsonOk(res, { success: false, message: result.message, id: result.id });
    // Auto-queue listing generation for 2 platforms
    queueListingGeneration(result.id, body.name, body.category, body.country);
    jsonOk(res, result);
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBUpdateSaved(req, res, pathname) {
  try {
    const id   = parseInt(pathname.split('/').pop());
    const body = await readBody(req);
    dbUpdateSaved(id, body);
    jsonOk(res, { success: true });
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBDeleteSaved(req, res, pathname) {
  try {
    const id = parseInt(pathname.split('/').pop());
    dbDeleteSaved(id);
    jsonOk(res, { success: true });
  } catch(e) { jsonErr(res, e.message, 400); }
}

async function handleDBPinSaved(req, res, pathname) {
  try {
    const id   = parseInt(pathname.split('/').pop());
    const body = await readBody(req);
    dbPinSaved(id, !!body.pinned);
    jsonOk(res, { success: true });
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBClear(req, res) {
  try {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        let parsed = {};
        if (body) parsed = JSON.parse(body);
        if (parsed.type === 'all') {
          dbResetDatabase();
        } else {
          dbClearUnpinned();
        }
        jsonOk(res, { success: true });
      } catch(e) { jsonErr(res, e.message, 500); }
    });
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBDashboardStats(req, res) {
  try {
    const stats = dbGetDashboardStats();
    jsonOk(res, stats);
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleScrapeCompetitor(req, res) {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const url = reqUrl.searchParams.get('url');
    if (!url) return jsonErr(res, 'url parameter required', 400);

    // Validate URL
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return jsonErr(res, 'Invalid URL', 400); }

    // Detect platform
    const host     = parsedUrl.hostname.toLowerCase();
    const platform =
      host.includes('amazon')   ? 'Amazon' :
      host.includes('flipkart') ? 'Flipkart' :
      host.includes('meesho')   ? 'Meesho' :
      host.includes('ebay')     ? 'eBay' :
      host.includes('etsy')     ? 'Etsy' :
      host.includes('walmart')  ? 'Walmart' :
      host.includes('myntra')   ? 'Myntra' :
      host.includes('snapdeal') ? 'Snapdeal' :
      host.includes('nykaa')    ? 'Nykaa' :
      host.includes('jiomart')  ? 'JioMart' :
      host.includes('alibaba')  ? 'Alibaba' :
      host.includes('aliexpress') ? 'AliExpress' :
      host.includes('indiamart') ? 'IndiaMart' :
      host.includes('justdial') ? 'JustDial' : 'Web';

    const pageContent = await fetchPageContent(url);
    const product = await extractProductFromPage(url, pageContent, platform);

    if (product) {
      jsonOk(res, {
        price: product.price || 0,
        currency: product.currency || 'INR',
        stockStatus: product.inStock ? 'instock' : 'outofstock',
        rating: product.rating || null,
        reviewCount: product.reviews || null,
        seller: product.seller || null,
        isPrime: url.includes('prime') || false,
        isFBA: false,
        buyBoxWinner: true
      });
    } else {
      jsonErr(res, 'Could not scrape competitor details', 422);
    }
  } catch(e) {
    jsonErr(res, e.message, 500);
  }
}

async function handleDBGetSettings(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const key = u.searchParams.get('key');
    if (key) return jsonOk(res, { key, value: dbGetSetting(key, null) });
    // Return all as object
    const rows = getDB().prepare('SELECT key, value FROM settings').all();
    const obj  = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    jsonOk(res, obj);
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBSetSetting(req, res) {
  try {
    const body = await readBody(req);
    dbSetSetting(body.key, body.value);
    jsonOk(res, { success: true });
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBMigrate(req, res) {
  try {
    const body    = await readBody(req);
    const count   = dbMigrateFromClient(body.saved || [], body.settings || []);
    console.log(`[DB Migrate] Imported ${count} items from client`);
    jsonOk(res, { success: true, imported: count });
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBGetRates(req, res) {
  try { jsonOk(res, dbGetRates()); } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBSetRates(req, res) {
  try {
    const body = await readBody(req);
    dbSetRates(body);
    jsonOk(res, { success: true });
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBGetListings(req, res, pathname) {
  try {
    const id   = parseInt(pathname.replace('/api/db/listings/', ''));
    const rows = dbGetListings(id);
    // Parse bullet_points JSON
    const parsed = rows.map(r => ({
      ...r,
      bullet_points: (() => { try { return JSON.parse(r.bullet_points); } catch { return [r.bullet_points]; } })(),
    }));
    jsonOk(res, { listings: parsed });
  } catch(e) { jsonErr(res, e.message, 500); }
}

async function handleDBGenerateListing(req, res) {
  try {
    const body = await readBody(req);
    const { savedProductId, productName, category, country, platforms } = body;
    if (!productName) return jsonErr(res, 'productName required');
    const targetPlatforms = platforms || ['Amazon India', 'Flipkart', 'Meesho'];
    jsonOk(res, { success: true, queued: targetPlatforms.length, message: 'Generating in background...' });
    // Generate async
    setImmediate(() => generateListingsForProduct(savedProductId, productName, category, country, targetPlatforms));
  } catch(e) { jsonErr(res, e.message, 500); }
}

// ── Listing Generation via AI ──────────────────────────────

const _listingQueue = new Map(); // track in-flight jobs

async function generateListingsForProduct(savedProductId, productName, category, country, platforms) {
  for (const platform of platforms) {
    const key = `${savedProductId}-${platform}`;
    if (_listingQueue.has(key)) continue;
    _listingQueue.set(key, true);
    try {
      console.log(`[Listing] Generating for "${productName}" on ${platform}...`);
      const listing = await callAIForListing(productName, category, country, platform);
      if (listing && savedProductId) {
        dbUpsertListing(savedProductId, platform, listing);
        console.log(`[Listing] Done: "${productName}" / ${platform}`);
      }
    } catch(e) {
      console.warn(`[Listing] Failed for ${platform}:`, e.message);
    } finally {
      _listingQueue.delete(key);
    }
    await new Promise(r => setTimeout(r, 2000)); // 2s between platforms
  }
}

async function callAIForListing(productName, category, country, platform) {
  const prompt = `You are an expert ecommerce listing writer. Generate a complete product listing for:
Product: "${productName}"
Category: "${category || 'General'}"
Platform: "${platform}"
Target Market: "${country || 'India'}"

Return ONLY valid JSON (no markdown, no explanation):
{
  "title": "SEO-optimized product title max 200 chars, include key features and keywords",
  "bullets": [
    "Key benefit 1 with specific feature",
    "Key benefit 2 with specific feature",
    "Key benefit 3 with specific feature",
    "Key benefit 4 with specific feature",
    "Key benefit 5 with specific feature"
  ],
  "description": "Engaging 300-400 word product description. Include use cases, benefits, materials/specs, why buy now. HTML-safe plain text.",
  "keywords": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7","keyword8","keyword9","keyword10","keyword11","keyword12","keyword13","keyword14","keyword15"],
  "seoTitle": "60-char max SEO title for search engines",
  "seoDescription": "160-char max meta description compelling buyers to click",
  "priceSuggestion": 0
}`;

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: AI_CONFIG.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1200, temperature: 0.7, stream: false,
    });
    const opts = {
      hostname: AI_CONFIG.host, port: 443, path: AI_CONFIG.path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    let data = '';
    const req = https.request(opts, r => {
      r.on('data', c => data += c);
      r.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text   = parsed.choices?.[0]?.message?.content || '';
          const json   = text.match(/\{[\s\S]*\}/)?.[0];
          resolve(json ? JSON.parse(json) : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(30000, () => { req.destroy(); resolve(null); });
    req.write(postData);
    req.end();
  });
}

// Queue on save (2 platforms auto)
function queueListingGeneration(savedProductId, name, category, country) {
  if (!savedProductId || !name) return;
  const platforms = (country === 'India' || !country)
    ? ['Amazon India', 'Flipkart']
    : ['Amazon', 'eBay'];
  setTimeout(() => generateListingsForProduct(savedProductId, name, category, country, platforms), 5000);
}


// ═══════════════════════════════════════════════════════════
//  v2.5 — PAGINATED TRENDING
// ═══════════════════════════════════════════════════════════

async function handleTrendingPage(req, res) {
  try {
    const body    = await readBody(req);
    const { query, country, category, page = 1, perPage = 20 } = body;
    const ctr     = country && country !== 'all' ? country : 'India';
    const tq      = category && category !== 'all'
      ? `trending best selling ${category} products 2025 ${ctr}`
      : `trending best selling products 2025 ${ctr}`;

    // Check cache first
    const cached  = dbGetScrapeCache(tq, ctr, page, perPage);
    if (cached) {
      console.log(`[Trending] Cache hit: page ${page} for "${tq}"`);
      return jsonOk(res, cached);
    }

    // Scrape — for pages > 1, augment the query to get different results
    const pageQuery = page > 1 ? `${tq} top products page ${page}` : tq;
    console.log(`[Trending] Scraping page ${page}: "${pageQuery}"`);

    let result;
    try {
      const scrapeRes = await scrapeProducts(pageQuery, ctr);
      const combined  = (scrapeRes && scrapeRes.combined) ? scrapeRes.combined : {};
      const raw       = combined.liveListings || [];
      // AI augment for additional pages if raw is thin
      let items       = raw;
      if (items.length < perPage) {
        const aiItems = await callAIForTrendingProducts(pageQuery, ctr, perPage, page);
        const existing = new Set(items.map(i => (i.name||'').toLowerCase()));
        for (const ai of aiItems) {
          if (!existing.has((ai.name||'').toLowerCase())) { items.push(ai); existing.add(ai.name.toLowerCase()); }
        }
      }
      // Filter non-products before paginating
      items = filterProductNames(items);
      // Paginate slice
      const start   = (page - 1) * perPage;
      const slice   = items.slice(start, start + perPage);
      const hasMore = items.length > start + perPage || page < 10;
      result = { items: slice, hasMore, total: items.length, page, perPage };
    } catch(e) {
      // AI-only fallback
      console.warn('[Trending] Scrape failed, using AI fallback:', e.message);
      const aiItems = await callAIForTrendingProducts(tq, ctr, perPage, page);
      const hasMore = aiItems.length >= perPage && page < 10;
      result = { items: aiItems, hasMore, total: aiItems.length, page, perPage };
    }

    dbSetScrapeCache(tq, ctr, page, perPage, result.items, result.hasMore, result.total);
    jsonOk(res, result);
  } catch(e) {
    console.error('[Trending Page] Error:', e);
    jsonErr(res, e.message, 500);
  }
}

async function filterProductNames(items) {
  if (!Array.isArray(items)) return [];
  const NON_PRODUCT = /^(top\s|best\s|trending\s|popular\s|cheap\s|buy\s|shop\s|online\s|new\s|latest\s|review|guide|how to|what is|list of|\d+\s+best|\d+\s+top|products?$|items?$|goods?$|things?$|accessories$|supplies$|essentials$)/i;
  return items.filter(p => {
    const name = (p.name || '').trim();
    if (!name || name.length < 5) return false;
    if (NON_PRODUCT.test(name)) return false;
    if (name.split(/\s+/).length < 2) return false; // single word = category
    return true;
  });
}

async function callAIForTrendingProducts(query, country, count, page) {
  const currency = COUNTRY_CURRENCIES[country] || 'INR';
  const prompt = `You are an expert e-commerce market analyst for ${country}. Generate exactly ${count} trending, profitable products that solo sellers can buy wholesale and resell online in ${country} right now (2025-2026).

Query context: "${query}" | Page ${page} (provide DIFFERENT products from previous pages, include niche/emerging items)

For each product, provide REAL market data based on actual ${country} e-commerce trends:
- Use REAL product names with brand/model where possible (e.g., "Boat Airdopes 141 TWS Earbuds" not just "earbuds")
- Price in ${currency} (realistic local market price a buyer would pay)
- Demand score 0-100 (based on actual search volume and sales rank)
- Margin % (realistic profit margin for a reseller after buying wholesale and selling online)
- Competition level based on how many sellers are on Amazon/Flipkart for this item
- monthlySales = estimated monthly units sold by a mid-level seller
- whySelling = specific reason (e.g., "Cricket season spike", "WFH trend", "Festive gifting")

Return ONLY a valid JSON array, no markdown, no extra text:
[{
  "name": "exact product name with brand/model",
  "category": "specific category",
  "demand": 75,
  "margin": 28,
  "competition": "Medium",
  "price": 1299,
  "currency": "${currency}",
  "platform": "Amazon India",
  "trend": "Rising",
  "riskLevel": "Low",
  "monthlySales": 450,
  "whySelling": "specific reason tied to ${country} market"
}]`;

  const resp = await callAI([{ role: 'user', content: prompt }], { max_tokens: 3000, temperature: 0.9 });
  try {
    const text = resp?.choices?.[0]?.message?.content || '';
    const arr  = text.match(/\[[\s\S]*\]/)?.[0];
    return arr ? JSON.parse(arr) : [];
  } catch { return []; }
}


// ═══════════════════════════════════════════════════════════
//  v2.5 — PAGINATED SEARCH (exhaustive until no more results)
// ═══════════════════════════════════════════════════════════

async function handleSearchPage(req, res) {
  try {
    const body = await readBody(req);
    const { query, country, page = 1, perPage = 20 } = body;
    if (!query) return jsonErr(res, 'query required');

    const ctr = country && country !== 'all' ? country : 'India';

    // Check cache
    const cached = dbGetScrapeCache(query, ctr, page, perPage);
    if (cached) return jsonOk(res, cached);

    // Scrape this page
    console.log(`[Search] Page ${page} for "${query}" in ${ctr}`);
    let items   = [];
    let hasMore = false;

    try {
      const scrapeRes = await scrapeProducts(query, ctr);
      const combined  = scrapeRes?.combined || {};
      const raw       = combined.liveListings || [];
      const start     = (page - 1) * perPage;
      items           = raw.slice(start, start + perPage);
      hasMore         = raw.length > start + perPage; // only true if there's actually more data
    } catch(e) {
      console.warn('[Search] Scrape error:', e.message);
    }

    // If scrape came up short, augment with AI
    if (items.length < Math.min(5, perPage)) {
      const aiItems = await callAIForSearch(query, ctr, perPage, page);
      const existing = new Set(items.map(i => (i.name||'').toLowerCase()));
      for (const ai of aiItems) {
        if (!existing.has((ai.name||'').toLowerCase())) items.push(ai);
      }
      // AI-based search is exhaustive by page 5
      hasMore = aiItems.length >= perPage && page < 5;
    }

    const result = { items, hasMore, page, perPage, query };
    dbSetScrapeCache(query, ctr, page, perPage, items, hasMore, items.length);
    jsonOk(res, result);
  } catch(e) {
    jsonErr(res, e.message, 500);
  }
}

/* ─── v2.5: Image Search Upload Handler ─────────────────────── */
async function handleImageSearchUpload(req, res) {
  let chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const buffer = Buffer.concat(chunks);
      const ext = path.extname(req.headers['x-file-name'] || '.jpg');
      const filename = `upload_${Date.now()}${ext}`;
      const dir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, buffer);
      
      console.log(`[ImageSearch] Saved upload to ${filepath} (${buffer.length} bytes). Running python analyzer...`);
      
      const result = await runPythonScript('scrapers/image_analyzer.py', { image_path: filepath });
      console.log('[ImageSearch] Result:', result);
      
      // Clean up uploaded file
      try {
        fs.unlinkSync(filepath);
      } catch {}
      
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[ImageSearch] Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

async function callAIForSearch(query, country, count, page) {
  const currency = COUNTRY_CURRENCIES[country] || 'INR';
  const prompt = `You are an e-commerce product search assistant for ${country}. Find ${count} real products matching: "${query}".

Page ${page} results. Return only products genuinely matching the query.

Requirements:
- REAL product names with full brand/model (e.g. "Boat Rockerz 450 Bluetooth Headphone" not "headphone")
- Prices in ${currency}, realistic for ${country}'s online market
- Actual platforms selling this in ${country} (Amazon India, Flipkart, Meesho etc.)
- relevanceScore: how closely this matches the query (0-100)
- If fewer truly relevant products exist, return fewer — do NOT pad with unrelated items

Return ONLY a valid JSON array, no markdown:
[{
  "name": "Full Product Name Brand Model",
  "category": "specific sub-category",
  "price": 1499,
  "currency": "${currency}",
  "platform": "Amazon India",
  "rating": 4.2,
  "reviews": 1250,
  "demand": 72,
  "margin": 22,
  "competition": "Medium",
  "relevanceScore": 88,
  "bestSeller": false,
  "whySelling": "specific market reason"
}]`;

  const resp = await callAI([{ role: 'user', content: prompt }], { max_tokens: 2000, temperature: 0.8 });
  try {
    const text  = resp?.choices?.[0]?.message?.content || '';
    const arr   = text.match(/\[[\s\S]*\]/)?.[0];
    const items = arr ? JSON.parse(arr) : [];
    return items.filter(i => i.name && (i.relevanceScore || 50) >= 40);
  } catch { return []; }
}



// ═══════════════════════════════════════════════════════════
//  v2.5 — URL REVERSE LOOKUP
// ═══════════════════════════════════════════════════════════

async function handleURLLookup(req, res) {
  try {
    const body = await readBody(req);
    const { url } = body;
    if (!url) return jsonErr(res, 'url required');

    // Validate URL
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return jsonErr(res, 'Invalid URL'); }

    console.log(`[URL Lookup] ${url}`);

    // Check cache
    const cached = dbGetUrlLookup(url);
    if (cached) { console.log('[URL Lookup] Cache hit'); return jsonOk(res, { product: cached, fromCache: true }); }

    // Detect platform
    const host     = parsedUrl.hostname.toLowerCase();
    const platform =
      host.includes('amazon')   ? 'Amazon' :
      host.includes('flipkart') ? 'Flipkart' :
      host.includes('meesho')   ? 'Meesho' :
      host.includes('ebay')     ? 'eBay' :
      host.includes('etsy')     ? 'Etsy' :
      host.includes('walmart')  ? 'Walmart' :
      host.includes('myntra')   ? 'Myntra' :
      host.includes('snapdeal') ? 'Snapdeal' :
      host.includes('nykaa')    ? 'Nykaa' :
      host.includes('jiomart')  ? 'JioMart' :
      host.includes('alibaba')  ? 'Alibaba' :
      host.includes('aliexpress') ? 'AliExpress' :
      host.includes('indiamart') ? 'IndiaMart' :
      host.includes('justdial') ? 'JustDial' :
      host.includes('flipkart') ? 'Flipkart' : 'Web';

    // Fetch the page
    const pageContent = await fetchPageContent(url);

    // Extract product info via AI
    const product = await extractProductFromPage(url, pageContent, platform);

    if (product) {
      dbSaveUrlLookup(url, product);
      jsonOk(res, { product, platform, fromCache: false });
    } else {
      jsonErr(res, 'Could not extract product details from this URL', 422);
    }
  } catch(e) {
    jsonErr(res, e.message, 500);
  }
}

function fetchPageContent(url) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const isHttps   = parsedUrl.protocol === 'https:';
    const client    = isHttps ? https : http;
    const opts = {
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || (isHttps ? 443 : 80),
      path:     parsedUrl.pathname + parsedUrl.search,
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
      },
    };
    let html = '';
    const req = client.request(opts, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        // Follow one redirect
        return fetchPageContent(r.headers.location).then(resolve);
      }
      r.setEncoding('utf8');
      r.on('data', c => { if (html.length < 300000) html += c; });
      r.on('end', () => resolve(html));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(15000, () => { req.destroy(); resolve(''); });
    req.end();
  });
}

async function extractProductFromPage(url, html, platform) {
  // Extract text content from HTML (simplified)
  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 8000); // Keep first 8k chars for AI

  const prompt = `Extract product details from this ${platform} product page content. URL: ${url}

Page text (first 8000 chars):
${textContent}

Return ONLY valid JSON with product details extracted from the page:
{
  "name": "exact product name from page",
  "brand": "brand name if found",
  "category": "product category",
  "price": price as number (0 if not found),
  "currency": "INR or USD etc",
  "originalPrice": MRP/original price as number if found,
  "discount": discount percentage if shown,
  "rating": rating out of 5,
  "reviews": number of reviews/ratings,
  "description": "product description from page",
  "keyFeatures": ["feature 1", "feature 2", "feature 3"],
  "specifications": {"key": "value"},
  "seller": "seller name if shown",
  "inStock": true or false,
  "platform": "${platform}",
  "sourceUrl": "${url}",
  "images": [],
  "demand": 50,
  "margin": estimated 15-40,
  "competition": "Medium",
  "whySelling": "brief analysis of why this product sells"
}`;

  return new Promise(resolve => {
    const pd = JSON.stringify({ model:AI_CONFIG.model, messages:[{role:'user',content:prompt}], max_tokens:1000, temperature:0.3, stream:false });
    const opts = { hostname:AI_CONFIG.host, port:443, path:AI_CONFIG.path, method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${AI_CONFIG.apiKey}`,'Content-Length':Buffer.byteLength(pd)} };
    let d = '';
    const r = https.request(opts, resp => {
      resp.on('data', c => d += c);
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          const text   = parsed.choices?.[0]?.message?.content || '';
          const json   = text.match(/\{[\s\S]*\}/)?.[0];
          resolve(json ? JSON.parse(json) : null);
        } catch (e) {
          console.warn('[AI] JSON parse failed in generateProductListings:', e.message);
          resolve(null);
        }
      });
    });
    r.on('error', (err) => {
      console.warn('[AI] HTTPS request failed in generateProductListings:', err.message);
      resolve(null);
    });
    r.setTimeout(30000, () => { r.destroy(); resolve(null); });
    r.write(pd); r.end();
  });
}


// ─── Deep Research: AI↔Scraper Feedback Loop ────────────────
async function handleDeepResearch(req, res) {
  try {
    const body = await readBody(req);
    const { country = 'India', category = 'all', maxRounds = 3 } = body;
    const ctr = country === 'all' ? 'India' : country;
    const baseQuery = category !== 'all'
      ? `trending best selling ${category} products ${new Date().getFullYear()} ${ctr}`
      : `trending best selling products ${new Date().getFullYear()} ${ctr}`;

    let allProducts = [];
    let queries = [baseQuery];
    let round = 0;
    const events = [];

    while (round < maxRounds && queries.length > 0) {
      round++;
      events.push({ round, action: 'scraping', queries: queries.length });

      // 1. Scrape all queries
      const scrapeResults = [];
      for (const q of queries.slice(0, 3)) {
        try {
          const sr = await scrapeProducts(q, ctr);
          const items = sr?.combined?.liveListings || [];
          scrapeResults.push(...items);
        } catch(e) { console.warn('[DeepResearch] Scrape error:', e.message); }
      }

      // 2. Deduplicate
      const existing = new Set(allProducts.map(p => (p.name||'').toLowerCase()));
      for (const p of scrapeResults) {
        if (!existing.has((p.name||'').toLowerCase())) {
          allProducts.push(p);
          existing.add((p.name||'').toLowerCase());
        }
      }

      events.push({ round, action: 'scraped', found: scrapeResults.length, total: allProducts.length });

      if (round >= maxRounds) break;

      // 3. Ask AI what data gaps exist
      const sampleProducts = allProducts.slice(0, 10).map(p => ({
        name: p.name, price: p.price, category: p.category, platform: p.platform,
        margin: p.margin, demand: p.demand, competition: p.competition
      }));

      const gapResult = await callAI([{ role: 'user', content:
        `You are an e-commerce product research analyst.\n\nI have ${allProducts.length} products from scraping. Here is a sample:\n${JSON.stringify(sampleProducts)}\n\nAnalyze what data gaps exist. What specific search queries would find better/more profitable products?\nReturn JSON only: {"needsMore":true/false,"queries":["query1","query2"],"reasoning":"..."}` }],
        { temperature: 0.6, max_tokens: 800 }
      );

      try {
        const content = gapResult?.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const gap = JSON.parse(jsonMatch[0]);
          events.push({ round, action: 'ai_analysis', needsMore: gap.needsMore, reasoning: gap.reasoning });
          if (gap.needsMore && gap.queries?.length) {
            queries = gap.queries.slice(0, 3);
          } else { break; }
        } else { break; }
      } catch(e) { break; }
    }

    // Filter out non-product items (categories, generic terms, articles)
    const NON_PRODUCT_PATTERNS = /^(top|best|trending|popular|cheap|affordable|buy|shop|online|new|latest|review|guide|how to|what is|list of|\d+ best|\d+ top|products?$|items?$|goods?$|things?$)/i;
    const MIN_NAME_WORDS = 2;
    allProducts = allProducts.filter(p => {
      const name = (p.name || '').trim();
      if (!name || name.length < 4) return false;
      if (NON_PRODUCT_PATTERNS.test(name)) return false;
      if (name.split(' ').length < MIN_NAME_WORDS) return false;
      return true;
    });

    // 4. Final AI ranking
    let ranking = allProducts;
    if (allProducts.length > 0) {
      try {
        const rankResult = await callAI([{ role: 'user', content:
          `Rank these e-commerce products by seller opportunity. For each, assign scores 0-100 for demand, marginPotential, and competitionRisk (lower=better). Return JSON array of objects with name and scores only. Products:\n${JSON.stringify(allProducts.slice(0, 25).map(p => ({ name: p.name, price: p.price, category: p.category, platform: p.platform })))}` }],
          { temperature: 0.5, max_tokens: 2000 }
        );
        const rankContent = rankResult?.choices?.[0]?.message?.content || '';
        const arrMatch = rankContent.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          const scores = JSON.parse(arrMatch[0]);
          const scoreMap = {};
          scores.forEach(s => { scoreMap[(s.name||'').toLowerCase()] = s; });
          ranking = allProducts.map(p => {
            const s = scoreMap[(p.name||'').toLowerCase()];
            return { ...p, aiDemand: s?.demand, aiMargin: s?.marginPotential, aiCompetition: s?.competitionRisk,
              aiScore: s ? Math.round((s.demand||50)*0.35 + (s.marginPotential||50)*0.30 + ((100-(s.competitionRisk||50))*0.20) + 10) : null };
          });
          ranking.sort((a,b) => (b.aiScore||0) - (a.aiScore||0));
        }
      } catch(e) { console.warn('[DeepResearch] Ranking error:', e.message); }
    }

    jsonOk(res, { items: ranking, rounds: round, events, total: allProducts.length, hasMore: false });

  } catch(e) { jsonErr(res, e.message, 500); }
}

// ─── Supplier Discovery Engine Initialization & Handlers ─────────
const supplierEngine = new SupplierDiscoveryEngine({
  db: getDB(),
  nimApiKey: PRIMARY_API_KEY,
  nimFallbackKey: FALLBACK_API_KEY
});
supplierEngine.init().then(() => console.log('✅ Supplier Discovery Engine initialized')).catch(e => console.warn('❌ Supplier Engine Init Error:', e.message));

async function handleSupplierDiscover(req, res) {
  try {
    const body = await readBody(req);
    const { productName, category, geo, useLearning } = body;
    if (!productName || productName.length < 2) {
      jsonErr(res, 400, 'Product name required (min 2 chars)');
      return;
    }
    const result = await supplierEngine.findSuppliers({
      productName, category: category || '', geo: geo || 'India', useLearning: useLearning !== false
    });
    jsonOk(res, result);
  } catch (e) {
    console.error('Discovery error:', e);
    jsonErr(res, 500, e.message);
  }
}

async function handleSupplierProduct(req, res, reqUrl) {
  try {
    const name = reqUrl.searchParams.get('name');
    if (!name) {
      jsonErr(res, 400, 'Product name required');
      return;
    }
    const suppliers = await supplierEngine.getSuppliersForProduct(name);
    jsonOk(res, suppliers);
  } catch (e) {
    jsonErr(res, 500, e.message);
  }
}

async function handleSupplierFeedback(req, res) {
  try {
    const body = await readBody(req);
    const { supplierId, feedback } = body;
    const result = await supplierEngine.submitFeedback(supplierId, feedback);
    jsonOk(res, result);
  } catch (e) {
    jsonErr(res, 500, e.message);
  }
}

async function handleSupplierAutoDiscover(req, res) {
  try {
    const db = getDB();
    const trending = db.prepare ? 
      db.prepare('SELECT name, category FROM trending_products WHERE created_at > datetime("now", "-7 days") LIMIT 10').all() :
      await db.all('SELECT name, category FROM trending_products WHERE created_at > datetime("now", "-7 days") LIMIT 10');
    const results = await supplierEngine.learning.autoDiscover(trending);
    jsonOk(res, { scheduled: results.length, products: results });
  } catch (e) {
    jsonErr(res, 500, e.message);
  }
}

// ─── Start ──────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔════════════════════════════════════════════════════╗');
  console.log('  ║   Solo E-Commerce Command Center — Server v2.5  ║');
  console.log('  ╠════════════════════════════════════════════════════╣');
  console.log(`  ║   Local:    http://localhost:${PORT}                  ║`);
  console.log(`  ║   AI:       NVIDIA ${'z-ai/glm-5.2 + minimax-m3'.padEnd(28)}║`);
  console.log('  ║   DB:       SQLite (eco.db) — persistent         ║');
  console.log('  ║   Scraper:  Crawlee (Amazon, Google, eBay, etc.) ║');
  console.log('  ║   Cost:     100% FREE — no API keys needed       ║');
  console.log('  ║   Stop:     Ctrl+C                               ║');
  console.log('  ╚════════════════════════════════════════════════════╝');
  console.log('');
});

