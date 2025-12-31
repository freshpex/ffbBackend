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
  }

  // Get current price for a symbol
  async getPrice(symbol) {
    try {
      if (!symbol) {
        logger.error('Symbol is required for getPrice');
        return null;
      }

      // If mock data is explicitly enabled, always use a mock price.
      if (this.mockData) {
        const mock = this.getMockPrice(symbol);
        this.prices[symbol] = mock;
        this.lastUpdated[symbol] = Date.now();
        return mock;
      }

      const now = Date.now();
      if (
        this.prices[symbol] && 
        this.lastUpdated[symbol] && 
        now - this.lastUpdated[symbol] < this.updateInterval
      ) {
        return this.prices[symbol];
      }

      // Try to get price from different sources
      let price = null;
      
      // Attempt to get from Binance first for crypto
      if (this.isCryptoSymbol(symbol) && this.usingExchangeAPI) {
        try {
          // Format symbol for Binance if needed (e.g., BTC/USDT -> BTCUSDT)
          const formattedSymbol = this.formatSymbolForExchange(symbol, "binance");
          const binanceData = await binanceService.getPrice(formattedSymbol);
          if (binanceData && binanceData.price) {
            price = parseFloat(binanceData.price);
            logger.debug(`Binance price for ${symbol}: ${price}`);
          }
        } catch (error) {
          logger.warn(`Binance price fetch failed for ${symbol}: ${error.message}`);
        }
      }
      
      // If Binance failed, try CryptoCompare for crypto
      if (!price && this.isCryptoSymbol(symbol)) {
        try {
          const cryptoSymbol = symbol.split('/')[0];
          const quoteSymbol = symbol.split('/')[1] || 'USD';
          
          // Use the proper getPrice method which should handle errors internally now
          price = await cryptoCompareService.getPrice(cryptoSymbol, quoteSymbol);
          logger.debug(`CryptoCompare price for ${symbol}: ${price}`);
        } catch (error) {
          logger.warn(`CryptoCompare price fetch failed for ${symbol}: ${error.message}`);
        }
      }
      
      // For stocks, try Alpha Vantage
      if (!price && !this.isCryptoSymbol(symbol)) {
        try {
          const stockSymbol = symbol.split('/')[0];
          const alphaVantageData = await alphaVantageService.getQuote(stockSymbol);
          if (alphaVantageData && alphaVantageData.price) {
            price = parseFloat(alphaVantageData.price);
          }
        } catch (error) {
          logger.warn(`Alpha Vantage price fetch failed for ${symbol}: ${error.message}`);
        }
      }

      // Normalize: only accept finite numeric prices. Anything else becomes a mock fallback.
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        const mock = this.getMockPrice(symbol);
        logger.warn(`Price unavailable/non-numeric for ${symbol}; using mock price ${mock}`);
        price = mock;
      }

      this.prices[symbol] = price;
      this.lastUpdated[symbol] = now;

      return price;
    } catch (error) {
      logger.error(`Error fetching price for ${symbol}:`, error);
      return this.getMockPrice(symbol);
    }
  }

  // Get order book data
  async getOrderbook(symbol, limit = 10) {
    try {
      // If mock data is enabled, or external APIs fail, return mock orderbook
      if (this.mockData) {
        return this.getMockOrderbook(symbol, limit);
      }
      
      // Try to get real orderbook data from Binance for crypto
      if (this.isCryptoSymbol(symbol) && this.usingExchangeAPI) {
        try {
          const formattedSymbol = this.formatSymbolForExchange(symbol, "binance");
          const binanceOrderbook = await binanceService.getDepth(formattedSymbol, limit);
          
          if (binanceOrderbook && binanceOrderbook.bids && binanceOrderbook.asks) {
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
            
            return {
              bids,
              asks,
              symbol,
              timestamp: Date.now()
            };
          }
        } catch (error) {
          logger.warn(`Binance orderbook fetch failed for ${symbol}: ${error.message}`);
        }
      }
      
      // Fallback to mock data
      return this.getMockOrderbook(symbol, limit);
    } catch (error) {
      logger.error(`Error fetching orderbook for ${symbol}:`, error);
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
      
      // Try to get real candlestick data from exchanges for crypto
      if (this.isCryptoSymbol(symbol) && this.usingExchangeAPI) {
        try {
          const formattedSymbol = this.formatSymbolForExchange(symbol, "binance");
          const binanceKlines = await binanceService.getKlines(formattedSymbol, interval, limit);
          
          if (binanceKlines && binanceKlines.length > 0) {
            return binanceKlines.map(kline => ({
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
          }
        } catch (error) {
          logger.warn(`Binance klines fetch failed for ${symbol}: ${error.message}`);
        }
      }
      
      // For non-crypto assets or if exchange API fails, use mock data
      return this.getMockCandles(symbol, interval, limit);
    } catch (error) {
      logger.error(`Error fetching candles for ${symbol}:`, error);
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
      
      // Try to get trading pairs from exchanges
      if (this.usingExchangeAPI) {
        // Get crypto trading pairs from Binance
        try {
          const binancePairs = await binanceService.getExchangeInfo();
          if (binancePairs && binancePairs.symbols) {
            binancePairs.symbols.forEach(symbol => {
              if (symbol.status === 'TRADING') {
                pairs.push({
                  symbol: `${symbol.baseAsset}/${symbol.quoteAsset}`,
                  baseAsset: symbol.baseAsset,
                  quoteAsset: symbol.quoteAsset,
                  type: 'crypto'
                });
              }
            });
          }
        } catch (error) {
          logger.warn(`Failed to fetch Binance trading pairs: ${error.message}`);
        }
      }
      
      // If we couldn't get pairs from exchanges or we want to add more asset types
      if (pairs.length === 0 || !this.usingExchangeAPI) {
        const mockPairs = this.getMockTradingPairs();
        
        // Combine real and mock pairs or just use mock if no real pairs
        const combinedPairs = [...pairs];
        
        // Add mock pairs that don't already exist
        mockPairs.forEach(mockPair => {
          if (!combinedPairs.some(p => p.symbol === mockPair.symbol)) {
            combinedPairs.push(mockPair);
          }
        });
        
        return combinedPairs;
      }
      
      return pairs;
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
      'BTC': 48000,
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
