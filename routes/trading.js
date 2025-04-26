import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import OrderController from '../controllers/OrderController.js';
import { tradingLimiter as rateLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Apply authentication middleware to all trading routes
router.use(verifyToken);

// Get market data for trading
router.get('/market-data', async (req, res, next) => {
  try {
    // This is a placeholder - in a real app you would call your market data service
    const { symbol } = req.query;
    
    // Sample data
    const data = {
      "BTC/USDT": {
        symbol: 'BTC/USDT',
        lastPrice: 60421.50,
        priceChange: 2.35,
        high24h: 61000.00,
        low24h: 59800.00,
        volume24h: 2145.38,
      },
      "ETH/USDT": {
        symbol: 'ETH/USDT',
        lastPrice: 3592.75,
        priceChange: 1.27,
        high24h: 3650.00,
        low24h: 3550.20,
        volume24h: 15423.21,
      },
      // Add more sample data as needed
    };
    
    const response = symbol ? { [symbol]: data[symbol] } : data;
    
    res.status(200).json({
      success: true,
      data: response
    });
  } catch (error) {
    next(error);
  }
});

// Get available trading pairs
router.get('/pairs', async (req, res, next) => {
  try {
    // This would come from your market data service in a real app
    const pairs = [
      { symbol: 'BTC/USDT', name: 'Bitcoin', type: 'crypto', lastPrice: 60421.50, priceChange: 2.35 },
      { symbol: 'ETH/USDT', name: 'Ethereum', type: 'crypto', lastPrice: 3592.75, priceChange: 1.27 },
      { symbol: 'XRP/USDT', name: 'Ripple', type: 'crypto', lastPrice: 0.5923, priceChange: -0.42 },
      { symbol: 'SOL/USDT', name: 'Solana', type: 'crypto', lastPrice: 143.82, priceChange: 5.67 },
      { symbol: 'ADA/USDT', name: 'Cardano', lastPrice: 0.451, priceChange: 0.23 },
      { symbol: 'DOGE/USDT', name: 'Dogecoin', type: 'crypto', lastPrice: 0.1287, priceChange: -1.32 },
      { symbol: 'AAPL/USD', name: 'Apple Inc', type: 'stock', lastPrice: 175.92, priceChange: 0.87 },
      { symbol: 'MSFT/USD', name: 'Microsoft', type: 'stock', lastPrice: 415.50, priceChange: 1.43 },
      { symbol: 'GOOGL/USD', name: 'Alphabet', type: 'stock', lastPrice: 176.42, priceChange: 2.10 },
      { symbol: 'AMZN/USD', name: 'Amazon', type: 'stock', lastPrice: 182.15, priceChange: -0.34 },
      { symbol: 'TSLA/USD', name: 'Tesla', type: 'stock', lastPrice: 245.23, priceChange: 3.78 },
    ];
    
    res.status(200).json({
      success: true,
      data: pairs
    });
  } catch (error) {
    next(error);
  }
});

// Get orderbook for a trading pair
router.get('/orderbook', async (req, res, next) => {
  try {
    const { symbol } = req.query;
    
    if (!symbol) {
      return res.status(400).json({
        success: false,
        message: 'Symbol is required'
      });
    }
    
    // This would come from your market data service in a real app
    // Here's sample data
    const orderbook = {
      symbol,
      bids: [
        [60410.50, 0.25],
        [60405.20, 0.5],
        [60400.00, 1.2],
        [60390.75, 2.3],
        [60380.00, 3.1],
      ],
      asks: [
        [60425.00, 0.15],
        [60430.50, 0.35],
        [60440.00, 1.0],
        [60450.25, 1.8],
        [60460.00, 2.5],
      ],
      timestamp: Date.now()
    };
    
    res.status(200).json({
      success: true,
      data: orderbook
    });
  } catch (error) {
    next(error);
  }
});

// User orders CRUD endpoints
router.get('/orders', OrderController.getUserOrders);
router.get('/orders/:id', OrderController.getOrder);
router.post('/orders',  OrderController.placeOrder);
router.delete('/orders/:id', OrderController.cancelOrder);

// Trading history
router.get('/history', OrderController.getTradingHistory);

// Portfolio
router.get('/portfolio', OrderController.getPortfolio);

// Get order statistics and performance metrics
router.get('/stats', asyncHandler(OrderController.getOrdersStats));

export default router;
