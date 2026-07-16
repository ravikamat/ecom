import { callAI, extractJSON } from './ai-gateway.js';

export class SignalDetector {
  async run(dossier) {
    const { category = 'General', country = 'India' } = dossier;
    const result = await callAI([
      { role: 'user', content: `Find trending signals for category: "${category}" in ${country}. Return JSON: {trending_keywords, demand_velocity, seasonality_score, confidence}.` },
    ], { temperature: 0.4, max_tokens: 1000, purpose: 'signal' });
    try { return JSON.parse(extractJSON(result.content)); }
    catch { return { trending_keywords: [], demand_velocity: 50, seasonality_score: 0.5, confidence: 'low', fallback: true }; }
  }
}
