import { logger } from '../../../infrastructure/logger.js';

export function errorHandler(err, req, res, next) {
  const requestId = req.id || 'unknown';

  logger.error({
    err: err.message,
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
  }, 'Request failed');

  // Don't leak internal errors in production
  const isDev = process.env.NODE_ENV === 'development';

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(isDev && { stack: err.stack }),
    requestId,
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
}
