import { dbGetSaved, dbGetSavedById, dbInsertSaved, dbDeleteSaved, dbUpdateSaved } from '../../db/sqlite.js';

export class SavedService {
  static async list({ page = 1, limit = 50, filter, sortBy }) {
    const offset = (page - 1) * limit;
    
    // Call the SQLite dbGetSaved implementation
    const items = dbGetSaved({ limit, offset, search: filter });
    return {
      items,
      pagination: {
        page,
        limit,
        total: items.length, // approximation or total saved query
      }
    };
  }

  static async getById(id) {
    return dbGetSavedById(id);
  }

  static async create(item) {
    const id = dbInsertSaved(item);
    return { id, ...item };
  }

  static async delete(id) {
    return dbDeleteSaved(id);
  }

  static async update(id, updates) {
    return dbUpdateSaved(id, updates);
  }
}
