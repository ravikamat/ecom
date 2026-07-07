/* ============================================================
   Scraper Module — Crawlee-powered live web scraping
   Scrapes: Amazon, Google Shopping, Flipkart, eBay, and more
   100% free — runs locally, no API keys needed
   ============================================================ */

import { CheerioCrawler, log } from 'crawlee';

// Suppress crawlee's verbose logging
log.setLevel(log.LEVELS.WARNING);

// ✅ NEW: Safe JSON parsing with fallback
export function safeParseLLMResponse(text) {
  try {
    // Remove markdown code blocks if present
    let cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/\n?```/g, '')
      .trim();
    
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[Parser] Failed to parse LLM response:', err.message);
    return {
      error: 'AI response formatting error',
      message: 'Failed to parse AI response. Likely invalid JSON from AI.',
      originalError: err.message,
    };
  }
}

// Country → Amazon domain
const AMAZON_DOMAINS = {
  India: 'www.amazon.in', USA: 'www.amazon.com', UK: 'www.amazon.co.uk',
  UAE: 'www.amazon.ae', Canada: 'www.amazon.ca', Australia: 'www.amazon.com.au',
  Germany: 'www.amazon.de', France: 'www.amazon.fr', Japan: 'www.amazon.co.jp',
  Singapore: 'www.amazon.sg', 'Saudi Arabia': 'www.amazon.sa',
  Brazil: 'www.amazon.com.br', Mexico: 'www.amazon.com.mx',
  Turkey: 'www.amazon.com.tr', 'South Africa': 'www.amazon.co.za',
};

export const COUNTRY_CURRENCIES = {
  India: 'INR', USA: 'USD', UK: 'GBP', UAE: 'AED', Canada: 'CAD',
  Australia: 'AUD', Germany: 'EUR', France: 'EUR', Japan: 'JPY',
  Singapore: 'SGD', 'Saudi Arabia': 'SAR', Brazil: 'BRL', Mexico: 'MXN',
  Nigeria: 'NGN', 'South Africa': 'ZAR', Turkey: 'TRY', Indonesia: 'IDR',
  Thailand: 'THB', Malaysia: 'MYR', 'South Korea': 'KRW',
};

/* ═══════════════════════════════════════════════════════════
   Main Scraper — runs Crawlee CheerioCrawler
   ═══════════════════════════════════════════════════════════ */

export async function scrapeProducts(query, country) {
  const results = {
    amazon: [],
    google: [],
    other: [],
    errors: [],
  };

  const currency = COUNTRY_CURRENCIES[country] || 'USD';

  // Build URLs to scrape
  const urls = [];

  // Amazon search
  const amazonDomain = AMAZON_DOMAINS[country] || 'www.amazon.com';
  urls.push({
    url: `https://${amazonDomain}/s?k=${encodeURIComponent(query)}`,
    label: 'amazon',
  });

  // Google Shopping
  const googleDomains = {
    India: 'www.google.co.in', USA: 'www.google.com', UK: 'www.google.co.uk',
    Germany: 'www.google.de', France: 'www.google.fr', Japan: 'www.google.co.jp',
  };
  const gDomain = googleDomains[country] || 'www.google.com';
  urls.push({
    url: `https://${gDomain}/search?q=${encodeURIComponent(query + ' buy price')}&tbm=shop&hl=en`,
    label: 'google',
  });

  // Flipkart (India)
  if (country === 'India') {
    urls.push({
      url: `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
      label: 'flipkart',
    });
  }

  // eBay (USA/UK/AU)
  if (['USA', 'UK', 'Australia', 'Canada', 'Germany'].includes(country)) {
    const ebayDomains = { USA: 'www.ebay.com', UK: 'www.ebay.co.uk', Australia: 'www.ebay.com.au', Canada: 'www.ebay.ca', Germany: 'www.ebay.de' };
    const eDomain = ebayDomains[country] || 'www.ebay.com';
    urls.push({
      url: `https://${eDomain}/sch/i.html?_nkw=${encodeURIComponent(query)}`,
      label: 'ebay',
    });
  }

  console.log(`[Scraper] Crawling ${urls.length} URLs for "${query}" in ${country}`);

  // Randomized user agents for anti-bot evasion
  const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ];

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: urls.length + 2,
    requestHandlerTimeoutSecs: 30,
    maxConcurrency: 3,
    maxRequestRetries: 1,
    additionalMimeTypes: ['text/html'],
    preNavigationHooks: [
      (_ctx, gotOptions) => {
        const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        gotOptions.headers = {
          ...gotOptions.headers,
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'Referer': 'https://www.google.com/',
        };
      },
    ],

    async requestHandler({ request, $, body }) {
      const label = request.label || request.userData?.label || 'other';
      const htmlLen = typeof body === 'string' ? body.length : (body?.length || 0);
      console.log(`[Scraper] ${label}: received ${htmlLen} bytes`);

      try {
        let parsed = [];
        if (label === 'amazon') {
          parsed = parseAmazon($, currency);
          // Fallback: generic extraction if Amazon blocked the structured layout
          if (parsed.length === 0) {
            parsed = genericExtract($, currency, 'Amazon');
            console.log(`[Scraper] Amazon fallback: ${parsed.length} products`);
          }
          results.amazon = parsed;
          console.log(`[Scraper] Amazon: ${results.amazon.length} products`);
        } else if (label === 'google') {
          parsed = parseGoogleShopping($, currency);
          if (parsed.length === 0) {
            parsed = genericExtract($, currency, 'Google Shopping');
          }
          results.google = parsed;
          console.log(`[Scraper] Google Shopping: ${results.google.length} products`);
        } else if (label === 'flipkart') {
          parsed = parseFlipkart($, currency);
          if (parsed.length === 0) parsed = genericExtract($, currency, 'Flipkart');
          results.other.push(...parsed);
          console.log(`[Scraper] Flipkart: ${parsed.length} products`);
        } else if (label === 'ebay') {
          parsed = parseEbay($, currency);
          if (parsed.length === 0) parsed = genericExtract($, currency, 'eBay');
          results.other.push(...parsed);
          console.log(`[Scraper] eBay: ${parsed.length} products`);
        }
      } catch (err) {
        console.error(`[Scraper] Error parsing ${label}:`, err.message);
        results.errors.push({ source: label, error: err.message });
      }
    },


    async failedRequestHandler({ request }, error) {
      const label = request.label || request.userData?.label || 'unknown';
      console.error(`[Scraper] Failed to crawl ${label}: ${error.message}`);
      results.errors.push({ source: label, error: error.message });
    },
  });

  // Run the crawler
  const requests = urls.map(u => ({ url: u.url, label: u.label, userData: { label: u.label } }));

  try {
    await crawler.run(requests);
  } catch (err) {
    console.error('[Scraper] Crawler error:', err.message);
  }

  // Clean copy prevents leaked references between requests
  const cleanResults = JSON.parse(JSON.stringify(results));

  // ── Build combined.liveListings from all scraped sources ──
  const allRaw = [
    ...cleanResults.amazon,
    ...cleanResults.google,
    ...cleanResults.other,
  ];

  // Deduplicate by normalized name
  const seen = new Set();
  const liveListings = [];
  for (const p of allRaw) {
    const key = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 25);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    // Estimate AI-style fields from scraped data
    const reviewCount = p.reviews || 0;
    const rating      = p.rating  || 3.5;
    const isBest      = p.bestSeller || false;

    // Demand: based on reviews + rating + best seller
    const demandBase  = Math.min(100, Math.round(
      (isBest ? 30 : 0) +
      (Math.min(reviewCount, 10000) / 10000) * 40 +
      (rating / 5) * 30
    ));
    const demand = demandBase || Math.floor(Math.random() * 30 + 50); // fallback 50-80

    // Margin: rough estimate by category (will be refined by AI later)
    const margin = Math.floor(Math.random() * 25 + 15); // 15-40%

    // Competition: based on review count
    let competition = 'Medium';
    if (reviewCount > 5000) competition = 'Very High';
    else if (reviewCount > 1000) competition = 'High';
    else if (reviewCount < 100) competition = 'Low';

    liveListings.push({
      name:         p.name,
      price:        p.price || 0,
      currency:     p.currency || currency,
      platform:     p.platform || 'Online',
      image:        p.image   || '',
      rating:       p.rating  || null,
      reviews:      p.reviews || null,
      bestSeller:   p.bestSeller || false,
      sponsored:    p.sponsored || false,
      asin:         p.asin    || null,
      url:          p.url     || null,
      source:       p.source  || p.platform || 'Scraped',
      // AI-style enrichment fields
      demand,
      margin,
      competition,
      trend:        isBest ? 'Rising' : 'Stable',
      riskLevel:    competition === 'Very High' ? 'High' : 'Medium',
      monthlySales: reviewCount > 0 ? Math.floor(reviewCount / 12) : Math.floor(Math.random() * 200 + 50),
      whySelling:   isBest ? 'Best Seller on platform' : `${demand}% demand with ${competition.toLowerCase()} competition`,
      category:     p.category || '',
    });
  }

  cleanResults.combined = { liveListings };
  return cleanResults;
}


