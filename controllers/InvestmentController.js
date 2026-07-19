import Investment from "../models/Investment.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

export const ROI_SCHEDULE = Object.freeze([
  { amount: 20, roiAmount: 0.1, id: "roi-0.1", name: "Starter Plan" },
  // { amount: 50, roiAmount: 0.2, id: "roi-0.2", name: "Growth" },
  // { amount: 60, roiAmount: 0.3, id: "roi-0.3", name: "Boost" },
  { amount: 50, roiAmount: 0.4, id: "roi-0.4", name: "Basic Plan" },
  { amount: 100, roiAmount: 0.5, id: "roi-0.5", name: "Standard Plan" },
  { amount: 150000, roiAmount: 500000, id: "roi-50000", name: "Premium Plan" },
]);

const toRate = (amount, roiAmount) =>
  Number(((Number(roiAmount) / Number(amount)) * 100).toFixed(6));

// Investment plans
export const INVESTMENT_PLANS = ROI_SCHEDULE.map((tier, index) => ({
  id: tier.id,
  name: `${tier.name} - $${tier.amount.toLocaleString()}`,
  minAmount: tier.amount,
  maxAmount: tier.amount,
  baseAmount: tier.amount,
  roiAmount: tier.roiAmount,
  returnRate: toRate(tier.amount, tier.roiAmount),
  roi: toRate(tier.amount, tier.roiAmount),
  duration: [14, 21, 28, 40, 30, 60, 90][index],
  features: [
    "Fixed ROI amount",
    "Clear maturity payout",
    index < 3 ? "Low entry" : "Priority processing",
  ],
  description: `Invest $${tier.amount.toLocaleString()} and receive $${tier.roiAmount.toLocaleString()} ROI at maturity.`,
  riskLevel: index < 3 ? "low" : index < 5 ? "medium" : "high",
  isActive: true,
}));

export const calculateROIAmount = (amount, plan) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;

  if (plan?.baseAmount && plan?.roiAmount) {
    return Number(
      ((numericAmount / Number(plan.baseAmount)) * Number(plan.roiAmount)).toFixed(2),
    );
  }

  const exactTier = ROI_SCHEDULE.find((tier) => tier.amount === numericAmount);
  if (exactTier) return exactTier.roiAmount;

  const rate = resolvePlanReturnRate(plan);
  return Number(((rate / 100) * numericAmount).toFixed(2));
};

const resolvePlanReturnRate = (plan, investment) => {
  if (plan?.baseAmount && plan?.roiAmount) {
    return toRate(plan.baseAmount, plan.roiAmount);
  }
  if (plan && typeof plan.returnRate === "number") {
    return plan.returnRate;
  }
  if (plan && typeof plan.roi === "number") {
    return plan.roi;
  }
  if (investment && typeof investment.returnRate === "number") {
    return investment.returnRate;
  }
  return 0;
};

export const getStaticInvestmentPlanById = (planId) =>
  INVESTMENT_PLANS.find((p) => p.id === planId);

// Get all investment plans
export const getInvestmentPlans = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: INVESTMENT_PLANS,
    });
  } catch (error) {
    console.error("Error fetching investment plans:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch investment plans",
      error: error.message,
    });
  }
};

// Get specific investment plan
export const getInvestmentPlanById = async (req, res, next) => {
  try {
    const plan = INVESTMENT_PLANS.find((p) => p.id === req.params.id);
    if (!plan) {
      throw new ApiError("Investment plan not found", 404, "not_found");
    }
    res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    logger.error(`Error fetching investment plan ${req.params.id}:`, error);
    next(error);
  }
};

