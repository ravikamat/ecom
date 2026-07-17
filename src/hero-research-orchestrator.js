import crypto from "node:crypto";

const HERO_SCORE_WEIGHTS = {
  demand_velocity: 0.28,
  search_intent_strength: 0.18,
  competition_gap: 0.14,
  supply_reliability: 0.12,
  margin_quality: 0.10,
  review_signal: 0.08,
  price_stability: 0.05,
  reorder_likelihood: 0.05
};

const HERO_SCORE_PENALTIES = {
  low_evidence: 8,
  single_source_dependency: 7,
  high_policy_risk: 10,
  volatile_pricing: 6,
  duplicate_cluster_uncertainty: 5
};

function norm(s = "") {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeJsonParse(text, fallback = null) {
  if (!text) return fallback;
  try {
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return fallback;
  }
}

function canonicalKey(row) {
  const parts = [
    norm(row.canonical_name || row.title || row.name),
    norm(row.brand),
    norm(row.size),
    norm(row.variant),
    norm(row.material)
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" | ");
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(v || 0)));
}

function computeHeroScore(p) {
  const base =
    clamp(p.demand_velocity) * HERO_SCORE_WEIGHTS.demand_velocity +
    clamp(p.search_intent_strength) * HERO_SCORE_WEIGHTS.search_intent_strength +
    clamp(p.competition_gap) * HERO_SCORE_WEIGHTS.competition_gap +
    clamp(p.supply_reliability) * HERO_SCORE_WEIGHTS.supply_reliability +
    clamp(p.margin_quality) * HERO_SCORE_WEIGHTS.margin_quality +
    clamp(p.review_signal) * HERO_SCORE_WEIGHTS.review_signal +
    clamp(p.price_stability) * HERO_SCORE_WEIGHTS.price_stability +
    clamp(p.reorder_likelihood) * HERO_SCORE_WEIGHTS.reorder_likelihood;

  let penalty = 0;
  if ((p.evidence_count || 0) < 3) penalty += HERO_SCORE_PENALTIES.low_evidence;
  if ((p.source_count || 0) < 2) penalty += HERO_SCORE_PENALTIES.single_source_dependency;
  if (p.policy_risk === "high") penalty += HERO_SCORE_PENALTIES.high_policy_risk;
  if (p.pricing_volatility === "high") penalty += HERO_SCORE_PENALTIES.volatile_pricing;
  if (p.cluster_uncertainty === "high") penalty += HERO_SCORE_PENALTIES.duplicate_cluster_uncertainty;

  return Math.round(Math.max(0, Math.min(100, base - penalty)));
}

function hashId(prefix, payload) {
  return `${prefix}_${crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 14)}`;
}

async function callModel({ aiClient, systemPrompt, userPayload, temperature = 0.1, maxTokens = 4000 }) {
  const raw = await aiClient.queryWithSystem(
    JSON.stringify(userPayload),
    systemPrompt,
    { temperature, max_tokens: maxTokens }
  );
  const parsed = safeJsonParse(raw);
  if (!parsed) {
    console.error("[Orchestrator] Model raw output was:", raw);
    throw new Error("Model returned invalid JSON or empty output");
  }
  return parsed;
}

async function runDiscoveryBatch({ planner, scrapeFns, runId }) {
  const jobs = planner.query_intents.map(intent => ({
    intent,
    promise: Promise.allSettled(
      (intent.target_sources || []).map(source =>
        scrapeFns.search({
          query: intent.query,
          source,
          limit: intent.intent_type === "broad" ? 40 : 20
        })
      )
    )
  }));

  const results = [];
  for (const job of jobs) {
    const settled = await job.promise;
    for (const res of settled) {
      if (res.status !== "fulfilled") continue;
      const rows = Array.isArray(res.value) ? res.value : [];
      for (const row of rows) {
        results.push({
          candidate_id: hashId("cand", [runId, job.intent.intent_id, row.title || row.name, row.url]),
          run_id: runId,
          intent_id: job.intent.intent_id,
          source: row.source || row.platform || "unknown",
          title: row.title || row.name || null,
          brand: row.brand || null,
          size: row.size || null,
          variant: row.variant || null,
          material: row.material || null,
          price: row.price ?? null,
          rating: row.rating ?? null,
          reviews: row.reviews ?? null,
          seller: row.seller || null,
          url: row.url || null,
          raw_json: JSON.stringify(row),
          scraped_at: new Date().toISOString()
        });
      }
    }
  }
  return results;
}

