/* ============================================================
 *  data-seed.js  –  Global E-Commerce Seed Data
 *  Solo Ecommerce Command Center
 *  Generated: 2025 · Prices reflect 2025-2026 market conditions
 *  Loaded via <script> — all declarations at global scope
 * ============================================================ */

// ─── COUNTRY CONFIGURATION ──────────────────────────────────
const COUNTRY_CONFIG = {
  India:        { currency: 'INR', symbol: '₹',   locale: 'en-IN', flag: '🇮🇳', taxName: 'GST',          taxRate: 18 },
  USA:          { currency: 'USD', symbol: '$',   locale: 'en-US', flag: '🇺🇸', taxName: 'Sales Tax',    taxRate: 8  },
  UK:           { currency: 'GBP', symbol: '£',   locale: 'en-GB', flag: '🇬🇧', taxName: 'VAT',          taxRate: 20 },
  UAE:          { currency: 'AED', symbol: 'د.إ', locale: 'ar-AE', flag: '🇦🇪', taxName: 'VAT',          taxRate: 5  },
  Canada:       { currency: 'CAD', symbol: 'C$',  locale: 'en-CA', flag: '🇨🇦', taxName: 'GST/HST',     taxRate: 13 },
  Australia:    { currency: 'AUD', symbol: 'A$',  locale: 'en-AU', flag: '🇦🇺', taxName: 'GST',          taxRate: 10 },
  Germany:      { currency: 'EUR', symbol: '€',   locale: 'de-DE', flag: '🇩🇪', taxName: 'MwSt',         taxRate: 19 },
  France:       { currency: 'EUR', symbol: '€',   locale: 'fr-FR', flag: '🇫🇷', taxName: 'TVA',          taxRate: 20 },
  Japan:        { currency: 'JPY', symbol: '¥',   locale: 'ja-JP', flag: '🇯🇵', taxName: 'Consumption',  taxRate: 10 },
  Singapore:    { currency: 'SGD', symbol: 'S$',  locale: 'en-SG', flag: '🇸🇬', taxName: 'GST',          taxRate: 9  },
  'Saudi Arabia': { currency: 'SAR', symbol: '﷼', locale: 'ar-SA', flag: '🇸🇦', taxName: 'VAT',        taxRate: 15 },
  Brazil:       { currency: 'BRL', symbol: 'R$',  locale: 'pt-BR', flag: '🇧🇷', taxName: 'ICMS',         taxRate: 18 },
  Mexico:       { currency: 'MXN', symbol: 'MX$', locale: 'es-MX', flag: '🇲🇽', taxName: 'IVA',          taxRate: 16 },
  Nigeria:      { currency: 'NGN', symbol: '₦',   locale: 'en-NG', flag: '🇳🇬', taxName: 'VAT',          taxRate: 7.5},
  'South Africa': { currency: 'ZAR', symbol: 'R', locale: 'en-ZA', flag: '🇿🇦', taxName: 'VAT',        taxRate: 15 },
  Turkey:       { currency: 'TRY', symbol: '₺',   locale: 'tr-TR', flag: '🇹🇷', taxName: 'KDV',          taxRate: 20 },
  Indonesia:    { currency: 'IDR', symbol: 'Rp',  locale: 'id-ID', flag: '🇮🇩', taxName: 'PPN',          taxRate: 11 },
  Thailand:     { currency: 'THB', symbol: '฿',   locale: 'th-TH', flag: '🇹🇭', taxName: 'VAT',          taxRate: 7  },
  Malaysia:     { currency: 'MYR', symbol: 'RM',  locale: 'ms-MY', flag: '🇲🇾', taxName: 'SST',          taxRate: 6  },
  'South Korea':  { currency: 'KRW', symbol: '₩', locale: 'ko-KR', flag: '🇰🇷', taxName: 'VAT',        taxRate: 10 }
};


