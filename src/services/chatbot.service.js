import { EventEmitter } from 'events';
import { callAI } from '../intelligence-layer/ai-gateway.js';

export class ChatbotService {
  static activeStreams = new Map();

  static async sendMessage({ message, sessionId, context = [] }) {
    const messages = [
      ...context.map(c => ({ role: c.role, content: c.content })),
      { role: 'user', content: message }
    ];
    
    try {
      const response = await callAI(messages, { temperature: 0.7, max_tokens: 1500 });
      return {
        response: response?.choices?.[0]?.message?.content || 'I could not process that request.',
      };
    } catch (err) {
      return {
        error: err.message,
      };
    }
  }

  static createStream(sessionId) {
    const emitter = new EventEmitter();
    this.activeStreams.set(sessionId, emitter);
    
    emitter.destroy = () => {
      this.activeStreams.delete(sessionId);
    };
    
    return emitter;
  }
}