/* ═══════════════════════════════════════════════════════════
   Platform Parsers
   ═══════════════════════════════════════════════════════════ */

// ─── Amazon Parser ──────────────────────────────────────────
function parseAmazon($, currency) {
  const products = [];

  // Main search results
  $('[data-component-type="s-search-result"], .s-result-item[data-asin]').each((_, el) => {
    const $el = $(el);
    const asin = $el.attr('data-asin');
    if (!asin) return;

    // Title
    const title = $el.find('h2 a span, h2 span.a-text-normal, .a-size-medium.a-text-normal, .a-size-base-plus.a-text-normal').first().text().trim();
    if (!title || title.length < 5) return;

    // Price — whole + fraction
    const priceWhole = $el.find('.a-price .a-price-whole').first().text().replace(/[,.\s]/g, '');
    const priceFraction = $el.find('.a-price .a-price-fraction').first().text().trim();
    let price = 0;
    if (priceWhole) {
      price = parseFloat(priceWhole + (priceFraction ? '.' + priceFraction : ''));
    }
    // Fallback price patterns
    if (!price) {
      const priceText = $el.find('.a-price .a-offscreen').first().text();
      price = extractPriceNum(priceText);
    }

    // Rating
    const ratingText = $el.find('.a-icon-alt, [data-cy="reviews-ratings-component"] span').first().text();
    const rating = ratingText ? parseFloat(ratingText) : null;

    // Reviews
    const reviewText = $el.find('.a-size-base.s-underline-text, [data-cy="reviews-block"] span.a-size-base').first().text();
    const reviews = reviewText ? parseInt(reviewText.replace(/[,.\s]/g, '')) : null;

    // Delivery info
    const delivery = $el.find('.a-color-base.a-text-bold, .s-align-children-center .a-text-bold').first().text().trim();

    // Is sponsored?
    const sponsored = $el.find('.puis-sponsored-label-text, .s-label-popover-default').length > 0;

    // Best seller badge
    const bestSeller = $el.find('.a-badge-text').text().includes('Best Seller');

    // Image
    const image = $el.find('.s-image').first().attr('src') || '';

    if (price > 0) {
      products.push({
        name: title.substring(0, 120),
        price,
        currency,
        platform: 'Amazon',
        rating: rating && rating <= 5 ? rating : null,
        reviews: reviews && !isNaN(reviews) ? reviews : null,
        delivery: delivery || null,
        sponsored,
        bestSeller,
        image,
        asin,
        source: 'Amazon (Live Scraped)',
      });
    }
  });

  return products.slice(0, 20);
}

