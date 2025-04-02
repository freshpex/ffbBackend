import express from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import axios from 'axios';

const router = express.Router();

// Get user's orders
router.get('/orders', asyncHandler(async (req, res) => {
  const { status, symbol, page = 1, limit = 10 } = req.query;
  
  const query = { user: req.user._id };
  
  if (status) {
    query.status = status;
  }
  
  if (symbol) {
    query.symbol = symbol;
  }
  
  const orders = await Order.find(query)
    .sort({ createdAt: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));
  
  const total = await Order.countDocuments(query);
  
  res.status(200).json({
    orders,
    page: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit)),
    total
  });
}));

// Place order
router.post('/order', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { symbol, side, type, quantity, price } = req.body;
    
    if (!symbol || !side || !type || !quantity) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    if (type === 'limit' && !price) {
      return res.status(400).json({ message: 'Price is required for limit orders' });
    }
    
    // Get current price if market order
    let orderPrice = price;
    
    if (type === 'market') {
      try {
        const response = await axios.get(`${process.env.BINANCE_API_URL}/ticker/price`, {
          params: { symbol }
        });
        orderPrice = parseFloat(response.data.price);
      } catch (error) {
        logger.error(`Error fetching price for ${symbol}:`, error);
        // For demo purposes, we'll use a mock price
        orderPrice = 5000; // Example price
      }
    }
    
    // Calculate total value
    const totalValue = quantity * orderPrice;
    
    // If buying, check if user has enough balance
    if (side === 'buy') {
      const user = await User.findById(req.user._id);
      
      if (user.balance < totalValue) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }
      
      // Deduct from balance
      user.balance -= totalValue;
      await user.save({ session });
      
      // Create transaction
      const transaction = new Transaction({
        user: user._id,
        type: 'investment',
        amount: -totalValue,
        currency: 'USD',
        status: 'completed',
        method: 'internal',
        description: `Buy order for ${quantity} ${symbol}`,
        processedAt: new Date()
      });
      
      await transaction.save({ session });
    }
    
    // Create order
    const order = new Order({
      user: req.user._id,
      symbol,
      side,
      type,
      quantity,
      price: orderPrice,
      status: 'new',
      clientOrderId: `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    });
    
    await order.save({ session });
    
    // If market order, execute immediately (simulate)
    if (type === 'market') {
      order.status = 'filled';
      order.filledQuantity = quantity;
      order.averagePrice = orderPrice;
      order.totalFilled = quantity * orderPrice;
      
      await order.save({ session });
      
      // If selling, add to balance
      if (side === 'sell') {
        const user = await User.findById(req.user._id);
        user.balance += totalValue;
        await user.save({ session });
        
        // Create transaction
        const transaction = new Transaction({
          user: user._id,
          type: 'investment',
          amount: totalValue,
          currency: 'USD',
          status: 'completed',
          method: 'internal',
          description: `Sell order for ${quantity} ${symbol}`,
          processedAt: new Date()
        });
        
        await transaction.save({ session });
      }
    }
    
    await session.commitTransaction();
    
    res.status(201).json({
      message: 'Order placed successfully',
      order
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error placing order:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
});

// Cancel order
router.delete('/order/:id', asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    if (order.status === 'filled' || order.status === 'canceled') {
      return res.status(400).json({ message: `Cannot cancel order with status: ${order.status}` });
    }
    
    order.status = 'canceled';
    await order.save({ session });
    
    // If buying, refund the balance
    if (order.side === 'buy' && order.type === 'limit') {
      const totalValue = order.quantity * order.price;
      
      const user = await User.findById(req.user._id);
      user.balance += totalValue;
      await user.save({ session });
      
      // Create refund transaction
      const transaction = new Transaction({
        user: user._id,
        type: 'investment',
        amount: totalValue,
        currency: 'USD',
        status: 'completed',
        method: 'internal',
        description: `Refund for canceled ${order.symbol} order`,
        processedAt: new Date()
      });
      
      await transaction.save({ session });
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      message: 'Order canceled successfully',
      order
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error canceling order:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
}));

// Get user's trading portfolio
router.get('/portfolio', asyncHandler(async (req, res) => {
  // This would normally fetch from a Portfolio collection
  // For demo purposes, we'll create a mock portfolio
  
  const mockPortfolio = [
    {
      symbol: 'BTC',
      quantity: 0.5,
      averagePrice: 35000,
      currentPrice: 38000,
      value: 19000,
      unrealizedPnL: 1500,
      unrealizedPnLPercent: 8.57
    },
    {
      symbol: 'ETH',
      quantity: 5,
      averagePrice: 2200,
      currentPrice: 2500,
      value: 12500,
      unrealizedPnL: 1500,
      unrealizedPnLPercent: 13.64
    },
    {
      symbol: 'ADA',
      quantity: 5000,
      averagePrice: 0.5,
      currentPrice: 0.55,
      value: 2750,
      unrealizedPnL: 250,
      unrealizedPnLPercent: 10
    }
  ];
  
  res.status(200).json({
    portfolio: mockPortfolio,
    totalValue: mockPortfolio.reduce((sum, asset) => sum + asset.value, 0),
    totalUnrealizedPnL: mockPortfolio.reduce((sum, asset) => sum + asset.unrealizedPnL, 0)
  });
}));

export default router;
