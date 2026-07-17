/* ============================================================
   ECO Agent Engine — v2.3
   Self-correcting AI agent with tool-calling loop
   Implements toolcall-guard pattern natively in Node.js
   ============================================================ */

import { spawn } from 'node:child_process';
import crypto     from 'node:crypto';

// ─── Tool Definitions (JSON Schema for AI) ────────────────────
const TOOL_DEFINITIONS = [
  {
    name: 'search_products',
    description: 'Search e-commerce selling platforms (Amazon India, Flipkart, Meesho, Google Shopping) for products. Use this to find current market prices, competition level, and where a product is selling well.',
    parameters: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Product name or keywords to search for' },
        platform:   { type: 'string', enum: ['amazon', 'flipkart', 'meesho', 'google', 'all'], description: 'Which platform to search' },
        maxResults: { type: 'integer', description: 'Max results to return (default 10, max 30)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_suppliers',
    description: 'Find product suppliers and manufacturers on sourcing platforms: IndiaMART, Alibaba, TradeIndia, JustDial. Use to find where to buy products cheaply to maximize profit margins.',
    parameters: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Product name to find suppliers for' },
        platform:   { type: 'string', enum: ['indiamart', 'alibaba', 'tradeindia', 'justdial', 'all'], description: 'Which supplier platform' },
        maxResults: { type: 'integer', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_price_comparison',
    description: 'Get current selling prices of a product across all major Indian e-commerce platforms simultaneously. Returns price range, average, and which platform has the highest/lowest prices.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product name to compare prices for' },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_competition',
    description: 'Analyze competition level for a product on Amazon and Flipkart. Returns number of sellers, price range, average rating, top competitor details.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product name to check competition for' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_trending_products',
    description: 'Get trending or best-selling products in a category right now. Returns top 20 best sellers with rank, price, and product details.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category to get trending products for (e.g. electronics, fitness, beauty, clothing, kitchen, toys)' },
      },
      required: ['category'],
    },
  },
  {
    name: 'analyze_product_url',
    description: 'Deep analyze a specific product page URL to extract full details: name, price, rating, reviews, description, BSR rank, seller info.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL of product page to analyze' },
      },
      required: ['url'],
    },
  },
  {
    name: 'calculate_profit',
    description: 'Calculate profit margins and financial metrics for a product given cost price, selling price, platform, and additional costs.',
    parameters: {
      type: 'object',
      properties: {
        costPrice:       { type: 'number', description: 'Your buying/cost price in INR' },
        sellingPrice:    { type: 'number', description: 'Target selling price in INR' },
        platform:        { type: 'string', description: 'Platform to sell on (amazon, flipkart, meesho, etc.)' },
        shippingCost:    { type: 'number', description: 'Shipping cost per unit in INR' },
        packagingCost:   { type: 'number', description: 'Packaging cost per unit in INR' },
        monthlyQuantity: { type: 'integer', description: 'Expected monthly sales quantity' },
      },
      required: ['costPrice', 'sellingPrice'],
    },
  },
  {
    name: 'get_db_context',
    description: 'Read user\'s saved products and inventory from their local database. Use this to get context about what they are selling, their current stock, margins, and product history.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Number of products to fetch (default all)' },
        sortBy: { type: 'string', enum: ['margin', 'date', 'price', 'name'], description: 'Sort order' },
      },
    },
  },
];

// ─── Self-Correcting Tool Call Guard ─────────────────────────
class ToolCallGuard {
  constructor({ windowSize = 10, threshold = 3, maxCorrections = 2 } = {}) {
    this.window        = [];
    this.windowSize    = windowSize;
    this.threshold     = threshold;
    this.maxCorrections = maxCorrections;
    this.corrections   = 0;
  }

  _hash(toolName, args) {
    const payload = JSON.stringify({ t: toolName, a: args }, Object.keys(args || {}).sort());
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
  }

  record(toolName, args) {
    const sig = this._hash(toolName, args);
    this.window.push(sig);
    if (this.window.length > this.windowSize) this.window.shift();

    const count = this.window.filter(s => s === sig).length;

