import axios from "axios";
import crypto from "crypto";
import logger from "../middleware/logger.js";
import config from "../config/config.js";

/**
 * Binance service for market data and trading
 */
const binanceService = {
  /**
   * Check if the Binance service is properly configured
   * @returns {boolean} - True if API keys are set
   */
  isConfigured: () => {
    return !!process.env.BINANCE_API_KEY && !!process.env.BINANCE_API_SECRET;
  },

  /**
   * Make a public request to Binance API (no authentication required)
   * @param {string} path - API path
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} - API response data
   */
  makePublicRequest: async (path, params = {}) => {
    try {
      const url = `https://api.binance.com${path}`;
      
      const response = await axios.get(url, {
        params,
        headers: {
          "X-MBX-APIKEY": process.env.BINANCE_API_KEY
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error(
        `Error making public request to ${path}:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Binance API Error: ${error.response?.data?.msg || error.message}`,
      );
    }
  },

  /**
   * Make an authenticated request to Binance API
   * @param {string} method - HTTP method (GET, POST, DELETE)
   * @param {string} path - API path
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} - API response data
   */
  makeAuthenticatedRequest: async (method, path, params = {}) => {
    try {
      if (!binanceService.isConfigured()) {
        throw new Error("Binance API is not configured");
      }

      const timestamp = Date.now();
      const queryParams = {
        ...params,
        timestamp
      };

      // Generate signature
      const queryString = Object.keys(queryParams)
        .map((key) => `${key}=${queryParams[key]}`)
        .join("&");

      const signature = crypto
        .createHmac("sha256", process.env.BINANCE_API_SECRET)
        .update(queryString)
        .digest("hex");

      queryParams.signature = signature;

      const url = `https://api.binance.com${path}`;
      const headers = {
        "X-MBX-APIKEY": process.env.BINANCE_API_KEY
      };

      let response;
      if (method === "GET") {
        response = await axios.get(url, {
          params: queryParams,
          headers
        });
      } else if (method === "POST") {
        response = await axios.post(url, null, {
          params: queryParams,
          headers
        });
      } else if (method === "DELETE") {
        response = await axios.delete(url, {
          params: queryParams,
          headers
        });
      }

      return response.data;
    } catch (error) {
      logger.error(
        `Error making authenticated request to ${path}:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Binance API Error: ${error.response?.data?.msg || error.message}`,
      );
    }
  },

  /**
   * Get current price for a symbol
   * @param {string} symbol - Trading pair symbol (e.g., BTCUSDT)
   * @returns {Promise<Object>} - Price data
   */
  getPrice: async (symbol) => {
    return binanceService.makePublicRequest("/api/v3/ticker/price", { symbol });
  },

  /**
   * Get order book for a trading pair
   * @param {string} symbol - Trading pair symbol (e.g., BTCUSDT)
   * @param {number} limit - Depth of the order book
   * @returns {Promise<Object>} - Order book data
   */
  getOrderBook: async (symbol, limit) => {
    return binanceService.makePublicRequest("/api/v3/depth", { symbol, limit });
  },

  /**
   * Get 24-hour ticker for a symbol
   * @param {string} symbol - The trading symbol (e.g., BTCUSDT)
   * @returns {Promise} - The ticker data
   */
  get24hrTicker: async (symbol) => {
    const endpoint = "/api/v3/ticker/24hr";
    const params = symbol ? { symbol } : {};
    return binanceService.makePublicRequest(endpoint, params);
  },

  /**
   * Get ticker price for a symbol
   * @param {string} symbol - The trading symbol (e.g., BTCUSDT)
   * @returns {Promise} - The current price
   */
  getTickerPrice: async (symbol) => {
    const endpoint = "/api/v3/ticker/price";
    const params = symbol ? { symbol } : {};
    return binanceService.makePublicRequest(endpoint, params);
  },

  /**
   * Get klines (candlestick) data
   * @param {Object} options - Options for klines
   * @param {string} options.symbol - Symbol (e.g., BTCUSDT)
   * @param {string} options.interval - Candlestick interval (e.g., 1h)
   * @param {number} options.limit - Number of candles to return
   * @returns {Promise} - Klines data
   */
  getKlines: async (options) => {
    const endpoint = "/api/v3/klines";
    const {
      symbol,
      interval = "1h",
      limit = 500,
      startTime,
      endTime,
    } = options;

    const params = { symbol, interval, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    return binanceService.makePublicRequest(endpoint, params);
  },

  /**
   * Get exchange information
   * @returns {Promise} - Exchange info
   */
  getExchangeInfo: async () => {
    const endpoint = "/api/v3/exchangeInfo";
    return binanceService.makePublicRequest(endpoint);
  },

  /**
   * Get order book for a symbol
   * @param {string} symbol - The trading symbol
   * @param {number} limit - Depth of order book (default 100)
   * @returns {Promise} - Order book data
   */
  getDepth: async (symbol, limit = 100) => {
    const endpoint = "/api/v3/depth";
    const params = { symbol, limit };
    return binanceService.makePublicRequest(endpoint, params);
  },

  /**
   * Get recent trades for a symbol
   * @param {string} symbol - The trading symbol
   * @param {number} limit - The number of trades to return
   * @returns {Promise} - Recent trades data
   */
  getTrades: async (symbol, limit = 50) => {
    const endpoint = "/api/v3/trades";
    const params = { symbol, limit };
    return binanceService.makePublicRequest(endpoint, params);
  },

  /**
   * Get account information and balances
   * @returns {Promise} - Account information
   */
  getAccountInfo: async () => {
    return binanceService.makeAuthenticatedRequest("GET", "/api/v3/account", {});
  },

  /**
   * Place a new order
   * @param {Object} orderParams - Order parameters
   * @returns {Promise} - Order response
   */
  createOrder: async (orderParams) => {
    return binanceService.makeAuthenticatedRequest("POST", "/api/v3/order", orderParams);
  },

  /**
   * Cancel an order
   * @param {string} symbol - Symbol (e.g., BTCUSDT)
   * @param {string|number} orderId - Order ID to cancel
   * @returns {Promise} - Cancel response
   */
  cancelOrder: async (symbol, orderId) => {
    return binanceService.makeAuthenticatedRequest("DELETE", "/api/v3/order", { symbol, orderId });
  },

  /**
   * Get all open orders
   * @param {string} symbol - Optional symbol to filter by
   * @returns {Promise} - Open orders
   */
  getOpenOrders: async (symbol) => {
    const params = symbol ? { symbol } : {};
    return binanceService.makeAuthenticatedRequest("GET", "/api/v3/openOrders", params);
  },

  /**
   * Get order status
   * @param {string} symbol - Symbol (e.g., BTCUSDT)
   * @param {string|number} orderId - Order ID
   * @returns {Promise} - Order info
   */
  getOrder: async (symbol, orderId) => {
    const params = { symbol, orderId };
    return binanceService.makeAuthenticatedRequest("GET", "/api/v3/order", params);
  },

  /**
   * Get all account orders for a symbol
   * @param {string} symbol - Symbol (e.g., BTCUSDT)
   * @param {number} limit - Max number of orders to return
   * @returns {Promise} - Account orders
   */
  getAllOrders: async (symbol, limit = 500) => {
    const params = { symbol, limit };
    return binanceService.makeAuthenticatedRequest("GET", "/api/v3/allOrders", params);
  }
};

export default binanceService;
