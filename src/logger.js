/* ============================================================
   Structured Logger — Centralized error tracking
   Stores logs in memory + console output for debugging
   ============================================================ */

class Logger {
  constructor(maxEntries = 1000) {
    this.entries = [];
    this.maxEntries = maxEntries;
    this.stats = {
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      by_component: {},
    };
  }

  log(level, component, message, data = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      data,
      uptime: process.uptime(),
    };

    this.entries.push(entry);
    this.stats.total++;
    this.stats[level.toLowerCase()] = (this.stats[level.toLowerCase()] || 0) + 1;
    
    if (!this.stats.by_component[component]) {
      this.stats.by_component[component] = { errors: 0, warnings: 0, info: 0 };
    }
    this.stats.by_component[component][level.toLowerCase()] = 
      (this.stats.by_component[component][level.toLowerCase()] || 0) + 1;

    // Keep only recent entries
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Console output with color coding
    this.outputConsole(level, component, message, data);

    return entry;
  }

  outputConsole(level, component, message, data) {
    const colors = {
      'ERROR': '\x1b[31m',   // Red
      'WARN': '\x1b[33m',    // Yellow
      'INFO': '\x1b[32m',    // Green
      'DEBUG': '\x1b[36m',   // Cyan
    };
    const reset = '\x1b[0m';
    const color = colors[level] || '';
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    
    let output = `${color}[${timestamp}] [${level.padEnd(5)}] [${component}] ${message}${reset}`;
    
    if (data) {
      if (typeof data === 'object' && data.stack) {
        output += `\n${data.stack}`;
      } else if (typeof data === 'object') {
        output += `\n  ${JSON.stringify(data)}`;
      } else {
        output += `\n  ${data}`;
      }
    }
    
    if (level === 'ERROR') {
      console.error(output);
    } else if (level === 'WARN') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(component, message, data) {
    return this.log('DEBUG', component, message, data);
  }

  info(component, message, data) {
    return this.log('INFO', component, message, data);
  }

  warn(component, message, data) {
    return this.log('WARN', component, message, data);
  }

  error(component, message, error) {
    const errorData = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      code: error.code || error.errno,
    } : error;
    
    return this.log('ERROR', component, message, errorData);
  }

  getLogs(options = {}) {
    const { level = null, component = null, limit = 100 } = options;
    let filtered = this.entries;

    if (level) {
      filtered = filtered.filter(e => e.level === level.toUpperCase());
    }
    if (component) {
      filtered = filtered.filter(e => e.component === component);
    }

    return filtered.slice(-limit);
  }

  getStats() {
    const errorRate = this.stats.total > 0
      ? ((this.stats.errors / this.stats.total) * 100).toFixed(2)
      : '0.00';
    
    return {
      total: this.stats.total,
      errors: this.stats.errors,
      warnings: this.stats.warnings,
      info: this.stats.info,
      errorRate: errorRate + '%',
      by_component: this.stats.by_component,
      recentErrors: this.getLogs({ level: 'ERROR', limit: 10 }),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  clear() {
    this.entries = [];
    this.stats = {
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      by_component: {},
    };
  }

  exportJSON() {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      stats: this.getStats(),
      entries: this.entries,
    }, null, 2);
  }
}

export const logger = new Logger();