    if (count >= this.threshold) {
      this.corrections++;
      if (this.corrections > this.maxCorrections) {
        return {
          ok:         false,
          hardBlock:  true,
          correction: `I have been calling tool "${toolName}" with the same arguments ${count} times with no progress. I should stop and give the user the best answer I can with the data already collected.`,
        };
      }
      return {
        ok:         false,
        hardBlock:  false,
        correction: `⚠️ Loop detected: You called tool "${toolName}" with the same arguments ${count} times. Try a different approach — change the query, use a different platform, or synthesize an answer from the data you already have.`,
      };
    }
    return { ok: true };
  }

  reset() {
    this.window      = [];
    this.corrections = 0;
  }
}

// ─── Tool Argument Validator (toolcall-guard pattern) ────────
function validateAndRepairArgs(toolName, rawArgs) {
  const schema = TOOL_DEFINITIONS.find(t => t.name === toolName)?.parameters;
  if (!schema) return { ok: false, value: null, correction: `Unknown tool: ${toolName}` };

  // Try to parse if it's a string
  let args = rawArgs;
  if (typeof args === 'string') {
    // Strip markdown fences
    args = args.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    try { args = JSON.parse(args); } catch { args = {}; }
  }

  if (!args || typeof args !== 'object') args = {};

  const repairs   = [];
  const result    = {};
  const errors    = [];
  const props     = schema.properties || {};
  const required  = schema.required   || [];

  // Process each property
  for (const [key, def] of Object.entries(props)) {
    let val = args[key];

    if (val === undefined || val === null) {
      if (required.includes(key)) {
        errors.push(`Missing required field "${key}" (type: ${def.type}${def.description ? ' — ' + def.description : ''})`);
      }
      continue;
    }

    // Type coercion
    if (def.type === 'integer' && typeof val === 'string') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) { repairs.push(`"${key}" coerced from string to integer`); val = parsed; }
      else { errors.push(`Field "${key}" must be integer, got string "${val}"`); continue; }
    }

    if (def.type === 'number' && typeof val === 'string') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) { repairs.push(`"${key}" coerced from string to number`); val = parsed; }
      else { errors.push(`Field "${key}" must be number, got string "${val}"`); continue; }
    }

    if (def.type === 'boolean' && typeof val === 'string') {
      if (['true','yes','1'].includes(val.toLowerCase()))  { val = true;  repairs.push(`"${key}" coerced to true`); }
      if (['false','no','0'].includes(val.toLowerCase())) { val = false; repairs.push(`"${key}" coerced to false`); }
    }

    // Enum normalization
    if (def.enum && typeof val === 'string') {
      const normalized = def.enum.find(e => e.toLowerCase() === val.toLowerCase());
      if (normalized && normalized !== val) { repairs.push(`"${key}" enum normalized`); val = normalized; }
      else if (!def.enum.includes(val)) {
        // Find closest
        const closest = def.enum[0];
        repairs.push(`"${key}" invalid enum "${val}" → defaulted to "${closest}"`);
        val = closest;
      }
    }

    result[key] = val;
  }

  if (errors.length > 0) {
    return {
      ok: false, value: null, repairs,
      correction: `The call to tool \`${toolName}\` had invalid arguments.\nFix the following and call \`${toolName}\` again:\n\n${errors.map(e => '- ' + e).join('\n')}\n\nRespond ONLY with a corrected tool call.`,
    };
  }

  return { ok: true, value: result, repairs, correction: '' };
}

// ─── Python Scraper Bridge ────────────────────────────────────
async function runPythonScraper(script, params, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const cmd  = 'python';
    const args = [script];
    const input = JSON.stringify(params);

    const child = spawn(cmd, args, { cwd: process.cwd() });
    let stdout = '', stderr = '';
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        resolve({ success: false, error: `Timeout after ${timeoutMs}ms`, results: [], source: 'timeout' });
      }
    }, timeoutMs);

    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());

    child.stdin.write(input);
    child.stdin.end();

    child.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);

      try {
        const data = JSON.parse(stdout.trim());
        return resolve(data);
      } catch (err) {
        console.error('[Bridge] Parse error:', err.message, '\nStderr:', stderr.slice(0, 500));
        resolve({ success: false, error: 'Python script output parse error: ' + stderr.slice(0, 200), results: [] });
      }
    });

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({ success: false, error: 'Python bridge error: ' + err.message, results: [] });
    });
  });
}

