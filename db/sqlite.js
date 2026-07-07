/* ============================================================
   ECO SQLite Database Module — v2.5
   Uses Node.js built-in node:sqlite (Node 22+)
   File: d:/eco/db/sqlite.js
   ============================================================ */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, '..', 'eco.db');

let _db = null;
let _initPromise = null;

// ✅ FIX: Thread-safe initialization with promise locking
export function getDB() {
  if (_db) return _db;
  
  // If already initializing, wait for it
  if (_initPromise) return _initPromise.then(() => _db);
  
  _initPromise = new Promise((resolve, reject) => {
    try {
      _db = new DatabaseSync(DB_PATH);
      _db.exec('PRAGMA journal_mode=WAL;');
      _db.exec('PRAGMA foreign_keys=ON;');
      _db.exec('PRAGMA busy_timeout=5000;'); // Wait 5s on lock
      _db.exec('PRAGMA journal_size_limit=100000000;'); // 100MB journal
      initSchema(_db);
      resolve(_db);
    } catch (err) {
      reject(err);
    }
  });
  
  return _initPromise.then(() => _db);
}

function initSchema(db) {
  db.exec(`
    -- Seeded/discovered products table
    CREATE TABLE IF NOT EXISTS products (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      country       TEXT,
      category      TEXT,
      demand        INTEGER DEFAULT 50,
      margin        REAL    DEFAULT 0,
      competition   TEXT    DEFAULT 'Medium',
      platformCount INTEGER DEFAULT 1,
      supplierPrice REAL    DEFAULT 0,
      currency      TEXT    DEFAULT 'INR'
    );

    -- Seeded suppliers table
    CREATE TABLE IF NOT EXISTS suppliers (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT    NOT NULL,
      type     TEXT,
      country  TEXT,
      city     TEXT,
      rating   REAL    DEFAULT 0,
      category TEXT,
      phone    TEXT,
      email    TEXT,
      address  TEXT,
      moq      INTEGER DEFAULT 0
    );

    -- Seeded platforms table
    CREATE TABLE IF NOT EXISTS platforms (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT    NOT NULL,
      country  TEXT,
      currency TEXT,
      feeRef   REAL    DEFAULT 0,
      closing  REAL    DEFAULT 0,
      ship     REAL    DEFAULT 0
    );

    -- Saved products (persistent, replaces Dexie saved table)
    CREATE TABLE IF NOT EXISTS saved_products (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      category         TEXT    DEFAULT '',
      platform         TEXT    DEFAULT '',
      country          TEXT    DEFAULT 'India',
      sp               REAL    DEFAULT 0,
      cp               REAL    DEFAULT 0,
      currency         TEXT    DEFAULT 'INR',
      margin           REAL    DEFAULT 0,
      demand           INTEGER DEFAULT 50,
      winner_score     INTEGER DEFAULT 0,
      moq              INTEGER DEFAULT 50,
      daily_sales      INTEGER DEFAULT 5,
      trend_status     TEXT    DEFAULT 'active',
      trend_flagged_at TEXT,
      source           TEXT    DEFAULT 'trending',
      note             TEXT    DEFAULT '',
      pinned           INTEGER DEFAULT 0,
      saved_at         TEXT    DEFAULT (datetime('now')),
      updated_at       TEXT    DEFAULT (datetime('now')),
      last_auto_refresh TEXT
    );

    -- App settings (replaces Dexie settings table)
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Exchange rates cache
    CREATE TABLE IF NOT EXISTS exchange_rates (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Product detail cache (AI deep-dive responses)
    CREATE TABLE IF NOT EXISTS product_details (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT    NOT NULL,
      country      TEXT    DEFAULT 'India',
      detail_json  TEXT,
      fetched_at   TEXT    DEFAULT (datetime('now')),
      UNIQUE(product_name, country)
    );

    -- Ecommerce listing content (AI-generated per platform)
    CREATE TABLE IF NOT EXISTS product_listings (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      saved_product_id INTEGER REFERENCES saved_products(id) ON DELETE CASCADE,
      platform         TEXT    NOT NULL,
      title            TEXT,
      bullet_points    TEXT,   -- JSON array
      description      TEXT,
      search_keywords  TEXT,   -- comma separated
      seo_title        TEXT,
      seo_description  TEXT,
      price_suggestion REAL,
      status           TEXT    DEFAULT 'pending',
      generated_at     TEXT
    );

    -- Trending/search scrape cache (avoid repeat AI calls per page)
    CREATE TABLE IF NOT EXISTS scrape_cache (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key   TEXT    UNIQUE,   -- hash of query+country+page
      query       TEXT,
      country     TEXT,
      page        INTEGER DEFAULT 1,
      per_page    INTEGER DEFAULT 20,
      result_json TEXT,
      total_found INTEGER DEFAULT 0,
      has_more    INTEGER DEFAULT 0,
      scraped_at  TEXT    DEFAULT (datetime('now'))
    );

    -- URL reverse lookup cache
    CREATE TABLE IF NOT EXISTS url_lookups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      url         TEXT    UNIQUE,
      product_json TEXT,
      looked_up_at TEXT   DEFAULT (datetime('now'))
    );

    -- Search history
    CREATE TABLE IF NOT EXISTS search_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      query     TEXT,
      country   TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_saved_country   ON saved_products(country);
    CREATE INDEX IF NOT EXISTS idx_saved_source    ON saved_products(source);
    CREATE INDEX IF NOT EXISTS idx_saved_pinned    ON saved_products(pinned);
    CREATE INDEX IF NOT EXISTS idx_cache_key       ON scrape_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_listings_prod   ON product_listings(saved_product_id);
  `);

  try {
    db.exec("ALTER TABLE saved_products ADD COLUMN daily_sales INTEGER DEFAULT 5");
  } catch(e) {}

  // Auto-seed database from data-seed.js if empty
  try {
    const prodCount = db.prepare('SELECT count(*) as count FROM products').get().count;
    if (prodCount === 0) {
      const seedFile = path.join(__dirname, '..', 'js', 'data-seed.js');
      if (fs.existsSync(seedFile)) {
        const code = fs.readFileSync(seedFile, 'utf8');
        
        // Parse SEED_PRODUCTS
        const prodMatch = code.match(/const SEED_PRODUCTS\s*=\s*([\s\S]*?);\s*const SEED_SUPPLIERS/);
        if (prodMatch) {
          const products = new Function(`return ${prodMatch[1]}`)();
          const stmt = db.prepare(`INSERT INTO products (name, country, category, demand, margin, competition, platformCount, supplierPrice, currency) VALUES (?,?,?,?,?,?,?,?,?)`);
          db.transaction(() => {
            for (const p of products) {
              stmt.run(p.name, p.country, p.category, p.demand, p.margin, p.competition, (p.platforms||[]).length||1, p.supplierPrice||0, p.currency||'INR');
            }
          })();
          console.log(`[SQLite] Seeded ${products.length} products`);
        }

        // Parse SEED_SUPPLIERS
        const supMatch = code.match(/const SEED_SUPPLIERS\s*=\s*([\s\S]*?);\s*const SEED_PLATFORMS/);
        if (supMatch) {
          const suppliers = new Function(`return ${supMatch[1]}`)();
          const stmt = db.prepare(`INSERT INTO suppliers (name, type, country, city, rating, category, phone, email, address, moq) VALUES (?,?,?,?,?,?,?,?,?,?)`);
          db.transaction(() => {
            for (const s of suppliers) {
              stmt.run(s.name, s.type, s.country, s.city, s.rating||0, s.category||'', s.phone||'', s.email||'', s.address||'', s.moq||0);
            }
          })();
          console.log(`[SQLite] Seeded ${suppliers.length} suppliers`);
        }

        // Parse SEED_PLATFORMS
        const platMatch = code.match(/const SEED_PLATFORMS\s*=\s*([\s\S]*?);\s*const SOCIAL_BUZZ/);
        if (platMatch) {
          const platforms = new Function(`return ${platMatch[1]}`)();
          const stmt = db.prepare(`INSERT INTO platforms (name, country, currency, feeRef, closing, ship) VALUES (?,?,?,?,?,?)`);
          db.transaction(() => {
            for (const p of platforms) {
              stmt.run(p.name, p.country, p.currency, p.feeRef||0, p.closing||0, p.ship||0);
            }
          })();
          console.log(`[SQLite] Seeded ${platforms.length} platforms`);
        }
      }
    }
  } catch (e) {
    console.error('[SQLite] Seed error:', e.message);
  }

  console.log('[SQLite] Schema initialized at', DB_PATH);
}

