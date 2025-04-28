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
      if (config.marketData.useMockData) {
        throw new Error("Using mock data by configuration");
      }
      
      const baseUrl = config.binance.useTestnet 
        ? config.binance.testnetUrl 
        : config.binance.baseUrl;
      
      const url = `${baseUrl}${path}`;
      
      const response = await axios.get(url, {
        params,
        headers: {
          "X-MBX-APIKEY": process.env.BINANCE_API_KEY
        },
        timeout: 5000 // 5 second timeout to fail faster
      });
      
      return response.data;
    } catch (error) {
      // Log the error but don't throw - we'll handle it in the specific methods
      logger.error(
        `Error making public request to ${path}:`,
        error.response?.data || error.message,
      );
      
      // Re-throw the error to be handled by the specific methods
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

      // Determine which URL to use (main API or testnet)
      const baseUrl = config.binance.useTestnet 
        ? config.binance.testnetUrl 
        : config.binance.baseUrl;
      
      const url = `${baseUrl}${path}`;
      
      const headers = {
        "X-MBX-APIKEY": process.env.BINANCE_API_KEY
      };

      let response;
      if (method === "GET") {
        response = await axios.get(url, {
          params: queryParams,
          headers,
          timeout: 10000 // 10 second timeout
        });
      } else if (method === "POST") {
        response = await axios.post(url, null, {
          params: queryParams,
          headers,
          timeout: 10000
        });
      } else if (method === "DELETE") {
        response = await axios.delete(url, {
          params: queryParams,
          headers,
          timeout: 10000
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
   * Get price for a trading pair
   * @param {string} symbol - Trading pair symbol
   * @returns {Promise<Object>} Price object
   */
  getPrice: async (symbol) => {
    try {
      if (!binanceService.isConfigured()) {
        const configError = new Error("Binance API not configured");
        configError.isConfigError = true;
        logger.warn("Binance API not properly configured");
        throw configError;
      }

      const response = await binanceService.makePublicRequest('/api/v3/ticker/price', { symbol });
      if (!response || !response.price) {
        throw new Error(`Invalid price response for ${symbol}`);
      }
      
      logger.debug(`Binance price for ${symbol}: ${response.price}`);
      return response;
    } catch (error) {
      logger.error(`Error fetching price from Binance for ${symbol}:`, error);
      
      if (error.response) {
        const statusCode = error.response.status;
        
        if (statusCode === 429) {
          error.isRateLimitError = true;
          error.message = `Rate limit exceeded for Binance API: ${symbol}`;
        } else if (statusCode === 400) {
          error.isInvalidRequestError = true;
          error.message = `Invalid request to Binance API for symbol: ${symbol}`;
        } else if (statusCode >= 500) {
          error.isServerError = true;
          error.message = `Binance server error (${statusCode}) for symbol: ${symbol}`;
        }
      } else if (error.code === 'ECONNABORTED') {
        error.isTimeoutError = true;
        error.message = `Timeout while connecting to Binance API for ${symbol}`;
      } else if (!error.isConfigError) {
        error.isNetworkError = true;
        error.message = `Network error calling Binance API for ${symbol}: ${error.message}`;
      }
      
      throw error;
    }
  },

  /**
   * Get order book for a trading pair
   * @param {string} symbol - Trading pair symbol (e.g., BTCUSDT)
   * @param {number} limit - Depth of the order book
   * @returns {Promise<Object>} - Order book data
   */
  getOrderBook: async (symbol, limit) => {
    try {
      const formattedSymbol = symbol.replace('/', '');
      const result = await binanceService.makePublicRequest("/api/v3/depth", { 
        symbol: formattedSymbol, 
        limit 
      });
      return result;
    } catch (error) {
      // Return a mock orderbook as fallback
      logger.warn(`Using fallback mock orderbook for ${symbol}`);
      
      // Create mock data with reasonable values
      const mockOrderBook = {
        lastUpdateId: Date.now(),
        bids: [],
        asks: []
      };
      
      // Generate some mock bids and asks
      const basePrice = symbol.includes('BTC') ? 37000 : 1;
      
      for (let i = 0; i < 10; i++) {
        // Bids slightly below base price
        mockOrderBook.bids.push([
          (basePrice - (i * 50)).toFixed(2),
          (1 / (i + 1)).toFixed(6)
        ]);
        
        // Asks slightly above base price
        mockOrderBook.asks.push([
          (basePrice + (i * 50)).toFixed(2),
          (1 / (i + 1)).toFixed(6)
        ]);
      }
      
      return mockOrderBook;
    }
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
    try {
      const formattedSymbol = symbol.replace('/', '');
      return await binanceService.makePublicRequest("/api/v3/depth", { symbol: formattedSymbol, limit });
    } catch (error) {
      // Return a mock orderbook as fallback
      logger.warn(`Using fallback mock orderbook for ${symbol}: ${error.message}`);
      
      // Create mock data with reasonable values
      const mockOrderBook = {
        lastUpdateId: Date.now(),
        bids: [],
        asks: []
      };
      
      // Generate some mock bids and asks
      let basePrice;
      if (symbol.includes('BTC')) basePrice = 47000;
      else if (symbol.includes('ETH')) basePrice = 3000;
      else if (symbol.includes('BNB')) basePrice = 400;
      else basePrice = 10;
      
      for (let i = 0; i < limit; i++) {
        // Bids slightly below base price (0.1% increments)
        mockOrderBook.bids.push([
          (basePrice * (1 - 0.001 * i)).toFixed(2),
          (Math.random() * 2 + 0.1).toFixed(6)
        ]);
        
        // Asks slightly above base price (0.1% increments)
        mockOrderBook.asks.push([
          (basePrice * (1 + 0.001 * i)).toFixed(2),
          (Math.random() * 2 + 0.1).toFixed(6)
        ]);
      }
      
      return mockOrderBook;
    }
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
   * @returns {Promise<Object>} - Order response
   */
  createOrder: async (orderParams) => {
    try {
      if (!binanceService.isConfigured()) {
        throw new Error("Binance API is not configured with valid API keys");
      }
      
      if (!orderParams || !orderParams.symbol) {
        throw new Error("Invalid order parameters: symbol is required");
      }
      
      // Format the symbol if it contains a slash
      if (orderParams.symbol.includes('/')) {
        orderParams.symbol = orderParams.symbol.replace('/', '');
      }

      // Validate essential parameters
      if (!orderParams.side || !['BUY', 'SELL'].includes(orderParams.side.toUpperCase())) {
        throw new Error("Order side must be either 'BUY' or 'SELL'");
      }
      
      if (!orderParams.type) {
        throw new Error("Order type is required");
      }

      // Ensure quantity is a string for Binance API
      if (typeof orderParams.quantity === 'number') {
        orderParams.quantity = orderParams.quantity.toString();
      }

      // Ensure price is a string for Binance API (for limit orders)
      if (orderParams.price && typeof orderParams.price === 'number') {
        orderParams.price = orderParams.price.toString();
      }

      // Standardize parameters
      const standardizedParams = {
        ...orderParams,
        side: orderParams.side.toUpperCase(),
        type: orderParams.type.toUpperCase()
      };

      logger.debug('Placing order with Binance:', standardizedParams);
      
      const response = await binanceService.makeAuthenticatedRequest(
        "POST", 
        "/api/v3/order", 
        standardizedParams
      );
      
      logger.info(`Successfully placed ${orderParams.side} order for ${orderParams.symbol}`, {
        orderId: response.orderId,
        symbol: response.symbol,
        side: response.side,
        type: response.type,
        status: response.status
      });
      
      return response;
    } catch (error) {
      // Log specific error details
      const errorMsg = error.response?.data?.msg || error.message;
      const errorCode = error.response?.data?.code;
      
      logger.error(`Failed order creation for ${orderParams?.symbol || 'unknown symbol'}`, {
        error: errorMsg,
        code: errorCode,
        params: orderParams
      });
      
      // Provide more specific error message based on common Binance error codes
      let userFriendlyError;
      
      if (errorCode === -2010 || errorMsg.includes('insufficient balance')) {
        userFriendlyError = `Insufficient balance for ${orderParams.side} order of ${orderParams.symbol}`;
      } else if (errorCode === -1121) {
        userFriendlyError = `Invalid symbol: ${orderParams.symbol}`;
      } else if (errorCode === -1100 || errorCode === -1111) {
        userFriendlyError = `Invalid order parameters: ${errorMsg}`;
      } else {
        userFriendlyError = `Order creation failed: ${errorMsg}`;
      }
      
      throw new Error(userFriendlyError);
    }
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
