#!/usr/bin/env python3
"""Persistent Python bridge server for ECO Command Center v3."""
import asyncio
import json
import sys
import os
from datetime import datetime
from aiohttp import web

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from scrapling_agent import ScraplingAgent
    from image_analyzer import ImageAnalyzer
    from run_spider import SpiderRunner
except ImportError as e:
    print(f"Warning: Could not import modules: {e}", file=sys.stderr)
    ScraplingAgent = None
    ImageAnalyzer = None
    SpiderRunner = None

class BridgeServer:
    def __init__(self):
        self.scrapling = ScraplingAgent() if ScraplingAgent else None
        self.analyzer = ImageAnalyzer() if ImageAnalyzer else None
        self.spider = SpiderRunner() if SpiderRunner else None
        self.request_count = 0
        self.start_time = datetime.now()

    async def handle_scrape(self, request):
        self.request_count += 1
        try:
            data = await request.json()
            platform = data.get('platform', 'amazon')
            query = data.get('query', '')

            if not self.scrapling:
                return web.json_response({
                    'success': False,
                    'error': 'Scrapling agent not available'
                }, status=503)

            result = await asyncio.to_thread(
                self.scrapling.scrape,
                platform=platform,
                query=query
            )

            return web.json_response({
                'success': True,
                'data': result,
                'meta': {'platform': platform, 'query': query}
            })

        except Exception as e:
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    async def handle_analyze_image(self, request):
        self.request_count += 1
        try:
            data = await request.json()
            image_path = data.get('path')
            detect_objects = data.get('detect_objects', True)

            if not self.analyzer:
                return web.json_response({
                    'success': False,
                    'error': 'Image analyzer not available'
                }, status=503)

            result = await asyncio.to_thread(
                self.analyzer.analyze,
                image_path=image_path,
                detect_objects=detect_objects
            )

            return web.json_response({
                'success': True,
                'data': result
            })

        except Exception as e:
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    async def handle_spider(self, request):
        self.request_count += 1
        try:
            data = await request.json()
            spider_name = data.get('spider', 'indiamart')
            query = data.get('query', '')

            if not self.spider:
                return web.json_response({
                    'success': False,
                    'error': 'Spider runner not available'
                }, status=503)

            result = await asyncio.to_thread(
                self.spider.run,
                spider_name=spider_name,
                query=query
            )

            return web.json_response({
                'success': True,
                'data': result
            })

        except Exception as e:
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    async def handle_health(self, request):
        uptime = (datetime.now() - self.start_time).total_seconds()
        return web.json_response({
            'status': 'healthy',
            'uptime': uptime,
            'requests': self.request_count,
            'components': {
                'scrapling': self.scrapling is not None,
                'analyzer': self.analyzer is not None,
                'spider': self.spider is not None,
            }
        })

app = web.Application()
bridge = BridgeServer()

app.router.add_post('/scrape', bridge.handle_scrape)
app.router.add_post('/analyze', bridge.handle_analyze_image)
app.router.add_post('/spider', bridge.handle_spider)
app.router.add_get('/health', bridge.handle_health)

if __name__ == '__main__':
    port = int(os.environ.get('PYTHON_BRIDGE_PORT', 5001))
    print(f"ECO Python Bridge starting on port {port}...")
    web.run_app(app, host='127.0.0.1', port=port)
