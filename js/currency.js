/* ============================================================
   Currency Conversion Engine
   API: Frankfurter (free, no key, CORS-friendly)
   Fallback: Hardcoded rates (updated July 2025)
   ============================================================ */

async function getCachedRates() {
  if (typeof getExchangeRates === 'function') {
    const rates = await getExchangeRates();
    // Only return if we have actual rate data (non-empty object)
    if (rates && typeof rates === 'object' && Object.keys(rates).length > 2) {
      return rates;
    }
  }
  return null;
}

async function setCachedRates(rates) {
  if (typeof saveExchangeRates === 'function') {
    return await saveExchangeRates(rates);
  }
  return false;
}

const CurrencyEngine = {
  // Fallback rates (USD-based, updated July 2025 estimates)
  fallbackRates: {
    USD: 1, INR: 84.5, GBP: 0.79, EUR: 0.92, AED: 3.67,
    CAD: 1.36, AUD: 1.53, JPY: 155.0, SGD: 1.34, SAR: 3.75,
    BRL: 5.25, MXN: 17.8, NGN: 1550, ZAR: 18.2, TRY: 32.5,
    IDR: 15800, THB: 35.2, MYR: 4.68, KRW: 1380,
  },

  async init() {
    // Try cached rates first
    const cached = await getCachedRates();
    if (cached) {
      AppState.exchangeRates = cached;
      console.log('[Currency] Using cached exchange rates');
      return;
    }

    // Fetch fresh rates
    await this.fetchRates();
  },

  async fetchRates() {
    try {
      const currencies = Object.keys(this.fallbackRates).join(',');
      const response = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${currencies}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const rates = { USD: 1, ...data.rates };

      // Add currencies not supported by Frankfurter (ECB)
      // Fill from fallback for any missing
      for (const [code, rate] of Object.entries(this.fallbackRates)) {
        if (!rates[code]) rates[code] = rate;
      }

      AppState.exchangeRates = rates;
      await setCachedRates(rates);
      console.log('[Currency] Fetched fresh exchange rates');
    } catch (err) {
      console.warn('[Currency] API failed, using fallback rates:', err.message);
      AppState.exchangeRates = { ...this.fallbackRates };
    }
  },

  convert(amount, fromCurrency, toCurrency) {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return amount;
    const rates = AppState.exchangeRates || this.fallbackRates;

    const fromRate = rates[fromCurrency] || 1;
    const toRate = rates[toCurrency] || 1;

    return (amount / fromRate) * toRate;
  },

  getSymbol(currencyCode) {
    if (typeof getCurrencyConfig === 'function') {
      return getCurrencyConfig(currencyCode).symbol;
    }
    return currencyCode + ' ';
  },

  format(amount, currencyCode) {
    const config = typeof getCurrencyConfig === 'function' ? getCurrencyConfig(currencyCode) : { symbol: currencyCode + ' ', locale: 'en-US', decimals: 2 };
    const formatted = Number(amount).toLocaleString(config.locale, {
      minimumFractionDigits: config.decimals || 0,
      maximumFractionDigits: config.decimals || 0,
    });
    return `${config.symbol}${formatted}`;
  },
};

/* ── All supported currencies for the selector ───────────── */
const CURRENCY_LIST = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
];
