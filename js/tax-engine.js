/**
 * ECO Tax Engine v2.2
 * HSN code lookup, GST calculation, income tax estimator, compliance checklist
 * Pure vanilla JS — no dependencies.
 */

const TaxEngine = (function() {
  'use strict';

  // ─── HSN Code Database (expandable) ───
  const HSN_DB = {
    // Electronics
    'mobile phone': { hsn: '8517', gst: 18, description: 'Telephone sets, including telephones for cellular networks' },
    'smartphone': { hsn: '8517', gst: 18 },
    'phone case': { hsn: '3926', gst: 18, description: 'Other articles of plastics' },
    'screen protector': { hsn: '3926', gst: 18 },
    'charger': { hsn: '8504', gst: 18, description: 'Electrical transformers, static converters' },
    'power bank': { hsn: '8507', gst: 18 },
    'headphone': { hsn: '8518', gst: 18, description: 'Microphones, loudspeakers, headphones' },
    'earphone': { hsn: '8518', gst: 18 },
    'bluetooth speaker': { hsn: '8518', gst: 18 },
    'laptop': { hsn: '8471', gst: 18, description: 'Automatic data processing machines' },
    'keyboard': { hsn: '8471', gst: 18 },
    'mouse': { hsn: '8471', gst: 18 },
    'usb cable': { hsn: '8544', gst: 18 },
    'hdmi cable': { hsn: '8544', gst: 18 },
    'webcam': { hsn: '8525', gst: 18 },
    'router': { hsn: '8517', gst: 18 },
    'smart watch': { hsn: '8517', gst: 18 },
    'fitness band': { hsn: '8517', gst: 18 },
    'camera': { hsn: '8525', gst: 18 },
    'drone': { hsn: '8806', gst: 18 },

    // Fashion
    't-shirt': { hsn: '6109', gst: 5, description: 'T-shirts, singlets and other vests, knitted' },
    'shirt': { hsn: '6205', gst: 5, description: 'Mens/boys shirts, not knitted' },
    'jeans': { hsn: '6204', gst: 5, description: 'Womens/girls suits, ensembles, trousers' },
    'trousers': { hsn: '6204', gst: 5 },
    'dress': { hsn: '6204', gst: 5 },
    'skirt': { hsn: '6204', gst: 5 },
    'saree': { hsn: '6206', gst: 5 },
    'kurta': { hsn: '6203', gst: 5 },
    'suit': { hsn: '6203', gst: 5 },
    'jacket': { hsn: '6201', gst: 12 },
    'sweater': { hsn: '6110', gst: 5 },
    'hoodie': { hsn: '6110', gst: 5 },
    'socks': { hsn: '6115', gst: 5 },
    'underwear': { hsn: '6107', gst: 5 },
    'bra': { hsn: '6212', gst: 5 },
    'shoe': { hsn: '6403', gst: 18, description: 'Footwear with outer soles of rubber, plastics' },
    'sandal': { hsn: '6402', gst: 18 },
    'slipper': { hsn: '6402', gst: 18 },
    'boot': { hsn: '6403', gst: 18 },
    'belt': { hsn: '4203', gst: 18 },
    'wallet': { hsn: '4202', gst: 18, description: 'Trunks, suitcases, vanity cases, handbags' },
    'bag': { hsn: '4202', gst: 18 },
    'backpack': { hsn: '4202', gst: 18 },
    'handbag': { hsn: '4202', gst: 18 },
    'watch': { hsn: '9102', gst: 18, description: 'Wrist-watches, pocket-watches' },
    'sunglasses': { hsn: '9004', gst: 18 },
    'jewelry': { hsn: '7117', gst: 3, description: 'Imitation jewellery' },
    'necklace': { hsn: '7117', gst: 3 },
    'ring': { hsn: '7117', gst: 3 },
    'earring': { hsn: '7117', gst: 3 },
    'bracelet': { hsn: '7117', gst: 3 },
    'hair accessory': { hsn: '9615', gst: 18 },

    // Home & Kitchen
    'cookware': { hsn: '7323', gst: 12, description: 'Table, kitchen or other household articles of iron/steel' },
    'pan': { hsn: '7323', gst: 12 },
    'pot': { hsn: '7323', gst: 12 },
    'knife': { hsn: '8211', gst: 12 },
    'cutlery': { hsn: '8215', gst: 12 },
    'plate': { hsn: '6911', gst: 12 },
    'bowl': { hsn: '6911', gst: 12 },
    'glass': { hsn: '7013', gst: 12 },
    'mug': { hsn: '6912', gst: 12 },
    'bottle': { hsn: '3924', gst: 18, description: 'Tableware, kitchenware, other household articles of plastics' },
    'container': { hsn: '3924', gst: 18 },
    'lunch box': { hsn: '3924', gst: 18 },
    'water bottle': { hsn: '3924', gst: 18 },
    'thermos': { hsn: '9617', gst: 18 },
    'curtain': { hsn: '6303', gst: 5 },
    'bedsheet': { hsn: '6302', gst: 5 },
    'pillow': { hsn: '9404', gst: 12 },
    'mattress': { hsn: '9404', gst: 12 },
    'blanket': { hsn: '6301', gst: 5 },
    'towel': { hsn: '6302', gst: 5 },
    'carpet': { hsn: '5703', gst: 12 },
    'lamp': { hsn: '9405', gst: 12, description: 'Lamps and lighting fittings' },
    'light': { hsn: '9405', gst: 12 },
    'bulb': { hsn: '8539', gst: 12 },
    'fan': { hsn: '8414', gst: 18 },
    'air conditioner': { hsn: '8415', gst: 28 },
    'refrigerator': { hsn: '8418', gst: 18 },
    'washing machine': { hsn: '8450', gst: 18 },
    'microwave': { hsn: '8516', gst: 18 },
    'mixer grinder': { hsn: '8509', gst: 18 },
    'vacuum cleaner': { hsn: '8508', gst: 18 },

    // Beauty & Personal Care
    'cosmetic': { hsn: '3304', gst: 18, description: 'Beauty or make-up preparations' },
    'skincare': { hsn: '3304', gst: 18 },
    'lipstick': { hsn: '3304', gst: 18 },
    'foundation': { hsn: '3304', gst: 18 },
    'perfume': { hsn: '3303', gst: 18 },
    'shampoo': { hsn: '3305', gst: 18 },
    'soap': { hsn: '3401', gst: 18 },
    'toothbrush': { hsn: '9603', gst: 12 },
    'toothpaste': { hsn: '3306', gst: 18 },
    'razor': { hsn: '8212', gst: 18 },
    'trimmer': { hsn: '8510', gst: 18 },
    'hair dryer': { hsn: '8516', gst: 18 },
    'straightener': { hsn: '8516', gst: 18 },

    // Food & Beverage
    'food': { hsn: '2106', gst: 5, description: 'Food preparations not elsewhere specified' },
    'snack': { hsn: '2106', gst: 5 },
    'biscuit': { hsn: '1905', gst: 5 },
    'chocolate': { hsn: '1806', gst: 5 },
    'tea': { hsn: '0902', gst: 5 },
    'coffee': { hsn: '0901', gst: 5 },
    'spice': { hsn: '0910', gst: 5 },
    'honey': { hsn: '0409', gst: 0 },
    'oil': { hsn: '1509', gst: 5 },
    'juice': { hsn: '2009', gst: 12 },

    // Sports & Fitness
    'yoga mat': { hsn: '9506', gst: 12, description: 'Articles and equipment for general physical exercise' },
    'dumbbell': { hsn: '9506', gst: 12 },
    'resistance band': { hsn: '9506', gst: 12 },
    'sports equipment': { hsn: '9506', gst: 12 },
    'bicycle': { hsn: '8712', gst: 12 },

    // Toys & Baby
    'toy': { hsn: '9503', gst: 12, description: 'Tricycles, scooters, pedal cars, dolls, toys' },
    'doll': { hsn: '9503', gst: 12 },
    'puzzle': { hsn: '9503', gst: 12 },
    'baby product': { hsn: '9503', gst: 12 },
    'diaper': { hsn: '9619', gst: 12 },
    'baby bottle': { hsn: '3924', gst: 18 },

    // Books & Stationery
    'book': { hsn: '4901', gst: 0, description: 'Printed books, brochures, leaflets' },
    'notebook': { hsn: '4820', gst: 12 },
    'pen': { hsn: '9608', gst: 12 },
    'pencil': { hsn: '9609', gst: 12 },
    'stapler': { hsn: '8472', gst: 18 },

    // Furniture
    'furniture': { hsn: '9403', gst: 18, description: 'Other furniture and parts thereof' },
    'chair': { hsn: '9403', gst: 18 },
    'table': { hsn: '9403', gst: 18 },
    'sofa': { hsn: '9403', gst: 18 },
    'bed': { hsn: '9403', gst: 18 },
    'wardrobe': { hsn: '9403', gst: 18 },
    'shelf': { hsn: '9403', gst: 18 },

    // Tools & Hardware
    'tool': { hsn: '8205', gst: 18, description: 'Hand tools, interchangeable tools' },
    'screwdriver': { hsn: '8205', gst: 18 },
    'hammer': { hsn: '8205', gst: 18 },
    'drill': { hsn: '8467', gst: 18 },
    'saw': { hsn: '8202', gst: 18 },

    // Automotive
    'car accessory': { hsn: '8708', gst: 18 },
    'bike accessory': { hsn: '8714', gst: 18 },
    'helmet': { hsn: '6506', gst: 18 },

    // Pet
    'pet food': { hsn: '2309', gst: 5 },
    'pet toy': { hsn: '9503', gst: 12 },
    'pet bed': { hsn: '9403', gst: 18 }
  };

  // ─── HSN Code Lookup ───
  function suggestHSNCode(productName, category) {
    const text = (productName + ' ' + category).toLowerCase();

    // Direct keyword match
    for (const [keyword, data] of Object.entries(HSN_DB)) {
      if (text.includes(keyword)) {
        return { ...data, keyword, confidence: 'high', source: 'lookup' };
      }
    }

    // Partial match
    for (const [keyword, data] of Object.entries(HSN_DB)) {
      const words = keyword.split(' ');
      if (words.some(w => text.includes(w))) {
        return { ...data, keyword, confidence: 'medium', source: 'partial' };
      }
    }

    // AI fallback
    return aiSuggestHSN(productName, category);
  }

  async function aiSuggestHSN(productName, category) {
    const prompt = `Given product "${productName}" in category "${category || 'general'}", suggest the correct Indian HSN code and GST rate.
Return ONLY JSON: { "hsn": "xxxx", "gst": number, "description": "...", "confidence": "low", "source": "ai" }`;
    try {
      if (typeof callNvidiaAI === 'function') {
        const res = await callNvidiaAI(prompt, 'You are an Indian GST taxation expert.');
        return JSON.parse(res);
      }
    } catch (e) {}

    // Hash fallback
    const hash = productName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      hsn: String(1000 + (hash % 9000)),
      gst: 18,
      description: 'General merchandise',
      confidence: 'low',
      source: 'fallback'
    };
  }

  // ─── GST Calculation ───
  function calculateGST(price, hsn, type = 'regular') {
    const hsnData = HSN_DB[Object.keys(HSN_DB).find(k => HSN_DB[k].hsn === hsn)] || { gst: 18 };
    const rate = hsnData.gst || 18;
    const taxable = price / (1 + rate / 100);
    const taxAmount = price - taxable;

    if (type === 'interstate') {
      return {
        igst: taxAmount,
        cgst: 0,
        sgst: 0,
        totalTax: taxAmount,
        taxableValue: taxable,
        gstRate: rate
      };
    }

    return {
      igst: 0,
      cgst: taxAmount / 2,
      sgst: taxAmount / 2,
      totalTax: taxAmount,
      taxableValue: taxable,
      gstRate: rate
    };
  }

  // ─── Monthly GST Liability ───
  function calculateMonthlyGSTLiability(products) {
    let totalIGST = 0, totalCGST = 0, totalSGST = 0, totalTaxable = 0;
    const breakdown = [];

    products.forEach(p => {
      const monthlyRevenue = (p.sellingPrice || 0) * (p.monthlyUnits || 0);
      const hsnData = suggestHSNCode(p.name, p.category);
      const gst = calculateGST(monthlyRevenue, hsnData.hsn, p.transactionType || 'intrastate');
      totalIGST += gst.igst;
      totalCGST += gst.cgst;
      totalSGST += gst.sgst;
      totalTaxable += gst.taxableValue;
      breakdown.push({
        product: p.name,
        hsn: hsnData.hsn,
        gstRate: hsnData.gst,
        monthlyRevenue,
        ...gst
      });
    });

    return {
      totalIGST: Math.round(totalIGST),
      totalCGST: Math.round(totalCGST),
      totalSGST: Math.round(totalSGST),
      totalTax: Math.round(totalIGST + totalCGST + totalSGST),
      totalTaxable: Math.round(totalTaxable),
      breakdown
    };
  }

  // ─── Income Tax Estimator ───
  function calculateIncomeTax(revenue, expenses, type = 'presumptive') {
    // Presumptive taxation under Section 44AD
    if (type === 'presumptive') {
      const digitalRate = 0.06;  // 6% for digital transactions
      const nonDigitalRate = 0.08; // 8% for non-digital
      const digitalPercent = 0.8; // Assume 80% digital
      const deemedIncome = revenue * (digitalPercent * digitalRate + (1 - digitalPercent) * nonDigitalRate);
      const taxableIncome = Math.max(0, deemedIncome - expenses);

      // Slab rates FY 2026-27 (New Regime)
      let tax = 0;
      if (taxableIncome <= 300000) tax = 0;
      else if (taxableIncome <= 700000) tax = (taxableIncome - 300000) * 0.05;
      else if (taxableIncome <= 1000000) tax = 20000 + (taxableIncome - 700000) * 0.10;
      else if (taxableIncome <= 1200000) tax = 50000 + (taxableIncome - 1000000) * 0.15;
      else if (taxableIncome <= 1500000) tax = 80000 + (taxableIncome - 1200000) * 0.20;
      else tax = 140000 + (taxableIncome - 1500000) * 0.30;

      const cess = tax * 0.04; // Health & Education Cess

      return {
        type: 'presumptive',
        regime: 'Section 44AD',
        revenue,
        deemedIncome: Math.round(deemedIncome),
        expenses,
        taxableIncome: Math.round(taxableIncome),
        taxBeforeCess: Math.round(tax),
        cess: Math.round(cess),
        totalTax: Math.round(tax + cess),
        effectiveRate: revenue > 0 ? ((tax + cess) / revenue * 100).toFixed(2) : 0,
        note: '6% on digital, 8% on non-digital transactions. No need to maintain books.'
      };
    }

    // Regular taxation
    const taxableIncome = Math.max(0, revenue - expenses);
    let tax = 0;
    if (taxableIncome <= 300000) tax = 0;
    else if (taxableIncome <= 700000) tax = (taxableIncome - 300000) * 0.05;
    else if (taxableIncome <= 1000000) tax = 20000 + (taxableIncome - 700000) * 0.10;
    else if (taxableIncome <= 1200000) tax = 50000 + (taxableIncome - 1000000) * 0.15;
    else if (taxableIncome <= 1500000) tax = 80000 + (taxableIncome - 1200000) * 0.20;
    else tax = 140000 + (taxableIncome - 1500000) * 0.30;

    const cess = tax * 0.04;

    return {
      type: 'regular',
      revenue,
      taxableIncome: Math.round(taxableIncome),
      taxBeforeCess: Math.round(tax),
      cess: Math.round(cess),
      totalTax: Math.round(tax + cess),
      effectiveRate: revenue > 0 ? ((tax + cess) / revenue * 100).toFixed(2) : 0,
      note: 'Requires proper books of accounts and audit if turnover > Rs1 crore.'
    };
  }

  // ─── Quarterly Advance Tax ───
  function calculateAdvanceTax(annualTax) {
    return {
      q1: { due: 'June 15', amount: Math.round(annualTax * 0.15), label: '15% of annual tax' },
      q2: { due: 'September 15', amount: Math.round(annualTax * 0.30), label: '30% of annual tax' },
      q3: { due: 'December 15', amount: Math.round(annualTax * 0.30), label: '30% of annual tax' },
      q4: { due: 'March 15', amount: Math.round(annualTax * 0.25), label: '25% of annual tax' }
    };
  }

  // ─── Compliance Checklist ───
  function getComplianceChecklist(category) {
    const checklists = {
      default: [
        { item: 'GST Registration', required: true, description: 'Mandatory if turnover > Rs40 lakhs (goods) or Rs20 lakhs (services)' },
        { item: 'Business PAN', required: true, description: 'Permanent Account Number for tax filing' },
        { item: 'Current Bank Account', required: true, description: 'Business transactions must go through current account' },
        { item: 'IEC Code', required: false, description: 'Import Export Code — required only for imports/exports' },
        { item: 'MSME Registration', required: false, description: 'Udyam registration for benefits' }
      ],
      food: [
        { item: 'FSSAI License', required: true, description: 'Food Safety and Standards Authority of India' },
        { item: 'GST Registration', required: true },
        { item: 'Health Certificate', required: true, description: 'From local health department' },
        { item: 'Ingredient Disclosure', required: true, description: 'All ingredients must be listed on packaging' },
        { item: 'Expiry Date Labeling', required: true },
        { item: 'Nutritional Info', required: false, description: 'Recommended for packaged foods' }
      ],
      electronics: [
        { item: 'BIS Certification', required: true, description: 'Bureau of Indian Standards — mandatory for electronics' },
        { item: 'WEEE Compliance', required: false, description: 'E-waste management rules' },
        { item: 'ROHS Compliance', required: false, description: 'Restriction of Hazardous Substances' },
        { item: 'EMI/EMC Testing', required: false, description: 'For products with wireless/radio' },
        { item: 'GST Registration', required: true }
      ],
      cosmetics: [
        { item: 'CDSCO Approval', required: true, description: 'Central Drugs Standard Control Organization' },
        { item: 'Ingredient Disclosure', required: true },
        { item: 'Manufacturing License', required: true, description: 'From State Drug Controller' },
        { item: 'Animal Testing Declaration', required: false, description: 'Cruelty-free certification' },
        { item: 'GST Registration', required: true }
      ],
      toys: [
        { item: 'ISI Mark', required: true, description: 'BIS certification for toys (mandatory since 2021)' },
        { item: 'Choking Hazard Warning', required: true, description: 'Age-appropriate warnings' },
        { item: 'Phthalate Testing', required: true, description: 'Chemical safety for children' },
        { item: 'GST Registration', required: true }
      ],
      textile: [
        { item: 'Fiber Content Label', required: true, description: 'Mandatory fiber composition disclosure' },
        { item: 'Care Instructions', required: true, description: 'Washing/drying/ironing symbols' },
        { item: 'Size Chart', required: true },
        { item: 'GST Registration', required: true }
      ],
      jewelry: [
        { item: 'BIS Hallmark', required: true, description: 'For gold/silver jewelry' },
        { item: 'Carat Disclosure', required: true },
        { item: 'GST Registration', required: true }
      ]
    };

    const cat = category?.toLowerCase() || 'default';
    return checklists[cat] || checklists.default;
  }

  // ─── Certificate Expiry Tracker ───
  function checkCertificateExpiry(certificates) {
    const now = new Date();
    const alerts = [];

    certificates.forEach(cert => {
      const expiry = new Date(cert.expiryDate);
      const daysUntil = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

      if (daysUntil < 0) {
        alerts.push({ ...cert, status: 'expired', daysUntil, urgency: 'critical' });
      } else if (daysUntil <= 7) {
        alerts.push({ ...cert, status: 'expiring_soon', daysUntil, urgency: 'high' });
      } else if (daysUntil <= 30) {
        alerts.push({ ...cert, status: 'warning', daysUntil, urgency: 'medium' });
      }
    });

    return alerts.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  // ─── Public API ───
  return {
    suggestHSNCode,
    calculateGST,
    calculateMonthlyGSTLiability,
    calculateIncomeTax,
    calculateAdvanceTax,
    getComplianceChecklist,
    checkCertificateExpiry,
    HSN_DB
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaxEngine;
}
