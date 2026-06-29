import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Investment from "../models/Investment.js";
import Order from "../models/Order.js";
import Notification from "../models/Notification.js";
import { ApiError } from "../middleware/errorHandler.js";
import logger from "../middleware/logger.js";
import {
  INVESTMENT_PLANS,
  calculateROIAmount,
  getStaticInvestmentPlanById,
} from "./InvestmentController.js";

const allowedTransactionTypes = new Set([
  "deposit",
  "withdrawal",
  "transfer",
  "investment",
  "fee",
  "bonus",
  "shop_purchase",
  "shop_reward",
  "shop_refund",
]);

const toPositiveNumber = (value, field = "amount") => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new ApiError(`${field} must be a positive number`, 400, "validation_error");
  }
  return number;
};

const toOptionalNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const toDate = (value, fallback = new Date()) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError("Invalid date supplied", 400, "validation_error");
  }
  return date;
};

const randomBetween = (min, max) => {
  if (min === max) return min;
  return Number((Math.random() * (max - min) + min).toFixed(2));
};

const spreadDate = (start, end, index, total) => {
  if (total <= 1) return start;
  const ratio = index / (total - 1);
  return new Date(start.getTime() + (end.getTime() - start.getTime()) * ratio);
};

const getUserOrThrow = async (userId, session) => {
  const query = User.findById(userId);
  if (session) query.session(session);
  const user = await query;
  if (!user) throw new ApiError("User not found", 404, "not_found");
  return user;
};

const normalizePlan = (planId, amount) => {
  if (planId) {
    const plan = getStaticInvestmentPlanById(planId);
    if (!plan) {
      throw new ApiError("Invalid investment plan", 400, "validation_error");
    }
    return plan;
  }

  const plan = INVESTMENT_PLANS.find((item) => Number(item.baseAmount) === Number(amount));
  if (!plan) {
    throw new ApiError(
      "No investment plan exists for this amount",
      400,
      "validation_error",
    );
  }
  return plan;
};

