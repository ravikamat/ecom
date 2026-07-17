import { BaseAgent } from './base-agent.js';

class CriticAgent extends BaseAgent {
  constructor(aiGateway) {
    super('Critic', aiGateway);
  }

  async review(researchResults) {
    const review = await this.execute(researchResults, `
Review the following research results for logical consistency, data quality, and bias:
${JSON.stringify(researchResults, null, 2)}

Identify any red flags, missing data, or questionable assumptions.
`);

    return {
      ...review,
      redFlags: review.response?.redFlags || [],
      confidenceAdjustment: review.response?.confidenceAdjustment || 0,
      requiresReanalysis: review.response?.requiresReanalysis || false,
    };
  }
}

export { CriticAgent };
