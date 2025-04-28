import logger from '../middleware/logger.js';
import binanceService from './binanceService.js';
import cryptoCompareService from './cryptoCompareService.js';
import alphaVantageService from './alphaVantageService.js';
import config from '../config/config.js';

class MarketDataService {
  constructor() {
    this.mockData = config.marketData?.useMockData || false;
    this.usingExchangeAPI = config.binance?.apiKey && config.binance.apiKey !== '';
    this.prices = {};
    this.lastUpdated = {};
    this.updateInterval = 30000; // 30 seconds cache time
    
    // Fallback and retry configuration
    this.maxRetries = 2; // Number of retries per provider
    this.retryDelay = 1000; // Base delay in ms between retries
    this.providers = {
      crypto: ['binance', 'cryptoCompare', 'alphaVantage'],
      stock: ['alphaVantage', 'cryptoCompare'] // Some financial APIs provide stock data as well
    };
  }

  /**
   * Retry a function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {number} retries - Number of retries
   * @param {number} delay - Delay between retries in ms 
   * @param {string} providerName - Name of the provider being tried
   * @param {string} symbol - Symbol being fetched
   * @returns {Promise<any>} - Result of the function or null if all retries fail
   */
  async retryOperation(fn, retries, delay, providerName, symbol) {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) {
        logger.warn(`All retries failed for ${providerName} when fetching ${symbol}`);
        return null;
      }
      
