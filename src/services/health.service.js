import { healthCheck } from '../health.js';

export class HealthService {
  static async check() {
    const status = await healthCheck.check();
    return {
      healthy: status.status === 'healthy',
      ...status
    };
  }
}
