import { DatabaseSync } from 'node:sqlite';
import { pipeline } from '@xenova/transformers';
import * as sqliteVec from 'sqlite-vec';
import { logger } from './logger.js';

class SemanticSearch {
  constructor() {
    this.db = new DatabaseSync(process.env.DB_PATH || './eco.db', { allowExtension: true });
    sqliteVec.load(this.db);
    this.embedder = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS product_embeddings USING vec0(embedding float[384]);
      CREATE VIRTUAL TABLE IF NOT EXISTS supplier_embeddings USING vec0(embedding float[384]);
    `);

    this.initialized = true;
    logger.info('Semantic search initialized');
  }

  async embed(text) {
    if (!this.embedder) await this.init();
    const result = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  }

  async indexProduct(productId, text) {
    if (!this.initialized) await this.init();

    const embedding = await this.embed(text);
    const vector = JSON.stringify(embedding);

    this.db.prepare('DELETE FROM product_embeddings WHERE rowid = ?').run(productId);
    this.db.prepare('INSERT INTO product_embeddings(rowid, embedding) VALUES (?, ?)')
      .run(productId, vector);

    logger.debug({ productId }, 'Product indexed');
  }

  async searchProducts(query, limit = 10) {
    if (!this.initialized) await this.init();

    const embedding = await this.embed(query);
    const vector = JSON.stringify(embedding);

    return this.db.prepare(`
      SELECT 
        p.*,
        e.distance
      FROM product_embeddings e
      JOIN saved_products p ON p.id = e.rowid
      WHERE e.embedding MATCH ? AND k = ?
      ORDER BY distance
    `).all(vector, limit);
  }

  async findSimilarProducts(productId, limit = 5) {
    if (!this.initialized) await this.init();
    const source = this.db.prepare('SELECT embedding FROM product_embeddings WHERE rowid = ?').get(productId);
    if (!source) return [];

    return this.db.prepare(`
      SELECT 
        p.*,
        e.distance
      FROM product_embeddings e
      JOIN saved_products p ON p.id = e.rowid
      WHERE e.embedding MATCH ? AND k = ? AND p.id != ?
      ORDER BY distance
    `).all(source.embedding, limit + 1, productId).filter(p => p.id !== productId).slice(0, limit);
  }
}

export const semanticSearch = new SemanticSearch();
export default semanticSearch;