function clusterCandidates(candidates) {
  const map = new Map();
  for (const c of candidates) {
    const key = canonicalKey(c);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        product_id: hashId("prod", key),
        canonical_name: c.title,
        brand: c.brand,
        size: c.size,
        variant: c.variant,
        material: c.material,
        evidence_count: 0,
        source_set: new Set(),
        price_points: [],
        review_points: [],
        seed_rows: []
      });
    }
    const item = map.get(key);
    item.evidence_count += 1;
    item.source_set.add(c.source);
    if (c.price != null) item.price_points.push(Number(c.price));
    if (c.reviews != null) item.review_points.push(Number(c.reviews));
    item.seed_rows.push(c);
  }

  return [...map.values()].map(x => ({
    ...x,
    source_count: x.source_set.size,
    avg_price: x.price_points.length ? x.price_points.reduce((a, b) => a + b, 0) / x.price_points.length : null,
    avg_reviews: x.review_points.length ? x.review_points.reduce((a, b) => a + b, 0) / x.review_points.length : null,
    source_set: [...x.source_set]
  }));
}

function buildProvisionalScores(products) {
  return products.map(p => {
    const demand_velocity = Math.min(100, 30 + (p.evidence_count * 8) + Math.min(20, p.source_count * 6));
    const search_intent_strength = Math.min(100, 45 + p.evidence_count * 4);
    const competition_gap = p.source_count >= 3 ? 55 : 40;
    const supply_reliability = p.source_count >= 2 ? 60 : 35;
    const margin_quality = 50;
    const review_signal = Math.min(100, Math.log10((p.avg_reviews || 1) + 1) * 25);
    const price_stability = p.price_points.length >= 2 ? 65 : 40;
    const reorder_likelihood = 50;

    const provisional = {
      ...p,
      demand_velocity,
      search_intent_strength,
      competition_gap,
      supply_reliability,
      margin_quality,
      review_signal,
      price_stability,
      reorder_likelihood,
      pricing_volatility: "low",
      cluster_uncertainty: p.evidence_count === 1 ? "high" : "low",
      policy_risk: "low"
    };

    return {
      ...provisional,
      provisional_score: computeHeroScore(provisional)
    };
  });
}

export async function deepResearchProducts({ products, scrapeFns, maxItems }) {
  const picked = products
    .filter(p => p.provisional_score >= 45 && p.evidence_count >= 2)
    .sort((a, b) => b.provisional_score - a.provisional_score)
    .slice(0, maxItems);

  const enriched = await Promise.all(picked.map(async p => {
    const [retail, suppliers, competition] = await Promise.allSettled([
      scrapeFns.priceComparison({ query: p.canonical_name }),
      scrapeFns.suppliers({ query: p.canonical_name }),
      scrapeFns.competition({ query: p.canonical_name })
    ]);

    const retailRows = retail.status === "fulfilled" ? retail.value : [];
    const supplierRows = suppliers.status === "fulfilled" ? suppliers.value : [];
    const compRows = competition.status === "fulfilled" ? competition.value : [];

    const avgRetail = retailRows.length ? retailRows.reduce((a, b) => a + Number(b.price || 0), 0) / retailRows.length : null;
    const avgCost = supplierRows.length ? supplierRows.reduce((a, b) => a + Number(b.price || 0), 0) / supplierRows.length : null;
    const marginQuality = (avgRetail && avgCost && avgRetail > 0)
      ? clamp(((avgRetail - avgCost) / avgRetail) * 100)
      : 0;

    const hasSupplierEvidence = supplierRows.length > 0;
    const supplierName = hasSupplierEvidence ? supplierRows[0].name : null;

    const enrichedRow = {
      ...p,
      avg_retail_price: avgRetail,
      avg_cost_price: avgCost,
      supplier_count: supplierRows.length,
      competition_count: compRows.length,
      supplier_name: supplierName,
      demand_velocity: clamp(p.demand_velocity + Math.min(10, retailRows.length * 2)),
      supply_reliability: clamp((supplierRows.length * 15) + (p.source_count * 8)),
      competition_gap: clamp(100 - Math.min(90, compRows.length * 8)),
      margin_quality: clamp(marginQuality),
      price_stability: retailRows.length >= 3 ? 70 : 45,
      reorder_likelihood: /daily|gift|kids|home|kitchen|bottle|tumbler|organizer/i.test(p.canonical_name) ? 65 : 50,
      evidence_count: p.evidence_count + retailRows.length + supplierRows.length + compRows.length,
      source_count: new Set([
        ...p.source_set,
        ...retailRows.map(r => r.source || r.platform),
        ...supplierRows.map(r => r.source || r.platform),
        ...compRows.map(r => r.source || r.platform)
      ].filter(Boolean)).size,
      status: "researched",
      last_researched_at: new Date().toISOString()
    };

    return {
      ...enrichedRow,
      hero_score: computeHeroScore(enrichedRow)
    };
  }));

  return enriched;
}

