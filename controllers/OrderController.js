import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import logger from '../middleware/logger.js';
import axios from 'axios';

const BINANCE_API_URL = process.env.BINANCE_API_URL;

// Get all orders for a user with filtering
export const getOrders = async (req, res) => {
  try {
    const { symbol, status, limit = 50, page = 1 } = req.query;
    
    const query = { user: req.user.userId };
    
    if (symbol) {
      query.symbol = symbol;
    }
    
    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Order.countDocuments(query);
    
    res.status(200).json({
      orders,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      total
    });
  } catch (error) {
    logger.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Failed to retrieve orders' });
  }
};

// Get a single order by ID
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.userId
    });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.status(200).json(order);
  } catch (error) {
    logger.error('Error fetching order details:', error);
    res.status(500).json({ message: 'Failed to retrieve order details' });
  }
};

// Create a new order
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { symbol, side, type, quantity, price, stopPrice } = req.body;
    
    if (!symbol || !side || !type || !quantity) {
      return res.status(400).json({ message: 'Missing required order parameters' });
    }
    
    // Validate quantity and price
    if (quantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be greater than 0' });
    }
    
    if (['limit', 'stop_limit'].includes(type) && (!price || price <= 0)) {
      return res.status(400).json({ message: 'Price must be provided and greater than 0' });
    }
    
    if (type === 'stop_limit' && (!stopPrice || stopPrice <= 0)) {
      return res.status(400).json({ message: 'Stop price must be provided and greater than 0' });
    }
    
    // Get current market price
    const marketPrice = price || await getMarketPrice(symbol);
    
    // Calculate order value
    const orderValue = quantity * marketPrice;
    
    // Check if user has enough balance
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // For simplicity, we're assuming the user has a USD balance
    // In a real app, you'd check the specific asset balance
    if (side === 'buy' && user.balance < orderValue) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    // Create order
    const order = new Order({
      user: req.user.userId,
      symbol,
      type,
      side,
      price: type === 'market' ? marketPrice : price,
      stopPrice: type === 'stop_limit' ? stopPrice : undefined,
      quantity,
      status: 'new'
    });
    
    await order.save({ session });
    
    // For market orders, execute immediately
    if (type === 'market') {
      order.status = 'filled';
      order.executedQuantity = quantity;
      order.executionPrice = marketPrice;
      order.updatedAt = new Date();
      
      // Update user balance
      if (side === 'buy') {
        await User.findByIdAndUpdate(
          req.user.userId,
          { $inc: { balance: -orderValue } },
          { session }
        );
        
        // Log successful purchase
        logger.info(`User ${req.user.userId} purchased ${quantity} ${symbol} at ${marketPrice}`);
      } else {
        await User.findByIdAndUpdate(
          req.user.userId,
          { $inc: { balance: orderValue } },
          { session }
        );
        
        // Log successful sale
        logger.info(`User ${req.user.userId} sold ${quantity} ${symbol} at ${marketPrice}`);
      }
      
      await order.save({ session });
    }
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    logger.error('Error creating order:', error);
    res.status(500).json({ message: 'Failed to place order' });
  }
};

// Cancel an order
export const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.userId,
      status: { $in: ['new', 'partially_filled'] }
    });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found or cannot be cancelled' });
    }
    
    order.status = 'canceled';
    order.updatedAt = new Date();
    
    await order.save({ session });
    
    // If the order is partially filled, return the remaining balance to the user
    if (order.status === 'partially_filled' && order.side === 'buy') {
      const remainingQuantity = order.quantity - (order.executedQuantity || 0);
      const refundAmount = remainingQuantity * order.price;
      
      if (refundAmount > 0) {
        await User.findByIdAndUpdate(
          req.user.userId,
          { $inc: { balance: refundAmount } },
          { session }
        );
        
        logger.info(`Refunded ${refundAmount} to user ${req.user.userId} for canceled order ${order._id}`);
      }
    }
    
    await session.commitTransaction();
    session.endSession();
    
    logger.info(`User ${req.user.userId} canceled order ${order._id}`);
    
    res.status(200).json({
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    logger.error('Error cancelling order:', error);
    res.status(500).json({ message: 'Failed to cancel order' });
  }
};

// Get user's active positions
export const getPositions = async (req, res) => {
  try {
    // This is demo data
    const positions = [
      {
        symbol: 'BTCUSDT',
        entryPrice: 28500.00,
        markPrice: 28750.00,
        pnl: 250.00,
        roe: 0.87,
        amount: 0.01,
        updateTime: new Date().getTime()
      },
      {
        symbol: 'ETHUSDT',
        entryPrice: 1750.00,
        markPrice: 1820.00,
        pnl: 70.00,
        roe: 4.00,
        amount: 0.1,
        updateTime: new Date().getTime()
      }
    ];
    
    res.status(200).json({ positions });
  } catch (error) {
    logger.error('Error fetching positions:', error);
    res.status(500).json({ message: 'Failed to retrieve positions' });
  }
};

// Get orders performance summary
export const getOrdersStats = async (req, res) => {
  try {
    const filledOrders = await Order.find({
      user: req.user.userId,
      status: 'filled'
    });
    
    let totalPnL = 0;
    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    
    // Calculate total orders by side
    const buyOrders = filledOrders.filter(order => order.side === 'buy');
    const sellOrders = filledOrders.filter(order => order.side === 'sell');
    
    buyOrders.forEach(order => {
      totalBuyVolume += order.quantity * order.executionPrice || order.price;
    });
    
    sellOrders.forEach(order => {
      totalSellVolume += order.quantity * order.executionPrice || order.price;
    });
    
    // P&L calculation
    totalPnL = totalSellVolume - totalBuyVolume;
    
    const recentOrders = await Order.find({
      user: req.user.userId
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    res.status(200).json({
      totalOrders: filledOrders.length,
      buyOrders: buyOrders.length,
      sellOrders: sellOrders.length,
      totalBuyVolume,
      totalSellVolume,
      totalPnL,
      recentOrders
    });
  } catch (error) {
    logger.error('Error fetching order stats:', error);
    res.status(500).json({ message: 'Failed to retrieve order statistics' });
  }
};

// Helper function to get market price
async function getMarketPrice(symbol) {
  try {
    const response = await axios.get(`${BINANCE_API_URL}/ticker/price?symbol=${symbol}`);
    return parseFloat(response.data.price);
  } catch (error) {
    logger.error(`Error fetching market price for ${symbol}:`, error);
    throw new Error('Could not get current market price');
  }
}

export default {
  getOrders,
  getOrderById,
  createOrder,
  cancelOrder,
  getPositions,
  getOrdersStats
};
