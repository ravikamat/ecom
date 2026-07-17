import { Router } from 'express';
import { ProductService } from '../../../services/product.service.js';
import { validate } from '../middleware/validate.middleware.js';
import { ProductSearchSchema } from '../schemas/product.schema.js';

const router = Router();

// GET /api/v1/products - List products with pagination
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, country } = req.query;
    const result = await ProductService.list({ page: parseInt(page), limit: parseInt(limit), category, country });
    res.json({ success: true, data: result.products, pagination: result.pagination });
  } catch (err) { next(err); }
});

// GET /api/v1/products/:id - Get single product
router.get('/:id', async (req, res, next) => {
  try {
    const product = await ProductService.getById(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

export default router;
