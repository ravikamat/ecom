// ── Node.js Version Guard ──────────────────────────────────
const nodeMajor = parseInt(process.versions.node.split('.')[0]);
if (nodeMajor < 22) {
  console.error(`[FATAL] Node.js ${process.versions.node} detected. ECO requires Node.js 22+ for node:sqlite DatabaseSync.`);
  process.exit(1);
}

/* ============================================================
   Server v4 — Crawlee Live Scraping + AI Intelligence
   ============================================================
   Crawlee: Scrapes Amazon, Google Shopping, Flipkart, eBay
   AI:      GLM-5.2 → MiniMax-M3 → Ollama Qwen 3.6 (3-tier)
   100% free — no API keys needed for scraping
   ============================================================
   Run:  node server.js
   Open: http://localhost:3000
   ============================================================ */

import { createServer } from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import express from 'express';

import { scrapeProducts, COUNTRY_CURRENCIES, safeParseLLMResponse } from './scraper.js';

// v2.5 — SQLite persistent database
import {
  getDB, dbGetSaved, dbGetSavedById, dbInsertSaved, dbUpdateSaved,
  dbDeleteSaved, dbPinSaved, dbClearUnpinned, dbGetSetting, dbSetSetting,
  dbGetRates, dbSetRates, dbGetProductDetail, dbSaveProductDetail,
  dbGetScrapeCache, dbSetScrapeCache, dbGetUrlLookup, dbSaveUrlLookup,
  dbGetListings, dbUpsertListing, dbMigrateFromClient,
  dbGetProducts, dbGetProductById, dbGetSuppliers, dbGetSupplierById, dbGetPlatforms,
  dbGetDashboardStats, dbResetDatabase,
  dbInsertRun, dbInsertCandidates, dbUpsertTempProducts, dbFinishRun,
  dbGetRankedTempProducts, dbGetWorkerStatus, dbPruneTempTables,
  dbGetTopDiscoveredProducts, dbBoostProductScore
} from './db/sqlite.js';

import { runFullResearchCycle, deepResearchProducts } from './src/hero-research-orchestrator.js';
import { SupplierDiscoveryEngine } from './src/supplier-discovery-engine.js';
import { DiscoveryStreamEngine } from './src/discovery-stream-engine.js';
import { buildQwenPrompt } from './src/qwen-prompts.js';

// Route imports for Express
import productRoutes from './src/api/v1/routes/products.routes.js';
import searchRoutes from './src/api/v1/routes/search.routes.js';
import savedRoutes from './src/api/v1/routes/saved.routes.js';
import researchRoutes from './src/api/v1/routes/research.routes.js';
import discoveryRoutes from './src/api/v1/routes/discovery.routes.js';
import supplierRoutes from './src/api/v1/routes/suppliers.routes.js';
import chatbotRoutes from './src/api/v1/routes/chatbot.routes.js';
import calculatorRoutes from './src/api/v1/routes/calculator.routes.js';
import healthRoutes from './src/api/v1/routes/health.routes.js';
import metricsRoutes from './src/api/v1/routes/metrics.routes.js';

// ✅ NEW: Import all the fix modules
import { Validators } from './src/validators.js';
import { logger } from './src/infrastructure/logger.js';
import { searchCache } from './src/cache.js';
import { dedup } from './src/dedup.js';
import { compressResponseSync } from './src/compression.js';
import { healthCheck } from './src/health.js';
import { metrics } from './src/metrics.js';
import { CONFIG as sharedConfig } from './src/config.js';

// ── AI Gateway (3-tier: GLM → MiniMax → Ollama) ──────────
import { startHeartbeat, getHealthStatus as getGatewayHealth } from './src/intelligence-layer/ai-gateway.js';

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

// ──────────────── Config ────────────────────────────────
let PRIMARY_API_KEY = process.env.NVIDIA_API_KEY || '';
let FALLBACK_API_KEY = process.env.MINIMAX_API_KEY || '';

let isServerSuspended = false;
let workerIntervalId = null;

// Discovery Stream Engine — initialized lazily with DB + keys after startup
let discoveryEngine = null;
function getDiscoveryEngine() {
  if (!discoveryEngine) {
    const db = getDB();
    discoveryEngine = new DiscoveryStreamEngine({
      db,
      primaryApiKey: PRIMARY_API_KEY,
      fallbackApiKey: FALLBACK_API_KEY,
    });
  }
  return discoveryEngine;
}
// Proxy so routes can call discoveryEngine.xxx without null checks
const discoveryEngineProxy = new Proxy({}, {
  get(_, prop) {
    return (...args) => getDiscoveryEngine()[prop](...args);
  }
});

const AI_CONFIG = {
  host: CONFIG.ai.host,
  path: CONFIG.ai.path,
  model: CONFIG.ai.primary.model,
  apiKey: PRIMARY_API_KEY,
  enabled: false,
};

// ──── MiniMax Fallback ────────────────────────────────
const AI_FALLBACK = {
  host: CONFIG.ai.host,
  path: CONFIG.ai.path,
  model: CONFIG.ai.fallback.model,
  apiKey: FALLBACK_API_KEY,
  top_p: CONFIG.ai.fallback.topP,
};

// ──── Universal AI caller with auto-fallback ────────────────────────────────
// ──── Ollama Local AI Config ────────────────────────────────
const OLLAMA_CONFIG = {
  host: '127.0.0.1',
  port: 11434,
  model: 'qwen3:1.7b',
  timeout: 45000, // 45s max for local model
};
let _ollamaAvailable = null; // null=unknown, true/false
let _cloudLatencyMs  = [];   // rolling window of cloud response times

function callOllama(prompt, { temperature = 0.7, maxTokens = 2048 } = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: OLLAMA_CONFIG.model,
      prompt,
      stream: false,
      options: { temperature, num_predict: maxTokens },
    });
    const req = http.request({
      hostname: OLLAMA_CONFIG.host,
      port:     OLLAMA_CONFIG.port,
      path:     '/api/generate',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          resolve(parsed.response || '');
          _ollamaAvailable = true;
        } catch { reject(new Error('Ollama parse error')); }
      });
    });
    req.on('error', (e) => { reject(e); });
    req.setTimeout(OLLAMA_CONFIG.timeout, () => { req.destroy(); reject(new Error('Ollama timeout')); });
    req.write(body); req.end();
  });
}

// Ping Ollama on startup and every 5 minutes
async function checkOllamaAvailability() {
  try {
    await new Promise((resolve, reject) => {
      const req = http.request({ hostname: OLLAMA_CONFIG.host, port: OLLAMA_CONFIG.port,
        path: '/api/tags', method: 'GET' }, (res) => {
        res.resume();
        _ollamaAvailable = res.statusCode === 200;
        resolve();
      });
      req.on('error', () => { _ollamaAvailable = false; resolve(); });
      req.setTimeout(3000, () => { req.destroy(); _ollamaAvailable = false; resolve(); });
      req.end();
    });
  } catch { _ollamaAvailable = false; }
  console.log(`[Ollama] ${_ollamaAvailable ? '✅ Available' : '⚠️ Not running'} — model: ${OLLAMA_CONFIG.model}`);
}
checkOllamaAvailability();
setInterval(checkOllamaAvailability, 300000);

// Prompt optimizer: Qwen rewrites the user prompt before sending to GLM
// Only used when Ollama is available — adds ~1-2s but improves GLM output quality
async function preOptimizePrompt(rawPrompt) {
  if (!_ollamaAvailable) return rawPrompt;
  try {
    const optimizerPrompt = `You are a prompt optimizer for an e-commerce AI system. Rewrite this prompt to be more specific, structured, and likely to produce accurate JSON output. Keep all original intent. Output ONLY the rewritten prompt, nothing else.\n\nOriginal:\n${rawPrompt}`;
    const optimized = await callOllama(optimizerPrompt, { temperature: 0.3, maxTokens: 512 });
    return optimized && optimized.length > 20 ? optimized : rawPrompt;
  } catch { return rawPrompt; }
}

// Track cloud avg latency — if > 8s, auto-promote Ollama to secondary
function _trackLatency(ms) {
  _cloudLatencyMs.push(ms);
  if (_cloudLatencyMs.length > 10) _cloudLatencyMs.shift();
}
function _cloudIsSlow() {
  if (_cloudLatencyMs.length < 5) return false; // need more samples
  const avg = _cloudLatencyMs.reduce((a, b) => a + b, 0) / _cloudLatencyMs.length;
  return avg > 15000; // >15s avg = genuinely slow
}

