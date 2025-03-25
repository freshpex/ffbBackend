import axios from 'axios';
import crypto from 'crypto';
import logger from '../middleware/logger.js';

class BinanceService {
  constructor() {
    this.baseUrl = 'https://api.binance.com';
    this.testUrl = 'https://testnet.binance.vision';
    this.wsUrl = 'wss://stream.binance.com:9443/ws';
    this.testWsUrl = 'wss://testnet.binance.vision/ws';
    
    // Use test environment in development
    this.useTestnet = process.env.NODE_ENV !== 'production';
    
    // Create axios instance with defaults
    this.httpClient = axios.create({
      baseURL: this.useTestnet ? this.testUrl : this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-MBX-APIKEY': '' // This will be set per-request
      }
    });
    
    // Setup response interceptor for error handling
    this.httpClient.interceptors.response.use(
      response => response,
      error => this.handleApiError(error)
    );
  }
  
  // Handle API errors in a consistent way
  handleApiError(error) {
    if (error.response) {
      // The request was made and the server responded with an error status
      logger.error('Binance API error:', {
        status: error.response.status,
        data: error.response.data,
        endpoint: error.config.url
      });
      
      const errorObj = new Error(`Binance API error: ${error.response.status}`);
      errorObj.code = error.response.status;
      errorObj.data = error.response.data;
      errorObj.endpoint = error.config.url;
      return Promise.reject(errorObj);
    } else if (error.request) {
      // The request was made but no response was received
      logger.error('Binance API no response:', {
        request: error.request._currentUrl,
        method: error.config.method
      });
      return Promise.reject(new Error('No response from Binance API'));
    } else {
      // Something happened in setting up the request
      logger.error('Binance API request error:', error.message);
      return Promise.reject(new Error(`Error setting up Binance request: ${error.message}`));
    }
  }
  
  // Generate signature for authenticated requests
  generateSignature(queryString, apiSecret) {
    return crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');
  }
  
  // Helper to add timestamp and signature to query params
  signRequest(params, apiSecret) {
    const timestamp = Date.now();
    let queryString = `timestamp=${timestamp}`;
    
    // Add other params to query string
    for (const key in params) {
      if (params[key] !== undefined) {
        queryString += `&${key}=${params[key]}`;
      }
    }
    
    const signature = this.generateSignature(queryString, apiSecret);
    return `${queryString}&signature=${signature}`;
  }
  
  // Public API methods (no authentication needed)
  async getExchangeInfo() {
    try {
      const response = await this.httpClient.get('/api/v3/exchangeInfo');
      return response.data;
    } catch (error) {
      logger.error('Failed to get exchange info:', error);
      throw error;
    }
  }
  
  async getMarketPrice(symbol) {
    try {
      const response = await this.httpClient.get('/api/v3/ticker/price', {
        params: { symbol }
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get market price for ${symbol}:`, error);
      throw error;
    }
  }
  
  async getKlines(symbol, interval, limit = 500) {
    try {
      const response = await this.httpClient.get('/api/v3/klines', {
        params: { symbol, interval, limit }
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to get klines for ${symbol}:`, error);
      throw error;
    }
  }
  
  // Private API methods (authentication needed)
  async getAccountInfo(apiKey, apiSecret) {
    try {
      const queryString = this.signRequest({}, apiSecret);
      
      const response = await this.httpClient.get(`/api/v3/account?${queryString}`, {
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get account info:', error);
      throw error;
    }
  }
  
  async createOrder(apiKey, apiSecret, orderData) {
    try {
      // Required parameters for order placement
      const { symbol, side, type, quantity } = orderData;
      
      if (!symbol || !side || !type || !quantity) {
        throw new Error('Missing required order parameters');
      }
      
      // Prepare order parameters
      const params = {
        symbol,
        side,
        type,
        quantity,
        timeInForce: orderData.timeInForce || 'GTC',
        price: orderData.price,
        newClientOrderId: orderData.newClientOrderId,
        newOrderRespType: 'FULL'
      };
      
      // Remove undefined values
      Object.keys(params).forEach(key => 
        params[key] === undefined && delete params[key]
      );
      
      // Sign the request
      const queryString = this.signRequest(params, apiSecret);
      
      // Make the API call
      const response = await this.httpClient.post(`/api/v3/order?${queryString}`, null, {
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to create order:', error);
      throw error;
    }
  }
  
  async cancelOrder(apiKey, apiSecret, symbol, orderId) {
    try {
      const params = { symbol, orderId };
      const queryString = this.signRequest(params, apiSecret);
      
      const response = await this.httpClient.delete(`/api/v3/order?${queryString}`, {
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to cancel order ${orderId}:`, error);
      throw error;
    }
  }
  
  async getOpenOrders(apiKey, apiSecret, symbol) {
    try {
      const params = symbol ? { symbol } : {};
      const queryString = this.signRequest(params, apiSecret);
      
      const response = await this.httpClient.get(`/api/v3/openOrders?${queryString}`, {
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get open orders:', error);
      throw error;
    }
  }
  
  // Formatted price ticker with additional data for frontend consumption
  async getFormattedTickers(symbols = []) {
    try {
      let response;
      
      if (symbols.length === 0) {
        // Get all tickers
        response = await this.httpClient.get('/api/v3/ticker/24hr');
      } else {
        // Get specific symbols
        const symbolsParam = symbols.join('","');
        response = await this.httpClient.get('/api/v3/ticker/24hr', {
          params: { symbols: `["${symbolsParam}"]` }
        });
      }
      
      // Format for frontend consumption
      return response.data.map(ticker => ({
        symbol: ticker.symbol,
        lastPrice: parseFloat(ticker.lastPrice),
        priceChange: parseFloat(ticker.priceChange),
        priceChangePercent: parseFloat(ticker.priceChangePercent),
        highPrice: parseFloat(ticker.highPrice),
        lowPrice: parseFloat(ticker.lowPrice),
        volume: parseFloat(ticker.volume),
        quoteVolume: parseFloat(ticker.quoteVolume),
        updatedAt: new Date().toISOString()
      }));
    } catch (error) {
      logger.error('Failed to get formatted tickers:', error);
      throw error;
    }
  }
}

export default new BinanceService();
