/* ============================================================
   ECO SQLite Database Module — v2.5
   Uses Node.js built-in node:sqlite (Node 22+)
   File: d:/eco/db/sqlite.js
   ============================================================ */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
      scraped_at  TEXT    DEFAULT (datetime('now')),
      scraped_at_ms INTEGER DEFAULT 0  -- Unix ms timestamp (avoids timezone parsing bugs)
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

    -- E-commerce research runs (tracks orchestrator jobs)
    CREATE TABLE IF NOT EXISTS research_runs (
      run_id           TEXT PRIMARY KEY,
      run_mode         TEXT NOT NULL,
      country          TEXT NOT NULL,
      category         TEXT,
      query            TEXT,
      status           TEXT DEFAULT 'running',
      discovered_count INTEGER DEFAULT 0,
      product_count    INTEGER DEFAULT 0,
      researched_count INTEGER DEFAULT 0,
      started_at       TEXT,
      finished_at      TEXT
    );

    -- E-commerce research candidates (raw discovered products)
    CREATE TABLE IF NOT EXISTS research_candidates (
      candidate_id TEXT PRIMARY KEY,
      run_id       TEXT REFERENCES research_runs(run_id) ON DELETE CASCADE,
      intent_id    TEXT,
      source       TEXT,
      title        TEXT,
      brand        TEXT,
      size         TEXT,
      variant      TEXT,
      material     TEXT,
      price        REAL,
      rating       REAL,
      reviews      INTEGER,
      seller       TEXT,
      url          TEXT,
      raw_json     TEXT,
      scraped_at   TEXT
    );

    -- Temp/background trending products (clustered and ranked)
    CREATE TABLE IF NOT EXISTS temp_trending_products (
      product_id            TEXT PRIMARY KEY,
      canonical_name        TEXT NOT NULL,
      brand                 TEXT,
      size                  TEXT,
      variant               TEXT,
      material              TEXT,
      evidence_count        INTEGER DEFAULT 0,
      source_count          INTEGER DEFAULT 0,
      source_set            TEXT,  -- JSON string of sources
      price_points          TEXT,  -- JSON string of prices
      review_points         TEXT,  -- JSON string of reviews
      avg_price             REAL,
      avg_reviews           REAL,
      demand_velocity       INTEGER DEFAULT 50,
      search_intent_strength INTEGER DEFAULT 50,
      competition_gap       INTEGER DEFAULT 50,
      supply_reliability    INTEGER DEFAULT 50,
      margin_quality        INTEGER DEFAULT 50,
      review_signal         INTEGER DEFAULT 50,
      price_stability       INTEGER DEFAULT 50,
      reorder_likelihood    INTEGER DEFAULT 50,
      pricing_volatility    TEXT DEFAULT 'low',
      cluster_uncertainty   TEXT DEFAULT 'low',
      policy_risk           TEXT DEFAULT 'low',
      provisional_score     INTEGER DEFAULT 0,
      hero_score            INTEGER DEFAULT 0,
      avg_retail_price      REAL,
      avg_cost_price        REAL,
      supplier_count        INTEGER DEFAULT 0,
      competition_count     INTEGER DEFAULT 0,
      status                TEXT DEFAULT 'queued',
      rank                  INTEGER,
      next_refresh_at       TEXT,
      last_researched_at    TEXT,
      created_at            TEXT DEFAULT (datetime('now')),
      updated_at            TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_temp_hero_score ON temp_trending_products(hero_score);
    CREATE INDEX IF NOT EXISTS idx_temp_next_refresh ON temp_trending_products(next_refresh_at);

    -- Discovery Stream Engine tables
    CREATE TABLE IF NOT EXISTS discovery_sessions (
      session_id TEXT PRIMARY KEY,
      location TEXT,
      started_at TEXT,
      ended_at TEXT,
      products_emitted INTEGER DEFAULT 0,
      products_saved INTEGER DEFAULT 0,
      categories_explored TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS category_heatmap (
      country TEXT,
      category TEXT,
      avg_save_rate REAL DEFAULT 0,
      last_discovery_count INTEGER DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (country, category)
    );

    CREATE TABLE IF NOT EXISTS site_intelligence (
      domain TEXT,
      category TEXT,
      country TEXT,
      quality_score REAL DEFAULT 0.5,
      success_rate REAL DEFAULT 0,
      avg_margin REAL DEFAULT 0,
      last_used TEXT,
      is_active INTEGER DEFAULT 1,
      PRIMARY KEY (domain, category, country)
    );

    CREATE TABLE IF NOT EXISTS stream_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      product_data TEXT,
      was_saved INTEGER DEFAULT 0,
      emitted_at TEXT,
      FOREIGN KEY (session_id) REFERENCES discovery_sessions(session_id)
    );

    CREATE TABLE IF NOT EXISTS query_templates (
      query TEXT PRIMARY KEY,
      category TEXT,
      country TEXT,
      success_rate REAL DEFAULT 0,
      avg_margin REAL DEFAULT 0,
      use_count INTEGER DEFAULT 0,
      last_used TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_stream_session ON stream_products(session_id);
    CREATE INDEX IF NOT EXISTS idx_heatmap_country ON category_heatmap(country);
    CREATE INDEX IF NOT EXISTS idx_site_country ON site_intelligence(country);
    CREATE INDEX IF NOT EXISTS idx_site_cat ON site_intelligence(category, country);

    -- Research queue for background worker
    CREATE TABLE IF NOT EXISTS research_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      query      TEXT NOT NULL,
      country    TEXT DEFAULT 'India',
      priority   INTEGER DEFAULT 5,
      status     TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );

    -- Research failure log
    CREATE TABLE IF NOT EXISTS research_failures (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      topic      TEXT,
      step       TEXT,
      error      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Supplier auto-discovered
    CREATE TABLE IF NOT EXISTS supplier_auto_discovered (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT,
      country      TEXT,
      supplier_name TEXT,
      city         TEXT,
      cluster      TEXT,
      confidence   TEXT DEFAULT 'low',
      contact_info TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `);

  try {
    db.exec("ALTER TABLE saved_products ADD COLUMN daily_sales INTEGER DEFAULT 5");
  } catch(e) {}

  // Migration: add new tables if DB already existed
  try { getDB().exec(`ALTER TABLE research_queue ADD COLUMN priority INTEGER DEFAULT 5`); } catch {}

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

  // Seed discovery stream site intelligence defaults
  try { dbSeedSiteIntelligence(); } catch (e) { console.warn('[SQLite] Site intelligence seed warning:', e.message); }

  // Migration: add scraped_at_ms column if missing (fixes timezone cache bug)
  try {
    getDB().exec(`ALTER TABLE scrape_cache ADD COLUMN scraped_at_ms INTEGER DEFAULT 0`);
    console.log('[SQLite] Migration: added scraped_at_ms column');
  } catch(e) { /* column already exists — safe to ignore */ }

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
  // Cache valid for 4 hours — compare using stored Unix ms timestamp (avoids timezone ambiguity)
  const storedAt = row.scraped_at_ms || (new Date(row.scraped_at + 'Z').getTime()); // fallback for old rows
  const age = Date.now() - storedAt;
  if (age > 4 * 60 * 60 * 1000) { console.log(`[Cache] Expired (age=${Math.round(age/60000)}min)`); return null; }
  try { return { items: JSON.parse(row.result_json), hasMore: !!row.has_more, total: row.total_found }; }
  catch { return null; }
}

export function dbSetScrapeCache(query, country, page, perPage, items, hasMore, total) {
  const key = `${query}||${country}||${page}||${perPage}`;
  const nowMs = Date.now();
  getDB().prepare(`INSERT OR REPLACE INTO scrape_cache(cache_key,query,country,page,per_page,result_json,total_found,has_more,scraped_at,scraped_at_ms)
                   VALUES(?,?,?,?,?,?,?,?,datetime('now'),?)`)
         .run(key, query, country, page, perPage, JSON.stringify(items), total, hasMore ? 1 : 0, nowMs);
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

  // M1 fix: compute totalCapital via SQL sum, with product-loop fallback
  const totalCapital = (() => {
    try {
      const row = getDB().prepare('SELECT COALESCE(SUM(CAST(sp AS REAL) * 1), 0) as total FROM saved_products').get();
      return row?.total || 0;
    } catch { return 0; }
  })();

  return {
    savedCount,
    supplierCount,
    avgMargin,
    totalCapital,
  };
}

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
  try {
    db.prepare('DELETE FROM research_runs').run();
    db.prepare('DELETE FROM research_candidates').run();
    db.prepare('DELETE FROM temp_trending_products').run();
    db.prepare('DELETE FROM discovery_sessions').run();
    db.prepare('DELETE FROM category_heatmap').run();
    db.prepare('DELETE FROM site_intelligence').run();
    db.prepare('DELETE FROM stream_products').run();
    db.prepare('DELETE FROM query_templates').run();
  } catch (e) {}
}

/* ── HERO RESEARCH ORCHESTRATOR CONTRACT ─────────────────── */
export function dbInsertRun(row) {
  const db = getDB();
  db.prepare(`INSERT OR REPLACE INTO research_runs
    (run_id, run_mode, country, category, query, status, discovered_count, product_count, researched_count, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.run_id, row.run_mode, row.country, row.category || null, row.query || null,
    row.status || 'running', row.discovered_count || 0, row.product_count || 0,
    row.researched_count || 0, row.started_at, row.finished_at || null
  );
}

export function dbInsertCandidates(rows) {
  if (!rows || rows.length === 0) return;
  const db = getDB();
  const stmt = db.prepare(`INSERT OR REPLACE INTO research_candidates
    (candidate_id, run_id, intent_id, source, title, brand, size, variant, material, price, rating, reviews, seller, url, raw_json, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    for (const r of rows) {
      stmt.run(
        r.candidate_id, r.run_id, r.intent_id, r.source, r.title, r.brand || null,
        r.size || null, r.variant || null, r.material || null, r.price ?? null,
        r.rating ?? null, r.reviews ?? null, r.seller || null, r.url || null,
        r.raw_json || null, r.scraped_at
      );
    }
  })();
}

export function dbUpsertTempProducts(rows) {
  if (!rows || rows.length === 0) return;
  const db = getDB();
  const stmt = db.prepare(`INSERT INTO temp_trending_products (
      product_id, canonical_name, brand, size, variant, material,
      evidence_count, source_count, source_set, price_points, review_points,
      avg_price, avg_reviews, demand_velocity, search_intent_strength,
      competition_gap, supply_reliability, margin_quality, review_signal,
      price_stability, reorder_likelihood, pricing_volatility, cluster_uncertainty,
      policy_risk, provisional_score, hero_score, avg_retail_price, avg_cost_price,
      supplier_count, competition_count, status, rank, next_refresh_at, last_researched_at, updated_at
    ) VALUES (
      :product_id, :canonical_name, :brand, :size, :variant, :material,
      :evidence_count, :source_count, :source_set, :price_points, :review_points,
      :avg_price, :avg_reviews, :demand_velocity, :search_intent_strength,
      :competition_gap, :supply_reliability, :margin_quality, :review_signal,
      :price_stability, :reorder_likelihood, :pricing_volatility, :cluster_uncertainty,
      :policy_risk, :provisional_score, :hero_score, :avg_retail_price, :avg_cost_price,
      :supplier_count, :competition_count, :status, :rank, :next_refresh_at, :last_researched_at, :updated_at
    ) ON CONFLICT(product_id) DO UPDATE SET
      canonical_name = excluded.canonical_name,
      brand = COALESCE(excluded.brand, temp_trending_products.brand),
      size = COALESCE(excluded.size, temp_trending_products.size),
      variant = COALESCE(excluded.variant, temp_trending_products.variant),
      material = COALESCE(excluded.material, temp_trending_products.material),
      evidence_count = excluded.evidence_count,
      source_count = excluded.source_count,
      source_set = excluded.source_set,
      price_points = excluded.price_points,
      review_points = excluded.review_points,
      avg_price = excluded.avg_price,
      avg_reviews = excluded.avg_reviews,
      demand_velocity = excluded.demand_velocity,
      search_intent_strength = excluded.search_intent_strength,
      competition_gap = excluded.competition_gap,
      supply_reliability = excluded.supply_reliability,
      margin_quality = excluded.margin_quality,
      review_signal = excluded.review_signal,
      price_stability = excluded.price_stability,
      reorder_likelihood = excluded.reorder_likelihood,
      pricing_volatility = excluded.pricing_volatility,
      cluster_uncertainty = excluded.cluster_uncertainty,
      policy_risk = excluded.policy_risk,
      provisional_score = excluded.provisional_score,
      hero_score = COALESCE(NULLIF(excluded.hero_score, 0), temp_trending_products.hero_score, excluded.provisional_score),
      avg_retail_price = COALESCE(excluded.avg_retail_price, temp_trending_products.avg_retail_price),
      avg_cost_price = COALESCE(excluded.avg_cost_price, temp_trending_products.avg_cost_price),
      supplier_count = COALESCE(excluded.supplier_count, temp_trending_products.supplier_count),
      competition_count = COALESCE(excluded.competition_count, temp_trending_products.competition_count),
      status = excluded.status,
      rank = COALESCE(excluded.rank, temp_trending_products.rank),
      next_refresh_at = COALESCE(excluded.next_refresh_at, temp_trending_products.next_refresh_at),
      last_researched_at = COALESCE(excluded.last_researched_at, temp_trending_products.last_researched_at),
      updated_at = excluded.updated_at
  `);

  db.transaction(() => {
    for (const r of rows) {
      const params = {
        product_id: r.product_id,
        canonical_name: r.canonical_name || r.title || r.name || '',
        brand: r.brand || null,
        size: r.size || null,
        variant: r.variant || null,
        material: r.material || null,
        evidence_count: r.evidence_count || 1,
        source_count: r.source_count || 1,
        source_set: Array.isArray(r.source_set) ? JSON.stringify(r.source_set) : JSON.stringify([r.source || 'unknown']),
        price_points: Array.isArray(r.price_points) ? JSON.stringify(r.price_points) : '[]',
        review_points: Array.isArray(r.review_points) ? JSON.stringify(r.review_points) : '[]',
        avg_price: r.avg_price ?? null,
        avg_reviews: r.avg_reviews ?? null,
        demand_velocity: r.demand_velocity ?? 50,
        search_intent_strength: r.search_intent_strength ?? 50,
        competition_gap: r.competition_gap ?? 50,
        supply_reliability: r.supply_reliability ?? 50,
        margin_quality: r.margin_quality ?? 50,
        review_signal: r.review_signal ?? 50,
        price_stability: r.price_stability ?? 50,
        reorder_likelihood: r.reorder_likelihood ?? 50,
        pricing_volatility: r.pricing_volatility || 'low',
        cluster_uncertainty: r.cluster_uncertainty || 'low',
        policy_risk: r.policy_risk || 'low',
        provisional_score: r.provisional_score || 0,
        hero_score: r.hero_score || 0,
        avg_retail_price: r.avg_retail_price ?? r.avg_price ?? null,
        avg_cost_price: r.avg_cost_price ?? null,
        supplier_count: r.supplier_count || 0,
        competition_count: r.competition_count || 0,
        status: r.status || 'queued',
        rank: r.rank ?? null,
        next_refresh_at: r.next_refresh_at || null,
        last_researched_at: r.last_researched_at || null,
        updated_at: r.updated_at || new Date().toISOString()
      };
      stmt.run(params);
    }
  })();
}

export function dbFinishRun(row) {
  const db = getDB();
  db.prepare(`UPDATE research_runs SET
    status = ?, discovered_count = ?, product_count = ?, researched_count = ?, finished_at = ?
    WHERE run_id = ?`
  ).run(
    row.status || 'done', row.discovered_count || 0, row.product_count || 0,
    row.researched_count || 0, row.finished_at || new Date().toISOString(), row.run_id
  );
}

export function dbGetRankedTempProducts({ limit = 100, offset = 0, country, category, query } = {}) {
  const db = getDB();
  const where = [];
  const params = {};
  if (category && category !== 'all') {
    where.push("canonical_name LIKE :category OR brand LIKE :category");
    params.category = `%${category}%`;
  }
  if (query) {
    where.push("canonical_name LIKE :query");
    params.query = `%${query}%`;
  }

  const sql = `SELECT * FROM temp_trending_products
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY hero_score DESC, provisional_score DESC
               LIMIT :limit OFFSET :offset`;
  params.limit = limit;
  params.offset = offset;
  return db.prepare(sql).all(params);
}

export function dbGetWorkerStatus() {
  const db = getDB();
  const total = db.prepare('SELECT COUNT(*) AS count FROM temp_trending_products').get().count;
  const researched = db.prepare("SELECT COUNT(*) AS count FROM temp_trending_products WHERE status = 'researched'").get().count;
  const queued = db.prepare("SELECT COUNT(*) AS count FROM temp_trending_products WHERE status = 'queued'").get().count;
  const lastRun = db.prepare('SELECT * FROM research_runs ORDER BY started_at DESC LIMIT 1').get() || null;
  return {
    total,
    researched,
    queued,
    lastRun
  };
}

export function dbPruneTempTables({ maxSizeGb = 10 } = {}) {
  const db = getDB();
  const total = db.prepare('SELECT COUNT(*) AS count FROM temp_trending_products').get().count;
  if (total > 2000) {
    const keepIds = db.prepare('SELECT product_id FROM temp_trending_products ORDER BY hero_score DESC, provisional_score DESC LIMIT 2000').all().map(x => x.product_id);
    if (keepIds.length > 0) {
      const placeholders = keepIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM temp_trending_products WHERE product_id NOT IN (${placeholders})`).run(...keepIds);
      db.prepare(`DELETE FROM research_candidates WHERE run_id NOT IN (SELECT run_id FROM research_runs)`).run();
    }
  }
}

