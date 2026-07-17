import axios from 'axios';
import { logger } from './logger.js';

class PythonBridgePool {
  constructor(url = process.env.PYTHON_BRIDGE_URL || 'http://127.0.0.1:5001', poolSize = 5) {
    this.baseUrl = url;
    this.clients = Array.from({ length: poolSize }, () => axios.create({
      baseURL: url,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    }));
    this.current = 0;
    this.healthy = true;
  }

  getClient() {
    const client = this.clients[this.current];
    this.current = (this.current + 1) % this.clients.length;
    return client;
  }

  async healthCheck() {
    try {
      const client = this.getClient();
      const { data } = await client.get('/health', { timeout: 5000 });
      this.healthy = data.status === 'healthy';
      return this.healthy;
    } catch (err) {
      this.healthy = false;
      return false;
    }
  }

  async scrape(params) {
    if (!this.healthy) await this.healthCheck();
    if (!this.healthy) throw new Error('Python bridge is unhealthy');

    const client = this.getClient();
    const { data } = await client.post('/scrape', params);
    if (!data.success) throw new Error(data.error);
    return data.data;
  }

  async analyzeImage(params) {
    if (!this.healthy) await this.healthCheck();

    const client = this.getClient();
    const { data } = await client.post('/analyze', params);
    if (!data.success) throw new Error(data.error);
    return data.data;
  }

  async runSpider(params) {
    if (!this.healthy) await this.healthCheck();

    const client = this.getClient();
    const { data } = await client.post('/spider', params);
    if (!data.success) throw new Error(data.error);
    return data.data;
  }
}

export const pythonBridge = new PythonBridgePool();
export default pythonBridge;
