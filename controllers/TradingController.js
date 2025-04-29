import Order from "../models/Order.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import marketDataService from "../services/marketDataService.js";
import Transaction from "../models/Transaction.js";

// Trading fee percentage (default 0.1%)
const TRADING_FEE_PERCENTAGE = parseFloat(process.env.TRADING_FEE_PERCENTAGE || 0.1);

// Get market price for a symbol
export const getMarketPrice = async (req, res, next) => {
    try {
        const { symbol } = req.query;

        if (!symbol) {
            throw new ApiError("Symbol is required", 400, "invalid_request");
        }

        const priceData = await marketDataService.getPrice(symbol);
        
        if (!priceData) {
            throw new ApiError(`Could not fetch price for ${symbol}`, 404, "price_unavailable");
        }

        res.status(200).json({
            success: true,
            data: {
                symbol: priceData.symbol,
                price: priceData.price,
                priceChange: priceData.change,
                priceChangePercent: priceData.changePercent,
                direction: priceData.direction,
                timestamp: priceData.lastUpdated || Date.now()
            }
        });
    } catch (error) {
        logger.error(`Error fetching market price: ${error.message}`);
        next(error);
    }
};

// Get all market prices
export const getAllMarketPrices = async (req, res, next) => {
    try {
        const { symbols } = req.query;
        let symbolsList = [];

        if (symbols) {
            symbolsList = Array.isArray(symbols) ? symbols : symbols.split(',');
        } else {
            try {
                const pairs = await marketDataService.getTradingPairs();
                symbolsList = pairs.map(pair => pair.symbol);
            } catch (pairsError) {
                logger.error(`Error fetching trading pairs: ${pairsError.message}`);
                symbolsList = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'];
            }
        }

        const marketPrices = {};

        // Use the new getPrices method to get price data for all symbols at once
        const pricesData = await marketDataService.getPrices(symbolsList);
        
        pricesData.forEach(priceData => {
            if (priceData && priceData.symbol) {
                marketPrices[priceData.symbol] = {
                    symbol: priceData.symbol,
                    price: priceData.price,
                    priceChange: priceData.change,
                    priceChangePercent: priceData.changePercent,
                    direction: priceData.direction,
                    timestamp: priceData.lastUpdated || Date.now()
                };
            }
        });

        res.status(200).json({
            success: true,
            data: marketPrices
        });
    } catch (error) {
        logger.error(`Error fetching market prices: ${error.message}`);
        next(error);
    }
};

