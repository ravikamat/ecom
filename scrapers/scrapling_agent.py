#!/usr/bin/env python3
"""
ECO Scrapling Agent — v2.3
Reads JSON from stdin, runs the appropriate scraper, returns JSON to stdout.
Called by Node.js via child_process.spawn.

Input (stdin JSON):
{
  "task": "search_products|find_suppliers|get_price_comparison|check_competition|analyze_url|get_trending",
  "query": "resistance band",
  "platform": "amazon|flipkart|meesho|all",
  "country": "India",
  "maxResults": 10,
  "url": "https://..."  // for analyze_url task
}

Output (stdout JSON):
{
  "success": true,
  "task": "...",
  "results": [...],
  "source": "scrapling",
  "confidence": 0.85,
  "scrapedAt": "ISO timestamp"
}
"""

import sys
import json
import time
import re
import traceback
from datetime import datetime
from urllib.parse import quote_plus, urljoin

def log(msg):
    """Write debug logs to stderr so they don't pollute stdout JSON."""
    print(f"[Scrapling] {msg}", file=sys.stderr)

def clean_price(text):
    """Extract numeric price from strings like '₹1,299' or 'Rs. 450' etc."""
    if not text:
        return None
    cleaned = re.sub(r'[^\d.]', '', text.replace(',', ''))
    try:
        return float(cleaned) if cleaned else None
    except:
        return None

def clean_text(text):
    """Strip whitespace and normalize."""
    if not text:
        return ''
    return ' '.join(text.split())

def get_fetcher(stealth=False):
    """Get appropriate fetcher based on requirements."""
    try:
        if stealth:
            from scrapling.fetchers import StealthyFetcher
            return StealthyFetcher
        else:
            from scrapling.fetchers import Fetcher
            return Fetcher
    except ImportError as e:
        log(f"Fetcher import error: {e}")
        return None

# ─────────────────────────────────────────────────────────────
# TASK: search_products — Search selling platforms
# ─────────────────────────────────────────────────────────────

def search_amazon_india(query, max_results=10):
    """Search Amazon India for products."""
    results = []
    try:
        from scrapling.fetchers import Fetcher
        url = f"https://www.amazon.in/s?k={quote_plus(query)}&i=aps"
        log(f"Scraping Amazon India: {url}")
        page = Fetcher.get(url, timeout=15, stealthy_headers=True)

        for item in page.css('[data-component-type="s-search-result"]')[:max_results]:
            try:
                name    = clean_text(item.css('h2 a span::text').get() or '')
                price   = clean_price(item.css('.a-price-whole::text').get())
                rating  = item.css('.a-icon-alt::text').get()
                reviews = clean_text(item.css('[data-csa-c-asin]::attr(data-csa-c-asin)').get() or '')
                link    = item.css('h2 a::attr(href)').get()
                img     = item.css('.s-image::attr(src)').get()

                if name and price:
                    results.append({
                        'name':     name[:120],
                        'price':    price,
                        'rating':   float(clean_text(rating).split()[0]) if rating else None,
                        'platform': 'Amazon India',
                        'url':      urljoin('https://www.amazon.in', link) if link else None,
                        'imageUrl': img,
                        'currency': 'INR',
                    })
            except Exception as e:
                log(f"  Item parse error: {e}")
                continue

    except Exception as e:
        log(f"Amazon search error: {e}")

    return results


def search_flipkart(query, max_results=10):
    """Search Flipkart for products."""
    results = []
    try:
        from scrapling.fetchers import Fetcher
        url = f"https://www.flipkart.com/search?q={quote_plus(query)}"
        log(f"Scraping Flipkart: {url}")
        page = Fetcher.get(url, timeout=15, stealthy_headers=True)

        # Flipkart product cards
        cards = page.css('._75nlfW') or page.css('[data-id]') or page.css('._1xHGtK._373qXS')
        for item in cards[:max_results]:
            try:
                name  = clean_text(item.css('._4rR01T::text').get() or item.css('.IRpwTa::text').get() or '')
                price = clean_price(item.css('._30jeq3._1_WHN1::text').get() or item.css('._30jeq3::text').get())
                link  = item.css('a::attr(href)').get()
                rating= item.css('._3LWZlK::text').get()
                img   = item.css('img::attr(src)').get()

                if name and price:
                    results.append({
                        'name':     name[:120],
                        'price':    price,
                        'rating':   float(rating) if rating else None,
                        'platform': 'Flipkart',
                        'url':      urljoin('https://www.flipkart.com', link) if link else None,
                        'imageUrl': img,
                        'currency': 'INR',
                    })
            except Exception as e:
                log(f"  Flipkart item error: {e}")
                continue

    except Exception as e:
        log(f"Flipkart search error: {e}")

    return results


