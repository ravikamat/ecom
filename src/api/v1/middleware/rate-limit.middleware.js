import Redis from 'ioredis';

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
const memoryStore = new Map();

export function rateLimit({ windowMs = 60000, maxRequests = 100 } = {}) {
  return async (req, res, next) => {
    const clientId = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `rate_limit:${clientId}:${req.path}`;

    try {
      let current;

      if (redis) {
        current = await redis.incr(key);
        if (current === 1) await redis.pexpire(key, windowMs);
      } else {
        const now = Date.now();
        const entry = memoryStore.get(key);
        if (!entry || now > entry.resetTime) {
          memoryStore.set(key, { count: 1, resetTime: now + windowMs });
          current = 1;
        } else {
          entry.count++;
          current = entry.count;
        }
      }

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));

      if (current > maxRequests) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(windowMs / 1000),
        });
      }

      next();
    } catch (err) {
      // Fail open if Redis is down
      next();
    }
  };
}
