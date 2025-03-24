import express from 'express';
import User from '../models/User.js';
import OrderController from '../controllers/OrderController.js';
import logger from '../middleware/logger.js';

const router = express.Router();

// Order routes
router.get('/orders', OrderController.getOrders);
router.post('/orders', OrderController.createOrder);
router.get('/orders/:id', OrderController.getOrderById);
router.delete('/orders/:id', OrderController.cancelOrder);
router.get('/positions', OrderController.getPositions);
router.get('/orders-stats', OrderController.getOrdersStats);

// Get account info
router.get('/account', async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-apiKeys.secret');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // For demo, we'll use a simulated balance
    const balances = {
      'USDT': user.balance,
      'BTC': 0.02,
      'ETH': 0.5,
      'BNB': 2,
      'SOL': 10,
      'XRP': 100
    };
    
    res.status(200).json({
      balances,
      canTrade: user.tradingEnabled
    });
  } catch (error) {
    logger.error('Error fetching account info:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
