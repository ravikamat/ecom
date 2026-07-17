import { Router } from 'express';
import { SupplierService } from '../../../services/supplier.service.js';

const router = Router();

// GET /api/v1/suppliers - List discovered suppliers
router.get('/', async (req, res, next) => {
  try {
    const { productName, category, country, minConfidence } = req.query;
    const suppliers = await SupplierService.find({ productName, category, country, minConfidence: parseFloat(minConfidence || 0) });
    res.json({ success: true, data: suppliers });
  } catch (err) { next(err); }
});

// POST /api/v1/suppliers/discover - Trigger supplier discovery
router.post('/discover', async (req, res, next) => {
  try {
    const job = await SupplierService.startDiscovery(req.body);
    res.status(202).json({ success: true, data: { jobId: job.id } });
  } catch (err) { next(err); }
});

export default router;
