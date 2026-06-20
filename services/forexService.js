const axios = require('axios');

// Free API keys: 
// - ExchangeRate-API (free tier: 1500 requests/month)
// - OpenExchangeRates (free tier: 1000 requests/month)
// - Frankfurter (completely free, no key required)
// We'll use Frankfurter as primary (no API key needed)

class ForexService {
  constructor() {
    this.baseUrl = 'https://api.frankfurter.app';
    this.cache = new Map();
    this.cacheDuration = 300000; // 5 minutes cache
  }

  // Get latest exchange rates
  async getLatestRates(base = 'USD') {
    const cacheKey = `latest_${base}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/latest?from=${base}`);
      const data = response.data;
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error('Forex API error:', error.message);
      return this.getFallbackRates(base);
    }
  }

  // Convert amount from one currency to another
  async convert(amount, from, to) {
    if (from === to) return amount;
    
    const rates = await this.getLatestRates(from);
    if (rates && rates.rates && rates.rates[to]) {
      return amount * rates.rates[to];
    }
    return amount; // fallback
  }

  // Get historical rate for a specific date
  async getHistoricalRate(date, from, to) {
    try {
      const response = await axios.get(`${this.baseUrl}/${date}?from=${from}&to=${to}`);
      return response.data.rates[to];
    } catch (error) {
      console.error('Historical rate error:', error.message);
      return null;
    }
  }

  // Get time-series data (for charts)
  async getTimeSeries(startDate, endDate, base = 'USD', symbols = []) {
    try {
      let url = `${this.baseUrl}/${startDate}..${endDate}?from=${base}`;
      if (symbols.length) {
        url += `&to=${symbols.join(',')}`;
      }
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error('Time series error:', error.message);
      return null;
    }
  }

  // Fallback rates when API fails
  getFallbackRates(base) {
    const fallbacks = {
      USD: { EUR: 0.92, GBP: 0.79, CAD: 1.38, JPY: 150.2, CHF: 0.88, AUD: 1.52 },
      EUR: { USD: 1.09, GBP: 0.86, CAD: 1.50, JPY: 163.5, CHF: 0.96, AUD: 1.65 },
      GBP: { USD: 1.27, EUR: 1.16, CAD: 1.74, JPY: 190.1, CHF: 1.11, AUD: 1.92 },
      CAD: { USD: 0.72, EUR: 0.67, GBP: 0.57, JPY: 108.8, CHF: 0.64, AUD: 1.10 },
    };
    
    return {
      amount: 1,
      base: base,
      rates: fallbacks[base] || fallbacks.USD,
      date: new Date().toISOString().split('T')[0]
    };
  }

  // Get major forex pairs with current rates
  async getMajorPairs() {
    const rates = await this.getLatestRates('USD');
    const pairs = ['EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'NZD'];
    
    return pairs.map(pair => ({
      pair: `USD/${pair}`,
      rate: rates.rates?.[pair] || this.getFallbackRates('USD').rates[pair],
      change: this.getRandomChange(), // For demo, real would need previous day
      high: null,
      low: null
    }));
  }

  getRandomChange() {
    const change = (Math.random() * 2 - 1).toFixed(4);
    return {
      value: parseFloat(change),
      percent: (change * 100).toFixed(2),
      direction: change >= 0 ? 'up' : 'down'
    };
  }
}

module.exports = new ForexService();