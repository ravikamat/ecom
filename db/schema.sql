-- ============================================================
-- ECO Supplier Discovery Engine Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS discovered_suppliers (
    id TEXT PRIMARY KEY,
    product_name TEXT NOT NULL,
    category TEXT,
    company_name TEXT,
    emails TEXT,              -- JSON array
    phones TEXT,              -- JSON array
    mobiles TEXT,             -- JSON array
    addresses TEXT,           -- JSON array
    website TEXT,
    source_url TEXT,
    source_domain TEXT,
    confidence REAL,
    trust_score INTEGER,
    geo TEXT DEFAULT 'India',
    discovered_at TEXT,
    status TEXT DEFAULT 'new',   -- new|contacted|responded|qualified|rejected
    notes TEXT,
    user_rating INTEGER
);

CREATE TABLE IF NOT EXISTS supplier_sources (
    domain TEXT PRIMARY KEY,
    source_type TEXT,          -- b2b_portal|search_result|directory|social
    success_rate REAL DEFAULT 0,
    avg_contacts_found REAL DEFAULT 0,
    last_used TEXT,
    quality_score REAL DEFAULT 0.5,
    is_active INTEGER DEFAULT 1,
    attempt_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    first_seen TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keyword_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT,
    product_category TEXT,
    success INTEGER,           -- 1 = useful, 0 = not useful
    used_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keyword_templates (
    keyword TEXT PRIMARY KEY,
    score REAL,
    category TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed initial high-value sources
INSERT OR IGNORE INTO supplier_sources (domain, source_type, quality_score) VALUES
('indiamart.com', 'b2b_portal', 0.85),
('tradeindia.com', 'b2b_portal', 0.80),
('exportersindia.com', 'b2b_portal', 0.65),
('alibaba.com', 'b2b_portal', 0.75),
('made-in-china.com', 'b2b_portal', 0.55),
('1688.com', 'b2b_portal', 0.45),
('justdial.com', 'directory', 0.50),
('sulekha.com', 'directory', 0.40),
('indiamart.in', 'b2b_portal', 0.85),
('tradeindia.in', 'b2b_portal', 0.80);
