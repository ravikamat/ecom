/**
 * Unified AI Gateway — ECO Command Center v3
 * 3-tier fallback: GLM-5.2 → MiniMax-M3 → Ollama Qwen 3.6 → Template fallback
 * Circuit breaker + heartbeat + prompt optimization + Semantic RAG integration
 */
import https from 'https';
import http from 'http';
import { CONFIG } from '../config.js';
import { semanticSearch } from '../infrastructure/semantic-search.js';
import { aiLogger } from '../infrastructure/logger.js';

// ── State ──
let healthStatus = { glm: 'unknown', minimax: 'unknown', ollama: 'unknown', lastCheck: null };
let circuitBreaker = { failures: 0, lastFailure: 0, state: 'CLOSED', threshold: 5, timeout: 60000 };
let heartbeatInterval = null;

export function compressPayloadSmart(text, maxChars = 8000) {
  if (!text || text.length <= maxChars) return text;
  // Strip comments, scripts, styles, and collapse white spaces
  let cleaned = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  
  if (cleaned.length <= maxChars) return cleaned;
  // Keep the beginning and end of the prompt instructions, crop the middle data
  const half = Math.floor(maxChars / 2);
  const startSegment = cleaned.substring(0, half);
  const endSegment = cleaned.substring(cleaned.length - half);
  return `${startSegment}\n\n... [Smart Truncation: ${cleaned.length - maxChars} characters removed for speed and stability] ...\n\n${endSegment}`;
}

// ── Configuration ──
const ENDPOINTS = {
  glm:     { host: 'integrate.api.nvidia.com', path: '/v1/chat/completions', model: 'z-ai/glm-5.2' },
  minimax: { host: 'integrate.api.nvidia.com', path: '/v1/chat/completions', model: 'minimaxai/minimax-m3' },
  ollama:  { host: '127.0.0.1', port: 11434, path: '/api/chat', model: 'qwen3:1.7b' },
};

// ── Heartbeat ──
export function startHeartbeat(intervalMs = 60000) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  checkAllProviders(); // immediate first check
  heartbeatInterval = setInterval(checkAllProviders, intervalMs);
  console.log(`[AIGateway] Heartbeat started (${intervalMs}ms)`);
}

export function stopHeartbeat() {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

async function checkAllProviders() {
  const checks = [
    pingProvider('glm',     { max_tokens: 1 }).then(ok => { healthStatus.glm     = ok ? 'up' : 'down'; }).catch(() => { healthStatus.glm     = 'down'; }),
    pingProvider('minimax', { max_tokens: 1 }).then(ok => { healthStatus.minimax  = ok ? 'up' : 'down'; }).catch(() => { healthStatus.minimax  = 'down'; }),
    pingOllama().then(ok =>                        { healthStatus.ollama   = ok ? 'up' : 'down'; }).catch(() => { healthStatus.ollama   = 'down'; }),
  ];
  await Promise.allSettled(checks);
  healthStatus.lastCheck = new Date().toISOString();
  console.log('[AIGateway] Health:', JSON.stringify(healthStatus));
}

function pingProvider(tier, payload) {
  return new Promise((resolve) => {
    const cfg    = ENDPOINTS[tier];
    const apiKey = tier === 'glm' ? CONFIG.apiKey : CONFIG.fallbackApiKey;
    if (!apiKey) return resolve(false);

    const postData = JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'hi' }], ...payload });
    const req = https.request({
      host: cfg.host, path: cfg.path, method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => resolve(res.statusCode < 500));
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
    req.write(postData); req.end();
  });
}

function pingOllama() {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: 11434, path: '/api/tags', method: 'GET' },
      (res) => resolve(res.statusCode === 200));
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// ── Circuit Breaker ──
function recordSuccess() { circuitBreaker.failures = 0; circuitBreaker.state = 'CLOSED'; }
function recordFailure() {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.state = 'OPEN';
    console.warn('[AIGateway] Circuit OPENED — cooling down for 60s');
    setTimeout(() => { circuitBreaker.state = 'HALF_OPEN'; console.log('[AIGateway] Circuit HALF_OPEN'); }, circuitBreaker.timeout);
  }
}

// ── Prompt Optimization ──
export async function preOptimizePrompt(rawPrompt, purpose = 'general') {
  if (healthStatus.ollama !== 'up' || !rawPrompt || rawPrompt.length < 500) return rawPrompt;
  const optimizerSystem = `You are a prompt compression engine. Keep ALL instructions and schemas. Remove fluff. Max 2000 tokens. Purpose: ${purpose}`;
  try {
    const result = await callOllamaRaw(
      [{ role: 'system', content: optimizerSystem }, { role: 'user', content: `Compress:\n${rawPrompt}` }],
      { temperature: 0.1, max_tokens: 2000 }
    );
    return result?.content || rawPrompt;
  } catch { return rawPrompt; }
}

// ── JSON Extraction helper ──
export function extractJSON(text) {
  if (!text) return '{}';
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const objMatch  = text.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  const arrMatch  = text.match(/\[[\s\S]*\]/);
  if (arrMatch) return arrMatch[0];
  return text.trim();
}

