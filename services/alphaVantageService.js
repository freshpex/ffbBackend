import axios from "axios";
import logger from "../middleware/logger.js";
import { callWithRetry } from "../utils/apiHelper.js";

/**
 * Alpha Vantage API Service
 * Provides access to Alpha Vantage APIs for stock market data
 */
const alphaVantageService = {
  /**
   * Check if this service is configured with API key
   * @returns {boolean} Whether the service is configured
   */
  isConfigured: () => {
    return !!process.env.ALPHA_VANTAGE_API_KEY;
  },

  /**
   * Get Alpha Vantage API key
   * @returns {string} API key from environment variables
   */
  getApiKey: () => {
    return process.env.ALPHA_VANTAGE_API_KEY;
  },

  /**
   * Execute an Alpha Vantage API request
   * @param {string} function - The API function to call
   * @param {Object} params - Additional parameters for the request
   * @returns {Promise<Object>} The API response
   */
  executeRequest: async (functionName, params = {}) => {
    if (!alphaVantageService.isConfigured()) {
      throw new Error("Alpha Vantage API key is not configured");
    }

    const API_KEY = alphaVantageService.getApiKey();
    const BASE_URL = "https://www.alphavantage.co/query";

    try {
      const apiCall = () =>
        axios.get(BASE_URL, {
          params: {
            ...params,
            function: functionName,
            apikey: API_KEY,
          },
          timeout: 10000,
        });

      const response = await callWithRetry(
        apiCall,
        {
          maxRetries: 3,
          retryDelay: 1000,
          timeout: 10000,
        },
        `alphavantage-${functionName}`
      );

      // Check for API errors
      if (response.data && response.data["Error Message"]) {
        throw new Error(response.data["Error Message"] || "Alpha Vantage API error");
      }

      if (response.data && response.data["Information"]) {
        logger.warn(`Alpha Vantage API message: ${response.data["Information"]}`);
      }

      return response.data;
    } catch (error) {
      logger.error(`Alpha Vantage API error for ${functionName}:`, error.message);
      throw error;
    }
  },

  /**
   * Get stock quote for a symbol
   * @param {string} symbol - Stock symbol (e.g., AAPL)
   * @returns {Promise<Object>} Stock quote data
   */
  getStockQuote: async (symbol) => {
    return await alphaVantageService.executeRequest("GLOBAL_QUOTE", {
      symbol,
    });
  },
  
  /**
   * Get quote data in a standardized format for marketDataService
   * @param {string} symbol - Stock symbol (e.g., AAPL)
   * @returns {Promise<Object>} Standardized quote data with price
   */
  getQuote: async (symbol) => {
    try {
      const quoteData = await alphaVantageService.getStockQuote(symbol);
      
      // Check if we got a valid response with "Global Quote"
      if (quoteData && quoteData["Global Quote"]) {
        const globalQuote = quoteData["Global Quote"];
        return {
          symbol: symbol,
          price: parseFloat(globalQuote["05. price"]),
          open: parseFloat(globalQuote["02. open"]),
          high: parseFloat(globalQuote["03. high"]),
          low: parseFloat(globalQuote["04. low"]),
          volume: parseFloat(globalQuote["06. volume"]),
          latestTradingDay: globalQuote["07. latest trading day"],
          previousClose: parseFloat(globalQuote["08. previous close"]),
          change: parseFloat(globalQuote["09. change"]),
          changePercent: globalQuote["10. change percent"]
        };
      }
      
      throw new Error(`Invalid response format for symbol ${symbol}`);
    } catch (error) {
      logger.error(`Error getting quote for ${symbol}:`, error.message);
      throw error;
    }
  },

  /**
   * Get daily time series data for a symbol
   * @param {string} symbol - Stock symbol (e.g., AAPL)
   * @param {boolean} compact - Whether to return compact data (defaults to true)
   * @returns {Promise<Object>} Time series data
   */
  getDailyTimeSeries: async (symbol, compact = true) => {
    return await alphaVantageService.executeRequest("TIME_SERIES_DAILY", {
      symbol,
      outputsize: compact ? "compact" : "full",
    });
  },

  /**
   * Get weekly time series data for a symbol
   * @param {string} symbol - Stock symbol (e.g., AAPL)
   * @returns {Promise<Object>} Weekly time series data
   */
  getWeeklyTimeSeries: async (symbol) => {
    return await alphaVantageService.executeRequest("TIME_SERIES_WEEKLY", {
      symbol,
    });
  },

  /**
   * Get monthly time series data for a symbol
   * @param {string} symbol - Stock symbol (e.g., AAPL)
   * @returns {Promise<Object>} Monthly time series data
   */
  getMonthlyTimeSeries: async (symbol) => {
    return await alphaVantageService.executeRequest("TIME_SERIES_MONTHLY", {
      symbol,
    });
  },

  /**
   * Get company overview for a symbol
   * @param {string} symbol - Stock symbol (e.g., AAPL)
   * @returns {Promise<Object>} Company overview data
   */
  getCompanyOverview: async (symbol) => {
    return await alphaVantageService.executeRequest("OVERVIEW", {
      symbol,
    });
  },

  /**
   * Search for stocks matching a keyword
   * @param {string} keywords - Search keywords
   * @returns {Promise<Object>} Search results
   */
  searchSymbol: async (keywords) => {
    return await alphaVantageService.executeRequest("SYMBOL_SEARCH", {
      keywords,
    });
  },
  
  /**
   * Get intraday time series data
   * @param {string} symbol - Stock symbol (e.g., AAPL)
   * @param {string} interval - Time interval (1min, 5min, 15min, 30min, 60min)
   * @param {boolean} compact - Whether to return compact data
   * @returns {Promise<Object>} Intraday time series data
   */
  getIntradayTimeSeries: async (symbol, interval = "5min", compact = true) => {
    return await alphaVantageService.executeRequest("TIME_SERIES_INTRADAY", {
      symbol,
      interval,
      outputsize: compact ? "compact" : "full",
    });
  },

  /**
   * Get sector performances
   * @returns {Promise<Object>} Sector performance data
   */
  getSectorPerformances: async () => {
    return await alphaVantageService.executeRequest("SECTOR");
  },

  /**
   * Get earnings calendar
   * @param {string} symbol - Optional stock symbol to filter by
   * @param {string} horizon - Time horizon (3month, 6month, 12month)
   * @returns {Promise<Object>} Earnings calendar data
   */
  getEarningsCalendar: async (symbol = null, horizon = "3month") => {
    const params = { horizon };
    if (symbol) {
      params.symbol = symbol;
    }
    return await alphaVantageService.executeRequest("EARNINGS_CALENDAR", params);
  },
};

export default alphaVantageService;
