import { createHash } from 'crypto';

const API_KEYS = new Set([
  process.env.API_KEY_ADMIN,
  process.env.API_KEY_CLIENT,
].filter(Boolean));

export function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'API key required' });
  }

  const hashed = createHash('sha256').update(apiKey).digest('hex');
  const validHash = createHash('sha256').update(process.env.API_KEY_ADMIN || '').digest('hex');

  if (hashed !== validHash) {
    return res.status(403).json({ success: false, error: 'Invalid API key' });
  }

  next();
}
