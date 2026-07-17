import { Router } from 'express';
import { HealthService } from '../../../services/health.service.js';

const router = Router();

// GET /api/v1/health - System health check
router.get('/', async (req, res, next) => {
  try {
    const health = await HealthService.check();
    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json({ success: health.healthy, data: health });
  } catch (err) { next(err); }
});

export default router;
