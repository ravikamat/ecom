#!/usr/bin/env python3
"""
ECO Scrapy Spiders Runner — v2.3
Runs Scrapy spiders programmatically and returns JSON results.
Called by Node.js via child_process.spawn.

Input (stdin JSON):
{
  "spider": "indiamart|alibaba|justdial|ebay_india",
  "query": "resistance band",
  "maxItems": 20
}
"""

import sys
import json
import traceback
from datetime import datetime
from io import StringIO


def log(msg):
    print(f"[Scrapy] {msg}", file=sys.stderr)


def run_spider_inline(spider_name, query, max_items=20):
    """Run a Scrapy spider inline (without subprocess) and collect items."""
    import scrapy
    from scrapy.crawler import CrawlerProcess
    from scrapy.utils.project import get_project_settings
    from urllib.parse import quote_plus

    items_collected = []

    settings = get_project_settings()
    settings.update({
        'ROBOTSTXT_OBEY':           False,
        'USER_AGENT':               'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'DOWNLOAD_DELAY':           1.0,
        'RANDOMIZE_DOWNLOAD_DELAY': True,
        'CONCURRENT_REQUESTS':      4,
        'AUTOTHROTTLE_ENABLED':     True,
        'HTTPCACHE_ENABLED':        False,
        'LOG_LEVEL':                'ERROR',
        'CLOSESPIDER_ITEMCOUNT':    max_items,
        'DOWNLOADER_MIDDLEWARES': {
            'scrapy.downloadermiddlewares.useragent.UserAgentMiddleware': None,
            'scrapy.downloadermiddlewares.retry.RetryMiddleware': 550,
        },
        'RETRY_TIMES': 2,
        'DOWNLOAD_TIMEOUT': 20,
    })

    # ── IndiaMART Spider ──────────────────────────────────────
    class IndiaMARTSpider(scrapy.Spider):
        name            = 'indiamart'
        custom_settings = {'CLOSESPIDER_ITEMCOUNT': max_items}

        def start_requests(self):
            url = f"https://www.indiamart.com/search.mp?ss={quote_plus(query)}"
            log(f"IndiaMART spider → {url}")
            yield scrapy.Request(url, callback=self.parse, headers={
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            })

        def parse(self, response):
            cards = response.css('.moredetail, .cls-p-lst-l-d, [class*="product-d"]')
            log(f"IndiaMART: found {len(cards)} cards")

            for card in cards:
                name     = ' '.join(card.css('h3::text, .prod-title::text').getall()).strip()
                price    = ' '.join(card.css('.price::text, .prc::text').getall()).strip()
                supplier = ' '.join(card.css('.lcname::text, .company-name::text').getall()).strip()
                location = ' '.join(card.css('.loc::text, .city::text').getall()).strip()
                moq      = ' '.join(card.css('[class*="moq"]::text, .moq::text').getall()).strip()
                phone    = ' '.join(card.css('[class*="mobile"]::text, .mobile::text').getall()).strip()
                link     = card.css('a::attr(href)').get()
                rating   = ' '.join(card.css('[class*="star"]::text, .rating::text').getall()).strip()

                if name:
                    item = {
                        'name':         name[:120],
                        'priceRange':   price or 'Price on request',
                        'supplier':     supplier,
                        'location':     location,
                        'moq':          moq,
                        'phone':        phone,
                        'rating':       rating,
                        'platform':     'IndiaMART',
                        'url':          response.urljoin(link) if link else None,
                        'currency':     'INR',
                        'supplierType': 'manufacturer_or_trader',
                        'country':      'India',
                    }
                    items_collected.append(item)
                    yield item

    # ── Alibaba Spider ────────────────────────────────────────
    class AlibabaSpider(scrapy.Spider):
        name            = 'alibaba'
        custom_settings = {'CLOSESPIDER_ITEMCOUNT': max_items}

        def start_requests(self):
            url = f"https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&keywords={quote_plus(query)}"
            log(f"Alibaba spider → {url}")
            yield scrapy.Request(url, callback=self.parse, headers={
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            })

        def parse(self, response):
            cards = response.css('.J-offer-wrapper, [class*="offer-list"] [class*="item"]')
            log(f"Alibaba: found {len(cards)} cards")

            for card in cards:
                name     = ' '.join(card.css('h2::text, [class*="subject"]::text').getall()).strip()
                price    = ' '.join(card.css('[class*="price"]::text').getall()).strip()
                supplier = ' '.join(card.css('[class*="company"]::text, .company-name::text').getall()).strip()
                moq      = ' '.join(card.css('[class*="moq"]::text').getall()).strip()
                country  = ' '.join(card.css('[class*="country"]::text').getall()).strip() or 'China'
                verified = bool(card.css('[class*="verified"], [class*="gold-supplier"]').get())
                link     = card.css('a::attr(href)').get()
                img      = card.css('img::attr(src), img::attr(data-src)').get()

                if name:
                    item = {
                        'name':         name[:120],
                        'priceRange':   price or 'Contact for price',
                        'supplier':     supplier,
                        'country':      country,
                        'moq':          moq,
                        'verified':     verified,
                        'platform':     'Alibaba',
                        'url':          response.urljoin(link) if link else None,
                        'imageUrl':     img,
                        'currency':     'USD',
                        'supplierType': 'manufacturer',
                    }
                    items_collected.append(item)
                    yield item

    # ── JustDial Spider ───────────────────────────────────────
    class JustDialSpider(scrapy.Spider):
        name            = 'justdial'
        custom_settings = {'CLOSESPIDER_ITEMCOUNT': max_items}

        def start_requests(self):
            url = f"https://www.justdial.com/search?q={quote_plus(query)}&where=India"
            log(f"JustDial spider → {url}")
            yield scrapy.Request(url, callback=self.parse, headers={
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            })

        def parse(self, response):
            cards = response.css('.cntanr, .store-details, [class*="resultbox"]')
            log(f"JustDial: found {len(cards)} cards")

            for card in cards:
                name     = ' '.join(card.css('span.lng_mxw_cls::text, h2::text, .jcn::text').getall()).strip()
                category = ' '.join(card.css('.cat_nm::text, [class*="category"]::text').getall()).strip()
                location = ' '.join(card.css('.cont_fl_addr::text, .address::text').getall()).strip()
                phone    = ' '.join(card.css('[class*="tel"]::text, .telCover::text').getall()).strip()
                rating   = ' '.join(card.css('.green-box::text, [class*="rating"]::text').getall()).strip()

                if name:
                    item = {
                        'name':         name[:120],
                        'category':     category,
                        'location':     location,
                        'phone':        phone,
                        'rating':       rating,
                        'platform':     'JustDial',
                        'supplierType': 'local_business',
                        'country':      'India',
                        'currency':     'INR',
                    }
                    items_collected.append(item)
                    yield item

    # ── eBay India Spider ─────────────────────────────────────
    class EbayIndiaSpider(scrapy.Spider):
        name            = 'ebay_india'
        custom_settings = {'CLOSESPIDER_ITEMCOUNT': max_items}

        def start_requests(self):
            url = f"https://www.ebay.in/sch/i.html?_nkw={quote_plus(query)}&_sacat=0"
            log(f"eBay India spider → {url}")
            yield scrapy.Request(url, callback=self.parse)

        def parse(self, response):
            cards = response.css('.s-item')
            log(f"eBay India: found {len(cards)} cards")

            for card in cards:
                name   = ' '.join(card.css('.s-item__title::text').getall()).strip()
                price  = ' '.join(card.css('.s-item__price::text').getall()).strip()
                seller = ' '.join(card.css('.s-item__seller-info-text::text').getall()).strip()
                link   = card.css('.s-item__link::attr(href)').get()
                img    = card.css('.s-item__image-img::attr(src)').get()
                cond   = ' '.join(card.css('.SECONDARY_INFO::text').getall()).strip()

                if name and name != 'Shop on eBay':
                    item = {
                        'name':         name[:120],
                        'price':        price,
                        'seller':       seller,
                        'condition':    cond,
                        'platform':     'eBay India',
                        'url':          link,
                        'imageUrl':     img,
                        'currency':     'INR',
                    }
                    items_collected.append(item)
                    yield item

    # ── Spider registry ───────────────────────────────────────
    spider_map = {
        'indiamart':  IndiaMARTSpider,
        'alibaba':    AlibabaSpider,
        'justdial':   JustDialSpider,
        'ebay_india': EbayIndiaSpider,
    }

    spider_cls = spider_map.get(spider_name)
    if not spider_cls:
        return [], f"Unknown spider: {spider_name}"

    # Run the spider
    process = CrawlerProcess(settings)
    process.crawl(spider_cls)
    process.start()

    return items_collected[:max_items], None


if __name__ == '__main__':
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            print(json.dumps({'success': False, 'error': 'No input', 'results': []}))
            sys.exit(1)

        params    = json.loads(raw)
        spider    = params.get('spider', 'indiamart')
        query     = params.get('query', '')
        max_items = min(int(params.get('maxItems', 20)), 50)

        log(f"Running spider: {spider} | Query: {query} | Max: {max_items}")

        results, error = run_spider_inline(spider, query, max_items)

        if error:
            print(json.dumps({'success': False, 'error': error, 'results': []}))
        else:
            confidence = min(1.0, len(results) / 5)
            print(json.dumps({
                'success':    True,
                'spider':     spider,
                'query':      query,
                'results':    results,
                'total':      len(results),
                'source':     f'scrapy:{spider}',
                'confidence': round(confidence, 2),
                'scrapedAt':  datetime.utcnow().isoformat() + 'Z',
            }, ensure_ascii=False, default=str))

    except Exception as e:
        log(f"Fatal: {traceback.format_exc()}")
        print(json.dumps({'success': False, 'error': str(e), 'results': []}))
        sys.exit(1)