export async function runFullResearchCycle({
  aiClient,
  plannerSystemPrompt,
  criticSystemPrompt,
  minimaxClient,
  db,
  scrapeFns,
  country = "India",
  category = "all",
  userQuery = null
}) {
  const runId = hashId("run", [Date.now(), country, category, userQuery]);

  await db.insertRun({
    run_id: runId,
    run_mode: userQuery ? "search_session" : "trending_seed",
    country,
    category,
    query: userQuery,
    status: "running",
    started_at: new Date().toISOString()
  });

  const plan = await callModel({
    aiClient,
    systemPrompt: plannerSystemPrompt,
    userPayload: {
      run_mode: userQuery ? "search_session" : "trending_seed",
      country,
      category,
      user_query: userQuery,
      constraints: {
        max_discovery_queries: 24,
        max_parallel_scrapers: 8,
        max_deep_research_items_per_cycle: 12,
        max_products_to_persist_per_cycle: 250,
        strict_no_hallucination: true
      }
    }
  });

  const candidates = await runDiscoveryBatch({ planner: plan.planner, scrapeFns, runId });
  await db.insertCandidates(candidates);

  const clustered = clusterCandidates(candidates);
  const provisional = buildProvisionalScores(clustered);
  await db.upsertTempProducts(provisional.map(p => ({
    ...p,
    status: "queued",
    updated_at: new Date().toISOString()
  })));

  const enriched = await deepResearchProducts({
    products: provisional,
    scrapeFns,
    maxItems: plan.research_policy?.deep_research_threshold ? 12 : 8
  });

  let finalRows = [...provisional];
  const enrichedMap = new Map(enriched.map(x => [x.product_id, x]));
  finalRows = finalRows.map(x => enrichedMap.get(x.product_id) || x)
    .sort((a, b) => (b.hero_score || b.provisional_score) - (a.hero_score || a.provisional_score));

  if (minimaxClient) {
    try {
      const critique = await callModel({
        aiClient: minimaxClient,
        systemPrompt: criticSystemPrompt,
        userPayload: {
          ranked_products: finalRows.slice(0, 100).map(p => ({
            product_id: p.product_id,
            canonical_name: p.canonical_name,
            evidence_count: p.evidence_count,
            source_count: p.source_count,
            avg_retail_price: p.avg_retail_price ?? null,
            avg_cost_price: p.avg_cost_price ?? null,
            provisional_score: p.provisional_score ?? null,
            hero_score: p.hero_score ?? null
          }))
        },
        temperature: 0.0,
        maxTokens: 2000
      });

      const adjustmentMap = new Map((critique.score_adjustments || []).map(a => [a.target_id, a.delta]));
      finalRows = finalRows.map(p => ({
        ...p,
        hero_score: clamp((p.hero_score ?? p.provisional_score ?? 0) + (adjustmentMap.get(p.product_id) || 0))
      })).sort((a, b) => b.hero_score - a.hero_score);
    } catch (e) {
      console.warn("[Orchestrator] MiniMax critique failed, skipping adjustments:", e.message);
    }
  }

  await db.upsertTempProducts(finalRows.map((p, i) => ({
    ...p,
    rank: i + 1,
    status: p.status || "researched",
    next_refresh_at: new Date(Date.now() + ((i < 50 ? 30 : i < 200 ? 120 : 480) * 60 * 1000)).toISOString(),
    updated_at: new Date().toISOString()
  })));

  await db.finishRun({
    run_id: runId,
    status: "done",
    discovered_count: candidates.length,
    product_count: finalRows.length,
    researched_count: enriched.length,
    finished_at: new Date().toISOString()
  });

  return {
    run_id: runId,
    total_candidates: candidates.length,
    total_products: finalRows.length,
    researched_count: enriched.length,
    top_products: finalRows.slice(0, 100)
  };
}