def search_google_shopping(query, max_results=10):
    """Search Google Shopping for price comparison."""
    results = []
    try:
        from scrapling.fetchers import Fetcher
        url = f"https://www.google.com/search?q={quote_plus(query)}&tbm=shop&hl=en&gl=in"
        log(f"Scraping Google Shopping: {url}")
        page = Fetcher.get(url, timeout=15, stealthy_headers=True)

        for item in page.css('.sh-dgr__grid-result')[:max_results]:
            try:
                name  = clean_text(item.css('h3::text').get() or item.css('.tAxDx::text').get() or '')
                price = clean_price(item.css('.a8Pemb::text').get() or item.css('.T14wmb::text').get())
                store = clean_text(item.css('.aULzUe::text').get() or '')
                link  = item.css('a::attr(href)').get()

                if name and price:
                    results.append({
                        'name':     name[:120],
                        'price':    price,
                        'store':    store,
                        'platform': 'Google Shopping',
                        'url':      link,
                        'currency': 'INR',
                    })
            except:
                continue

    except Exception as e:
        log(f"Google Shopping error: {e}")

    return results


def search_meesho(query, max_results=10):
    """Search Meesho for products."""
    results = []
    try:
        from scrapling.fetchers import Fetcher
        url = f"https://www.meesho.com/search?q={quote_plus(query)}"
        log(f"Scraping Meesho: {url}")
        page = Fetcher.get(url, timeout=15, stealthy_headers=True)

        for item in page.css('[class*="ProductList"]')[:max_results]:
            try:
                name  = clean_text(item.css('p::text').get() or '')
                price = clean_price(item.css('[class*="price"]::text').get())
                img   = item.css('img::attr(src)').get()

                if name and price:
                    results.append({
                        'name':     name[:120],
                        'price':    price,
                        'platform': 'Meesho',
                        'imageUrl': img,
                        'currency': 'INR',
                    })
            except:
                continue

    except Exception as e:
        log(f"Meesho error: {e}")

    return results


# ─────────────────────────────────────────────────────────────
# TASK: find_suppliers — Supplier sourcing platforms
# ─────────────────────────────────────────────────────────────

def search_indiamart(query, max_results=10):
    """Search IndiaMART for suppliers."""
    results = []
    try:
        from scrapling.fetchers import Fetcher
        url = f"https://www.indiamart.com/search.mp?ss={quote_plus(query)}"
        log(f"Scraping IndiaMART: {url}")
        page = Fetcher.get(url, timeout=20, stealthy_headers=True)

        for item in page.css('.moredetail, .cls-p-lst-l-d, [class*="product-"]')[:max_results]:
            try:
                name     = clean_text(item.css('h3::text, .prod-title::text').get() or '')
                price    = clean_text(item.css('.price, .prc::text, .jss82::text').get() or '')
                supplier = clean_text(item.css('.lcname::text, .company::text, .jss61::text').get() or '')
                location = clean_text(item.css('.loc::text, .city::text').get() or '')
                moq      = clean_text(item.css('.moq::text, [class*="moq"]::text').get() or '')
                link     = item.css('a::attr(href)').get()

                if name:
                    results.append({
                        'name':         name[:100],
                        'priceRange':   price,
                        'supplier':     supplier,
                        'location':     location,
                        'moq':          moq,
                        'platform':     'IndiaMART',
                        'url':          urljoin('https://www.indiamart.com', link) if link else None,
                        'supplierType': 'manufacturer_or_trader',
                        'currency':     'INR',
                    })
            except:
                continue

    except Exception as e:
        log(f"IndiaMART error: {e}")

    return results


def search_alibaba(query, max_results=10):
    """Search Alibaba.com for global suppliers."""
    results = []
    try:
        from scrapling.fetchers import Fetcher
        url = f"https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&keywords={quote_plus(query)}&originQuery={quote_plus(query)}"
        log(f"Scraping Alibaba: {url}")
        page = Fetcher.get(url, timeout=20, stealthy_headers=True)

        # Alibaba product cards
        for item in (page.css('.J-offer-wrapper') or page.css('[class*="offer"]'))[:max_results]:
            try:
                name     = clean_text(item.css('h2::text, .title::text, [class*="subject"]::text').get() or '')
                price    = clean_text(item.css('.price::text, [class*="price"]::text').get() or '')
                supplier = clean_text(item.css('.company-name::text, [class*="company"]::text').get() or '')
                moq      = clean_text(item.css('.moq::text, [class*="moq"]::text').get() or '')
                country  = clean_text(item.css('[class*="country"]::text').get() or 'China')
                verified = bool(item.css('[class*="verified"], [class*="gold"]').get())
                link     = item.css('a::attr(href)').get()
                img      = item.css('img::attr(src), img::attr(data-src)').get()

                if name:
                    results.append({
                        'name':         name[:100],
                        'priceRange':   price,
                        'supplier':     supplier,
                        'country':      country,
                        'moq':          moq,
                        'verified':     verified,
                        'platform':     'Alibaba',
                        'url':          link,
                        'imageUrl':     img,
                        'currency':     'USD',
                        'supplierType': 'manufacturer',
                    })
            except:
                continue

    except Exception as e:
        log(f"Alibaba error: {e}")

    return results