// ─── SEED PRODUCTS (100+) ───────────────────────────────────
const SEED_PRODUCTS = [

  // ── INDIA (INR) ─────────────────────────────────────────
  { name: 'USB-C Fast Charger 65W',            country: 'India', category: 'Electronics',      demand: 88, margin: 32, competition: 'High',      platforms: ['Amazon','Flipkart','Meesho'],            moq: 50,  supplierPrice: 320,    currency: 'INR', weight: 150 },
  { name: 'Bamboo Cutlery Organizer',          country: 'India', category: 'Home & Kitchen',   demand: 62, margin: 48, competition: 'Low',       platforms: ['Amazon','Flipkart','Snapdeal'],          moq: 30,  supplierPrice: 180,    currency: 'INR', weight: 450 },
  { name: 'Niacinamide Face Serum 30ml',       country: 'India', category: 'Beauty',            demand: 91, margin: 55, competition: 'Medium',    platforms: ['Amazon','Flipkart','Meesho','Myntra'],   moq: 100, supplierPrice: 85,     currency: 'INR', weight: 80  },
  { name: 'Resistance Bands Set (5-pack)',     country: 'India', category: 'Sports',            demand: 74, margin: 42, competition: 'Medium',    platforms: ['Amazon','Flipkart'],                     moq: 40,  supplierPrice: 210,    currency: 'INR', weight: 300 },
  { name: 'Cotton Kurtis Combo Pack',          country: 'India', category: 'Fashion',           demand: 85, margin: 38, competition: 'Very High', platforms: ['Meesho','Myntra','Flipkart','Snapdeal'], moq: 25,  supplierPrice: 350,    currency: 'INR', weight: 400 },
  { name: 'Smart LED Bulb WiFi RGB',           country: 'India', category: 'Electronics',      demand: 70, margin: 35, competition: 'Medium',    platforms: ['Amazon','Flipkart'],                     moq: 60,  supplierPrice: 280,    currency: 'INR', weight: 120 },

  // ── USA (USD) ───────────────────────────────────────────
  { name: 'Portable Blender USB-C',            country: 'USA', category: 'Home & Kitchen',     demand: 82, margin: 45, competition: 'Medium',    platforms: ['Amazon','Walmart','eBay'],               moq: 30,  supplierPrice: 8.50,   currency: 'USD', weight: 520 },
  { name: 'LED Desk Lamp with Wireless Charger',country: 'USA', category: 'Electronics',      demand: 76, margin: 38, competition: 'Medium',    platforms: ['Amazon','Walmart'],                      moq: 20,  supplierPrice: 14.00,  currency: 'USD', weight: 800 },
  { name: 'Organic Beeswax Wrap Set',          country: 'USA', category: 'Home & Kitchen',     demand: 68, margin: 52, competition: 'Low',       platforms: ['Amazon','Etsy','Walmart'],               moq: 50,  supplierPrice: 3.20,   currency: 'USD', weight: 120 },
  { name: 'Tungsten Wedding Band 8mm',         country: 'USA', category: 'Fashion',            demand: 55, margin: 65, competition: 'Low',       platforms: ['Amazon','Etsy','eBay'],                  moq: 10,  supplierPrice: 4.50,   currency: 'USD', weight: 30  },
  { name: 'Car Phone Mount MagSafe',           country: 'USA', category: 'Automotive',         demand: 79, margin: 40, competition: 'High',      platforms: ['Amazon','Walmart','eBay'],               moq: 40,  supplierPrice: 5.00,   currency: 'USD', weight: 180 },
  { name: 'Collagen Peptides Powder 400g',     country: 'USA', category: 'Health',             demand: 87, margin: 42, competition: 'High',      platforms: ['Amazon','Walmart'],                      moq: 25,  supplierPrice: 12.00,  currency: 'USD', weight: 450 },

  // ── UK (GBP) ────────────────────────────────────────────
  { name: 'Electric Milk Frother',             country: 'UK', category: 'Home & Kitchen',      demand: 72, margin: 48, competition: 'Medium',    platforms: ['Amazon UK','eBay UK','OnBuy'],           moq: 30,  supplierPrice: 4.80,   currency: 'GBP', weight: 250 },
  { name: 'Bamboo Toothbrush Set (12-pack)',   country: 'UK', category: 'Health',              demand: 65, margin: 55, competition: 'Low',       platforms: ['Amazon UK','eBay UK'],                   moq: 100, supplierPrice: 1.50,   currency: 'GBP', weight: 200 },
  { name: 'Waterproof Dog Coat Reflective',    country: 'UK', category: 'Pet Care',            demand: 70, margin: 44, competition: 'Medium',    platforms: ['Amazon UK','eBay UK','OnBuy'],           moq: 20,  supplierPrice: 6.20,   currency: 'GBP', weight: 300 },
  { name: 'Desk Cable Management Kit',         country: 'UK', category: 'Office',              demand: 58, margin: 50, competition: 'Low',       platforms: ['Amazon UK','OnBuy'],                     moq: 50,  supplierPrice: 2.80,   currency: 'GBP', weight: 150 },
  { name: 'Vitamin D3 Gummies 120ct',          country: 'UK', category: 'Health',              demand: 78, margin: 46, competition: 'Medium',    platforms: ['Amazon UK','eBay UK'],                   moq: 40,  supplierPrice: 3.50,   currency: 'GBP', weight: 220 },

  // ── UAE (AED) ───────────────────────────────────────────
  { name: 'Arabic Coffee Dallah Set',          country: 'UAE', category: 'Home & Kitchen',     demand: 64, margin: 40, competition: 'Low',       platforms: ['Amazon.ae','Noon'],                      moq: 15,  supplierPrice: 55,     currency: 'AED', weight: 900 },
  { name: 'Car Sunshade Umbrella Foldable',    country: 'UAE', category: 'Automotive',         demand: 80, margin: 45, competition: 'Medium',    platforms: ['Amazon.ae','Noon'],                      moq: 30,  supplierPrice: 28,     currency: 'AED', weight: 600 },
  { name: 'Oud Perfume Oil 12ml Roll-on',      country: 'UAE', category: 'Beauty',             demand: 75, margin: 58, competition: 'Medium',    platforms: ['Amazon.ae','Noon','Namshi'],             moq: 50,  supplierPrice: 18,     currency: 'AED', weight: 60  },
  { name: 'Portable Mini AC Fan',              country: 'UAE', category: 'Electronics',        demand: 85, margin: 38, competition: 'High',      platforms: ['Amazon.ae','Noon'],                      moq: 40,  supplierPrice: 35,     currency: 'AED', weight: 350 },
  { name: 'Modest Swim Burkini Set',           country: 'UAE', category: 'Fashion',            demand: 60, margin: 42, competition: 'Low',       platforms: ['Noon','Namshi'],                         moq: 20,  supplierPrice: 65,     currency: 'AED', weight: 350 },

  // ── CANADA (CAD) ────────────────────────────────────────
  { name: 'Insulated Water Bottle 1L',         country: 'Canada', category: 'Sports',          demand: 73, margin: 40, competition: 'High',      platforms: ['Amazon CA','eBay CA','Shopify'],         moq: 30,  supplierPrice: 9.50,   currency: 'CAD', weight: 400 },
  { name: 'Heated Gloves Rechargeable',        country: 'Canada', category: 'Fashion',         demand: 68, margin: 45, competition: 'Low',       platforms: ['Amazon CA','eBay CA'],                   moq: 20,  supplierPrice: 18.00,  currency: 'CAD', weight: 250 },
  { name: 'Maple Syrup Candle Set',            country: 'Canada', category: 'Home & Kitchen',  demand: 52, margin: 55, competition: 'Low',       platforms: ['Amazon CA','Shopify','eBay CA'],         moq: 40,  supplierPrice: 5.00,   currency: 'CAD', weight: 350 },
  { name: 'Car Dash Cam 4K WiFi',              country: 'Canada', category: 'Automotive',      demand: 78, margin: 35, competition: 'Medium',    platforms: ['Amazon CA','eBay CA'],                   moq: 15,  supplierPrice: 42.00,  currency: 'CAD', weight: 150 },
  { name: 'Ergonomic Office Footrest',         country: 'Canada', category: 'Office',          demand: 60, margin: 44, competition: 'Low',       platforms: ['Amazon CA','Shopify'],                   moq: 25,  supplierPrice: 14.00,  currency: 'CAD', weight: 1200},

  // ── AUSTRALIA (AUD) ─────────────────────────────────────
  { name: 'Solar Garden Lights (10-pack)',     country: 'Australia', category: 'Garden',       demand: 74, margin: 48, competition: 'Medium',    platforms: ['Amazon AU','eBay AU','Kogan'],           moq: 30,  supplierPrice: 12.00,  currency: 'AUD', weight: 800 },
  { name: 'Reef-Safe Sunscreen SPF50',        country: 'Australia', category: 'Beauty',        demand: 82, margin: 50, competition: 'Medium',    platforms: ['Amazon AU','eBay AU'],                   moq: 50,  supplierPrice: 6.50,   currency: 'AUD', weight: 200 },
  { name: 'Silicone Baking Mat Set',           country: 'Australia', category: 'Home & Kitchen',demand: 60, margin: 52, competition: 'Low',      platforms: ['Amazon AU','eBay AU','Kogan'],           moq: 40,  supplierPrice: 4.80,   currency: 'AUD', weight: 350 },
  { name: 'Snake Repellent Granules 2kg',      country: 'Australia', category: 'Garden',       demand: 55, margin: 45, competition: 'Low',       platforms: ['Amazon AU','eBay AU'],                   moq: 25,  supplierPrice: 8.00,   currency: 'AUD', weight: 2000},
  { name: 'Wireless Earbuds ANC',             country: 'Australia', category: 'Electronics',   demand: 80, margin: 35, competition: 'High',      platforms: ['Amazon AU','Kogan','eBay AU'],           moq: 20,  supplierPrice: 18.00,  currency: 'AUD', weight: 60  },

  // ── GERMANY (EUR) ───────────────────────────────────────
  { name: 'Stainless Steel Lunch Box Set',     country: 'Germany', category: 'Home & Kitchen', demand: 70, margin: 42, competition: 'Medium',    platforms: ['Amazon.de','Otto'],                      moq: 30,  supplierPrice: 7.50,   currency: 'EUR', weight: 650 },
  { name: 'Organic Hemp Protein Powder 1kg',   country: 'Germany', category: 'Health',         demand: 65, margin: 40, competition: 'Low',       platforms: ['Amazon.de','Otto'],                      moq: 25,  supplierPrice: 12.00,  currency: 'EUR', weight: 1050},
  { name: 'Merino Wool Base Layer',            country: 'Germany', category: 'Fashion',        demand: 62, margin: 48, competition: 'Low',       platforms: ['Amazon.de','Zalando','Otto'],            moq: 20,  supplierPrice: 16.00,  currency: 'EUR', weight: 250 },
  { name: 'E-Bike Phone Holder Waterproof',    country: 'Germany', category: 'Automotive',     demand: 72, margin: 50, competition: 'Medium',    platforms: ['Amazon.de','Otto'],                      moq: 40,  supplierPrice: 4.20,   currency: 'EUR', weight: 120 },
  { name: 'LED Camping Lantern Rechargeable',  country: 'Germany', category: 'Sports',         demand: 58, margin: 44, competition: 'Low',       platforms: ['Amazon.de','Otto'],                      moq: 30,  supplierPrice: 6.80,   currency: 'EUR', weight: 300 },

  // ── FRANCE (EUR) ────────────────────────────────────────
  { name: 'French Press Coffee Maker 1L',      country: 'France', category: 'Home & Kitchen',  demand: 68, margin: 45, competition: 'Medium',    platforms: ['Amazon.fr','Cdiscount','Fnac'],          moq: 25,  supplierPrice: 6.00,   currency: 'EUR', weight: 700 },
  { name: 'Natural Lavender Essential Oil 50ml',country: 'France', category: 'Beauty',         demand: 72, margin: 55, competition: 'Low',       platforms: ['Amazon.fr','Cdiscount'],                 moq: 60,  supplierPrice: 3.80,   currency: 'EUR', weight: 100 },
  { name: 'Wine Aerator Decanter Set',         country: 'France', category: 'Home & Kitchen',  demand: 55, margin: 50, competition: 'Low',       platforms: ['Amazon.fr','Fnac','Cdiscount'],          moq: 30,  supplierPrice: 5.50,   currency: 'EUR', weight: 350 },
  { name: 'Cycling Jersey UPF50 Men',          country: 'France', category: 'Sports',          demand: 64, margin: 42, competition: 'Medium',    platforms: ['Amazon.fr','Cdiscount'],                 moq: 20,  supplierPrice: 11.00,  currency: 'EUR', weight: 180 },
  { name: 'Kids Wooden Montessori Toy Set',    country: 'France', category: 'Toys',            demand: 75, margin: 48, competition: 'Medium',    platforms: ['Amazon.fr','Fnac','Cdiscount'],          moq: 30,  supplierPrice: 7.20,   currency: 'EUR', weight: 500 },

  // ── JAPAN (JPY) ─────────────────────────────────────────
  { name: 'Matcha Whisk Set Bamboo',           country: 'Japan', category: 'Home & Kitchen',   demand: 70, margin: 52, competition: 'Low',       platforms: ['Amazon JP','Rakuten'],                   moq: 30,  supplierPrice: 650,    currency: 'JPY', weight: 100 },
  { name: 'Heated Eye Mask USB',               country: 'Japan', category: 'Health',           demand: 78, margin: 48, competition: 'Medium',    platforms: ['Amazon JP','Rakuten','Yahoo Shopping'],   moq: 40,  supplierPrice: 480,    currency: 'JPY', weight: 80  },
  { name: 'Bento Box 3-Tier Stainless',        country: 'Japan', category: 'Home & Kitchen',   demand: 65, margin: 40, competition: 'Medium',    platforms: ['Amazon JP','Rakuten'],                   moq: 25,  supplierPrice: 1200,   currency: 'JPY', weight: 600 },
  { name: 'Anti-Fog Bathroom Mirror LED',      country: 'Japan', category: 'Home & Kitchen',   demand: 58, margin: 45, competition: 'Low',       platforms: ['Amazon JP','Yahoo Shopping'],             moq: 15,  supplierPrice: 2800,   currency: 'JPY', weight: 1500},
  { name: 'Cat Self-Grooming Arch',            country: 'Japan', category: 'Pet Care',         demand: 72, margin: 50, competition: 'Low',       platforms: ['Amazon JP','Rakuten'],                   moq: 30,  supplierPrice: 580,    currency: 'JPY', weight: 350 },

  // ── SINGAPORE (SGD) ─────────────────────────────────────
  { name: 'Foldable Laptop Stand Aluminum',    country: 'Singapore', category: 'Office',       demand: 75, margin: 42, competition: 'Medium',    platforms: ['Shopee','Lazada','Amazon SG'],           moq: 30,  supplierPrice: 8.50,   currency: 'SGD', weight: 350 },
  { name: 'Mosquito Repellent Bracelet (5pk)', country: 'Singapore', category: 'Health',       demand: 80, margin: 55, competition: 'Low',       platforms: ['Shopee','Lazada'],                       moq: 100, supplierPrice: 1.20,   currency: 'SGD', weight: 50  },
  { name: 'Mini Dehumidifier 500ml',           country: 'Singapore', category: 'Home & Kitchen',demand: 82, margin: 40, competition: 'Medium',   platforms: ['Shopee','Lazada','Amazon SG'],           moq: 20,  supplierPrice: 15.00,  currency: 'SGD', weight: 700 },
  { name: 'Wireless Keyboard & Mouse Combo',   country: 'Singapore', category: 'Electronics',  demand: 70, margin: 35, competition: 'High',      platforms: ['Shopee','Lazada','Amazon SG'],           moq: 25,  supplierPrice: 12.00,  currency: 'SGD', weight: 500 },
  { name: 'Durian Candy Gift Box',             country: 'Singapore', category: 'Food & Beverage',demand: 55, margin: 48, competition: 'Low',     platforms: ['Shopee','Lazada'],                       moq: 50,  supplierPrice: 4.50,   currency: 'SGD', weight: 300 },

  // ── SAUDI ARABIA (SAR) ──────────────────────────────────
  { name: 'Bukhoor Incense Burner Electric',   country: 'Saudi Arabia', category: 'Home & Kitchen',demand: 72, margin: 45, competition: 'Medium',platforms: ['Amazon.sa','Noon'],                      moq: 20,  supplierPrice: 35,     currency: 'SAR', weight: 400 },
  { name: 'Abaya Casual Modern',               country: 'Saudi Arabia', category: 'Fashion',   demand: 78, margin: 40, competition: 'High',      platforms: ['Noon','Amazon.sa','Jarir'],              moq: 15,  supplierPrice: 55,     currency: 'SAR', weight: 350 },
  { name: 'Car Perfume Vent Clip',             country: 'Saudi Arabia', category: 'Automotive', demand: 65, margin: 55, competition: 'Low',       platforms: ['Amazon.sa','Noon'],                      moq: 50,  supplierPrice: 8,      currency: 'SAR', weight: 40  },
  { name: 'Arabic Calligraphy Wall Art',       country: 'Saudi Arabia', category: 'Home & Kitchen',demand: 58, margin: 50, competition: 'Low',   platforms: ['Amazon.sa','Noon'],                      moq: 10,  supplierPrice: 22,     currency: 'SAR', weight: 500 },
  { name: 'Dates Gift Box Premium Ajwa 1kg',   country: 'Saudi Arabia', category: 'Food & Beverage',demand: 80, margin: 35, competition: 'Medium',platforms: ['Amazon.sa','Noon','Jarir'],             moq: 20,  supplierPrice: 45,     currency: 'SAR', weight: 1100},

  // ── BRAZIL (BRL) ────────────────────────────────────────
  { name: 'Chimarrão Mate Gourd & Bomba Set',  country: 'Brazil', category: 'Home & Kitchen',  demand: 70, margin: 45, competition: 'Low',       platforms: ['Mercado Libre','Amazon BR'],             moq: 20,  supplierPrice: 38,     currency: 'BRL', weight: 400 },
  { name: 'Brazilian Coffee Capsules (50-pack)',country: 'Brazil', category: 'Food & Beverage', demand: 82, margin: 38, competition: 'Medium',    platforms: ['Mercado Libre','Amazon BR','Shopee BR'], moq: 30,  supplierPrice: 55,     currency: 'BRL', weight: 500 },
  { name: 'Hammock Outdoor Cotton',            country: 'Brazil', category: 'Garden',          demand: 60, margin: 42, competition: 'Low',       platforms: ['Mercado Libre','Amazon BR'],             moq: 15,  supplierPrice: 65,     currency: 'BRL', weight: 1200},
  { name: 'Hair Keratin Treatment Kit',        country: 'Brazil', category: 'Beauty',          demand: 85, margin: 50, competition: 'Medium',    platforms: ['Mercado Libre','Shopee BR','Amazon BR'], moq: 25,  supplierPrice: 32,     currency: 'BRL', weight: 350 },
  { name: 'Smart Watch Fitness Tracker',       country: 'Brazil', category: 'Electronics',     demand: 78, margin: 35, competition: 'High',      platforms: ['Mercado Libre','Amazon BR','Shopee BR'], moq: 20,  supplierPrice: 85,     currency: 'BRL', weight: 60  },

  // ── MEXICO (MXN) ────────────────────────────────────────
  { name: 'Molcajete Volcanic Stone',          country: 'Mexico', category: 'Home & Kitchen',  demand: 55, margin: 48, competition: 'Low',       platforms: ['Mercado Libre MX','Amazon MX'],          moq: 10,  supplierPrice: 180,    currency: 'MXN', weight: 2500},
  { name: 'Lucha Libre Mask Authentic',        country: 'Mexico', category: 'Toys',            demand: 50, margin: 55, competition: 'Low',       platforms: ['Mercado Libre MX','Amazon MX'],          moq: 30,  supplierPrice: 65,     currency: 'MXN', weight: 80  },
  { name: 'Wireless Security Camera Indoor',   country: 'Mexico', category: 'Electronics',     demand: 80, margin: 38, competition: 'Medium',    platforms: ['Mercado Libre MX','Amazon MX'],          moq: 15,  supplierPrice: 350,    currency: 'MXN', weight: 200 },
  { name: 'Nopal Cactus Supplement 90ct',      country: 'Mexico', category: 'Health',          demand: 62, margin: 50, competition: 'Low',       platforms: ['Mercado Libre MX','Amazon MX'],          moq: 40,  supplierPrice: 120,    currency: 'MXN', weight: 150 },
  { name: 'Leather Huarache Sandals',          country: 'Mexico', category: 'Fashion',         demand: 58, margin: 45, competition: 'Low',       platforms: ['Mercado Libre MX','Amazon MX'],          moq: 15,  supplierPrice: 220,    currency: 'MXN', weight: 400 },

  // ── NIGERIA (NGN) ───────────────────────────────────────
  { name: 'Solar Power Bank 20000mAh',         country: 'Nigeria', category: 'Electronics',    demand: 88, margin: 35, competition: 'Medium',    platforms: ['Jumia','Konga'],                         moq: 20,  supplierPrice: 6500,   currency: 'NGN', weight: 350 },
  { name: 'Hair Bonnet Satin (3-pack)',        country: 'Nigeria', category: 'Beauty',         demand: 75, margin: 55, competition: 'Low',       platforms: ['Jumia','Konga'],                         moq: 50,  supplierPrice: 1800,   currency: 'NGN', weight: 100 },
  { name: 'Ankara Fabric Print 6 yards',       country: 'Nigeria', category: 'Fashion',        demand: 80, margin: 40, competition: 'Medium',    platforms: ['Jumia','Konga'],                         moq: 10,  supplierPrice: 4500,   currency: 'NGN', weight: 800 },
  { name: 'Rechargeable Standing Fan 18"',     country: 'Nigeria', category: 'Home & Kitchen', demand: 90, margin: 32, competition: 'High',      platforms: ['Jumia','Konga'],                         moq: 10,  supplierPrice: 22000,  currency: 'NGN', weight: 5000},
  { name: 'CCTV Camera Kit 4-Channel',         country: 'Nigeria', category: 'Electronics',    demand: 72, margin: 38, competition: 'Medium',    platforms: ['Jumia','Konga'],                         moq: 5,   supplierPrice: 45000,  currency: 'NGN', weight: 3000},

  // ── SOUTH AFRICA (ZAR) ──────────────────────────────────
  { name: 'Load Shedding Emergency Kit',       country: 'South Africa', category: 'Electronics',demand: 92, margin: 38, competition: 'Medium',   platforms: ['Takealot','Amazon ZA'],                  moq: 15,  supplierPrice: 350,    currency: 'ZAR', weight: 1200},
  { name: 'Biltong Maker Dehydrator',          country: 'South Africa', category: 'Home & Kitchen',demand: 65, margin: 45, competition: 'Low',  platforms: ['Takealot'],                              moq: 10,  supplierPrice: 480,    currency: 'ZAR', weight: 2500},
  { name: 'Braai Toolset Stainless Steel',     country: 'South Africa', category: 'Home & Kitchen',demand: 70, margin: 42, competition: 'Low',  platforms: ['Takealot','Amazon ZA'],                  moq: 15,  supplierPrice: 280,    currency: 'ZAR', weight: 1800},
  { name: 'Rooibos Tea Gift Hamper',           country: 'South Africa', category: 'Food & Beverage',demand: 55, margin: 50, competition: 'Low', platforms: ['Takealot','Amazon ZA'],                  moq: 20,  supplierPrice: 120,    currency: 'ZAR', weight: 600 },
  { name: 'Running Shoes Trail Lightweight',   country: 'South Africa', category: 'Sports',    demand: 68, margin: 40, competition: 'Medium',    platforms: ['Takealot','Amazon ZA'],                  moq: 12,  supplierPrice: 450,    currency: 'ZAR', weight: 600 },

  // ── TURKEY (TRY) ────────────────────────────────────────
  { name: 'Turkish Copper Coffee Pot Set',     country: 'Turkey', category: 'Home & Kitchen',  demand: 68, margin: 48, competition: 'Low',       platforms: ['Trendyol','Hepsiburada','Amazon TR'],   moq: 20,  supplierPrice: 180,    currency: 'TRY', weight: 500 },
  { name: 'Organic Rose Water Toner 250ml',    country: 'Turkey', category: 'Beauty',          demand: 75, margin: 52, competition: 'Medium',    platforms: ['Trendyol','Hepsiburada'],                moq: 50,  supplierPrice: 45,     currency: 'TRY', weight: 280 },
  { name: 'Kilim Pattern Cushion Cover Set',   country: 'Turkey', category: 'Home & Kitchen',  demand: 60, margin: 50, competition: 'Low',       platforms: ['Trendyol','Amazon TR'],                  moq: 30,  supplierPrice: 85,     currency: 'TRY', weight: 400 },
  { name: 'Bluetooth Karaoke Microphone',      country: 'Turkey', category: 'Electronics',     demand: 70, margin: 38, competition: 'Medium',    platforms: ['Trendyol','Hepsiburada','Amazon TR'],   moq: 25,  supplierPrice: 250,    currency: 'TRY', weight: 300 },
  { name: 'Olive Oil Soap Gift Set 6-pack',    country: 'Turkey', category: 'Beauty',          demand: 58, margin: 55, competition: 'Low',       platforms: ['Trendyol','Hepsiburada'],                moq: 40,  supplierPrice: 60,     currency: 'TRY', weight: 600 },

  // ── INDONESIA (IDR) ─────────────────────────────────────
  { name: 'Batik Shirt Men Cotton',            country: 'Indonesia', category: 'Fashion',      demand: 75, margin: 42, competition: 'Medium',    platforms: ['Tokopedia','Shopee ID','Bukalapak'],    moq: 20,  supplierPrice: 45000,  currency: 'IDR', weight: 250 },
  { name: 'Coffee Drip Pour Over Set',         country: 'Indonesia', category: 'Home & Kitchen',demand: 68, margin: 48, competition: 'Low',     platforms: ['Tokopedia','Shopee ID'],                 moq: 30,  supplierPrice: 35000,  currency: 'IDR', weight: 400 },
  { name: 'Temulawak Skincare Set',            country: 'Indonesia', category: 'Beauty',       demand: 82, margin: 50, competition: 'Medium',    platforms: ['Tokopedia','Shopee ID','Bukalapak'],    moq: 50,  supplierPrice: 22000,  currency: 'IDR', weight: 300 },
  { name: 'Rattan Storage Basket Set',         country: 'Indonesia', category: 'Home & Kitchen',demand: 60, margin: 45, competition: 'Low',     platforms: ['Tokopedia','Shopee ID'],                 moq: 15,  supplierPrice: 55000,  currency: 'IDR', weight: 600 },
  { name: 'TWS Earbuds Gaming Low Latency',    country: 'Indonesia', category: 'Electronics',  demand: 80, margin: 38, competition: 'High',      platforms: ['Tokopedia','Shopee ID','Bukalapak'],    moq: 30,  supplierPrice: 42000,  currency: 'IDR', weight: 55  },

  // ── THAILAND (THB) ──────────────────────────────────────
  { name: 'Thai Herbal Compress Ball Set',     country: 'Thailand', category: 'Health',        demand: 65, margin: 55, competition: 'Low',       platforms: ['Shopee TH','Lazada TH'],                 moq: 50,  supplierPrice: 45,     currency: 'THB', weight: 200 },
  { name: 'Coconut Oil Cold Pressed 500ml',    country: 'Thailand', category: 'Beauty',        demand: 72, margin: 48, competition: 'Medium',    platforms: ['Shopee TH','Lazada TH'],                 moq: 40,  supplierPrice: 85,     currency: 'THB', weight: 550 },
  { name: 'Muay Thai Shin Guards',             country: 'Thailand', category: 'Sports',        demand: 60, margin: 42, competition: 'Low',       platforms: ['Shopee TH','Lazada TH'],                 moq: 15,  supplierPrice: 320,    currency: 'THB', weight: 500 },
  { name: 'Smart Plug WiFi 4-pack',            country: 'Thailand', category: 'Electronics',   demand: 78, margin: 40, competition: 'Medium',    platforms: ['Shopee TH','Lazada TH'],                 moq: 30,  supplierPrice: 280,    currency: 'THB', weight: 200 },
  { name: 'Mango Sticky Rice Kit',             country: 'Thailand', category: 'Food & Beverage',demand: 55, margin: 50, competition: 'Low',     platforms: ['Shopee TH','Lazada TH'],                 moq: 30,  supplierPrice: 65,     currency: 'THB', weight: 400 },

  // ── MALAYSIA (MYR) ──────────────────────────────────────
  { name: 'Nasi Lemak Cooker Electric',        country: 'Malaysia', category: 'Home & Kitchen', demand: 65, margin: 42, competition: 'Low',      platforms: ['Shopee MY','Lazada MY'],                 moq: 15,  supplierPrice: 38,     currency: 'MYR', weight: 1200},
  { name: 'Tudung Instant Hijab Premium',      country: 'Malaysia', category: 'Fashion',       demand: 80, margin: 48, competition: 'Medium',    platforms: ['Shopee MY','Lazada MY'],                 moq: 30,  supplierPrice: 12,     currency: 'MYR', weight: 100 },
  { name: 'White Coffee Ipoh 15-Sachet',       country: 'Malaysia', category: 'Food & Beverage',demand: 75, margin: 35, competition: 'Medium',  platforms: ['Shopee MY','Lazada MY'],                 moq: 50,  supplierPrice: 9,      currency: 'MYR', weight: 450 },
  { name: 'Car Phone Holder Dashboard',        country: 'Malaysia', category: 'Automotive',    demand: 72, margin: 50, competition: 'Medium',    platforms: ['Shopee MY','Lazada MY'],                 moq: 40,  supplierPrice: 6.50,   currency: 'MYR', weight: 120 },
  { name: 'Portable Ring Light 10"',           country: 'Malaysia', category: 'Electronics',   demand: 68, margin: 40, competition: 'Medium',    platforms: ['Shopee MY','Lazada MY'],                 moq: 20,  supplierPrice: 22,     currency: 'MYR', weight: 350 },

  // ── SOUTH KOREA (KRW) ───────────────────────────────────
  { name: 'Kimchi Storage Container Set',      country: 'South Korea', category: 'Home & Kitchen',demand: 72, margin: 40, competition: 'Medium',platforms: ['Coupang','Gmarket','11Street'],          moq: 20,  supplierPrice: 12000,  currency: 'KRW', weight: 800 },
  { name: 'K-Beauty Sheet Mask Pack (30pcs)',  country: 'South Korea', category: 'Beauty',     demand: 90, margin: 55, competition: 'High',      platforms: ['Coupang','Gmarket','11Street'],          moq: 50,  supplierPrice: 8500,   currency: 'KRW', weight: 600 },
  { name: 'Soju Glass & Pourer Set',          country: 'South Korea', category: 'Home & Kitchen',demand: 58, margin: 50, competition: 'Low',   platforms: ['Coupang','Gmarket'],                     moq: 30,  supplierPrice: 6500,   currency: 'KRW', weight: 350 },
  { name: 'Electric Gimbap Maker',             country: 'South Korea', category: 'Home & Kitchen',demand: 65, margin: 42, competition: 'Low',  platforms: ['Coupang','11Street'],                    moq: 15,  supplierPrice: 28000,  currency: 'KRW', weight: 900 },
  { name: 'LED Vanity Mirror Foldable',        country: 'South Korea', category: 'Beauty',     demand: 78, margin: 45, competition: 'Medium',    platforms: ['Coupang','Gmarket','11Street'],          moq: 20,  supplierPrice: 9500,   currency: 'KRW', weight: 400 }
];


