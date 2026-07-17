import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { logger } from './logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let useFallback = true;
let redis = null;

// Single tester socket for lazy connection
const tester = new Redis(redisUrl, {
  maxRetriesPerRequest: 0,
  connectTimeout: 1000,
  lazyConnect: true,
});

tester.on('error', () => {
  // Silent fallback handler to prevent unhandled process crashes
});

try {
  logger.info(`[Redis] Connecting to ${redisUrl}...`);
  await tester.connect();
  logger.info('[Redis] Online. Initializing BullMQ core.');
  useFallback = false;
  redis = tester;
} catch (err) {
  logger.warn(`[Redis] Offline (${err.message}). Activating in-memory fallback.`);
  useFallback = true;
  try { tester.disconnect(); } catch {}
}

class QueueWrapper {
  constructor(name) {
    this.name = name;
    this.realQueue = null;
    this.useFallback = useFallback;
  }

  async add(jobName, data, opts = {}) {
    if (this.useFallback) {
      logger.info(`[Queue:${this.name}] Running job in-memory (Redis offline): ${jobName}`);
      
      if (this.name === 'research') {
        if (jobName === 'research:run') {
          const { ResearchStateMachine } = await import('../workers/research.worker.js');
          const { ResearchService } = await import('../services/research.service.js');
          
          const sm = new ResearchStateMachine(data.id, data.payload);
          
          setImmediate(async () => {
            try {
              const resVal = await sm.execute();
              const job = ResearchService.activeJobs.get(data.id);
              if (job) {
                job.status = 'completed';
                job.progress = 100;
                job.result = resVal;
                job.emitter.emit('data', JSON.stringify({ status: 'completed', result: resVal }));
                job.emitter.emit('end');
              }
            } catch (err) {
              logger.error({ err: err.message }, 'In-memory job execution failed');
              const job = ResearchService.activeJobs.get(data.id);
              if (job) {
                job.status = 'failed';
                job.emitter.emit('data', JSON.stringify({ status: 'failed', error: err.message }));
                job.emitter.emit('end');
              }
            }
          });
        } else if (jobName === 'phase:completed') {
          const { ResearchService } = await import('../services/research.service.js');
          const job = ResearchService.activeJobs.get(data.jobId);
          if (job) {
            const phases = ['signal-detection', 'market-validation', 'supplier-archaeology', 'financial-modeling', 'execution-planning'];
            const phaseIndex = phases.indexOf(data.phase);
            job.progress = Math.round(((phaseIndex + 1) / phases.length) * 100);
            job.phases.push({ name: data.phase, status: 'completed', result: data.result });
            job.emitter.emit('data', JSON.stringify({ phase: data.phase, status: 'completed', progress: job.progress, result: data.result }));
          }
        }
      }
      return { id: data.id || opts.jobId || 'mem-job' };
    }

    if (!this.realQueue) {
      this.realQueue = new Queue(this.name, { connection: redis });
    }
    return this.realQueue.add(jobName, data, opts);
  }
}

// Define queues wrapped with fallbacks
export const researchQueue = new QueueWrapper('research');
export const discoveryQueue = new QueueWrapper('discovery');
export const scraperQueue = new QueueWrapper('scraper');
export const aiQueue = new QueueWrapper('ai');

// Event definitions
export const Events = {
  RESEARCH: {
    REQUESTED: 'research:requested',
    PHASE_COMPLETED: 'research:phase:completed',
    PHASE_FAILED: 'research:phase:failed',
    AI_INVOKED: 'research:ai:invoked',
    AI_FAILED: 'research:ai:failed',
    RESULT_READY: 'research:result:ready',
  },
  DISCOVERY: {
    SESSION_STARTED: 'discovery:session:started',
    PRODUCT_FOUND: 'discovery:product:found',
    SESSION_ENDED: 'discovery:session:ended',
  },
};

export async function publishEvent(queue, eventType, payload) {
  if (queue.useFallback) {
    logger.info({ eventType, payload: payload.id }, 'In-memory event published');
    return;
  }
  try {
    await queue.add(eventType, payload, {
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    });
    logger.info({ eventType, payload: payload.id }, 'Event published');
  } catch (err) {
    logger.warn(`Failed to publish event to queue: ${err.message}`);
  }
}

export { redis };
