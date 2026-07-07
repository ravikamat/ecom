/* ============================================================
   Health Check System — Monitor system health & dependencies
   Checks database, API key, memory, and provides metrics
   ============================================================ */

import { getDB } from '../db/sqlite.js';

export class HealthCheck {
  constructor() {
    this.lastCheck = null;
    this.checkInterval = 30000; // 30 seconds
  }

  async check() {
    const startTime = Date.now();
    
    const checks = {
      database: await this.checkDatabase(),
      memory: this.checkMemory(),
      uptime: process.uptime(),
    };

    const checkTime = Date.now() - startTime;
    const allHealthy = Object.values(checks).every(c => c.status === 'ok' || c.status === 'ok');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      responseTime: checkTime + 'ms',
    };
  }

  async checkDatabase() {
    try {
      const db = getDB();
      if (!db) {
        return { status: 'error', message: 'Database not initialized' };
      }

      const startTime = Date.now();
      const result = db.prepare('SELECT 1 as ok').all();
      const queryTime = Date.now() - startTime;

      if (!result || result.length === 0) {
        return { status: 'error', message: 'Query returned no results' };
      }

      return {
        status: 'ok',
        queryTime: queryTime + 'ms',
        message: 'Database is responsive',
      };
    } catch (err) {
      return {
        status: 'error',
        message: err.message,
        error: err.code,
      };
    }
  }

  checkMemory() {
    const mem = process.memoryUsage();
    const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;

    let status = 'ok';
    if (heapUsedPercent > 90) {
      status = 'error';
    } else if (heapUsedPercent > 75) {
      status = 'warning';
    }

    return {
      status,
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + ' MB',
      heapPercent: heapUsedPercent.toFixed(2) + '%',
      external: Math.round(mem.external / 1024 / 1024) + ' MB',
      rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
    };
  }

  getStatus() {
    const mem = process.memoryUsage();
    return {
      uptime: process.uptime(),
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
      },
      cpu: process.cpuUsage(),
    };
  }
}

export const healthCheck = new HealthCheck();
