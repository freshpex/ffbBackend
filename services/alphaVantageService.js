import axios from 'axios';
import logger from '../middleware/logger.js';

// API configuration
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

/**
 * Makes a request to the Alpha Vantage API
 * @param {Object} params - Request parameters 
 * @returns {Promise} - The API response
 */
const makeRequest = async (params) => {
  try {
    // Add API key to params
    const requestParams = {
      ...params,
      apikey: API_KEY
    };
    
    const response = await axios.get(BASE_URL, { params: requestParams });
    
    // Check for API errors
    if (response.data && response.data['Error Message']) {
      throw new Error(response.data['Error Message']);
    }
    
    if (response.data && response.data['Information']) {
      logger.warn(`Alpha Vantage API message: ${response.data['Information']}`);
    }
    
    return response.data;
  } catch (error) {
    logger.error(`Error fetching data from Alpha Vantage: ${error.message}`);
    throw error;
  }
};

/**
 * Alpha Vantage API service
 */
const alphaVantageService = {
  /**
   * Get current stock quote
   * @param {string} symbol - Stock symbol (e.g., AAPL)
   * @returns {Promise} - Stock quote data
   */
  getStockQuote: async (symbol) => {
    const params = {
      function: 'GLOBAL_QUOTE',
      symbol
    };
    
    const data = await makeRequest(params);
    return data['Global Quote'] || {};
  },
  
  /**
   * Get daily time series for a stock
   * @param {string} symbol - Stock symbol
   * @param {boolean} full - Whether to get full or compact output
   * @returns {Promise} - Time series data
   */
  getDailyTimeSeries: async (symbol, full = false) => {
    const params = {
      function: 'TIME_SERIES_DAILY',
      symbol,
      outputsize: full ? 'full' : 'compact'
    };
    
    return makeRequest(params);
  },
  
  /**
   * Get weekly time series for a stock
   * @param {string} symbol - Stock symbol
   * @returns {Promise} - Weekly time series data
   */
  getWeeklyTimeSeries: async (symbol) => {
    const params = {
      function: 'TIME_SERIES_WEEKLY',
      symbol
    };
    
    return makeRequest(params);
  },
  
  /**
   * Get exchange rate between two currencies
   * @param {string} fromCurrency - From currency code
   * @param {string} toCurrency - To currency code
   * @returns {Promise} - Exchange rate data
   */
  getExchangeRate: async (fromCurrency, toCurrency) => {
    const params = {
      function: 'CURRENCY_EXCHANGE_RATE',
      from_currency: fromCurrency,
      to_currency: toCurrency
    };
    
    const data = await makeRequest(params);
    return data['Realtime Currency Exchange Rate'] || {};
  },
  
  /**
   * Search for stock symbols
   * @param {string} keywords - Search keywords
   * @returns {Promise} - Search results
   */
  searchSymbols: async (keywords) => {
    const params = {
      function: 'SYMBOL_SEARCH',
      keywords
    };
    
    const data = await makeRequest(params);
    return data['bestMatches'] || [];
  },
  
  /**
   * Check if Alpha Vantage service is properly configured
   * @returns {boolean} - True if API key is configured
   */
  isConfigured: () => {
    return !!API_KEY;
  }
};

export default alphaVantageService;