// ─── Tool Executor ─────────────────────────────────────────────
async function executeTool(toolName, args, dbContextFn) {
  console.log(`[Agent] Executing tool: ${toolName}`, args);

  switch (toolName) {

    case 'search_products':
      return runPythonScraper('scrapers/scrapling_agent.py', {
        task:       'search_products',
        query:      args.query,
        platform:   args.platform || 'all',
        maxResults: args.maxResults || 10,
        country:    'India',
      });

    case 'find_suppliers': {
      // Run Scrapling + Scrapy in parallel for max coverage
      const [scrapling, scrapy] = await Promise.allSettled([
        runPythonScraper('scrapers/scrapling_agent.py', {
          task:       'find_suppliers',
          query:      args.query,
          platform:   args.platform || 'all',
          maxResults: args.maxResults || 10,
        }),
        runPythonScraper('scrapers/run_spider.py', {
          spider:   args.platform === 'justdial' ? 'justdial' : 'indiamart',
          query:    args.query,
          maxItems: args.maxResults || 10,
        }),
      ]);

      const r1 = scrapling.status === 'fulfilled' ? scrapling.value : { results: [] };
      const r2 = scrapy.status    === 'fulfilled' ? scrapy.value    : { results: [] };

      const combined = [...(r1.results || []), ...(r2.results || [])];
      return {
        success:    combined.length > 0,
        task:       'find_suppliers',
        query:      args.query,
        results:    combined,
        total:      combined.length,
        sources:    [r1.source, r2.source].filter(Boolean),
        confidence: Math.min(1.0, combined.length / 5),
        scrapedAt:  new Date().toISOString(),
      };
    }

    case 'get_price_comparison':
      return runPythonScraper('scrapers/scrapling_agent.py', {
        task:  'get_price_comparison',
        query: args.query,
      });

    case 'check_competition':
      return runPythonScraper('scrapers/scrapling_agent.py', {
        task:  'check_competition',
        query: args.query,
      });

    case 'get_trending_products':
      return runPythonScraper('scrapers/scrapling_agent.py', {
        task:     'get_trending',
        query:    args.category,
        category: args.category,
        platform: 'amazon',
      });

    case 'analyze_product_url':
      return runPythonScraper('scrapers/scrapling_agent.py', {
        task: 'analyze_url',
        url:  args.url,
        query: '',
      });

    case 'calculate_profit': {
      const { costPrice, sellingPrice, shippingCost = 0, packagingCost = 0, monthlyQuantity = 50 } = args;
      const platform      = (args.platform || 'amazon').toLowerCase();
      const commissionMap = { amazon: 0.15, flipkart: 0.10, meesho: 0.08, ebay: 0.12, shopify: 0.02 };
      const commission    = commissionMap[platform] || 0.15;
      const revenue       = sellingPrice;
      const totalCost     = costPrice + shippingCost + packagingCost + (revenue * commission);
      const profit        = revenue - totalCost;
      const margin        = (profit / revenue) * 100;
      const roi           = (profit / costPrice) * 100;
      return {
        success: true,
        task:    'calculate_profit',
        results: [{
          costPrice, sellingPrice, platform,
          commission:          +(revenue * commission).toFixed(2),
          commissionRate:      (commission * 100) + '%',
          shippingCost, packagingCost,
          totalCost:           +totalCost.toFixed(2),
          profit:              +profit.toFixed(2),
          marginPercent:       +margin.toFixed(1),
          roiPercent:          +roi.toFixed(1),
          monthlyProfit:       +(profit * monthlyQuantity).toFixed(2),
          monthlyRevenue:      +(revenue * monthlyQuantity).toFixed(2),
          viable:              margin > 15,
          recommendation:      margin > 30 ? '🟢 Excellent margin' : margin > 15 ? '🟡 Acceptable' : '🔴 Low margin — negotiate cost or raise price',
        }],
      };
    }

    case 'get_db_context': {
      if (typeof dbContextFn === 'function') {
        const data = await dbContextFn();
        return { success: true, task: 'get_db_context', results: data };
      }
      return { success: false, error: 'DB context not available', results: [] };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}`, results: [] };
  }
}

// ─── Core Agent Loop ──────────────────────────────────────────
export async function runAgentLoop({ message, history, dbContextFn, aiProxyUrl, apiKey, onEvent }) {
  const guard      = new ToolCallGuard({ windowSize: 10, threshold: 3, maxCorrections: 2 });
  const maxTurns   = 8; // max AI turns before forced answer
  let   turns      = 0;

  // Helper to emit events to client (for streaming UI)
  const emit = (type, data) => { if (typeof onEvent === 'function') onEvent({ type, ...data }); };

  // Build conversation history
  const messages = [
    {
      role:    'system',
      content: `You are ECO, an expert AI business advisor for solo Indian e-commerce sellers. You have access to tools that can:
- Search Amazon, Flipkart, Meesho, Google Shopping for products and prices
- Find suppliers on IndiaMART, Alibaba, JustDial, TradeIndia
- Analyze competition and market trends
- Calculate profit margins and ROI

Your goal is to give the seller the most profitable, actionable advice. Always:
1. Use tools to gather REAL current data before answering
2. Give specific numbers: "Buy at ₹X from IndiaMART, sell at ₹Y on Amazon → Z% margin"
3. Rank options from best to worst profit opportunity
4. Mention risks and timing (seasonal demand, competition level)
5. If a tool returns few results (< 3), try again with a different query or platform

Available tools: ${TOOL_DEFINITIONS.map(t => t.name).join(', ')}

Always respond in one of two ways:
A) JSON tool call: {"tool": "tool_name", "args": {...}}
B) Final answer in plain conversational text (when you have enough data)

