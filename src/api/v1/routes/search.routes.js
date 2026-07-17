import { Router } from 'express';
import { SearchService } from '../../../services/search.service.js';
import { SearchSchema } from '../schemas/search.schema.js';
import { validate } from '../middleware/validate.middleware.js';

const router = Router();

// POST /api/v1/search - Multi-engine product search
router.post('/', validate(SearchSchema), async (req, res, next) => {
  try {
    const { query, country, category, imageUrl } = req.body;
    const results = await SearchService.search({ query, country, category, imageUrl });
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// POST /api/v1/search/image - Image-based search
router.post('/image', async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    const results = await SearchService.searchByImage(imageBase64);
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

export default router;
