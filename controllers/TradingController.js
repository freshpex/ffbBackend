import Order from "../models/Order.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import marketDataService from "../services/marketDataService.js";
import Transaction from "../models/Transaction.js";
import { processTaskEvent } from "./TaskController.js"; // Import the task event processor
import { calculatePositionsFromFilledOrders, toFiniteNumber } from "../utils/portfolioCalculator.js";

// Trading fee percentage (default 0.1%)
const TRADING_FEE_PERCENTAGE = parseFloat(process.env.TRADING_FEE_PERCENTAGE || 0.1);

// Get market price for a symbol
export const getMarketPrice = async (req, res, next) => {
  try {
    const { symbol } = req.query;

    if (!symbol) {
      throw new ApiError("Symbol is required", 400, "invalid_request");
    }

    // Get current price from market data service using the fixed method
    const price = await marketDataService.getPrice(symbol);
    console.log(`Fetched price for ${symbol}: ${price}`);
    logger.info(`Fetched price for ${symbol}: ${price}`);

    res.status(200).json({
      success: true,
      data: {
        symbol,
        price,
        timestamp: Date.now()
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

    await Promise.all(
      symbolsList.map(async (symbol) => {
        try {
          const price = await marketDataService.getPrice(symbol);
          console.log(`Fetched price for ${symbol}: ${price}`);
          logger.info(`Fetched price for ${symbol}: ${price}`);
          if (price !== null) {
            marketPrices[symbol] = {
              symbol,
              price,
              timestamp: Date.now()
            };
          }
        } catch (error) {
          logger.warn(`Error fetching price for ${symbol}: ${error.message}`);
        }
      })
    );

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
    const { symbol, side, type, quantity, price, stopPrice } = req.body;
    const userId = req.user._id;

    if (!symbol || !side || !type || !quantity) {
      throw new ApiError("Missing required order parameters", 400, "validation_error");
    }

    if (quantity <= 0) {
      throw new ApiError("Quantity must be greater than zero", 400, "validation_error");
    }

    if (type !== "market" && !price) {
      throw new ApiError("Price is required for non-market orders", 400, "validation_error");
    }

    if ((type === "stop" || type === "stop_limit") && !stopPrice) {
      throw new ApiError("Stop price is required for stop orders", 400, "validation_error");
    }

    const currentPrice = await marketDataService.getPrice(symbol);
    
    if (!currentPrice) {
      throw new ApiError(`Could not determine price for ${symbol}`, 400, "price_unavailable");
    }

    const orderPrice = type === "market" ? currentPrice : price;
    const orderTotal = parseFloat(quantity) * parseFloat(orderPrice);
    
    // Calculate fee
    const fee = (orderTotal * TRADING_FEE_PERCENTAGE) / 100;
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
      quantity: parseFloat(quantity),
      price: type !== "market" ? parseFloat(price) : null,
      stopPrice: (type === "stop" || type === "stop_limit") ? parseFloat(stopPrice) : null,
      status: type === "market" ? "filled" : "new", // Market orders are filled immediately
      executedQuantity: type === "market" ? parseFloat(quantity) : 0,
      executionPrice: type === "market" ? parseFloat(currentPrice) : null,
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
        description: `${side === "buy" ? "Buy" : "Sell"} ${quantity} of ${symbol} at ${currentPrice} USD`,
        metadata: {
          orderId: newOrder._id,
          symbol,
          side,
          quantity,
          price: currentPrice,
          fee
        },
        processedAt: new Date()
      });

      await transaction.save({ session });
      
      if (side === "sell") {
        const sellAmount = orderTotal - fee;
        await User.findByIdAndUpdate(
          userId,
          { $inc: { balance: sellAmount } },
          { session }
        );
      }
    }

    await session.commitTransaction();

    // Process task events after successful order placement
    try {
      await processTaskEvent(userId, "order_placed", {
        orderId: newOrder._id,
        symbol,
        type,
        side,
        quantity: parseFloat(quantity),
        amount: orderTotal,
        fee,
        isMarket: type === "market",
        isFilled: type === "market"
      });
      
      // For market orders, also trigger order_filled event
      if (type === "market") {
        await processTaskEvent(userId, "order_filled", {
          orderId: newOrder._id,
          symbol,
          side,
          quantity: parseFloat(quantity),
          amount: orderTotal,
          fee
        });
      }
      
    } catch (eventError) {
      // Just log the error but don't affect the response
      logger.error(`Error processing task events for order: ${eventError.message}`);
    }

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
    const userBalance = typeof user.balance === 'number' && Number.isFinite(user.balance)
      ? user.balance
      : 0;

    if (!Number.isFinite(userBalance)) {
      logger.warn(`User ${userId} has non-numeric balance value; treating as 0`);
    }

    const filledOrders = await Order.find({
      user: userId,
      status: "filled",
    }).select(
      "symbol side status quantity price executedQuantity executionPrice fee total processedAt createdAt updatedAt"
    );

    const { positions: rawPositions, warnings, patches } =
      calculatePositionsFromFilledOrders(filledOrders);

    // Self-heal: if we derived missing executedQuantity/executionPrice, persist them.
    if (patches.length > 0) {
      try {
        await Order.bulkWrite(patches, { ordered: false });
      } catch (patchError) {
        // Don't fail the request if repair fails; it's best-effort.
        logger.warn(`Failed to patch some filled orders for user ${userId}: ${patchError.message}`);
      }
    }

    const positionsArray = await Promise.all(
      rawPositions.map(async (position) => {
        const quantity = toFiniteNumber(position.quantity);
        const totalInvested = toFiniteNumber(position.totalInvested);
        if (!quantity || quantity <= 0 || !totalInvested || totalInvested <= 0) {
          // This should be rare after normalization, but never crash the entire portfolio.
          logger.error(
            `Invalid position data for ${position.symbol}: totalInvested=${position.totalInvested}, quantity=${position.quantity}`
          );
          return null;
        }

        const averagePrice = totalInvested / quantity;

        // Get current price from market data service (guaranteed to be numeric fallback)
        const currentPrice = await marketDataService.getPrice(position.symbol);
        const value = quantity * currentPrice;
        const profitLoss = value - totalInvested;
        const profitLossPercentage = (profitLoss / totalInvested) * 100;

        // Validate numerics before formatting
        const numericFields = {
          averagePrice,
          currentPrice,
          value,
          profitLoss,
          profitLossPercentage,
        };
        for (const [key, val] of Object.entries(numericFields)) {
          if (typeof val !== 'number' || !Number.isFinite(val)) {
            logger.error(`Non-numeric ${key} for ${position.symbol}: ${val}`);
            return null;
          }
        }

        return {
          symbol: position.symbol,
          quantity: parseFloat(quantity.toFixed(8)),
          averagePrice: parseFloat(averagePrice.toFixed(8)),
          totalInvested: parseFloat(totalInvested.toFixed(2)),
          currentPrice: parseFloat(currentPrice.toFixed(8)),
          value: parseFloat(value.toFixed(2)),
          profitLoss: parseFloat(profitLoss.toFixed(2)),
          profitLossPercentage: parseFloat(profitLossPercentage.toFixed(2)),
          lastTradeTimestamp: position.lastTradeTimestamp,
        };
      })
    );

    const cleanPositions = positionsArray.filter(Boolean);

    // Calculate the total value of all positions
    const portfolioValue = cleanPositions.reduce((sum, position) => sum + position.value, 0);
    
    // Format all balances consistently
    const formattedBalance = parseFloat(userBalance.toFixed(2));
    const totalValue = parseFloat((portfolioValue + formattedBalance).toFixed(2));
    
    res.status(200).json({
      success: true,
      data: {
        positions: cleanPositions,
        balances: {
          USD: formattedBalance,
          USDT: formattedBalance // Include USDT balance that mirrors USD for trading pairs that use USDT
        },
        totalValue: totalValue,
        warnings
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