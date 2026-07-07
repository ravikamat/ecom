/**
 * ECO Export Engine v2.2
 * Generates platform-specific upload files: Amazon, Flipkart, Meesho, eBay, Shopify, Etsy, Google Shopping
 * Pure vanilla JS — no dependencies.
 */

const ExportEngine = (function() {
  'use strict';

  // ─── Amazon Flat File (Tab-Delimited .txt) ───
  function generateAmazonFlatFile(products) {
    const headers = [
      'sku', 'product-id', 'product-id-type', 'item-name', 'brand-name', 'manufacturer',
      'part-number', 'product-description', 'update-delete', 'standard-price', 'quantity',
      'bullet-point1', 'bullet-point2', 'bullet-point3', 'bullet-point4', 'bullet-point5',
      'generic-keywords1', 'generic-keywords2', 'generic-keywords3', 'generic-keywords4', 'generic-keywords5',
      'main-image-url', 'other-image-url1', 'other-image-url2', 'other-image-url3',
      'fulfillment-center-id', 'condition-type', 'condition-note', 'item-package-quantity',
      'number-of-items', 'shipping-weight', 'shipping-weight-unit-of-measure',
      'item-weight', 'item-weight-unit-of-measure', 'country-of-origin'
    ];

    let txt = headers.join('\t') + '\n';

    products.forEach(p => {
      const sku = p.sku || ('ECO-' + Math.random().toString(36).substr(2, 8).toUpperCase());
      const row = [
        sku,
        p.gtin || p.ean || p.upc || '',
        p.gtin ? 'GTIN' : p.ean ? 'EAN' : p.upc ? 'UPC' : '',
        (p.listingTitle || p.name || '').substring(0, 200),
        p.brand || 'Generic',
        p.manufacturer || p.supplierName || '',
        p.mpn || sku,
        (p.listingDescription || p.description || '').substring(0, 2000),
        'Update',
        p.sellingPrice || '',
        p.quantity || p.moq || 10,
        (p.bulletPoints?.[0] || p.bullet1 || '').substring(0, 500),
        (p.bulletPoints?.[1] || p.bullet2 || '').substring(0, 500),
        (p.bulletPoints?.[2] || p.bullet3 || '').substring(0, 500),
        (p.bulletPoints?.[3] || p.bullet4 || '').substring(0, 500),
        (p.bulletPoints?.[4] || p.bullet5 || '').substring(0, 500),
        (p.backendKeywords?.[0] || p.keyword1 || '').substring(0, 50),
        (p.backendKeywords?.[1] || p.keyword2 || '').substring(0, 50),
        (p.backendKeywords?.[2] || p.keyword3 || '').substring(0, 50),
        (p.backendKeywords?.[3] || p.keyword4 || '').substring(0, 50),
        (p.backendKeywords?.[4] || p.keyword5 || '').substring(0, 50),
        p.imageUrl || '',
        p.imageUrl2 || '',
        p.imageUrl3 || '',
        p.imageUrl4 || '',
        p.fulfillmentCenter || 'DEFAULT',
        p.condition || 'New',
        (p.conditionNote || '').substring(0, 2000),
        p.packageQuantity || 1,
        p.numberOfItems || 1,
        p.weightKg || 0.5,
        'KG',
        p.weightKg || 0.5,
        'KG',
        p.countryOfOrigin || 'IN'
      ];
      txt += row.map(v => String(v).replace(/\t/g, ' ')).join('\t') + '\n';
    });

    return { content: txt, filename: 'amazon_flat_file_' + dateStamp() + '.txt', mime: 'text/tab-separated-values' };
  }

  // ─── Flipkart CSV ───
  function generateFlipkartCSV(products) {
    const headers = [
      'SKU ID', 'Product Title', 'Description', 'MRP', 'Selling Price', 'HSN',
      'GST%', 'Weight (kg)', 'Length (cm)', 'Width (cm)', 'Height (cm)',
      'Main Image URL', 'Image URL 2', 'Image URL 3', 'Image URL 4',
      'Variant Attribute', 'Variant Value', 'Search Keywords', 'Key Features',
      'Package Contents', 'Care Instructions', 'Warranty', 'Country of Origin'
    ];

    let csv = headers.join(',') + '\n';

    products.forEach(p => {
      const sku = p.sku || ('FLP-' + Math.random().toString(36).substr(2, 8).toUpperCase());
      const row = [
        sku,
        csvEscape(p.listingTitle || p.name || ''),
        csvEscape((p.listingDescription || p.description || '').substring(0, 4000)),
        p.mrp || Math.round((p.sellingPrice || 0) * 1.5),
        p.sellingPrice || '',
        p.hsnCode || '',
        p.gstRate || 18,
        p.weightKg || 0.5,
        p.lengthCm || 10,
        p.widthCm || 10,
        p.heightCm || 5,
        p.imageUrl || '',
        p.imageUrl2 || '',
        p.imageUrl3 || '',
        p.imageUrl4 || '',
        p.variantAttribute || '',
        p.variantValue || '',
        csvEscape((p.searchKeywords || p.backendKeywords?.join(',') || '').substring(0, 500)),
        csvEscape((p.keyFeatures || p.bulletPoints?.join(' | ') || '').substring(0, 2000)),
        csvEscape(p.packageContents || '1x ' + (p.name || 'Product')),
        csvEscape(p.careInstructions || ''),
        csvEscape(p.warranty || 'No warranty'),
        p.countryOfOrigin || 'IN'
      ];
      csv += row.join(',') + '\n';
    });

    return { content: csv, filename: 'flipkart_bulk_' + dateStamp() + '.csv', mime: 'text/csv' };
  }

  // ─── Meesho CSV ───
  function generateMeeshoCSV(products) {
    const headers = ['Product Name', 'Category', 'MRP', 'Selling Price', 'MOQ', 'Image URL', 'Description', 'Weight (g)'];
    let csv = headers.join(',') + '\n';

    products.forEach(p => {
      const row = [
        csvEscape(p.name || ''),
        csvEscape(p.category || 'General'),
        p.mrp || Math.round((p.sellingPrice || 0) * 1.4),
        p.sellingPrice || '',
        p.moq || 1,
        p.imageUrl || '',
        csvEscape((p.description || '').substring(0, 1000)),
        Math.round((p.weightKg || 0.5) * 1000)
      ];
      csv += row.join(',') + '\n';
    });

    return { content: csv, filename: 'meesho_bulk_' + dateStamp() + '.csv', mime: 'text/csv' };
  }

  // ─── eBay CSV ───
  function generateEbayCSV(products) {
    const headers = [
      'Title', 'Description', 'StartPrice', 'Quantity', 'Category', 'ConditionID',
      'PicURL', 'PicURL2', 'PicURL3', 'ShippingProfile', 'ReturnProfile',
      'PaymentProfile', 'ItemSpecifics', 'Country', 'Currency', 'Duration'
    ];
    let csv = headers.join(',') + '\n';

    products.forEach(p => {
      const row = [
        csvEscape((p.listingTitle || p.name || '').substring(0, 80)),
        csvEscape(p.listingDescription || p.description || ''),
        p.sellingPrice || '',
        p.quantity || p.moq || 1,
        p.ebayCategory || '',
        p.conditionID || 1000,
        p.imageUrl || '',
        p.imageUrl2 || '',
        p.imageUrl3 || '',
        p.shippingProfile || '',
        p.returnProfile || 'ReturnsAccepted',
        p.paymentProfile || 'PayPal',
        csvEscape(p.itemSpecifics || ''),
        p.countryOfOrigin || 'IN',
        p.currency || 'INR',
        p.duration || 'GTC'
      ];
      csv += row.join(',') + '\n';
    });

    return { content: csv, filename: 'ebay_bulk_' + dateStamp() + '.csv', mime: 'text/csv' };
  }

  // ─── Shopify JSON ───
  function generateShopifyJSON(products) {
    const shopifyProducts = products.map(p => ({
      product: {
        title: p.listingTitle || p.name || '',
        body_html: p.listingDescription || p.description || '',
        vendor: p.brand || p.supplierName || 'ECO Store',
        product_type: p.category || '',
        tags: p.tags || [p.category, p.subCategory].filter(Boolean),
        variants: [{
          sku: p.sku || ('SHP-' + Math.random().toString(36).substr(2, 8).toUpperCase()),
          price: String(p.sellingPrice || 0),
          compare_at_price: String(p.mrp || Math.round((p.sellingPrice || 0) * 1.3)),
          inventory_quantity: p.quantity || p.moq || 10,
          weight: p.weightKg || 0.5,
          weight_unit: 'kg',
          requires_shipping: true,
          taxable: true
        }],
        images: [
          p.imageUrl && { src: p.imageUrl },
          p.imageUrl2 && { src: p.imageUrl2 },
          p.imageUrl3 && { src: p.imageUrl3 }
        ].filter(Boolean),
        metafields: [
          { namespace: 'eco', key: 'hsn', value: p.hsnCode || '', type: 'single_line_text_field' },
          { namespace: 'eco', key: 'gst_rate', value: String(p.gstRate || 18), type: 'number_integer' },
          { namespace: 'eco', key: 'supplier', value: p.supplierName || '', type: 'single_line_text_field' },
          { namespace: 'eco', key: 'moq', value: String(p.moq || 1), type: 'number_integer' }
        ]
      }
    }));

    return { content: JSON.stringify({ products: shopifyProducts }, null, 2), filename: 'shopify_products_' + dateStamp() + '.json', mime: 'application/json' };
  }

  // ─── Etsy CSV ───
  function generateEtsyCSV(products) {
    const headers = ['Title', 'Description', 'Tags', 'Price', 'Quantity', 'Materials', 'Image URL', 'Shipping Profile', 'Who Made', 'When Made'];
    let csv = headers.join(',') + '\n';

    products.forEach(p => {
      const row = [
        csvEscape((p.listingTitle || p.name || '').substring(0, 140)),
        csvEscape((p.listingDescription || p.description || '').substring(0, 5000)),
        csvEscape((p.etsyTags || p.tags?.join(',') || p.category || '').substring(0, 255)),
        p.sellingPrice || '',
        p.quantity || p.moq || 1,
        csvEscape(p.materials || ''),
        p.imageUrl || '',
        csvEscape(p.etsyShippingProfile || ''),
        p.whoMade || 'i_did',
        p.whenMade || 'made_to_order'
      ];
      csv += row.join(',') + '\n';
    });

    return { content: csv, filename: 'etsy_bulk_' + dateStamp() + '.csv', mime: 'text/csv' };
  }

  // ─── Google Shopping XML Feed ───
  function generateGoogleShoppingXML(products) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n';
    xml += '  <channel>\n';
    xml += '    <title>ECO Store Products</title>\n';
    xml += '    <link>https://ecostore.example.com</link>\n';
    xml += '    <description>Product feed for Google Shopping</description>\n';

    products.forEach(p => {
      const id = p.sku || ('G-' + Math.random().toString(36).substr(2, 8).toUpperCase());
      xml += '    <item>\n';
      xml += `      <g:id>${xmlEscape(id)}</g:id>\n`;
      xml += `      <g:title>${xmlEscape((p.listingTitle || p.name || '').substring(0, 150))}</g:title>\n`;
      xml += `      <g:description>${xmlEscape((p.listingDescription || p.description || '').substring(0, 5000))}</g:description>\n`;
      xml += `      <g:link>${xmlEscape(p.productUrl || '')}</g:link>\n`;
      xml += `      <g:image_link>${xmlEscape(p.imageUrl || '')}</g:image_link>\n`;
      xml += `      <g:condition>new</g:condition>\n`;
      xml += `      <g:availability>${p.quantity > 0 ? 'in stock' : 'out of stock'}</g:availability>\n`;
      xml += `      <g:price>${p.sellingPrice || 0} ${p.currency || 'INR'}</g:price>\n`;
      xml += `      <g:brand>${xmlEscape(p.brand || 'Generic')}</g:brand>\n`;
      xml += `      <g:gtin>${xmlEscape(p.gtin || '')}</g:gtin>\n`;
      xml += `      <g:mpn>${xmlEscape(p.mpn || id)}</g:mpn>\n`;
      xml += `      <g:google_product_category>${xmlEscape(p.googleCategory || '')}</g:google_product_category>\n`;
      xml += `      <g:product_type>${xmlEscape(p.category || '')}</g:product_type>\n`;
      xml += `      <g:shipping_weight>${p.weightKg || 0.5} kg</g:shipping_weight>\n`;
      xml += '    </item>\n';
    });

    xml += '  </channel>\n</rss>';
    return { content: xml, filename: 'google_shopping_feed_' + dateStamp() + '.xml', mime: 'application/xml' };
  }

  // ─── Facebook Catalog CSV ───
  function generateFacebookCatalogCSV(products) {
    const headers = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'google_product_category', 'shipping_weight'];
    let csv = headers.join(',') + '\n';

    products.forEach(p => {
      const id = p.sku || ('FB-' + Math.random().toString(36).substr(2, 8).toUpperCase());
      const row = [
        id,
        csvEscape(p.listingTitle || p.name || ''),
        csvEscape((p.listingDescription || p.description || '').substring(0, 5000)),
        p.quantity > 0 ? 'in stock' : 'out of stock',
        'new',
        `${p.sellingPrice || 0} ${p.currency || 'INR'}`,
        csvEscape(p.productUrl || ''),
        p.imageUrl || '',
        csvEscape(p.brand || 'Generic'),
        csvEscape(p.googleCategory || p.category || ''),
        `${p.weightKg || 0.5}kg`
      ];
      csv += row.join(',') + '\n';
    });

    return { content: csv, filename: 'facebook_catalog_' + dateStamp() + '.csv', mime: 'text/csv' };
  }

  // ─── Validation ───
  function validateForAmazon(product) {
    const errors = [], warnings = [];
    if (!product.sku) warnings.push('SKU missing — will be auto-generated');
    if (!product.gtin && !product.ean && !product.upc) errors.push('Product ID (GTIN/EAN/UPC) required');
    if (!(product.listingTitle || product.name)) errors.push('Title required');
    if ((product.listingTitle || product.name || '').length > 200) errors.push('Title exceeds 200 chars');
    if (!product.brand) warnings.push('Brand missing — will use "Generic"');
    if (!product.imageUrl) errors.push('Main image URL required');
    if (!product.sellingPrice) errors.push('Price required');
    if (!product.quantity && !product.moq) warnings.push('Quantity missing — defaulting to 10');
    return { valid: errors.length === 0, errors, warnings, platform: 'Amazon' };
  }

  function validateForFlipkart(product) {
    const errors = [], warnings = [];
    if (!product.sku) warnings.push('SKU missing — will be auto-generated');
    if (!(product.listingTitle || product.name)) errors.push('Title required');
    if (!product.hsnCode) errors.push('HSN code required');
    if (!product.gstRate) warnings.push('GST% missing — defaulting to 18%');
    if (!product.sellingPrice) errors.push('Selling price required');
    if (!product.imageUrl) errors.push('Main image URL required');
    return { valid: errors.length === 0, errors, warnings, platform: 'Flipkart' };
  }

  function validateForMeesho(product) {
    const errors = [], warnings = [];
    if (!product.name) errors.push('Product name required');
    if (!product.sellingPrice) errors.push('Selling price required');
    if (!product.imageUrl) errors.push('Image URL required');
    return { valid: errors.length === 0, errors, warnings, platform: 'Meesho' };
  }

  function validateForPlatform(product, platform) {
    switch (platform.toLowerCase()) {
      case 'amazon': return validateForAmazon(product);
      case 'flipkart': return validateForFlipkart(product);
      case 'meesho': return validateForMeesho(product);
      default: return { valid: true, errors: [], warnings: [], platform };
    }
  }

  // ─── HSN Lookup Table (expandable) ───
  const HSN_TABLE = {
    'mobile phone': { hsn: '8517', gst: 18 },
    'phone case': { hsn: '3926', gst: 18 },
    'charger': { hsn: '8504', gst: 18 },
    'headphone': { hsn: '8518', gst: 18 },
    'earphone': { hsn: '8518', gst: 18 },
    'bluetooth': { hsn: '8518', gst: 18 },
    'laptop': { hsn: '8471', gst: 18 },
    'keyboard': { hsn: '8471', gst: 18 },
    'mouse': { hsn: '8471', gst: 18 },
    'watch': { hsn: '9102', gst: 18 },
    'smart watch': { hsn: '8517', gst: 18 },
    'shoe': { hsn: '6403', gst: 18 },
    't-shirt': { hsn: '6109', gst: 5 },
    'shirt': { hsn: '6205', gst: 5 },
    'jeans': { hsn: '6204', gst: 5 },
    'dress': { hsn: '6204', gst: 5 },
    'bag': { hsn: '4202', gst: 18 },
    'backpack': { hsn: '4202', gst: 18 },
    'wallet': { hsn: '4202', gst: 18 },
    'jewelry': { hsn: '7117', gst: 3 },
    'necklace': { hsn: '7117', gst: 3 },
    'ring': { hsn: '7117', gst: 3 },
    'cosmetic': { hsn: '3304', gst: 18 },
    'skincare': { hsn: '3304', gst: 18 },
    'food': { hsn: '2106', gst: 5 },
    'snack': { hsn: '2106', gst: 5 },
    'toy': { hsn: '9503', gst: 12 },
    'book': { hsn: '4901', gst: 0 },
    'furniture': { hsn: '9403', gst: 18 },
    'light': { hsn: '9405', gst: 12 },
    'lamp': { hsn: '9405', gst: 12 },
    'kitchen': { hsn: '3924', gst: 18 },
    'bottle': { hsn: '3924', gst: 18 },
    'container': { hsn: '3924', gst: 18 },
    'tool': { hsn: '8205', gst: 18 },
    'sports': { hsn: '9506', gst: 12 },
    'yoga': { hsn: '9506', gst: 12 },
    'mat': { hsn: '9506', gst: 12 }
  };

  function suggestHSNCode(productName, category) {
    const text = (productName + ' ' + category).toLowerCase();
    for (const [keyword, data] of Object.entries(HSN_TABLE)) {
      if (text.includes(keyword)) return { ...data, confidence: 'high', source: 'lookup' };
    }
    // Fallback: hash-based deterministic
    const hash = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const fallbackHSN = 1000 + (hash % 9000);
    return { hsn: String(fallbackHSN), gst: 18, confidence: 'low', source: 'fallback' };
  }

  // ─── Download Helper ───
  function download(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function dateStamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function csvEscape(str) {
    if (str === null || str === undefined) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function xmlEscape(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ─── Public API ───
  return {
    generateAmazonFlatFile,
    generateFlipkartCSV,
    generateMeeshoCSV,
    generateEbayCSV,
    generateShopifyJSON,
    generateEtsyCSV,
    generateGoogleShoppingXML,
    generateFacebookCatalogCSV,
    validateForAmazon,
    validateForFlipkart,
    validateForMeesho,
    validateForPlatform,
    suggestHSNCode,
    download,
    dateStamp,
    csvEscape,
    xmlEscape
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExportEngine;
}
