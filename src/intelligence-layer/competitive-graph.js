import { DatabaseSync } from 'node:sqlite';
import { logger } from '../infrastructure/logger.js';

class CompetitiveGraph {
  constructor() {
    this.db = new DatabaseSync(process.env.DB_PATH || './eco.db');
  }

  buildGraph(productCategory, country = 'IN') {
    const products = this.db.prepare(`
      SELECT sp.*, p.platform, p.commission_rate
      FROM saved_products sp
      LEFT JOIN platforms p ON sp.country = p.country
      WHERE sp.category = ? AND (sp.country = ? OR ? IS NULL)
    `).all(productCategory, country, country);

    const nodes = products.map(p => ({
      id: p.id,
      type: 'product',
      label: p.name,
      margin: p.margin,
      demand: p.demand,
      platform: p.platform,
      score: this.calculateNodeScore(p),
    }));

    const edges = [];

    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        const marginDiff = Math.abs(products[i].margin - products[j].margin);
        const demandDiff = Math.abs(products[i].demand - products[j].demand);

        if (marginDiff < 15 && demandDiff < 500) {
          edges.push({
            source: products[i].id,
            target: products[j].id,
            type: 'competitor',
            weight: 1 - (marginDiff / 15) * 0.5 - (demandDiff / 500) * 0.5,
            similarity: 'high',
          });
        }
      }
    }

    const platformGroups = {};
    products.forEach(p => {
      if (!platformGroups[p.platform]) platformGroups[p.platform] = [];
      platformGroups[p.platform].push(p);
    });

    Object.values(platformGroups).forEach(group => {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          edges.push({
            source: group[i].id,
            target: group[j].id,
            type: 'same_platform',
            weight: 0.3,
          });
        }
      }
    });

    return { nodes, edges, metadata: { category: productCategory, country, nodeCount: nodes.length, edgeCount: edges.length } };
  }

  calculateNodeScore(product) {
    const marginWeight = 0.4;
    const demandWeight = 0.35;
    const competitionWeight = 0.25;

    const marginScore = Math.min(product.margin / 50, 1) * 100;
    const demandScore = Math.min(product.demand / 1000, 1) * 100;
    const competitionScore = product.competition === 'low' ? 100 : product.competition === 'medium' ? 60 : 30;

    return Math.round(marginScore * marginWeight + demandScore * demandWeight + competitionScore * competitionWeight);
  }

  findArbitrageOpportunities() {
    return this.db.prepare(`
      SELECT 
        sp.name,
        sp.category,
        sp.margin as our_margin,
        sp.demand,
        sp.country,
        si.platform,
        si.avg_margin as platform_avg_margin,
        si.competition_level,
        (sp.margin - si.avg_margin) as margin_advantage,
        (sp.demand / NULLIF(si.competition_level, 0)) as opportunity_score,
        CASE 
          WHEN sp.margin > si.avg_margin * 1.3 AND si.competition_level < 4 THEN 'strong_buy'
          WHEN sp.margin > si.avg_margin * 1.1 AND si.competition_level < 6 THEN 'buy'
          WHEN sp.margin < si.avg_margin * 0.8 THEN 'avoid'
          ELSE 'hold'
        END as signal
      FROM saved_products sp
      JOIN site_intelligence si ON sp.category = si.category AND sp.country = si.country
      WHERE sp.margin > si.avg_margin * 1.1
        AND sp.demand > 100
      ORDER BY opportunity_score DESC
      LIMIT 20
    `).all();
  }

  findMarketGaps(category) {
    return this.db.prepare(`
      SELECT 
        ttp.canonical_name as product_name,
        ttp.category,
        ttp.demand_velocity,
        ttp.search_intent_strength,
        ttp.competition_gap,
        ttp.margin_quality,
        (ttp.demand_velocity * ttp.search_intent_strength / NULLIF(ttp.competition_gap, 0)) as gap_score
      FROM temp_trending_products ttp
      WHERE ttp.category = ?
        AND ttp.competition_gap > 50
        AND ttp.demand_velocity > 30
        AND ttp.margin_quality > 60
      ORDER BY gap_score DESC
      LIMIT 10
    `).all(category);
  }
}

export { CompetitiveGraph };
