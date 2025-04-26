import binanceService from './binanceService.js';
import alphaVantageService from './alphaVantageService.js';
import cryptoCompareService from './cryptoCompareService.js';
import logger from '../middleware/logger.js';
import config from '../config/config.js';

const marketDataService = {
  getCurrentPrice: async (symbol) => {
    const isCrypto = /USDT|BTC|ETH|BUSD|USD$/.test(symbol);
    if (isCrypto) {
      try {
        const data = await binanceService.getTickerPrice(symbol);
        return { symbol, price: parseFloat(data.price), source: 'binance', timestamp: Date.now() };
      } catch (binanceError) {
        logger.warn(`Binance price failed for ${symbol}: ${binanceError.message}`);
        const cryptoSymbol = symbol.replace(/USDT|USD$/, '');
        try {
          const data = await cryptoCompareService.getPrice(cryptoSymbol, 'USD');
          return { symbol, price: data.USD, source: 'cryptocompare', timestamp: Date.now() };
        } catch (ccError) {
          logger.error(`CryptoCompare price failed for ${symbol}: ${ccError.message}`);
          throw new Error(`Could not fetch price for ${symbol}`);
        }
      }
    } else {
      try {
        const data = await alphaVantageService.getQuote(symbol);
        return { symbol, price: parseFloat(data.price), source: 'alphavantage', timestamp: Date.now() };
      } catch (avError) {
        logger.error(`AlphaVantage price failed for ${symbol}: ${avError.message}`);
        throw new Error(`Could not fetch price for ${symbol}`);
      }
    }
  },

  getMarketData: async (symbols = []) => {
    if (symbols.length === 0) {
      symbols = ['BTCUSDT','ETHUSDT','BNBUSDT','XRPUSDT','ADAUSDT','SOLUSDT'];
    }
    const results = {};
    await Promise.all(
      symbols.map(async (sym) => {
        try {
          results[sym] = await marketDataService.getCurrentPrice(sym);
        } catch (err) {
          logger.error(`MarketData failed for ${sym}: ${err.message}`);
          results[sym] = { error: err.message };
        }
      })
    );
    return results;
  },

  getHistoricalPrices: async (symbol, interval = '1d', limit = 100) => {
    try {
      return await marketDataService.getOHLCV({ symbol, interval, limit });
    } catch (err) {
      logger.error(`HistoricalPrices failed for ${symbol}: ${err.message}`);
      throw err;
    }
  },

  getOHLCV: async ({ symbol, interval = '1h', limit = 100 }) => {
    const isCrypto = /USDT|BTC|ETH|BUSD|USD$/.test(symbol);
    if (isCrypto) {
      try {
        const klines = await binanceService.getKlines({ symbol, interval, limit });
        return klines.map(c => ({
          timestamp: c[0],
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
          volume: parseFloat(c[5])
        }));
      } catch (binErr) {
        logger.warn(`Binance OHLCV failed for ${symbol}: ${binErr.message}`);
        const cryptoSymbol = symbol.replace(/USDT|USD$/, '');
        const timeUnit = interval.includes('m') ? 'minute' : interval.includes('h') ? 'hour' : 'day';
        const timeValue = parseInt(interval);
        try {
          const data = await cryptoCompareService.getHistoricalData(
            cryptoSymbol, 'USD', timeUnit, limit, timeValue
          );
          return data.map(i => ({
            timestamp: i.time * 1000,
            open: i.open, high: i.high, low: i.low, close: i.close, volume: i.volumeto
          }));
        } catch (ccErr) {
          logger.error(`CryptoCompare OHLCV failed for ${symbol}: ${ccErr.message}`);
          throw new Error(`Could not fetch OHLCV for ${symbol}`);
        }
      }
    } else {
      try {
        let avInterval;
        if (interval.includes('m')) avInterval = parseInt(interval) >= 60 ? '60min' : '5min';
        else if (interval.includes('h')) avInterval = 'hourly';
        else avInterval = 'daily';
        const data = await alphaVantageService.getTimeSeries(symbol, avInterval, limit);
        return data.map(item => ({
          timestamp: new Date(item.date).getTime(),
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume)
        }));
      } catch (avErr) {
        logger.error(`AlphaVantage OHLCV failed for ${symbol}: ${avErr.message}`);
        throw new Error(`Could not fetch OHLCV for ${symbol}`);
      }
    }
  },

  getOrderBook: async (symbol, depth = 20) => {
    if (!/USDT|BTC|ETH|BUSD|USD$/.test(symbol)) {
      throw new Error(`Order book unavailable for ${symbol}`);
    }
    try {
      const data = await binanceService.getDepth(symbol, depth);
      return {
        symbol,
        timestamp: Date.now(),
        bids: data.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]),
        asks: data.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)])
      };
    } catch (err) {
      logger.error(`OrderBook failed for ${symbol}: ${err.message}`);
      throw new Error(`Could not fetch order book for ${symbol}`);
    }
  },

  getRecentTrades: async (symbol, limit = 50) => {
    if (!/USDT|BTC|ETH|BUSD|USD$/.test(symbol)) {
      throw new Error(`Recent trades unavailable for ${symbol}`);
    }
    try {
      const trades = await binanceService.getTrades(symbol, limit);
      return trades.map(t => ({
        id: t.id,
        timestamp: t.time,
        price: parseFloat(t.price),
        quantity: parseFloat(t.qty),
        isBuyer: t.isBuyerMaker
      }));
    } catch (err) {
      logger.error(`RecentTrades failed for ${symbol}: ${err.message}`);
      throw new Error(`Could not fetch trades for ${symbol}`);
    }
  },

  getMarketStats: async (symbol) => {
    const isCrypto = /USDT|BTC|ETH|BUSD|USD$/.test(symbol);
    if (isCrypto) {
      try {
        const d = await binanceService.get24hrTicker(symbol);
        return {
          symbol: d.symbol,
          priceChange: parseFloat(d.priceChange),
          priceChangePercent: parseFloat(d.priceChangePercent),
          lastPrice: parseFloat(d.lastPrice),
          highPrice: parseFloat(d.highPrice),
          lowPrice: parseFloat(d.lowPrice),
          volume: parseFloat(d.volume),
          quoteVolume: parseFloat(d.quoteVolume),
          timestamp: d.closeTime
        };
      } catch (err) {
        logger.error(`MarketStats failed for ${symbol}: ${err.message}`);
        throw new Error(`Could not fetch market stats for ${symbol}`);
      }
    } else {
      try {
        const q = await alphaVantageService.getQuote(symbol);
        const change = q.price - q.previousClose;
        return {
          symbol,
          priceChange: change,
          priceChangePercent: (change / q.previousClose) * 100,
          lastPrice: q.price,
          highPrice: q.high,
          lowPrice: q.low,
          volume: q.volume,
          quoteVolume: q.price * q.volume,
          timestamp: Date.now()
        };
      } catch (err) {
        logger.error(`MarketStats failed for ${symbol}: ${err.message}`);
        throw new Error(`Could not fetch market stats for ${symbol}`);
      }
    }
  },

  getAvailableSymbols: async (type = 'all') => {
    const symbols = [];
    if (type === 'all' || type === 'crypto') {
      try {
        const info = await binanceService.getExchangeInfo();
        symbols.push(
          ...info.symbols.filter(s => s.status === 'TRADING').map(s => ({
            symbol: s.symbol,
            baseAsset: s.baseAsset,
            quoteAsset: s.quoteAsset,
            type: 'crypto'
          }))
        );
      } catch (err) {
        logger.warn(`Crypto symbols load failed: ${err.message}`);
      }
    }
    if (type === 'all' || type === 'stocks') {
      try {
        const stockSymbols = await getPopularStockSymbols();
        symbols.push(
          ...stockSymbols.map(s => ({
            symbol: s,
            baseAsset: s,
            quoteAsset: 'USD',
            type: 'stock'
          }))
        );
      } catch (err) {
        logger.warn(`Stock symbols load failed: ${err.message}`);
      }
    }
    return symbols;
  }
};

// static helper for stocks
const getPopularStockSymbols = async () => {
  return [
    'AAPL','MSFT','GOOGL','AMZN','TSLA',
    'META','NVDA','JPM','V','JNJ',
    'WMT','BAC','PG','MA','DIS'
  ];
};

export const getLatestPrice = marketDataService.getCurrentPrice;

export default marketDataService;
