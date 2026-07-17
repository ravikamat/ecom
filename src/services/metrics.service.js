import { metrics } from '../metrics.js';
import { searchCache } from '../cache.js';

export class MetricsService {
  static async getMetrics() {
    return metrics.getSnapshot();
  }

  static async getCacheStats() {
    return searchCache.getStats();
  }
}
