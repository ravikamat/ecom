/**
 * ECO Command Center — Shared Configuration
 * Imported by both server.js and ai-gateway.js to avoid circular deps.
 */
export const CONFIG = {
  port: parseInt(process.env.PORT) || 3000,
  ai: {
    host: 'integrate.api.nvidia.com',
    path: '/v1/chat/completions',
    primary: { model: 'z-ai/glm-5.2', temperature: 0.7, maxTokens: 4096 },
    fallback: { model: 'minimaxai/minimax-m3', temperature: 1, maxTokens: 4096, topP: 0.95 },
    timeout: 45000,
  },
  agent: { maxTurns: 8, maxTokens: 1500, timeout: 30000 },
  scraper: { maxConcurrent: 3, timeout: 50000, maxPages: 50, requestDelay: 1000 },
  rateLimit: { windowMs: 60000, maxRequests: 30 },
  cache: { ttlMs: 3600000 },
  // These are mutable — loaded from DB at startup
  apiKey: process.env.NVIDIA_API_KEY || '',
  fallbackApiKey: process.env.MINIMAX_API_KEY || '',
};
