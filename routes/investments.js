import express from 'express';
import Investment from '../models/Investment.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';

const router = express.Router();

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
router.get('/plans', (req, res) => {
  res.status(200).json(INVESTMENT_PLANS);
});

// Get specific investment plan
router.get('/plans/:id', asyncHandler(async (req, res) => {
  const plan = INVESTMENT_PLANS.find(p => p.id === req.params.id);
  
  if (!plan) {
    return res.status(404).json({ message: 'Investment plan not found' });
  }
  
  res.status(200).json(plan);
}));

// Get user's investments
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { user: req.user._id };
    
    if (status) {
      query.status = status;
    }
    
    const investments = await Investment.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Investment.countDocuments(query);
    
    res.status(200).json({
      investments,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      total
    });
  } catch (error) {
    console.error('Error fetching investments:', error);
    res.status(500).json({ message: 'Server error' });
  }
}));

// Create a new investment
router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { planId, amount } = req.body;
    
    // Validate plan
    const plan = INVESTMENT_PLANS.find(p => p.id === planId);
    
    if (!plan) {
      return res.status(400).json({ message: 'Invalid investment plan' });
    }
    
    // Validate amount
    if (!amount || amount < plan.minAmount || (plan.maxAmount && amount > plan.maxAmount)) {
      return res.status(400).json({ 
        message: `Investment amount must be between ${plan.minAmount} and ${plan.maxAmount || 'unlimited'}`
      });
    }
    
    // Check if user has enough balance
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
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
    
    // Commit transaction
    await session.commitTransaction();
    
    res.status(201).json({
      message: 'Investment created successfully',
      investment: {
        id: investment._id,
        planId: investment.planId,
        planName: plan.name,
        amount: investment.amount,
        returnRate: investment.returnRate,
        duration: investment.duration,
        startDate: investment.startDate,
        endDate: investment.endDate,
        status: investment.status
      }
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating investment:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
});

// Get specific investment details
router.get('/:id', asyncHandler(async (req, res) => {
  const investment = await Investment.findOne({
    _id: req.params.id,
    user: req.user._id
  });
  
  if (!investment) {
    return res.status(404).json({ message: 'Investment not found' });
  }
  
  // Get plan details
  const plan = INVESTMENT_PLANS.find(p => p.id === investment.planId);
  
  res.status(200).json({
    ...investment.toObject(),
    planName: plan?.name || 'Unknown Plan'
  });
}));

export default router;
