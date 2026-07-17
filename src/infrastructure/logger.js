import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'eco-cortex',
    version: process.env.npm_package_version || '3.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['*.apiKey', '*.password', '*.token', 'headers.authorization'],
    remove: true,
  },
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

// Child loggers for components
export const apiLogger = logger.child({ component: 'api' });
export const aiLogger = logger.child({ component: 'ai-gateway' });
export const scraperLogger = logger.child({ component: 'scraper' });
export const dbLogger = logger.child({ component: 'database' });

export default logger;
