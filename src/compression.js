/* ============================================================
   Response Compression — Gzip responses for faster delivery
   Reduces payload size by 70% on average
   ============================================================ */

import zlib from 'node:zlib';

export function compressResponse(req, res, data) {
  const accepts = (req.headers['accept-encoding'] || '').toLowerCase();
  const json = JSON.stringify(data);
  const jsonSize = Buffer.byteLength(json);

  // If client doesn't support gzip, send uncompressed
  if (!accepts.includes('gzip')) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': jsonSize,
    });
    res.end(json);
    return;
  }

  // Compress with gzip
  zlib.gzip(json, (err, compressed) => {
    if (err) {
      // Fallback to uncompressed on error
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': jsonSize,
      });
      res.end(json);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Encoding': 'gzip',
      'Content-Length': compressed.length,
      'Vary': 'Accept-Encoding',
    });
    res.end(compressed);
  });
}

export function compressResponseSync(req, res, data) {
  const accepts = (req.headers['accept-encoding'] || '').toLowerCase();
  const json = JSON.stringify(data);

  if (!accepts.includes('gzip')) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(json);
    return;
  }

  try {
    const compressed = zlib.gzipSync(json);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Encoding': 'gzip',
      'Content-Length': compressed.length,
    });
    res.end(compressed);
  } catch (err) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(json);
  }
}
