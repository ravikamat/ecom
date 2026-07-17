import { aiLogger } from '../../infrastructure/logger.js';
import { eventStore } from '../../infrastructure/event-store.js';

class BaseAgent {
  constructor(name, aiGateway, options = {}) {
    this.name = name;
    this.ai = aiGateway;
    this.tools = new Map();
    this.memory = [];
    this.maxMemory = options.maxMemory || 10;
  }

  registerTool(name, handler) {
    this.tools.set(name, { name, handler });
    aiLogger.info({ agent: this.name, tool: name }, 'Tool registered');
  }

  async remember(context) {
    this.memory.push({
      timestamp: new Date(),
      context,
    });
    if (this.memory.length > this.maxMemory) {
      this.memory.shift();
    }
  }

  async recall(query, limit = 3) {
    return this.memory.slice(-limit);
  }

  async execute(context, task) {
    await this.remember({ task, context });

    const relevantMemory = await this.recall(task);
    const toolDescriptions = Array.from(this.tools.values()).map(t => `${t.name}: ${t.description || 'No description'}`).join('\n');

    const plan = await this.ai.callWithRAG(`
You are ${this.name}, an AI agent in the ECO product intelligence system.

YOUR TASK: ${task}

RELEVANT MEMORY:
${relevantMemory.map(m => `- ${JSON.stringify(m.context)}`).join('\n')}

AVAILABLE TOOLS:
${toolDescriptions}

Plan your next action. Respond with JSON:
{
  "thought": "your reasoning",
  "action": "tool_name or respond",
  "params": {},
  "confidence": 0.0-1.0
}
`, context);

    if (plan.action && plan.action !== 'respond' && this.tools.has(plan.action)) {
      const tool = this.tools.get(plan.action);
      const result = await tool.handler(plan.params || {});

      await this.remember({ action: plan.action, result, confidence: plan.confidence });

      return {
        agent: this.name,
        action: plan.action,
        result,
        confidence: plan.confidence,
        reasoning: plan.thought,
      };
    }

    return {
      agent: this.name,
      response: plan.thought,
      confidence: plan.confidence,
    };
  }
}

export { BaseAgent };