// ── Core Call Method ──
export async function callAI(messages, options = {}) {
  const { temperature = 0.7, max_tokens = 2048, response_format = null, purpose = 'general', prefer = null } = options;

  if (circuitBreaker.state === 'OPEN') {
    console.warn('[AIGateway] Circuit OPEN — forcing template fallback');
    return fallbackResponse(messages);
  }

  // Sanitize roles and smartly compress large payloads to prevent timeouts
  const sanitized = messages.map(m => ({
    role: (m.role === 'system' || m.role === 'tool') ? 'user' : m.role,
    content: compressPayloadSmart(String(m.content || ''), 8000),
  }));

  // Build tier order
  const tiers = prefer === 'ollama'
    ? ['ollama']
    : [
        ...(healthStatus.glm     === 'up' && CONFIG.apiKey         ? ['glm']     : []),
        ...(healthStatus.minimax === 'up' && CONFIG.fallbackApiKey ? ['minimax'] : []),
        ...(healthStatus.ollama  === 'up'                          ? ['ollama']  : []),
        'ollama', // always keep as final fallback
      ];
  const uniqueTiers = [...new Set(tiers)];

  let lastError = null;
  for (const tier of uniqueTiers) {
    try {
      const result = tier === 'ollama'
        ? await callOllamaRaw(sanitized, { temperature, max_tokens })
        : await callCloudRaw(tier, sanitized, { temperature, max_tokens, response_format });
      recordSuccess();
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`[AIGateway] ${tier} failed:`, err.message);
      if (tier !== 'ollama') recordFailure();
    }
  }

  console.error('[AIGateway] All AI tiers exhausted. Last error:', lastError?.message);
  return fallbackResponse(messages);
}

async function callCloudRaw(tier, messages, options) {
  const cfg    = ENDPOINTS[tier];
  const apiKey = tier === 'glm' ? CONFIG.apiKey : CONFIG.fallbackApiKey;
  if (!apiKey) throw new Error(`No API key for ${tier}`);

  const body = { model: cfg.model, messages, temperature: options.temperature, max_tokens: options.max_tokens };
  if (options.response_format) body.response_format = options.response_format;
  const postData = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request({
      host: cfg.host, path: cfg.path, method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) { reject(new Error(`${tier} HTTP ${res.statusCode}`)); return; }
        try {
          const parsed  = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content || '';
          if (!content) throw new Error(`Empty response from ${tier}`);
          resolve({ content, raw: parsed, tier });
        } catch (e) { reject(new Error(`${tier} parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(); reject(new Error(`${tier} timeout`)); });
    req.write(postData); req.end();
  });
}

async function callOllamaRaw(messages, options) {
  const postData = JSON.stringify({
    model: ENDPOINTS.ollama.model,
    messages,
    stream: false,
    options: { temperature: options.temperature, num_predict: Math.min(options.max_tokens || 2048, 1500) },
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: ENDPOINTS.ollama.host, port: ENDPOINTS.ollama.port, path: ENDPOINTS.ollama.path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed  = JSON.parse(data);
          const content = parsed.message?.content || '';
          if (!content) throw new Error('Empty Ollama response');
          resolve({ content, raw: parsed, tier: 'ollama' });
        } catch (e) { reject(new Error(`Ollama parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Ollama timeout')); });
    req.write(postData); req.end();
  });
}

function fallbackResponse(messages) {
  const text = messages.map(m => m.content).join(' ').toLowerCase();
  if (text.includes('product') && text.includes('detail'))
    return { content: JSON.stringify({ name: 'Unknown', price: 0, margin: 0, confidence: 'low' }), tier: 'template', fallback: true };
  if (text.includes('category') || text.includes('trend'))
    return { content: JSON.stringify({ categories: ['General', 'Electronics', 'Home'], confidence: 'low' }), tier: 'template', fallback: true };
  if (text.includes('supplier'))
    return { content: JSON.stringify({ suppliers: [], note: 'AI offline' }), tier: 'template', fallback: true };
  return { content: JSON.stringify({ error: 'All AI providers unavailable', fallback: true }), tier: 'template', fallback: true };
}

export function getHealthStatus() { return { ...healthStatus }; }
export function getCircuitState()  { return { ...circuitBreaker }; }

// ── RAG-Enhanced AI Gateway Class ──
export class AIGateway {
  constructor() {
    this.circuitBreaker = circuitBreaker;
    this.tiers = [
      { name: 'GLM-5.2', priority: 1 },
      { name: 'MiniMax-M3', priority: 2 },
      { name: 'Local-Qwen', priority: 3 },
    ];
  }

  async callWithRAG(prompt, context = {}, options = {}) {
    let relevantDocs = [];
    try {
      if (context.query) {
        relevantDocs = await semanticSearch.searchProducts(context.query, 5);
      } else if (context.productId) {
        relevantDocs = await semanticSearch.findSimilarProducts(context.productId, 5);
      }
    } catch (err) {
      aiLogger.warn('Semantic search failed, proceeding without RAG');
    }

    const contextBlock = relevantDocs.length > 0
      ? `RELEVANT CONTEXT:\n${relevantDocs.map(d => `- ${d.name} (${d.category}): Margin ${d.margin}%, Demand ${d.demand}`).join('\n')}\n\n`
      : '';

    const groundedPrompt = `${contextBlock}USER QUERY: ${prompt}\n\nRespond with valid JSON only.`;

    return this.executeWithFallback(groundedPrompt, options);
  }

  async executeWithFallback(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];
    const response = await callAI(messages, options);
    const jsonText = extractJSON(response.content);
    try {
      return JSON.parse(jsonText);
    } catch (e) {
      aiLogger.error('[AIGateway] JSON extraction or parsing failed, returning string representation');
      return { raw: response.content };
    }
  }
}