/* ── SAVED PRODUCTS CRUD ──────────────────────────────────── */

export function dbGetSaved({ country, source, pinned, search, limit = 50, offset = 0 } = {}) {
  const db = getDB();
  const where = [];
  const params = {};
  if (country && country !== 'all') { where.push("country = :country"); params.country = country; }
  if (source)  { where.push("source = :source");   params.source = source; }
  if (pinned !== undefined) { where.push("pinned = :pinned"); params.pinned = pinned ? 1 : 0; }
  if (search)  { where.push("name LIKE :search");  params.search = `%${search}%`; }
  const sql = `SELECT * FROM saved_products ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY pinned DESC, saved_at DESC LIMIT :limit OFFSET :offset`;
  params.limit  = limit;
  params.offset = offset;
  return db.prepare(sql).all(params);
}

export function dbGetSavedById(id) {
  return getDB().prepare('SELECT * FROM saved_products WHERE id = ?').get(id);
}

export function dbInsertSaved(item) {
  const db = getDB();
  // Check duplicate
  const existing = db.prepare('SELECT id FROM saved_products WHERE name = ? AND country = ?')
                     .get(item.name || '', item.country || 'India');
  if (existing) return { success: false, id: existing.id, message: 'Already saved' };

  const stmt = db.prepare(`INSERT INTO saved_products
    (name,category,platform,country,sp,cp,currency,margin,demand,winner_score,moq,daily_sales,source,note,trend_status,saved_at,updated_at)
    VALUES (:name,:category,:platform,:country,:sp,:cp,:currency,:margin,:demand,:winner_score,:moq,:daily_sales,:source,:note,:trend_status,datetime('now'),datetime('now'))`);
  const res = stmt.run({
    name:         item.name || '',
    category:     item.category || '',
    platform:     item.platform || '',
    country:      item.country || 'India',
    sp:           item.sp || 0,
    cp:           item.cp || 0,
    currency:     item.currency || 'INR',
    margin:       item.margin || 0,
    demand:       item.demand || 50,
    winner_score: item.winnerScore || item.winner_score || 0,
    moq:          item.moq || 50,
    daily_sales:  item.dailySales || item.daily_sales || 5,
    source:       item.source || 'trending',
    note:         item.note || '',
    trend_status: item.trendStatus || 'active',
  });
  return { success: true, id: res.lastInsertRowid };
}

