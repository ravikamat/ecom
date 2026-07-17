import { Router } from 'express';
import { DiscoveryService } from '../../../services/discovery.service.js';

const router = Router();

// GET /api/v1/discovery/stream - SSE discovery stream
router.get('/stream', async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = DiscoveryService.startStream(req.query);
    stream.on('data', (data) => res.write(`data: ${JSON.stringify(data)}\n\n`));
    req.on('close', () => stream.stop());
  } catch (err) { next(err); }
});

// POST /api/v1/discovery/categories - Set active categories
router.post('/categories', async (req, res, next) => {
  try {
    await DiscoveryService.setCategories(req.body.categories);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
