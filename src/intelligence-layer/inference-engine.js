export class InferenceEngine {
  async compute(dossier) {
    const { reviews = 0, daysSinceFirstReview = 30, category = 'General' } = dossier;
    const multipliers = {
      Electronics: 75, Kitchen: 120, Fashion: 40, Beauty: 60,
      Toys: 90, 'Home Decor': 150, Sports: 80, General: 100,
    };
    const multiplier          = multipliers[category] || 100;
    const dailySales          = (reviews / Math.max(daysSinceFirstReview, 1)) * multiplier;
    const totalMarketEstimate = (dailySales * 30) / 0.30;
    return {
      dailySalesEstimate:   Math.round(dailySales),
      monthlySalesEstimate: Math.round(dailySales * 30),
      totalMarketEstimate:  Math.round(totalMarketEstimate),
      reviewToSalesMultiplier: multiplier,
      computedAt: new Date().toISOString(),
    };
  }
}