export const getUserInvestments = async (req, res) => {
  try {
    const userId = req.user.id;

    const investments = await Investment.find({ user: userId }).sort({
      createdAt: -1,
    });

    const processedInvestments = investments.map((investment) => {
      const investmentObj = investment.toObject();

      const plan = INVESTMENT_PLANS.find((p) => p.id === investment.planId);
      if (!plan) {
        return {
          ...investmentObj,
          planName: "Unknown Plan",
        };
      }

      investmentObj.planName = plan.name;
      const resolvedReturnRate = resolvePlanReturnRate(plan, investment);
      investmentObj.returnRate = resolvedReturnRate;
      investmentObj.roi = plan.roi ?? resolvedReturnRate;
      investmentObj.roiAmount = calculateROIAmount(investment.amount, plan);

      if (investment.status === "active") {
        const currentDate = new Date();
        const startDate = new Date(investment.startDate);
        const endDate = new Date(investment.endDate);
        const totalDuration = endDate - startDate;
        const elapsedDuration = currentDate - startDate;

        // Progress percentage
        const progress = Math.min(
          Math.round((elapsedDuration / totalDuration) * 100),
          100,
        );
        investmentObj.progress = progress;

        // Expected return at maturity
        const expectedReturn = calculateROIAmount(investment.amount, plan);
        investmentObj.expectedReturn = expectedReturn;

        // Current value based on progress
        const proRatedReturn = expectedReturn * (progress / 100);
        investmentObj.currentValue = investment.amount + proRatedReturn;
      }
      // Completed investments, calculate return amount
      else if (investment.status === "completed") {
        investmentObj.returnAmount =
          investment.totalReturns ||
          calculateROIAmount(investment.amount, plan);
      }

      return investmentObj;
    });

    // Separate active and completed investments
    const active = processedInvestments.filter(
      (inv) => inv.status === "active" || inv.status === "pending",
    );

    const history = processedInvestments.filter(
      (inv) => inv.status === "completed" || inv.status === "cancelled",
    );

    // Calculate statistics
    const totalInvested = processedInvestments.reduce(
      (sum, inv) => sum + inv.amount,
      0,
    );
    const totalEarnings = processedInvestments
      .filter((inv) => inv.status === "completed")
      .reduce((sum, inv) => sum + (inv.returnAmount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        active,
        history,
        statistics: {
          totalInvested,
          totalEarnings,
          activeCount: active.length,
          historyCount: history.length,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching user investments:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch investments",
      error: error.message,
    });
  }
};

// Create a new investment
export const createInvestment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId, amount } = req.body;

    // Validate plan
    const plan = INVESTMENT_PLANS.find((p) => p.id === planId);
    if (!plan) {
      throw new ApiError("Invalid investment plan", 400, "validation_error");
    }
    if (plan.isActive === false) {
      throw new ApiError(
        plan.deactivationReason || "This investment plan is unavailable.",
        400,
        "plan_inactive",
      );
    }

    // Validate amount
    if (
      !amount ||
      amount < plan.minAmount ||
      (plan.maxAmount && amount > plan.maxAmount)
    ) {
      throw new ApiError(
        `Investment amount must be between ${plan.minAmount} and ${plan.maxAmount || "unlimited"}`,
        400,
        "validation_error",
      );
    }

    // Check if user has enough balance
    const user = await User.findById(req.user._id).session(session);
    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }
    if (user.balance < amount) {
      throw new ApiError("Insufficient balance", 400, "insufficient_balance");
    }

    // Calculate investment details
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration);

    // Create investment
    const resolvedReturnRate = resolvePlanReturnRate(plan);
    const expectedReturn = calculateROIAmount(amount, plan);
    const investment = new Investment({
      user: user._id,
      planId: plan.id,
      amount: amount,
      returnRate: resolvedReturnRate,
      duration: plan.duration,
      startDate,
      endDate,
      status: "active",
    });

    await investment.save({ session });

    await User.findByIdAndUpdate(
      user._id,
      { $inc: { balance: -amount } },
      { session },
    );

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: "investment",
      amount: -amount,
      currency: "USD",
      status: "completed",
      method: "internal",
      description: `Investment in ${plan.name}`,
      reference: investment._id.toString(),
      processedAt: new Date(),
    });

    await transaction.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Investment created successfully",
      data: {
        ...investment.toObject(),
        id: investment._id,
        planName: plan.name,
        roi: plan.roi ?? resolvedReturnRate,
        roiAmount: expectedReturn,
        expectedReturn,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error creating investment:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get specific investment details
export const getInvestmentById = async (req, res, next) => {
  try {
    const investment = await Investment.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!investment) {
      throw new ApiError("Investment not found", 404, "not_found");
    }

    const plan = INVESTMENT_PLANS.find((p) => p.id === investment.planId);
    const resolvedReturnRate = resolvePlanReturnRate(plan, investment);

    res.status(200).json({
      success: true,
      data: {
        ...investment.toObject(),
        planName: plan?.name || "Unknown Plan",
        returnRate: resolvedReturnRate,
        roi: plan?.roi ?? resolvedReturnRate,
        roiAmount: calculateROIAmount(investment.amount, plan),
        expectedReturn: calculateROIAmount(investment.amount, plan),
      },
    });
  } catch (error) {
    logger.error(`Error fetching investment ${req.params.id}:`, error);
    next(error);
  }
};

