import { Router } from 'express';
import { SavedService } from '../../../services/saved.service.js';

const router = Router();

// GET /api/v1/saved - List saved products
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, filter, sortBy } = req.query;
    const result = await SavedService.list({ page: parseInt(page), limit: parseInt(limit), filter, sortBy });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/v1/saved - Save a product
router.post('/', async (req, res, next) => {
  try {
    const saved = await SavedService.create(req.body);
    res.status(201).json({ success: true, data: saved });
  } catch (err) { next(err); }
});

// DELETE /api/v1/saved/:id - Remove saved product
router.delete('/:id', async (req, res, next) => {
  try {
    await SavedService.delete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { next(err); }
});

// GET /api/v1/saved/:id - Get saved product detail
router.get('/:id', async (req, res, next) => {
  try {
    const product = await SavedService.getById(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

export default router;
