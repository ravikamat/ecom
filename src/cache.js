/* ============================================================
   Smart Caching Layer — In-memory cache with TTL
   Dramatically reduces repeat searches and API calls
   ============================================================ */

export class CacheManager {
  constructor(ttlMs = 3600000, maxSize = 1000) {
    this.cache = new Map();
    this.ttl = ttlMs;
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
  }

  generateKey(query, country) {
    return `${country.toLowerCase()}:${query.toLowerCase()}`;
  }

  get(query, country) {
    const key = this.generateKey(query, country);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Hit! Update access time
    entry.lastAccess = Date.now();
    entry.accessCount++;
    this.hits++;
    
    return entry.data;
  }

  set(query, country, data) {
    const key = this.generateKey(query, country);
    
    // Implement LRU: if cache is full, remove least recently used
    if (this.cache.size >= this.maxSize) {
      let lruKey = null;
      let lruTime = Date.now();
      
      for (const [k, v] of this.cache.entries()) {
        if (v.lastAccess < lruTime) {
          lruTime = v.lastAccess;
          lruKey = k;
        }
      }
      
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      accessCount: 0,
    });
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(2) : '0.00';
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: hitRate + '%',
      totalRequests: total,
    };
  }

  getSize() {
    return this.cache.size;
  }

  getCapacityPercent() {
    return ((this.cache.size / this.maxSize) * 100).toFixed(2);
  }
}

export const searchCache = new CacheManager(3600000, 1000); // 1 hour TTL, 1000 items max
