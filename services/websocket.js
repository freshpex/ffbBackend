import logger from '../middleware/logger.js';
import axios from 'axios';
import { verifySocketToken } from '../middleware/auth.js';
import { callWithRetry } from '../utils/apiHelper.js';
import { checkMemoryUsage } from '../middleware/performance.js';

// Market data cache to avoid redundant API calls
const marketDataCache = {
  tickers: {},
  lastFetch: 0,
  failureCount: 0,
  isInFailureMode: false
};

// Updated Binance API endpoints based on working curl tests
const BINANCE_API_ENDPOINTS = [
  process.env.BINANCE_API_URL,        // Primary working link
  'https://testnet.binance.vision/api/v3', // Testnet as fallback
];

// Default market data in case all APIs fail
const DEFAULT_TICKERS = {
  'BTCUSDT': '59875.00',
  'ETHUSDT': '3245.00',
  'SOLUSDT': '162.50',
  'BNBUSDT': '578.00',
  'XRPUSDT': '0.5490',
  'DOGEUSDT': '0.1634',
  'ADAUSDT': '0.4563',
  'DOTUSDT': '7.3210',
  'MATICUSDT': '0.7825'
};

// Setup WebSocket server with Socket.io
export const setupWebSockets = (io) => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      // During development, accept connections without token
      if (process.env.NODE_ENV === 'development' && !token) {
        socket.user = { userId: 'anonymous-dev-user' };
        return next();
      }
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }
      
      try {
        const user = await verifySocketToken(token);
        socket.user = user;
        next();
      } catch (error) {
        return next(new Error('Authentication error: Invalid token'));
      }
    } catch (error) {
      logger.error('WebSocket auth error:', { message: error.message });
      return next(new Error('Authentication error'));
    }
  });
  
  // Handle client connections
  io.on('connection', (socket) => {
    // Log connection with safe user ID
    const userId = socket.user?.userId || 'unknown';
    logger.info(`Socket connected: ${socket.id}, User: ${userId}`);
    
    // Join personal room for user-specific notifications
    socket.join(`user:${userId}`);
    
    // Handle subscription to ticker updates
    socket.on('subscribe:tickers', async (symbols) => {
      if (!Array.isArray(symbols)) {
        symbols = [symbols];
      }
      
      // Store user's subscriptions
      socket.symbols = symbols;
      
      // Join rooms for each symbol
      symbols.forEach(symbol => {
        socket.join(`ticker:${symbol}`);
        logger.debug(`User ${userId} subscribed to ${symbol}`);
      });
      
      // Send initial ticker data
      sendTickerData(socket, symbols);
    });
    
    // Handle unsubscribing from ticker updates
    socket.on('unsubscribe:tickers', (symbols) => {
      if (!Array.isArray(symbols)) {
        symbols = [symbols];
      }
      
      symbols.forEach(symbol => {
        socket.leave(`ticker:${symbol}`);
        logger.debug(`User ${userId} unsubscribed from ${symbol}`);
      });
    });
    
    // Handle order updates
    socket.on('order:update', (data) => {
      // Broadcast order update to user's personal room
      io.to(`user:${userId}`).emit('order:updated', data);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
  
  // Setup periodic ticker updates with progressive backoff
  let updateInterval = 5000;
  
  const updateTicker = async () => {
    try {
      await updateTickerData(io);
      
      // If successful and we were in failure mode, reset failure settings
      if (marketDataCache.isInFailureMode) {
        marketDataCache.isInFailureMode = false;
        marketDataCache.failureCount = 0;
        updateInterval = 5000;
      }
    } catch (error) {
      marketDataCache.failureCount++;
      
      // Enter failure mode after 3 consecutive failures
      if (marketDataCache.failureCount >= 3) {
        marketDataCache.isInFailureMode = true;
        
        // Increase interval with each failure, up to 60 seconds
        updateInterval = Math.min(updateInterval * 1.5, 60000);
        
        logger.warn(`Ticker update failures: ${marketDataCache.failureCount}. Using backup data. Next attempt in ${updateInterval/1000}s`);
        
        // Use backup data in failure mode
        provideBackupTickerData(io);
        
        // Check memory usage during failures
        checkMemoryUsage();
      }
    } finally {
      // Schedule next update with current interval
      setTimeout(updateTicker, updateInterval);
    }
  };
  
  // Start the ticker updates
  updateTicker();
};

// Enhanced fetch with retry logic for Binance API using the new helper
async function fetchFromBinanceAPI(endpoint, path, params = {}) {
  const serviceId = `binance-websocket-${path}`;
  const url = `${endpoint}/${path}`;
  
  // List of public endpoints that don't require timestamp
  const publicEndpoints = ['ticker/price', 'ticker/24hr', 'ticker/bookTicker', 'exchangeInfo', 'ping', 'time', 'depth', 'trades', 'klines'];
  
  // Setup API call
  const apiCall = () => {
    // Only add timestamp for authenticated endpoints (not in publicEndpoints list)
    const requestParams = { ...params };
    if (!publicEndpoints.some(pubPath => path.includes(pubPath))) {
      requestParams.timestamp = Date.now();
    }
    
    const queryParams = new URLSearchParams(requestParams).toString();
    
    // Use axios with appropriate timeout
    return axios.get(`${url}${queryParams ? `?${queryParams}` : ''}`, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
  };
  
  // Use enhanced retry mechanism
  const response = await callWithRetry(
    apiCall,
    {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 10000,
      fallbackData: { data: null }
    },
    serviceId
  );
  
  return response.data;
}

// Fetch and broadcast ticker data to subscribers with robust error handling
async function updateTickerData(io) {
  const now = Date.now();
  if (now - marketDataCache.lastFetch < 4900) {
    return;
  }
  
  // Try each endpoint until one works using the improved API helper
  const serviceId = 'binance-ticker-price';
  
  const fetchTickerData = async () => {
    for (let i = 0; i < BINANCE_API_ENDPOINTS.length; i++) {
      try {
        const data = await fetchFromBinanceAPI(BINANCE_API_ENDPOINTS[i], 'ticker/price');
        if (data) {
          logger.debug(`Successfully fetched ticker data from ${BINANCE_API_ENDPOINTS[i]}`);
          return data;
        }
      } catch (err) {
        logger.debug(`API endpoint ${i+1} failed: ${err.message}`);
        continue; // Try the next endpoint
      }
    }
    return null;
  };
  
  // Use callWithRetry for the entire process
  const tickerData = await callWithRetry(
    fetchTickerData,
    {
      maxRetries: 1,
      fallbackData: null
    },
    serviceId
  );
  
  // If all endpoints failed, use fallback data
  if (!tickerData) {
    logger.error(`All Binance API endpoints failed after 3 attempts, using fallback data`);
    marketDataCache.failureCount++;
    if (marketDataCache.failureCount >= 3) {
      marketDataCache.isInFailureMode = true;
      logger.warn(`Entered API failure mode after ${marketDataCache.failureCount} consecutive failures`);
      provideBackupTickerData(io);
    }
    return;
  }
  
  // Update cache with the successful response
  tickerData.forEach(ticker => {
    marketDataCache.tickers[ticker.symbol] = ticker.price;
  });
  marketDataCache.lastFetch = now;
  
  // Send updates to each room
  Object.keys(marketDataCache.tickers).forEach(symbol => {
    const room = `ticker:${symbol}`;
    
    if (io.sockets.adapter.rooms.has(room)) {
      io.to(room).emit('ticker:update', {
        symbol,
        price: marketDataCache.tickers[symbol],
        timestamp: now
      });
    }
  });
}

// Generate mock ticker data for development
function generateMockTickerData() {
  const mockSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 
                       'DOGEUSDT', 'ADAUSDT', 'DOTUSDT', 'MATICUSDT', 'AVAXUSDT'];
  
  return mockSymbols.map(symbol => {
    const basePrice = DEFAULT_TICKERS[symbol] || (Math.random() * 10000).toFixed(2);
    
    // Add small random variation to make it look dynamic
    const variation = parseFloat(basePrice) * (Math.random() * 0.02 - 0.01); // ±1%
    const price = (parseFloat(basePrice) + variation).toFixed(symbol.includes('BTC') ? 2 : 4);
    
    return { symbol, price };
  });
}

// Provide backup ticker data when API calls fail
function provideBackupTickerData(io) {
  const now = Date.now();
  
  // Use existing cache or default values
  const tickerData = marketDataCache.tickers || DEFAULT_TICKERS;
  
  // Add small random variations to make prices look real
  Object.keys(tickerData).forEach(symbol => {
    const currentPrice = parseFloat(tickerData[symbol]);
    const variance = currentPrice * (Math.random() * 0.01 - 0.005);
    tickerData[symbol] = (currentPrice + variance).toFixed(2);
    
    // Send to subscribed clients
    const room = `ticker:${symbol}`;
    if (io.sockets.adapter.rooms.has(room)) {
      io.to(room).emit('ticker:update', {
        symbol,
        price: tickerData[symbol],
        timestamp: now,
        isBackup: true
      });
    }
  });
  
  // Update the cache with the new values
  marketDataCache.tickers = tickerData;
  marketDataCache.lastFetch = now;
  
  logger.info('Provided backup ticker data during API outage');
}

// Send initial ticker data to a specific socket
async function sendTickerData(socket, symbols) {
  try {
    const now = Date.now();
    if (now - marketDataCache.lastFetch > 10000) {
      try {
        const response = await axios.get(`${process.env.BINANCE_API_URL}/ticker/price`, {
          timeout: 10000,
        });
        
        // Update cache
        response.data.forEach(ticker => {
          marketDataCache.tickers[ticker.symbol] = ticker.price;
        });
        marketDataCache.lastFetch = now;
      } catch (error) {
        logger.error('Error fetching initial ticker data:', { 
          message: error.message,
          name: error.name,
          code: error.code
        });
      }
    }
    
    // Send data for requested symbols
    const sentSymbols = [];
    symbols.forEach(symbol => {
      if (marketDataCache.tickers[symbol]) {
        socket.emit('ticker:update', {
          symbol,
          price: marketDataCache.tickers[symbol],
          timestamp: now
        });
        sentSymbols.push(symbol);
      }
    });
    
    if (sentSymbols.length > 0) {
      logger.debug(`Sent initial ticker data for ${sentSymbols.length} symbols to user ${socket.user.userId}`);
    }
  } catch (error) {
    logger.error('Error sending initial ticker data:', { 
      message: error.message,
      name: error.name
    });
  }
}

export default { setupWebSockets };