def search_tradeindia(query, max_results=8):
    """Search TradeIndia for domestic suppliers."""
    results = []
    try:
        from scrapling.fetchers import Fetcher
        url = f"https://www.tradeindia.com/search/?category={quote_plus(query)}"
        log(f"Scraping TradeIndia: {url}")
        page = Fetcher.get(url, timeout=15, stealthy_headers=True)

        for item in page.css('.products-listing, .listing-single')[:max_results]:
            try:
                name     = clean_text(item.css('h3::text, .product-name::text').get() or '')
                price    = clean_text(item.css('.price::text').get() or '')
                supplier = clean_text(item.css('.seller-name::text, .company-name::text').get() or '')
                location = clean_text(item.css('.location::text').get() or '')
                link     = item.css('a::attr(href)').get()

                if name:
                    results.append({
                        'name':         name[:100],
                        'priceRange':   price,
                        'supplier':     supplier,
                        'location':     location,
                        'platform':     'TradeIndia',
                        'url':          urljoin('https://www.tradeindia.com', link) if link else None,
                        'currency':     'INR',
                        'supplierType': 'trader',
                    })
            except:
                continue

    except Exception as e:
        log(f"TradeIndia error: {e}")

    return results


# ─────────────────────────────────────────────────────────────
# TASK: analyze_url — Deep product page analysis
# ─────────────────────────────────────────────────────────────

def analyze_product_url(url):
    """Extract full product details from a product page URL."""
    result = {'url': url, 'platform': 'unknown'}
    try:
        from scrapling.fetchers import Fetcher
        log(f"Analyzing URL: {url}")
        page = Fetcher.get(url, timeout=20, stealthy_headers=True)

        # Generic extraction — works on most e-commerce sites
        result.update({
            'name':        clean_text(page.css('h1::text').get() or ''),
            'price':       clean_price(page.css('[class*="price"]::text, [itemprop="price"]::attr(content)').get()),
            'rating':      clean_text(page.css('[itemprop="ratingValue"]::attr(content), [class*="rating"]::text').get() or ''),
            'reviews':     clean_text(page.css('[itemprop="reviewCount"]::text, [class*="review-count"]::text').get() or ''),
            'description': clean_text(page.css('[itemprop="description"]::text, #productDescription::text, [class*="description"]::text').get() or '')[:500],
            'imageUrl':    page.css('[itemprop="image"]::attr(src), #landingImage::attr(src), [class*="product-image"] img::attr(src)').get(),
            'brand':       clean_text(page.css('[itemprop="brand"]::text, #bylineInfo::text').get() or ''),
            'availability':clean_text(page.css('[itemprop="availability"]::attr(content), #availability::text').get() or 'In Stock'),
        })

        # Platform-specific extraction
        if 'amazon.in' in url:
            result['platform']  = 'Amazon India'
            result['asin']      = url.split('/dp/')[-1].split('/')[0][:10] if '/dp/' in url else None
            result['bsr']       = clean_text(page.css('#SalesRank::text, [class*="bestseller"]::text').get() or '')
            result['seller']    = clean_text(page.css('#sellerProfileTriggerId::text').get() or '')

        elif 'flipkart.com' in url:
            result['platform']  = 'Flipkart'
            result['highlights'] = [clean_text(li) for li in page.css('._21Ahn-::text, ._2lambZ li::text').getall()[:5]]

        elif 'meesho.com' in url:
            result['platform'] = 'Meesho'

    except Exception as e:
        log(f"URL analysis error: {e}")
        result['error'] = str(e)

    return result


# ─────────────────────────────────────────────────────────────
# TASK: get_trending — Trending products in a category
# ─────────────────────────────────────────────────────────────