/* ── DISCOVERY STREAM HELPERS ─────────────────────────────── */

export function dbInitDiscoverySession(sessionId, location) {
  const db = getDB();
  db.prepare(`INSERT OR REPLACE INTO discovery_sessions (session_id, location, started_at, status)
                VALUES (?, ?, datetime('now'), 'active')`)
    .run(sessionId, JSON.stringify(location || {}));
}

export function dbUpdateDiscoverySession(sessionId, updates) {
  const db = getDB();
  const allowed = ['status', 'products_emitted', 'products_saved', 'categories_explored', 'ended_at'];
  const sets = [];
  const params = { session_id: sessionId };
  for (const [k, v] of Object.entries(updates)) {
    const col = k === 'productsEmitted' ? 'products_emitted' : k === 'productsSaved' ? 'products_saved' : k;
    if (!allowed.includes(col)) continue;
    sets.push(`${col} = :${col}`);
    params[col] = col === 'categories_explored' ? JSON.stringify(v || []) : v;
  }
  if (!sets.length) return;
  db.prepare(`UPDATE discovery_sessions SET ${sets.join(', ')} WHERE session_id = :session_id`).run(params);
}

export function dbGetDiscoverySession(sessionId) {
  const db = getDB();
  const row = db.prepare('SELECT * FROM discovery_sessions WHERE session_id = ?').get(sessionId);
  if (!row) return null;
  try { row.location = JSON.parse(row.location || '{}'); } catch { row.location = {}; }
  try { row.categories_explored = JSON.parse(row.categories_explored || '[]'); } catch { row.categories_explored = []; }
  return row;
}

