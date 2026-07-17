import { z } from 'zod';

export const ResearchRequestSchema = z.object({
  query: z.string().min(2).max(200),
  country: z.enum(['IN', 'US', 'UK', 'DE', 'AU']),
  category: z.string().optional(),
  budget: z.object({
    min: z.number().min(0),
    max: z.number().min(0),
    currency: z.enum(['USD', 'INR', 'EUR', 'GBP', 'AUD']),
  }).optional(),
  filters: z.object({
    minMargin: z.number().min(0).max(100).optional(),
    maxCompetition: z.enum(['low', 'medium', 'high']).optional(),
    moqMax: z.number().int().positive().optional(),
  }).optional(),
});

export const ResearchStatusSchema = z.object({
  jobId: z.string().uuid(),
});
