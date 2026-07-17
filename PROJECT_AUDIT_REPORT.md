# ECO Command Center - Project Audit Report

> Audit generated: 2026-07-16
> Scope: Backend (server.js, src/*, db/*), frontend (js/*, index.html), and package configuration.

---

## 1. Executive Summary

The project already implements the **endless discovery loop** you described:

1. User chooses a location (country / city).
2. AI scouts trending categories for that location.
3. Engine picks the best sites for the chosen category.
4. AI plans deep-search queries.
5. Scraper mines listings.
6. Each product is enriched and streamed one-by-one via SSE.
7. User save/skip feedback updates the site/category intelligence.
8. Loop repeats - switching categories automatically if engagement is low.

The engine for this is in `src/discovery-stream-engine.js` and is served by the `/api/discovery/stream` route. The UI is in `js/discovery-stream.js` and mounts inside `index.html` page `#page-discovery`.

That flow is **functionally present**, but there are several runtime bugs, mismatches, and unfinished integrations that will prevent it from working reliably in production.

---

## 2. How the Current Endless Loop Works (File Map)

| Phase | File | Key Functions / Lines | Status |
|-------|------|------------------------|--------|
| Location capture | js/discovery-stream.js | _start() line 185 | User picks country/city/currency |
| Location capture | server.js | /api/discovery/stream route lines 595-623 | Receives query params |
| Category scout | src/discovery-stream-engine.js | scoutCategories() lines 288-307 | GLM -> MiniMax -> Ollama fallback |
| Site intelligence | src/discovery-stream-engine.js | selectSites() 309-325, getBestSites() 219-225 | Uses DB scores or AI fallback |
| Query planning | src/discovery-stream-engine.js | planQueries() lines 327-345 | AI generates 6 search queries |
| Product mining | src/discovery-stream-engine.js | ProductMiner.mine() lines 400-429 | Amazon / Flipkart / Meesho / eBay / Google |
| Stream one-by-one | src/discovery-stream-engine.js | Loop lines 541-638 | SSE emit per product |
| Feedback loop | src/discovery-stream-engine.js | handleSave() 652, handleSkip() 662 | Updates site/category heatmaps |
| Persistence | db/sqlite.js | dbUpsertDiscoveredProduct() 1051-1118 | Saves to temp_trending_products |
| Trending top-100 | js/trending.js | renderDiscoveryTop() lines 232-380 | Ranks by hero_score |

---

## 3. Working Files / Correct Architecture

| File | Role | Notes |
|------|------|-------|
| package.json | Project config | "type": "module" is correctly set; import/export syntax is consistent. |
| server.js | Main HTTP server | ~3,357 lines. Routes static files, API endpoints, SSE stream, AI proxy, DB handlers, worker loop. |
| scraper.js | Crawlee wrapper | Exports scrapeProducts() and parsers for Amazon, Google, Flipkart, eBay. |
| src/discovery-stream-engine.js | Endless discovery core | Implements self-improving loop with 3-tier AI fallback + SSE. |
| src/hero-research-orchestrator.js | Research planner/critic | Plan -> scrape -> cluster -> score -> deep research -> MiniMax critic -> persist. |
| db/sqlite.js | SQLite access layer | ES module. Schema, CRUD, cache, heatmap, site intelligence, discovery helpers. |
| js/discovery-stream.js | Stream UI | DiscoveryStreamUI class renders cards, handles SSE, save/skip, category pills. |
| js/trending.js | Trending + top-100 | Renders temp_trending_products and integrates stream discoveries. |
| index.html | Shell | Contains #page-discovery mount point and loads scripts in order. |

---

## 4. Bug Register (File + Line + Severity)

### Critical Bugs

| # | Bug | File | Lines | Impact | Suggested Fix |
|---|-----|------|-------|--------|---------------|
| C1 | Broken Authorization header in AI key test. testAPIKey() references undefined variables cfg and key in the header fallback chain. | server.js | 777 | API key test sends empty token, causing false negatives. | Replace chain with direct apiKey param: `'Authorization': 'Bearer ' + apiKey`. |
| C2 | Agent chat final answer bypasses 3-tier fallback. handleAgentChat() branch at lines 1788-1810 makes raw https.request to NVIDIA with same broken cfg/key chain. | server.js | 1788-1810 | Chat final answer fails when GLM is down, returns hardcoded error. | Replace raw HTTPS call with callAI(messages, {...}). |
| C3 | handleAIProxy() rejects requests when cloud key is missing, even if Ollama is available. | server.js | 1197-1203 | /api/ai returns 503 before attempting callAI() fallback. | Remove early 503 or only fail if both cloud and Ollama are unavailable. |
| C4 | handleAgentChat() adds invalid role: 'system' and role: 'tool' messages to the array sent to AI. | server.js | 1780-1781 | GLM / MiniMax may reject non-standard roles. | Convert system/tool messages to user/assistant before calling callAI(). |
| C5 | hero-research-orchestrator.js crashes if AI call fails. callModel() throws when JSON parse fails and no fallback exists. | src/hero-research-orchestrator.js | 77-89 | Background worker silently dies on first AI failure. | Wrap callModel() in try/catch inside runFullResearchCycle() and return fallback plan. |
| C6 | Discovery stream feedback route does not validate productId and calls engine inconsistently. | server.js | 626-635 | feedback endpoint brittle; no request validation. | Pass productId and validate sessionId + product before forwarding. |
| C7 | Supplier auto-discover references non-existent table trending_products. | server.js | 2794-2796 | Query throws; schema only has temp_trending_products. | Change table name to temp_trending_products. |

### Medium Bugs

| # | Bug | File | Lines | Impact | Suggested Fix |
|---|-----|------|-------|--------|---------------|
| M1 | dbGetDashboardStats() calculates totalCapital but does not return it. | db/sqlite.js | 676-693 | Dashboard Est. Working Capital shows 0 permanently. | Add totalCapital to returned object. |
| M2 | dbGetTopDiscoveredProducts() ignores country parameter. | db/sqlite.js | 1129-1148 | /api/discovery/top?country=USA still returns India products. | Add WHERE country = ? filter. |
| M3 | dbBoostProductScore() ignores country parameter. | db/sqlite.js | 1120-1127 | Boosting affects all countries with same canonical name. | Add AND country = ? to UPDATE. |
| M4 | Discovery stream inserts products with status='discovered', but worker only refreshes status='queued' or stale rows. | src/discovery-stream-engine.js 1072-1088, server.js 3254-3258 | Stream products never get automated deep-research updates. | Insert with status='queued'. |
| M5 | ProductMiner._buildUrls() hardcodes Google Shopping URL to India for all countries. | src/discovery-stream-engine.js | 458 | Non-India locations get irrelevant Google results. | Build Google URL from country domain like Amazon. |
| M6 | db/schema.sql is orphaned - it is never executed. | db/schema.sql | entire file | db/sqlite.js has embedded initSchema(); two sources of truth. | Delete schema.sql or load it from sqlite.js and remove embedded schema. |
| M7 | Rate-limit map ipRequests grows forever and is never pruned. | server.js | 1353-1370 | Memory leak on long-running server. | Delete map entry when filtered timestamp array is empty. |
| M8 | Search pagination always renders pages 1-5 regardless of actual data. | js/search.js | 707-718 | Shows irrelevant page buttons; no pages > 5. | Generate buttons based on current page and hasMore. |
| M9 | Discovery stream UI calls saveProduct() with price/costPrice, but dbInsertSaved expects sp/cp. | js/discovery-stream.js | 405-423 | Saved stream products may have zero/null pricing. | Remap fields to sp/cp before calling saveProduct(). |
| M10 | Server stop action suspends API but does not abort active SSE discovery streams. | server.js | 3287-3291 | Streams continue after Stop Server. | Track active SSE sessions and call stopStream(sid) on stop. |
| M11 | handleSupplierAutoDiscover() uses deprecated await db.all(...) fallback and wrong table. | server.js | 2793-2799 | Will throw at runtime. | Fix table name and remove fallback. |

### Minor / Code-Quality Issues

| # | Issue | File | Lines | Suggested Fix |
|---|-------|------|-------|---------------|
| Q1 | Long decorative comment lines bloat server.js and hurt readability. | server.js | Many | Use short section headers or split into modules. |
| Q2 | extractJSON() duplicates ai-engine.js parseJSON() logic. | server.js 1164-1182, js/ai-engine.js 76-132 | Centralize in a shared utility. |
| Q3 | preOptimizePrompt() in server.js is defined but never called. | server.js 201-208 | Remove it or wire it into callAI(). |
| Q4 | handleMultiPageResearch() ignores requested country and always uses 'India'. | server.js 1263 | Accept country from request body. |
| Q5 | scraper.js deduplication key only uses first 25 chars of normalized name. | scraper.js 211 | Increase length or add secondary hash. |
| Q6 | Uses node:sqlite / DatabaseSync which requires Node 22+. No runtime check. | db/sqlite.js 7 | Add Node version check at startup with clear error. |
| Q7 | Discovery stream site-intelligence defaults only seeded for India. | db/sqlite.js 1023-1042 | Seed defaults for all supported countries. |

---

## 5. Status vs. Your Desired Flow

| Requirement | Implementation | Gaps |
|-------------|----------------|------|
| User picks location | OK - js/discovery-stream.js form | City not heavily used by AI prompts |
| AI scouts best categories | OK - scoutCategories() | Heatmap queried; static fallback works |
| AI picks best data source | OK - selectSites() + getBestSites() | Defaults only for India |
| Deep search latest products | OK - ProductMiner + planQueries() | Google URL hardcoded to India |
| Stream one-by-one | OK - SSE event per product | UI keeps last 50 cards only |
| Endless loop + auto category switch | OK - loop in startStream() 541-638 | minSaveRate threshold may switch too aggressively |
| Temporal memory / local storage | OK - TemporalMemory + SQLite | Stream products not marked queued for worker |
| Feedback improves loop | OK - handleSave / handleSkip | UI mapping to sp/cp is fragile |

---

## 6. Recommended Priority Fixes

1. Fix C1 and C2 (broken Authorization headers).
2. Fix C3 so /api/ai can fall back to Ollama when no cloud key is set.
3. Fix C5 so the background worker does not crash on first AI failure.
4. Fix M1-M3 for dashboard capital and country-filtered discovery top-100.
5. Fix M4 by inserting stream products with status='queued' so worker deep-researches them.
6. Fix M9 so saved stream products carry correct sp/cp.
7. Consolidate db/schema.sql with db/sqlite.js schema.
8. Add Node 22+ runtime check at startup.

---

## 7. Quick Smoke-Test Checklist

- [ ] node server.js starts without DatabaseSync error.
- [ ] Saving a GLM API key and clicking Test returns valid.
- [ ] Opening Live Stream -> Start -> products stream one-by-one.
- [ ] Clicking Save on a stream product updates stats and persists to Saved List.
- [ ] Switching country to USA returns products for that country.
- [ ] Trending page shows stream discoveries under top-100 section.
- [ ] Agent chat reaches a final answer after tool calls.

---

End of report.