      logger.info(`Retry attempt for ${providerName} (${symbol}), remaining attempts: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.retryOperation(
        fn, 
        retries - 1, 
        delay * 2, // Exponential backoff
        providerName,
        symbol
      );
    }
  }

  // Get current price for a symbol
  async getPrice(symbol) {
    try {
      if (!symbol) {
        logger.error('Symbol is required for getPrice');
        return null;
      }

      const now = Date.now();
      if (
        this.prices[symbol] && 
        this.lastUpdated[symbol] && 
        now - this.lastUpdated[symbol] < this.updateInterval
      ) {
        return this.prices[symbol];
      }

      if (this.mockData) {
        const mockPrice = this.getMockPrice(symbol);
        this.prices[symbol] = mockPrice;
        this.lastUpdated[symbol] = now;
        return mockPrice;
      }

      // Try to get price from different sources with fallback mechanism
      let price = null;
      
      // Determine which provider list to use based on asset type
      const providerList = this.isCryptoSymbol(symbol) 
        ? this.providers.crypto 
        : this.providers.stock;
      
      logger.info(`Fetching price for ${symbol} using provider sequence: ${providerList.join(', ')}`);
      
      // Try each provider in sequence with retries
      for (const provider of providerList) {
        if (price) break;
        
        logger.info(`Attempting to fetch price from ${provider} for ${symbol}`);
        
        if (provider === 'binance' && this.isCryptoSymbol(symbol) && this.usingExchangeAPI) {
          // Try Binance with retries
          const formattedSymbol = this.formatSymbolForExchange(symbol, "binance");
          
          price = await this.retryOperation(
            async () => {
              const data = await binanceService.getPrice(formattedSymbol);
              if (!data || !data.price) {
                throw new Error('Invalid response from Binance');
              }
              return parseFloat(data.price);
            },
            this.maxRetries,
            this.retryDelay,
            'Binance',
            symbol
          );
          
          if (price) {
            logger.info(`Successfully fetched price from Binance for ${symbol}: ${price}`);
            break;
          }
        }
        
        if (provider === 'cryptoCompare') {
          // Try CryptoCompare with retries
          const baseSymbol = symbol.split('/')[0];
          const quoteSymbol = symbol.split('/')[1] || 'USD';
          
          price = await this.retryOperation(
            async () => {
              const result = await cryptoCompareService.getPrice(baseSymbol, quoteSymbol);
              if (result === undefined || result === null) {
                throw new Error('Invalid response from CryptoCompare');
              }
              return result;
            },
            this.maxRetries,
            this.retryDelay,
            'CryptoCompare',
            symbol
          );
          
          if (price) {
            logger.info(`Successfully fetched price from CryptoCompare for ${symbol}: ${price}`);
            break;
          }
        }
        
        if (provider === 'alphaVantage') {
          // Try AlphaVantage with retries
          const stockSymbol = symbol.split('/')[0];
          
          price = await this.retryOperation(
            async () => {
              const data = await alphaVantageService.getQuote(stockSymbol);
              if (!data || !data.price) {
                throw new Error('Invalid response from Alpha Vantage');
              }
              return parseFloat(data.price);
            },
            this.maxRetries,
            this.retryDelay,
            'Alpha Vantage',
            symbol
          );
          
          if (price) {
            logger.info(`Successfully fetched price from Alpha Vantage for ${symbol}: ${price}`);
            break;
          }
        }
      }

      // If all API calls fail, fall back to mock data
      if (!price) {
        price = this.getMockPrice(symbol);
        logger.warn(`All providers failed for ${symbol}, using fallback mock price: ${price}`);
      }

      this.prices[symbol] = price;
      this.lastUpdated[symbol] = now;
      
      return price;
    } catch (error) {
      logger.error(`Error in getPrice for ${symbol}:`, error);
      return this.getMockPrice(symbol);
    }
  }

  // Get order book data
  async getOrderbook(symbol, limit = 10) {
    try {
      // If mock data is enabled, return mock orderbook
      if (this.mockData) {
        return this.getMockOrderbook(symbol, limit);
      }
      
      // Determine which provider list to use based on asset type
      const providerList = this.isCryptoSymbol(symbol) 
        ? this.providers.crypto 
        : this.providers.stock;
      
      logger.info(`Fetching orderbook for ${symbol} using provider sequence: ${providerList.join(', ')}`);
      
      let orderbook = null;
      
      // Try each provider in sequence with retries
      for (const provider of providerList) {
        if (orderbook) break; // Stop if we have data
        
        logger.info(`Attempting to fetch orderbook from ${provider} for ${symbol}`);
        
        if (provider === 'binance' && this.isCryptoSymbol(symbol) && this.usingExchangeAPI) {
          // Try Binance with retries
          const formattedSymbol = this.formatSymbolForExchange(symbol, "binance");
          
          const binanceOrderbook = await this.retryOperation(
            async () => {
              const data = await binanceService.getDepth(formattedSymbol, limit);
              if (!data || !data.bids || !data.asks) {
                throw new Error('Invalid orderbook response from Binance');
              }
              return data;
            },
            this.maxRetries,
            this.retryDelay,
            'Binance',
            symbol
          );
          
          if (binanceOrderbook) {
            logger.info(`Successfully fetched orderbook from Binance for ${symbol}`);
            
            let bidTotal = 0;
            let askTotal = 0;
            
            const bids = binanceOrderbook.bids.map(bid => {
              const price = parseFloat(bid[0]);
              const quantity = parseFloat(bid[1]);
              bidTotal += quantity;
              return {
                price,
                quantity,
                total: bidTotal
              };
            });
            
            const asks = binanceOrderbook.asks.map(ask => {
              const price = parseFloat(ask[0]);
              const quantity = parseFloat(ask[1]);
              askTotal += quantity;
              return {
                price,
                quantity,
                total: askTotal
              };
            });
            
            orderbook = {
              bids,
              asks,
              symbol,
              timestamp: Date.now()
            };
            
            break;
          }
        }
        
        // CryptoCompare also offers order book data
        if (provider === 'cryptoCompare' && this.isCryptoSymbol(symbol)) {
          const baseSymbol = symbol.split('/')[0];
          const quoteSymbol = symbol.split('/')[1] || 'USD';
          
          // CryptoCompare might have an orderbook endpoint we could use
          // Implementation would go here if available
          // For now, we'll continue to the next provider
        }
        
        // Note: AlphaVantage doesn't provide orderbook data
        // We'll skip direct implementation for it
      }

      // If all API calls fail, fall back to mock data
      if (!orderbook) {
        orderbook = this.getMockOrderbook(symbol, limit);
        logger.warn(`All providers failed for ${symbol} orderbook, using fallback mock data`);
      }
      
      return orderbook;
    } catch (error) {
      logger.error(`Error in getOrderbook for ${symbol}:`, error);
      return this.getMockOrderbook(symbol, limit);
    }
  }

  /**
   * Get OHLCV candles for a trading pair
   * @param {string} symbol - The trading pair symbol
   * @param {string} interval - The interval for candles (1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w)
   * @param {number} limit - The number of candles to return
   * @returns {Promise<Array>} - The candles array
   */
  async getCandles(symbol, interval, limit = 100) {
    try {
      // Handle cryptocurrency data using CryptoCompare or Binance
      if (this.isCryptoSymbol(symbol)) {
        try {
          // Try CryptoCompare first
          const cryptoCompareData = await this.cryptoCompareService.getHistoricalData(symbol, interval, limit);
          if (cryptoCompareData && cryptoCompareData.length > 0) {
            return cryptoCompareData;
          }
        } catch (error) {
          this.logger.warn(`CryptoCompare data fetch failed for ${symbol}, falling back to Binance: ${error.message}`);
        }

        try {
          // Try Binance as fallback for crypto
          const binanceData = await this.binanceService.getHistoricalData(symbol, interval, limit);
          if (binanceData && binanceData.length > 0) {
            return binanceData;
          }
        } catch (error) {
          this.logger.warn(`Binance data fetch failed for ${symbol}: ${error.message}`);
        }
      } 
      // Handle stocks and commodities using AlphaVantage
      else if (this.isStockSymbol(symbol) || this.isCommoditySymbol(symbol)) {
        try {
          // Extract the base symbol (e.g., AAPL from AAPL/USD)
          const baseSymbol = symbol.split('/')[0];
          
          // For commodities, we need to use specific mapping for AlphaVantage
          let alphaSymbol = baseSymbol;
          if (this.isCommoditySymbol(symbol)) {
            // Map common commodity symbols to AlphaVantage format
            const commodityMap = {
              'GOLD': 'XAUUSD',
              'SILVER': 'XAGUSD',
              'OIL': 'CL',
              'XAU': 'XAUUSD',
              'XAG': 'XAGUSD'
            };
            alphaSymbol = commodityMap[baseSymbol] || baseSymbol;
          }
          
          // Convert our interval format to AlphaVantage format
          const alphaInterval = this.convertIntervalToAlphaVantage(interval);
          
          const alphaData = await this.alphaVantageService.getHistoricalData(
            alphaSymbol, 
            alphaInterval, 
            limit
          );
          
          if (alphaData && alphaData.length > 0) {
            return alphaData;
          }
        } catch (error) {
          this.logger.warn(`AlphaVantage data fetch failed for ${symbol}: ${error.message}`);
        }
      }

      // If all API calls failed or the symbol type is not supported, use mock data as last resort
      this.logger.warn(`Falling back to mock data for ${symbol} with interval ${interval}`);
      return this.getMockCandles(symbol, interval, limit);
    } catch (error) {
      this.logger.error(`Error in getCandles for ${symbol}: ${error.message}`);
      return this.getMockCandles(symbol, interval, limit);
    }
  }

  // Get available trading pairs
  async getTradingPairs() {
    try {
      if (this.mockData) {
        return this.getMockTradingPairs();
      }
      
      const pairs = [];
      
      // Determine providers to use
      const providerList = this.providers.crypto;
      
      logger.info(`Fetching trading pairs using provider sequence: ${providerList.join(', ')}`);
      
      // Try each provider in sequence with retries
      for (const provider of providerList) {
        logger.info(`Attempting to fetch trading pairs from ${provider}`);
        
        if (provider === 'binance' && this.usingExchangeAPI) {
          // Try Binance with retries
          const binancePairs = await this.retryOperation(
            async () => {
              const data = await binanceService.getExchangeInfo();
              if (!data || !data.symbols) {
                throw new Error('Invalid response from Binance for trading pairs');
              }
              return data;
            },
            this.maxRetries,
            this.retryDelay,
            'Binance',
            'trading pairs'
          );
          
          if (binancePairs && binancePairs.symbols) {
            logger.info(`Successfully fetched trading pairs from Binance`);
            
            binancePairs.symbols.forEach(symbol => {
              if (symbol.status === 'TRADING') {
                pairs.push({
                  symbol: `${symbol.baseAsset}/${symbol.quoteAsset}`,
                  baseAsset: symbol.baseAsset,
                  quoteAsset: symbol.quoteAsset,
                  type: 'crypto',
                  minQuantity: parseFloat(symbol.filters.find(f => f.filterType === 'LOT_SIZE')?.minQty || 0.001),
                  maxQuantity: parseFloat(symbol.filters.find(f => f.filterType === 'LOT_SIZE')?.maxQty || 1000)
                });
              }
            });
          }
        }
        
        // Could add implementation for other providers that offer trading pairs info
        // For example, CryptoCompare might have endpoints for available pairs
      }
      
      // If we couldn't get pairs from exchanges or we want to add more asset types
      if (pairs.length === 0) {
        logger.info('No trading pairs fetched from providers, using mock data');
        return this.getMockTradingPairs();
      }
      
      // Add stock/ETF pairs from mock data since they usually don't come from crypto APIs
      const mockPairs = this.getMockTradingPairs();
      const nonCryptoMockPairs = mockPairs.filter(pair => pair.type !== 'crypto');
      
      // Combine real crypto pairs with mock stock/ETF pairs
      const combinedPairs = [...pairs, ...nonCryptoMockPairs];
      
      return combinedPairs;
    } catch (error) {
      logger.error('Error fetching trading pairs:', error);
      return this.getMockTradingPairs();
    }
  }

  // Helper function to format symbol for different exchanges
  formatSymbolForExchange(symbol, exchange) {
    if (!symbol) return symbol;
    
    // Remove spaces and convert / to appropriate format
    let formatted = symbol.replace(/\s/g, '');
    
    if (exchange === 'binance') {
      return formatted.replace('/', '');
    }
    
    return formatted;
  }
  
  // Helper to check if a symbol is a crypto pair
  isCryptoSymbol(symbol) {
    // Common crypto base symbols
    const cryptoSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE', 'AVAX', 'MATIC'];
    const baseAsset = symbol.split('/')[0];
    return cryptoSymbols.includes(baseAsset);
  }
  
  /**
   * Check if the given symbol represents a commodity
   * @param {string} symbol - The trading pair symbol
   * @returns {boolean} - True if the symbol represents a commodity
   */
  isCommoditySymbol(symbol) {
    const commoditySymbols = ['GOLD', 'SILVER', 'OIL', 'XAU', 'XAG', 'CL', 'NATGAS', 'BRENT'];
    const baseSymbol = symbol.split('/')[0];
    return commoditySymbols.includes(baseSymbol);
  }

  // Helper to check if a symbol is a stock
  isStockSymbol(symbol) {
    // If it's not crypto and not commodity, assume it's a stock
    return !this.isCryptoSymbol(symbol) && !this.isCommoditySymbol(symbol);
  }
  
  // Convert our interval format to AlphaVantage format
  convertIntervalToAlphaVantage(interval) {
    const mapping = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '60min',
      '4h': 'daily', // AlphaVantage doesn't have 4h, using daily as closest
      '1d': 'daily',
      '1w': 'weekly'
    };
    return mapping[interval] || 'daily'; // Default to daily if interval not found
  }

  /**
   * Check if the given symbol represents a cryptocurrency
   * @param {string} symbol - The trading pair symbol
   * @returns {boolean} - True if the symbol represents a cryptocurrency
   */
  
  // Get base price for mock data
  getBasePrice(symbol) {
    if (!symbol) return 100;
    
    const baseAsset = symbol.split('/')[0];
    
    const basePrices = {
      'BTC': 98000,
      'ETH': 3200,
      'BNB': 410,
      'SOL': 100,
      'XRP': 0.50,
      'ADA': 0.45,
      'DOT': 6.8,
      'DOGE': 0.14,
      'AVAX': 28,
      'MATIC': 0.80,
      'AAPL': 175,
      'GOOGL': 2700,
      'MSFT': 350,
      'AMZN': 3300,
      'TSLA': 250,
      'META': 450,
      'NFLX': 600,
      'SPY': 450,
      'QQQ': 380,
      'VTI': 220,
      'GOLD': 2000,
      'SILVER': 25,
      'OIL': 75
    };
    
    return basePrices[baseAsset] || 100;
  }
  
  // Generate a mock price
  getMockPrice(symbol) {
    // Common price ranges for different asset types
    const basePrice = this.getBasePrice(symbol);
    
    // Add some randomness
    const variance = basePrice * 0.01; // 1% variance
    const randomFactor = (Math.random() * 2 - 1) * variance;
    
    return parseFloat((basePrice + randomFactor).toFixed(2));
  }
  
  // Generate mock orderbook data
  getMockOrderbook(symbol, limit = 10) {
    const basePrice = this.getBasePrice(symbol);
    const bids = [];
    const asks = [];
    
    let bidTotal = 0;
    // Generate bid prices slightly below base price
    for (let i = 0; i < limit; i++) {
      const priceFactor = 1 - (0.0001 * (i + 1) * 10);
      const price = parseFloat((basePrice * priceFactor).toFixed(2));
      const quantity = parseFloat((Math.random() * 10 + 1).toFixed(4));
      bidTotal += quantity;
      
      bids.push({
        price,
        quantity,
        total: bidTotal
      });
    }
    
    let askTotal = 0;
    // Generate ask prices slightly above base price
    for (let i = 0; i < limit; i++) {
      const priceFactor = 1 + (0.0001 * (i + 1) * 10);
      const price = parseFloat((basePrice * priceFactor).toFixed(2));
      const quantity = parseFloat((Math.random() * 10 + 1).toFixed(4));
      askTotal += quantity;
      
      asks.push({
        price,
        quantity,
        total: askTotal
      });
    }
    
    return {
      symbol,
      bids,
      asks,
      timestamp: Date.now()
    };
  }
  
  // Generate mock candlestick data
  getMockCandles(symbol, interval = '1h', limit = 100) {
    const candles = [];
    const basePrice = this.getBasePrice(symbol);
    let currentPrice = basePrice;
    const now = Date.now();
    
    // Determine time increment based on interval
    const timeIncrement = this.getTimeIncrementForInterval(interval);
    
    for (let i = limit - 1; i >= 0; i--) {
      // Calculate time for this candle
      const time = now - (i * timeIncrement);
      
      // Add random price movement with a slight trend bias
      const trendBias = Math.random() > 0.5 ? 0.001 : -0.001;
      const priceFactor = 1 + ((Math.random() * 0.01) - 0.005 + trendBias);
      currentPrice = currentPrice * priceFactor;
      
      // Calculate OHLC values with some random variance
      const open = currentPrice;
      const high = open * (1 + Math.random() * 0.005);
      const low = open * (1 - Math.random() * 0.005);
      const close = open * (1 + ((Math.random() * 0.01) - 0.005));
      
      // Generate volume with some correlation to price movement
      const volume = Math.abs(close - open) * basePrice * 10 * (Math.random() + 0.5);
      
      candles.push({
        timestamp: time,
        time: new Date(time).toISOString(),
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: parseFloat(volume.toFixed(2))
      });
    }
    
    return candles;
  }
  
  getTimeIncrementForInterval(interval) {
    const unit = interval.slice(-1);
    const value = parseInt(interval.slice(0, -1));
    
    switch(unit) {
      case 'm':
        return value * 60 * 1000; // minutes
      case 'h':
        return value * 60 * 60 * 1000; // hours
      case 'd':
        return value * 24 * 60 * 60 * 1000; // days
      case 'w':
        return value * 7 * 24 * 60 * 60 * 1000; // weeks
      case 'M':
        return value * 30 * 24 * 60 * 60 * 1000; // months (approximate)
      default:
        return 60 * 60 * 1000; // default to 1 hour
    }
  }
  
  // Generate mock trading pairs
  getMockTradingPairs() {
    return [
      // Cryptocurrencies
      { symbol: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT', type: 'crypto', minQuantity: 0.001, maxQuantity: 1000 },
      { symbol: 'ETH/USDT', baseAsset: 'ETH', quoteAsset: 'USDT', type: 'crypto', minQuantity: 0.01, maxQuantity: 5000 },
      { symbol: 'BNB/USDT', baseAsset: 'BNB', quoteAsset: 'USDT', type: 'crypto', minQuantity: 0.01, maxQuantity: 10000 },
      { symbol: 'SOL/USDT', baseAsset: 'SOL', quoteAsset: 'USDT', type: 'crypto', minQuantity: 0.1, maxQuantity: 50000 },
      { symbol: 'XRP/USDT', baseAsset: 'XRP', quoteAsset: 'USDT', type: 'crypto', minQuantity: 10, maxQuantity: 1000000 },
      { symbol: 'ADA/USDT', baseAsset: 'ADA', quoteAsset: 'USDT', type: 'crypto', minQuantity: 10, maxQuantity: 1000000 },
      { symbol: 'DOT/USDT', baseAsset: 'DOT', quoteAsset: 'USDT', type: 'crypto', minQuantity: 1, maxQuantity: 100000 },
      { symbol: 'DOGE/USDT', baseAsset: 'DOGE', quoteAsset: 'USDT', type: 'crypto', minQuantity: 100, maxQuantity: 10000000 },
      
      // Stocks
      { symbol: 'AAPL/USD', baseAsset: 'AAPL', quoteAsset: 'USD', type: 'stock', minQuantity: 0.01, maxQuantity: 1000 },
      { symbol: 'GOOGL/USD', baseAsset: 'GOOGL', quoteAsset: 'USD', type: 'stock', minQuantity: 0.01, maxQuantity: 500 },
      { symbol: 'MSFT/USD', baseAsset: 'MSFT', quoteAsset: 'USD', type: 'stock', minQuantity: 0.01, maxQuantity: 1000 },
      { symbol: 'AMZN/USD', baseAsset: 'AMZN', quoteAsset: 'USD', type: 'stock', minQuantity: 0.01, maxQuantity: 200 },
      { symbol: 'TSLA/USD', baseAsset: 'TSLA', quoteAsset: 'USD', type: 'stock', minQuantity: 0.01, maxQuantity: 500 },
      { symbol: 'META/USD', baseAsset: 'META', quoteAsset: 'USD', type: 'stock', minQuantity: 0.01, maxQuantity: 500 },
      
      // ETFs
      { symbol: 'SPY/USD', baseAsset: 'SPY', quoteAsset: 'USD', type: 'etf', minQuantity: 0.01, maxQuantity: 500 },
      { symbol: 'QQQ/USD', baseAsset: 'QQQ', quoteAsset: 'USD', type: 'etf', minQuantity: 0.01, maxQuantity: 500 },
      { symbol: 'VTI/USD', baseAsset: 'VTI', quoteAsset: 'USD', type: 'etf', minQuantity: 0.01, maxQuantity: 1000 },
      
      // Commodities
      { symbol: 'GOLD/USD', baseAsset: 'GOLD', quoteAsset: 'USD', type: 'commodity', minQuantity: 0.01, maxQuantity: 100 },
      { symbol: 'SILVER/USD', baseAsset: 'SILVER', quoteAsset: 'USD', type: 'commodity', minQuantity: 0.1, maxQuantity: 1000 },
      { symbol: 'OIL/USD', baseAsset: 'OIL', quoteAsset: 'USD', type: 'commodity', minQuantity: 0.1, maxQuantity: 1000 }
    ];
  }
  
  // Extract crypto base symbol from a trading pair
  extractCryptoBaseSymbol(symbol) {
    if (!symbol) return "";
    
    if (symbol.includes('/')) {
      return symbol.split('/')[0];
    } else if (symbol.includes('-')) {
      return symbol.split('-')[0];
    } else {
      const potentialSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE', 'AVAX', 'MATIC'];
      for (const sym of potentialSymbols) {
        if (symbol.startsWith(sym)) {
          return sym;
        }
      }
      
      return symbol.replace(/USDT$|USD$/, '');
    }
  }
}

// Export singleton instance
export default new MarketDataService();
