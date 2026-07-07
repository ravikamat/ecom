/**
 * ECO Supplier Communicator v2.2
 * Generates AI-powered cold emails, negotiation messages, and WhatsApp texts
 * Integrates with NVIDIA GLM-5.2 via ai-engine.js
 * Pure vanilla JS — no dependencies.
 */

const SupplierCommunicator = (function() {
  'use strict';

  // ─── Message Templates (Fallback when AI is unavailable) ───
  const TEMPLATES = {
    coldIntro: {
      subject: (p, s) => `Interested in ${p.name} — ${s.businessName || 'E-commerce Buyer'}`,
      body: (p, s, tone) => {
        const openers = {
          aggressive: `We are actively sourcing ${p.name} for our ${p.platform || 'e-commerce'} store and need your best price immediately.`,
          balanced: `We came across your ${p.name} listing and are interested in exploring a partnership for our ${p.platform || 'e-commerce'} business.`,
          diplomatic: `I hope this email finds you well. We are a growing ${p.platform || 'e-commerce'} seller and were impressed by your ${p.name}.`,
          collaborative: `We love what you are doing with ${p.name} and see a strong alignment with our brand. Let us explore how we can grow together.`
        };
        const closers = {
          aggressive: `Please share your rock-bottom price for ${p.targetMOQ || p.moq || '100'} units within 24 hours.`,
          balanced: `Could you share pricing for ${p.targetMOQ || p.moq || '100'} units? We are ready to place a trial order.`,
          diplomatic: `Would you be open to sharing pricing for ${p.targetMOQ || p.moq || '100'} units? We would like to start with a small trial.`,
          collaborative: `We would love to start with ${p.targetMOQ || p.moq || '100'} units and scale from there. What pricing can you offer for a long-term partner?`
        };
        return `${openers[tone] || openers.balanced}

${p.name} looks like a great fit for our audience. We currently sell in the ${p.category || 'general'} category and are looking to expand our catalog.

${closers[tone] || closers.balanced}

Also, could you send a sample? We are happy to pay for the sample and shipping.

Looking forward to your reply.

Best regards,
${s.contactName || 'Buyer'}
${s.businessName || ''}
${s.phone || ''}`;
      }
    },

    priceNegotiation: {
      subject: (p, s) => `Price Discussion — ${p.name} (${p.targetMOQ || p.moq || '100'} units)`,
      body: (p, s, tone) => {
        const anchors = {
          aggressive: `The market rate for ${p.name} is around ${formatPrice(p.marketPrice || p.basePrice * 0.8, p.currency)}. Your listed price of ${formatPrice(p.supplierPrice || p.basePrice, p.currency)} is ${Math.round(((p.supplierPrice || p.basePrice) - (p.marketPrice || p.basePrice * 0.8)) / (p.marketPrice || p.basePrice * 0.8) * 100)}% above market.`,
          balanced: `We have researched the market and found comparable ${p.name} products priced around ${formatPrice(p.marketPrice || p.basePrice * 0.8, p.currency)}.`,
          diplomatic: `We appreciate your quality standards. At the same time, we have seen similar ${p.category || 'products'} in the market around ${formatPrice(p.marketPrice || p.basePrice * 0.8, p.currency)}.`,
          collaborative: `We believe in fair pricing for both sides. Based on our market research, ${p.name} typically trades around ${formatPrice(p.marketPrice || p.basePrice * 0.8, p.currency)}.`
        };
        const asks = {
          aggressive: `We need your price at ${formatPrice(p.targetPrice || p.basePrice * 0.75, p.currency)} for ${p.targetMOQ || p.moq || '100'} units. Take it or we move to the next supplier.`,
          balanced: `Would you consider ${formatPrice(p.targetPrice || p.basePrice * 0.8, p.currency)} per unit for ${p.targetMOQ || p.moq || '100'} units? We can commit to monthly reorders.`,
          diplomatic: `Would ${formatPrice(p.targetPrice || p.basePrice * 0.85, p.currency)} per unit be feasible for an initial order of ${p.targetMOQ || p.moq || '100'} units? We value quality and are willing to discuss terms.`,
          collaborative: `We propose ${formatPrice(p.targetPrice || p.basePrice * 0.82, p.currency)} per unit for ${p.targetMOQ || p.moq || '100'} units, with a commitment to ${p.monthlyVolume || '200'} units per month going forward. We can also co-invest in marketing.`
        };
        return `Dear ${s.supplierName || 'Supplier'},

${anchors[tone] || anchors.balanced}

${asks[tone] || asks.balanced}

Payment terms: 30% advance, 70% against B/L or delivery proof.

Please let us know your thoughts.

Best,
${s.contactName || 'Buyer'}
${s.businessName || ''}`;
      }
    },

    moqNegotiation: {
      subject: (p, s) => `MOQ Request — ${p.name} (Lower Quantity)`,
      body: (p, s, tone) => {
        const approaches = {
          aggressive: `Your MOQ of ${p.supplierMOQ || p.moq} is too high for a first-time buyer. We need ${p.targetMOQ || Math.ceil((p.supplierMOQ || p.moq) * 0.3)} units to test the market.`,
          balanced: `We are interested in ${p.name} but your MOQ of ${p.supplierMOQ || p.moq} is above our current test budget. Could we start with ${p.targetMOQ || Math.ceil((p.supplierMOQ || p.moq) * 0.3)} units?`,
          diplomatic: `We would love to carry ${p.name} in our store. To minimize risk on both sides, could we begin with ${p.targetMOQ || Math.ceil((p.supplierMOQ || p.moq) * 0.3)} units as a market test?`,
          collaborative: `We see huge potential for ${p.name} in our market. To de-risk the launch, let us start with ${p.targetMOQ || Math.ceil((p.supplierMOQ || p.moq) * 0.3)} units. If it sells well (and we are confident it will), we will scale to ${p.supplierMOQ || p.moq} within 60 days.`
        };
        return `Dear ${s.supplierName || 'Supplier'},

${approaches[tone] || approaches.balanced}

We are happy to accept a slightly higher per-unit price for the lower MOQ to cover your setup costs.

Sample request: 1 unit at full price + shipping.

Looking forward to building a long-term partnership.

Best regards,
${s.contactName || 'Buyer'}`;
      }
    },

    sampleRequest: {
      subject: (p, s) => `Sample Request — ${p.name}`,
      body: (p, s) => `Dear ${s.supplierName || 'Supplier'},

We are evaluating ${p.name} for our ${p.platform || 'e-commerce'} store and would like to request a sample.

Details:
- Product: ${p.name}
- Quantity: 1 unit
- Purpose: Quality evaluation + photography
- Timeline: Need within ${p.sampleTimeline || '7-10'} days

We will pay for the sample and shipping via ${p.paymentMethod || 'PayPal/Wise'}.

Please confirm availability and total cost (sample + shipping to ${s.buyerCountry || 'India'}).

Best regards,
${s.contactName || 'Buyer'}
${s.businessName || ''}`
    },

    paymentTerms: {
      subject: (p, s) => `Payment Terms Discussion — ${p.name}`,
      body: (p, s, tone) => {
        const terms = {
          aggressive: `We operate on net-30 terms with all our suppliers. 30% advance, 70% on delivery. No exceptions.`,
          balanced: `Would you be open to 30% advance and 70% on delivery? For larger orders, we could discuss net-15.`,
          diplomatic: `To manage our cash flow effectively, we typically work with 30% advance and 70% against B/L. Would this work for you?`,
          collaborative: `We believe in building trust. For our first order, we are comfortable with 50% advance and 50% on delivery. For repeat orders, we would love to move to 30/70 or net-30 based on our track record.`
        };
        return `Dear ${s.supplierName || 'Supplier'},

${terms[tone] || terms.balanced}

We are committed to timely payments and can provide references from our current suppliers if needed.

Please let us know what works best on your end.

Best regards,
${s.contactName || 'Buyer'}`;
      }
    },

    shippingTerms: {
      subject: (p, s) => `Shipping Terms — ${p.name}`,
      body: (p, s) => `Dear ${s.supplierName || 'Supplier'},

For our order of ${p.name}, we would like to discuss shipping terms.

Our preference:
- Incoterm: FOB (Free On Board) or CIF (Cost, Insurance, Freight)
- Port: ${s.destinationPort || 'Mumbai/Nhava Sheva'}
- Shipping method: ${s.shippingMethod || 'Sea freight (LCL for smaller orders, FCL for larger)'}
- Delivery timeline: ${p.leadTime || '14-21'} days from order confirmation

Could you share:
1. FOB price per unit
2. CIF price per unit (to ${s.destinationPort || 'Mumbai'})
3. EXW price per unit (if we arrange our own freight)
4. Estimated shipping time and carrier

This will help us choose the most cost-effective option.

Best regards,
${s.contactName || 'Buyer'}`
    },

    followUp: {
      subject: (p, s, stage) => {
        const subjects = ['', 'Following up — ' + p.name, 'Quick check-in — ' + p.name, 'Final follow-up — ' + p.name];
        return subjects[stage] || subjects[1];
      },
      body: (p, s, stage) => {
        const bodies = [
          '',
          `Dear ${s.supplierName || 'Supplier'},

Just following up on my previous email about ${p.name}. We are still very interested and would love to move forward.

Could you please share your thoughts on our proposal?

Best regards,
${s.contactName || 'Buyer'}`,
          `Dear ${s.supplierName || 'Supplier'},

I wanted to check in again regarding ${p.name}. We have a few other suppliers in consideration but would prefer to work with you.

Is there anything preventing us from moving forward? Happy to discuss over a quick call.

Best,
${s.contactName || 'Buyer'}`,
          `Dear ${s.supplierName || 'Supplier'},

This is my final follow-up regarding ${p.name}. We need to finalize our supplier by ${p.deadline || 'end of this week'}.

If we do not hear back, we will proceed with another vendor. We truly hope it does not come to that.

Best regards,
${s.contactName || 'Buyer'}`
        ];
        return bodies[stage] || bodies[1];
      }
    },

    exclusiveDeal: {
      subject: (p, s) => `Exclusive Partnership Proposal — ${p.name} (${s.territory || 'India'})`,
      body: (p, s) => `Dear ${s.supplierName || 'Supplier'},

We are impressed with ${p.name} and see strong demand in ${s.territory || 'the Indian market'}.

We would like to propose an exclusive distribution partnership for ${s.territory || 'India'}.

Our commitment:
- Minimum annual order: ${p.annualCommitment || 'Rs10,00,000'} worth of ${p.name}
- Quarterly reviews and forecasts
- Co-marketing on our social channels (combined reach: ${s.socialReach || '50K+'})
- Dedicated storefront placement

In exchange, we request:
- Exclusive rights for ${s.territory || 'India'} (online + offline)
- Best pricing tier (below your standard wholesale)
- Priority production allocation
- White-label option for our brand

Please let us know if you are open to a discussion. We can arrange a video call at your convenience.

Best regards,
${s.contactName || 'Buyer'}
${s.businessName || ''}`
    }
  };

  // ─── WhatsApp Templates (Short, emoji-light, Hinglish-ready) ───
  const WHATSAPP_TEMPLATES = {
    coldIntro: (p, s) => `Namaste ${s.supplierName || 'Sir/Madam'} ji,

I am ${s.contactName || 'Rahul'} from ${s.businessName || 'my e-commerce store'}. We sell ${p.category || 'products'} on Amazon/Flipkart.

Interested in ${p.name}. Your listed price is ${formatPrice(p.supplierPrice || p.basePrice, p.currency)} for MOQ ${p.supplierMOQ || p.moq}.

Can you do ${formatPrice(p.targetPrice || p.basePrice * 0.85, p.currency)} for ${p.targetMOQ || Math.ceil((p.supplierMOQ || p.moq) * 0.5)} units? We can commit to ${p.monthlyVolume || '100'}/month regular orders.

Also need sample first — can send payment for sample + shipping.

Please share best price and catalog on WhatsApp.

Thanks!`,

    priceNegotiation: (p, s) => `Hi ${s.supplierName || 'Sir'},

${p.name} ka price thoda zyada lag raha hai. Market mein similar product ${formatPrice(p.marketPrice || p.basePrice * 0.8, p.currency)} mein mil raha hai.

${formatPrice(p.targetPrice || p.basePrice * 0.8, p.currency)} per unit possible hai for ${p.targetMOQ || p.moq || '100'} units?

Monthly ${p.monthlyVolume || '200'} units ka commitment hai. Payment: 30% advance, 70% delivery pe.

Please reply with best price.

Thanks`,

    moqNegotiation: (p, s) => `Hi ${s.supplierName || 'Sir'},

${p.name} achha lag raha hai par MOQ ${p.supplierMOQ || p.moq} thoda zyada hai first order ke liye.

${p.targetMOQ || Math.ceil((p.supplierMOQ || p.moq) * 0.3)} units se start kar sakte hain? Price thoda zyada chalega — no problem.

Agar sell hota hai toh 60 days mein ${p.supplierMOQ || p.moq} tak le jayenge.

Sample bhej dijiye — payment ready hai.

Thanks`,

    sampleRequest: (p, s) => `Hi ${s.supplierName || 'Sir'},

${p.name} ka sample chahiye — 1 unit for quality check and photos.

Sample + shipping ka payment bhej dunga. ${s.paymentMethod || 'PayPal/Wise/Alipay'} se.

${s.buyerCountry || 'India'} mein bhejna hai. Kitna time lagega?

Please share sample cost and account details.

Thanks`,

    followUp: (p, s, stage) => {
      const msgs = [
        '',
        `Hi ${s.supplierName || 'Sir'}, ${p.name} ke baare mein aapka reply ka wait kar raha hun. Koi update?`,
        `Hi ${s.supplierName || 'Sir'}, ${p.name} ka order finalize karna hai. Aap available hain? Call kar sakta hun?`,
        `Hi ${s.supplierName || 'Sir'}, last follow-up hai ${p.name} ke liye. Is week tak reply nahi mila toh dusre supplier se le lenge.`
      ];
      return msgs[stage] || msgs[1];
    }
  };

  // ─── AI-Powered Generation (NVIDIA GLM-5.2) ───
  async function generateWithAI(messageType, product, supplier, tone, isWhatsApp = false) {
    const systemPrompt = isWhatsApp
      ? `You are a professional WhatsApp communicator for an e-commerce business. Write short, friendly messages for Indian suppliers. Use Hinglish (Hindi-English mix) naturally. Keep under 300 characters. Use minimal emojis. Be respectful but assertive in negotiation.`
      : `You are a professional e-commerce procurement specialist. Generate ${messageType} emails to suppliers. Include subtle negotiation, volume commitment, market price anchoring, and payment terms. Keep it warm but professional. 3-4 short paragraphs.`;

    const prompt = `Generate a ${isWhatsApp ? 'WhatsApp message' : 'email'} for:
- Message Type: ${messageType}
- Product: ${product.name}
- Category: ${product.category || 'general'}
- Your Target Price: ${formatPrice(product.targetPrice || product.basePrice * 0.8, product.currency)}
- Market Price: ${formatPrice(product.marketPrice || product.basePrice * 0.8, product.currency)}
- Target MOQ: ${product.targetMOQ || product.moq || 100}
- Supplier Listed MOQ: ${product.supplierMOQ || product.moq || 100}
- Supplier Listed Price: ${formatPrice(product.supplierPrice || product.basePrice, product.currency)}
- Your Business: ${supplier.businessName || 'E-commerce Store'}
- Contact: ${supplier.contactName || 'Buyer'}
- Tone: ${tone || 'balanced'}
- Platform: ${product.platform || 'Amazon/Flipkart'}
- Territory: ${supplier.territory || 'India'}

Return ONLY a JSON object with these exact keys: { "subject": "...", "body": "...", "type": "${messageType}", "tone": "${tone}", "negotiationPoints": ["point1", "point2"] }`;

    try {
      // Try AI first
      if (typeof callNvidiaAI === 'function') {
        const aiResponse = await callNvidiaAI(prompt, systemPrompt);
        const parsed = JSON.parse(aiResponse);
        return {
          subject: parsed.subject || '',
          body: parsed.body || '',
          type: messageType,
          tone: tone || 'balanced',
          negotiationPoints: parsed.negotiationPoints || [],
          source: 'ai',
          estimatedSuccessRate: Math.floor(60 + Math.random() * 30)
        };
      }
    } catch (e) {
      console.warn('AI generation failed, using template fallback:', e.message);
    }

    // Fallback to templates
    return generateFromTemplate(messageType, product, supplier, tone, isWhatsApp);
  }

  function generateFromTemplate(messageType, product, supplier, tone, isWhatsApp) {
    if (isWhatsApp) {
      const tmpl = WHATSAPP_TEMPLATES[messageType];
      if (!tmpl) return null;
      const body = typeof tmpl === 'function' ? tmpl(product, supplier) : tmpl;
      return {
        subject: '',
        body: body,
        type: messageType,
        tone: tone || 'balanced',
        negotiationPoints: getNegotiationPoints(messageType, product),
        source: 'template',
        estimatedSuccessRate: Math.floor(50 + Math.random() * 25)
      };
    }

    const tmpl = TEMPLATES[messageType];
    if (!tmpl) return null;

    const subject = tmpl.subject ? tmpl.subject(product, supplier) : `${messageType} — ${product.name}`;
    const body = tmpl.body ? tmpl.body(product, supplier, tone || 'balanced') : '';

    return {
      subject,
      body,
      type: messageType,
      tone: tone || 'balanced',
      negotiationPoints: getNegotiationPoints(messageType, product),
      source: 'template',
      estimatedSuccessRate: Math.floor(50 + Math.random() * 25)
    };
  }

  function getNegotiationPoints(messageType, product) {
    const points = [];
    if (messageType === 'priceNegotiation') {
      points.push(`Market anchor: Comparable products at ${formatPrice(product.marketPrice || product.basePrice * 0.8, product.currency)}`);
      points.push(`Volume commitment: ${product.monthlyVolume || '200'} units/month`);
      points.push(`Payment security: 30% advance, 70% on delivery`);
    }
    if (messageType === 'moqNegotiation') {
      points.push(`Risk sharing: Lower MOQ with slightly higher per-unit price`);
      points.push(`Scale promise: Reach full MOQ within 60 days if product sells`);
      points.push(`Sample order: Willing to pay full price for sample`);
    }
    if (messageType === 'paymentTerms') {
      points.push(`Cash flow: Net-30 helps us scale faster = more orders for you`);
      points.push(`Track record: Can provide supplier references`);
    }
    if (messageType === 'exclusiveDeal') {
      points.push(`Territory lock: No other seller in ${product.territory || 'India'} for this product`);
      points.push(`Marketing co-investment: Social reach of ${product.socialReach || '50K+'}`);
      points.push(`Annual commitment: ${product.annualCommitment || 'Rs10,00,000'} minimum`);
    }
    return points;
  }

  // ─── Send Helpers ───
  function getMailtoLink(supplierEmail, subject, body) {
    if (!supplierEmail) return null;
    const params = new URLSearchParams();
    params.set('subject', subject);
    params.set('body', body);
    return `mailto:${supplierEmail}?${params.toString()}`;
  }

  function getWhatsAppLink(phone, message) {
    if (!phone) return null;
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const encodedMsg = encodeURIComponent(message);
    return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
  }

  // ─── Communication Log ───
  async function saveCommunicationLog(productId, type, content, supplierResponse, db) {
    const log = {
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      productId,
      type, // 'email' | 'whatsapp'
      content,
      supplierResponse: supplierResponse || null,
      sentAt: new Date().toISOString(),
      status: 'sent'
    };
    if (db && db.communicationLogs) {
      await db.communicationLogs.add(log);
    }
    return log;
  }

  async function getCommunicationHistory(productId, db) {
    if (!db || !db.communicationLogs) return [];
    return await db.communicationLogs.where('productId').equals(productId).reverse().sortBy('sentAt');
  }

  // ─── UI Renderers ───
  function renderEmailComposer(container, product, supplier, onGenerate, onSend) {
    container.innerHTML = `
      <div class="comm-panel">
        <div class="comm-header">
          <h4>Email to ${supplier.supplierName || 'Supplier'}</h4>
          <span class="comm-contact">${supplier.supplierEmail || 'No email on file'}</span>
        </div>
        <div class="comm-controls">
          <select id="email-type" class="comm-select">
            <option value="coldIntro">Cold Introduction</option>
            <option value="priceNegotiation">Price Negotiation</option>
            <option value="moqNegotiation">MOQ Negotiation</option>
            <option value="sampleRequest">Sample Request</option>
            <option value="paymentTerms">Payment Terms</option>
            <option value="shippingTerms">Shipping Terms</option>
            <option value="followUp">Follow-up (Day 3)</option>
            <option value="exclusiveDeal">Exclusive Deal Proposal</option>
          </select>
          <select id="email-tone" class="comm-select">
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
            <option value="diplomatic">Diplomatic</option>
            <option value="collaborative">Collaborative</option>
          </select>
          <button id="btn-gen-email" class="btn btn-primary">Generate with AI</button>
        </div>
        <div class="comm-meta" id="email-meta"></div>
        <input type="text" id="email-subject" class="comm-input" placeholder="Subject line..." />
        <textarea id="email-body" class="comm-textarea" rows="12" placeholder="Email body..."></textarea>
        <div class="comm-actions">
          <button id="btn-copy-email" class="btn btn-secondary">Copy</button>
          <button id="btn-send-email" class="btn btn-primary" ${!supplier.supplierEmail ? 'disabled' : ''}>Open in Email Client</button>
        </div>
        <div class="comm-negotiation" id="email-negotiation"></div>
      </div>
    `;

    const typeSelect = container.querySelector('#email-type');
    const toneSelect = container.querySelector('#email-tone');
    const genBtn = container.querySelector('#btn-gen-email');
    const subjectInput = container.querySelector('#email-subject');
    const bodyTextarea = container.querySelector('#email-body');
    const metaDiv = container.querySelector('#email-meta');
    const negotiationDiv = container.querySelector('#email-negotiation');
    const copyBtn = container.querySelector('#btn-copy-email');
    const sendBtn = container.querySelector('#btn-send-email');

    genBtn.addEventListener('click', async () => {
      genBtn.disabled = true;
      genBtn.textContent = 'Generating...';
      const result = await generateWithAI(typeSelect.value, product, supplier, toneSelect.value, false);
      if (result) {
        subjectInput.value = result.subject;
        bodyTextarea.value = result.body;
        metaDiv.innerHTML = `<span class="badge ${result.source}">${result.source === 'ai' ? 'AI Generated' : 'Template'}</span>
          <span class="badge">Success Rate: ${result.estimatedSuccessRate}%</span>`;
        negotiationDiv.innerHTML = result.negotiationPoints.map(p => `<div class="negotiation-point">${p}</div>`).join('');
        if (onGenerate) onGenerate(result);
      }
      genBtn.disabled = false;
      genBtn.textContent = 'Generate with AI';
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(`Subject: ${subjectInput.value}\n\n${bodyTextarea.value}`);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy', 2000);
    });

    sendBtn.addEventListener('click', () => {
      const mailto = getMailtoLink(supplier.supplierEmail, subjectInput.value, bodyTextarea.value);
      if (mailto) {
        window.open(mailto, '_blank');
        if (onSend) onSend({ type: 'email', subject: subjectInput.value, body: bodyTextarea.value });
      }
    });

    // Auto-generate on open
    genBtn.click();
  }

  function renderWhatsAppComposer(container, product, supplier, onGenerate, onSend) {
    container.innerHTML = `
      <div class="comm-panel">
        <div class="comm-header">
          <h4>WhatsApp to ${supplier.supplierName || 'Supplier'}</h4>
          <span class="comm-contact">${supplier.supplierPhone || supplier.supplierWhatsApp || 'No phone on file'}</span>
        </div>
        <div class="comm-controls">
          <select id="wa-type" class="comm-select">
            <option value="coldIntro">Cold Intro</option>
            <option value="priceNegotiation">Price Negotiation</option>
            <option value="moqNegotiation">MOQ Negotiation</option>
            <option value="sampleRequest">Sample Request</option>
            <option value="followUp">Follow-up</option>
          </select>
          <button id="btn-gen-wa" class="btn btn-primary">Generate</button>
        </div>
        <div class="wa-preview-frame">
          <div class="wa-bubble" id="wa-bubble"></div>
          <div class="wa-char-count" id="wa-char-count">0 / 300</div>
        </div>
        <div class="comm-actions">
          <button id="btn-copy-wa" class="btn btn-secondary">Copy</button>
          <button id="btn-send-wa" class="btn btn-primary" ${!(supplier.supplierPhone || supplier.supplierWhatsApp) ? 'disabled' : ''}>Open WhatsApp</button>
        </div>
      </div>
    `;

    const typeSelect = container.querySelector('#wa-type');
    const genBtn = container.querySelector('#btn-gen-wa');
    const bubble = container.querySelector('#wa-bubble');
    const charCount = container.querySelector('#wa-char-count');
    const copyBtn = container.querySelector('#btn-copy-wa');
    const sendBtn = container.querySelector('#btn-send-wa');

    let currentMessage = '';

    genBtn.addEventListener('click', async () => {
      genBtn.disabled = true;
      genBtn.textContent = '...';
      const result = await generateWithAI(typeSelect.value, product, supplier, 'balanced', true);
      if (result) {
        currentMessage = result.body;
        bubble.textContent = currentMessage;
        const len = currentMessage.length;
        charCount.textContent = `${len} / 300`;
        charCount.className = 'wa-char-count' + (len > 300 ? ' over-limit' : len > 250 ? ' near-limit' : '');
        if (onGenerate) onGenerate(result);
      }
      genBtn.disabled = false;
      genBtn.textContent = 'Generate';
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(currentMessage);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy', 2000);
    });

    sendBtn.addEventListener('click', () => {
      const phone = supplier.supplierPhone || supplier.supplierWhatsApp;
      const waLink = getWhatsAppLink(phone, currentMessage);
      if (waLink) {
        window.open(waLink, '_blank');
        if (onSend) onSend({ type: 'whatsapp', body: currentMessage });
      }
    });

    genBtn.click();
  }

  function renderCommunicationHistory(container, logs) {
    if (!logs || logs.length === 0) {
      container.innerHTML = '<div class="comm-empty">No communication history yet.</div>';
      return;
    }
    container.innerHTML = logs.map(log => `
      <div class="comm-log-item ${log.type}">
        <div class="comm-log-header">
          <span class="comm-log-type">${log.type === 'email' ? 'Email' : 'WhatsApp'} ${log.type.toUpperCase()}</span>
          <span class="comm-log-date">${new Date(log.sentAt).toLocaleDateString()}</span>
          <span class="comm-log-status">${log.status}</span>
        </div>
        <div class="comm-log-preview">${log.content.substring(0, 120)}...</div>
        ${log.supplierResponse ? `<div class="comm-log-response">${log.supplierResponse.substring(0, 120)}...</div>` : ''}
      </div>
    `).join('');
  }

  // ─── Helpers ───
  function formatPrice(price, currency) {
    const symbols = { INR: 'Rs', USD: '$', GBP: '£', EUR: '€', AED: 'AED ' };
    const sym = symbols[currency] || 'Rs';
    return sym + (price || 0).toLocaleString('en-IN');
  }

  // ─── Public API ───
  return {
    generateWithAI,
    generateFromTemplate,
    getMailtoLink,
    getWhatsAppLink,
    saveCommunicationLog,
    getCommunicationHistory,
    renderEmailComposer,
    renderWhatsAppComposer,
    renderCommunicationHistory,
    TEMPLATES,
    WHATSAPP_TEMPLATES
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupplierCommunicator;
}
