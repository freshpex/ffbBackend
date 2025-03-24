import express from 'express';
import mongoose from 'mongoose';
import Investment from '../models/Investment.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();

// Investment plans available
const INVESTMENT_PLANS = [
  {
    id: 'starter',
    name: 'Starter Plan',
    minAmount: 100,
    maxAmount: 999,
    weeklyROI: 1.5, // 1.5% weekly
    duration: 30, // 30 days
    description: 'Perfect for beginners, low risk with steady returns'
  },
  {
    id: 'standard',
    name: 'Standard Plan',
    minAmount: 1000,
    maxAmount: 9999,
    weeklyROI: 2.0, // 2.0% weekly
    duration: 60, // 60 days
    description: 'Our most popular plan with balanced risk and returns'
  },
  {
    id: 'premium',
    name: 'Premium Plan',
    minAmount: 10000,
    maxAmount: 49999,
    weeklyROI: 2.5, // 2.5% weekly
    duration: 90, // 90 days
    description: 'Higher returns for experienced investors'
  },
  {
    id: 'vip',
    name: 'VIP Plan',
    minAmount: 50000,
    maxAmount: null, // No upper limit
    weeklyROI: 3.0, // 3.0% weekly
    duration: 120, // 120 days
    description: 'Our most exclusive plan with highest possible returns'
  }
];

// Get all available investment plans
router.get('/plans', (req, res) => {
  res.status(200).json({ plans: INVESTMENT_PLANS });
});

// Get all investments for a user
router.get('/', async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.user.userId })
      .sort({ createdAt: -1 });
    
    res.status(200).json({ investments });
  } catch (error) {
    console.error('Error fetching investments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

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
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    // Calculate end date
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration);
    
    // Create investment
    const investment = new Investment({
      user: req.user.userId,
      plan: planId,
      amount,
      startDate,
      endDate,
      status: 'active',
      weeklyROI: plan.weeklyROI
    });
    
    await investment.save({ session });
    
    // Deduct from user balance
    await User.findByIdAndUpdate(
      req.user.userId,
      { $inc: { balance: -amount } },
      { session }
    );
    
    // Create transaction record
    const transaction = new Transaction({
      user: req.user.userId,
      type: 'investment',
      amount,
      method: 'internal',
      status: 'completed',
      description: `Investment in ${plan.name}`
    });
    
    await transaction.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(201).json({
      message: 'Investment created successfully',
      investment
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating investment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a specific investment
router.get('/:id', async (req, res) => {
  try {
    const investment = await Investment.findOne({
      _id: req.params.id,
      user: req.user.userId
    });
    
    if (!investment) {
      return res.status(404).json({ message: 'Investment not found' });
    }
    
    res.status(200).json(investment);
  } catch (error) {
    console.error('Error fetching investment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Withdraw investment (early termination)
router.post('/:id/withdraw', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const investment = await Investment.findOne({
      _id: req.params.id,
      user: req.user.userId,
      status: 'active'
    });
    
    if (!investment) {
      return res.status(404).json({ message: 'Active investment not found' });
    }
    
    const today = new Date();
    const startDate = new Date(investment.startDate);
    const endDate = new Date(investment.endDate);
    
    // Calculate how many days the investment has been active
    const daysActive = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Calculate penalty for early withdrawal (25% of initial amount)
    const isEarly = today < endDate;
    const penalty = isEarly ? investment.amount * 0.25 : 0;
    
    // Calculate returns earned so far
    const weeklyRateDecimal = investment.weeklyROI / 100;
    const dailyRate = weeklyRateDecimal / 7;
    const earnedInterest = investment.amount * dailyRate * daysActive;
    
    // Calculate final amount to return to user
    const finalAmount = investment.amount + earnedInterest - penalty;
    
    // Update investment status
    investment.status = 'completed';
    investment.totalEarned = earnedInterest;
    await investment.save({ session });
    
    // Add funds back to user balance
    await User.findByIdAndUpdate(
      req.user.userId,
      { $inc: { balance: finalAmount } },
      { session }
    );
    
    // Create transaction record
    const transaction = new Transaction({
      user: req.user.userId,
      type: 'interest',
      amount: finalAmount,
      method: 'internal',
      status: 'completed',
      description: isEarly ? 
        `Early withdrawal of investment (${daysActive} days) with penalty` : 
        `Completed investment with full returns (${daysActive} days)`
    });
    
    await transaction.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      message: 'Investment withdrawn successfully',
      details: {
        initialAmount: investment.amount,
        daysActive,
        earnedInterest,
        penalty,
        finalAmount
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error withdrawing investment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
