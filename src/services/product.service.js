import { DatabaseSync } from 'node:sqlite';
import { dbLogger } from '../infrastructure/logger.js';

const db = new DatabaseSync(process.env.DB_PATH || './eco.db');

export class ProductService {
  static async list({ page = 1, limit = 20, category, country }) {
    const offset = (page - 1) * limit;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (country) { sql += ' AND country = ?'; params.push(country); }

    sql += ' ORDER BY demand DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const products = db.prepare(sql).all(...params);
    const countResult = db.prepare('SELECT COUNT(*) as total FROM products').get();

    return {
      products,
      pagination: {
        page,
        limit,
        total: countResult.total,
        pages: Math.ceil(countResult.total / limit),
      },
    };
  }

  static async getById(id) {
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  }
}