// ─── SEED SUPPLIERS (40+) ───────────────────────────────────
const SEED_SUPPLIERS = [

  // ── India (8) ───────────────────────────────────────────
  { name: 'ShenzhenLink Electronics (India)',   type: 'Wholesaler',   country: 'India', city: 'Delhi',        products: ['USB-C Fast Charger 65W','Smart LED Bulb WiFi RGB'],             moq: 50,  moqUnit: 'pcs', rating: 4.2, priceIndicator: 'Low',    currency: 'INR', contact: 'sales@shenzhenlink.in',        notes: 'Chinese import wholesaler; Delhi warehouse; 3-5 day delivery' },
  { name: 'KraftWood Artisans',                type: 'Manufacturer', country: 'India', city: 'Jaipur',       products: ['Bamboo Cutlery Organizer'],                                      moq: 30,  moqUnit: 'pcs', rating: 4.5, priceIndicator: 'Low',    currency: 'INR', contact: 'info@kraftwood.co.in',          notes: 'Handcrafted bamboo & wood products; GI tagged' },
  { name: 'GlowVeda Naturals',                 type: 'Manufacturer', country: 'India', city: 'Mumbai',       products: ['Niacinamide Face Serum 30ml'],                                    moq: 100, moqUnit: 'pcs', rating: 4.6, priceIndicator: 'Medium', currency: 'INR', contact: 'orders@glowveda.com',           notes: 'FSSAI & GMP certified; private label available' },
  { name: 'FitZone India',                     type: 'Wholesaler',   country: 'India', city: 'Bengaluru',    products: ['Resistance Bands Set (5-pack)'],                                  moq: 40,  moqUnit: 'sets',rating: 4.0, priceIndicator: 'Low',    currency: 'INR', contact: 'wholesale@fitzone.in',          notes: 'Bulk fitness accessories; branded packaging available' },
  { name: 'Rangoli Textiles',                  type: 'Manufacturer', country: 'India', city: 'Surat',        products: ['Cotton Kurtis Combo Pack'],                                       moq: 25,  moqUnit: 'sets',rating: 4.3, priceIndicator: 'Low',    currency: 'INR', contact: 'tex@rangoli.co.in',             notes: 'Surat textile hub; direct mill pricing' },
  { name: 'TechSpares India',                  type: 'Dealer',       country: 'India', city: 'Hyderabad',    products: ['USB-C Fast Charger 65W','Smart LED Bulb WiFi RGB'],             moq: 25,  moqUnit: 'pcs', rating: 3.9, priceIndicator: 'Medium', currency: 'INR', contact: 'tech@techspares.in',            notes: 'Electronics dealer; smaller MOQ but higher unit price' },
  { name: 'NaturEssence Labs',                 type: 'Manufacturer', country: 'India', city: 'Ahmedabad',    products: ['Niacinamide Face Serum 30ml'],                                    moq: 200, moqUnit: 'pcs', rating: 4.4, priceIndicator: 'Low',    currency: 'INR', contact: 'lab@naturessence.in',           notes: 'Contract manufacturer; ISO 9001; white-label skincare' },
  { name: 'HomeStyle India',                   type: 'Dropshipper',  country: 'India', city: 'Pune',         products: ['Bamboo Cutlery Organizer','Smart LED Bulb WiFi RGB'],           moq: 1,   moqUnit: 'pcs', rating: 3.8, priceIndicator: 'High',   currency: 'INR', contact: 'drop@homestyle.in',             notes: 'No MOQ; dropship from Pune warehouse; 15% markup' },

  // ── China (6) ───────────────────────────────────────────
  { name: 'Shenzhen TechPro Co.',              type: 'Manufacturer', country: 'China', city: 'Shenzhen',     products: ['USB-C Fast Charger 65W','LED Desk Lamp with Wireless Charger','Portable Blender USB-C','Wireless Earbuds ANC'], moq: 200, moqUnit: 'pcs', rating: 4.5, priceIndicator: 'Low',  currency: 'USD', contact: 'export@techpro-sz.com',    notes: 'OEM/ODM factory; CE/FCC certified; Alibaba Gold Supplier' },
  { name: 'Yiwu HomeGoods Trading',            type: 'Wholesaler',   country: 'China', city: 'Yiwu',        products: ['Silicone Baking Mat Set','Stainless Steel Lunch Box Set','Desk Cable Management Kit'],                         moq: 100, moqUnit: 'pcs', rating: 4.1, priceIndicator: 'Low',  currency: 'USD', contact: 'sales@yiwuhome.cn',        notes: 'Yiwu small commodities market; 500+ SKUs' },
  { name: 'Guangzhou Beauty Lab',              type: 'Manufacturer', country: 'China', city: 'Guangzhou',    products: ['Niacinamide Face Serum 30ml','K-Beauty Sheet Mask Pack (30pcs)','Hair Keratin Treatment Kit'],                  moq: 500, moqUnit: 'pcs', rating: 4.3, priceIndicator: 'Low',  currency: 'USD', contact: 'lab@gzbeauty.com',          notes: 'GMP cosmetics factory; FDA registered; private label' },
  { name: 'Dongguan Fitness Equipment',        type: 'Manufacturer', country: 'China', city: 'Dongguan',     products: ['Resistance Bands Set (5-pack)','Muay Thai Shin Guards'],                                                       moq: 300, moqUnit: 'pcs', rating: 4.2, priceIndicator: 'Low',  currency: 'USD', contact: 'factory@dgfitness.com',    notes: 'Sports equipment factory; SGS tested; custom branding' },
  { name: 'Ningbo Solar Tech',                 type: 'Manufacturer', country: 'China', city: 'Ningbo',       products: ['Solar Power Bank 20000mAh','Solar Garden Lights (10-pack)','Smart Plug WiFi 4-pack'],                          moq: 200, moqUnit: 'pcs', rating: 4.4, priceIndicator: 'Low',  currency: 'USD', contact: 'solar@nbtech.cn',           notes: 'Solar product specialist; UL/CE certified' },
  { name: 'Xiamen Pet World',                  type: 'Manufacturer', country: 'China', city: 'Xiamen',       products: ['Cat Self-Grooming Arch','Waterproof Dog Coat Reflective'],                                                      moq: 200, moqUnit: 'pcs', rating: 4.0, priceIndicator: 'Low',  currency: 'USD', contact: 'pets@xiamenpet.com',        notes: 'Pet products factory; AZO-free materials' },

  // ── USA (4) ─────────────────────────────────────────────
  { name: 'Pacific Coast Supplements',         type: 'Manufacturer', country: 'USA',   city: 'Portland',     products: ['Collagen Peptides Powder 400g','Organic Hemp Protein Powder 1kg'],                                              moq: 50,  moqUnit: 'units',rating: 4.7, priceIndicator: 'Medium',currency: 'USD', contact: 'wholesale@paccoast.com',     notes: 'FDA registered; NSF certified; private label available' },
  { name: 'GreenHive Eco Products',            type: 'Manufacturer', country: 'USA',   city: 'Austin',       products: ['Organic Beeswax Wrap Set','Bamboo Toothbrush Set (12-pack)'],                                                   moq: 100, moqUnit: 'sets', rating: 4.6, priceIndicator: 'Medium',currency: 'USD', contact: 'sales@greenhive.co',       notes: 'B-Corp certified; eco-friendly packaging; US-made' },
  { name: 'AutoParts Direct USA',              type: 'Wholesaler',   country: 'USA',   city: 'Detroit',      products: ['Car Phone Mount MagSafe','Car Dash Cam 4K WiFi'],                                                               moq: 25,  moqUnit: 'pcs', rating: 4.3, priceIndicator: 'Medium',currency: 'USD', contact: 'bulk@autopartsdirect.com',  notes: 'Automotive accessories distributor; FBA prep available' },
  { name: 'TungstenCraft Jewelry',             type: 'Manufacturer', country: 'USA',   city: 'Los Angeles',  products: ['Tungsten Wedding Band 8mm'],                                                                                     moq: 10,  moqUnit: 'pcs', rating: 4.8, priceIndicator: 'Low',   currency: 'USD', contact: 'orders@tungstencraft.com',  notes: 'Direct manufacturer; custom engraving; lifetime warranty' },

  // ── UAE (3) ─────────────────────────────────────────────
  { name: 'Al Haramain Fragrances',            type: 'Wholesaler',   country: 'UAE',   city: 'Dubai',        products: ['Oud Perfume Oil 12ml Roll-on','Car Perfume Vent Clip'],                                                          moq: 50,  moqUnit: 'pcs', rating: 4.4, priceIndicator: 'Medium',currency: 'AED', contact: 'wholesale@alharamain.ae',   notes: 'Premium Arabian fragrances; ESMA certified' },
  { name: 'Desert Cool Trading',               type: 'Wholesaler',   country: 'UAE',   city: 'Sharjah',      products: ['Car Sunshade Umbrella Foldable','Portable Mini AC Fan'],                                                         moq: 30,  moqUnit: 'pcs', rating: 4.1, priceIndicator: 'Medium',currency: 'AED', contact: 'trade@desertcool.ae',       notes: 'Climate-focused products; Sharjah free zone' },
  { name: 'Modesty Fashion FZCO',              type: 'Manufacturer', country: 'UAE',   city: 'Ajman',        products: ['Modest Swim Burkini Set','Abaya Casual Modern'],                                                                moq: 20,  moqUnit: 'pcs', rating: 4.3, priceIndicator: 'Medium',currency: 'AED', contact: 'design@modestyfzco.ae',     notes: 'Modest fashion manufacturer; custom designs; Ajman free zone' },

  // ── UK (2) ──────────────────────────────────────────────
  { name: 'British Health Co.',                type: 'Manufacturer', country: 'UK',    city: 'Manchester',   products: ['Vitamin D3 Gummies 120ct','Bamboo Toothbrush Set (12-pack)'],                                                    moq: 100, moqUnit: 'units',rating: 4.5, priceIndicator: 'Medium',currency: 'GBP', contact: 'trade@britishhealth.co.uk',notes: 'MHRA compliant; GMP certified; UK made' },
  { name: 'PetCare UK Ltd',                    type: 'Wholesaler',   country: 'UK',    city: 'Birmingham',   products: ['Waterproof Dog Coat Reflective'],                                                                                moq: 20,  moqUnit: 'pcs', rating: 4.2, priceIndicator: 'Medium',currency: 'GBP', contact: 'orders@petcareuk.co.uk',   notes: 'UK pet product distributor; next-day fulfillment' },

  // ── Germany (2) ─────────────────────────────────────────
  { name: 'BioNatur GmbH',                    type: 'Manufacturer', country: 'Germany', city: 'Hamburg',     products: ['Organic Hemp Protein Powder 1kg','Merino Wool Base Layer'],                                                      moq: 50,  moqUnit: 'units',rating: 4.6, priceIndicator: 'Medium',currency: 'EUR', contact: 'vertrieb@bionatur.de',     notes: 'Organic certified; EU compliant; eco packaging' },
  { name: 'RadWerk Accessories',               type: 'Wholesaler',   country: 'Germany', city: 'Berlin',     products: ['E-Bike Phone Holder Waterproof','LED Camping Lantern Rechargeable'],                                             moq: 40,  moqUnit: 'pcs', rating: 4.3, priceIndicator: 'Medium',currency: 'EUR', contact: 'info@radwerk.de',           notes: 'Cycling & outdoor accessories; TÜV certified' },

  // ── Japan (2) ───────────────────────────────────────────
  { name: 'Kyoto Craft Works',                 type: 'Manufacturer', country: 'Japan',  city: 'Kyoto',       products: ['Matcha Whisk Set Bamboo','Bento Box 3-Tier Stainless'],                                                          moq: 30,  moqUnit: 'sets', rating: 4.7, priceIndicator: 'Medium',currency: 'JPY', contact: 'export@kyotocraft.jp',     notes: 'Traditional Japanese kitchenware; artisan quality' },
  { name: 'Tokyo Wellness Corp',               type: 'Wholesaler',   country: 'Japan',  city: 'Tokyo',       products: ['Heated Eye Mask USB','Anti-Fog Bathroom Mirror LED'],                                                            moq: 20,  moqUnit: 'pcs', rating: 4.4, priceIndicator: 'Medium',currency: 'JPY', contact: 'trade@tokyowellness.co.jp', notes: 'Health & wellness distributor; PSE certified' },

  // ── Brazil (2) ──────────────────────────────────────────
  { name: 'Gaúcha Mate Artesanal',             type: 'Manufacturer', country: 'Brazil', city: 'Porto Alegre', products: ['Chimarrão Mate Gourd & Bomba Set'],                                                                             moq: 20,  moqUnit: 'sets', rating: 4.3, priceIndicator: 'Low',   currency: 'BRL', contact: 'vendas@gauchamate.com.br',  notes: 'Artisan mate accessories; Rio Grande do Sul origin' },
  { name: 'Café Premium Brasil',               type: 'Manufacturer', country: 'Brazil', city: 'São Paulo',   products: ['Brazilian Coffee Capsules (50-pack)'],                                                                           moq: 30,  moqUnit: 'boxes',rating: 4.5, priceIndicator: 'Medium',currency: 'BRL', contact: 'export@cafepremium.com.br', notes: 'Specialty coffee; Nespresso compatible; organic certified' },

  // ── Turkey (2) ──────────────────────────────────────────
  { name: 'Anatolian Copper Art',              type: 'Manufacturer', country: 'Turkey', city: 'Gaziantep',   products: ['Turkish Copper Coffee Pot Set','Kilim Pattern Cushion Cover Set'],                                               moq: 20,  moqUnit: 'sets', rating: 4.4, priceIndicator: 'Low',   currency: 'TRY', contact: 'ihracat@anatoliancopper.com.tr', notes: 'Traditional Turkish handicraft; CE certified for EU export' },
  { name: 'Istanbul Beauty Export',            type: 'Wholesaler',   country: 'Turkey', city: 'Istanbul',    products: ['Organic Rose Water Toner 250ml','Olive Oil Soap Gift Set 6-pack'],                                               moq: 50,  moqUnit: 'pcs', rating: 4.2, priceIndicator: 'Low',   currency: 'TRY', contact: 'export@istbeauty.com.tr',       notes: 'Natural cosmetics exporter; GMP facility; CPNP registered' },

  // ── South Korea (2) ─────────────────────────────────────
  { name: 'Seoul K-Beauty Lab',                type: 'Manufacturer', country: 'South Korea', city: 'Seoul',  products: ['K-Beauty Sheet Mask Pack (30pcs)','LED Vanity Mirror Foldable'],                                                 moq: 100, moqUnit: 'pcs', rating: 4.6, priceIndicator: 'Medium',currency: 'KRW', contact: 'export@seoulkbeauty.kr',   notes: 'KFDA certified; private label K-beauty OEM' },
  { name: 'Incheon Kitchen Co.',               type: 'Manufacturer', country: 'South Korea', city: 'Incheon',products: ['Kimchi Storage Container Set','Electric Gimbap Maker','Soju Glass & Pourer Set'],                               moq: 20,  moqUnit: 'pcs', rating: 4.3, priceIndicator: 'Medium',currency: 'KRW', contact: 'sales@incheonkitchen.kr',  notes: 'Korean kitchenware specialist; KC mark certified' },

  // ── Vietnam (2) ─────────────────────────────────────────
  { name: 'Saigon Rattan Co.',                 type: 'Manufacturer', country: 'Vietnam', city: 'Ho Chi Minh', products: ['Rattan Storage Basket Set','Bamboo Cutlery Organizer'],                                                         moq: 50,  moqUnit: 'sets', rating: 4.2, priceIndicator: 'Low',   currency: 'USD', contact: 'export@saigonrattan.vn',    notes: 'Handwoven rattan & bamboo; Fair Trade certified' },
  { name: 'Hanoi Coffee Roasters',             type: 'Manufacturer', country: 'Vietnam', city: 'Hanoi',      products: ['Coffee Drip Pour Over Set'],                                                                                     moq: 30,  moqUnit: 'sets', rating: 4.4, priceIndicator: 'Low',   currency: 'USD', contact: 'trade@hanoicoffee.vn',      notes: 'Vietnamese coffee accessories; ceramic drippers' },

  // ── Thailand (2) ────────────────────────────────────────
  { name: 'Chiang Mai Herbals',                type: 'Manufacturer', country: 'Thailand', city: 'Chiang Mai', products: ['Thai Herbal Compress Ball Set','Coconut Oil Cold Pressed 500ml'],                                                moq: 50,  moqUnit: 'pcs', rating: 4.5, priceIndicator: 'Low',   currency: 'THB', contact: 'export@cmherbals.co.th',    notes: 'Organic certified; Thai FDA approved; traditional recipes' },
  { name: 'Bangkok Sports Gear',               type: 'Wholesaler',   country: 'Thailand', city: 'Bangkok',    products: ['Muay Thai Shin Guards'],                                                                                        moq: 15,  moqUnit: 'pairs',rating: 4.1, priceIndicator: 'Low',   currency: 'THB', contact: 'sales@bkksportsgear.co.th', notes: 'Muay Thai equipment specialist; genuine leather option' },

  // ── Indonesia (2) ───────────────────────────────────────
  { name: 'Jogja Batik House',                 type: 'Manufacturer', country: 'Indonesia', city: 'Yogyakarta',products: ['Batik Shirt Men Cotton'],                                                                                       moq: 20,  moqUnit: 'pcs', rating: 4.4, priceIndicator: 'Low',   currency: 'IDR', contact: 'order@jogjabatik.co.id',    notes: 'Hand-stamped batik; UNESCO heritage craft; SNI certified' },
  { name: 'Jakarta Beauty Store',              type: 'Wholesaler',   country: 'Indonesia', city: 'Jakarta',   products: ['Temulawak Skincare Set'],                                                                                        moq: 50,  moqUnit: 'sets', rating: 4.0, priceIndicator: 'Low',   currency: 'IDR', contact: 'grosir@jktbeauty.co.id',    notes: 'BPOM registered products; halal certified' },

  // ── Nigeria (1) ─────────────────────────────────────────
  { name: 'Lagos Tech Hub Wholesale',          type: 'Wholesaler',   country: 'Nigeria', city: 'Lagos',      products: ['Solar Power Bank 20000mAh','CCTV Camera Kit 4-Channel','Rechargeable Standing Fan 18"'],                         moq: 10,  moqUnit: 'pcs', rating: 3.8, priceIndicator: 'Medium',currency: 'NGN', contact: 'sales@lagostechhub.ng',     notes: 'Computer Village distributor; SON certified electronics' },

  // ── South Africa (1) ────────────────────────────────────
  { name: 'Cape Town Outdoor Supplies',        type: 'Wholesaler',   country: 'South Africa', city: 'Cape Town', products: ['Braai Toolset Stainless Steel','Load Shedding Emergency Kit','Biltong Maker Dehydrator'],                    moq: 10,  moqUnit: 'pcs', rating: 4.1, priceIndicator: 'Medium',currency: 'ZAR', contact: 'orders@capeoutdoor.co.za',  notes: 'SABS approved; specializing in load shedding solutions' },

  // ── Mexico (1) ──────────────────────────────────────────
  { name: 'Oaxaca Artesanías',                 type: 'Manufacturer', country: 'Mexico', city: 'Oaxaca',      products: ['Molcajete Volcanic Stone','Lucha Libre Mask Authentic'],                                                          moq: 10,  moqUnit: 'pcs', rating: 4.5, priceIndicator: 'Low',   currency: 'MXN', contact: 'ventas@oaxacaarte.com.mx',  notes: 'Traditional Mexican artisan products; fair trade; handmade' },

  // ── Australia (1) ───────────────────────────────────────
  { name: 'Aussie Sun Care Pty Ltd',           type: 'Manufacturer', country: 'Australia', city: 'Melbourne', products: ['Reef-Safe Sunscreen SPF50'],                                                                                    moq: 50,  moqUnit: 'units',rating: 4.6, priceIndicator: 'Medium',currency: 'AUD', contact: 'trade@aussiesuncare.com.au',notes: 'TGA listed; reef-safe formula; Australian made' }
];


