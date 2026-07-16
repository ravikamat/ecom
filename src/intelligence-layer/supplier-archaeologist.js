import { callAI, extractJSON } from './ai-gateway.js';
import { IndiaStack }           from './india-stack.js';

export class SupplierArchaeologist {
  async run(dossier) {
    const { productName = '', country = 'India' } = dossier;
    return country === 'India'
      ? this.runIndiaStack(productName)
      : this.runGlobal(productName, country);
  }

  async runIndiaStack(productName) {
    const result = await callAI([
      { role: 'system', content: 'You are an India sourcing expert. Use GST trace, industrial clusters, and WhatsApp outreach.' },
      { role: 'user', content: `Find Indian suppliers for "${productName}". Return JSON: {gst_trace:{brand_name,clusters}, suppliers:[{company,city,cluster,phone,confidence,source_layer}], outreach:{message_template,language_hint}}.` },
    ], { temperature: 0.5, max_tokens: 2000, purpose: 'india_supplier' });
    try {
      const data = JSON.parse(extractJSON(result.content));
      // Add WhatsApp links
      if (Array.isArray(data.suppliers)) {
        data.suppliers = data.suppliers.map(s => ({
          ...s,
          whatsapp_link: s.phone ? IndiaStack.generateWhatsAppLink(s.phone, `Namaste, hum ${productName} ke liye sourcing kar rahe hain`) : null,
        }));
      }
      return data;
    } catch { return { suppliers: [], fallback: true }; }
  }

  async runGlobal(productName, country) {
    const result = await callAI([
      { role: 'user', content: `Find manufacturers for "${productName}" in ${country}. Return JSON: {suppliers:[{name,location,moq,sample_cost,lead_time_weeks,contact_method,confidence}]}.` },
    ], { temperature: 0.4, max_tokens: 1500, purpose: 'supplier' });
    try { return JSON.parse(extractJSON(result.content)); }
    catch { return { suppliers: [], fallback: true }; }
  }
}
