import axios from 'axios';
import logger from '../middleware/logger.js';
import config from '../config/config.js';

const coinMarketCapService = {
  isConfigured: () => {
    return !!(config.marketData?.coinMarketCap?.apiKey);
  },

    // Get price for a given symbol using CoinMarketCap Quotes endpoint
    // symbol can be like 'BTC/USDT' or 'BTC'
  getPrice: async (symbol) => {
    try {
      if (!coinMarketCapService.isConfigured()) {
        throw new Error('CoinMarketCap API key not configured');
      }

      if (!symbol) throw new Error('Symbol required');

      // Normalize to base asset and quote
      const parts = symbol.includes('/') ? symbol.split('/') : [symbol];
      const base = parts[0].toUpperCase();
      const quote = (parts[1] || 'USD').toUpperCase();

      // CMC returns prices in USD (and some other fiat) by default. We'll request USD and convert if needed.
      const url = `${config.marketData.coinMarketCap.baseUrl}/v1/cryptocurrency/quotes/latest`;

      const headers = {
        'X-CMC_PRO_API_KEY': config.marketData.coinMarketCap.apiKey,
      };

      const params = {
        symbol: base,
        convert: quote,
      };

      const response = await axios.get(url, { params, headers, timeout: 8000 });
      const data = response.data;

      if (data && data.data && data.data[base] && data.data[base].quote && data.data[base].quote[quote]) {
        const price = parseFloat(data.data[base].quote[quote].price);
        if (Number.isFinite(price)) return price;
      }

      throw new Error('Unexpected response from CoinMarketCap');
    } catch (error) {
      logger.warn(`CoinMarketCap price fetch failed for ${symbol}: ${error.message}`);
      throw error;
    }
  }
};

export default coinMarketCapService;
