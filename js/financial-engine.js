/**
 * ECO Financial Engine v2.2
 * Calculates all seller financial metrics: EBITDA, P&L, Cash Flow, ROI, ROAS, EOQ, etc.
 * Pure vanilla JS — no dependencies.
 */

const FinancialEngine = (function() {
  'use strict';

  // ─── Core Metrics ───
  function calculateGrossProfit(revenue, cogs) {
    return revenue - cogs;
  }

  function calculateGrossMargin(revenue, cogs) {
    if (!revenue) return 0;
    return ((revenue - cogs) / revenue) * 100;
  }

  function calculateContributionMargin(revenue, variableCosts) {
    return revenue - variableCosts;
  }

  function calculateContributionMarginPercent(revenue, variableCosts) {
    if (!revenue) return 0;
    return ((revenue - variableCosts) / revenue) * 100;
  }

  function calculateEBITDA(revenue, cogs, operatingExpenses) {
    return revenue - cogs - operatingExpenses;
  }

  function calculateEBITDAMargin(revenue, cogs, operatingExpenses) {
    if (!revenue) return 0;
    return ((revenue - cogs - operatingExpenses) / revenue) * 100;
  }

  function calculateNetProfit(revenue, cogs, operatingExpenses, interest, tax, depreciation) {
    return revenue - cogs - operatingExpenses - interest - tax - depreciation;
  }

  function calculateNetProfitMargin(revenue, cogs, operatingExpenses, interest, tax, depreciation) {
    if (!revenue) return 0;
    const net = revenue - cogs - operatingExpenses - interest - tax - depreciation;
    return (net / revenue) * 100;
  }

  function calculateROI(netProfit, investment) {
    if (!investment) return 0;
    return (netProfit / investment) * 100;
  }

  function calculateROAS(revenueFromAds, adSpend) {
    if (!adSpend) return 0;
    return revenueFromAds / adSpend;
  }

  function calculateBreakEvenUnits(fixedCosts, unitPrice, variableCostPerUnit) {
    const contribution = unitPrice - variableCostPerUnit;
    if (contribution <= 0) return Infinity;
    return Math.ceil(fixedCosts / contribution);
  }

  function calculateBreakEvenDays(breakEvenUnits, dailySalesRate) {
    if (!dailySalesRate) return Infinity;
    return Math.ceil(breakEvenUnits / dailySalesRate);
  }

  function calculatePaybackPeriod(initialInvestment, monthlyNetCashFlow) {
    if (!monthlyNetCashFlow || monthlyNetCashFlow <= 0) return Infinity;
    return initialInvestment / monthlyNetCashFlow;
  }

  function calculateCashConversionCycle(dio, dso, dpo) {
    return dio + dso - dpo;
  }

  function calculateWorkingCapital(inventoryValue, accountsReceivable, accountsPayable) {
    return inventoryValue + accountsReceivable - accountsPayable;
  }

  function calculateUnitEconomics(unitPrice, cogsPerUnit, platformFeePerUnit, shippingPerUnit, packagingPerUnit, adSpendPerUnit, returnCostPerUnit) {
    const totalCost = cogsPerUnit + platformFeePerUnit + shippingPerUnit + packagingPerUnit + adSpendPerUnit + returnCostPerUnit;
    return {
      revenue: unitPrice,
      totalCost: totalCost,
      profit: unitPrice - totalCost,
      margin: unitPrice ? ((unitPrice - totalCost) / unitPrice) * 100 : 0
    };
  }

  function calculateLTV(aov, purchaseFrequency, lifespanYears) {
    return aov * purchaseFrequency * lifespanYears;
  }

  function calculateLTVCAC(ltv, cac) {
    if (!cac) return 0;
    return ltv / cac;
  }

  function calculateEOQ(annualDemand, orderingCostPerOrder, holdingCostPerUnitPerYear) {
    if (!holdingCostPerUnitPerYear || !annualDemand) return 0;
    return Math.ceil(Math.sqrt((2 * annualDemand * orderingCostPerOrder) / holdingCostPerUnitPerYear));
  }

  function calculateReorderPoint(leadTimeDays, dailySalesRate, safetyStock) {
    return (leadTimeDays * dailySalesRate) + safetyStock;
  }

  function calculateSafetyStock(zScore, leadTimeDays, stdDevDemand) {
    return Math.ceil(zScore * Math.sqrt(leadTimeDays) * stdDevDemand);
  }

  function calculateInventoryCarryingCost(avgInventoryValue, holdingCostPercentAnnual) {
    return (avgInventoryValue * holdingCostPercentAnnual) / 12;
  }

  function calculateOperatingLeverage(percentChangeEBIT, percentChangeRevenue) {
    if (!percentChangeRevenue) return 0;
    return percentChangeEBIT / percentChangeRevenue;
  }

  function calculatePriceElasticity(percentChangeQuantity, percentChangePrice) {
    if (!percentChangePrice) return 0;
    return percentChangeQuantity / percentChangePrice;
  }

  // ─── Product Full Analysis ───
  function analyzeProduct(p) {
    const revenue = (p.sellingPrice || 0) * (p.monthlyUnits || 100);
    const cogs = (p.basePrice || 0) * (p.monthlyUnits || 100);
    const platformFees = (p.platformFees || 0) * (p.monthlyUnits || 100);
    const shipping = (p.shippingCost || 0) * (p.monthlyUnits || 100);
    const packaging = (p.packagingCost || 0) * (p.monthlyUnits || 100);
    const adSpend = (p.adSpendMonthly || 0);
    const returns = (p.returnRate || 0.05) * revenue;
    const operatingExpenses = (p.operatingExpensesMonthly || 0);
    const interest = (p.loanInterest || 0);
    const tax = (p.taxRate || 0.18) * (revenue - cogs - operatingExpenses - interest);
    const depreciation = (p.depreciationMonthly || 0);
    const investment = (p.initialInvestment || cogs + operatingExpenses);
    const monthlyNetCashFlow = revenue - cogs - platformFees - shipping - packaging - adSpend - returns - operatingExpenses - tax;

    const unitPrice = p.sellingPrice || 0;
    const cogsPerUnit = p.basePrice || 0;
    const platformFeePerUnit = p.platformFees || 0;
    const shippingPerUnit = p.shippingCost || 0;
    const packagingPerUnit = p.packagingCost || 0;
    const adSpendPerUnit = p.adSpendMonthly ? p.adSpendMonthly / (p.monthlyUnits || 100) : 0;
    const returnCostPerUnit = (p.returnRate || 0.05) * unitPrice;
    const fixedCosts = operatingExpenses + (p.rent || 0) + (p.salaries || 0) + (p.utilities || 0);
    const variableCostPerUnit = cogsPerUnit + platformFeePerUnit + shippingPerUnit + packagingPerUnit + adSpendPerUnit + returnCostPerUnit;

    const grossProfit = calculateGrossProfit(revenue, cogs);
    const grossMargin = calculateGrossMargin(revenue, cogs);
    const ebitda = calculateEBITDA(revenue, cogs, operatingExpenses);
    const ebitdaMargin = calculateEBITDAMargin(revenue, cogs, operatingExpenses);
    const netProfit = calculateNetProfit(revenue, cogs, operatingExpenses, interest, tax, depreciation);
    const netProfitMargin = calculateNetProfitMargin(revenue, cogs, operatingExpenses, interest, tax, depreciation);
    const roi = calculateROI(netProfit, investment);
    const roas = calculateROAS(revenue * (p.adConversionRate || 0.02), adSpend);
    const breakEvenUnits = calculateBreakEvenUnits(fixedCosts, unitPrice, variableCostPerUnit);
    const breakEvenDays = calculateBreakEvenDays(breakEvenUnits, p.dailySalesRate || 3);
    const paybackPeriod = calculatePaybackPeriod(investment, monthlyNetCashFlow);
    const ccc = calculateCashConversionCycle(p.dio || 30, p.dso || 15, p.dpo || 30);
    const workingCapital = calculateWorkingCapital(cogs, p.accountsReceivable || 0, p.accountsPayable || 0);
    const unitEcon = calculateUnitEconomics(unitPrice, cogsPerUnit, platformFeePerUnit, shippingPerUnit, packagingPerUnit, adSpendPerUnit, returnCostPerUnit);
    const ltv = calculateLTV(p.aov || unitPrice, p.purchaseFrequency || 2, p.lifespanYears || 2);
    const ltvCac = calculateLTVCAC(ltv, p.cac || adSpend / (p.monthlyUnits || 100));
    const eoq = calculateEOQ((p.monthlyUnits || 100) * 12, p.orderingCost || 500, p.holdingCostPerUnit || 10);
    const safetyStock = calculateSafetyStock(p.zScore || 1.65, p.leadTime || 14, p.stdDevDemand || 5);
    const reorderPoint = calculateReorderPoint(p.leadTime || 14, p.dailySalesRate || 3, safetyStock);
    const carryingCost = calculateInventoryCarryingCost(cogs * 0.5, p.holdingCostPercent || 0.25);

    return {
      revenue, cogs, grossProfit, grossMargin,
      contributionMargin: revenue - (cogs + platformFees + shipping + packaging + adSpend + returns),
      contributionMarginPercent: calculateContributionMarginPercent(revenue, cogs + platformFees + shipping + packaging + adSpend + returns),
      ebitda, ebitdaMargin,
      netProfit, netProfitMargin,
      roi, roas,
      breakEvenUnits, breakEvenDays,
      paybackPeriod,
      cashConversionCycle: ccc,
      workingCapital,
      unitEconomics: unitEcon,
      lifetimeValue: ltv,
      customerAcquisitionCost: p.cac || adSpend / (p.monthlyUnits || 100),
      ltvCacRatio: ltvCac,
      economicOrderQuantity: eoq,
      safetyStock,
      reorderPoint,
      inventoryCarryingCost: carryingCost,
      operatingLeverage: calculateOperatingLeverage(p.ebitChange || 10, p.revenueChange || 15),
      priceElasticity: calculatePriceElasticity(p.quantityChange || -5, p.priceChange || 10),
      monthlyNetCashFlow,
      investment,
      fixedCosts,
      variableCostPerUnit,
      tax
    };
  }

  // ─── Monthly P&L Generator ───
  function generateMonthlyPL(product, months = 12) {
    const base = analyzeProduct(product);
    const pl = [];
    for (let i = 0; i < months; i++) {
      const seasonality = 1 + (Math.sin((i / 12) * Math.PI * 2) * (product.seasonalityAmplitude || 0.2));
      const revenue = base.revenue * seasonality;
      const cogs = base.cogs * seasonality;
      const grossProfit = revenue - cogs;
      const opex = base.fixedCosts;
      const ebitda = grossProfit - opex;
      const tax = Math.max(0, ebitda * (product.taxRate || 0.18));
      const netProfit = ebitda - tax - (product.depreciationMonthly || 0) - (product.loanInterest || 0);
      pl.push({
        month: i + 1,
        monthName: new Date(2026, i, 1).toLocaleString('en', { month: 'short' }),
        revenue: Math.round(revenue),
        cogs: Math.round(cogs),
        grossProfit: Math.round(grossProfit),
        grossMargin: revenue ? ((grossProfit / revenue) * 100).toFixed(1) : 0,
        operatingExpenses: Math.round(opex),
        ebitda: Math.round(ebitda),
        ebitdaMargin: revenue ? ((ebitda / revenue) * 100).toFixed(1) : 0,
        tax: Math.round(tax),
        depreciation: product.depreciationMonthly || 0,
        interest: product.loanInterest || 0,
        netProfit: Math.round(netProfit),
        netProfitMargin: revenue ? ((netProfit / revenue) * 100).toFixed(1) : 0,
        seasonality: seasonality.toFixed(2)
      });
    }
    return pl;
  }

  // ─── 13-Week Cash Flow Projection ───
  function generateCashFlowProjection(product, weeks = 13) {
    const base = analyzeProduct(product);
    const cf = [];
    let cashBalance = product.initialCash || base.workingCapital;
    for (let i = 0; i < weeks; i++) {
      const inflow = base.monthlyNetCashFlow / 4.33;
      const outflow = (base.cogs / 12) / 4.33 + (base.fixedCosts / 4.33);
      const netFlow = inflow - outflow;
      cashBalance += netFlow;
      cf.push({
        week: i + 1,
        inflow: Math.round(inflow),
        outflow: Math.round(outflow),
        netFlow: Math.round(netFlow),
        cashBalance: Math.round(cashBalance),
        runwayWeeks: outflow > 0 ? Math.round(cashBalance / outflow) : 999
      });
    }
    return cf;
  }

  // ─── Formatters ───
  function formatCurrency(value, currency = 'INR') {
    const symbols = { INR: '₹', USD: '$', GBP: '£', EUR: '€', AED: 'AED ' };
    const sym = symbols[currency] || symbols.INR;
    if (value === Infinity || value === -Infinity || isNaN(value)) return sym + '—';
    return sym + Math.round(value).toLocaleString('en-IN');
  }

  function formatPercent(value, decimals = 1) {
    if (value === Infinity || isNaN(value)) return '—%';
    return value.toFixed(decimals) + '%';
  }

  function formatDays(value) {
    if (value === Infinity || isNaN(value)) return '—';
    return Math.round(value) + ' days';
  }

  function getMetricColor(value, type) {
    const thresholds = {
      margin: { good: 30, warn: 15 },
      roi: { good: 50, warn: 20 },
      roas: { good: 3, warn: 1.5 },
      ltvCac: { good: 3, warn: 1.5 },
      payback: { good: 90, warn: 180 }, // lower is better
      stockout: { good: 30, warn: 15 }
    };
    const t = thresholds[type];
    if (!t) return '';
    const isLowerBetter = type === 'payback';
    if (isLowerBetter) {
      if (value <= t.good) return 'good';
      if (value <= t.warn) return 'warn';
      return 'bad';
    }
    if (value >= t.good) return 'good';
    if (value >= t.warn) return 'warn';
    return 'bad';
  }

  // ─── Public API ───
  return {
    analyzeProduct,
    generateMonthlyPL,
    generateCashFlowProjection,
    formatCurrency,
    formatPercent,
    formatDays,
    getMetricColor,
    // Raw functions for advanced use
    calculateGrossProfit, calculateGrossMargin, calculateEBITDA, calculateEBITDAMargin,
    calculateNetProfit, calculateNetProfitMargin, calculateROI, calculateROAS,
    calculateBreakEvenUnits, calculateBreakEvenDays, calculatePaybackPeriod,
    calculateCashConversionCycle, calculateWorkingCapital, calculateUnitEconomics,
    calculateLTV, calculateLTVCAC, calculateEOQ, calculateReorderPoint,
    calculateSafetyStock, calculateInventoryCarryingCost
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FinancialEngine;
}
