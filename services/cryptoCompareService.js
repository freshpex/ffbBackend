import axios from 'axios';
import logger from '../middleware/logger.js';
import { callWithRetry } from '../utils/apiHelper.js';

/**
 * CryptoCompare API Service
 * Provides access to CryptoCompare APIs for cryptocurrency data
 */
const cryptoCompareService = {
  /**
   * Check if this service is configured with API keys
   * @returns {boolean} Whether the service is configured
   */
  isConfigured: () => {
    return !!process.env.CRYPTOCOMPARE_API_KEY;
  },
  
  /**
   * Get CryptoCompare API key
   * @returns {string} API key from environment variables
   */
  getApiKey: () => {
    return process.env.CRYPTOCOMPARE_API_KEY;
  },

  /**
   * Execute a CryptoCompare API request
   * @param {string} endpoint - The API endpoint to call
   * @param {Object} params - Additional parameters for the request
   * @returns {Promise<Object>} The API response
   */
  executeRequest: async (endpoint, params = {}) => {
    if (!cryptoCompareService.isConfigured()) {
      throw new Error('CryptoCompare API key is not configured');
    }

    const apiKey = cryptoCompareService.getApiKey();
    
    const baseUrl = 'https://min-api.cryptocompare.com/data';
    const url = `${baseUrl}/${endpoint}`;
    
    const queryParams = new URLSearchParams(params);
    const requestUrl = `${url}?${queryParams.toString()}`;
    
    try {
      const apiCall = () => axios.get(requestUrl, {
        timeout: 10000,
        headers: {
          'authorization': apiKey ? `Apikey ${apiKey}` : undefined,
          'User-Agent': 'Financial Freedom Broker/1.0'
        }
      });
      
      const response = await callWithRetry(
        apiCall,
        {
          maxRetries: 3,
          retryDelay: 1000,
          timeout: 10000
        },
        `cryptocompare-${endpoint}`
      );
      
      // Check for API errors
      if (response.data && response.data.Response === 'Error') {
        throw new Error(response.data.Message || 'CryptoCompare API error');
      }
      
      return response.data;
    } catch (error) {
      logger.error(`CryptoCompare API error for ${endpoint}:`, error.message);
      throw error;
    }
  },
  
  /**
   * Get current price for a cryptocurrency
   * @param {string} fromSymbol - From symbol (e.g., BTC)
   * @param {string|Array} toSymbols - To symbol(s) (e.g., USD or ['USD', 'EUR'])
   * @returns {Promise<Object>} Price data
   */
  getCurrentPrice: async (fromSymbol, toSymbols) => {
    const toSymbolsStr = Array.isArray(toSymbols) ? toSymbols.join(',') : toSymbols;
    
    return await cryptoCompareService.executeRequest('price', {
      fsym: fromSymbol,
      tsyms: toSymbolsStr
    });
  },
  
  /**
   * Get current prices for multiple cryptocurrencies
   * @param {Array} fromSymbols - From symbols array
   * @param {Array} toSymbols - To symbols array
   * @returns {Promise<Object>} Price data
   */
  getMultipleCurrentPrices: async (fromSymbols, toSymbols) => {
    const fromSymbolsStr = Array.isArray(fromSymbols) ? fromSymbols.join(',') : fromSymbols;
    const toSymbolsStr = Array.isArray(toSymbols) ? toSymbols.join(',') : toSymbols;
    
    return await cryptoCompareService.executeRequest('pricemulti', {
      fsyms: fromSymbolsStr,
      tsyms: toSymbolsStr
    });
  },
  
  /**
   * Get price with full data
   * @param {string} fromSymbol - From symbol
   * @param {string} toSymbol - To symbol
   * @returns {Promise<Object>} Full price data
   */
  getPriceWithFullData: async (fromSymbol, toSymbol) => {
    return await cryptoCompareService.executeRequest('pricemultifull', {
      fsyms: fromSymbol,
      tsyms: toSymbol
    });
  },
  
  /**
   * Get historical daily data
   * @param {string} fromSymbol - From symbol
   * @param {string} toSymbol - To symbol
   * @param {number} limit - Number of data points
   * @returns {Promise<Object>} Historical data
   */
  getHistoricalDailyData: async (fromSymbol, toSymbol, limit = 30) => {
    return await cryptoCompareService.executeRequest('histoday', {
      fsym: fromSymbol,
      tsym: toSymbol,
      limit
    });
  },
  
  /**
   * Get historical hourly data
   * @param {string} fromSymbol - From symbol
   * @param {string} toSymbol - To symbol
   * @param {number} limit - Number of data points
   * @returns {Promise<Object>} Historical data
   */
  getHistoricalHourlyData: async (fromSymbol, toSymbol, limit = 24) => {
    return await cryptoCompareService.executeRequest('histohour', {
      fsym: fromSymbol,
      tsym: toSymbol,
      limit
    });
  },
  
  /**
   * Get historical minute data
   * @param {string} fromSymbol - From symbol
   * @param {string} toSymbol - To symbol
   * @param {number} limit - Number of data points
   * @param {number} aggregate - Aggregate data points (e.g., 5 for 5-minute intervals)
   * @returns {Promise<Object>} Historical data
   */
  getHistoricalMinuteData: async (fromSymbol, toSymbol, limit = 60, aggregate = 1) => {
    return await cryptoCompareService.executeRequest('histominute', {
      fsym: fromSymbol,
      tsym: toSymbol,
      limit,
      aggregate
    });
  },
  
  /**
   * Get top cryptocurrencies by market cap
   * @param {number} limit - Number of results
   * @param {string} tsym - To symbol (e.g., USD)
   * @returns {Promise<Object>} Top cryptocurrencies
   */
  getTopCryptocurrencies: async (limit = 10, tsym = 'USD') => {
    return await cryptoCompareService.executeRequest('top/mktcapfull', {
      limit,
      tsym
    });
  },
  
  /**
   * Get news for cryptocurrencies
   * @param {string} categories - Categories to filter by
   * @param {number} limit - Number of results
   * @returns {Promise<Object>} News articles
   */
  getNews: async (categories = '', limit = 10) => {
    return await cryptoCompareService.executeRequest('v2/news/', {
      categories,
      lTs: Math.floor(Date.now() / 1000) - (86400 * 7), // Last 7 days
      sortOrder: 'popular',
      lang: 'EN',
      extraParams: 'FinancialFreedomBroker'
    });
  }
};

export default cryptoCompareService;
