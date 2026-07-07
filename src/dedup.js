/* ============================================================
   Request Deduplication — Prevent duplicate API calls
   If same request is pending, wait for it instead of re-running
   ============================================================ */

export class RequestDedup {
  constructor() {
    this.pending = new Map();
    this.stats = {
      deduplicated: 0,
      executed: 0,
    };
  }

  async deduplicate(key, fn) {
    // If request is already pending, wait for it
    if (this.pending.has(key)) {
      this.stats.deduplicated++;
      return this.pending.get(key);
    }

    // Otherwise start new request
    const promise = fn();
    this.pending.set(key, promise);

    try {
      const result = await promise;
      this.stats.executed++;
      return result;
    } finally {
      this.pending.delete(key);
    }
  }

  getStats() {
    return {
      ...this.stats,
      pending: this.pending.size,
    };
  }

  clear() {
    this.pending.clear();
    this.stats = { deduplicated: 0, executed: 0 };
  }
}

export const dedup = new RequestDedup();