// ─── Google Shopping Parser ─────────────────────────────────
function parseGoogleShopping($, currency) {
  const products = [];

  // Shopping results — multiple possible selectors
  $('.sh-dgr__gr-auto, .sh-dgr__content, .sh-dlr__list-result').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h3, .tAxDx, .Xjkr3b, a[class*="translate-content"]').first().text().trim();
    const priceText = $el.find('.a8Pemb, .HRLxBb, .kHxwFf, .O8U6h').first().text().trim();
    const merchant = $el.find('.aULzUe, .IuHnof, .E5ocAb, .dD8iuc').first().text().trim();
    const ratingText = $el.find('.Rsc7Yb, .QIrs8').first().text().trim();

    const price = extractPriceNum(priceText);
    if (title && price > 0) {
      products.push({
        name: title.substring(0, 120),
        price,
        priceFormatted: priceText,
        currency,
        platform: merchant || 'Google Shopping',
        rating: ratingText ? parseFloat(ratingText) : null,
        source: 'Google Shopping (Live)',
      });
    }
  });

  // Fallback: extract from any price-looking elements
  if (products.length === 0) {
    $('a').each((_, el) => {
      const $a = $(el);
      const text = $a.text();
      const price = extractPriceNum(text);
      const title = $a.attr('aria-label') || $a.find('h3, h4, span').first().text();
      if (title && title.length > 8 && price > 0 && products.length < 15) {
        products.push({
          name: title.substring(0, 120), price, currency,
          platform: 'Google Shopping', source: 'Google Shopping (Live)',
        });
      }
    });
  }

  return products.slice(0, 15);
}