// Update or create this function to handle statistics properly
export const getInvestmentStatistics = async (req, res) => {
  try {
    // Get the user ID from the authenticated user
    const userId = req.user.id;

    // Query investments for this user using the correct field name 'user'
    const investments = await Investment.find({ user: userId });

    // Calculate statistics
    const totalInvestments = investments.length;
    const activeInvestments = investments.filter(
      (inv) => inv.status === "active",
    ).length;
    const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
    const totalReturns = investments.reduce(
      (sum, inv) => sum + (inv.totalReturns || 0),
      0,
    );

    // Return statistics as an object
    res.status(200).json({
      success: true,
      data: {
        totalInvestments,
        activeInvestments,
        totalInvested,
        totalReturns,
        roi: totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching investment statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch investment statistics",
      error: error.message,
    });
  }
};

// Cancel investment function
export const cancelInvestment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    const investment = await Investment.findOne({
      _id: id,
      user: req.user._id,
      status: "active",
    }).session(session);

    if (!investment) {
      throw new ApiError("Active investment not found", 404, "not_found");
    }

    investment.status = "cancelled";
    await investment.save({ session });

    const refundAmount = investment.amount;

    await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { balance: refundAmount } },
      { session },
    );

    const transaction = new Transaction({
      user: req.user._id,
      type: "investment",
      amount: refundAmount,
      currency: "USD",
      status: "completed",
      method: "system",
      description: `Refund for cancelled investment: ${investment.planId}`,
      reference: investment._id.toString(),
      metadata: {
        action: "refund",
        investmentId: investment._id.toString(),
      },
      processedAt: new Date(),
    });

    await transaction.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Investment cancelled successfully",
      data: {
        refundAmount,
        investment,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error cancelling investment:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Withdraw investment function (early withdrawal)
export const withdrawInvestment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // Find the investment and ensure it belongs to the user
    const investment = await Investment.findOne({
      _id: id,
      user: req.user._id,
      status: "active",
    }).session(session);

    if (!investment) {
      throw new ApiError("Active investment not found", 404, "not_found");
    }

    const plan = INVESTMENT_PLANS.find((p) => p.id === investment.planId);
    const resolvedReturnRate = resolvePlanReturnRate(plan, investment);

    // Calculate current value based on time elapsed
    const currentDate = new Date();
    const startDate = new Date(investment.startDate);
    const endDate = new Date(investment.endDate);
    const totalDuration = endDate - startDate;
    const elapsedDuration = currentDate - startDate;
    const progressPercentage = Math.min(
      Math.max(elapsedDuration / totalDuration, 0),
      1,
    );

    // Calculate returns (pro-rated based on time invested)
    const principalAmount = investment.amount;
    const fullReturnAmount = calculateROIAmount(principalAmount, plan);
    const proRatedReturn = fullReturnAmount * progressPercentage;
    const withdrawalAmount = principalAmount + proRatedReturn;

    // Update investment status
    investment.status = "completed";
    investment.totalReturns = proRatedReturn;
    investment.returnRate = resolvedReturnRate;
    investment.endDate = currentDate;
    await investment.save({ session });

    // Add the withdrawal amount to user's balance
    await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { balance: withdrawalAmount } },
      { session },
    );

    // Create transaction record for the withdrawal
    const transaction = new Transaction({
      user: req.user._id,
      type: "investment",
      amount: withdrawalAmount,
      currency: "USD",
      status: "completed",
      method: "system",
      description: `Early withdrawal from investment: ${investment.planId} (principal + pro-rated returns)`,
      reference: investment._id.toString(),
      metadata: {
        action: "early_withdrawal",
        investmentId: investment._id.toString(),
      },
      processedAt: new Date(),
    });

    await transaction.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Investment withdrawn successfully",
      data: {
        principalAmount,
        returnAmount: proRatedReturn,
        totalAmount: withdrawalAmount,
        investment,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error withdrawing investment:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

export default {
  getInvestmentPlans,
  getInvestmentPlanById,
  getUserInvestments,
  createInvestment,
  getInvestmentById,
  getInvestmentStatistics,
  cancelInvestment,
  withdrawInvestment,
};
