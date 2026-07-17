import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { QueueEvents } from 'bullmq';
import { aiLogger } from '../infrastructure/logger.js';
import { researchQueue, redis } from '../infrastructure/queue.js';

export class ResearchService {
  static activeJobs = new Map();

  static async start(request) {
    const jobId = uuidv4();
    const emitter = new EventEmitter();

    const jobState = {
      id: jobId,
      status: 'queued',
      progress: 0,
      phases: [],
      result: null,
      emitter,
      createdAt: new Date(),
    };

    this.activeJobs.set(jobId, jobState);

    aiLogger.info({ jobId, query: request.query }, 'Research job queued');

    // Enqueue job via BullMQ wrapper
    await researchQueue.add('research:run', { id: jobId, payload: request }, { jobId });

    return { id: jobId };
  }

  static async getStatus(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      phases: job.phases,
      createdAt: job.createdAt,
    };
  }

  static async getStream(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) throw new Error('Job not found');
    return job.emitter;
  }
}

let queueEvents = null;
if (!researchQueue.useFallback) {
  queueEvents = new QueueEvents('research', { connection: redis });
  
  queueEvents.on('error', (err) => {
    aiLogger.warn(`QueueEvents warning: ${err.message}`);
  });

  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    const job = ResearchService.activeJobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.progress = 100;
      job.result = returnvalue;
      job.emitter.emit('data', { status: 'completed', result: returnvalue });
      job.emitter.emit('end');
    }
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    const job = ResearchService.activeJobs.get(jobId);
    if (job) {
      const progressVal = parseInt(data);
      job.progress = progressVal;
      job.emitter.emit('data', { progress: progressVal });
    }
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    const job = ResearchService.activeJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.emitter.emit('data', { status: 'failed', error: failedReason });
      job.emitter.emit('end');
    }
  });
}