function callAI(messages, opts = {}) {
  return new Promise((resolve) => {
    const tryOllamaFallback = async () => {
      if (!_ollamaAvailable) { resolve(null); return; }
      try {
        console.log(`[AI] Both cloud AIs failed — trying Ollama Qwen 3.6 (local, task: ${opts.taskType || 'general'})...`);
        // Build compact Qwen prompt — truncate to avoid token overflow
        const smartPrompt = buildQwenPrompt(messages, opts.taskType || 'general');
        const compactPrompt = smartPrompt.length > 2000 ? smartPrompt.substring(0, 2000) + '\n\nReturn JSON only.' : smartPrompt;
        const text = await callOllama(compactPrompt, { temperature: opts.temperature || 0.7, maxTokens: Math.min(opts.max_tokens || 2048, 1500) });
        if (!text || text.trim().length === 0) { resolve(null); return; }
        // Wrap in same shape as cloud response
        resolve({ choices: [{ message: { content: text } }], _source: 'ollama' });
      } catch (e) {
        console.error(`[AI] Ollama fallback failed (${opts.taskType || 'general'}):`, e.message);
        resolve(null);
      }
    };

    // If cloud is consistently slow AND Ollama is up — try Ollama first as secondary
    if (_cloudIsSlow() && _ollamaAvailable) {
      console.log(`[AI] Cloud latency high — trying Ollama first (task: ${opts.taskType || 'general'})...`);
      const smartPrompt = buildQwenPrompt(messages, opts.taskType || 'general');
      const compactPrompt = smartPrompt.length > 2000 ? smartPrompt.substring(0, 2000) + '\n\nReturn JSON only.' : smartPrompt;
      callOllama(
        compactPrompt,
        { temperature: opts.temperature || 0.7, maxTokens: Math.min(opts.max_tokens || 2048, 1500) }
      ).then(text => {
        if (!text || text.trim().length === 0) { cloudCall(tryOllamaFallback); return; }
        resolve({ choices: [{ message: { content: text } }], _source: 'ollama-fast-path' });
      }).catch(() => {
        // Ollama failed too — fall through to cloud
        cloudCall(tryOllamaFallback);
      });
      return;
    }

    cloudCall(tryOllamaFallback);

    function cloudCall(finalFallback) {
      const tryCall = (cfg, isFallback) => {
        const t0 = Date.now();
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
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (cfg.apiKey || ''),
            'Content-Length': Buffer.byteLength(pd),
          },
        }, (r) => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => {
            _trackLatency(Date.now() - t0);
            if (r.statusCode === 200) {
              if (!d || d.trim().length === 0) {
                const name = isFallback ? 'MiniMax' : 'GLM';
                console.warn(`[AI] ${name} returned empty body — trying next fallback`);
                if (!isFallback) tryCall(AI_FALLBACK, true); else finalFallback();
                return;
              }
              try { resolve(JSON.parse(d)); }
              catch(parseErr) {
                console.warn('[AI] JSON parse failed:', d.substring(0, 100));
                if (!isFallback) tryCall(AI_FALLBACK, true); else finalFallback();
              }
            } else if (!isFallback) {
              console.warn(`[AI] Primary failed (${r.statusCode}), trying MiniMax fallback...`);
              tryCall(AI_FALLBACK, true);
            } else {
              console.warn(`[AI] MiniMax failed (${r.statusCode}) — trying Ollama Qwen 3.6...`);
              finalFallback();
            }
          });
        });
        apiReq.on('error', (e) => {
          _trackLatency(Date.now() - t0);
          if (!isFallback) {
            console.warn('[AI] Primary network error, trying MiniMax:', e.message);
            tryCall(AI_FALLBACK, true);
          } else {
            finalFallback();
          }
        });
        apiReq.setTimeout(CONFIG.ai.timeout, () => {
          apiReq.destroy();
          _trackLatency(CONFIG.ai.timeout);
          if (!isFallback) tryCall(AI_FALLBACK, true); else finalFallback();
        });
        apiReq.write(pd); apiReq.end();
      };
      const primary = AI_CONFIG.enabled ? AI_CONFIG : AI_FALLBACK;
      tryCall(primary, !AI_CONFIG.enabled);
    }
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
    sharedConfig.apiKey = PRIMARY_API_KEY;
    console.log(`[Startup] Primary AI (GLM-5.2) enabled with key: ${PRIMARY_API_KEY.slice(0,10)}...`);
  }
  if (fallbackRow) {
    FALLBACK_API_KEY = fallbackRow;
    AI_FALLBACK.apiKey = FALLBACK_API_KEY;
    sharedConfig.fallbackApiKey = FALLBACK_API_KEY;
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

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '10mb' }));

// Set CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('http://[::1]'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Check if server is suspended
app.use((req, res, next) => {
  if (isServerSuspended && req.path.startsWith('/api/') && req.path !== '/api/server/control' && req.path !== '/api/health') {
    return res.status(503).json({ error: 'Server suspended' });
  }
  next();
});

// Rate limiter for sensitive endpoints
app.use(['/api/scrape', '/api/ai', '/api/agent/chat', '/api/url-lookup', '/api/product-detail', '/api/trending/page', '/api/search/page'], (req, res, next) => {
  if (!rateLimiter(req, res)) return;
  next();
});

// Mount the new routes
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/saved', savedRoutes);
app.use('/api/v1/research', researchRoutes);
app.use('/api/v1/discovery', discoveryRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/chatbot', chatbotRoutes);
app.use('/api/v1/calc', calculatorRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/metrics', metricsRoutes);

// Helper to support old readBody (since body is already parsed by express.json)
function readBody(req) {
  return Promise.resolve(req.body);
}

// Redirect/Forward helpers for old endpoints to keep compatibility
app.get('/api/db/products', (req, res) => handleDBGetProducts(req, res));
app.get('/api/db/products/:id', (req, res) => handleDBGetProductById(req, res, req.path));
app.get('/api/db/suppliers', (req, res) => handleDBGetSuppliers(req, res));
app.get('/api/db/suppliers/:id', (req, res) => handleDBGetSupplierById(req, res, req.path));
app.get('/api/db/platforms', (req, res) => handleDBGetPlatforms(req, res));

app.get('/api/db/settings', (req, res) => handleDBGetSettings(req, res));
app.post('/api/db/settings', (req, res) => handleDBSetSetting(req, res));
app.post('/api/db/migrate', (req, res) => handleDBMigrate(req, res));
app.get('/api/db/dashboard-stats', (req, res) => handleDBDashboardStats(req, res));
app.get('/api/scrape/competitor', (req, res) => handleScrapeCompetitor(req, res));
app.get('/api/db/rates', (req, res) => handleDBGetRates(req, res));
app.post('/api/db/rates', (req, res) => handleDBSetRates(req, res));
app.get('/api/db/listings/:savedProductId', (req, res) => handleDBGetListings(req, res, req.path));
app.post('/api/db/listings/generate', (req, res) => handleDBGenerateListing(req, res));

app.get('/api/db/saved', (req, res) => handleDBGetSaved(req, res));
app.post('/api/db/saved', (req, res) => handleDBInsertSaved(req, res));
app.get('/api/db/saved/:id', (req, res) => handleDBGetSavedById(req, res, req.path));
app.put('/api/db/saved/:id', (req, res) => handleDBUpdateSaved(req, res, req.path));
app.delete('/api/db/saved/:id', (req, res) => handleDBDeleteSaved(req, res, req.path));
app.post('/api/db/pin/:id', (req, res) => handleDBPinSaved(req, res, req.path));
app.post('/api/db/clear', (req, res) => handleDBClear(req, res));

app.post('/api/scrape', (req, res) => handleScrape(req, res));
app.post('/api/ai', (req, res) => handleAIProxy(req, res));
app.post('/api/set-key', (req, res) => handleSetKey(req, res));
app.post('/api/product-detail', (req, res) => handleProductDetail(req, res));
app.post('/api/research/multi-page', (req, res) => handleMultiPageResearch(req, res));
app.get('/api/research/trends/:product', (req, res) => handleTrends(req, res, req.path));
app.post('/api/competitor/price', (req, res) => handleCompetitorPrice(req, res));
app.post('/api/agent/chat', (req, res) => handleAgentChat(req, res));
app.post('/api/scraper/run', (req, res) => handleScraperRun(req, res));
app.get('/api/agent/tools', (req, res) => handleAgentTools(req, res));

app.post('/api/trending/page', (req, res) => handleTrendingPage(req, res));
app.post('/api/search/page', (req, res) => handleSearchPage(req, res));
app.post('/api/search/upload', (req, res) => handleImageSearchUpload(req, res));
app.post('/api/url-lookup', (req, res) => handleURLLookup(req, res));
app.post('/api/trending/deep-research', (req, res) => handleDeepResearch(req, res));
app.post('/api/server/control', (req, res) => handleServerControl(req, res));

app.post('/api/research/run', (req, res) => handleResearchRunRoute(req, res));
app.get('/api/research/status', (req, res) => handleResearchStatusRoute(req, res));
app.get('/api/trending/feed', (req, res) => handleTrendingFeedRoute(req, res, new URL(req.url, 'http://localhost')));
app.post('/api/search/opportunities', (req, res) => handleSearchOpportunitiesRoute(req, res));
app.post('/api/research/refresh', (req, res) => handleResearchRefreshRoute(req, res));

app.post('/api/suppliers/discover', (req, res) => handleSupplierDiscover(req, res));
app.get('/api/suppliers/product', (req, res) => handleSupplierProduct(req, res, new URL(req.url, 'http://localhost')));
app.post('/api/suppliers/feedback', (req, res) => handleSupplierFeedback(req, res));
app.get('/api/suppliers/auto-discover', (req, res) => handleSupplierAutoDiscover(req, res));

app.get('/api/health', (req, res) => healthCheck.check().then(h => res.json(h)));
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const level = req.query.level || null;
  const component = req.query.component || null;
  const logs = logger.getLogs({ level, component, limit });
  res.json({ logs, count: logs.length });
});
app.get('/api/logs/stats', (req, res) => res.json(logger.getStats()));
app.get('/api/metrics', (req, res) => res.json(metrics.getSnapshot()));
app.get('/api/cache/stats', (req, res) => {
  const stats = searchCache.getStats();
  stats.capacity = searchCache.getCapacityPercent() + '%';
  res.json(stats);
});
app.post('/api/cache/clear', (req, res) => {
  searchCache.clear();
  dedup.clear();
  logger.info('Cache', 'Cache cleared');
  res.json({ success: true, message: 'Cache cleared' });
});
app.get('/api/ai-status', (req, res) => {
  res.json({
    enabled: AI_CONFIG.enabled || !!AI_FALLBACK.apiKey || _ollamaAvailable,
    primary: { model: AI_CONFIG.model, hasKey: !!AI_CONFIG.apiKey, enabled: AI_CONFIG.enabled },
    fallback: { model: AI_FALLBACK.model, hasKey: !!AI_FALLBACK.apiKey },
    ollama: { available: !!_ollamaAvailable, model: OLLAMA_CONFIG.model },
  });
});
app.get('/api/ai/health', (req, res) => {
  const gwHealth = getGatewayHealth();
  gwHealth.ollama_local = _ollamaAvailable;
  res.json(gwHealth);
});

