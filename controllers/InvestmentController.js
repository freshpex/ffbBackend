import Investment from '../models/Investment.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Investment plans
const INVESTMENT_PLANS = [
  {
    id: 'starter',
    name: 'Starter Plan',
    description: 'A low-risk investment plan for beginners',
    minAmount: 100,
    maxAmount: 5000,
    roi: 0.5, // 0.5% daily
    duration: 30, // days
    payoutFrequency: 'daily'
  },
  {
    id: 'growth',
    name: 'Growth Plan',
    description: 'Medium-risk plan with higher returns',
    minAmount: 1000,
    maxAmount: 15000,
    roi: 0.8, // 0.8% daily
    duration: 45, // days
    payoutFrequency: 'daily'
  },
  {
    id: 'premium',
    name: 'Premium Plan',
    description: 'Higher risk premium plan for maximum returns',
    minAmount: 5000,
    maxAmount: 50000,
    roi: 1.2, // 1.2% daily
    duration: 60, // days
    payoutFrequency: 'daily'
  },
  {
    id: 'vip',
    name: 'VIP Plan',
    description: 'Exclusive high-return plan for VIP investors',
    minAmount: 25000,
    roi: 1.5, // 1.5% daily
    duration: 90, // days
    payoutFrequency: 'daily'
  }
];

// Get all investment plans
export const getInvestmentPlans = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: INVESTMENT_PLANS
    });
  } catch (error) {
    logger.error('Error fetching investment plans:', error);
    next(error);
  }
};

// Get specific investment plan
export const getInvestmentPlanById = async (req, res, next) => {
  try {
    const plan = INVESTMENT_PLANS.find(p => p.id === req.params.id);
    if (!plan) {
      throw new ApiError('Investment plan not found', 404, 'not_found');
    }
    res.status(200).json({
      success: true,
      data: plan
    });
  } catch (error) {
    logger.error(`Error fetching investment plan ${req.params.id}:`, error);
    next(error);
  }
};

// Get user's investments
export const getUserInvestments = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { user: req.user._id };
    if (status) query.status = status;

    const total = await Investment.countDocuments(query);
    const investments = await Investment.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        investments,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user investments:', error);
    next(error);
  }
};

// Create a new investment
export const createInvestment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { planId, amount } = req.body;

    // Validate plan
    const plan = INVESTMENT_PLANS.find(p => p.id === planId);
    if (!plan) {
      throw new ApiError('Invalid investment plan', 400, 'validation_error');
    }

    // Validate amount
    if (!amount || amount < plan.minAmount || (plan.maxAmount && amount > plan.maxAmount)) {
      throw new ApiError(
        `Investment amount must be between ${plan.minAmount} and ${plan.maxAmount || 'unlimited'}`,
        400,
        'validation_error'
      );
    }

    // Check if user has enough balance
    const user = await User.findById(req.user._id).session(session);
    if (!user) {
      throw new ApiError('User not found', 404, 'not_found');
    }
    if (user.balance < amount) {
      throw new ApiError('Insufficient balance', 400, 'insufficient_balance');
    }

    // Calculate investment details
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration);

    // Create investment
    const investment = new Investment({
      user: user._id,
      planId: plan.id,
      amount: amount,
      returnRate: plan.roi,
      duration: plan.duration,
      startDate,
      endDate,
      status: 'active'
    });

    await investment.save({ session });

    // Deduct amount from user balance
    user.balance -= amount;
    await user.save({ session });

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: 'investment',
      amount: -amount,
      currency: 'USD',
      status: 'completed',
      method: 'internal',
      description: `Investment in ${plan.name}`,
      reference: investment._id.toString(),
      processedAt: new Date()
    });

    await transaction.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: 'Investment created successfully',
      data: investment
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating investment:', error);
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
      user: req.user._id
    });

    if (!investment) {
      throw new ApiError('Investment not found', 404, 'not_found');
    }

    const plan = INVESTMENT_PLANS.find(p => p.id === investment.planId);

    res.status(200).json({
      success: true,
      data: {
        ...investment.toObject(),
        planName: plan?.name || 'Unknown Plan'
      }
    });
  } catch (error) {
    logger.error(`Error fetching investment ${req.params.id}:`, error);
    next(error);
  }
};

export default {
  getInvestmentPlans,
  getInvestmentPlanById,
  getUserInvestments,
  createInvestment,
  getInvestmentById
};