export function dbRecordStreamProduct(sessionId, product, wasSaved) {
  getDB().prepare(`INSERT INTO stream_products (session_id, product_data, was_saved, emitted_at)
                   VALUES (?, ?, ?, datetime('now'))`)
         .run(sessionId, JSON.stringify(product || {}), wasSaved ? 1 : 0);
}

export function dbRecordCategoryOutcome(country, category, productsEmitted, productsSaved) {
  const saveRate = productsEmitted > 0 ? productsSaved / productsEmitted : 0;
  const db = getDB();
  const existing = db.prepare('SELECT avg_save_rate, last_discovery_count FROM category_heatmap WHERE country = ? AND category = ?')
                     .get(country, category);
  let newRate = saveRate;
  let newCount = productsEmitted;
  if (existing) {
    newRate = (existing.avg_save_rate * 0.7 + saveRate * 0.3);
    newCount = existing.last_discovery_count + productsEmitted;
  }
  db.prepare(`INSERT INTO category_heatmap (country, category, avg_save_rate, last_discovery_count, updated_at)
              VALUES (?, ?, ?, ?, datetime('now'))
              ON CONFLICT(country, category) DO UPDATE SET
                avg_save_rate = excluded.avg_save_rate,
                last_discovery_count = excluded.last_discovery_count,
                updated_at = excluded.updated_at`)
    .run(country, category, newRate, newCount);
}

