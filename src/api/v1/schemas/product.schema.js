import { z } from 'zod';

export const ProductSearchSchema = z.object({
  query: z.string().min(2).max(200).optional(),
  category: z.string().max(100).optional(),
  country: z.enum(['IN', 'US', 'UK', 'DE', 'AU']).optional(),
  minMargin: z.number().min(0).max(100).optional(),
  maxCompetition: z.enum(['low', 'medium', 'high']).optional(),
  page: z.string().regex(/^\d+$/).optional().transform(Number),
  limit: z.string().regex(/^\d+$/).optional().transform(Number),
});

export const ProductCreateSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100),
  country: z.enum(['IN', 'US', 'UK', 'DE', 'AU']),
  supplierPrice: z.number().positive(),
  currency: z.enum(['USD', 'INR', 'EUR', 'GBP', 'AUD']),
  margin: z.number().min(0).max(100),
  demand: z.number().int().positive(),
});
