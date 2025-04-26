import marketDataService from '../services/marketDataService.js';
import logger from '../middleware/logger.js';

/**
 * Market Controller
 * Handles requests for market data, charts, and trading information
 */
const marketController = {
  /**
   * Get market data for multiple symbols
   */
  getMarketData: async (req, res) => {
    try {
      const { symbols } = req.query;
      
      // Parse symbols from query string if present
      const symbolsArray = symbols ? 
        Array.isArray(symbols) ? symbols : symbols.split(',') : 
        [];
      
      const data = await marketDataService.getMarketData(symbolsArray);
      return res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error getting market data: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch market data',
        error: error.message
      });
    }
  },

  /**
   * Get current price and market data for a symbol
   */
  getCurrentPrice: async (req, res) => {
    try {
      const { symbol } = req.query;
      
      if (!symbol) {
        return res.status(400).json({
          success: false,
          message: 'Symbol parameter is required'
        });
      }
      
      const data = await marketDataService.getCurrentPrice(symbol);
      return res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error getting current price: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch market data',
        error: error.message
      });
    }
  },
  
  /**
   * Get historical price data for charts
   */
  getHistoricalPrices: async (req, res) => {
    try {
      const { symbol, interval = '1d', limit = 100 } = req.query;
      
      if (!symbol) {
        return res.status(400).json({
          success: false,
          message: 'Symbol parameter is required'
        });
      }
      
      const data = await marketDataService.getHistoricalPrices(symbol, interval, parseInt(limit));
      return res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error getting historical prices: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch historical prices',
        error: error.message
      });
    }
  },
  
  /**
   * Get order book for a symbol
   */
  getOrderBook: async (req, res) => {
    try {
      const { symbol, depth = 20 } = req.query;
      
      if (!symbol) {
        return res.status(400).json({
          success: false,
          message: 'Symbol parameter is required'
        });
      }
      
      const data = await marketDataService.getOrderBook(symbol, parseInt(depth));
      return res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error getting order book: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch order book data',
        error: error.message
      });
    }
  },
  
  /**
   * Get recent trades for a symbol
   */
  getRecentTrades: async (req, res) => {
    try {
      const { symbol, limit = 50 } = req.query;
      
      if (!symbol) {
        return res.status(400).json({
          success: false,
          message: 'Symbol parameter is required'
        });
      }
      
      const data = await marketDataService.getRecentTrades(symbol, parseInt(limit));
      return res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error getting recent trades: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch recent trades',
        error: error.message
      });
    }
  },
  
  /**
   * Get top cryptocurrencies
   */
  getTopCryptocurrencies: async (req, res) => {
    try {
      const { limit = 10 } = req.query;
      const data = await marketDataService.getTopCryptocurrencies(parseInt(limit));
      return res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error getting top cryptocurrencies: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch top cryptocurrencies',
        error: error.message
      });
    }
  },
  
  /**
   * Get forex rates
   */
  getForexRates: async (req, res) => {
    try {
      const { base = 'USD' } = req.query;
      const data = await marketDataService.getForexRates(base);
      return res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error getting forex rates: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch forex rates',
        error: error.message
      });
    }
  },
  
  /**
   * Search for tradeable symbols
   */
  searchSymbols: async (req, res) => {
    try {
      const { query } = req.query;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          message: 'Query parameter is required'
        });
      }
      
      const data = await marketDataService.searchSymbols(query);
      return res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error searching symbols: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to search symbols',
        error: error.message
      });
    }
  },

  /**
   * Get available data sources
   */
  getAvailableDataSources: async (req, res) => {
    try {
      const sources = marketDataService.getAvailableDataSources();
      return res.json({
        success: true,
        data: sources
      });
    } catch (error) {
      logger.error(`Error getting data sources: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch data sources',
        error: error.message
      });
    }
  }
};

export default marketController;