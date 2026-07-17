import { callAI, extractJSON } from './ai-gateway.js';

export class MarketValidator {
  async run(dossier) {
    const { productName = '', country = 'India' } = dossier;
    const result = await callAI([
      { role: 'user', content: `Validate market opportunity for "${productName}" in ${country}. Return JSON: {tam, sam, som, competition_level, barrier_to_entry, estimated_cac, confidence}.` },
    ], { temperature: 0.3, max_tokens: 1200, purpose: 'validation' });
    try { return JSON.parse(extractJSON(result.content)); }
    catch { return { competition_level: 'medium', confidence: 'low', fallback: true }; }
  }
}
