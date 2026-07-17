import { Router } from 'express';
import { CalculatorService } from '../../../services/calculator.service.js';

const router = Router();

// POST /api/v1/calc/true-cost - Calculate true landed cost
router.post('/true-cost', async (req, res, next) => {
  try {
    const result = await CalculatorService.calculateTrueCost(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/v1/calc/roi - Calculate ROI projection
router.post('/roi', async (req, res, next) => {
  try {
    const result = await CalculatorService.calculateROI(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
