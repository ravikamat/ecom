/**
 * Hardened Research Worker — ECO Command Center
 * Reads from research_queue table. Circuit breaker: 5 failures → 5min cooldown.
 */
import { callAI }              from './ai-gateway.js';
import { runFullResearchCycle } from '../hero-research-orchestrator.js';

let isRunning           = false;
let consecutiveFailures = 0;
const MAX_FAILURES      = 5;

export function startResearchWorker(intervalMs = 180000) {
  console.log('[ResearchWorker] Starting with interval:', intervalMs, 'ms');

  const tick = async () => {
    if (isRunning) return;
    if (consecutiveFailures >= MAX_FAILURES) {
      console.warn(`[ResearchWorker] ${MAX_FAILURES} consecutive failures — cooling down`);
      return;
    }

    isRunning = true;
    try {
      const topic = await getNextResearchTopic();
      if (!topic) { isRunning = false; return; }

      await runFullResearchCycle(topic.query, topic.country);
      consecutiveFailures = 0;
    } catch (err) {
      console.error('[ResearchWorker] Tick failed:', err.message);
      consecutiveFailures++;
    } finally {
      isRunning = false;
    }
  };

  tick(); // immediate first run
  const interval = setInterval(tick, intervalMs);
  setInterval(() => { consecutiveFailures = 0; console.log('[ResearchWorker] Failure counter reset'); }, 3600000);

  return { stop: () => { clearInterval(interval); console.log('[ResearchWorker] Stopped'); } };
}

async function getNextResearchTopic() {
  try {
    const { getDB } = await import('../../db/sqlite.js');
    const db  = getDB();
    const row = db.prepare('SELECT * FROM research_queue WHERE status = ? ORDER BY priority DESC, created_at ASC LIMIT 1').get('pending');
    if (row) db.prepare('UPDATE research_queue SET status = ? WHERE id = ?').run('processing', row.id);
    return row || null;
  } catch (e) {
    console.warn('[ResearchWorker] Queue read failed:', e.message);
    return null;
  }
}
