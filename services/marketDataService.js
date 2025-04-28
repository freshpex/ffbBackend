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
    this.previousPrices = {};
    this.lastUpdated = {};
    this.updateInterval = 30000; // 30 seconds cache time
    
    // Fallback and retry configuration
    this.maxRetries = 2; // Number of retries per provider
    this.retryDelay = 1000; // Base delay in ms between retries
    this.providers = {
      crypto: ['cryptoCompare', 'binance', 'alphaVantage'],
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
        return this.getPriceWithChanges(symbol, this.prices[symbol]);
      }

      if (this.mockData) {
        const mockPrice = this.getMockPrice(symbol);
        if (this.prices[symbol]) {
          this.previousPrices[symbol] = this.prices[symbol];
        }
        this.prices[symbol] = mockPrice;
        this.lastUpdated[symbol] = now;
        return this.getPriceWithChanges(symbol, mockPrice);
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

      // Store the previous price before updating
      if (this.prices[symbol]) {
        this.previousPrices[symbol] = this.prices[symbol];
      }
      this.prices[symbol] = price;
      this.lastUpdated[symbol] = now;
      
      return this.getPriceWithChanges(symbol, price);
    } catch (error) {
      logger.error(`Error in getPrice for ${symbol}:`, error);
      return this.getPriceWithChanges(symbol, this.getMockPrice(symbol));
    }
  }

  /**
   * Calculate price change and percentage and return enhanced price object
   * @param {string} symbol - The trading symbol
   * @param {number} currentPrice - The current price value
   * @returns {Object} - Enhanced price object with change data
   */
  getPriceWithChanges(symbol, currentPrice) {
    const previousPrice = this.previousPrices[symbol] || currentPrice; // Default to current if no previous
    const change = currentPrice - previousPrice;
    const changePercent = previousPrice > 0 ? (change / previousPrice) * 100 : 0;

    return {
      symbol,
      price: currentPrice,
      change: parseFloat(change.toFixed(6)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      lastUpdated: this.lastUpdated[symbol] || Date.now()
    };
  }
  
  /**
   * Get prices for multiple symbols with price change data
   * @param {Array<string>} symbols - Array of symbols to get prices for
   * @returns {Promise<Array<Object>>} - Array of price objects with change data
   */
  async getPrices(symbols = []) {
    try {
      const results = [];
      
      for (const symbol of symbols) {
        const priceData = await this.getPrice(symbol);
        if (priceData) {
          results.push(priceData);
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Error in getPrices:', error);
      return [];
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

  // Get candlestick/chart data
  async getCandles({ symbol, interval = '1h', limit = 100 }) {
    try {
      // If mock data is enabled, return mock candles
      if (this.mockData) {
        return this.getMockCandles(symbol, interval, limit);
      }
      
      // Determine which provider list to use based on asset type
      const providerList = this.isCryptoSymbol(symbol) 
        ? this.providers.crypto 
        : this.providers.stock;
      
      logger.info(`Fetching candles for ${symbol} using provider sequence: ${providerList.join(', ')}`);
      
      let candles = null;
      
      // Try each provider in sequence with retries
      for (const provider of providerList) {
        if (candles) break;
        
        logger.info(`Attempting to fetch candles from ${provider} for ${symbol}`);

        if (provider === 'cryptoCompare' && this.isCryptoSymbol(symbol)) {
          // Try CryptoCompare with retries
          const baseSymbol = symbol.split('/')[0];
          const quoteSymbol = symbol.split('/')[1] || 'USD';
          
          try {
            const cryptoCompareCandles = await this.retryOperation(
              async () => {
                const data = await cryptoCompareService.getHistoricalData(baseSymbol, quoteSymbol, interval, limit);
                if (!data || !data.length) {
                  throw new Error('Invalid candles response from CryptoCompare');
                }
                return data;
              },
              this.maxRetries,
              this.retryDelay,
              'CryptoCompare',
              symbol
            );
            
            if (cryptoCompareCandles) {
              logger.info(`Successfully fetched candles from CryptoCompare for ${symbol}`);
              
              candles = cryptoCompareCandles.map(candle => ({
                timestamp: candle.time * 1000,
                open: parseFloat(candle.open),
                high: parseFloat(candle.high),
                low: parseFloat(candle.low),
                close: parseFloat(candle.close),
                volume: parseFloat(candle.volumefrom)
              }));
              break;
            }
          } catch (error) {
            logger.warn(`CryptoCompare candles fetch failed for ${symbol}: ${error.message}`);
          }
        }
        
        if (provider === 'binance' && this.isCryptoSymbol(symbol) && this.usingExchangeAPI) {
          // Try Binance with retries
          const formattedSymbol = this.formatSymbolForExchange(symbol, "binance");
          
          const binanceKlines = await this.retryOperation(
            async () => {
              const data = await binanceService.getKlines(formattedSymbol, interval, limit);
              if (!data || !data.length) {
                throw new Error('Invalid klines response from Binance');
              }
              return data;
            },
            this.maxRetries,
            this.retryDelay,
            'Binance',
            symbol
          );
          
          if (binanceKlines) {
            logger.info(`Successfully fetched candles from Binance for ${symbol}`);
            
            candles = binanceKlines.map(kline => ({
              timestamp: kline[0],
              open: parseFloat(kline[1]),
              high: parseFloat(kline[2]),
              low: parseFloat(kline[3]),
              close: parseFloat(kline[4]),
              volume: parseFloat(kline[5]),
              closeTime: kline[6],
              quoteAssetVolume: parseFloat(kline[7]),
              trades: kline[8],
              buyBaseAssetVolume: parseFloat(kline[9]),
              buyQuoteAssetVolume: parseFloat(kline[10])
            }));
            
            break;
          }
        }
        
        if (provider === 'alphaVantage' && !this.isCryptoSymbol(symbol)) {
          // Try AlphaVantage with retries for stock data
          const stockSymbol = symbol.split('/')[0];
          
          try {
            const alphaVantageCandles = await this.retryOperation(
              async () => {
                // Choose appropriate time series based on interval
                const timeSeriesFunction = interval.includes('d') 
                  ? 'getDailyTimeSeries' 
                  : 'getIntradayTimeSeries';
                
                const data = await alphaVantageService[timeSeriesFunction](stockSymbol, interval, limit);
                if (!data || !data['Time Series']) {
                  throw new Error('Invalid candles response from Alpha Vantage');
                }
                return data;
              },
              this.maxRetries,
              this.retryDelay,
              'Alpha Vantage',
              symbol
            );
            
            if (alphaVantageCandles && alphaVantageCandles['Time Series']) {
              logger.info(`Successfully fetched candles from Alpha Vantage for ${symbol}`);
              
              // Transform Alpha Vantage data to our candle format
              const timeSeries = alphaVantageCandles['Time Series'];
              candles = Object.keys(timeSeries).map(dateStr => {
                const data = timeSeries[dateStr];
                return {
                  timestamp: new Date(dateStr).getTime(),
                  open: parseFloat(data['1. open']),
                  high: parseFloat(data['2. high']),
                  low: parseFloat(data['3. low']),
                  close: parseFloat(data['4. close']),
                  volume: parseFloat(data['5. volume'])
                };
              }).slice(0, limit);
              
              break;
            }
          } catch (error) {
            logger.warn(`Alpha Vantage candles fetch failed for ${symbol}: ${error.message}`);
          }
        }
      }
      
      // If all API calls fail, fall back to mock data
      if (!candles) {
        candles = this.getMockCandles(symbol, interval, limit);
        logger.warn(`All providers failed for ${symbol} candles, using fallback mock data`);
      }
      
      return candles;
    } catch (error) {
      logger.error(`Error in getCandles for ${symbol}:`, error);
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
    if (!symbol) return false;
    
    // Common crypto base assets
    const cryptoAssets = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE', 'AVAX', 'MATIC'];
    const baseAsset = symbol.split('/')[0];
    
    return cryptoAssets.includes(baseAsset) || symbol.includes('USDT') || symbol.includes('USD');
  }
  
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
