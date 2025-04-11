import Investment from '../models/Investment.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Investment plans
const INVESTMENT_PLANS = [
  {
    id: 'basic',
    name: 'Basic Plan',
    minAmount: 1000,
    maxAmount: 10000,
    returnRate: 0.05,
    duration: 30,
    features: ['Lower risk', 'Fixed returns', 'Monthly payouts'],
    description: 'Our entry-level investment plan designed for beginners. Start your investment journey with minimal risk and steady returns.',
    roi: 5
  },
  {
    id: 'standard',
    name: 'Standard Plan',
    minAmount: 10000,
    maxAmount: 50000,
    returnRate: 0.08,
    duration: 60,
    features: ['Moderate risk', 'Higher returns', 'Bi-weekly payouts'],
    description: 'Balanced investment option for experienced investors looking for better returns with manageable risk levels.',
    roi: 8
  },
  {
    id: 'premium',
    name: 'Premium Plan',
    minAmount: 50000,
    maxAmount: 250000,
    returnRate: 0.12,
    duration: 90,
    features: ['Strategic investments', 'Premium returns', 'Weekly payouts', 'Priority support'],
    description: 'Our premium offering for serious investors. High returns with expert portfolio management and exclusive benefits.',
    roi: 12
  }
];

// Get all investment plans
export const getInvestmentPlans = async (req, res) => {
  try {
    // Check if using database or static plans
    if (process.env.USE_DB_PLANS === 'true') {
      // If using database, fetch from InvestmentPlan model
      const plans = await InvestmentPlan.find({ isActive: true });
      return res.status(200).json({
        success: true,
        data: plans
      });
    } else {
      // Return the static INVESTMENT_PLANS constant
      return res.status(200).json({
        success: true,
        data: INVESTMENT_PLANS
      });
    }
  } catch (error) {
    console.error('Error fetching investment plans:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch investment plans',
      error: error.message
    });
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

export const getUserInvestments = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const investments = await Investment.find({ userId })
      .sort({ createdAt: -1 })
      .populate('planId');
    
    // Separate active and completed investments
    const active = investments.filter(inv => 
      inv.status === 'active' || inv.status === 'pending'
    );
    
    const history = investments.filter(inv => 
      inv.status === 'completed' || inv.status === 'cancelled'
    );
    
    // Calculate statistics
    const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
    const totalEarnings = investments
      .filter(inv => inv.status === 'completed')
      .reduce((sum, inv) => sum + (inv.earnings || 0), 0);
    
    return res.status(200).json({
      success: true,
      data: {
        active,
        history,
        statistics: {
          totalInvested,
          totalEarnings,
          activeCount: active.length,
          historyCount: history.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user investments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch investments',
      error: error.message
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

    await User.findByIdAndUpdate(
      user._id,
      { $inc: { balance: -amount } },
      { session }
    );

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

// Update or create this function to handle statistics properly
export const getInvestmentStatistics = async (req, res) => {
  try {
    // Get the user ID from the authenticated user 
    const userId = req.user.id;
    
    // Query investments for this user
    const investments = await Investment.find({ userId });
    
    // Calculate statistics
    const totalInvestments = investments.length;
    const activeInvestments = investments.filter(inv => inv.status === 'active').length;
    const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
    const totalReturns = investments.reduce((sum, inv) => sum + (inv.returns || 0), 0);
    
    // Return statistics as an object
    res.status(200).json({
      success: true,
      data: {
        totalInvestments,
        activeInvestments,
        totalInvested,
        totalReturns,
        roi: totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0,
      }
    });
  } catch (error) {
    console.error('Error fetching investment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch investment statistics',
      error: error.message
    });
  }
};

export default {
  getInvestmentPlans,
  getInvestmentPlanById,
  getUserInvestments,
  createInvestment,
  getInvestmentById,
  getInvestmentStatistics
};