app.get('/api/ollama/status', (req, res) => handleOllamaStatus(req, res));
app.post('/api/ollama/supplier-msg', (req, res) => handleOllamaSupplierMsg(req, res));
app.post('/api/refresh-saved', (req, res) => handleRefreshSaved(req, res));

app.get('/api/discovery/stream', (req, res) => handleDiscoveryStream(req, res));
app.post('/api/discovery/feedback', (req, res) => handleDiscoveryFeedback(req, res));
app.delete('/api/discovery/stream/:sessionId', (req, res) => handleDiscoveryStopStream(req, res));
app.get('/api/discovery/top', (req, res) => handleDiscoveryTop(req, res));
app.post('/api/discovery/boost', (req, res) => handleDiscoveryBoost(req, res));

// Wrap custom/complex handler routes that had custom parameter extraction or streaming behavior
async function handleOllamaStatus(req, res) {
  let models = [];
  try {
    models = await new Promise((resolve) => {
      const r = http.request({ hostname: OLLAMA_CONFIG.host, port: OLLAMA_CONFIG.port,
        path: '/api/tags', method: 'GET' }, (res2) => {
        let d = ''; res2.on('data', c => d += c);
        res2.on('end', () => { try { resolve(JSON.parse(d).models || []); } catch { resolve([]); } });
      });
      r.on('error', () => resolve([]));
      r.setTimeout(3000, () => { r.destroy(); resolve([]); });
      r.end();
    });
    _ollamaAvailable = models.length > 0;
  } catch { _ollamaAvailable = false; }
  const avgLatency = _cloudLatencyMs.length > 0
    ? Math.round(_cloudLatencyMs.reduce((a,b)=>a+b,0) / _cloudLatencyMs.length) : null;
  jsonOk(res, {
    available: _ollamaAvailable,
    model: OLLAMA_CONFIG.model,
    models: models.map(m => ({ name: m.name, size: m.size })),
    cloudAvgLatencyMs: avgLatency,
    cloudIsSlow: _cloudIsSlow(),
    mode: (!AI_CONFIG.apiKey && !AI_FALLBACK.apiKey && _ollamaAvailable) ? 'ollama-only' :
          _cloudIsSlow() && _ollamaAvailable ? 'ollama-promoted' :
          _ollamaAvailable ? 'cloud-primary-ollama-fallback' : 'cloud-only',
  });
}

async function handleOllamaSupplierMsg(req, res) {
  const { supplier, product, type = 'email', yourName = 'Buyer', yourBusiness = '' } = req.body;
  if (!supplier || !product) { jsonErr(res, 400, 'supplier and product required'); return; }

  const emailPrompt = `Write a professional e-commerce supplier inquiry ${type === 'whatsapp' ? 'WhatsApp message (keep under 300 words, casual but professional)' : 'email (formal, 200-300 words)'} to:
Supplier: ${supplier.name || 'Supplier'} (${supplier.country || ''})
Product: ${product}
MOQ: ${supplier.moq || 'not specified'}
My name: ${yourName}${yourBusiness ? ', Business: ' + yourBusiness : ''}

Include: greeting, what I'm looking for, quantity interested (2x MOQ), request for price sheet/catalog, payment terms question, and professional closing.
${type === 'whatsapp' ? 'Start with Hi/Hello. Be conversational.' : 'Use proper email structure with Subject line at the top.'}
Output ONLY the message, no explanations.`;

  let message = '';
  let source = 'ollama';
  try {
    if (_ollamaAvailable) {
      message = await callOllama(emailPrompt, { temperature: 0.6, maxTokens: 600 });
    } else {
      throw new Error('Ollama not available');
    }
  } catch {
    source = 'glm';
    try {
      const resp = await callAI([{ role: 'user', content: emailPrompt }], { max_tokens: 600, temperature: 0.6 });
      message = resp?.choices?.[0]?.message?.content || '';
    } catch { message = ''; }
  }

  if (!message) { jsonErr(res, 503, 'AI not available to generate message'); return; }
  jsonOk(res, { message, type, source });
}

async function handleRefreshSaved(req, res) {
  const { id, name, country = 'India' } = req.body;
  if (!id && !name) { jsonErr(res, 400, 'id or name required'); return; }
  try {
    const searchName = name || (() => {
      const row = getDB().prepare('SELECT name FROM saved_products WHERE id=?').get(id);
      return row?.name || '';
    })();
    if (!searchName) { jsonErr(res, 404, 'Saved product not found'); return; }
    const prompt = `Give current market data for this e-commerce product in ${country}: "${searchName}".
Return JSON ONLY: { "demand": 0-100, "margin": 0-100, "competition": "Low|Medium|High", "avgPrice": number, "trendStatus": "rising|stable|declining", "note": "brief insight" }`;
    const resp = await callAI([{ role: 'user', content: prompt }], { max_tokens: 300, temperature: 0.5 });
    const text = resp?.choices?.[0]?.message?.content || '';
    let parsed = {};
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch {}
    if (id && Object.keys(parsed).length > 0) {
      const db = getDB();
      db.prepare(`UPDATE saved_products SET demand=COALESCE(?,demand), margin=COALESCE(?,margin),
        trend_status=COALESCE(?,trend_status), updated_at=datetime('now') WHERE id=?`)
        .run(parsed.demand || null, parsed.margin || null, parsed.trendStatus || null, parseInt(id));
    }
    jsonOk(res, { updated: parsed, source: resp?._source || 'cloud' });
  } catch (e) { jsonErr(res, 500, e.message); }
}

async function handleDiscoveryStream(req, res) {
  const country    = req.query.country || 'India';
  const city       = req.query.city || '';
  const currency   = req.query.currency || 'INR';
  const sessionId  = req.query.sessionId;
  if (!sessionId) { jsonErr(res, 400, 'sessionId required'); return; }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
  if (res.flushHeaders) res.flushHeaders();

  const location = { country, city, currency };
  const sseWrite = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  req.on('close', () => { discoveryEngineProxy.stopStream(sessionId); });
  discoveryEngineProxy.startStream(sessionId, location, sseWrite)
    .catch(e => { console.error('[Discovery Route] Error:', e.message); })
    .finally(() => { try { res.end(); } catch {} });
}

async function handleDiscoveryFeedback(req, res) {
  const { sessionId, productId, product, action } = req.body;
  if (!sessionId || !action) { jsonErr(res, 400, 'sessionId and action required'); return; }
  if (action === 'save') discoveryEngineProxy.handleSave(sessionId, product);
  else discoveryEngineProxy.handleSkip(sessionId, product);
  jsonOk(res, { ok: true, action });
}

async function handleDiscoveryStopStream(req, res) {
  const sid = req.params.sessionId;
  discoveryEngineProxy.stopStream(sid);
  jsonOk(res, { ok: true, stopped: sid });
}

