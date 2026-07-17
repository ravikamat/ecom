/* ============================================================
   ECO Chatbot — v2.3
   Agentic AI chatbot UI that calls the server-side agent loop
   ============================================================ */

const Chatbot = {
  history:       [],
  isProcessing:  false,
  streamController: null,

  /* ── Initialize ─────────────────────────────────────────── */
  init() {
    this._bindEvents();
    this._renderWelcome();
  },

  _bindEvents() {
    const input   = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const clearBtn = document.getElementById('chat-clear-btn');

    if (!input || !sendBtn) return;

    sendBtn.addEventListener('click', () => this.send());
    clearBtn?.addEventListener('click', () => this.clear());

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });

    // Quick suggestion chips
    document.querySelectorAll('[data-chat-suggest]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (input) { input.value = btn.dataset.chatSuggest; this.send(); }
      });
    });
  },

  /* ── Render Welcome ─────────────────────────────────────── */
  _renderWelcome() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon">🤖</div>
        <div class="chat-welcome-title">ECO AI Research Agent</div>
        <div class="chat-welcome-sub">I search Amazon, Flipkart, IndiaMART, Alibaba & more in real-time to give you the most profitable answers.</div>
        <div class="chat-suggestions">
          ${[
            '🏆 Where should I sell resistance bands for max profit?',
            '🛒 Find me cheap suppliers for yoga mats under ₹100',
            '📊 What\'s trending on Amazon India right now?',
            '💰 How much profit can I make selling phone cases?',
            '🔍 Analyze my saved products and tell me which to focus on',
            '🏭 Compare IndiaMART vs Alibaba suppliers for LED bulbs',
          ].map(q => `<button class="chat-suggest-chip" data-chat-suggest="${q}">${q}</button>`).join('')}
        </div>
      </div>`;
  },

  /* ── Send Message ───────────────────────────────────────── */
  async send() {
    const input = document.getElementById('chat-input');
    const message = (input?.value || '').trim();
    if (!message || this.isProcessing) return;

    input.value = '';
    this.isProcessing = true;
    this._setInputDisabled(true);

    // Render user message
    this._appendMessage('user', message);

    // Create AI response bubble with live updates
    const aiId = 'ai-msg-' + Date.now();
    this._appendMessage('agent', '', aiId);

    // Fetch db context to send with message
    let dbContext = [];
    try {
      if (typeof getSaved === 'function') dbContext = await getSaved();
    } catch (e) {
      console.warn('[Chatbot] Failed to retrieve dbContext:', e.message);
    }

    try {
      const response = await fetch('/api/agent/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message,
          history:   this.history.slice(-10),
          dbContext: dbContext.slice(0, 20), // send last 20 products as context
        }),
        signal: AbortSignal.timeout(120000), // 2min timeout for complex research
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      // Server-Sent Events streaming
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        await this._handleSSEStream(response, aiId);
      } else {
        // JSON fallback
        const data = await response.json();
        this._updateAIMessage(aiId, data);
        if (data.answer) {
          this.history.push({ role: 'assistant', content: data.answer });
        }
      }

      // Save to history
      this.history.push({ role: 'user', content: message });

    } catch (err) {
      console.error('[Chatbot]', err);
      this._updateAIMessage(aiId, {
        answer:    `⚠️ ${err.message === 'Failed to fetch' ? 'Server not running. Start with: node server.js' : err.message}`,
        toolsUsed: [],
        events:    [],
      });
    }

    this.isProcessing = false;
    this._setInputDisabled(false);
    document.getElementById('chat-input')?.focus();
  },

  /* ── SSE Stream Handler ─────────────────────────────────── */
  async _handleSSEStream(response, aiId) {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const event = JSON.parse(dataStr);
          if (event.type === 'final') {
            finalData = event;
          } else {
            this._updateAIMessageProgress(aiId, event);
          }
        } catch (err) {
          console.warn('[Chatbot] Failed to parse SSE line:', err.message, dataStr);
        }
      }
    }

    if (finalData) {
      this._updateAIMessage(aiId, finalData);
      if (finalData.answer) {
        this.history.push({ role: 'assistant', content: finalData.answer });
      }
    }
  },

  /* ── UI Helpers ─────────────────────────────────────────── */
  _appendMessage(role, content, id) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // Remove welcome screen on first message
    const welcome = container.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const div       = document.createElement('div');
    div.className   = `chat-msg chat-msg-${role}`;
    if (id) div.id  = id;

    if (role === 'user') {
      div.innerHTML = `<div class="chat-bubble chat-bubble-user">${this._escHtml(content)}</div>`;
    } else {
      div.innerHTML = `
        <div class="chat-agent-avatar">🤖</div>
        <div class="chat-bubble chat-bubble-agent">
          <div class="chat-thinking">
            <span></span><span></span><span></span>
          </div>
        </div>`;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  _updateAIMessageProgress(aiId, event) {
    const bubble = document.querySelector(`#${aiId} .chat-bubble-agent`);
    if (!bubble) return;

    const existing = bubble.querySelector('.chat-events') || (() => {
      const el = document.createElement('div');
      el.className = 'chat-events';
      bubble.prepend(el);
      return el;
    })();

    const icon = {
      thinking:     '🧠',
      tool_call:    '🔍',
      tool_result:  '📦',
      self_correct: '🔄',
      loop_detected:'⚠️',
      correction:   '🛠',
      answer:       '✅',
    }[event.type] || '⚡';

    const line = document.createElement('div');
    line.className = 'chat-event-line';

    // Rich rendering for tool results
    if (event.type === 'tool_result' && event.data) {
      const richHtml = this._renderToolResult(event.tool, event.data);
      line.innerHTML = `<span class="chat-event-icon">${icon}</span><span>${this._escHtml(
        `Found ${event.total || '?'} results (confidence: ${Math.round((event.confidence || 0) * 100)}%)`
      )}</span>${richHtml}`;
    } else {
      line.innerHTML = `<span class="chat-event-icon">${icon}</span><span>${this._escHtml(
        event.message ||
        (event.type === 'tool_call' ? `Searching with ${event.tool} (${JSON.stringify(event.args || {}).slice(0, 60)}...)` : '') ||
        (event.type === 'tool_result' ? `Found ${event.total} results (confidence: ${Math.round((event.confidence || 0) * 100)}%)` : '')
      )}</span>`;
    }

    existing.appendChild(line);
    document.getElementById('chat-messages').scrollTop = 99999;
  },

  _renderToolResult(toolName, data) {
    if (!data) return '';
    try {
      // Products (search_products, get_trending_products)
      const products = data.products || data.items || data.results;
      if (Array.isArray(products) && products.length > 0 && products[0].name) {
        return products.slice(0, 5).map(p => `
          <div class="chat-product-card">
            ${p.image ? `<img src="${p.image}" alt="${this._escHtml(p.name)}" onerror="this.style.display='none'">` : ''}
            <div class="chat-product-info">
              <strong>${this._escHtml(p.name)}</strong>
              <span>${p.price || ''} ${p.rating ? '· ' + p.rating + '★' : ''} ${p.platform ? '· ' + p.platform : ''}</span>
              ${p.category ? `<span class="chat-product-tags">${this._escHtml(p.category)}</span>` : ''}
            </div>
          </div>
        `).join('');
      }

      // Price comparisons
      const comparisons = data.comparisons || data.prices || data.results;
      if (Array.isArray(comparisons) && comparisons.length > 0 && (comparisons[0].platform || comparisons[0].source)) {
        return `
          <table class="chat-price-table">
            <tr><th>Platform</th><th>Price</th><th>Stock</th></tr>
            ${comparisons.map(c => `
              <tr><td>${this._escHtml(c.platform || c.source || '—')}</td><td>${c.price || '—'}</td><td>${c.stock || c.inStock || '—'}</td></tr>
            `).join('')}
          </table>
        `;
      }
    } catch(e) { /* ignore formatting errors */ }
    return '';
  },

  _updateAIMessage(aiId, data) {
    const bubble = document.querySelector(`#${aiId} .chat-bubble-agent`);
    if (!bubble) return;

    const { answer = '', toolsUsed = [], events = [], sources = [] } = data;

    // Format the answer
    const formattedAnswer = this._formatAnswer(answer);

    // Build sources/tool pills
    const toolPills = (toolsUsed || []).map(t =>
      `<span class="chat-tool-pill">🔧 ${t}</span>`
    ).join('');

    // Build source links
    const sourceLinks = (sources || []).filter(s => s.url).slice(0, 5).map(s =>
      `<a href="${s.url}" target="_blank" rel="noopener" class="chat-source-link">🔗 ${this._escHtml(s.name || s.platform || 'Source')}</a>`
    ).join('');

    bubble.innerHTML = `
      ${events.length ? `<div class="chat-events-summary">
        <details>
          <summary>🔍 Research trail (${events.length} steps)</summary>
          ${events.map(e => `<div class="chat-event-line"><span class="chat-event-icon">${e.icon || '•'}</span>${this._escHtml(e.message || '')}</div>`).join('')}
        </details>
      </div>` : ''}
      <div class="chat-answer">${formattedAnswer}</div>
      ${toolPills ? `<div class="chat-tools-row">${toolPills}</div>` : ''}
      ${sourceLinks ? `<div class="chat-sources">${sourceLinks}</div>` : ''}
    `;

    document.getElementById('chat-messages').scrollTop = 99999;
  },

  _formatAnswer(text) {
    if (!text) return '<em>No response</em>';
    const escaped = this._escHtml(text);
    return escaped
      // Bold **text**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Code `text`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Headers ### text
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm,  '<h3>$1</h3>')
      // Lists - item
      .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
      // Newlines
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      // Wrap li tags
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      // Escape then wrap in paragraph
      .replace(/^(?!<)(.+)$/, '<p>$1</p>');
  },

  _escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _setInputDisabled(disabled) {
    const input   = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (input)   input.disabled   = disabled;
    if (sendBtn) sendBtn.disabled = disabled;
    if (sendBtn) sendBtn.textContent = disabled ? '⏳' : '➤';
  },

  clear() {
    this.history = [];
    this._renderWelcome();
    this._bindEvents(); // re-bind suggest chips
  },
};