export function dbGetBestCategory(country, excluded = []) {
  const db = getDB();
  const placeholders = excluded.map(() => '?').join(',');
  const sql = excluded.length
    ? `SELECT category, avg_save_rate, last_discovery_count FROM category_heatmap
       WHERE country = ? AND category NOT IN (${placeholders})
       ORDER BY avg_save_rate DESC, last_discovery_count DESC LIMIT 1`
    : `SELECT category, avg_save_rate, last_discovery_count FROM category_heatmap
       WHERE country = ? ORDER BY avg_save_rate DESC, last_discovery_count DESC LIMIT 1`;
  const row = db.prepare(sql).get(country, ...excluded);
  return row ? row.category : null;
}

export function dbLoadCategoryHeatmap(country) {
  return getDB().prepare(`SELECT category, avg_save_rate, last_discovery_count, updated_at
                          FROM category_heatmap WHERE country = ? ORDER BY avg_save_rate DESC`).all(country);
}

export function dbUpdateSiteScore(domain, category, country, product, wasSaved) {
  const db = getDB();
  const existing = db.prepare(`SELECT quality_score, success_rate, avg_margin FROM site_intelligence
                                 WHERE domain = ? AND category = ? AND country = ?`)
                     .get(domain, category, country);
  const feedback = wasSaved ? 1.0 : ((product?.margin || 0) > 40 ? 0.5 : 0.1);
  const qualityScore = existing ? (existing.quality_score * 0.9 + feedback * 0.1) : (0.5 * 0.9 + feedback * 0.1);
  const successRate = existing ? (existing.success_rate * 0.9 + (wasSaved ? 1 : 0) * 0.1) : (wasSaved ? 1 : 0);
  const avgMargin = existing ? (existing.avg_margin * 0.9 + (product?.margin || 0) * 0.1) : (product?.margin || 0);

  db.prepare(`INSERT INTO site_intelligence (domain, category, country, quality_score, success_rate, avg_margin, last_used)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(domain, category, country) DO UPDATE SET
                quality_score = excluded.quality_score,
                success_rate = excluded.success_rate,
                avg_margin = excluded.avg_margin,
                last_used = excluded.last_used`)
    .run(domain, category, country, qualityScore, successRate, avgMargin);
}

