import { callAI, extractJSON } from './ai-gateway.js';

export class ExecutionPlanner {
  async run(dossier) {
    const summary = JSON.stringify({ productName: dossier.productName, country: dossier.country, phases: dossier.phases });
    const result  = await callAI([{
      role: 'user',
      content: `Create launch playbook for: ${summary}. Return JSON: {launch_window, peak_months, clearance_window, day_of_week_best, hour_of_day_best, marketing_channels, content_strategy, budget_allocation, risk_mitigation}.`,
    }], { temperature: 0.6, max_tokens: 1500, purpose: 'execution' });
    try { return JSON.parse(extractJSON(result.content)); }
    catch { return { marketing_channels: ['Amazon', 'Flipkart'], fallback: true }; }
  }
}
