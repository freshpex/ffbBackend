import Investment from "../models/Investment.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// Investment plans
const INVESTMENT_PLANS = [
  // {
  //   id: "mini-20",
  //   name: "Mini Saver - $20",
  //   minAmount: 20,
  //   maxAmount: 99,
  //   returnRate: 1,
  //   duration: 30,
  //   features: ["Low entry barrier", "Daily payouts", "Easy start"],
  //   description:
  //     "Perfect for beginners! Start your investment journey with just $20. Low risk with daily interest payouts. You will earn $0.20, everyday for every $20 invested over 30 days.",
  //   roi: 1,
  //   isActive: true,
  //   // deactivationReason:
  //   //   "This plan is temporarily unavailable while we rebalance high-risk micro-investments. Existing investors are protected and their funds remain safe.",
  // },
  // {
  //   id: "mini-50",
  //   name: "Mini Boost - $50",
  //   minAmount: 50,
  //   maxAmount: 99,
  //   returnRate: 2,
  //   duration: 40,
  //   features: ["low returns", "Daily payouts", "Low risk"],
  //   description:
  //     "Boost your savings with our $50 mini plan. Better interest rates with the same low-risk approach. You will earn $1, everyday for every $50 invested over 40 days.",
  //   roi: 2,
  //   isActive: true,
  //   // deactivationReason:
  //   //   "This plan is temporarily unavailable while we rebalance high-risk micro-investments. Existing investors are protected and their funds remain safe.",
  // },
  // {
  //   id: "mini-100",
  //   name: "Mini Boost - $100",
  //   minAmount: 100,
  //   maxAmount: 199,
  //   returnRate: 2,
  //   duration: 40,
  //   features: ["low returns", "Daily payouts", "Low risk"],
  //   description:
  //     "Boost your savings with our $100 mini plan. Better interest rates with the same low-risk approach. You will earn $2, everyday for every $100 invested over 40 days.",
  //   roi: 2,
  //   isActive: true,
  //   // deactivationReason:
  //   //   "This plan is temporarily unavailable while we rebalance high-risk micro-investments. Existing investors are protected and their funds remain safe.",
  // },
  // {
  //   id: "puppy-700",
  //   name: "Mini Boost - $700",
  //   minAmount: 700,
  //   maxAmount: 900,
  //   returnRate: 4,
  //   duration: 40,
  //   features: ["Better returns", "Daily payouts", "High risk"],
  //   description:
  //     "Boost your savings with our $700 mini plan. Better interest rates with the same low-risk approach. You will earn $28, everyday for every $700 invested over 40 days.",
  //   roi: 400,
  //   isActive: true,
  //   // deactivationReason:
  //   //   "This plan is temporarily unavailable while we rebalance high-risk micro-investments. Existing investors are protected and their funds remain safe.",
  // },
  {
    id: "basic",
    name: "Basic Plan",
    minAmount: 999,
    maxAmount: 10000,
    returnRate: 350,
    duration: 30,
    features: ["Lower risk", "Fixed returns", "Monthly payouts"],
    description:
      "Our entry-level investment plan designed for beginners. Start your investment journey with minimal risk and steady returns. You will earn $122.50, everyday for every $999 invested over 30 days.",
    roi: 350,
    isActive: true,
  },
  {
    id: "standard",
    name: "Standard Plan",
    minAmount: 10000,
    maxAmount: 50000,
    returnRate: 400,
    duration: 60,
    features: ["Moderate risk", "Higher returns", "Bi-weekly payouts"],
    description:
      "Balanced investment option for experienced investors looking for better returns with manageable risk levels. You will earn $160, everyday for every $10000 invested over 60 days.",
    roi: 400,
    isActive: true,
  },
  {
    id: "premium",
    name: "Premium Plan",
    minAmount: 50000,
    maxAmount: 250000,
    returnRate: 600,
    duration: 90,
    features: [
      "Strategic investments",
      "Premium returns",
      "Weekly payouts",
      "Priority support",
    ],
    description:
      "Our premium offering for serious investors. High returns with expert portfolio management and exclusive benefits. You will earn $3600, everyday for every $50000 invested over 90 days.",
    roi: 600,
    isActive: true,
  },
];

const resolvePlanReturnRate = (plan, investment) => {
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

// Get all investment plans
export const getInvestmentPlans = async (req, res) => {
  try {
    // Check if using database or static plans
    if (process.env.USE_DB_PLANS === "true") {
      // If using database, fetch from InvestmentPlan model
      const plans = await InvestmentPlan.find({ isActive: true });
      return res.status(200).json({
        success: true,
        data: plans,
      });
    } else {
      // Return the static INVESTMENT_PLANS constant
      return res.status(200).json({
        success: true,
        data: INVESTMENT_PLANS,
      });
    }
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
        const expectedReturn =
          (resolvedReturnRate / 100) * investment.amount;
        investmentObj.expectedReturn = expectedReturn;

        // Current value based on progress
        const proRatedReturn = expectedReturn * (progress / 100);
        investmentObj.currentValue = investment.amount + proRatedReturn;
      }
      // Completed investments, calculate return amount
      else if (investment.status === "completed") {
        investmentObj.returnAmount =
          investment.totalReturns ||
          (resolvedReturnRate / 100) * investment.amount;
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
      data: investment,
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
    const fullReturnAmount = (resolvedReturnRate / 100) * principalAmount;
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
