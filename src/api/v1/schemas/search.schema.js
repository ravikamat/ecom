import { z } from 'zod';

export const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  country: z.enum(['IN', 'US', 'UK', 'DE', 'AU']).default('IN'),
  category: z.string().optional(),
  imageUrl: z.string().url().optional(),
  platforms: z.array(z.enum(['amazon', 'flipkart', 'meesho', 'alibaba', 'indiamart'])).optional(),
});
