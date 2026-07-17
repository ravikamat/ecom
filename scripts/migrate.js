import { readFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';

try {
  console.log('Migrating eco.db...');
  const db = new DatabaseSync('./eco.db');

  // Check and upgrade saved_products
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='saved_products'").all();
  if (tables.length > 0) {
    const tableInfo = db.prepare('PRAGMA table_info(saved_products)').all();
    const hasCountry = tableInfo.some(col => col.name === 'country');
    if (!hasCountry) {
      console.log('Adding country column to saved_products...');
      db.exec('ALTER TABLE saved_products ADD COLUMN country TEXT DEFAULT "India";');
    }
  }

  // Check and upgrade temp_trending_products
  const tablesTemp = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='temp_trending_products'").all();
  if (tablesTemp.length > 0) {
    const tableInfo = db.prepare('PRAGMA table_info(temp_trending_products)').all();
    const hasCountry = tableInfo.some(col => col.name === 'country');
    if (!hasCountry) {
      console.log('Adding country column to temp_trending_products...');
      db.exec('ALTER TABLE temp_trending_products ADD COLUMN country TEXT DEFAULT "India";');
    }
  }

  const schema = readFileSync('./db/schema_v3.sql', 'utf8');
  db.exec(schema);
  console.log('eco.db migrated successfully!');

  console.log('Migrating eco_events.db...');
  const eventsDb = new DatabaseSync('./eco_events.db');
  eventsDb.exec(schema);
  console.log('eco_events.db migrated successfully!');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
}
