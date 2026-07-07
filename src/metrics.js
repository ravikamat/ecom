/* ============================================================
   Metrics Collection — Track performance metrics
   Monitors requests, response times, and error rates
   ============================================================ */

export class Metrics {
  constructor(windowSize = 100) {
    this.windowSize = windowSize;
    this.endpoints = new Map();
    this.startTime = Date.now();
  }

  recordRequest(endpoint, duration, statusCode, success = true) {
    if (!this.endpoints.has(endpoint)) {
      this.endpoints.set(endpoint, {
        requests: [],
        totalRequests: 0,
        totalErrors: 0,
        totalTime: 0,
      });
    }

    const metric = this.endpoints.get(endpoint);
    metric.requests.push({
      duration,
      statusCode,
      timestamp: Date.now(),
      success,
    });

    metric.totalRequests++;
    metric.totalTime += duration;
    if (!success) metric.totalErrors++;

    // Keep only recent requests
    if (metric.requests.length > this.windowSize) {
      metric.requests.shift();
    }
  }

  getSnapshot() {
    const snapshot = {
      uptime: Date.now() - this.startTime,
      memory: process.memoryUsage(),
      endpoints: {},
    };

    for (const [endpoint, data] of this.endpoints.entries()) {
      const requests = data.requests;
      if (requests.length === 0) continue;

      const durations = requests.map(r => r.duration);
      const errorCount = requests.filter(r => !r.success).length;

      snapshot.endpoints[endpoint] = {
        requests: data.totalRequests,
        errors: data.totalErrors,
        errorRate: ((errorCount / requests.length) * 100).toFixed(2) + '%',
        avgTime: (durations.reduce((a, b) => a + b) / durations.length).toFixed(2) + 'ms',
        minTime: Math.min(...durations) + 'ms',
        maxTime: Math.max(...durations) + 'ms',
        p95: this.getPercentile(durations, 0.95) + 'ms',
      };
    }

    return snapshot;
  }

  getPercentile(arr, p) {
    const sorted = arr.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  getEndpointStats(endpoint) {
    const data = this.endpoints.get(endpoint);
    if (!data) return null;

    const requests = data.requests;
    const durations = requests.map(r => r.duration);

    return {
      totalRequests: data.totalRequests,
      errors: data.totalErrors,
      errorRate: ((requests.filter(r => !r.success).length / requests.length) * 100).toFixed(2) + '%',
      avgTime: (durations.reduce((a, b) => a + b) / durations.length).toFixed(2) + 'ms',
      minTime: Math.min(...durations) + 'ms',
      maxTime: Math.max(...durations) + 'ms',
      recentRequests: requests.slice(-10),
    };
  }

  clear() {
    this.endpoints.clear();
    this.startTime = Date.now();
  }
}

export const metrics = new Metrics();
