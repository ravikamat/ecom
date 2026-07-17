import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { logger } from './logger.js';

class EventStore {
  constructor(dbPath = './eco_events.db') {
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        stream_id TEXT NOT NULL,
        stream_type TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload JSON NOT NULL,
        metadata JSON,
        version INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_events_stream ON events(stream_id, version);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(stream_type, event_type, created_at);
    `);
  }

  append(streamId, eventType, payload, metadata = {}) {
    const versionResult = this.db.prepare(
      'SELECT COALESCE(MAX(version), 0) + 1 as v FROM events WHERE stream_id = ?'
    ).get(streamId);
    const version = versionResult.v;

    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO events (id, stream_id, stream_type, event_type, payload, metadata, version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      streamId,
      streamId.split(':')[0],
      eventType,
      JSON.stringify(payload),
      JSON.stringify(metadata),
      version
    );

    logger.debug({ streamId, eventType, version }, 'Event appended');
    return { id, version };
  }

  getStream(streamId) {
    return this.db.prepare(
      'SELECT * FROM events WHERE stream_id = ? ORDER BY version'
    ).all(streamId).map(e => ({
      ...e,
      payload: JSON.parse(e.payload),
      metadata: JSON.parse(e.metadata),
    }));
  }

  replay(streamId, projector) {
    const events = this.getStream(streamId);
    return events.reduce((state, event) => projector(state, event), {});
  }

  getEventsByType(eventType, limit = 100) {
    return this.db.prepare(
      'SELECT * FROM events WHERE event_type = ? ORDER BY created_at DESC LIMIT ?'
    ).all(eventType, limit).map(e => ({
      ...e,
      payload: JSON.parse(e.payload),
    }));
  }
}

export const eventStore = new EventStore();
export default eventStore;