// ─── SEED PLATFORMS (fee data) ──────────────────────────────
const SEED_PLATFORMS = [

  // ── India ───────────────────────────────────────────────
  { name: 'Amazon',       country: 'India',        feeRef: 0.12,  closing: 30,     ship: 60,     color: '#FF9900', currency: 'INR' },
  { name: 'Flipkart',     country: 'India',        feeRef: 0.10,  closing: 20,     ship: 50,     color: '#2874F0', currency: 'INR' },
  { name: 'Meesho',       country: 'India',        feeRef: 0.00,  closing: 0,      ship: 55,     color: '#F43397', currency: 'INR' },
  { name: 'Myntra',       country: 'India',        feeRef: 0.15,  closing: 25,     ship: 49,     color: '#FF3F6C', currency: 'INR' },
  { name: 'Snapdeal',     country: 'India',        feeRef: 0.08,  closing: 15,     ship: 45,     color: '#E40046', currency: 'INR' },

  // ── USA ─────────────────────────────────────────────────
  { name: 'Amazon',       country: 'USA',          feeRef: 0.15,  closing: 1.80,   ship: 5.00,   color: '#FF9900', currency: 'USD' },
  { name: 'eBay',         country: 'USA',          feeRef: 0.13,  closing: 0.30,   ship: 4.50,   color: '#E53238', currency: 'USD' },
  { name: 'Walmart',      country: 'USA',          feeRef: 0.12,  closing: 0,      ship: 5.50,   color: '#0071CE', currency: 'USD' },
  { name: 'Etsy',         country: 'USA',          feeRef: 0.065, closing: 0.20,   ship: 4.00,   color: '#F56400', currency: 'USD' },

  // ── UK ──────────────────────────────────────────────────
  { name: 'Amazon UK',    country: 'UK',           feeRef: 0.15,  closing: 0.50,   ship: 3.50,   color: '#FF9900', currency: 'GBP' },
  { name: 'eBay UK',      country: 'UK',           feeRef: 0.12,  closing: 0.25,   ship: 3.20,   color: '#E53238', currency: 'GBP' },
  { name: 'OnBuy',        country: 'UK',           feeRef: 0.09,  closing: 0,      ship: 3.50,   color: '#00A9E0', currency: 'GBP' },

  // ── UAE ─────────────────────────────────────────────────
  { name: 'Amazon.ae',    country: 'UAE',          feeRef: 0.12,  closing: 2,      ship: 10,     color: '#FF9900', currency: 'AED' },
  { name: 'Noon',         country: 'UAE',          feeRef: 0.10,  closing: 0,      ship: 12,     color: '#FEEE00', currency: 'AED' },
  { name: 'Namshi',       country: 'UAE',          feeRef: 0.15,  closing: 0,      ship: 0,      color: '#000000', currency: 'AED' },

  // ── Canada ──────────────────────────────────────────────
  { name: 'Amazon CA',    country: 'Canada',       feeRef: 0.15,  closing: 1.49,   ship: 6.00,   color: '#FF9900', currency: 'CAD' },
  { name: 'eBay CA',      country: 'Canada',       feeRef: 0.13,  closing: 0.30,   ship: 5.50,   color: '#E53238', currency: 'CAD' },
  { name: 'Shopify',      country: 'Canada',       feeRef: 0.029, closing: 0.30,   ship: 7.00,   color: '#96BF48', currency: 'CAD' },

  // ── Australia ───────────────────────────────────────────
  { name: 'Amazon AU',    country: 'Australia',    feeRef: 0.12,  closing: 0.99,   ship: 8.00,   color: '#FF9900', currency: 'AUD' },
  { name: 'eBay AU',      country: 'Australia',    feeRef: 0.13,  closing: 0.50,   ship: 7.50,   color: '#E53238', currency: 'AUD' },
  { name: 'Kogan',        country: 'Australia',    feeRef: 0.14,  closing: 0,      ship: 9.00,   color: '#FFD700', currency: 'AUD' },

  // ── Germany ─────────────────────────────────────────────
  { name: 'Amazon.de',    country: 'Germany',      feeRef: 0.15,  closing: 0.50,   ship: 4.50,   color: '#FF9900', currency: 'EUR' },
  { name: 'Otto',         country: 'Germany',      feeRef: 0.12,  closing: 0,      ship: 4.95,   color: '#D42F2F', currency: 'EUR' },
  { name: 'Zalando',      country: 'Germany',      feeRef: 0.18,  closing: 0,      ship: 0,      color: '#FF6900', currency: 'EUR' },

  // ── France ──────────────────────────────────────────────
  { name: 'Amazon.fr',    country: 'France',       feeRef: 0.15,  closing: 0.50,   ship: 4.00,   color: '#FF9900', currency: 'EUR' },
  { name: 'Cdiscount',    country: 'France',       feeRef: 0.14,  closing: 0,      ship: 4.50,   color: '#00A3E0', currency: 'EUR' },
  { name: 'Fnac',         country: 'France',       feeRef: 0.13,  closing: 0,      ship: 3.99,   color: '#E4A700', currency: 'EUR' },

  // ── Japan ───────────────────────────────────────────────
  { name: 'Amazon JP',    country: 'Japan',        feeRef: 0.10,  closing: 100,    ship: 400,    color: '#FF9900', currency: 'JPY' },
  { name: 'Rakuten',      country: 'Japan',        feeRef: 0.08,  closing: 50,     ship: 500,    color: '#BF0000', currency: 'JPY' },
  { name: 'Yahoo Shopping',country: 'Japan',       feeRef: 0.06,  closing: 0,      ship: 550,    color: '#FF0033', currency: 'JPY' },

  // ── Singapore ───────────────────────────────────────────
  { name: 'Shopee',       country: 'Singapore',    feeRef: 0.04,  closing: 0,      ship: 2.50,   color: '#EE4D2D', currency: 'SGD' },
  { name: 'Lazada',       country: 'Singapore',    feeRef: 0.05,  closing: 0,      ship: 3.00,   color: '#0F146D', currency: 'SGD' },
  { name: 'Amazon SG',    country: 'Singapore',    feeRef: 0.12,  closing: 0.50,   ship: 4.00,   color: '#FF9900', currency: 'SGD' },

  // ── Saudi Arabia ────────────────────────────────────────
  { name: 'Amazon.sa',    country: 'Saudi Arabia', feeRef: 0.12,  closing: 2,      ship: 15,     color: '#FF9900', currency: 'SAR' },
  { name: 'Noon',         country: 'Saudi Arabia', feeRef: 0.10,  closing: 0,      ship: 12,     color: '#FEEE00', currency: 'SAR' },
  { name: 'Jarir',        country: 'Saudi Arabia', feeRef: 0.08,  closing: 0,      ship: 10,     color: '#003DA5', currency: 'SAR' },

  // ── Brazil ──────────────────────────────────────────────
  { name: 'Mercado Libre',country: 'Brazil',       feeRef: 0.13,  closing: 0,      ship: 18,     color: '#FFE600', currency: 'BRL' },
  { name: 'Amazon BR',    country: 'Brazil',       feeRef: 0.15,  closing: 2,      ship: 15,     color: '#FF9900', currency: 'BRL' },
  { name: 'Shopee BR',    country: 'Brazil',       feeRef: 0.05,  closing: 0,      ship: 12,     color: '#EE4D2D', currency: 'BRL' },

  // ── Mexico ──────────────────────────────────────────────
  { name: 'Mercado Libre MX', country: 'Mexico',   feeRef: 0.13,  closing: 0,      ship: 80,     color: '#FFE600', currency: 'MXN' },
  { name: 'Amazon MX',    country: 'Mexico',       feeRef: 0.15,  closing: 10,     ship: 70,     color: '#FF9900', currency: 'MXN' },

  // ── Nigeria ─────────────────────────────────────────────
  { name: 'Jumia',        country: 'Nigeria',      feeRef: 0.10,  closing: 0,      ship: 1500,   color: '#F68B1E', currency: 'NGN' },
  { name: 'Konga',        country: 'Nigeria',      feeRef: 0.08,  closing: 0,      ship: 1200,   color: '#ED1C24', currency: 'NGN' },

  // ── South Africa ────────────────────────────────────────
  { name: 'Takealot',     country: 'South Africa', feeRef: 0.12,  closing: 0,      ship: 60,     color: '#0B79BF', currency: 'ZAR' },
  { name: 'Amazon ZA',    country: 'South Africa', feeRef: 0.15,  closing: 5,      ship: 55,     color: '#FF9900', currency: 'ZAR' },

  // ── Turkey ──────────────────────────────────────────────
  { name: 'Trendyol',     country: 'Turkey',       feeRef: 0.08,  closing: 0,      ship: 15,     color: '#F27A1A', currency: 'TRY' },
  { name: 'Hepsiburada',  country: 'Turkey',       feeRef: 0.10,  closing: 0,      ship: 18,     color: '#FF6000', currency: 'TRY' },
  { name: 'Amazon TR',    country: 'Turkey',       feeRef: 0.15,  closing: 3,      ship: 20,     color: '#FF9900', currency: 'TRY' },

  // ── Indonesia ───────────────────────────────────────────
  { name: 'Tokopedia',    country: 'Indonesia',    feeRef: 0.03,  closing: 0,      ship: 12000,  color: '#42B549', currency: 'IDR' },
  { name: 'Shopee ID',    country: 'Indonesia',    feeRef: 0.04,  closing: 0,      ship: 10000,  color: '#EE4D2D', currency: 'IDR' },
  { name: 'Bukalapak',    country: 'Indonesia',    feeRef: 0.02,  closing: 0,      ship: 11000,  color: '#E31E52', currency: 'IDR' },

  // ── Thailand ────────────────────────────────────────────
  { name: 'Shopee TH',    country: 'Thailand',     feeRef: 0.04,  closing: 0,      ship: 40,     color: '#EE4D2D', currency: 'THB' },
  { name: 'Lazada TH',    country: 'Thailand',     feeRef: 0.05,  closing: 0,      ship: 45,     color: '#0F146D', currency: 'THB' },

  // ── Malaysia ────────────────────────────────────────────
  { name: 'Shopee MY',    country: 'Malaysia',     feeRef: 0.04,  closing: 0,      ship: 5.50,   color: '#EE4D2D', currency: 'MYR' },
  { name: 'Lazada MY',    country: 'Malaysia',     feeRef: 0.05,  closing: 0,      ship: 6.00,   color: '#0F146D', currency: 'MYR' },

  // ── South Korea ─────────────────────────────────────────
  { name: 'Coupang',      country: 'South Korea',  feeRef: 0.10,  closing: 0,      ship: 0,      color: '#E31837', currency: 'KRW' },
  { name: 'Gmarket',      country: 'South Korea',  feeRef: 0.12,  closing: 0,      ship: 2500,   color: '#00A651', currency: 'KRW' },
  { name: '11Street',     country: 'South Korea',  feeRef: 0.10,  closing: 0,      ship: 2500,   color: '#FF0000', currency: 'KRW' }
];

