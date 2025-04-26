import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import logger from '../middleware/logger.js';
import marketDataService from '../services/marketDataService.js';
import binanceService from '../services/binanceService.js';
import { ApiError } from '../middleware/errorHandler.js';
import { getLatestPrice } from '../services/marketDataService.js';

/**
 * Get user's orders with pagination and filtering
 */
export const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { symbol, status, type, side, page = 1, limit = 10 } = req.query;
    
    // Build query
    const query = { user: userId };
    
    // Apply filters if provided
    if (symbol) query.symbol = symbol;
    if (status) query.status = status;
    if (type) query.type = type;
    if (side) query.side = side;
    
    // Count total
    const total = await Order.countDocuments(query);
    
    // Get orders with pagination
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user orders:', error);
    next(error);
  }
};

/**
 * Get a specific order by ID
 */
export const getOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    
    const order = await Order.findOne({
      _id: id,
      user: userId
    });
    
    if (!order) {
      throw new ApiError('Order not found', 404);
    }
    
    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    logger.error(`Error fetching order ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Place a new order (buy or sell)
 */
export const placeOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const userId = req.user._id;
    const { symbol, side, type, quantity, price, stopPrice } = req.body;
    
    // Basic validation
    if (!symbol) {
      throw new ApiError('Trading symbol is required', 400);
    }
    
    if (!side || !['buy', 'sell'].includes(side)) {
      throw new ApiError('Valid order side (buy/sell) is required', 400);
    }
    
    if (!type || !['market', 'limit', 'stop', 'stop_limit'].includes(type)) {
      throw new ApiError('Valid order type is required', 400);
    }
    
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      throw new ApiError('Valid quantity is required', 400);
    }
    
    // For limit and stop_limit orders, price is required
    if ((type === 'limit' || type === 'stop_limit') && (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0)) {
      throw new ApiError('Valid price is required for limit orders', 400);
    }
    
    // For stop and stop_limit orders, stopPrice is required
    if ((type === 'stop' || type === 'stop_limit') && (!stopPrice || isNaN(parseFloat(stopPrice)) || parseFloat(stopPrice) <= 0)) {
      throw new ApiError('Valid stop price is required for stop orders', 400);
    }
    
    // Parse the values
    const parsedQuantity = parseFloat(quantity);
    const parsedPrice = parseFloat(price || 0);
    const parsedStopPrice = parseFloat(stopPrice || 0);
    
    // Get user
    const user = await User.findById(userId).session(session);
    
    if (!user) {
      throw new ApiError('User not found', 404);
    }
    
    // Get current market price for the symbol
    const marketData = await getLatestPrice(symbol);
    const marketPrice = marketData.price || 0;
    
    // For market orders, use current market price
    const orderPrice = type === 'market' ? marketPrice : parsedPrice;
    
    // Generate a unique client order ID
    const clientOrderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Calculate order value
    const orderValue = parsedQuantity * orderPrice;
    
    // For buy orders, check if user has enough balance
    if (side === 'buy') {
      // Calculate fee (e.g. 0.1% of order value)
      const fee = orderValue * 0.001;
      const totalCost = orderValue + fee;
      
      if (user.balance < totalCost) {
        throw new ApiError('Insufficient balance to place buy order', 400);
      }
      
      // For market buy orders, execute immediately
      if (type === 'market') {
        // Create executed order
        const order = new Order({
          user: userId,
          symbol,
          side,
          type,
          quantity: parsedQuantity,
          price: marketPrice,
          stopPrice: parsedStopPrice || null,
          executedQuantity: parsedQuantity,
          executionPrice: marketPrice,
          status: 'filled',
          clientOrderId,
          fee,
          total: orderValue,
          processedAt: new Date()
        });
        
        await order.save({ session });
        
        // Update user balance
        user.balance -= totalCost;
        await user.save({ session });
        
        // Create transaction record
        const transaction = new Transaction({
          user: userId,
          type: 'trade',
          amount: -orderValue,
          fee: -fee,
          currency: symbol.split('/')[1], // Quote currency
          method: 'trading',
          status: 'completed',
          description: `Buy ${parsedQuantity} ${symbol} at ${marketPrice}`,
          reference: order._id.toString(),
          processedAt: new Date()
        });
        
        await transaction.save({ session });
        
        await session.commitTransaction();
        
        res.status(201).json({
          success: true,
          message: 'Market buy order executed successfully',
          order
        });
      } else {
        // For limit/stop orders, create pending order
        const order = new Order({
          user: userId,
          symbol,
          side,
          type,
          quantity: parsedQuantity,
          price: parsedPrice,
          stopPrice: parsedStopPrice || null,
          status: 'new',
          clientOrderId,
          fee: 0,
          total: orderValue
        });
        
        await order.save({ session });
        
        // Reserve the funds
        user.balance -= totalCost;
        user.reservedBalance = (user.reservedBalance || 0) + totalCost;
        await user.save({ session });
        
        await session.commitTransaction();
        
        res.status(201).json({
          success: true,
          message: `${type} buy order created successfully`,
          order
        });
      }
    } else {
      // For sell orders, check if user has the asset
      const assetSymbol = symbol.split('/')[0]; // Base currency
      
      // Get user's position for this asset
      const position = await Order.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            symbol: symbol,
            status: 'filled'
          }
        },
        {
          $group: {
            _id: null,
            totalBought: {
              $sum: {
                $cond: [
                  { $eq: ['$side', 'buy'] },
                  '$executedQuantity',
                  0
                ]
              }
            },
            totalSold: {
              $sum: {
                $cond: [
                  { $eq: ['$side', 'sell'] },
                  '$executedQuantity',
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            netPosition: { $subtract: ['$totalBought', '$totalSold'] }
          }
        }
      ]);
      
      const netPosition = position.length > 0 ? position[0].netPosition : 0;
      
      if (netPosition < parsedQuantity) {
        throw new ApiError(`Insufficient ${assetSymbol} balance to place sell order`, 400);
      }
      
      // For market sell orders, execute immediately
      if (type === 'market') {
        // Calculate fee (e.g. 0.1% of order value)
        const fee = orderValue * 0.001;
        
        // Create executed order
        const order = new Order({
          user: userId,
          symbol,
          side,
          type,
          quantity: parsedQuantity,
          price: marketPrice,
          stopPrice: parsedStopPrice || null,
          executedQuantity: parsedQuantity,
          executionPrice: marketPrice,
          status: 'filled',
          clientOrderId,
          fee,
          total: orderValue,
          processedAt: new Date()
        });
        
        await order.save({ session });
        
        // Update user balance
        const receivedAmount = orderValue - fee;
        user.balance += receivedAmount;
        await user.save({ session });
        
        // Create transaction record
        const transaction = new Transaction({
          user: userId,
          type: 'trade',
          amount: receivedAmount,
          fee: -fee,
          currency: symbol.split('/')[1], // Quote currency
          method: 'trading',
          status: 'completed',
          description: `Sell ${parsedQuantity} ${symbol} at ${marketPrice}`,
          reference: order._id.toString(),
          processedAt: new Date()
        });
        
        await transaction.save({ session });
        
        await session.commitTransaction();
        
        res.status(201).json({
          success: true,
          message: 'Market sell order executed successfully',
          order
        });
      } else {
        // For limit/stop orders, create pending order
        const order = new Order({
          user: userId,
          symbol,
          side,
          type,
          quantity: parsedQuantity,
          price: parsedPrice,
          stopPrice: parsedStopPrice || null,
          status: 'new',
          clientOrderId
        });
        
        await order.save({ session });
        
        // Reserve the asset
        // This would be handled by a dedicated position/wallet system in a real app
        
        await session.commitTransaction();
        
        res.status(201).json({
          success: true,
          message: `${type} sell order created successfully`,
          order
        });
      }
    }
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error placing order:', error);
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Cancel an existing open order
 */
export const cancelOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const userId = req.user._id;
    const { id } = req.params;
    
    const order = await Order.findOne({
      _id: id,
      user: userId,
      status: { $in: ['new', 'partially_filled'] }
    }).session(session);
    
    if (!order) {
      throw new ApiError('Order not found or not cancellable', 404);
    }
    
    // Update order status
    order.status = 'canceled';
    order.canceledAt = new Date();
    await order.save({ session });
    
    // If it's a buy order, return reserved funds to available balance
    if (order.side === 'buy') {
      const user = await User.findById(userId).session(session);
      
      if (user) {
        // Calculate reserved amount
        const reservedAmount = (order.quantity - (order.executedQuantity || 0)) * order.price;
        const reservedFee = reservedAmount * 0.001; // Same fee calculation as in placeOrder
        const totalReserved = reservedAmount + reservedFee;
        
        // Return funds from reserved to available
        user.reservedBalance = Math.max(0, (user.reservedBalance || 0) - totalReserved);
        user.balance += totalReserved;
        
        await user.save({ session });
      }
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      message: 'Order canceled successfully',
      order
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error canceling order ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Get user's trading history
 */
export const getTradingHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { symbol, startTime, endTime, page = 1, limit = 10 } = req.query;
    
    // Build query
    const query = {
      user: userId,
      status: 'filled'
    };
    
    if (symbol) query.symbol = symbol;
    
    if (startTime || endTime) {
      query.processedAt = {};
      if (startTime) query.processedAt.$gte = new Date(parseInt(startTime));
      if (endTime) query.processedAt.$lte = new Date(parseInt(endTime));
    }
    
    // Count total
    const total = await Order.countDocuments(query);
    
    // Get trading history with pagination
    const trades = await Order.find(query)
      .sort({ processedAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    // Format trades for response
    const formattedTrades = trades.map(trade => ({
      id: trade._id,
      symbol: trade.symbol,
      side: trade.side,
      type: trade.type,
      price: trade.executionPrice || trade.price,
      amount: trade.executedQuantity || trade.quantity,
      fee: trade.fee,
      total: trade.total,
      date: trade.processedAt || trade.createdAt
    }));
    
    res.status(200).json({
      success: true,
      data: {
        trades: formattedTrades,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching trading history:', error);
    next(error);
  }
};

/**
 * Get user's portfolio (positions and balances)
 */
export const getPortfolio = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // Get user for basic account balance
    const user = await User.findById(userId).select('balance reservedBalance');
    
    if (!user) {
      throw new ApiError('User not found', 404);
    }
    
    // Get positions based on trade history
    const positions = await Order.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          status: 'filled'
        }
      },
      {
        $group: {
          _id: '$symbol',
          totalBought: {
            $sum: {
              $cond: [
                { $eq: ['$side', 'buy'] },
                '$executedQuantity',
                0
              ]
            }
          },
          totalSold: {
            $sum: {
              $cond: [
                { $eq: ['$side', 'sell'] },
                '$executedQuantity',
                0
              ]
            }
          },
          totalBuyValue: {
            $sum: {
              $cond: [
                { $eq: ['$side', 'buy'] },
                { $multiply: ['$executionPrice', '$executedQuantity'] },
                0
              ]
            }
          },
          lastTradeDate: { $max: '$processedAt' }
        }
      },
      {
        $project: {
          _id: 0,
          symbol: '$_id',
          amount: { $subtract: ['$totalBought', '$totalSold'] },
          avgBuyPrice: {
            $cond: [
              { $gt: ['$totalBought', 0] },
              { $divide: ['$totalBuyValue', '$totalBought'] },
              0
            ]
          },
          lastTradeDate: 1
        }
      },
      {
        $match: {
          amount: { $gt: 0 }
        }
      }
    ]);
    
    // Get current market prices for each position
    const positionsWithPrices = await Promise.all(positions.map(async (position) => {
      try {
        const marketData = await getLatestPrice(position.symbol);
        const currentPrice = marketData.price || 0;
        const value = position.amount * currentPrice;
        const cost = position.amount * position.avgBuyPrice;
        const pnl = value - cost;
        const pnlPercentage = cost > 0 ? (pnl / cost) * 100 : 0;
        
        return {
          ...position,
          currentPrice,
          value,
          pnl,
          pnlPercentage
        };
      } catch (error) {
        logger.error(`Error getting price for ${position.symbol}:`, error);
        return {
          ...position,
          currentPrice: 0,
          value: 0,
          pnl: 0,
          pnlPercentage: 0
        };
      }
    }));
    
    // Calculate total portfolio value
    const portfolioValue = positionsWithPrices.reduce((total, pos) => total + pos.value, 0) + user.balance;
    
    res.status(200).json({
      success: true,
      data: {
        positions: positionsWithPrices,
        balances: {
          available: user.balance,
          reserved: user.reservedBalance || 0,
          total: user.balance + (user.reservedBalance || 0)
        },
        totalPortfolioValue: portfolioValue
      }
    });
  } catch (error) {
    logger.error('Error fetching portfolio:', error);
    next(error);
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
      totalBuyVolume += order.quantity * (order.executionPrice || order.price);
    });
    
    sellOrders.forEach(order => {
      totalSellVolume += order.quantity * (order.executionPrice || order.price);
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

export default {
  getUserOrders,
  getOrder,
  placeOrder,
  cancelOrder,
  getTradingHistory,
  getPortfolio,
  getOrdersStats
};