async function handleDiscoveryTop(req, res) {
  const country  = req.query.country  || 'India';
  const limit    = Math.min(200, parseInt(req.query.limit  || '100'));
  const offset   = parseInt(req.query.offset || '0');
  const minScore = parseInt(req.query.minScore || '0');
  try {
    let products = dbGetTopDiscoveredProducts(country, limit, offset);
    if (minScore > 0) products = products.filter(p => (p.hero_score || 0) >= minScore);
    products = products.map(p => {
      let extra = {};
      try { extra = JSON.parse(p.raw_listings || '{}'); } catch {}
      let urls = [];
      try { urls = JSON.parse(p.source_urls || '[]'); } catch {}
      return { ...p, _extra: extra, source_urls: urls };
    });
    res.json({
      items: products,
      total: products.length + offset,
      limit, offset, country,
      hasMore: products.length === limit,
    });
  } catch (e) {
    jsonErr(res, 500, e.message);
  }
}

async function handleDiscoveryBoost(req, res) {
  const { name, country = 'India', action } = req.body;
  if (!name || !action) { jsonErr(res, 400, 'name and action required'); return; }
  const delta = action === 'save' ? 8 : action === 'skip' ? -3 : 0;
  if (delta !== 0) dbBoostProductScore(name, country, delta);
  jsonOk(res, { ok: true, delta });
}

// Serve static frontend files from current directory
app.use(express.static('.'));

// Setup HTTP server object to bind listener
const server = createServer(app);


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  SET API KEY — Hot-swap key without server restart
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

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
          'Authorization': 'Bearer ' + apiKey,
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


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  PRODUCT DETAIL — Deep AI analysis of a single product
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

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

      const aiResp = await callAI(
        [{ role: 'user', content: prompt }],
        { temperature: 0.4, top_p: 0.9, max_tokens: 4000, taskType: 'product_detail' }
      );
      const text = aiResp?.choices?.[0]?.message?.content || '';
      let aiResult = null;
      try {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1) {
          let jsonStr = text.slice(start, end + 1);
          // Balance brackets
          let open = 0;
          for (let i = 0; i < jsonStr.length; i++) {
            if (jsonStr[i] === '{') open++;
            if (jsonStr[i] === '}') open--;
          }
          if (open > 0) jsonStr += '}'.repeat(open);
          aiResult = JSON.parse(jsonStr);
        }
      } catch { aiResult = null; }


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


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  PRODUCT SEARCH — Crawlee Scraping + AI Intelligence
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

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

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
    if (aiData.products && Array.isArray(aiData.products)) {
      aiData.products.forEach(p => {
        if (p.name && p.name.length > 3) {
          combined.liveListings.push({
            name: p.name, price: p.price || 0, currency,
            platform: p.platform || 'Online', rating: p.rating || null,
            reviews: p.reviews || null, category: p.category || null,
            seller: p.seller || null, monthlySales: p.monthlySales || null,
            demand: p.demand || null, margin: p.margin || null,
            competition: p.competition || null, platformCount: p.platformCount || null,
            winnerScore: p.winnerScore || null, source: 'AI Intelligence',
          });
        }
      });
      combined.dataSources.push(`AI Products (${aiData.products.length} listings)`);
    }
  }

  if (combined.liveListings.length === 0 && !aiData) {
    combined.dataSources.push('No live data (scraping may be blocked)');
  }

  const seen = new Set();
  combined.liveListings = combined.liveListings.filter(l => {
    const key = (l.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return combined;
}


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  AI INTELLIGENCE (3-tier: GLM-5.2 — MiniMax — Ollama)
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function fetchAIProductData(query, country, currency) {
  if (!AI_CONFIG.enabled && !_ollamaAvailable) {
    console.log('[AI] ⚠️    No AI available - skipping market intelligence');
    return null;
  }

  const prompt = `For "${query}" in ${country}, return market data as JSON ONLY:
{
  "products": [
    {"name":"FULL product name","price":number in ${currency},"platform":"name","rating":1-5,"reviews":number,"monthlySales":number,"category":"cat","seller":"name","demand":0-100,"margin":0-100,"competition":"Low/Medium/High/Very High","platformCount":number,"winnerScore":0-100}
  ],
  "marketOverview": {"totalListings":number,"avgPrice":number,"priceRange":{"min":number,"max":number},"estimatedMonthlySales":number,"trending":boolean,"demandScore":0-100,"competitionLevel":"Low/Medium/High/Very High","seasonality":"desc"},
  "platformBreakdown": [{"platform":"name","price":number,"priceRange":{"min":number,"max":number},"estimatedSellers":number,"estimatedMonthlySales":number,"rating":1-5,"reviews":number,"fees":number,"shippingCost":number,"profitMargin":number}],
  "supplierData": {"wholesalePrice":number,"bulkPrice":number,"topSources":["string"],"moq":number,"leadTime":"string"},
  "competitors": [{"name":"name","price":number,"platform":"string","monthlySales":number}],
  "recommendation": {"verdict":"Worth selling/High risk/Moderate opportunity","expectedProfit":number,"bestPlatform":"string","investmentNeeded":number,"tip":"string"}
}
IMPORTANT: 10 SPECIFIC products with FULL names. winnerScore=(demand*0.35)+(margin*0.30)+((100-competitionIndex)*0.20)+(platformCount*5). Sort by winnerScore desc. ONLY JSON.`;

  try {
    console.log('[AI] Querying market intelligence via callAI (3-tier fallback)...');
    const messages = [{ role: 'user', content: 'Return ONLY valid JSON. No markdown.\n\n' + prompt }];
    const aiResp = await callAI(messages, { temperature: 1, top_p: 1, max_tokens: 6000, taskType: 'market_intelligence' });
    const content = aiResp?.choices?.[0]?.message?.content || '';
    console.log(`[AI] Response: ${content.length} chars (source: ${aiResp?._source || 'cloud'})`);
    const parsed = extractJSON(content);
    console.log(`[AI] Parsed: ${parsed ? '✅' : '⚠️'}`);
    return parsed;
  } catch (e) {
    console.error('[AI] fetchAIProductData error:', e.message);
    return null;
  }
}



// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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


// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  AI PROXY (for general frontend AI queries)
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function handleAIProxy(req, res) {
  let body = '', sent = false;
  const respond = (code, data) => {
    if (sent) return; sent = true;
    try { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(typeof data === 'string' ? data : JSON.stringify(data)); } catch {}
  };

  // FIX C3: Do NOT gate on cloud key — Ollama is always available as fallback
  // No 503 guard here. callAI() handles 3-tier fallback automatically.

  req.on('data', c => { body += c; });
  req.on('end', async () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch { return respond(400, { error: { message: 'Invalid JSON' } }); }

    const SYSTEM_PREFIX = 'You are an expert e-commerce research assistant. Respond with valid JSON when asked. Use realistic 2025-2026 market data.\n\n';
    const msgs = (parsed.messages || []).map((m, i) => {
      // Sanitize roles — only user/assistant allowed for cloud models
      const role = (m.role === 'system' || m.role === 'tool') ? 'user' : m.role;
      if (i === 0 && role === 'user') return { role: 'user', content: SYSTEM_PREFIX + m.content };
      return { role, content: m.content };
    });
    if (msgs.length === 0) msgs.push({ role: 'user', content: SYSTEM_PREFIX });

    console.log(`[AI Proxy] Forwarding via callAI() (${msgs.length} msg, cloud=${AI_CONFIG.enabled}, ollama=${!!_ollamaAvailable})...`);
    try {
      const result = await callAI(msgs, { max_tokens: parsed.max_tokens || 4096, temperature: 1, top_p: 1, taskType: 'proxy' });
      if (!result) return respond(503, { error: { message: 'All AI models unavailable. Try again later.' } });
      console.log(`[AI Proxy] Done — 200 (source: ${result._source || 'cloud'})`);
      respond(200, JSON.stringify(result));
    } catch(e) {
      respond(502, { error: { message: 'AI error: ' + e.message } });
    }
  });
}



/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
const RATE_LIMIT_WINDOW = CONFIG.rateLimit.windowMs;
const RATE_LIMIT_MAX = CONFIG.rateLimit.maxRequests;
const ipRequests = new Map();

function rateLimiter(req, res) {
  const ip  = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (!ipRequests.has(ip)) ipRequests.set(ip, []);
  const timestamps = ipRequests.get(ip).filter(ts => now - ts < RATE_LIMIT_WINDOW);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many requests. Please try again in a minute.' }));
    return false;
  }
  timestamps.push(now);
  // FIX M7: Prune map to prevent memory leak
  if (timestamps.length > 0) ipRequests.set(ip, timestamps);
  else ipRequests.delete(ip);
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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
      return { ok: false, hardBlock: false, correction: `âš ï¸  Loop detected: "${toolName}" called ${count} times with identical args. Try a different search query, a different platform, or broader/narrower terms.` };
    }
    return { ok: true };
  }

  return { record };
}

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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

  // GLM-5.2 does not support system role â€” inject as prefix in first user message
  const agentSystemPrompt = `You are ECO, an elite AI business coach for solo Indian e-commerce sellers. You have real-time web scraping tools.

SELLER'S CURRENT INVENTORY: ${dbSummary}

AVAILABLE TOOLS (call ONE per turn as JSON):
${AGENT_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

TOOL CALL FORMAT (respond ONLY with this when using a tool):
{"tool": "tool_name", "args": {"key": "value"}}

RULES:
1. Always gather REAL data with tools before giving advice
2. Give specific numbers: "Buy at â‚¹X from IndiaMART â€” sell at â‚¹Y on Amazon = Z% margin"
3. If tool returns < 3 results, try different query/platform
4. After collecting data, give comprehensive sell/buy/profit analysis
5. Final answer: use emoji, â‚¹ symbols, and rank options bestâ€”worst profit\n\n`;

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

    // Call AI via callAI() â€” gets full 3-tier fallback (GLM â€” MiniMax â€” Ollama)
    let aiText = null;
    try {
      const aiResp = await callAI(messages, { temperature: 1, top_p: 1, max_tokens: 1500, taskType: 'agent_chat' });
      aiText = aiResp?.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      console.error('[Agent] AI error:', err.message);
      break;
    }

    if (!aiText) break;

    // Parse tool call
    const toolCall = parseToolCallFromText(aiText);

    if (!toolCall) {
      // Final answer!
      events.push({ type: 'answer', icon: 'âœ…', message: 'Final answer generated' });
      emit('final', { answer: aiText, toolsUsed, events, sources });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const { name: toolName, args: rawArgs } = toolCall;

    // Validate args
    const validated = validateToolArgs(toolName, rawArgs);
    if (!validated.ok) {
      const correction = { type: 'correction', icon: 'ðŸ› ï¸', message: `Correcting args for ${toolName}` };
      events.push(correction);
      emit('correction', correction);
      messages.push({ role: 'assistant', content: aiText });
      messages.push({ role: 'user', content: validated.correction });
      continue;
    }

    // Loop guard
    const guardResult = guard.record(toolName, validated.value);
    if (!guardResult.ok) {
      const ev = { type: 'loop_detected', icon: 'âš ï¸', message: guardResult.correction };
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
    const toolEv = { type: 'tool_call', icon: 'ðŸ”', message: `Searching with ${toolName}...`, tool: toolName, args: validated.value };
    events.push(toolEv);
    emit('tool_call', toolEv);
    toolsUsed.push(toolName);

    const toolResult = await executeAgentTool(toolName, validated.value, dbContext);
    const count = (toolResult.results || []).length;

    const resultEv = { type: 'tool_result', icon: 'ðŸ“¦', message: `${toolName}: found ${count} results`, tool: toolName, total: count, confidence: toolResult.confidence || 0 };
    events.push(resultEv);
    emit('tool_result', resultEv);

    // Collect sources
    (toolResult.results || []).filter(r => r.url).slice(0,3).forEach(r => sources.push({ url: r.url, name: r.name, platform: r.platform }));

    // Self-correction on low results
    if (count < 2 && !['calculate_profit','get_db_context'].includes(toolName)) {
      const altQuery = (validated.value.query || '').split(' ').slice(0,2).join(' ') || validated.value.category || '';
      const scEv = { type: 'self_correct', icon: 'ðŸ”„', message: `Only ${count} results. Will try broader search for: "${altQuery}"` };
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

  let finalText = 'âš ï¸  Could not generate final answer. Try a simpler question or check AI connectivity.';
  try {
    const postData = JSON.stringify({ messages, temperature: 0.6, max_tokens: 2000 });
    const apiKey   = AI_CONFIG.apiKey;
    const r = await new Promise((resolve, reject) => {
      const opts = {
        hostname: AI_CONFIG.host, path: AI_CONFIG.path, method: 'POST',
        headers: { 'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ((typeof cfg !== 'undefined' && cfg.apiKey) ? cfg.apiKey : (typeof key !== 'undefined' && key) ? key : (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.apiKey) ? AI_CONFIG.apiKey : (typeof AI_FALLBACK !== 'undefined' && AI_FALLBACK.apiKey) ? AI_FALLBACK.apiKey : ''),
          'Content-Length': Buffer.byteLength(postData) },
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */
function handleAgentTools(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ tools: AGENT_TOOLS, version: '2.3' }));
}

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') { console.error(`\n  âš¡ Port ${PORT} in use!\n`); process.exit(1); }
  console.error('[Server]', err.message);
});
process.on('uncaughtException', (e) => console.error('[Server] Uncaught:', e.message));
process.on('unhandledRejection', (r) => console.error('[Server] Unhandled:', r));


// â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
//  v2.5 â€” SQLite DB Handlers
// â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”


function jsonOk(res, data)  { res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(data)); }
function jsonErr(res, arg1, arg2 = 400) {
  let msg = arg1;
  let code = arg2;
  if (typeof arg1 === 'number') {
    code = arg1;
    msg = arg2;
  } else if (typeof arg2 === 'number') {
    msg = arg1;
    code = arg2;
  }
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error: String(msg) }));
}