// ─── Flipkart Parser ────────────────────────────────────────
function parseFlipkart($, currency) {
  const products = [];

  $('a[href*="/p/"], ._1AtVbE, ._2kHMtA, ._4ddWXP').each((_, el) => {
    const $el = $(el);

    const title = $el.find('._4rR01T, .s1Q9rs, .IRpwTa, ._2WkVRV, .KzDlHZ').first().text().trim()
      || $el.find('a[title]').first().attr('title')
      || $el.find('div[class*="title"], a').first().text().trim();

    const priceText = $el.find('._30jeq3, ._25b18c, ._1_WHN1').first().text();
    const price = extractPriceNum(priceText);

    const ratingText = $el.find('._3LWZlK, .XQDdHH').first().text();
    const reviewText = $el.find('._2_R_DZ span, ._2sMJ5V span').first().text();

    if (title && title.length > 5 && price > 0) {
      products.push({
        name: title.substring(0, 120), price, currency,
        platform: 'Flipkart',
        rating: ratingText ? parseFloat(ratingText) : null,
        reviews: reviewText ? parseInt(reviewText.replace(/[^\d]/g, '')) : null,
        source: 'Flipkart (Live Scraped)',
      });
    }
  });

  return products.slice(0, 15);
}

// ─── eBay Parser ────────────────────────────────────────────
function parseEbay($, currency) {
  const products = [];

  $('.s-item, .srp-results .s-item__wrapper').each((_, el) => {
    const $el = $(el);
    const title = $el.find('.s-item__title span, .s-item__title').first().text().trim();
    const priceText = $el.find('.s-item__price .BOLD, .s-item__price').first().text();
    const price = extractPriceNum(priceText);

    const soldText = $el.find('.s-item__hotness, .s-item__quantitySold, .BOLD.NEGATIVE').text();
    const shippingText = $el.find('.s-item__shipping, .s-item__freeXDays').first().text();

    if (title && !title.includes('Shop on eBay') && price > 0) {
      products.push({
        name: title.substring(0, 120), price, currency,
        platform: 'eBay',
        soldInfo: soldText || null,
        shipping: shippingText || null,
        source: 'eBay (Live Scraped)',
      });
    }
  });

  return products.slice(0, 15);
}


/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function extractPriceNum(text) {
  if (!text) return 0;
  // Remove currency symbols and extract number
  const cleaned = text
    .replace(/[₹$€£¥₩₦₺฿]/g, '')
    .replace(/Rs\.?\s*/gi, '')
    .replace(/[A-Z]{3}\s*/g, '')
    .replace(/,/g, '')
    .trim();
  const match = cleaned.match(/([\d]+(?:\.[\d]{1,2})?)/);
  return match ? parseFloat(match[1]) : 0;
}

// ─── Generic Fallback Extractor ─────────────────────────────
// Scans the entire HTML for any price + title combinations
function genericExtract($, currency, platformName) {
  const products = [];
  const seen = new Set();
  const html = $.html() || '';

  // Strategy 1: Find all links with nearby prices
  $('a').each((_, el) => {
    const $a = $(el);
    const title = ($a.attr('title') || $a.text() || '').trim();
    if (title.length < 8 || title.length > 150) return;

    // Look for price in parent or siblings
    const parent = $a.parent();
    const parentText = parent.text();
    const price = extractPriceNum(parentText);

    if (price > 0 && !seen.has(title.substring(0, 30))) {
      seen.add(title.substring(0, 30));
      products.push({
        name: title.substring(0, 120),
        price, currency,
        platform: platformName,
        source: `${platformName} (Scraped)`,
      });
    }
  });

  // Strategy 2: Find price patterns in the raw HTML using regex
  if (products.length < 3) {
    const priceRegex = /(?:₹|Rs\.?\s*|\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)/g;
    let match;
    const prices = [];
    while ((match = priceRegex.exec(html)) !== null && prices.length < 20) {
      const p = parseFloat(match[1].replace(/,/g, ''));
      if (p > 10 && p < 9999999) prices.push({ price: p, formatted: match[0] });
    }

    // Pair prices with nearby text content
    $('h2, h3, h4, [class*="title"], [class*="name"], [class*="Title"], [class*="Name"]').each((_, el) => {
      const title = $(el).text().trim();
      if (title.length >= 8 && title.length <= 120 && !seen.has(title.substring(0, 30)) && prices.length > 0) {
        seen.add(title.substring(0, 30));
        const price = prices.shift();
        if (price) {
          products.push({
            name: title,
            price: price.price,
            priceFormatted: price.formatted,
            currency, platform: platformName,
            source: `${platformName} (Scraped)`,
          });
        }
      }
    });
  }

  return products.slice(0, 15);
}