export const adjustUserBalance = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await getUserOrThrow(req.params.id, session);
    const {
      action = "credit",
      amount,
      description,
      method = "system",
      status = "completed",
      date,
      allowNegative = false,
    } = req.body || {};

    const value = toPositiveNumber(amount);
    const signed = action === "credit" ? value : -value;
    const nextBalance = Number(user.balance || 0) + signed;

    if (!allowNegative && nextBalance < 0) {
      throw new ApiError("Insufficient user balance", 400, "insufficient_balance");
    }

    user.balance = nextBalance;
    await user.save({ session });

    const when = toDate(date);
    const transaction = new Transaction({
      user: user._id,
      type: action === "credit" ? "deposit" : "withdrawal",
      amount: value,
      currency: "USD",
      status,
      method,
      description:
        description ||
        `${action === "credit" ? "Credit" : "Debit"} applied by admin`,
      metadata: {
        adminAction: "balance_adjustment",
        direction: action,
        adminId: req.user._id,
      },
      processedAt: when,
      createdAt: when,
      updatedAt: when,
    });
    await transaction.save({ session });

    await session.commitTransaction();
    res.status(200).json({
      success: true,
      message: "User balance updated",
      data: { user, transaction },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error adjusting user balance:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

export const createUserLedgerEntries = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await getUserOrThrow(req.params.id, session);
    const {
      type = "deposit",
      amount,
      minAmount,
      maxAmount,
      count = 1,
      startDate,
      endDate,
      description,
      method = "system",
      status = "completed",
      affectBalance = false,
    } = req.body || {};

    if (!allowedTransactionTypes.has(type)) {
      throw new ApiError("Invalid transaction type", 400, "validation_error");
    }

    const total = Math.min(Math.max(parseInt(count, 10) || 1, 1), 250);
    const min = toPositiveNumber(minAmount ?? amount, "minAmount");
    const max = toPositiveNumber(maxAmount ?? amount ?? minAmount, "maxAmount");
    if (max < min) {
      throw new ApiError("maxAmount must be greater than minAmount", 400, "validation_error");
    }

    const start = toDate(startDate);
    const end = toDate(endDate || startDate || new Date());
    const transactions = [];
    let balanceDelta = 0;

    for (let i = 0; i < total; i += 1) {
      const entryAmount = randomBetween(min, max);
      const when = spreadDate(start, end, i, total);
      if (affectBalance) {
        balanceDelta += ["deposit", "bonus", "shop_reward"].includes(type)
          ? entryAmount
          : -entryAmount;
      }

      transactions.push({
        user: user._id,
        type,
        amount: entryAmount,
        currency: "USD",
        status,
        method,
        description:
          description || `${type.replace("_", " ")} ledger entry created by admin`,
        metadata: {
          adminAction: "ledger_entry",
          adminId: req.user._id,
          sequence: i + 1,
        },
        processedAt: when,
        createdAt: when,
        updatedAt: when,
      });
    }

    const created = await Transaction.insertMany(transactions, { session });
    if (affectBalance && balanceDelta !== 0) {
      user.balance = Number(user.balance || 0) + balanceDelta;
      await user.save({ session });
    }

    await session.commitTransaction();
    res.status(201).json({
      success: true,
      message: `${created.length} ledger entries created`,
      data: { count: created.length, transactions: created, user },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error creating ledger entries:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

export const createUserTrade = async (req, res, next) => {
  try {
    const user = await getUserOrThrow(req.params.id);
    const {
      market = "crypto",
      accountLabel,
      symbol = "BTC/USDT",
      side = "buy",
      type = "market",
      quantity,
      amount,
      price,
      executionPrice,
      openPrice,
      closePrice,
      total,
      profit,
      swap,
      commission,
      deposit,
      balance,
      status = "filled",
      date,
    } = req.body || {};

    const orderPrice = toPositiveNumber(price ?? executionPrice ?? openPrice, "price");
    const orderQuantity = toPositiveNumber(quantity ?? amount, "quantity");
    const explicitTotal = toOptionalNumber(total);
    const orderTotal =
      explicitTotal !== undefined
        ? explicitTotal
        : Number((orderPrice * orderQuantity).toFixed(8));
    const when = toDate(date);
    const isFilled = status === "filled";

    const order = await Order.create({
      user: user._id,
      market,
      accountLabel,
      symbol,
      side,
      type,
      quantity: orderQuantity,
      price: orderPrice,
      status,
      executedQuantity: isFilled ? orderQuantity : 0,
      executionPrice: isFilled ? orderPrice : null,
      openPrice: toOptionalNumber(openPrice) ?? orderPrice,
      closePrice: toOptionalNumber(closePrice),
      total: orderTotal,
      profit: toOptionalNumber(profit),
      swap: toOptionalNumber(swap) ?? 0,
      commission: toOptionalNumber(commission) ?? 0,
      deposit: toOptionalNumber(deposit),
      balance: toOptionalNumber(balance),
      fee: toOptionalNumber(commission) ?? 0,
      clientOrderId: `admin_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      processedAt: isFilled ? when : null,
      canceledAt: status === "canceled" ? when : null,
      createdAt: when,
      updatedAt: when,
    });

    res.status(201).json({
      success: true,
      message: "Trade created",
      data: order,
    });
  } catch (error) {
    logger.error("Error creating trade:", error);
    next(error);
  }
};

export const listUserTrades = async (req, res, next) => {
  try {
    await getUserOrThrow(req.params.id);
    const trades = await Order.find({ user: req.params.id })
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      data: trades,
    });
  } catch (error) {
    logger.error("Error listing user trades:", error);
    next(error);
  }
};

export const updateUserTrade = async (req, res, next) => {
  try {
    await getUserOrThrow(req.params.id);
    const {
      action,
      market,
      accountLabel,
      symbol,
      side,
      type,
      quantity,
      amount,
      price,
      executionPrice,
      openPrice,
      closePrice,
      total,
      profit,
      swap,
      commission,
      deposit,
      balance,
      status,
      date,
    } = req.body || {};
    const order = await Order.findOne({
      _id: req.params.tradeId,
      user: req.params.id,
    });

    if (!order) throw new ApiError("Trade not found", 404, "not_found");

    const nextQuantity = toOptionalNumber(quantity ?? amount);
    const nextPrice = toOptionalNumber(price ?? executionPrice ?? openPrice);
    if (market !== undefined) order.market = market;
    if (accountLabel !== undefined) order.accountLabel = accountLabel;
    if (symbol !== undefined && symbol !== "") order.symbol = symbol;
    if (side !== undefined) order.side = side;
    if (type !== undefined) order.type = type;
    if (status !== undefined && status !== "") order.status = status;
    if (nextQuantity !== undefined) order.quantity = nextQuantity;
    if (nextPrice !== undefined) order.price = nextPrice;
    if (toOptionalNumber(openPrice) !== undefined) order.openPrice = toOptionalNumber(openPrice);
    if (toOptionalNumber(closePrice) !== undefined) order.closePrice = toOptionalNumber(closePrice);
    if (toOptionalNumber(profit) !== undefined) order.profit = toOptionalNumber(profit);
    if (toOptionalNumber(swap) !== undefined) order.swap = toOptionalNumber(swap);
    if (toOptionalNumber(commission) !== undefined) {
      order.commission = toOptionalNumber(commission);
      order.fee = toOptionalNumber(commission);
    }
    if (toOptionalNumber(deposit) !== undefined) order.deposit = toOptionalNumber(deposit);
    if (toOptionalNumber(balance) !== undefined) order.balance = toOptionalNumber(balance);
    if (toOptionalNumber(total) !== undefined) {
      order.total = toOptionalNumber(total);
    } else if (nextQuantity !== undefined || nextPrice !== undefined) {
      const effectiveQuantity = nextQuantity ?? toOptionalNumber(order.quantity);
      const effectivePrice = nextPrice ?? toOptionalNumber(order.executionPrice) ?? toOptionalNumber(order.price);
      if (effectiveQuantity !== undefined && effectivePrice !== undefined) {
        order.total = Number((effectiveQuantity * effectivePrice).toFixed(8));
      }
    }
    if (date) {
      const when = toDate(date);
      order.createdAt = when;
      if (order.status === "filled") order.processedAt = when;
    }

    if (action === "cancel") {
      order.status = "canceled";
      order.canceledAt = new Date();
    } else if (action === "close") {
      order.status = "filled";
      order.executedQuantity = order.executedQuantity || order.quantity;
      order.executionPrice = nextPrice ?? order.executionPrice ?? order.price;
      order.openPrice = order.openPrice ?? order.executionPrice ?? order.price;
      order.processedAt = new Date();
    } else if (action === "open") {
      order.status = "new";
      order.canceledAt = null;
      order.processedAt = null;
    } else if (action === "update" || !action) {
      if (order.status === "filled") {
        order.executedQuantity = order.executedQuantity || order.quantity;
        order.executionPrice = nextPrice ?? order.executionPrice ?? order.price;
      }
    } else {
      throw new ApiError("Action must be cancel, close, open, or update", 400, "validation_error");
    }

    await order.save();
    res.status(200).json({
      success: true,
      message: "Trade updated",
      data: order,
    });
  } catch (error) {
    logger.error("Error updating trade:", error);
    next(error);
  }
};

export const createUserInvestment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await getUserOrThrow(req.params.id, session);
    const {
      planId,
      amount,
      startDate,
      status = "active",
      debitBalance = false,
      duration,
    } = req.body || {};

    const value = toPositiveNumber(amount);
    const plan = normalizePlan(planId, value);
    const start = toDate(startDate);
    const days = Number(duration || plan.duration);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const roiAmount = calculateROIAmount(value, plan);

    if (debitBalance) {
      if (Number(user.balance || 0) < value) {
        throw new ApiError("Insufficient user balance", 400, "insufficient_balance");
      }
      user.balance = Number(user.balance || 0) - value;
      await user.save({ session });
    }

    const investment = new Investment({
      user: user._id,
      planId: plan.id,
      amount: value,
      status,
      returnRate: plan.returnRate,
      duration: days,
      startDate: start,
      endDate: status === "completed" ? toDate(req.body.endDate, end) : end,
      totalReturns: status === "completed" ? roiAmount : 0,
      createdAt: start,
      updatedAt: start,
    });
    await investment.save({ session });

    const transaction = new Transaction({
      user: user._id,
      type: "investment",
      amount: value,
      status: "completed",
      method: "system",
      description: `Admin-created investment in ${plan.name}`,
      reference: investment._id.toString(),
      metadata: {
        adminAction: "investment_create",
        adminId: req.user._id,
        roiAmount,
      },
      processedAt: start,
      createdAt: start,
      updatedAt: start,
    });
    await transaction.save({ session });

    await session.commitTransaction();
    res.status(201).json({
      success: true,
      message: "Investment created",
      data: {
        ...investment.toObject(),
        id: investment._id,
        planName: plan.name,
        roiAmount,
        expectedReturn: roiAmount,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error creating user investment:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

export const listUserInvestments = async (req, res, next) => {
  try {
    await getUserOrThrow(req.params.id);
    const investments = await Investment.find({ user: req.params.id })
      .sort({ createdAt: -1 })
      .limit(100);

    const enriched = investments.map((investment) => {
      const plan = getStaticInvestmentPlanById(investment.planId);
      const roiAmount = calculateROIAmount(investment.amount, plan);
      return {
        ...investment.toObject(),
        id: investment._id,
        planName: plan?.name || investment.planId,
        roiAmount,
        expectedReturn: roiAmount,
      };
    });

    res.status(200).json({
      success: true,
      data: enriched,
    });
  } catch (error) {
    logger.error("Error listing user investments:", error);
    next(error);
  }
};

export const updateUserInvestment = async (req, res, next) => {
  try {
    await getUserOrThrow(req.params.id);
    const { action } = req.body || {};
    const investment = await Investment.findOne({
      _id: req.params.investmentId,
      user: req.params.id,
    });

    if (!investment) throw new ApiError("Investment not found", 404, "not_found");

    if (action === "cancel") {
      investment.status = "cancelled";
    } else if (action === "stop" || action === "complete") {
      investment.status = "completed";
      investment.endDate = new Date();
      const plan = getStaticInvestmentPlanById(investment.planId);
      investment.totalReturns = calculateROIAmount(investment.amount, plan);
    } else if (action === "open") {
      investment.status = "active";
    } else {
      throw new ApiError(
        "Action must be cancel, stop, complete, or open",
        400,
        "validation_error",
      );
    }

    await investment.save();
    res.status(200).json({
      success: true,
      message: "Investment updated",
      data: investment,
    });
  } catch (error) {
    logger.error("Error updating user investment:", error);
    next(error);
  }
};

export const sendUserNotifications = async (req, res, next) => {
  try {
    const {
      title,
      message,
      type = "info",
      priority = "medium",
      sendTo = "user",
      link,
    } = req.body || {};

    if (!title || !message) {
      throw new ApiError("Title and message are required", 400, "validation_error");
    }

    const recipients =
      sendTo === "all"
        ? await User.find({ role: "user" }).select("_id")
        : [await getUserOrThrow(req.params.id)];

    const notifications = await Notification.insertMany(
      recipients.map((recipient) => ({
        recipient: recipient._id,
        title,
        message,
        type,
        priority,
        link: link || null,
        data: {
          adminAction: "manual_notification",
          adminId: req.user._id,
        },
      })),
    );

    if (global.websocketService?.sendUserNotification) {
      notifications.forEach((notification) => {
        global.websocketService.sendUserNotification(
          notification.recipient.toString(),
          notification,
        );
      });
    }

    res.status(201).json({
      success: true,
      message: `${notifications.length} notification(s) sent`,
      data: { count: notifications.length, notifications },
    });
  } catch (error) {
    logger.error("Error sending user notifications:", error);
    next(error);
  }
};

export default {
  adjustUserBalance,
  createUserLedgerEntries,
  createUserTrade,
  listUserTrades,
  updateUserTrade,
  createUserInvestment,
  listUserInvestments,
  updateUserInvestment,
  sendUserNotifications,
};