function filterProductNames(items) {
  if (!Array.isArray(items)) return [];
  const NON_PRODUCT = /^(top\s|best\s|trending\s|popular\s|cheap\s|buy\s|shop\s|online\s|new\s|latest\s|review|guide|how to|what is|list of|\d+\s+best|\d+\s+top|products?$|items?$|goods?$|things?$|accessories$|supplies$|essentials$)/i;
  return items.filter(p => {
    const name = (p.name || '').trim();
    if (!name || name.length < 5) return false;
    if (NON_PRODUCT.test(name)) return false;
    if (name.split(/\s+/).length < 2) return false; // single word = category
    return true;
  });
};

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

async function handleDBGetSavedById(req, res, pathname) {
  try {
    const id = parseInt(pathname.split('/').pop());
    if (isNaN(id)) { jsonErr(res, 'Invalid ID', 400); return; }
    const db = getDB();
    const row = db.prepare('SELECT * FROM saved_products WHERE id = ?').get(id);
    if (!row) { jsonErr(res, 'Not found', 404); return; }
    // Normalize snake_case â€” camelCase for the frontend modal
    const item = {
      ...row,
      id:              row.id,
      name:            row.name,
      category:        row.category   || '',
      platform:        row.platform   || '',
      country:         row.country    || 'India',
      sp:              row.sp         || row.selling_price || 0,
      cp:              row.cp         || row.cost_price    || 0,
      sellingPrice:    row.sp         || row.selling_price || 0,
      costPrice:       row.cp         || row.cost_price    || 0,
      basePrice:       row.cp         || row.cost_price    || 0,
      currency:        row.currency   || 'INR',
      margin:          row.margin     || 0,
      demand:          row.demand     || 50,
      moq:             row.moq        || 50,
      source:          row.source     || '',
      note:            row.note       || '',
      pinned:          !!row.pinned,
      winnerScore:     row.winner_score    || 0,
      trendStatus:     row.trend_status    || 'active',
      savedAt:         row.saved_at        || row.created_at || new Date().toISOString(),
      updatedAt:       row.updated_at      || new Date().toISOString(),
      lastAutoRefresh: row.last_auto_refresh || null,
      // Supplier fields
      supplierName:      row.supplier_name      || '',
      supplierEmail:     row.supplier_email     || '',
      supplierPhone:     row.supplier_phone     || '',
      supplierWhatsApp:  row.supplier_whatsapp  || '',
      supplierMOQ:       row.supplier_moq       || row.moq || 50,
      supplierPrice:     row.supplier_price     || row.cp  || 0,
      supplierReliabilityScore: row.supplier_reliability_score || null,
    };
    jsonOk(res, item);
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

    // Hot-swap AI key if relevant so UI actions that save settings apply immediately
    try {
      if (body.key === 'nvidia_api_key') {
        const val = body.value ? String(body.value) : '';
        AI_CONFIG.apiKey = val;
        AI_CONFIG.enabled = val.length > 0;
        sharedConfig.apiKey = val;
        if (val.length > 0) {
          logger.info('Key', '✓ NVIDIA API key applied from settings endpoint');
          console.log('[Settings] Applied NVIDIA API key from /api/db/settings');
        } else {
          logger.info('Key', '✓ NVIDIA API key cleared via settings');
          console.log('[Settings] Cleared NVIDIA API key from /api/db/settings');
        }
      }
      if (body.key === 'minimax_api_key') {
        const val = body.value ? String(body.value) : '';
        AI_FALLBACK.apiKey = val;
        sharedConfig.fallbackApiKey = val;
        if (val.length > 0) {
          logger.info('Key', '✓ MiniMax API key applied from settings endpoint');
          console.log('[Settings] Applied MiniMax API key from /api/db/settings');
        } else {
          logger.info('Key', '✓ MiniMax API key cleared via settings');
          console.log('[Settings] Cleared MiniMax API key from /api/db/settings');
        }
      }
    } catch (e) {
      logger.warn('Key', 'Failed to apply key from settings endpoint', e);
    }

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

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Listing Generation via AI ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

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

  try {
    const messages = [{ role: 'user', content: prompt }];
    const aiResp = await callAI(messages, { max_tokens: 1200, temperature: 0.7, taskType: 'listing_generation' });
    const text = aiResp?.choices?.[0]?.message?.content || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch { return null; }
}

// Queue on save (2 platforms auto)
function queueListingGeneration(savedProductId, name, category, country) {
  if (!savedProductId || !name) return;
  const platforms = (country === 'India' || !country)
    ? ['Amazon India', 'Flipkart']
    : ['Amazon', 'eBay'];
  setTimeout(() => generateListingsForProduct(savedProductId, name, category, country, platforms), 5000);
}


// ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â
//  v2.5 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â PAGINATED TRENDING
// ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â

async function handleTrendingPage(req, res) {
  try {
    const body    = await readBody(req);
    const { query, country, category, page = 1, perPage = 20 } = body;
    const ctr     = country && country !== 'all' ? country : 'India';
    const tq      = category && category !== 'all'
      ? `trending best selling ${category} products 2025 ${ctr}`
      : `trending best selling products 2025 ${ctr}`;

    // Check cache first (only use if non-empty)
    const cached  = dbGetScrapeCache(tq, ctr, page, perPage);
    if (cached && cached.items && cached.items.length > 0) {
      console.log(`[Trending] Cache hit: page ${page}`);
      return jsonOk(res, cached);
    }

    const pageQuery = page > 1 ? `${tq} top products page ${page}` : tq;
    console.log(`[Trending] Parallel scrape+AI for page ${page}`);

    let items = [];
    try {
      const [scrapeResult, aiResult] = await Promise.allSettled([
        Promise.race([scrapeProducts(tq, ctr), new Promise((_, r) => setTimeout(() => r(new Error('scrape-timeout')), 40000))]),
        Promise.race([callAIForTrendingProducts(pageQuery, ctr, perPage, page), new Promise((_, r) => setTimeout(() => r(new Error('ai-timeout')), 30000))])
      ]);
      const liveItems = scrapeResult.status === 'fulfilled' ? (scrapeResult.value?.combined?.liveListings || []) : [];
      if (liveItems.length > 0) console.log(`[Trending] Scrape: ${liveItems.length} items`);
      const aiItems = (aiResult.status === 'fulfilled' && Array.isArray(aiResult.value)) ? aiResult.value : [];
      if (aiItems.length > 0) console.log(`[Trending] AI: ${aiItems.length} items`);
      const seen = new Set();
      for (const p of [...liveItems, ...aiItems]) {
        const key = (p.name||'').toLowerCase().trim();
        if (key.length > 3 && !seen.has(key)) { items.push(p); seen.add(key); }
      }
      if (items.length === 0) console.warn('[Trending] Both scrape and AI returned empty');
    } catch(err) { console.warn('[Trending] Fetch error:', err.message); }

    items = filterProductNames(items);
    const start   = (page - 1) * perPage;
    const slice   = items.slice(start, start + perPage);
    const hasMore = items.length > start + perPage || page < 10;
    const result  = { items: slice, hasMore, total: items.length, page, perPage };
    if (result.items.length > 0) dbSetScrapeCache(tq, ctr, page, perPage, result.items, result.hasMore, result.total);
    jsonOk(res, result);
  } catch(e) {
    console.error('[Trending Page] Error:', e);
    jsonErr(res, e.message, 500);
  }
}


async function callAIForTrendingProducts(query, country, count, page) {
  // Hard 30s timeout on entire AI chain for trending (don't block the page)
  const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error('AI trending timeout')), 30000));
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

  let resp = null;
  try {
    resp = await Promise.race([
      callAI([{ role: 'user', content: prompt }], { max_tokens: 1200, temperature: 0.9 }),
      timeoutP
    ]);
  } catch(te) {
    console.warn('[Trending AI] Timed out or failed:', te.message);
    return [];
  }
  try {
    const text = resp?.choices?.[0]?.message?.content || '';
    const arr  = text.match(/\[[\s\S]*\]/)?.[0];
    return arr ? JSON.parse(arr) : [];
  } catch { return []; }
}


// ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â
//  v2.5 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â PAGINATED SEARCH (exhaustive until no more results)
// ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â

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
      const scrapeRes = await scrapeProducts(query, ctr, page);
      const combined  = scrapeRes?.combined || {};
      const raw       = combined.liveListings || [];
      items           = raw;
      hasMore         = raw.length >= 10;
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

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ v2.5: Image Search Upload Handler ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
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
- If fewer truly relevant products exist, return fewer ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â do NOT pad with unrelated items

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



// ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â
//  v2.5 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â URL REVERSE LOOKUP
// ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â

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

  try {
    const messages = [{ role: 'user', content: prompt }];
    const aiResp = await callAI(messages, { max_tokens: 1000, temperature: 0.3, taskType: 'product_extraction' });
    const text = aiResp?.choices?.[0]?.message?.content || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch (e) {
    console.warn('[AI] extractProductFromPage failed:', e.message);
    return null;
  }
}


// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Deep Research: AIÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬ÂScraper Feedback Loop ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
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

    if (allProducts.length === 0) {
      console.log(`[DeepResearch] Scraping returned empty results. Using database fallback for category: ${category}, country: ${ctr}`);
      allProducts = dbGetProducts({ country: ctr === 'all' ? undefined : ctr, category: category === 'all' ? undefined : category, limit: 25 }) || [];
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

function startResearchWorkerLoop() {
  if (workerIntervalId) clearInterval(workerIntervalId);
  console.log('[Worker] Research worker initialized ✅');
  try { dbPruneTempTables(); } catch {}

  // Backoff state — resets on success
  let consecutiveFails = 0;
  const BASE_INTERVAL  = 180000;   // 3 min
  const MAX_INTERVAL   = 1800000;  // 30 min
  let nextRunAt        = Date.now() + BASE_INTERVAL;

  // Run discovery batch — with exponential backoff on failures
  workerIntervalId = setInterval(async () => {
    if (isServerSuspended) return;
    if (Date.now() < nextRunAt) return; // respect backoff

    try {
      const status = dbGetWorkerStatus();
      if (status.total < 1000) {
        console.log(`[Worker] Pool size ${status.total} is below 1000, launching discovery...`);
        const categories = ['fitness', 'electronics', 'kitchen', 'home', 'beauty', 'office', 'toys', 'pet'];
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const aiClient = new AIClient(AI_CONFIG);
        const minimaxClient = FALLBACK_API_KEY ? new AIClient(AI_FALLBACK) : null;

        runFullResearchCycle({
          aiClient,
          plannerSystemPrompt: PLANNER_SYSTEM_PROMPT,
          criticSystemPrompt: CRITIC_SYSTEM_PROMPT,
          minimaxClient,
          db: {
            insertRun: dbInsertRun,
            insertCandidates: dbInsertCandidates,
            upsertTempProducts: dbUpsertTempProducts,
            finishRun: dbFinishRun
          },
          scrapeFns,
          country: 'India',
          category: randomCategory,
          userQuery: null
        }).then(result => {
          console.log(`[Worker] Discovery cycle done. Total clustered: ${result.total_products}`);
          dbPruneTempTables();
          consecutiveFails = 0;
          nextRunAt = Date.now() + BASE_INTERVAL;
        }).catch(err => {
          consecutiveFails++;
          const backoffMs = Math.min(BASE_INTERVAL * Math.pow(2, consecutiveFails - 1), MAX_INTERVAL);
          nextRunAt = Date.now() + backoffMs;
          console.warn(`[Worker] Discovery cycle failed (attempt ${consecutiveFails}): ${err.message}. Backing off ${Math.round(backoffMs/60000)}min`);
        });
      } else {
        // Run deep research updates on queued or stale items
        const db = getDB();
        const staleProducts = db.prepare(`SELECT * FROM temp_trending_products
          WHERE status = 'queued' OR next_refresh_at < datetime('now')
          ORDER BY hero_score DESC LIMIT 5`).all() || [];

        if (staleProducts.length > 0) {
          console.log(`[Worker] Deep researching ${staleProducts.length} stale/queued products...`);
          deepResearchProducts({
            products: staleProducts,
            scrapeFns,
            maxItems: staleProducts.length
          }).then(enriched => {
            if (enriched.length > 0) {
              dbUpsertTempProducts(enriched);
              console.log(`[Worker] Deep research cycle done.`);
            }
            consecutiveFails = 0;
            nextRunAt = Date.now() + BASE_INTERVAL;
          }).catch(err => {
            consecutiveFails++;
            const backoffMs = Math.min(BASE_INTERVAL * Math.pow(2, consecutiveFails - 1), MAX_INTERVAL);
            nextRunAt = Date.now() + backoffMs;
            console.warn(`[Worker] Deep research failed (attempt ${consecutiveFails}): ${err.message}. Backing off ${Math.round(backoffMs/60000)}min`);
          });
        }
      }
    } catch (e) {
      consecutiveFails++;
      const backoffMs = Math.min(BASE_INTERVAL * Math.pow(2, consecutiveFails - 1), MAX_INTERVAL);
      nextRunAt = Date.now() + backoffMs;
      console.error(`[Worker] Error (attempt ${consecutiveFails}): ${e.message}. Backing off ${Math.round(backoffMs/60000)}min`);
    }
  }, 30000); // Poll every 30s, only runs when nextRunAt elapsed
}

// ---------------- Supplier Discovery Engine Initialization & Handlers ----------------
const supplierEngine = new SupplierDiscoveryEngine({
  db: getDB(),
  nimApiKey: PRIMARY_API_KEY,
  nimFallbackKey: FALLBACK_API_KEY
});
supplierEngine.init().then(() => console.log('[SupplierEngine] Initialized')).catch(e => console.warn('[SupplierEngine] Init Error:', e.message));

async function handleSupplierDiscover(req, res) {
  try {
    const body = await readBody(req);
    const { productName, category, geo, useLearning } = body;
    if (!productName || productName.length < 2) { jsonErr(res, 400, 'Product name required (min 2 chars)'); return; }
    const result = await supplierEngine.findSuppliers({ productName, category: category || '', geo: geo || 'India', useLearning: useLearning !== false });
    jsonOk(res, result);
  } catch (e) { console.error('Discovery error:', e); jsonErr(res, 500, e.message); }
}

async function handleSupplierProduct(req, res, reqUrl) {
  try {
    const name = reqUrl.searchParams.get('name');
    if (!name) { jsonErr(res, 400, 'Product name required'); return; }
    const suppliers = await supplierEngine.getSuppliersForProduct(name);
    jsonOk(res, suppliers);
  } catch (e) { jsonErr(res, 500, e.message); }
}

async function handleSupplierFeedback(req, res) {
  try {
    const body = await readBody(req);
    const { supplierId, feedback } = body;
    const result = await supplierEngine.submitFeedback(supplierId, feedback);
    jsonOk(res, result);
  } catch (e) { jsonErr(res, 500, e.message); }
}

async function handleSupplierAutoDiscover(req, res) {
  try {
    const db = getDB();
    const country = (new URL(req.url, 'http://localhost')).searchParams.get('country') || 'India';
    const trending = db.prepare
      ? db.prepare('SELECT name, category, country FROM temp_trending_products WHERE country = ? ORDER BY hero_score DESC LIMIT 50').all(country)
      : [];
    const results = await supplierEngine.learning.autoDiscover(trending);
    jsonOk(res, { scheduled: results.length, products: results });
  } catch (e) { jsonErr(res, 500, e.message); }
}


/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ E-COMMERCE HERO RESEARCH ORCHESTRATOR ROUTE HANDLERS ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */

const PLANNER_SYSTEM_PROMPT = `SYSTEM PROMPT: HERO PRODUCT RESEARCH ORCHESTRATOR

You are a strict, non-hallucinating e-commerce research orchestrator working inside a backend service.
Your job is NOT to invent product facts.
Your job is to:
1. plan search queries,
2. control scrapers,
3. normalize evidence,
4. rank products,
5. decide what to research next,
6. persist structured outputs,
7. keep refreshing high-value products in the background.

OPERATING MODE
- Output JSON only.
- Never output markdown.
- Never output explanations outside JSON.
- Never invent brands, prices, margins, ratings, demand, supplier names, or trend claims.
- If evidence is missing, set the field to null.
- If evidence is weak or conflicting, lower confidence and add a warning.
- Distinguish strictly between:
  - observed: found directly in scraper evidence
  - inferred: derived from observed evidence
  - unknown: no evidence available
- Any field not supported by evidence must be marked inferred or null.
- Ranking-critical fields must not be fabricated.

PRIMARY GOAL
Find ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œhero productsÃƒÂ¢Ã¢â€šÂ¬Ã‚Â:
- products likely to sell fast,
- with strong buyer demand,
- acceptable or good margin,
- manageable competition,
- repeat-buy or broad-market potential,
- low operational risk,
- stable sourcing.

SECONDARY GOAL
Keep background research continuously improving:
- discover broad candidate lists,
- cluster duplicates and variants,
- deep-research the best unresolved products,
- refresh stale high-ranked products,
- downgrade stale/unsupported products.

STRICT RULES
- Never return more than the requested limit.
- Never repeat near-duplicate products unless variant separation is explicitly required.
- Never use generic category names as final products unless no better canonical product can be formed.
- Prefer canonical product opportunities over raw scraped listings.
- Penalize products with low evidence count, volatile prices, single-source dependency, or policy risk.
- For broad user search queries, expand into multiple query intents by:
  - use case,
  - size,
  - material,
  - audience,
  - feature set,
  - price band,
  - market phrasing.
- Do not assume all high-margin products are good; prioritize sell-through and demand velocity.

WORKFLOW
You must produce ONE JSON object with these sections:
{
  "run_mode": "trending_seed" | "search_session" | "refresh_cycle",
  "planner": {
    "canonical_user_intent": string,
    "market_scope": {
      "country": string,
      "category": string|null
    },
    "query_intents": [
      {
        "intent_id": string,
        "intent_type": "broad" | "buyer_intent" | "variant" | "supplier" | "competition" | "trend_validation",
        "query": string,
        "must_have_attributes": [string],
        "negative_terms": [string],
        "target_sources": [string],
        "priority": integer,
        "reason": string
      }
    ]
  },
  "extraction_rules": {
    "canonical_product_key_formula": "normalized_title + brand + size + variant + material",
    "required_fields": [string],
    "nullable_fields": [string],
    "reject_if": [string]
  },
  "research_policy": {
    "deep_research_threshold": {
      "min_provisional_score": number,
      "min_evidence_count": integer
    },
    "refresh_policy": {
      "top_ranked_minutes": integer,
      "mid_ranked_minutes": integer,
      "low_ranked_minutes": integer
    },
    "retry_policy": {
      "max_retries": integer,
      "backoff_seconds": [integer]
    }
  },
  "ranking_model": {
    "formula_name": "hero_score_v1",
    "weights": {
      "demand_velocity": number,
      "search_intent_strength": number,
      "competition_gap": number,
      "supply_reliability": number,
      "margin_quality": number,
      "review_signal": number,
      "price_stability": number,
      "reorder_likelihood": number
    },
    "penalties": {
      "low_evidence": number,
      "single_source_dependency": number,
      "high_policy_risk": number,
      "volatile_pricing": number,
      "duplicate_cluster_uncertainty": number
    }
  },
  "next_actions": [
    {
      "action": "discover" | "deep_research" | "refresh" | "drop" | "merge_cluster",
      "target_id": string,
      "reason": string,
      "priority": integer
    }
  ],
  "guardrails": {
    "hallucination_risk": "low" | "medium" | "high",
    "unsupported_fields": [string],
    "notes": [string]
  }
}

SCORING PRINCIPLES
Use this ranking philosophy:
- strong current demand beats slightly higher margin,
- broad purchase intent beats novelty,
- stable supply beats fragile arbitrage,
- repeat purchase or gifting potential boosts score,
- weak evidence reduces confidence and rank.

FOR SEARCH PAGE
If user query is broad, decompose aggressively.
Example logic:
- ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œtumblerÃƒÂ¢Ã¢â€šÂ¬Ã‚Â becomes insulated tumbler, stainless steel tumbler, kids tumbler, office tumbler, gym tumbler, large tumbler, straw tumbler, gifting tumbler, premium tumbler, leakproof tumbler.
Do not output this example unless it matches the actual query.

FOR TRENDING PAGE
If no user query exists, create a country/category expansion strategy to discover large candidate pools across multiple categories and marketplaces, then prioritize deep research for the highest provisional opportunities.

FINAL OUTPUT
Return valid JSON only.`;

const CRITIC_SYSTEM_PROMPT = `SYSTEM PROMPT: HERO PRODUCT RANKING CRITIC

You are a strict critic reviewing a machine-generated ranked product list.
You must not invent any new facts.
You may only:
- detect unsupported claims,
- detect duplicates or variant collisions,
- detect suspicious ranks,
- suggest score adjustments,
- flag missing evidence.

Return JSON only:
{
  "bad_rows": [
    {
      "target_id": string,
      "issues": [string],
      "severity": "low" | "medium" | "high"
    }
  ],
  "merge_candidates": [
    {
      "left_id": string,
      "right_id": string,
      "reason": string
    }
  ],
  "score_adjustments": [
    {
      "target_id": string,
      "delta": number,
      "reason": string
    }
  ],
  "unsupported_fields": [
    {
      "target_id": string,
      "fields": [string]
    }
  ],
  "final_notes": [string]
}`;

class AIClient {
  constructor(config) {
    this.config = config;
  }

  async queryWithSystem(prompt, systemPrompt, options = {}) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];
    if (this.config.model.includes('glm') || this.config.model.includes('z-ai')) {
      messages[0] = {
        role: 'user',
        content: `System Instructions:\n${systemPrompt}\n\nUser Input:\n${prompt}`
      };
      messages.splice(1, 1);
    }
    const res = await callAIWithConfig(this.config, messages, options);
    return res?.choices?.[0]?.message?.content || '';
  }
}

