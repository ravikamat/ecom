/* ============================================================
   Input Validators — Sanitize & validate all user input
   Prevents injection attacks, crashes, and malformed data
   ============================================================ */

export const Validators = {
  productName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Product name must be a string');
    }
    if (name.length < 2) {
      throw new Error('Product name too short (min 2 characters)');
    }
    if (name.length > 200) {
      throw new Error('Product name too long (max 200 characters)');
    }
    // Allow: alphanumeric, spaces, hyphens, periods, commas, parentheses, ampersand, quotes
    if (!/^[a-zA-Z0-9\s\-.,()&']+$/.test(name)) {
      throw new Error('Product name contains invalid characters');
    }
    return name.trim();
  },

  country(country) {
    const validCountries = [
      'India', 'USA', 'UK', 'UAE', 'Canada', 'Australia', 'Germany', 'France',
      'Japan', 'Singapore', 'Saudi Arabia', 'Brazil', 'Mexico', 'Nigeria',
      'South Africa', 'Turkey', 'Indonesia', 'Thailand', 'Malaysia', 'South Korea'
    ];
    if (!validCountries.includes(country)) {
      throw new Error(`Invalid country. Must be one of: ${validCountries.join(', ')}`);
    }
    return country;
  },

  currency(currency) {
    const validCurrencies = [
      'INR', 'USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'JPY',
      'SGD', 'SAR', 'BRL', 'MXN', 'NGN', 'ZAR', 'TRY', 'IDR',
      'THB', 'MYR', 'KRW'
    ];
    if (!validCurrencies.includes(currency)) {
      throw new Error(`Invalid currency: ${currency}`);
    }
    return currency;
  },

  apiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('API key must be a string');
    }
    if (!apiKey.startsWith('nvapi-')) {
      throw new Error('API key must start with "nvapi-"');
    }
    if (apiKey.length < 40) {
      throw new Error('API key is too short');
    }
    return apiKey;
  },

  query(query) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a string');
    }
    if (query.length < 2) {
      throw new Error('Query too short (min 2 characters)');
    }
    if (query.length > 100) {
      throw new Error('Query too long (max 100 characters)');
    }
    if (!/^[a-zA-Z0-9\s\-.,()&']+$/.test(query)) {
      throw new Error('Query contains invalid characters');
    }
    return query.trim();
  },

  positiveNumber(num, fieldName = 'value') {
    if (typeof num !== 'number') {
      throw new Error(`${fieldName} must be a number`);
    }
    if (num < 0) {
      throw new Error(`${fieldName} cannot be negative`);
    }
    return num;
  },

  stringLength(str, min = 1, max = 500, fieldName = 'field') {
    if (typeof str !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }
    if (str.length < min) {
      throw new Error(`${fieldName} too short (min ${min} characters)`);
    }
    if (str.length > max) {
      throw new Error(`${fieldName} too long (max ${max} characters)`);
    }
    return str.trim();
  },

  url(urlString) {
    try {
      const url = new URL(urlString);
      if (!url.protocol.startsWith('http')) {
        throw new Error('URL must use http or https protocol');
      }
      return urlString;
    } catch (err) {
      throw new Error('Invalid URL format');
    }
  }
};

// Safe validator wrapper that returns error messages instead of throwing
export function validateSafe(fn, defaultValue = null) {
  try {
    return { valid: true, value: fn(), error: null };
  } catch (err) {
    return { valid: false, value: defaultValue, error: err.message };
  }
}
