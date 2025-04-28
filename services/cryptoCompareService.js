import axios from "axios";
import logger from "../middleware/logger.js";
import { callWithRetry } from "../utils/apiHelper.js";

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
      throw new Error("CryptoCompare API key is not configured");
    }
  
    const apiKey = cryptoCompareService.getApiKey();
    const baseUrl = "https://min-api.cryptocompare.com/data";
    const url = `${baseUrl}/${endpoint}`;
    const queryParams = new URLSearchParams(params);
    const requestUrl = `${url}?${queryParams.toString()}`;
  
    try {
      const apiCall = () =>
        axios.get(requestUrl, {
          timeout: 10000,
          headers: {
            authorization: apiKey ? `Apikey ${apiKey}` : undefined,
            "User-Agent": "Financial Freedom Broker/1.0",
          },
        });
  
      const response = await callWithRetry(
        apiCall,
        {
          maxRetries: 3,
          retryDelay: 1000,
          timeout: 10000,
        },
        `cryptocompare-${endpoint}`,
      );
  
      // More thorough check for API errors
      if (response.data) {
        if (response.data.Response === "Error") {
          const apiError = new Error(response.data.Message || "CryptoCompare API error");
          apiError.isApiError = true;
          apiError.code = response.data.Type || 'UNKNOWN';
          apiError.apiResponse = response.data;
          logger.error(`CryptoCompare API error for ${endpoint}:`, {
            message: response.data.Message,
            code: response.data.Type,
            params
          });
          throw apiError;
        }
        
        // Check if response has expected format
        if (!response.data.hasOwnProperty('Response') && !response.data.hasOwnProperty('Data') && 
            Object.keys(response.data).length === 0) {
          const emptyError = new Error("Empty or unexpected response from CryptoCompare API");
          emptyError.isApiError = true;
          emptyError.apiResponse = response.data;
          logger.error(`CryptoCompare unexpected response for ${endpoint}:`, response.data);
          throw emptyError;
        }
      }
  
      return response.data;
    } catch (error) {
      // If it's already a handled API error, just rethrow it
      if (error.isApiError) {
        throw error;
      }
      
      // More specific network error handling
      if (axios.isAxiosError(error)) {
        const networkError = new Error(`Network error when calling CryptoCompare API: ${error.message}`);
        networkError.isNetworkError = true;
        networkError.originalError = error;
        
        if (error.code === 'ECONNABORTED') {
          networkError.message = `Timeout when calling CryptoCompare API: ${endpoint}`;
          networkError.isTimeout = true;
        } else if (!error.response) {
          networkError.message = `Network error when calling CryptoCompare API: ${error.message}`;
        } else {
          networkError.status = error.response.status;
          networkError.message = `HTTP ${error.response.status} error from CryptoCompare API: ${error.message}`;
        }
        
        logger.error(`CryptoCompare network error for ${endpoint}:`, {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          params
        });
        throw networkError;
      }
      
      // Other unexpected errors
      logger.error(`Unexpected error in CryptoCompare service for ${endpoint}:`, error);
      throw new Error(`Unexpected error in CryptoCompare service: ${error.message}`);
    }
  },

  /**
   * Get price for a cryptocurrency (simpler interface used by marketDataService)
   * @param {string} fromSymbol - From symbol (e.g., BTC)
   * @param {string} toSymbol - To symbol (e.g., USD)
   * @returns {Promise<number>} Price value
   */
  getPrice: async (fromSymbol, toSymbol = 'USD') => {
    const result = await cryptoCompareService.getCurrentPrice(fromSymbol, toSymbol);
    if (result && result[toSymbol]) {
      return result[toSymbol];
    }
    throw new Error(`Price not available for ${fromSymbol}/${toSymbol}`);
  },

  /**
   * Get current price for a cryptocurrency
   * @param {string} fromSymbol - From symbol (e.g., BTC)
   * @param {string|Array} toSymbols - To symbol(s) (e.g., USD or ['USD', 'EUR'])
   * @returns {Promise<Object>} Price data
   */
  getCurrentPrice: async (fromSymbol, toSymbols) => {
    const toSymbolsStr = Array.isArray(toSymbols)
      ? toSymbols.join(",")
      : toSymbols;

    return await cryptoCompareService.executeRequest("price", {
      fsym: fromSymbol,
      tsyms: toSymbolsStr,
    });
  },

  /**
   * Get current prices for multiple cryptocurrencies
   * @param {Array} fromSymbols - From symbols array
   * @param {Array} toSymbols - To symbols array
   * @returns {Promise<Object>} Price data
   */
  getMultipleCurrentPrices: async (fromSymbols, toSymbols) => {
    const fromSymbolsStr = Array.isArray(fromSymbols)
      ? fromSymbols.join(",")
      : fromSymbols;
    const toSymbolsStr = Array.isArray(toSymbols)
      ? toSymbols.join(",")
      : toSymbols;

    return await cryptoCompareService.executeRequest("pricemulti", {
      fsyms: fromSymbolsStr,
      tsyms: toSymbolsStr,
    });
  },

  /**
   * Get price with full data
   * @param {string} fromSymbol - From symbol
   * @param {string} toSymbol - To symbol
   * @returns {Promise<Object>} Full price data
   */
  getPriceWithFullData: async (fromSymbol, toSymbol) => {
    return await cryptoCompareService.executeRequest("pricemultifull", {
      fsyms: fromSymbol,
      tsyms: toSymbol,
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
    return await cryptoCompareService.executeRequest("histoday", {
      fsym: fromSymbol,
      tsym: toSymbol,
      limit,
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
    return await cryptoCompareService.executeRequest("histohour", {
      fsym: fromSymbol,
      tsym: toSymbol,
      limit,
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
  getHistoricalMinuteData: async (
    fromSymbol,
    toSymbol,
    limit = 60,
    aggregate = 1,
  ) => {
    return await cryptoCompareService.executeRequest("histominute", {
      fsym: fromSymbol,
      tsym: toSymbol,
      limit,
      aggregate,
    });
  },

  /**
   * Get top cryptocurrencies by market cap
   * @param {number} limit - Number of results
   * @param {string} tsym - To symbol (e.g., USD)
   * @returns {Promise<Object>} Top cryptocurrencies
   */
  getTopCryptocurrencies: async (limit = 10, tsym = "USD") => {
    return await cryptoCompareService.executeRequest("top/mktcapfull", {
      limit,
      tsym,
    });
  },

  /**
   * Get news for cryptocurrencies
   * @param {string} categories - Categories to filter by
   * @param {number} limit - Number of results
   * @returns {Promise<Object>} News articles
   */
  getNews: async (categories = "", limit = 10) => {
    return await cryptoCompareService.executeRequest("v2/news/", {
      categories,
      lTs: Math.floor(Date.now() / 1000) - 86400 * 7, // Last 7 days
      sortOrder: "popular",
      lang: "EN",
      extraParams: "FinancialFreedomBroker",
    });
  },

  /**
   * Get historical data with appropriate interval
   * @param {string} fromSymbol - From symbol (e.g., BTC)
   * @param {string} toSymbol - To symbol (e.g., USD) 
   * @param {string} interval - Interval string (e.g., "1h", "1d", "5m")
   * @param {number} limit - Number of data points
   * @returns {Promise<Array>} Historical data points
   */
  getHistoricalData: async (fromSymbol, toSymbol = 'USD', interval = '1h', limit = 100) => {
    try {
      // Extract number and unit from interval (e.g., "1h" -> 1, "h")
      const match = interval.match(/^(\d+)([mhdwM])$/);
      if (!match) {
        throw new Error(`Invalid interval format: ${interval}`);
      }
      
      const [, value, unit] = match;
      const numValue = parseInt(value, 10);
      
      let result;
      
      switch(unit) {
        case 'm': // minutes
          result = await cryptoCompareService.getHistoricalMinuteData(
            fromSymbol, 
            toSymbol, 
            limit, 
            numValue // Use the number as aggregate (e.g., 5m = aggregate 5)
          );
          break;
        
        case 'h': // hours
          if (numValue === 1) {
            result = await cryptoCompareService.getHistoricalHourlyData(
              fromSymbol, 
              toSymbol, 
              limit
            );
          } else {
            // For intervals like 4h, use hourly data with aggregation
            result = await cryptoCompareService.executeRequest("histohour", {
              fsym: fromSymbol,
              tsym: toSymbol,
              limit,
              aggregate: numValue
            });
          }
          break;
        
        case 'd': // days
          if (numValue === 1) {
            result = await cryptoCompareService.getHistoricalDailyData(
              fromSymbol, 
              toSymbol, 
              limit
            );
          } else {
            // For intervals like 3d, use daily data with aggregation
            result = await cryptoCompareService.executeRequest("histoday", {
              fsym: fromSymbol,
              tsym: toSymbol,
              limit,
              aggregate: numValue
            });
          }
          break;
        
        case 'w': // weeks
          // Use daily data with aggregation
          result = await cryptoCompareService.executeRequest("histoday", {
            fsym: fromSymbol,
            tsym: toSymbol,
            limit,
            aggregate: numValue * 7 // Convert weeks to days
          });
          break;
        
        case 'M': // months
          // Use daily data with aggregation, approximating a month as 30 days
          result = await cryptoCompareService.executeRequest("histoday", {
            fsym: fromSymbol,
            tsym: toSymbol,
            limit,
            aggregate: numValue * 30 // Approximate months
          });
          break;
        
        default:
          throw new Error(`Unsupported interval unit: ${unit}`);
      }
      
      if (result && result.Data) {
        return result.Data;
      } else {
        logger.warn(`No historical data returned for ${fromSymbol}/${toSymbol} with interval ${interval}`);
        return [];
      }
    } catch (error) {
      logger.error(`Error getting historical data for ${fromSymbol}/${toSymbol}:`, error.message);
      throw error;
    }
  },
};

export default cryptoCompareService;