export function dbUpdateSaved(id, updates) {
  const db = getDB();
  const allowed = ['name','category','platform','country','sp','cp','currency','margin',
                   'demand','winner_score','moq','daily_sales','source','note','pinned','trend_status',
                   'trend_flagged_at','last_auto_refresh'];
  const sets = [];
  const params = { id };
  for (const [k, v] of Object.entries(updates)) {
    const col = k === 'winnerScore' ? 'winner_score' : k === 'trendStatus' ? 'trend_status' : k === 'dailySales' ? 'daily_sales' : k;
    if (allowed.includes(col)) { sets.push(`${col} = :${col}`); params[col] = v; }
  }
  if (!sets.length) return;
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE saved_products SET ${sets.join(',')} WHERE id = :id`).run(params);
}

export function dbDeleteSaved(id) {
  const item = getDB().prepare('SELECT pinned FROM saved_products WHERE id = ?').get(id);
  if (!item) throw new Error('Not found');
  if (item.pinned) throw new Error('Pinned — unpin first');
  getDB().prepare('DELETE FROM saved_products WHERE id = ?').run(id);
}

export function dbPinSaved(id, pinned) {
  getDB().prepare("UPDATE saved_products SET pinned = ?, updated_at = datetime('now') WHERE id = ?")
         .run(pinned ? 1 : 0, id);
}

export function dbClearUnpinned() {
  getDB().prepare('DELETE FROM saved_products WHERE pinned = 0').run();
}

/* ── SETTINGS ─────────────────────────────────────────────── */

export function dbGetSetting(key, defaultVal) {
  const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultVal;
}

export function dbSetSetting(key, value) {
  getDB().prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, String(value));
}

/* ── EXCHANGE RATES ───────────────────────────────────────── */

export function dbGetRates() {
  const rows = getDB().prepare('SELECT key, value FROM exchange_rates').all();
  const result = {};
  for (const r of rows) { try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; } }
  return result;
}

export function dbSetRates(ratesObj) {
  const db   = getDB();
  const stmt = db.prepare('INSERT OR REPLACE INTO exchange_rates(key,value,updated_at) VALUES(?,?,datetime(\'now\'))');
  const tx   = db.transaction(obj => {
    for (const [k, v] of Object.entries(obj)) stmt.run(k, JSON.stringify(v));
  });
  tx(ratesObj);
}

/* ── PRODUCT DETAIL CACHE ─────────────────────────────────── */

export function dbGetProductDetail(productName, country) {
  const row = getDB().prepare('SELECT * FROM product_details WHERE product_name = ? AND country = ?')
                     .get(productName, country || 'India');
  if (!row) return null;
  // Check freshness — details older than 7 days are stale
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (age > 7 * 24 * 60 * 60 * 1000) return null;
  try { return JSON.parse(row.detail_json); } catch { return null; }
}

export function dbSaveProductDetail(productName, country, detailObj) {
  getDB().prepare(`INSERT OR REPLACE INTO product_details(product_name,country,detail_json,fetched_at)
                   VALUES(?,?,?,datetime('now'))`)
         .run(productName, country || 'India', JSON.stringify(detailObj));
}

/* ── SCRAPE CACHE ─────────────────────────────────────────── */

export function dbGetScrapeCache(query, country, page, perPage) {
  const key = `${query}||${country}||${page}||${perPage}`;
  const row = getDB().prepare('SELECT * FROM scrape_cache WHERE cache_key = ?').get(key);
  if (!row) return null;
  // Cache valid for 4 hours
  const age = Date.now() - new Date(row.scraped_at).getTime();
  if (age > 4 * 60 * 60 * 1000) return null;
  try { return { items: JSON.parse(row.result_json), hasMore: !!row.has_more, total: row.total_found }; }
  catch { return null; }
}

export function dbSetScrapeCache(query, country, page, perPage, items, hasMore, total) {
  const key = `${query}||${country}||${page}||${perPage}`;
  getDB().prepare(`INSERT OR REPLACE INTO scrape_cache(cache_key,query,country,page,per_page,result_json,total_found,has_more,scraped_at)
                   VALUES(?,?,?,?,?,?,?,?,datetime('now'))`)
         .run(key, query, country, page, perPage, JSON.stringify(items), total, hasMore ? 1 : 0);
}

/* ── URL LOOKUP CACHE ─────────────────────────────────────── */

export function dbGetUrlLookup(url) {
  const row = getDB().prepare('SELECT * FROM url_lookups WHERE url = ?').get(url);
  if (!row) return null;
  // Cache valid for 24 hours
  const age = Date.now() - new Date(row.looked_up_at).getTime();
  if (age > 24 * 60 * 60 * 1000) return null;
  try { return JSON.parse(row.product_json); } catch { return null; }
}

export function dbSaveUrlLookup(url, productObj) {
  getDB().prepare(`INSERT OR REPLACE INTO url_lookups(url,product_json,looked_up_at) VALUES(?,?,datetime('now'))`)
         .run(url, JSON.stringify(productObj));
}

/* ── PRODUCT LISTINGS (Ecom Content) ──────────────────────── */

export function dbGetListings(savedProductId) {
  return getDB().prepare('SELECT * FROM product_listings WHERE saved_product_id = ?').all(savedProductId);
}

export function dbUpsertListing(savedProductId, platform, listingData) {
  const existing = getDB().prepare('SELECT id FROM product_listings WHERE saved_product_id = ? AND platform = ?')
                           .get(savedProductId, platform);
  if (existing) {
    getDB().prepare(`UPDATE product_listings SET title=?,bullet_points=?,description=?,search_keywords=?,
                     seo_title=?,seo_description=?,price_suggestion=?,status='done',generated_at=datetime('now')
                     WHERE id=?`)
           .run(listingData.title, JSON.stringify(listingData.bullets), listingData.description,
                (listingData.keywords||[]).join(','), listingData.seoTitle, listingData.seoDescription,
                listingData.priceSuggestion, existing.id);
  } else {
    getDB().prepare(`INSERT INTO product_listings(saved_product_id,platform,title,bullet_points,description,
                     search_keywords,seo_title,seo_description,price_suggestion,status,generated_at)
                     VALUES(?,?,?,?,?,?,?,?,?,'done',datetime('now'))`)
           .run(savedProductId, platform, listingData.title, JSON.stringify(listingData.bullets),
                listingData.description, (listingData.keywords||[]).join(','),
                listingData.seoTitle, listingData.seoDescription, listingData.priceSuggestion);
  }
}

/* ── BULK MIGRATE (from Dexie export) ──────────────────────── */

export function dbMigrateFromClient(savedItems = [], settingsArr = []) {
  const db  = getDB();
  let imported = 0;
  const tx  = db.transaction(() => {
    for (const item of savedItems) {
      const exists = db.prepare('SELECT id FROM saved_products WHERE name = ? AND country = ?')
                       .get(item.name || '', item.country || 'India');
      if (!exists) {
        db.prepare(`INSERT INTO saved_products
          (name,category,platform,country,sp,cp,currency,margin,demand,winner_score,moq,source,note,pinned,trend_status,saved_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(item.name||'',item.category||'',item.platform||'',item.country||'India',
               item.sp||0,item.cp||0,item.currency||'INR',item.margin||0,
               item.demand||50,item.winnerScore||item.winner_score||0,item.moq||50,
               item.source||'trending',item.note||'',item.pinned?1:0,
               item.trendStatus||item.trend_status||'active',
               item.savedAt||item.date||new Date().toISOString(),
               item.updatedAt||new Date().toISOString());
        imported++;
      }
    }
    for (const s of settingsArr) {
      if (s.key && s.value !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(s.key, String(s.value));
      }
    }
  });
  tx();
  return imported;
}