export function dbGetSiteIntelligence(category, country, limit = 4) {
  return getDB().prepare(`SELECT domain, category, country, quality_score, success_rate, avg_margin
                          FROM site_intelligence
                          WHERE category = ? AND country = ? AND is_active = 1
                          ORDER BY quality_score DESC LIMIT ?`)
                .all(category, country, limit);
}

export function dbLoadSiteScores(country) {
  return getDB().prepare(`SELECT domain, category, quality_score, success_rate, avg_margin
                          FROM site_intelligence
                          WHERE country = ? AND is_active = 1 ORDER BY quality_score DESC`).all(country);
}

export function dbSeedSiteIntelligence() {
  const db = getDB();
  const rows = [
    ['amazon.in', 'Electronics', 'India', 0.85],
    ['amazon.in', 'Kitchen & Dining', 'India', 0.80],
    ['amazon.in', 'Mobile Accessories', 'India', 0.88],
    ['flipkart.com', 'Electronics', 'India', 0.82],
    ['flipkart.com', 'Fashion Accessories', 'India', 0.78],
    ['flipkart.com', 'Mobile Accessories', 'India', 0.80],
    ['indiamart.com', 'Kitchen & Dining', 'India', 0.70],
    ['indiamart.com', 'Beauty & Personal Care', 'India', 0.65],
    ['tradeindia.com', 'Electronics', 'India', 0.60],
    ['tradeindia.com', 'Home Decor', 'India', 0.55]
  ];
  const stmt = db.prepare(`INSERT OR IGNORE INTO site_intelligence (domain, category, country, quality_score)
                             VALUES (?, ?, ?, ?)`);
  db.transaction(() => {
    for (const row of rows) stmt.run(...row);
  })();
}

