import express from 'express';
import axios from 'axios';
import logger from '../middleware/logger.js';
import config from '../config/config.js';
import { callWithRetry } from '../utils/apiHelper.js';

const router = express.Router();

const BINANCE_API_ENDPOINTS = [
  process.env.BINANCE_API_URL,        // Primary working link
  'https://testnet.binance.vision/api/v3', // Testnet as fallback
];

async function fetchBinanceData(path, params = {}) {
  const MAX_RETRY_ATTEMPTS = 3;
  const serviceId = `binance-${path}`;
  
  // List of public endpoints that don't require timestamp
  const publicEndpoints = ['ticker/price', 'ticker/24hr', 'ticker/bookTicker', 'exchangeInfo', 'ping', 'time', 'depth', 'trades', 'klines'];
  
  // Try primary Binance endpoint with circuit breaker
  try {
    const baseUrl = BINANCE_API_ENDPOINTS[0];
    const url = new URL(`${baseUrl}/${path}`);
    
    // Add all parameters from params object
    Object.keys(params).forEach(key => {
      url.searchParams.append(key, params[key]);
    });
    
    const apiCall = () => axios.get(url.toString(), {
      timeout: 10000,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    // Setup fallback function for using mock data in development
    const useMockData = process.env.NODE_ENV === 'development' && process.env.USE_MOCK_DATA === 'true';
    const fallbackFunction = useMockData 
      ? () => {
          logger.info(`Using mock data for Binance endpoint: ${path}`);
          return generateMockData(path, params);
        }
      : null;
    
    const response = await callWithRetry(
      apiCall,
      {
        maxRetries: MAX_RETRY_ATTEMPTS,
        retryDelay: 1000,
        timeout: 10000,
        fallbackFunction
      },
      serviceId
    );
    
    return response.data;
  } catch (primaryError) {
    logger.debug(`Primary Binance endpoint failed for ${path}: ${primaryError.message}`);
    
    try {
      const baseUrl = BINANCE_API_ENDPOINTS[1];
      const url = new URL(`${baseUrl}/${path}`);
      
      Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
      });
      
      logger.debug(`Trying fallback Binance endpoint: ${url.toString()}`);
      
      const response = await axios.get(url.toString(), {
        timeout: 10000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      return response.data;
    } catch (fallbackError) {
      logger.error(`All Binance endpoints failed for ${path}`, {
        primaryError: primaryError.message,
        fallbackError: fallbackError.message
      });
      
      // In development mode, use mock data
      if (process.env.NODE_ENV === 'development' && process.env.USE_MOCK_DATA === 'true') {
        logger.info(`Using mock data for Binance endpoint: ${path}`);
        return generateMockData(path, params);
      }
      
      throw new Error(`All Binance API endpoints failed for ${path}`);
    }
  }
}

function generateMockData(path, params) {
  logger.info(`Using mock data for ${path}`);
  
  // Test connectivity endpoint
  if (path === 'ping') {
    return {};
  }
  
  // Server time endpoint
  if (path === 'time') {
    return { serverTime: Date.now() };
  }

  // Exchange info endpoint
  if (path === 'exchangeInfo') {
    return {
      timezone: "UTC",
      serverTime: Date.now(),
      rateLimits: [
        {
          rateLimitType: "REQUEST_WEIGHT",
          interval: "MINUTE",
          intervalNum: 1,
          limit: 1200
        }
      ],
      exchangeFilters: [],
      symbols: [
        {
          symbol: "BTCUSDT",
          status: "TRADING",
          baseAsset: "BTC",
          baseAssetPrecision: 8,
          quoteAsset: "USDT",
          quotePrecision: 8,
          quoteAssetPrecision: 8,
          orderTypes: ["LIMIT", "MARKET"],
          icebergAllowed: true,
          ocoAllowed: true,
          isSpotTradingAllowed: true,
          isMarginTradingAllowed: true,
          filters: [],
          permissions: ["SPOT", "MARGIN"]
        },
        {
          symbol: "ETHUSDT",
          status: "TRADING",
          baseAsset: "ETH",
          baseAssetPrecision: 8,
          quoteAsset: "USDT",
          quotePrecision: 8,
          quoteAssetPrecision: 8,
          orderTypes: ["LIMIT", "MARKET"],
          icebergAllowed: true,
          ocoAllowed: true,
          isSpotTradingAllowed: true,
          isMarginTradingAllowed: true,
          filters: [],
          permissions: ["SPOT", "MARGIN"]
        }
      ]
    };
  }
  
  // Ticker price endpoint
  if (path === 'ticker/price') {
    const mockPrices = {
      'BTCUSDT': '59875.23',
      'ETHUSDT': '3245.78',
      'SOLUSDT': '162.50',
      'BNBUSDT': '578.34',
      'XRPUSDT': '0.5490',
      'DOGEUSDT': '0.1634',
      'ADAUSDT': '0.4563',
      'DOTUSDT': '7.3210',
      'MATICUSDT': '0.7825',
      'AVAXUSDT': '34.76'
    };

    const symbols = params.symbols ? JSON.parse(params.symbols) : 
                   (params.symbol ? [params.symbol] : Object.keys(mockPrices));

    if (params.symbol) {
      return { 
        symbol: params.symbol,
        price: mockPrices[params.symbol] || (Math.random() * 10000).toFixed(2)
      };
    }

    return symbols.map(symbol => ({
      symbol,
      price: mockPrices[symbol] || (Math.random() * 10000).toFixed(2)
    }));
  }
  
  // 24hr ticker statistics
  if (path === 'ticker/24hr') {
    const symbol = params.symbol || 'BTCUSDT';
    const basePrice = parseFloat((Math.random() * 50000 + 10000).toFixed(2));
    const priceChange = parseFloat((Math.random() * 1000 - 500).toFixed(2));
    
    const mockData = {
      symbol,
      priceChange: priceChange.toString(),
      priceChangePercent: (priceChange / basePrice * 100).toFixed(3),
      weightedAvgPrice: (basePrice + Math.random() * 100).toFixed(8),
      prevClosePrice: (basePrice - Math.random() * 100).toFixed(8),
      lastPrice: (basePrice + priceChange).toFixed(8),
      lastQty: (Math.random() * 10).toFixed(8),
      bidPrice: (basePrice + priceChange - Math.random() * 10).toFixed(8),
      bidQty: (Math.random() * 10).toFixed(8),
      askPrice: (basePrice + priceChange + Math.random() * 10).toFixed(8),
      askQty: (Math.random() * 10).toFixed(8),
      openPrice: basePrice.toFixed(8),
      highPrice: (basePrice + Math.random() * 200).toFixed(8),
      lowPrice: (basePrice - Math.random() * 200).toFixed(8),
      volume: (Math.random() * 10000).toFixed(8),
      quoteVolume: (Math.random() * 500000000).toFixed(8),
      openTime: Date.now() - 86400000,
      closeTime: Date.now(),
      firstId: 12345678,
      lastId: 12345678 + Math.floor(Math.random() * 10000),
      count: Math.floor(Math.random() * 100000)
    };

    if (params.symbols) {
      const symbols = JSON.parse(params.symbols);
      return symbols.map(sym => ({
        ...mockData,
        symbol: sym,
        lastPrice: (basePrice + Math.random() * 1000 - 500).toFixed(8)
      }));
    }

    return mockData;
  }

  // Book ticker
  if (path === 'ticker/bookTicker') {
    const symbol = params.symbol || 'BTCUSDT';
    const basePrice = parseFloat((Math.random() * 50000 + 10000).toFixed(2));
    
    const mockData = {
      symbol,
      bidPrice: (basePrice - Math.random() * 10).toFixed(8),
      bidQty: (Math.random() * 10).toFixed(8),
      askPrice: (basePrice + Math.random() * 10).toFixed(8),
      askQty: (Math.random() * 10).toFixed(8)
    };

    if (params.symbols) {
      const symbols = JSON.parse(params.symbols);
      return symbols.map(sym => ({
        ...mockData,
        symbol: sym,
        bidPrice: (basePrice + Math.random() * 1000 - 500).toFixed(8)
      }));
    }

    return mockData;
  }
  
  // Trading day ticker
  if (path === 'ticker/tradingDay') {
    const symbol = params.symbol || 'BTCUSDT';
    const basePrice = parseFloat((Math.random() * 50000 + 10000).toFixed(2));
    const priceChange = parseFloat((Math.random() * 1000 - 500).toFixed(2));
    
    const mockData = {
      symbol,
      priceChange: priceChange.toString(),
      priceChangePercent: (priceChange / basePrice * 100).toFixed(3),
      weightedAvgPrice: (basePrice + Math.random() * 100).toFixed(8),
      openPrice: basePrice.toFixed(8),
      highPrice: (basePrice + Math.random() * 200).toFixed(8),
      lowPrice: (basePrice - Math.random() * 200).toFixed(8),
      lastPrice: (basePrice + priceChange).toFixed(8),
      volume: (Math.random() * 10000).toFixed(8),
      quoteVolume: (Math.random() * 500000000).toFixed(8),
      openTime: Date.now() - 86400000,
      closeTime: Date.now(),
      firstId: 12345678,
      lastId: 12345678 + Math.floor(Math.random() * 10000),
      count: Math.floor(Math.random() * 100000)
    };

    if (params.symbols) {
      const symbols = JSON.parse(params.symbols);
      return symbols.map(sym => ({
        ...mockData,
        symbol: sym,
        lastPrice: (basePrice + Math.random() * 1000 - 500).toFixed(8)
      }));
    }

    return mockData;
  }
  
  return { mock: true, path, params };
}

router.get('/ping', async (req, res) => {
  try {
    const data = await fetchBinanceData('ping');
    res.status(200).json(data);
  } catch (error) {
    logger.error('Error testing API connectivity:', { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/time', async (req, res) => {
  try {
    const data = await fetchBinanceData('time');
    res.status(200).json(data);
  } catch (error) {
    logger.error('Error fetching server time:', { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/exchangeInfo', async (req, res) => {
  try {
    const { symbol, symbols, permissions } = req.query;
    const params = {};
    
    if (symbol) params.symbol = symbol;
    if (symbols) params.symbols = symbols;
    if (permissions) params.permissions = permissions;
    
    const data = await fetchBinanceData('exchangeInfo', params);
    res.status(200).json(data);
  } catch (error) {
    logger.error('Error fetching exchange info:', { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/ticker/24hr', async (req, res) => {
  try {
    const { symbol, symbols, type } = req.query;
    const params = {};
    
    if (symbol) params.symbol = symbol;
    if (symbols) params.symbols = symbols;
    if (type) params.type = type;
    
    const data = await fetchBinanceData('ticker/24hr', params);
    res.status(200).json(data);
  } catch (error) {
    logger.error('Error fetching 24hr stats:', { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/ticker/tradingDay', async (req, res) => {
  try {
    const { symbol, symbols, timeZone, type } = req.query;
    const params = {};
    
    if (symbol) params.symbol = symbol;
    if (symbols) params.symbols = symbols;
    if (timeZone) params.timeZone = timeZone;
    if (type) params.type = type;
    
    const data = await fetchBinanceData('ticker/tradingDay', params);
    res.status(200).json(data);
  } catch (error) {
    logger.error('Error fetching trading day ticker:', { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/ticker/price', async (req, res) => {
  try {
    const { symbol, symbols } = req.query;
    const params = {};
    
    if (symbol) params.symbol = symbol;
    if (symbols) params.symbols = symbols;
    
    const data = await fetchBinanceData('ticker/price', params);
    res.status(200).json(data);
  } catch (error) {
    logger.error('Error fetching ticker prices:', { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/ticker/bookTicker', async (req, res) => {
  try {
    const { symbol, symbols } = req.query;
    const params = {};
    
    if (symbol) params.symbol = symbol;
    if (symbols) params.symbols = symbols;
    
    const data = await fetchBinanceData('ticker/bookTicker', params);
    res.status(200).json(data);
  } catch (error) {
    logger.error('Error fetching book ticker:', { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/ticker', async (req, res) => {
  try {
    const { symbol, windowSize, type } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ 
        message: 'Symbol parameter is required for this endpoint'
      });
    }
    
    const params = { symbol };
    if (windowSize) params.windowSize = windowSize;
    if (type) params.type = type;
    
    const data = await fetchBinanceData('ticker', params);
    res.status(200).json(data);
  } catch (error) {
    logger.error('Error fetching rolling window stats:', { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get market depth
router.get('/depth/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 100 } = req.query;
    
    const data = await fetchBinanceData('depth', { symbol, limit });
    res.status(200).json(data);
  } catch (error) {
    logger.error(`Error fetching market depth for ${req.params.symbol}:`, { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get klines/candlestick data
router.get('/klines/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = '1h', limit = 500 } = req.query;
    
    const data = await fetchBinanceData('klines', { symbol, interval, limit });
    
    // Format the response into OHLC format
    const formattedData = Array.isArray(data) ? data.map(kline => ({
      time: kline[0], // Open time
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: kline[6],
      quoteAssetVolume: parseFloat(kline[7]),
      trades: kline[8],
      takerBuyBaseAssetVolume: parseFloat(kline[9]),
      takerBuyQuoteAssetVolume: parseFloat(kline[10])
    })) : [];
    
    res.status(200).json(formattedData);
  } catch (error) {
    logger.error(`Error fetching klines for ${req.params.symbol}:`, { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get recent trades
router.get('/trades/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 50 } = req.query;
    
    const data = await fetchBinanceData('trades', { symbol, limit });
    res.status(200).json(data);
  } catch (error) {
    logger.error(`Error fetching trades for ${req.params.symbol}:`, { message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add CoinGecko proxy endpoint
router.get('/proxy/coingecko/:endpoint(*)', async (req, res) => {
  try {
    const { endpoint } = req.params;
    const queryString = new URLSearchParams(req.query).toString();
    const url = `https://api.coingecko.com/api/v3/${endpoint}${queryString ? `?${queryString}` : ''}`;
    
    logger.debug(`Proxying CoinGecko request to: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Node.js Proxy'
      },
      timeout: 10000
    });
    
    res.status(200).json(response.data);
  } catch (error) {
    logger.error('Error proxying CoinGecko request:', { 
      message: error.message,
      endpoint: req.params.endpoint 
    });
    
    // Pass along CoinGecko's error status if available
    const status = error.response?.status || 500;
    res.status(status).json({ 
      message: 'Error fetching data from CoinGecko',
      error: error.response?.data || error.message
    });
  }
});

export default router;