function callAIWithConfig(cfg, messages, opts = {}) {
  // Delegate to callAI which has 3-tier fallback (GLM ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ MiniMax ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Ollama)
  return callAI(messages, {
    temperature: opts.temperature || 0.1,
    top_p: cfg.top_p || opts.top_p || 1,
    max_tokens: opts.max_tokens || 4000,
    taskType: opts.taskType || 'general',
  });
}

const scrapeFns = {
  search: async ({ query, source, limit }) => {
    try {
      const sr = await scrapeProducts(query, 'India');
      if (source === 'amazon') return sr.amazon || [];
      if (source === 'google_shopping') return sr.google || [];
      return sr.other || [];
    } catch (e) {
      return [];
    }
  },
  priceComparison: async ({ query }) => {
    try {
      const sr = await scrapeProducts(query, 'India');
      return [
        ...(sr.amazon || []),
        ...(sr.google || []),
        ...(sr.other || [])
      ];
    } catch (e) {
      return [];
    }
  },
  suppliers: async ({ query }) => {
    try {
      const res = await supplierEngine.findSuppliers({ productName: query, geo: 'India', useLearning: false });
      return (res.suppliers || []).map(s => ({ name: s.company_name || s.name, price: s.moq_price || s.price || 0, source: 'indiamart' }));
    } catch (e) {
      return [];
    }
  },
  competition: async ({ query }) => {
    try {
      const sr = await scrapeProducts(query, 'India');
      return [
        ...(sr.amazon || []),
        ...(sr.google || [])
      ].filter(x => x.sponsored);
    } catch (e) {
      return [];
    }
  }
};

