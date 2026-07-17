export class CalculatorService {
  static async calculateTrueCost(body) {
    const {
      unitPrice = 0,
      cogsPerUnit = 0,
      platformFeePerUnit = 0,
      shippingPerUnit = 0,
      packagingPerUnit = 0,
      adSpendPerUnit = 0,
      returnCostPerUnit = 0,
    } = body;

    const totalCost = cogsPerUnit + platformFeePerUnit + shippingPerUnit + packagingPerUnit + adSpendPerUnit + returnCostPerUnit;
    const profit = unitPrice - totalCost;
    const margin = unitPrice ? (profit / unitPrice) * 100 : 0;

    return {
      totalCost,
      profit,
      margin,
      unitPrice,
    };
  }

  static async calculateROI(body) {
    const { netProfit = 0, investment = 0 } = body;
    const roi = investment ? (netProfit / investment) * 100 : 0;
    return {
      roi,
      netProfit,
      investment,
    };
  }
}