/* ── PRODUCTS GETTERS ─────────────────────────────────────── */
export function dbGetProducts({ country, category, search, limit = 100, offset = 0 } = {}) {
  const db = getDB();
  const where = [];
  const params = {};
  if (country && country !== 'all') { where.push("country = :country"); params.country = country; }
  if (category && category !== 'all') { where.push("category = :category"); params.category = category; }
  if (search) { where.push("name LIKE :search"); params.search = `%${search}%`; }
  
  const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY id ASC LIMIT :limit OFFSET :offset`;
  params.limit  = limit;
  params.offset = offset;
  return db.prepare(sql).all(params);
}

export function dbGetProductById(id) {
  return getDB().prepare('SELECT * FROM products WHERE id = ?').get(id);
}

/* ── SUPPLIERS GETTERS ────────────────────────────────────── */
export function dbGetSuppliers({ country, type, category, search, limit = 100, offset = 0 } = {}) {
  const db = getDB();
  const where = [];
  const params = {};
  if (country && country !== 'all') { where.push("country = :country"); params.country = country; }
  if (type && type !== 'all')       { where.push("type = :type");       params.type = type; }
  if (category && category !== 'all') { where.push("category = :category"); params.category = category; }
  if (search) { where.push("(name LIKE :search OR city LIKE :search)"); params.search = `%${search}%`; }
  
  const sql = `SELECT * FROM suppliers ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY rating DESC, id ASC LIMIT :limit OFFSET :offset`;
  params.limit  = limit;
  params.offset = offset;
  return db.prepare(sql).all(params);
}

export function dbGetSupplierById(id) {
  return getDB().prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
}

/* ── PLATFORMS GETTERS ────────────────────────────────────── */
export function dbGetPlatforms(country) {
  const db = getDB();
  if (country && country !== 'all') {
    return db.prepare('SELECT * FROM platforms WHERE country = ?').all(country);
  }
  return db.prepare('SELECT * FROM platforms').all();
}

/* ── DASHBOARD STATS ─────────────────────────────────────── */
export function dbGetDashboardStats() {
  const db = getDB();
  const savedCount = db.prepare('SELECT COUNT(*) AS count FROM saved_products').get().count;
  const supplierCount = db.prepare('SELECT COUNT(*) AS count FROM suppliers').get().count;
  const avgMarginRow = db.prepare('SELECT AVG(margin) AS avg FROM saved_products').get();
  const avgMargin = avgMarginRow && avgMarginRow.avg !== null ? Math.round(avgMarginRow.avg) : 0;
  
  // Calculate totalCapital by fetching all saved products and doing a rough unit economics sum
  const products = db.prepare('SELECT cp, sp, moq FROM saved_products').all();
  let totalCapital = 0;
  products.forEach(p => {
    const cp = p.cp || 0;
    const sp = p.sp || 0;
    const moq = p.moq || 30;
    const landed = cp * 1.15;
    const itemCapital = landed * moq + (sp * moq * 0.3);
    totalCapital += itemCapital;
  });

  return {
    savedCount,
    supplierCount,
    avgMargin,
    totalCapital
  };
}

/* ── RESET DATABASE ───────────────────────────────────────── */
export function dbResetDatabase() {
  const db = getDB();
  db.prepare('DELETE FROM saved_products').run();
  db.prepare('DELETE FROM settings').run();
  db.prepare('DELETE FROM products').run();
  db.prepare('DELETE FROM suppliers').run();
  db.prepare('DELETE FROM platforms').run();
  db.prepare('DELETE FROM exchange_rates').run();
  db.prepare('DELETE FROM product_details').run();
  db.prepare('DELETE FROM product_listings').run();
  db.prepare('DELETE FROM scrape_cache').run();
  db.prepare('DELETE FROM url_lookups').run();
  db.prepare('DELETE FROM search_history').run();
}

