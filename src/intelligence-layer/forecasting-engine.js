import { DatabaseSync } from 'node:sqlite';
import { logger } from '../infrastructure/logger.js';

class DemandForecastingEngine {
  constructor() {
    this.db = new DatabaseSync(process.env.DB_PATH || './eco.db');
  }

  async forecast(productId, daysAhead = 30) {
    const history = this.db.prepare(`
      SELECT 
        date(saved_at) as day,
        daily_sales,
        demand_velocity,
        search_intent_strength,
        margin
      FROM saved_products sp
      LEFT JOIN temp_trending_products ttp ON sp.name = ttp.canonical_name
      WHERE sp.id = ? AND sp.saved_at > datetime('now', '-90 days')
      ORDER BY day
    `).all(productId);

    if (history.length < 7) {
      return { 
        error: 'Insufficient data (minimum 7 days required)',
        dataPoints: history.length,
      };
    }

    const n = history.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    history.forEach((h, i) => {
      const x = i;
      const y = h.daily_sales || h.demand_velocity || 0;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const forecasts = [];
    const lastValues = history[history.length - 1];

    for (let i = 1; i <= daysAhead; i++) {
      const predicted = intercept + slope * (n + i);

      const demandDecay = Math.pow(0.98, i);
      const seasonality = 1 + 0.1 * Math.sin((n + i) * 2 * Math.PI / 30);

      const adjusted = Math.max(0, predicted * demandDecay * seasonality);

      forecasts.push({
        day: i,
        date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
        predictedSales: Math.round(adjusted),
        confidenceLower: Math.round(adjusted * 0.7),
        confidenceUpper: Math.round(adjusted * 1.3),
      });
    }

    const trend = slope > 0.5 ? 'strong_up' : 
                  slope > 0 ? 'up' : 
                  slope > -0.5 ? 'down' : 'strong_down';

    const recommendation = this.generateRecommendation(trend, forecasts, lastValues);

    this.cacheForecast(productId, forecasts);

    return {
      productId,
      forecasts,
      trend,
      recommendation,
      model: 'linear_regression_v1',
      dataPoints: history.length,
      r2: this.calculateR2(history, slope, intercept),
    };
  }

  calculateR2(history, slope, intercept) {
    const yMean = history.reduce((sum, h) => sum + (h.daily_sales || 0), 0) / history.length;
    let ssRes = 0, ssTot = 0;

    history.forEach((h, i) => {
      const y = h.daily_sales || 0;
      const yPred = intercept + slope * i;
      ssRes += Math.pow(y - yPred, 2);
      ssTot += Math.pow(y - yMean, 2);
    });

    return 1 - (ssRes / ssTot);
  }

  generateRecommendation(trend, forecasts, lastValues) {
    const avgForecast = forecasts.reduce((sum, f) => sum + f.predictedSales, 0) / forecasts.length;
    const currentSales = lastValues.daily_sales || 0;

    if (trend === 'strong_up' && avgForecast > currentSales * 1.5) {
      return 'Demand surging — increase inventory and consider premium pricing';
    } else if (trend === 'up') {
      return 'Steady growth — maintain current stock levels';
    } else if (trend === 'down' && avgForecast < currentSales * 0.7) {
      return 'Declining demand — reduce inventory, consider promotions';
    } else {
      return 'Stable demand — monitor competitor activity';
    }
  }

  cacheForecast(productId, forecasts) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO demand_forecasts 
      (product_id, forecast_date, predicted_sales, confidence_lower, confidence_upper, model_version, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    forecasts.forEach(f => {
      stmt.run(productId, f.date, f.predictedSales, f.confidenceLower, f.confidenceUpper, 'linear_v1');
    });
  }
}

export { DemandForecastingEngine };
