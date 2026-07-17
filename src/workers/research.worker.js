import { Worker } from 'bullmq';
import { redis, researchQueue } from '../infrastructure/queue.js';
import { eventStore } from '../infrastructure/event-store.js';
import { aiLogger } from '../infrastructure/logger.js';
import { AIGateway } from '../intelligence-layer/ai-gateway.js';

const PHASES = [
  { name: 'signal-detection', handler: runSignalDetection },
  { name: 'market-validation', handler: runMarketValidation },
  { name: 'supplier-archaeology', handler: runSupplierArchaeology },
  { name: 'financial-modeling', handler: runFinancialModeling },
  { name: 'execution-planning', handler: runExecutionPlanning },
];

class ResearchStateMachine {
  constructor(jobId, request) {
    this.jobId = jobId;
    this.request = request;
    this.streamId = `research:${jobId}`;
    this.ai = new AIGateway();
  }

  async execute() {
    eventStore.append(this.streamId, 'research:started', {
      query: this.request.query,
      country: this.request.country,
    });

    const results = {};

    for (const phase of PHASES) {
      try {
        aiLogger.info({ jobId: this.jobId, phase: phase.name }, 'Phase starting');

        const phaseResult = await phase.handler(this.request, results, this.ai);
        results[phase.name] = phaseResult;

        eventStore.append(this.streamId, 'research:phase:completed', {
          phase: phase.name,
          result: phaseResult,
        });

        await researchQueue.add('phase:completed', {
          jobId: this.jobId,
          phase: phase.name,
          result: phaseResult,
        });

      } catch (error) {
        aiLogger.error({ jobId: this.jobId, phase: phase.name, error: error.message }, 'Phase failed');

        eventStore.append(this.streamId, 'research:phase:failed', {
          phase: phase.name,
          error: error.message,
        });

        throw error;
      }
    }

    const finalResult = this.compileResults(results);

    eventStore.append(this.streamId, 'research:completed', {
      result: finalResult,
    });

    return finalResult;
  }

  compileResults(results) {
    const weights = {
      'signal-detection': 0.15,
      'market-validation': 0.25,
      'supplier-archaeology': 0.20,
      'financial-modeling': 0.25,
      'execution-planning': 0.15,
    };

    let totalScore = 0;
    for (const [phase, result] of Object.entries(results)) {
      totalScore += (result.score || 50) * weights[phase];
    }

    return {
      overallScore: Math.round(totalScore),
      phases: results,
      recommendation: totalScore > 75 ? 'Strong opportunity' : 
                      totalScore > 50 ? 'Moderate opportunity' : 'High risk',
    };
  }
}

// Phase handlers
async function runSignalDetection(request, context, ai) {
  const prompt = `Analyze search trends and social signals for "${request.query}" in ${request.country}. Return JSON: {keywords: string[], demandVelocity: number, searchIntentStrength: number, score: number}`;
  const result = await ai.callWithRAG(prompt, { query: request.query, country: request.country });
  return { ...result, score: result.searchIntentStrength || 50 };
}

async function runMarketValidation(request, context, ai) {
  const prompt = `Estimate TAM, SAM, SOM for "${request.query}" in ${request.country}. Return JSON: {tam: number, sam: number, som: number, barriers: string[], score: number}`;
  const result = await ai.callWithRAG(prompt, context);
  return { ...result, score: result.tam > 1000000 ? 80 : 50 };
}

async function runSupplierArchaeology(request, context, ai) {
  // Scraper queue triggers supplier check in Phase 3
  return { suppliersFound: 0, score: 60 };
}

async function runFinancialModeling(request, context, ai) {
  const prompt = `Calculate landed unit cost, break-even, and ROI for "${request.query}". Return JSON: {unitCost: number, breakEvenUnits: number, roi: number, score: number}`;
  const result = await ai.callWithRAG(prompt, context);
  return { ...result, score: result.roi > 0.3 ? 85 : 50 };
}

async function runExecutionPlanning(request, context, ai) {
  const prompt = `Create a 90-day launch timeline for "${request.query}" in ${request.country}. Return JSON: {timeline: string[], channels: string[], score: number}`;
  const result = await ai.callWithRAG(prompt, context);
  return { ...result, score: 70 };
}

// BullMQ Worker (Only instantiated when Redis is online)
let researchWorker = null;
if (!researchQueue.useFallback) {
  researchWorker = new Worker('research', async (job) => {
    const { id, payload } = job.data;
    const sm = new ResearchStateMachine(id, payload);
    return await sm.execute();
  }, { connection: redis, concurrency: 2 });

  researchWorker.on('completed', (job) => {
    aiLogger.info({ jobId: job.id }, 'Research job completed');
  });

  researchWorker.on('failed', (job, err) => {
    aiLogger.error({ jobId: job.id, error: err.message }, 'Research job failed');
  });

  researchWorker.on('error', (err) => {
    aiLogger.warn(`Research worker connection warning: ${err.message}`);
  });
}

export { ResearchStateMachine };