// ─── Stream → Persistent Trending DB ────────────────────────────────

function _discProductId(name, country) {
  const raw = `${(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${(country || 'India').toLowerCase()}`;
  return 'disc_' + createHash('sha1').update(raw).digest('hex').slice(0, 14);
}

export function dbUpsertDiscoveredProduct(product) {
  const db      = getDB();
  const country = product.location?.country || 'India';

  const demandV  = Math.min(100, product.demandScore || 50);
  const marginQ  = Math.min(100, product.margin      || 0);
  const compGap  = (['low','Low'].includes(product.competition)  ? 80 :
                    ['high','High'].includes(product.competition) ? 20 : 50);
  const revSig   = Math.min(100, ((product.reviews || 0) / 1000) * 10);
  const heroScore = Math.min(100, Math.round(
    demandV * 0.28 + compGap * 0.14 + marginQ * 0.10 + revSig * 0.08
  ));

  const productId  = _discProductId(product.name, country);
  const now        = new Date().toISOString();
  const sourceSet  = JSON.stringify([product.sourceDomain || '']);
  const pricePoints = JSON.stringify([product.price || 0]);
  const reviewPoints = JSON.stringify([product.reviews || 0]);

  db.prepare(`
    INSERT INTO temp_trending_products (
      product_id, canonical_name, brand,
      avg_price, avg_retail_price, avg_cost_price,
      demand_velocity, competition_gap, margin_quality, review_signal,
      search_intent_strength, supply_reliability, price_stability, reorder_likelihood,
      hero_score, provisional_score,
      source_count, evidence_count, source_set, price_points, review_points,
      pricing_volatility, cluster_uncertainty, policy_risk,
      status, rank, updated_at, created_at
    ) VALUES (
      :productId, :name, NULL,
      :price, :price, :costPrice,
      :demand, :compGap, :marginQ, :revSig,
      :demand, 50, 60, 50,
      :heroScore, :heroScore,
      1, 1, :sourceSet, :pricePoints, :reviewPoints,
      'low', 'low', 'low',
      'queued', 9999, :now, :now
    )
    ON CONFLICT(product_id) DO UPDATE SET
      demand_velocity  = MAX(demand_velocity, excluded.demand_velocity),
      competition_gap  = MAX(competition_gap, excluded.competition_gap),
      margin_quality   = MAX(margin_quality, excluded.margin_quality),
      review_signal    = MAX(review_signal, excluded.review_signal),
      hero_score       = MIN(100, MAX(hero_score, excluded.hero_score)),
      avg_retail_price = CASE WHEN excluded.avg_retail_price > 0 THEN
                           ROUND(COALESCE(avg_retail_price,0)*0.7 + excluded.avg_retail_price*0.3, 2)
                           ELSE avg_retail_price END,
      avg_cost_price   = CASE WHEN excluded.avg_cost_price > 0 THEN
                           ROUND(COALESCE(avg_cost_price,0)*0.7 + excluded.avg_cost_price*0.3, 2)
                           ELSE avg_cost_price END,
      source_count   = source_count + 1,
      evidence_count = evidence_count + 1,
      updated_at     = excluded.updated_at
  `).run({ productId, name: product.name, price: product.price||0, costPrice: product.costPrice||0,
           demand: demandV, compGap, marginQ, revSig, heroScore,
           sourceSet, pricePoints, reviewPoints, now });

  // Refresh rank column (runs fast — only touches rows with rank=9999)
  try {
    db.prepare(`
      UPDATE temp_trending_products
      SET rank = (SELECT COUNT(*)+1 FROM temp_trending_products t2
                  WHERE t2.hero_score > temp_trending_products.hero_score)
      WHERE rank IS NULL OR rank = 9999
    `).run();
  } catch {}
}

