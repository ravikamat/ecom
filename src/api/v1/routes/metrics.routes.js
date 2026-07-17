import { Router } from 'express';
import { MetricsService } from '../../../services/metrics.service.js';

const router = Router();

// GET /api/v1/metrics - System metrics
router.get('/', async (req, res, next) => {
  try {
    const metrics = await MetricsService.getMetrics();
    res.json({ success: true, data: metrics });
  } catch (err) { next(err); }
});

// GET /api/v1/metrics/cache - Cache statistics
router.get('/cache', async (req, res, next) => {
  try {
    const stats = await MetricsService.getCacheStats();
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
});

export default router;
