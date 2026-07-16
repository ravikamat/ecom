import { callAI, extractJSON } from './ai-gateway.js';

const PLATFORM_FEES = { India: 0.15, USA: 0.30, UK: 0.25, Germany: 0.25, Australia: 0.22 };

export class FinancialModeler {
  async run(dossier) {
    const { productName = '', country = 'India', sp = 0, cp = 0 } = dossier;
    const platformFee = PLATFORM_FEES[country] || 0.25;
    const returnRate  = 0.15;
    const marketing   = 0.20;
    const landedCost  = cp * 1.15;
    const netMargin   = sp - landedCost - (sp * platformFee) - (sp * returnRate) - (sp * marketing);
    const roi         = landedCost > 0 ? (netMargin / landedCost) * 100 : 0;
    const breakEven   = landedCost > 0 ? Math.ceil(landedCost / (sp * (1 - platformFee - returnRate - marketing))) : 0;

    const result = await callAI([{
      role: 'user',
      content: `Given SP=${sp}, CP=${cp}, country=${country}, platformFee=${platformFee}: Return JSON: {landed_cost, net_margin_per_unit, break_even_units, roi_percent, cash_conversion_days, eoq, annualized_roi, price_elasticity, confidence}.`,
    }], { temperature: 0.2, max_tokens: 1000, purpose: 'financial' });

    let aiData = {};
    try { aiData = JSON.parse(extractJSON(result.content)); } catch {}
    return { ...aiData, computed: { landedCost, netMargin, roi, breakEven, platformFee } };
  }
}