/* ============================================================
   FEATURE 7 — SOCIAL MEDIA BUZZ DATA
   ============================================================ */
const SOCIAL_BUZZ = {
  'phone stand':             { tiktok: 45000,  instagram: 12000, facebook: 8000,  youtube: 3500  },
  'sunscreen':               { tiktok: 120000, instagram: 45000, facebook: 22000, youtube: 15000 },
  'kitchen strainer':        { tiktok: 8000,   instagram: 3000,  facebook: 2000,  youtube: 1200  },
  'bluetooth earphones':     { tiktok: 250000, instagram: 80000, facebook: 45000, youtube: 30000 },
  'resistance band':         { tiktok: 180000, instagram: 60000, facebook: 35000, youtube: 22000 },
  'led desk lamp':           { tiktok: 35000,  instagram: 15000, facebook: 9000,  youtube: 5000  },
  'cotton kurti':            { tiktok: 90000,  instagram: 35000, facebook: 18000, youtube: 8000  },
  'pet water fountain':      { tiktok: 220000, instagram: 75000, facebook: 40000, youtube: 28000 },
  'car phone mount':         { tiktok: 55000,  instagram: 22000, facebook: 12000, youtube: 7000  },
  'silicone ice tray':       { tiktok: 65000,  instagram: 25000, facebook: 14000, youtube: 9000  },
  'centella sunscreen':      { tiktok: 95000,  instagram: 38000, facebook: 21000, youtube: 13000 },
  'under desk foot rest':    { tiktok: 28000,  instagram: 11000, facebook: 6000,  youtube: 3500  },
  'magnetic cable organizer':{ tiktok: 150000, instagram: 55000, facebook: 30000, youtube: 18000 },
  'posture corrector':       { tiktok: 200000, instagram: 70000, facebook: 38000, youtube: 25000 },
  'led strip lights':        { tiktok: 310000, instagram: 95000, facebook: 52000, youtube: 40000 },
  'portable blender':        { tiktok: 175000, instagram: 62000, facebook: 34000, youtube: 21000 },
  'acne patches':            { tiktok: 290000, instagram: 88000, facebook: 48000, youtube: 32000 },
  'fitness tracker':         { tiktok: 140000, instagram: 50000, facebook: 28000, youtube: 18000 },
};