async function handleResearchRunRoute(req, res) {
  try {
    const body = await readBody(req);
    const { country = 'India', category = 'all', userQuery = null } = body;
    const aiClient = new AIClient(AI_CONFIG);
    const minimaxClient = FALLBACK_API_KEY ? new AIClient(AI_FALLBACK) : null;

    runFullResearchCycle({
      aiClient,
      plannerSystemPrompt: PLANNER_SYSTEM_PROMPT,
      criticSystemPrompt: CRITIC_SYSTEM_PROMPT,
      minimaxClient,
      db: {
        insertRun: dbInsertRun,
        insertCandidates: dbInsertCandidates,
        upsertTempProducts: dbUpsertTempProducts,
        finishRun: dbFinishRun
      },
      scrapeFns,
      country,
      category,
      userQuery
    }).then(result => {
      console.log(`[Orchestrator] Completed research run ${result.run_id}`);
      dbPruneTempTables();
    }).catch(err => {
      console.error('[Orchestrator] Run error:', err);
    });

    jsonOk(res, { status: 'triggered', message: 'Cycle running in background' });
  } catch (e) {
    jsonErr(res, 500, e.message);
  }
}

async function handleResearchStatusRoute(req, res) {
  try {
    const status = dbGetWorkerStatus();
    jsonOk(res, status);
  } catch (e) {
    jsonErr(res, 500, e.message);
  }
}

async function handleTrendingFeedRoute(req, res, reqUrl) {
  try {
    const limit = parseInt(reqUrl.searchParams.get('limit')) || 20;
    const offset = parseInt(reqUrl.searchParams.get('offset')) || 0;
    const category = reqUrl.searchParams.get('category') || 'all';

    let items = dbGetRankedTempProducts({ limit, offset, category }) || [];
    if (items.length === 0 && offset === 0) {
      const seedProducts = dbGetProducts({ limit }) || [];
      items = seedProducts.map(p => ({
        product_id: 'seed_' + p.id,
        canonical_name: p.name,
        avg_price: p.supplierPrice || 0,
        currency: p.currency || 'INR',
        margin_quality: p.margin || 30,
        demand_velocity: p.demand || 50,
        competition_gap: p.competition === 'Low' ? 80 : p.competition === 'Medium' ? 50 : 20,
        hero_score: p.demand || 50,
        status: 'seed'
      }));
    }
    jsonOk(res, { items });
  } catch (e) {
    jsonErr(res, 500, e.message);
  }
}

async function handleSearchOpportunitiesRoute(req, res) {
  try {
    const body = await readBody(req);
    const { query, country = 'India', category = 'all' } = body;
    if (!query || query.length < 2) return jsonErr(res, 400, 'Query too short');

    const aiClient = new AIClient(AI_CONFIG);
    const minimaxClient = FALLBACK_API_KEY ? new AIClient(AI_FALLBACK) : null;

    console.log(`[SearchOpportunities] Start for query: "${query}"`);
    const result = await runFullResearchCycle({
      aiClient,
      plannerSystemPrompt: PLANNER_SYSTEM_PROMPT,
      criticSystemPrompt: CRITIC_SYSTEM_PROMPT,
      minimaxClient,
      db: {
        insertRun: dbInsertRun,
        insertCandidates: dbInsertCandidates,
        upsertTempProducts: dbUpsertTempProducts,
        finishRun: dbFinishRun
      },
      scrapeFns,
      country,
      category,
      userQuery: query
    });

    jsonOk(res, { items: result.top_products || [], total: result.total_products });
  } catch (e) {
    jsonErr(res, 500, e.message);
  }
}

async function handleResearchRefreshRoute(req, res) {
  try {
    const body = await readBody(req);
    const { productId } = body;
    if (!productId) return jsonErr(res, 400, 'productId required');

    const db = getDB();
    const p = db.prepare('SELECT * FROM temp_trending_products WHERE product_id = ?').get(productId);
    if (!p) return jsonErr(res, 404, 'Product not found');

    const enriched = await deepResearchProducts({
      products: [p],
      scrapeFns,
      maxItems: 1
    });

    if (enriched.length > 0) {
      dbUpsertTempProducts(enriched);
      jsonOk(res, { success: true, product: enriched[0] });
    } else {
      jsonOk(res, { success: false, message: 'No updates returned.' });
    }
  } catch (e) {
    jsonErr(res, 500, e.message);
  }
}

async function handleServerControl(req, res) {
  try {

    const body = await readBody(req);
    const { action } = body;

    if (action === 'stop') {
      console.log('[Server] Stop requested via UI. Suspending workers...');
      isServerSuspended = true;
      if (workerIntervalId) { clearInterval(workerIntervalId); workerIntervalId = null; }
      return jsonOk(res, { success: true, message: 'Server suspended', suspended: true });
    }

    if (action === 'start') {
      console.log('[Server] Start requested via UI. Resuming workers...');
      isServerSuspended = false;
      startResearchWorkerLoop();
      return jsonOk(res, { success: true, message: 'Server active', suspended: false });
    }

    if (action === 'restart') {
      // Soft in-process restart ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â works reliably on Windows without spawn/process.exit
      console.log('[Server] Soft-restart requested. Resetting workers...');
      isServerSuspended = false;
      if (workerIntervalId) { clearInterval(workerIntervalId); workerIntervalId = null; }
      setTimeout(() => {
        try { startResearchWorkerLoop(); } catch(e) { /* ignore */ }
        console.log('[Server] Soft-restart complete ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â workers restarted.');
      }, 800);
      return jsonOk(res, { success: true, message: 'Server soft-restarted successfully.' });
    }

    jsonErr(res, 'Invalid action', 400);
  } catch (e) {
    jsonErr(res, e.message, 500);
  }
}

function listenWithRetry(port, retries = 5, delay = 1000) {
  const srv = server.listen(port, () => {
    try {
      startResearchWorkerLoop();
    } catch (e) {
      console.error('[Worker] Start failed:', e.message);
    }
    // ── AI Gateway heartbeat (60s interval, checks GLM/MiniMax/Ollama)
    // gatewayConfig is imported from './src/intelligence-layer/ai-gateway.js' at top
    // It exports CONFIG from './src/config.js' — we update it synchronously here
    try {
      startHeartbeat(60000);
      console.log('[Server] AI Gateway heartbeat active (60s)');
    } catch (e) {
      console.warn('[Server] Gateway heartbeat start failed:', e.message);
    }
    console.log('');
    console.log('  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬â€');
    console.log('  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ   Solo E-Commerce Command Center ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Server v2.5  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ');
    console.log('  ÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â£');
    console.log(`  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ   Local:    http://localhost:${PORT}                  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ`);
    console.log(`  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ   AI:       NVIDIA ${'z-ai/glm-5.2 + minimax-m3'.padEnd(28)}ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ`);
    console.log('  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ   DB:       SQLite (eco.db) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â persistent         ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ');
    console.log('  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ   Scraper:  Crawlee (Amazon, Google, eBay, etc.) ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ');
    console.log('  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ   Cost:     100% FREE ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no API keys needed       ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ');
    console.log('  ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ   Stop:     Ctrl+C                               ÃƒÂ¢Ã¢â‚¬Â¢Ã¢â‚¬Ëœ');
    console.log('  ÃƒÂ¢Ã¢â‚¬Â¢Ã…Â¡ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â');
    console.log('');
  });

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      console.warn(`[Server] Port ${port} is busy. Retrying in ${delay}ms... (${retries} retries left)`);
      setTimeout(() => {
        listenWithRetry(port, retries - 1, delay);
      }, delay);
    } else {
      console.error('[Server] Fatal listen error:', err.message);
    }
  });
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Start ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
listenWithRetry(PORT);




