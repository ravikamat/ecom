-- Event Store (for audit trail & replay)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  stream_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSON NOT NULL,
  metadata JSON,
  version INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_stream ON events(stream_id, version);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(stream_type, event_type, created_at);

-- Agent memory (for multi-agent system)
CREATE TABLE IF NOT EXISTS agent_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  research_id TEXT,
  context_hash TEXT,
  memory_type TEXT CHECK(memory_type IN ('short', 'long', 'episodic')) DEFAULT 'short',
  content JSON NOT NULL,
  importance_score REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_accessed DATETIME
);
CREATE INDEX IF NOT EXISTS idx_agent_memory ON agent_memory(agent_name, research_id, importance_score DESC);

-- Demand forecast cache
CREATE TABLE IF NOT EXISTS demand_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  forecast_date DATE NOT NULL,
  predicted_sales INTEGER,
  confidence_lower INTEGER,
  confidence_upper INTEGER,
  model_version TEXT DEFAULT 'v1',
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_forecasts_product ON demand_forecasts(product_id, forecast_date);

-- API rate limiting (SQLite fallback)
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  requests INTEGER DEFAULT 1,
  window_start DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rate_limit ON rate_limit_log(client_id, endpoint, window_start);

-- Research job tracking
CREATE TABLE IF NOT EXISTS research_jobs (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  country TEXT NOT NULL,
  category TEXT,
  status TEXT CHECK(status IN ('queued', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  result JSON,
  error TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_research_status ON research_jobs(status, created_at);

-- Enhanced supplier tracking
CREATE TABLE IF NOT EXISTS supplier_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id TEXT NOT NULL,
  product_id INTEGER,
  relationship_type TEXT CHECK(relationship_type IN ('prospect', 'negotiating', 'active', 'dormant', 'blacklisted')),
  contact_history JSON,
  deal_terms JSON,
  trust_score REAL,
  last_contact DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Competitive intelligence snapshots
CREATE TABLE IF NOT EXISTS competitive_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  country TEXT NOT NULL,
  snapshot_data JSON NOT NULL,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_competitive ON competitive_snapshots(category, country, generated_at);
