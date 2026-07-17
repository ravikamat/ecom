import { Router } from 'express';
import { ResearchService } from '../../../services/research.service.js';
import { ResearchRequestSchema } from '../schemas/research.schema.js';
import { validate } from '../middleware/validate.middleware.js';

const router = Router();

// POST /api/v1/research - Start research pipeline
router.post('/', validate(ResearchRequestSchema), async (req, res, next) => {
  try {
    const job = await ResearchService.start(req.body);
    res.status(202).json({ success: true, data: { jobId: job.id, status: 'queued' } });
  } catch (err) { next(err); }
});

// GET /api/v1/research/:id - Get research status
router.get('/:id', async (req, res, next) => {
  try {
    const status = await ResearchService.getStatus(req.params.id);
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
});

// GET /api/v1/research/:id/stream - SSE stream for real-time updates
router.get('/:id/stream', async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await ResearchService.getStream(req.params.id);
    stream.on('data', (chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`));
    stream.on('end', () => res.end());
    req.on('close', () => stream.destroy());
  } catch (err) { next(err); }
});

export default router;