When giving final answer, format it clearly with emojis and ₹ symbols. Be specific and actionable.`,
    },
    ...(history || []),
    { role: 'user', content: message },
  ];

  emit('thinking', { message: 'Analyzing your question...' });

  // Tool call format for NVIDIA GLM-5.2
  const toolPromptSuffix = `\n\nAvailable tools (call ONE at a time as JSON):
${TOOL_DEFINITIONS.map(t => `- ${t.name}: ${t.description.slice(0, 80)}`).join('\n')}

To call a tool, respond with ONLY: {"tool": "tool_name", "args": {<valid args>}}
To give final answer, respond with plain text.`;

  messages[messages.length - 1].content += toolPromptSuffix;

  while (turns < maxTurns) {
    turns++;

    // Call AI
    const aiResponse = await callAI(messages, aiProxyUrl, apiKey);
    if (!aiResponse) {
      return { answer: '⚠️ AI unavailable. Please start the server with: node server.js', toolsUsed: [] };
    }

    const rawContent = aiResponse.trim();

    // Try to parse as tool call
    const toolCall = parseToolCall(rawContent);

    if (!toolCall) {
      // It's a final answer
      emit('answer', { text: rawContent });
      return { answer: rawContent, toolsUsed: [] };
    }

    const { name: toolName, args: rawArgs } = toolCall;

    // 1. Validate & repair args (toolcall-guard pattern)
    const validated = validateAndRepairArgs(toolName, rawArgs);
    if (!validated.ok) {
      // Inject correction message and retry
      emit('correction', { message: `Correcting tool call args for ${toolName}...` });
      messages.push({ role: 'assistant', content: rawContent });
      messages.push({ role: 'system',    content: validated.correction });
      continue;
    }

    // 2. Loop detection
    const guardResult = guard.record(toolName, validated.value);
    if (!guardResult.ok) {
      emit('loop_detected', { message: guardResult.correction });
      messages.push({ role: 'assistant', content: rawContent });
      messages.push({ role: 'system',    content: guardResult.correction });
      if (guardResult.hardBlock) {
        // Force final answer
        messages.push({ role: 'user', content: 'Please give me your best answer now based on what you know.' });
      }
      continue;
    }

    // 3. Execute tool
    emit('tool_call', { tool: toolName, args: validated.value, status: 'running' });
    const toolResult = await executeTool(toolName, validated.value, dbContextFn);
    emit('tool_result', { tool: toolName, total: toolResult.total || toolResult.results?.length || 0, confidence: toolResult.confidence });

    // 4. Self-correction if data quality is low
    const resultCount = (toolResult.results || []).length;
    if (resultCount < 2 && toolName !== 'calculate_profit' && toolName !== 'get_db_context') {
      const altQuery = generateAlternativeQuery(validated.value.query || '', toolName);
      emit('self_correct', { message: `Low results (${resultCount}). Trying alternate query: "${altQuery}"` });

      // Add correction hint
      messages.push({ role: 'assistant', content: rawContent });
      messages.push({
        role:    'tool',
        content: JSON.stringify({
          ...toolResult,
          hint:  `Only ${resultCount} results found. Consider: 1) trying query "${altQuery}", 2) using platform "all", 3) checking if the product name needs variation`,
        }),
      });
      continue;
    }

    // 5. Add tool result to conversation
    const toolSummary = summarizeToolResult(toolName, toolResult);
    messages.push({ role: 'assistant', content: rawContent });
    messages.push({ role: 'tool',      content: JSON.stringify(toolResult) });
    messages.push({
      role:    'system',
      content: `Tool "${toolName}" returned ${resultCount} results. ${toolSummary}. Now analyze this data and either call another tool if needed, or provide your final comprehensive answer to the user.`,
    });
  }

  // Force final answer after maxTurns
  emit('thinking', { message: 'Synthesizing final answer...' });
  messages.push({ role: 'user', content: 'Please provide your final comprehensive answer based on all the data collected so far.' });
  const finalAnswer = await callAI(messages, aiProxyUrl, apiKey);
  return { answer: finalAnswer || 'I gathered data but could not generate a final summary. Please try again.', toolsUsed: [] };
}

// ─── Helpers ──────────────────────────────────────────────────

async function callAI(messages, proxyUrl, apiKey) {
  try {
    const response = await fetch(proxyUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages, temperature: 0.6, max_tokens: 2048 }),
      signal:  AbortSignal.timeout(30000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.content || data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[Agent] AI call failed:', err.message);
    return null;
  }
}

function parseToolCall(text) {
  // Try direct JSON parse
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed  = JSON.parse(cleaned);
    if (parsed.tool && typeof parsed.tool === 'string') {
      return { name: parsed.tool, args: parsed.args || parsed.arguments || parsed.parameters || {} };
    }
  } catch {}

  // Try to extract JSON from text
  const match = text.match(/\{[^{}]*"tool"\s*:\s*"([^"]+)"[^{}]*\}/s);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return { name: parsed.tool, args: parsed.args || parsed.arguments || {} };
    } catch {}
  }

  return null; // It's a plain text final answer
}

function generateAlternativeQuery(originalQuery, toolName) {
  const words = originalQuery.split(' ');
  if (words.length > 2) return words.slice(0, 2).join(' ');
  if (words.length === 1 && toolName === 'find_suppliers') return originalQuery + ' wholesale';
  return originalQuery + ' india';
}

function summarizeToolResult(toolName, result) {
  const n = (result.results || []).length;
  if (n === 0) return 'No results found';

  if (toolName === 'search_products' || toolName === 'get_price_comparison') {
    const prices = result.results.filter(r => r.price).map(r => r.price);
    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return `Price range: ₹${min} – ₹${max} across ${n} products`;
    }
  }

  if (toolName === 'find_suppliers') {
    return `Found ${n} suppliers on platforms: ${result.sources?.join(', ') || 'multiple'}`;
  }

  if (toolName === 'check_competition') {
    return `Found ${n} competing products`;
  }

  return `${n} results returned`;
}

export { TOOL_DEFINITIONS, ToolCallGuard, validateAndRepairArgs, executeTool };