// Get orderbook for a symbol
export const getOrderbook = async (req, res, next) => {
  try {
    let symbol;
    const { baseAsset, quoteAsset } = req.params;
    
    if (baseAsset && quoteAsset) {
      symbol = `${baseAsset}/${quoteAsset}`;
    } else {
      symbol = req.query.symbol;
    }

    if (!symbol) {
      throw new ApiError("Symbol is required", 400, "invalid_request");
    }

    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const orderbook = await marketDataService.getOrderbook(symbol, limit);

    res.status(200).json({
      success: true,
      data: orderbook,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error(`Error fetching orderbook: ${error.message}`);
    next(error);
  }
};

// Get candlestick data
export const getCandlesticks = async (req, res, next) => {
  try {
    const { symbol, interval = "1h", limit = 100 } = req.query;

    if (!symbol) {
      throw new ApiError("Symbol is required", 400, "invalid_request");
    }

    const candlesticks = await marketDataService.getCandles({
      symbol,
      interval,
      limit: parseInt(limit)
    });

    res.status(200).json({
      success: true,
      data: {
        symbol,
        interval,
        candlesticks
      }
    });
  } catch (error) {
    logger.error(`Error fetching candlesticks: ${error.message}`);
    next(error);
  }
};

// Get recent trades for a symbol
export const getRecentTrades = async (req, res, next) => {
  try {
    const { symbol, limit = 20 } = req.query;

    if (!symbol) {
      throw new ApiError("Symbol is required", 400, "invalid_request");
    }

    // Only get filled orders for the specified symbol
    const trades = await Order.find({ 
      symbol, 
      status: 'filled' 
    })
    .sort({ processedAt: -1 })
    .limit(parseInt(limit))
    .populate('user', 'firstName lastName');

    const formattedTrades = trades.map(trade => ({
      id: trade._id,
      symbol: trade.symbol,
      side: trade.side,
      price: trade.executionPrice,
      quantity: trade.executedQuantity,
      time: trade.processedAt,
      total: trade.executedQuantity * trade.executionPrice
    }));

    res.status(200).json({
      success: true,
      data: formattedTrades
    });
  } catch (error) {
    logger.error(`Error fetching recent trades: ${error.message}`);
    next(error);
  }
};

// Place a new order
export const placeOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { symbol, side, type, quantity, price, stopPrice, total } = req.body;
    const userId = req.user._id;

    // Basic validation checks
    if (!symbol || !side || !type || !quantity) {
      throw new ApiError("Missing required order parameters", 400, "validation_error");
    }

    if (parseFloat(quantity) <= 0) {
      throw new ApiError("Quantity must be greater than zero", 400, "validation_error");
    }

    if (type !== "market" && !price) {
      throw new ApiError("Price is required for non-market orders", 400, "validation_error");
    }

    if ((type === "stop" || type === "stop_limit") && !stopPrice) {
      throw new ApiError("Stop price is required for stop orders", 400, "validation_error");
    }

    // Parse values from frontend
    const parsedQuantity = parseFloat(quantity);
    let parsedPrice = type === "market" ? null : parseFloat(price);
    let orderTotal = total ? parseFloat(total) : null;
    
    // Validate orderTotal is a valid number
    if (isNaN(orderTotal) || orderTotal <= 0) {
      throw new ApiError(`Invalid order total: ${orderTotal}`, 400, "validation_error");
    }
    
    // Calculate fee
    const fee = (orderTotal * TRADING_FEE_PERCENTAGE) / 100;
    
    // Validate fee is a valid number
    if (isNaN(fee)) {
      throw new ApiError(`Invalid fee calculation`, 400, "validation_error");
    }
    
    const totalCost = side === "buy" ? orderTotal + fee : 0;

    if (side === "buy") {
      const user = await User.findById(userId).session(session);
      
      if (!user) {
        throw new ApiError("User not found", 404, "user_not_found");
      }
      
      if (user.balance < totalCost) {
        throw new ApiError(
          `Insufficient balance. Required: ${totalCost.toFixed(2)}, Available: ${user.balance.toFixed(2)}`,
          400,
          "insufficient_funds"
        );
      }
      
      await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: -totalCost } },
        { session }
      );
    }

    const newOrder = new Order({
      user: userId,
      symbol,
      side,
      type,
      quantity: parsedQuantity,
      price: type !== "market" ? parsedPrice : null,
      stopPrice: (type === "stop" || type === "stop_limit") ? parseFloat(stopPrice) : null,
      status: type === "market" ? "filled" : "new",
      executedQuantity: type === "market" ? parsedQuantity : 0,
      executionPrice: type === "market" ? parsedPrice : null,
      fee,
      total: orderTotal,
      clientOrderId: `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      processedAt: type === "market" ? new Date() : null
    });

    await newOrder.save({ session });

    if (type === "market") {
      const transaction = new Transaction({
        user: userId,
        type: side === "buy" ? "investment" : "withdrawal",
        amount: side === "buy" ? -totalCost : orderTotal,
        currency: "USD",
        status: "completed",
        method: "system",
        description: `${side === "buy" ? "Buy" : "Sell"} ${parsedQuantity} of ${symbol} at ${parsedPrice} USD`,
        metadata: {
          orderId: newOrder._id,
          symbol,
          side,
          quantity: parsedQuantity,
          price: parsedPrice,
          fee
        },
        processedAt: new Date()
      });

      await transaction.save({ session });
      
      if (side === "sell") {
        const sellAmount = orderTotal - fee;
        
        // Validate sellAmount is a valid number before updating user balance
        if (isNaN(sellAmount)) {
          throw new ApiError(`Invalid sell amount calculation`, 400, "validation_error");
        }
        
        await User.findByIdAndUpdate(
          userId,
          { $inc: { balance: sellAmount } },
          { session }
        );
      }
    }

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: type === "market" ? "Order executed successfully" : "Order placed successfully",
      data: newOrder
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error placing order: ${error.message}`);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get user's orders
export const getUserOrders = async (req, res, next) => {
  try {
    const { status, symbol, type, side, page = 1, limit = 20 } = req.query;
    const userId = req.user._id;

    const query = { user: userId };

    // Add optional filters if provided
    if (status) {
      if (Array.isArray(status) || status.includes(',')) {
        const statusArray = Array.isArray(status) ? status : status.split(',');
        query.status = { $in: statusArray };
      } else {
        query.status = status;
      }
    }

    if (symbol) query.symbol = symbol;
    if (type) query.type = type;
    if (side) query.side = side;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalOrders = await Order.countDocuments(query);

    // Fetch orders with pagination
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalOrders,
          pages: Math.ceil(totalOrders / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error(`Error fetching user orders: ${error.message}`);
    next(error);
  }
};

// Get order by ID
export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({
      _id: id,
      user: userId
    });

    if (!order) {
      throw new ApiError("Order not found", 404, "not_found");
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    logger.error(`Error fetching order ${req.params.id}: ${error.message}`);
    next(error);
  }
};

// Cancel an order
export const cancelOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({
      _id: id,
      user: userId,
      status: "new"
    });

    if (!order) {
      throw new ApiError("Order not found or cannot be canceled", 404, "not_found");
    }

    order.status = "canceled";
    order.canceledAt = new Date();
    await order.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Order canceled successfully",
      data: order
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error canceling order ${req.params.id}: ${error.message}`);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get user's positions/portfolio
export const getUserPositions = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get user with their balance
    const user = await User.findById(userId).select('balance');
    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }
    
    // Ensure balance is a valid number
    const userBalance = typeof user.balance === 'number' ? user.balance : 0;

    const buyOrders = await Order.find({
      user: userId,
      side: "buy",
      status: "filled"
    });

    const sellOrders = await Order.find({
      user: userId,
      side: "sell",
      status: "filled"
    });

    const positions = {};
    
    buyOrders.forEach(order => {
      if (!positions[order.symbol]) {
        positions[order.symbol] = {
          symbol: order.symbol,
          quantity: 0,
          averagePrice: 0,
          totalInvested: 0,
          currentPrice: null,
          value: 0,
          profitLoss: 0,
          profitLossPercentage: 0
        };
      }
      
      const position = positions[order.symbol];
      position.quantity += order.executedQuantity;
      position.totalInvested += (order.executedQuantity * order.executionPrice);
      position.lastTradeTimestamp = order.processedAt;
    });
    
    sellOrders.forEach(order => {
      if (positions[order.symbol]) {
        positions[order.symbol].quantity -= order.executedQuantity;
        
        if (positions[order.symbol].lastTradeTimestamp < order.processedAt) {
          positions[order.symbol].lastTradeTimestamp = order.processedAt;
        }
      }
    });
    
    const positionsArray = await Promise.all(Object.values(positions)
      .filter(position => position.quantity > 0)
      .map(async (position) => {
        position.averagePrice = position.totalInvested / position.quantity;
        
        // Get current price from market data service
        try {
          position.currentPrice = await marketDataService.getPrice(position.symbol);
          position.value = position.quantity * position.currentPrice;
          position.profitLoss = position.value - position.totalInvested;
          position.profitLossPercentage = (position.profitLoss / position.totalInvested) * 100;
        } catch (error) {
          logger.warn(`Could not fetch price for ${position.symbol}: ${error.message}`);
          position.currentPrice = position.averagePrice; // Fallback to average price
          position.value = position.quantity * position.averagePrice;
          position.profitLoss = 0;
          position.profitLossPercentage = 0;
        }
        
        return {
          ...position,
          averagePrice: parseFloat(position.averagePrice.toFixed(8)),
          currentPrice: parseFloat(position.currentPrice.toFixed(8)),
          value: parseFloat(position.value.toFixed(2)),
          profitLoss: parseFloat(position.profitLoss.toFixed(2)),
          profitLossPercentage: parseFloat(position.profitLossPercentage.toFixed(2)),
        };
      }));

    // Calculate the total value of all positions
    const portfolioValue = positionsArray.reduce((sum, position) => sum + position.value, 0);
    
    // Format all balances consistently
    const formattedBalance = parseFloat(userBalance.toFixed(2));
    const totalValue = parseFloat((portfolioValue + formattedBalance).toFixed(2));
    
    res.status(200).json({
      success: true,
      data: {
        positions: positionsArray,
        balances: {
          USD: formattedBalance,
          USDT: formattedBalance // Include USDT balance that mirrors USD for trading pairs that use USDT
        },
        totalValue: totalValue
      }
    });
  } catch (error) {
    logger.error(`Error fetching user positions: ${error.message}`);
    next(error);
  }
};

// Get trading pairs
export const getTradingPairs = async (req, res, next) => {
  try {
    const pairs = await marketDataService.getTradingPairs();
    
    res.status(200).json({
      success: true,
      data: pairs
    });
  } catch (error) {
    logger.error(`Error fetching trading pairs: ${error.message}`);
    next(error);
  }
};

export default {
  getMarketPrice,
  getAllMarketPrices,
  getOrderbook,
  getCandlesticks,
  getRecentTrades,
  placeOrder,
  getUserOrders,
  getOrderById,
  cancelOrder,
  getUserPositions,
  getTradingPairs
};