def get_trending_amazon(category, country='India'):
    """Get Amazon Best Sellers in a category."""
    results = []
    try:
        from scrapling.fetchers import Fetcher
        # Amazon Best Sellers
        cat_map = {
            'electronics': 'electronics', 'clothing': 'apparel',
            'fitness': 'sports', 'beauty': 'beauty', 'home': 'home',
            'kitchen': 'kitchen', 'toys': 'toys', 'books': 'books',
        }
        cat_slug = cat_map.get(category.lower(), '')
        url = f"https://www.amazon.in/gp/bestsellers/{cat_slug}" if cat_slug else "https://www.amazon.in/gp/bestsellers"
        log(f"Trending Amazon: {url}")
        page = Fetcher.get(url, timeout=15, stealthy_headers=True)

        for i, item in enumerate(page.css('[class*="zg-item"], .p13n-sc-uncoverable-faceout')[:20]):
            try:
                name  = clean_text(item.css('._cDEzb_p13n-sc-css-line-clamp-3_g3dy1::text, [class*="product-title"]::text, a span::text').get() or '')
                price = clean_price(item.css('._cDEzb_p13n-sc-price_3mJ9Z::text, .a-price-whole::text').get())
                link  = item.css('a::attr(href)').get()
                img   = item.css('img::attr(src)').get()

                if name:
                    results.append({
                        'rank':     i + 1,
                        'name':     name[:100],
                        'price':    price,
                        'platform': 'Amazon India',
                        'url':      urljoin('https://www.amazon.in', link) if link else None,
                        'imageUrl': img,
                        'currency': 'INR',
                    })
            except:
                continue

    except Exception as e:
        log(f"Trending error: {e}")

    return results


# ─────────────────────────────────────────────────────────────
# Main Dispatcher
# ─────────────────────────────────────────────────────────────

def dispatch(params):
    task        = params.get('task', 'search_products')
    query       = params.get('query', '')
    platform    = params.get('platform', 'all').lower()
    max_results = min(int(params.get('maxResults', 10)), 30)
    country     = params.get('country', 'India')
    url         = params.get('url', '')

    results   = []
    sources   = []

    if task == 'search_products':
        if platform in ('amazon', 'all'):
            r = search_amazon_india(query, max_results)
            results.extend(r); sources.append(f'Amazon({len(r)})')

        if platform in ('flipkart', 'all'):
            r = search_flipkart(query, max_results)
            results.extend(r); sources.append(f'Flipkart({len(r)})')

        if platform in ('meesho', 'all'):
            r = search_meesho(query, max_results)
            results.extend(r); sources.append(f'Meesho({len(r)})')

        if platform in ('google', 'all'):
            r = search_google_shopping(query, max_results)
            results.extend(r); sources.append(f'GoogleShopping({len(r)})')

    elif task == 'find_suppliers':
        if platform in ('indiamart', 'all', 'india'):
            r = search_indiamart(query, max_results)
            results.extend(r); sources.append(f'IndiaMART({len(r)})')

        if platform in ('alibaba', 'all', 'global', 'china'):
            r = search_alibaba(query, max_results)
            results.extend(r); sources.append(f'Alibaba({len(r)})')

        if platform in ('tradeindia', 'all', 'india'):
            r = search_tradeindia(query, max_results)
            results.extend(r); sources.append(f'TradeIndia({len(r)})')

    elif task == 'get_price_comparison':
        # Search all selling platforms for price data
        for fn, lbl in [(search_amazon_india,'Amazon'),(search_flipkart,'Flipkart'),(search_meesho,'Meesho'),(search_google_shopping,'Google')]:
            r = fn(query, 5)
            results.extend(r); sources.append(f'{lbl}({len(r)})')

    elif task == 'analyze_url':
        if url:
            r = analyze_product_url(url)
            results = [r]; sources = ['DirectScrape']

    elif task == 'get_trending':
        category = params.get('category', query)
        r = get_trending_amazon(category, country)
        results.extend(r); sources.append(f'AmazonBestSellers({len(r)})')

    elif task == 'check_competition':
        # Search Amazon + count sellers
        r = search_amazon_india(query, 20)
        results.extend(r); sources.append(f'Amazon({len(r)})')
        r2 = search_flipkart(query, 10)
        results.extend(r2); sources.append(f'Flipkart({len(r2)})')

    # Calculate confidence
    total   = len(results)
    confidence = min(1.0, total / 5) if total > 0 else 0.0

    return {
        'success':    True,
        'task':       task,
        'query':      query,
        'results':    results,
        'total':      total,
        'sources':    sources,
        'source':     'scrapling',
        'confidence': round(confidence, 2),
        'scrapedAt':  datetime.utcnow().isoformat() + 'Z',
    }


if __name__ == '__main__':
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            print(json.dumps({'success': False, 'error': 'No input provided', 'results': []}))
            sys.exit(1)

        params = json.loads(raw)
        log(f"Task: {params.get('task')} | Query: {params.get('query')} | Platform: {params.get('platform')}")

        output = dispatch(params)
        print(json.dumps(output, ensure_ascii=False, default=str))

    except json.JSONDecodeError as e:
        print(json.dumps({'success': False, 'error': f'JSON decode error: {e}', 'results': []}))
        sys.exit(1)
    except Exception as e:
        log(f"Fatal: {traceback.format_exc()}")
        print(json.dumps({'success': False, 'error': str(e), 'results': [], 'traceback': traceback.format_exc()}))
        sys.exit(1)
