import { SupplierDiscoveryEngine } from '../supplier-discovery-engine.js';
import { getDB } from '../../db/sqlite.js';
import { CONFIG } from '../config.js';

let engineInstance = null;
async function getEngine() {
  if (!engineInstance) {
    const db = await getDB();
    engineInstance = new SupplierDiscoveryEngine({
      db,
      nimApiKey: CONFIG.apiKey,
      nimFallbackKey: CONFIG.fallbackApiKey,
    });
    await engineInstance.init();
  }
  return engineInstance;
}

export class SupplierService {
  static async find({ productName, category, country, minConfidence }) {
    const db = await getDB();
    let sql = 'SELECT * FROM discovered_suppliers WHERE 1=1';
    const params = [];
    if (productName) { sql += ' AND product_name LIKE ?'; params.push(`%${productName}%`); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (country) { sql += ' AND geo = ?'; params.push(country); }
    if (minConfidence) { sql += ' AND confidence >= ?'; params.push(minConfidence); }
    sql += ' ORDER BY confidence DESC';
    return db.prepare(sql).all(...params);
  }

  static async startDiscovery(body) {
    const engine = await getEngine();
    const { productName, category, country = 'IN' } = body;
    const jobId = `job_${Date.now()}`;
    
    // Trigger in the background
    engine.findSuppliers({ productName, category, geo: country })
      .catch(err => console.error('[SupplierService] Discovery background error:', err));

    return { id: jobId };
  }
}
