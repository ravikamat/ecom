import { EventEmitter } from 'events';
import { DiscoveryStreamEngine } from '../discovery-stream-engine.js';
import { getDB } from '../../db/sqlite.js';
import { CONFIG } from '../config.js';

let discoveryEngine = null;
async function getDiscoveryEngine() {
  if (!discoveryEngine) {
    const db = await getDB();
    discoveryEngine = new DiscoveryStreamEngine({
      db,
      primaryApiKey: CONFIG.apiKey,
      fallbackApiKey: CONFIG.fallbackApiKey,
    });
  }
  return discoveryEngine;
}

export class DiscoveryService {
  static startStream(query) {
    const { sessionId, country = 'India', city = '', currency = 'INR' } = query;
    const location = { country, city, currency };
    const emitter = new EventEmitter();

    getDiscoveryEngine().then(engine => {
      engine.startStream(sessionId, location, (data) => {
        emitter.emit('data', data);
      }).catch(err => {
        emitter.emit('error', err);
      });
    }).catch(err => {
      emitter.emit('error', err);
    });

    emitter.stop = () => {
      getDiscoveryEngine().then(engine => {
        engine.stopStream(sessionId);
      });
    };

    return emitter;
  }

  static async setCategories(categories) {
    // Return true since category override is not natively implemented in original engine
    return true;
  }
}
