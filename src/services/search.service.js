import { scrapeProducts } from '../../scraper.js';
import { dbGetScrapeCache } from '../../db/sqlite.js';

export class SearchService {
  static async search({ query, country = 'India', category, imageUrl }) {
    if (imageUrl) {
      return { success: true, items: [], total: 0 };
    }

    const ctr = country && country !== 'all' ? country : 'India';

    // Check SQLite cache
    const cached = dbGetScrapeCache(query, ctr, 1, 20);
    if (cached) return cached;

    // Perform live scrape
    try {
      const scrapeRes = await scrapeProducts(query, ctr, 1);
      const combined = scrapeRes?.combined || {};
      const raw = combined.liveListings || [];
      return { items: raw, total: raw.length, query, country: ctr };
    } catch (err) {
      console.warn('[SearchService] Scrape error:', err.message);
      return { items: [], total: 0, query, country: ctr, error: err.message };
    }
  }

  static async searchByImage(imageBase64) {
    // Basic stub matching image-search predictions
    return {
      success: true,
      queries: ['trending product', 'similar e-commerce item'],
      predictions: [{ label: 'E-Commerce Product', confidence: 0.95 }]
    };
  }
}
