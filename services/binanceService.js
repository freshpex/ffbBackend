import axios from 'axios';
import crypto from 'crypto';
import logger from '../middleware/logger.js';
import config from '../config/config.js';

// Initialize with config values
const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;
const BASE_URL = process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3';

const generateSignature = (queryParams) => {
  const queryString = Object.keys(queryParams)
    .map(key => `${key}=${queryParams[key]}`)
    .join('&');
  
  return crypto
    .createHmac('sha256', API_SECRET)
    .update(queryString)
    .digest('hex');
};

const makeAuthenticatedRequest = async (endpoint, method = 'GET', params = {}) => {
  try {
    const timestamp = Date.now();
    const queryParams = {
      ...params,
      timestamp,
      recvWindow: 60000, // Valid for 60 seconds
    };
    
    // Generate signature
    const signature = generateSignature(queryParams);
    queryParams.signature = signature;
    
    // Build query string
    const queryString = Object.keys(queryParams)
      .map(key => `${key}=${encodeURIComponent(queryParams[key])}`)
      .join('&');
    
    // Make request
    const url = `${BASE_URL}${endpoint}${method === 'GET' ? '?' + queryString : ''}`;
    
    const headers = {
      'X-MBX-APIKEY': API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    
    let response;
    if (method === 'GET') {
      response = await axios.get(url, { headers });
    } else if (method === 'POST') {
      response = await axios.post(url, queryString, { headers });
    } else if (method === 'DELETE') {
      response = await axios.delete(url, {
        headers,
        params: queryParams
      });
    }
    
    return response.data;
  } catch (error) {
    logger.error(`Error making authenticated request to ${endpoint}:`, error.response?.data || error.message);
    throw new Error(`Binance API Error: ${error.response?.data?.msg || error.message}`);
  }
};

const makePublicRequest = async (endpoint, params = {}) => {
  try {
    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');
    
    const url = `${BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    logger.error(`Error making public request to ${endpoint}:`, error.response?.data || error.message);
    throw new Error(`Binance API Error: ${error.response?.data?.msg || error.message}`);
  }
};

/**
 * Binance service for market data and trading
 */
const binanceService = {
  /**
   * Get 24-hour ticker for a symbol
   * @param {string} symbol - The trading symbol (e.g., BTCUSDT)
   * @returns {Promise} - The ticker data
   */
  get24hrTicker: async (symbol) => {
    const endpoint = '/ticker/24hr';
    const params = symbol ? { symbol } : {};
    return makePublicRequest(endpoint, params);
  },
  
  /**
   * Get ticker price for a symbol
   * @param {string} symbol - The trading symbol (e.g., BTCUSDT)
   * @returns {Promise} - The current price
   */
  getTickerPrice: async (symbol) => {
    const endpoint = '/ticker/price';
    const params = symbol ? { symbol } : {};
    return makePublicRequest(endpoint, params);
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
    const endpoint = '/klines';
    const { symbol, interval = '1h', limit = 500, startTime, endTime } = options;
    
    const params = { symbol, interval, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    
    return makePublicRequest(endpoint, params);
  },
  
  /**
   * Get exchange information
   * @returns {Promise} - Exchange info
   */
  getExchangeInfo: async () => {
    const endpoint = '/exchangeInfo';
    return makePublicRequest(endpoint);
  },
  
  /**
   * Get order book for a symbol
   * @param {string} symbol - The trading symbol
   * @param {number} limit - Depth of order book (default 100)
   * @returns {Promise} - Order book data
   */
  getDepth: async (symbol, limit = 100) => {
    const endpoint = '/depth';
    const params = { symbol, limit };
    return makePublicRequest(endpoint, params);
  },
  
  /**
   * Get recent trades for a symbol
   * @param {string} symbol - The trading symbol
   * @param {number} limit - The number of trades to return
   * @returns {Promise} - Recent trades data
   */
  getTrades: async (symbol, limit = 50) => {
    const endpoint = '/trades';
    const params = { symbol, limit };
    return makePublicRequest(endpoint, params);
  },
  
  /**
   * Get account information and balances
   * @returns {Promise} - Account information
   */
  getAccountInfo: async () => {
    const endpoint = '/account';
    return makeAuthenticatedRequest(endpoint, 'GET');
  },
  
  /**
   * Place a new order
   * @param {Object} orderParams - Order parameters
   * @param {string} orderParams.symbol - Symbol to trade (e.g., BTCUSDT)
   * @param {string} orderParams.side - Order side: BUY or SELL
   * @param {string} orderParams.type - Order type: LIMIT, MARKET, STOP_LOSS, etc.
   * @param {string} orderParams.timeInForce - Time in force: GTC, IOC, FOK
   * @param {number} orderParams.quantity - Order quantity
   * @param {number} orderParams.price - Order price (for limit orders)
   * @param {string} orderParams.newClientOrderId - Custom client order ID
   * @returns {Promise} - Order response
   */
  placeOrder: async (orderParams) => {
    const endpoint = '/order';
    
    // Validate required parameters based on order type
    if (!orderParams.symbol || !orderParams.side || !orderParams.type) {
      throw new Error('Missing required order parameters: symbol, side, or type');
    }
    
    // Convert side to uppercase
    orderParams.side = orderParams.side.toUpperCase();
    
    // Convert type to uppercase
    orderParams.type = orderParams.type.toUpperCase();
    
    // Set default timeInForce for LIMIT orders
    if (orderParams.type === 'LIMIT' && !orderParams.timeInForce) {
      orderParams.timeInForce = 'GTC'; // Good Till Cancelled
    }
    
    // For MARKET orders, we don't need price
    if (orderParams.type === 'MARKET' && orderParams.price) {
      delete orderParams.price;
    }
    
    // Use the provided newClientOrderId or generate one
    if (!orderParams.newClientOrderId) {
      orderParams.newClientOrderId = `ffb_${Date.now()}`;
    }
    
    return makeAuthenticatedRequest(endpoint, 'POST', orderParams);
  },
  
  /**
   * Cancel an order
   * @param {string} symbol - Symbol (e.g., BTCUSDT)
   * @param {string|number} orderId - Order ID to cancel
   * @returns {Promise} - Cancel response
   */
  cancelOrder: async (symbol, orderId) => {
    const endpoint = '/order';
    const params = { symbol, orderId };
    return makeAuthenticatedRequest(endpoint, 'DELETE', params);
  },
  
  /**
   * Cancel an order by client order ID
   * @param {string} symbol - Symbol (e.g., BTCUSDT)
   * @param {string} origClientOrderId - Original client order ID
   * @returns {Promise} - Cancel response
   */
  cancelOrderByClientId: async (symbol, origClientOrderId) => {
    const endpoint = '/order';
    const params = { symbol, origClientOrderId };
    return makeAuthenticatedRequest(endpoint, 'DELETE', params);
  },
  
  /**
   * Get all open orders
   * @param {string} symbol - Optional symbol to filter by
   * @returns {Promise} - Open orders
   */
  getOpenOrders: async (symbol) => {
    const endpoint = '/openOrders';
    const params = symbol ? { symbol } : {};
    return makeAuthenticatedRequest(endpoint, 'GET', params);
  },
  
  /**
   * Get order status
   * @param {string} symbol - Symbol (e.g., BTCUSDT)
   * @param {string|number} orderId - Order ID
   * @returns {Promise} - Order info
   */
  getOrder: async (symbol, orderId) => {
    const endpoint = '/order';
    const params = { symbol, orderId };
    return makeAuthenticatedRequest(endpoint, 'GET', params);
  },
  
  /**
   * Get order status by client order ID
   * @param {string} symbol - Symbol (e.g., BTCUSDT)
   * @param {string} origClientOrderId - Client order ID
   * @returns {Promise} - Order info
   */
  getOrderByClientId: async (symbol, origClientOrderId) => {
    const endpoint = '/order';
    const params = { symbol, origClientOrderId };
    return makeAuthenticatedRequest(endpoint, 'GET', params);
  },
  
  /**
   * Get all account orders for a symbol
   * @param {string} symbol - Symbol (e.g., BTCUSDT)
   * @param {number} limit - Max number of orders to return
   * @returns {Promise} - Account orders
   */
  getAllOrders: async (symbol, limit = 500) => {
    const endpoint = '/allOrders';
    const params = { symbol, limit };
    return makeAuthenticatedRequest(endpoint, 'GET', params);
  },
  
  /**
   * Check if the Binance service is properly configured
   * @returns {boolean} - True if API keys are set
   */
  isConfigured: () => {
    return !!API_KEY && !!API_SECRET;
  }
};

export default binanceService;