/**
 * Calculate viral score (0-100) from social data.
 * Falls back to a deterministic hash-based score for unknown products.
 */
function calculateViralScore(productName) {
  const key  = (productName || '').toLowerCase().trim();
  const buzz = SOCIAL_BUZZ[key];

  if (!buzz) {
    // Deterministic fallback based on name hash so same product always gets same score
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff;
    const score = Math.abs(hash % 60) + 10; // 10–70 range for unknown products
    return { score, breakdown: { tiktok: Math.round(score * 0.4), instagram: Math.round(score * 0.3), facebook: Math.round(score * 0.2), youtube: Math.round(score * 0.1) }, raw: null };
  }

  // Normalize each platform's contribution
  const tiktokScore = Math.min(buzz.tiktok   / 3000,  40);
  const instaScore  = Math.min(buzz.instagram / 1000,  30);
  const fbScore     = Math.min(buzz.facebook  / 500,   20);
  const ytScore     = Math.min(buzz.youtube   / 300,   10);
  const total       = Math.min(100, Math.round(tiktokScore + instaScore + fbScore + ytScore));

  return {
    score: total,
    breakdown: {
      tiktok:    Math.round(tiktokScore),
      instagram: Math.round(instaScore),
      facebook:  Math.round(fbScore),
      youtube:   Math.round(ytScore),
    },
    raw: buzz,
  };
}

