import { DatabaseSync } from 'node:sqlite';
import { logger } from './logger.js';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

let parquetWrite;
try {
  const hyp = await import('hyparquet');
  parquetWrite = hyp.parquetWrite;
} catch (e) {
  logger.warn('hyparquet write module not found, using JSON archival fallback');
}

class ColdStorage {
  constructor(options = {}) {
    this.dbPath = options.dbPath || './eco.db';
    this.archiveDir = options.archiveDir || './archives';
    this.retentionDays = options.retentionDays || 90;
    this.db = new DatabaseSync(this.dbPath);

    if (!existsSync(this.archiveDir)) {
      mkdirSync(this.archiveDir, { recursive: true });
    }
  }

  async archiveOldResearch() {
    let oldResearch = [];
    try {
      oldResearch = this.db.prepare(`
        SELECT * FROM research_runs 
        WHERE created_at < datetime('now', '-${this.retentionDays} days')
      `).all();
    } catch (err) {
      // If table doesn't exist yet, handle gracefully
      logger.info('Research runs table does not exist or is empty');
      return { archived: 0 };
    }

    if (oldResearch.length === 0) {
      logger.info('No old research to archive');
      return { archived: 0 };
    }

    const filename = `research_${Date.now()}.parquet`;
    const filepath = join(this.archiveDir, filename);

    if (parquetWrite) {
      try {
        await parquetWrite({
          file: filepath,
          columns: this.getResearchSchema(),
          data: oldResearch,
          compression: 'GZIP',
        });
      } catch (err) {
        logger.error({ err: err.message }, 'Parquet write failed, falling back to JSON');
        writeFileSync(filepath + '.json', JSON.stringify(oldResearch, null, 2));
      }
    } else {
      writeFileSync(filepath + '.json', JSON.stringify(oldResearch, null, 2));
    }

    try {
      this.db.prepare(`
        DELETE FROM research_runs 
        WHERE created_at < datetime('now', '-${this.retentionDays} days')
      `).run();
    } catch (err) {
      logger.error('Failed to prune old research runs');
    }

    logger.info({ archived: oldResearch.length, file: filename }, 'Research archived');
    return { archived: oldResearch.length, file: filepath };
  }

  getResearchSchema() {
    return [
      { name: 'id', type: 'INT64' },
      { name: 'query', type: 'BYTE_ARRAY' },
      { name: 'country', type: 'BYTE_ARRAY' },
      { name: 'status', type: 'BYTE_ARRAY' },
      { name: 'score', type: 'DOUBLE' },
      { name: 'created_at', type: 'BYTE_ARRAY' },
    ];
  }

  async archiveOldDiscoveries() {
    let oldProducts = [];
    try {
      oldProducts = this.db.prepare(`
        SELECT * FROM stream_products 
        WHERE discovered_at < datetime('now', '-${this.retentionDays} days')
      `).all();
    } catch (err) {
      logger.info('Stream products table does not exist or is empty');
      return { archived: 0 };
    }

    if (oldProducts.length === 0) return { archived: 0 };

    const filename = `discoveries_${Date.now()}.parquet`;
    const filepath = join(this.archiveDir, filename);

    if (parquetWrite) {
      try {
        await parquetWrite({
          file: filepath,
          columns: [
            { name: 'id', type: 'INT64' },
            { name: 'name', type: 'BYTE_ARRAY' },
            { name: 'category', type: 'BYTE_ARRAY' },
            { name: 'platform', type: 'BYTE_ARRAY' },
            { name: 'discovered_at', type: 'BYTE_ARRAY' },
          ],
          data: oldProducts,
          compression: 'GZIP',
        });
      } catch (err) {
        logger.error({ err: err.message }, 'Parquet write failed, falling back to JSON');
        writeFileSync(filepath + '.json', JSON.stringify(oldProducts, null, 2));
      }
    } else {
      writeFileSync(filepath + '.json', JSON.stringify(oldProducts, null, 2));
    }

    try {
      this.db.prepare(`
        DELETE FROM stream_products 
        WHERE discovered_at < datetime('now', '-${this.retentionDays} days')
      `).run();
    } catch (err) {
      logger.error('Failed to prune old stream products');
    }

    logger.info({ archived: oldProducts.length, file: filename }, 'Discoveries archived');
    return { archived: oldProducts.length, file: filepath };
  }
}

export const coldStorage = new ColdStorage();
export default coldStorage;
