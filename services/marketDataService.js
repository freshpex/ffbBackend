import binanceService from "./binanceService.js";
import alphaVantageService from "./alphaVantageService.js";
import cryptoCompareService from "./cryptoCompareService.js";
import logger from "../middleware/logger.js";
import config from "../config/config.js";

/**
 * Service for accessing market data from multiple sources
 * Provides a unified interface for getting market data
 */
const marketDataService = {
  /**
   * Determine if a symbol is a cryptocurrency
   * @param {string} symbol - Symbol to check
   * @returns {boolean} True if it's a crypto symbol
   */
  isCryptoSymbol: (symbol) => {
    return /USDT|BTC|ETH|BUSD|USD$/.test(symbol);
  },
  
  /**
   * Extract base cryptocurrency symbol from pair
   * @param {string} symbol - Symbol like BTCUSDT
   * @returns {string} Base symbol like BTC
   */
  extractCryptoBaseSymbol: (symbol) => {
    return symbol.replace(/USDT|USD$/, "");
  },

  /**
   * Check which data services are available
   * @returns {Object} Status of each service
   */
  getServicesStatus: () => {
    return {
      binance: binanceService.isConfigured(),
      alphaVantage: alphaVantageService.isConfigured(),
      cryptoCompare: cryptoCompareService.isConfigured()
    };
  },

  /**
   * Get current price for a symbol
   * @param {string} symbol - Trading symbol (e.g., BTCUSDT or AAPL)
   * @returns {Promise<Object>} Price data with metadata
   */
  getCurrentPrice: async (symbol) => {
    const isCrypto = marketDataService.isCryptoSymbol(symbol);
    
    if (isCrypto) {
      // Try Binance first for crypto
      try {
        if (!binanceService.isConfigured()) {
          throw new Error("Binance service not configured");
        }
        
        const data = await binanceService.getTickerPrice(symbol);
        return {
          symbol,
          price: parseFloat(data.price),
          source: "binance",
          timestamp: Date.now(),
        };
      } catch (binanceError) {
        logger.warn(`Binance price failed for ${symbol}: ${binanceError.message}`);
        
        // Fall back to CryptoCompare
        try {
          if (!cryptoCompareService.isConfigured()) {
            throw new Error("CryptoCompare service not configured");
          }
          
          const baseCrypto = marketDataService.extractCryptoBaseSymbol(symbol);
          const data = await cryptoCompareService.getCurrentPrice(baseCrypto, "USD");
          
          if (!data || !data.USD) {
            throw new Error("Invalid data from CryptoCompare");
          }
          
          return {
            symbol,
            price: data.USD,
            source: "cryptocompare",
            timestamp: Date.now(),
          };
        } catch (ccError) {
          logger.error(`CryptoCompare price failed for ${symbol}: ${ccError.message}`);
          throw new Error(`Could not fetch price for ${symbol}`);
        }
      }
    } else {
      // Stock data from Alpha Vantage
      try {
        if (!alphaVantageService.isConfigured()) {
          throw new Error("Alpha Vantage service not configured");
        }
        
        const data = await alphaVantageService.getStockQuote(symbol);
        
        if (!data || !data["05. price"]) {
          throw new Error("Invalid response from Alpha Vantage");
        }
        
        return {
          symbol,
          price: parseFloat(data["05. price"]),
          source: "alphavantage",
          timestamp: Date.now(),
        };
      } catch (avError) {
        logger.error(`AlphaVantage price failed for ${symbol}: ${avError.message}`);
        throw new Error(`Could not fetch price for ${symbol}`);
      }
    }
  },

  /**
   * Get market data for multiple symbols
   * @param {Array<string>} symbols - Array of symbols to fetch
   * @returns {Promise<Object>} Market data indexed by symbol
   */
  getMarketData: async (symbols = []) => {
    // Default symbols if none provided
    if (!symbols || symbols.length === 0) {
      symbols = [
        "BTCUSDT",
        "ETHUSDT",
        "BNBUSDT",
        "XRPUSDT",
        "ADAUSDT",
        "SOLUSDT",
        "AAPL",
        "MSFT",
        "GOOGL"
      ];
    }
    
    const results = {};
    
    // Process all symbols in parallel
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          results[symbol] = await marketDataService.getCurrentPrice(symbol);
        } catch (err) {
          logger.error(`Market data failed for ${symbol}: ${err.message}`);
          results[symbol] = { 
            symbol, 
            error: err.message,
            timestamp: Date.now()
          };
        }
      })
    );
    
    return results;
  },

  /**
   * Get historical prices for a symbol
   * @param {string} symbol - Trading symbol
   * @param {string} interval - Time interval (e.g., 1d, 1h)
   * @param {number} limit - Number of data points
   * @returns {Promise<Array>} Historical price data
   */
  getHistoricalPrices: async (symbol, interval = "1d", limit = 100) => {
    try {
      return await marketDataService.getOHLCV({ symbol, interval, limit });
    } catch (err) {
      logger.error(`Historical prices failed for ${symbol}: ${err.message}`);
      throw err;
    }
  },

  /**
   * Get OHLCV (Open, High, Low, Close, Volume) data
   * @param {Object} options - Query options
   * @param {string} options.symbol - Trading symbol
   * @param {string} options.interval - Time interval (1m, 5m, 1h, 1d, etc.)
   * @param {number} options.limit - Number of candles
   * @returns {Promise<Array>} OHLCV data
   */
  getOHLCV: async ({ symbol, interval = "1d", limit = 100 }) => {
    const isCrypto = marketDataService.isCryptoSymbol(symbol);
    
    if (isCrypto) {
      // Try Binance first for crypto OHLCV data
      try {
        if (!binanceService.isConfigured()) {
          throw new Error("Binance service not configured");
        }
        
        const klines = await binanceService.getKlines({
          symbol,
          interval,
          limit,
        });
        
        return klines.map((candle) => ({
          timestamp: candle[0],
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]),
        }));
      } catch (binanceError) {
        logger.warn(`Binance OHLCV failed for ${symbol}: ${binanceError.message}`);
        
        // Fall back to CryptoCompare
        try {
          if (!cryptoCompareService.isConfigured()) {
            throw new Error("CryptoCompare service not configured");
          }
          
          const baseCrypto = marketDataService.extractCryptoBaseSymbol(symbol);
          let data;
          
          // Map the interval to CryptoCompare's formats
          if (interval.includes("m") || interval === "1m" || interval === "5m" || interval === "15m") {
            // For minute data
            const minutes = parseInt(interval) || 1;
            data = await cryptoCompareService.getHistoricalMinuteData(
              baseCrypto,
              "USD",
              limit,
              minutes
            );
          } else if (interval.includes("h") || interval === "1h" || interval === "4h") {
            // For hourly data
            data = await cryptoCompareService.getHistoricalHourlyData(
              baseCrypto,
              "USD",
              limit
            );
          } else {
            // Default to daily data
            data = await cryptoCompareService.getHistoricalDailyData(
              baseCrypto,
              "USD",
              limit
            );
          }
          
          if (!data || !data.Data) {
            throw new Error("Invalid data from CryptoCompare");
          }
          
          return data.Data.map((item) => ({
            timestamp: item.time * 1000, // Convert to milliseconds
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volumeto,
          }));
        } catch (ccError) {
          logger.error(`CryptoCompare OHLCV failed for ${symbol}: ${ccError.message}`);
          throw new Error(`Could not fetch OHLCV data for ${symbol}`);
        }
      }
    } else {
      // Stock data from Alpha Vantage
      try {
        if (!alphaVantageService.isConfigured()) {
          throw new Error("Alpha Vantage service not configured");
        }
        
        let data;
        let timeSeriesKey;
        
        // Choose appropriate API based on interval
        if (interval.includes("m")) {
          // Intraday data with minutes
          // Adjust requestInterval to one that Alpha Vantage supports
          let requestInterval = "5min";
          if (interval === "1m") requestInterval = "1min";
          else if (interval === "5m") requestInterval = "5min";
          else if (interval === "15m") requestInterval = "15min";
          else if (interval === "30m") requestInterval = "30min";
          else if (interval === "60m") requestInterval = "60min";
          
          data = await alphaVantageService.getIntradayTimeSeries(symbol, requestInterval, limit > 100);
          timeSeriesKey = `Time Series (${requestInterval})`;
        } else if (interval.includes("h")) {
          // Alpha Vantage doesn't have direct hourly endpoint beyond intraday
          // Use 60min intraday data for hourly
          data = await alphaVantageService.getIntradayTimeSeries(symbol, "60min", limit > 100);
          timeSeriesKey = "Time Series (60min)";
        } else if (interval === "1d" || interval.includes("d")) {
          // Daily data
          data = await alphaVantageService.getDailyTimeSeries(symbol, limit > 100);
          timeSeriesKey = "Time Series (Daily)";
        } else if (interval === "1w" || interval.includes("w")) {
          // Weekly data
          data = await alphaVantageService.getWeeklyTimeSeries(symbol);
          timeSeriesKey = "Weekly Time Series";
        } else {
          // Default to daily data
          data = await alphaVantageService.getDailyTimeSeries(symbol, limit > 100);
          timeSeriesKey = "Time Series (Daily)";
        }
        
        // Extract time series data
        const timeSeries = data[timeSeriesKey];
        
        if (!timeSeries) {
          throw new Error(`No ${timeSeriesKey} data available for ${symbol}`);
        }
        
        // Convert to our standard format
        return Object.entries(timeSeries)
          .slice(0, limit)
          .map(([date, values]) => ({
            timestamp: new Date(date).getTime(),
            open: parseFloat(values["1. open"]),
            high: parseFloat(values["2. high"]),
            low: parseFloat(values["3. low"]),
            close: parseFloat(values["4. close"]),
            volume: parseFloat(values["5. volume"] || 0),
          }))
          .sort((a, b) => a.timestamp - b.timestamp); // Ensure chronological order
      } catch (avError) {
        logger.error(`AlphaVantage OHLCV failed for ${symbol}: ${avError.message}`);
        throw new Error(`Could not fetch OHLCV data for ${symbol}`);
      }
    }
  },

  /**
   * Get order book for a symbol
   * @param {string} symbol - Trading symbol
   * @param {number} depth - Order book depth
   * @returns {Promise<Object>} Order book data
   */
  getOrderBook: async (symbol, depth = 20) => {
    if (!marketDataService.isCryptoSymbol(symbol)) {
      throw new Error(`Order book unavailable for ${symbol}`);
    }
    
    try {
      if (!binanceService.isConfigured()) {
        throw new Error("Binance service not configured");
      }
      
      const data = await binanceService.getDepth(symbol, depth);
      
      return {
        symbol,
        timestamp: Date.now(),
        bids: data.bids.map(([price, quantity]) => [parseFloat(price), parseFloat(quantity)]),
        asks: data.asks.map(([price, quantity]) => [parseFloat(price), parseFloat(quantity)]),
      };
    } catch (err) {
      logger.error(`Order book failed for ${symbol}: ${err.message}`);
      throw new Error(`Could not fetch order book for ${symbol}`);
    }
  },

  /**
   * Get recent trades for a symbol
   * @param {string} symbol - Trading symbol
   * @param {number} limit - Number of trades
   * @returns {Promise<Array>} Recent trades
   */
  getRecentTrades: async (symbol, limit = 50) => {
    if (!marketDataService.isCryptoSymbol(symbol)) {
      throw new Error(`Recent trades unavailable for ${symbol}`);
    }
    
    try {
      if (!binanceService.isConfigured()) {
        throw new Error("Binance service not configured");
      }
      
      const trades = await binanceService.getTrades(symbol, limit);
      
      return trades.map((trade) => ({
        id: trade.id,
        timestamp: trade.time,
        price: parseFloat(trade.price),
        quantity: parseFloat(trade.qty),
        isBuyerMaker: trade.isBuyerMaker,
      }));
    } catch (err) {
      logger.error(`Recent trades failed for ${symbol}: ${err.message}`);
      throw new Error(`Could not fetch trades for ${symbol}`);
    }
  },

  /**
   * Get market statistics for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} Market statistics
   */
  getMarketStats: async (symbol) => {
    if (marketDataService.isCryptoSymbol(symbol)) {
      try {
        if (!binanceService.isConfigured()) {
          throw new Error("Binance service not configured");
        }
        
        const data = await binanceService.get24hrTicker(symbol);
        
        return {
          symbol: data.symbol,
          priceChange: parseFloat(data.priceChange),
          priceChangePercent: parseFloat(data.priceChangePercent),
          lastPrice: parseFloat(data.lastPrice),
          highPrice: parseFloat(data.highPrice),
          lowPrice: parseFloat(data.lowPrice),
          volume: parseFloat(data.volume),
          quoteVolume: parseFloat(data.quoteVolume),
          timestamp: data.closeTime,
        };
      } catch (err) {
        logger.error(`Market stats failed for ${symbol}: ${err.message}`);
        throw new Error(`Could not fetch market stats for ${symbol}`);
      }
    } else {
      try {
        if (!alphaVantageService.isConfigured()) {
          throw new Error("Alpha Vantage service not configured");
        }
        
        const quote = await alphaVantageService.getStockQuote(symbol);
        
        if (!quote || !quote["05. price"]) {
          throw new Error("Invalid response from Alpha Vantage");
        }
        
        const price = parseFloat(quote["05. price"] || 0);
        const previousClose = parseFloat(quote["08. previous close"] || 0);
        const change = price - previousClose;
        
        return {
          symbol,
          priceChange: change,
          priceChangePercent: previousClose ? (change / previousClose) * 100 : 0,
          lastPrice: price,
          highPrice: parseFloat(quote["03. high"] || 0),
          lowPrice: parseFloat(quote["04. low"] || 0),
          volume: parseFloat(quote["06. volume"] || 0),
          quoteVolume: price * parseFloat(quote["06. volume"] || 0),
          timestamp: Date.now(),
        };
      } catch (err) {
        logger.error(`Market stats failed for ${symbol}: ${err.message}`);
        throw new Error(`Could not fetch market stats for ${symbol}`);
      }
    }
  },

  /**
   * Get available trading symbols
   * @param {string} type - Type of symbols: 'all', 'crypto', or 'stocks'
   * @returns {Promise<Array>} Available symbols
   */
  getAvailableSymbols: async (type = "all") => {
    const symbols = [];
    
    // Get cryptocurrency symbols
    if (type === "all" || type === "crypto") {
      try {
        if (binanceService.isConfigured()) {
          const info = await binanceService.getExchangeInfo();
          
          symbols.push(
            ...info.symbols
              .filter((s) => s.status === "TRADING")
              .map((s) => ({
                symbol: s.symbol,
                baseAsset: s.baseAsset,
                quoteAsset: s.quoteAsset,
                type: "crypto",
              }))
          );
        } else {
          // Fallback to a list of common crypto symbols
          symbols.push(
            ...["BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "SOLUSDT"].map(s => ({
              symbol: s,
              baseAsset: s.replace("USDT", ""),
              quoteAsset: "USDT",
              type: "crypto"
            }))
          );
        }
      } catch (err) {
        logger.warn(`Crypto symbols load failed: ${err.message}`);
        
        // Fallback to a list of common crypto symbols on error
        symbols.push(
          ...["BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "SOLUSDT"].map(s => ({
            symbol: s,
            baseAsset: s.replace("USDT", ""),
            quoteAsset: "USDT",
            type: "crypto"
          }))
        );
      }
    }
    
    // Get stock symbols
    if (type === "all" || type === "stocks") {
      try {
        const stockSymbols = [
          "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", 
          "JPM", "V", "JNJ", "WMT", "BAC", "PG", "MA", "DIS"
        ];
        
        symbols.push(
          ...stockSymbols.map((s) => ({
            symbol: s,
            baseAsset: s,
            quoteAsset: "USD",
            type: "stock",
          }))
        );
      } catch (err) {
        logger.warn(`Stock symbols load failed: ${err.message}`);
      }
    }
    
    return symbols;
  },
};

export const getLatestPrice = marketDataService.getCurrentPrice;

export default marketDataService;