export function dbBoostProductScore(canonicalName, country, delta) {
  getDB().prepare(`
    UPDATE temp_trending_products
    SET hero_score = MIN(100, MAX(0, hero_score + ?)),
        updated_at = datetime('now')
    WHERE canonical_name = ? AND country = ?
  `).run(delta, canonicalName, country || 'India');
}

export function dbGetTopDiscoveredProducts(country = 'India', limit = 100, offset = 0) {
  return getDB().prepare(`
    SELECT *,
           COALESCE(rank, 9999)                       AS rank_position,
           COALESCE(avg_retail_price, avg_price, 0)   AS display_price,
           COALESCE(margin_quality, 0)                 AS margin_pct,
           COALESCE(demand_velocity, 50)               AS demand_velocity,
           COALESCE(source_count, 1)                   AS platform_count,
           COALESCE(evidence_count, 1)                 AS research_depth,
           CASE WHEN hero_score >= 70 THEN 'high'
                WHEN hero_score >= 45 THEN 'medium'
                ELSE 'low' END                         AS confidence,
           CASE WHEN competition_gap >= 65 THEN 'Low'
                WHEN competition_gap >= 35 THEN 'Medium'
                ELSE 'High' END                        AS competition_level
    FROM temp_trending_products
    WHERE hero_score > 0 AND country = ?
    ORDER BY hero_score DESC, demand_velocity DESC
    LIMIT ? OFFSET ?
  `).all(country, limit, offset);
}
