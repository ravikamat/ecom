import { Router } from 'express';
import { ChatbotService } from '../../../services/chatbot.service.js';

const router = Router();

// POST /api/v1/chatbot/message - Send message to AI agent
router.post('/message', async (req, res, next) => {
  try {
    const { message, sessionId, context } = req.body;
    const response = await ChatbotService.sendMessage({ message, sessionId, context });
    res.json({ success: true, data: response });
  } catch (err) { next(err); }
});

// GET /api/v1/chatbot/stream - SSE chat stream
router.get('/stream', async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = ChatbotService.createStream(req.query.sessionId);
    stream.on('data', (chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`));
    req.on('close', () => stream.destroy());
  } catch (err) { next(err); }
});

export default router;
