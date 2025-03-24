import express from 'express';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get deposits
router.get('/deposits', async (req, res) => {
  try {
    const { status, from, to, limit = 10, page = 1 } = req.query;
    
    const query = { 
      user: req.user.userId,
      type: 'deposit'
    };
    
    if (status) {
      query.status = status;
    }
    
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const deposits = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments(query);
    
    res.status(200).json({
      deposits,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      total
    });
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get withdrawals
router.get('/withdrawals', async (req, res) => {
  try {
    const { status, from, to, limit = 10, page = 1 } = req.query;
    
    const query = { 
      user: req.user.userId,
      type: 'withdrawal'
    };
    
    if (status) {
      query.status = status;
    }
    
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const withdrawals = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments(query);
    
    res.status(200).json({
      withdrawals,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      total
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create deposit request
router.post('/deposit', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { amount, method, walletAddress, currency = 'USD' } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid deposit amount' });
    }
    
    if (!method) {
      return res.status(400).json({ message: 'Payment method is required' });
    }
    
    const transaction = new Transaction({
      user: req.user.userId,
      type: 'deposit',
      amount,
      currency,
      method,
      walletAddress,
      status: 'pending',
      description: `Deposit of ${amount} ${currency} via ${method}`
    });
    
    await transaction.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(201).json({
      message: 'Deposit request created successfully',
      transaction
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating deposit:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create withdrawal request
router.post('/withdraw', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { amount, method, walletAddress, currency = 'USD' } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid withdrawal amount' });
    }
    
    if (!method) {
      return res.status(400).json({ message: 'Withdrawal method is required' });
    }
    
    if (['bitcoin', 'ethereum', 'litecoin'].includes(method) && !walletAddress) {
      return res.status(400).json({ message: 'Wallet address is required for crypto withdrawals' });
    }
    
    // Check if user has sufficient balance
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    // Create withdrawal transaction
    const transaction = new Transaction({
      user: req.user.userId,
      type: 'withdrawal',
      amount,
      currency,
      method,
      walletAddress,
      status: 'pending',
      description: `Withdrawal of ${amount} ${currency} via ${method}`
    });
    
    await transaction.save({ session });
    
    // Update user balance
    await User.findByIdAndUpdate(
      req.user.userId,
      { $inc: { balance: -amount } },
      { session }
    );
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(201).json({
      message: 'Withdrawal request created successfully',
      transaction
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error creating withdrawal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single transaction
router.get('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user.userId
    });
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    res.status(200).json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel pending transaction
router.post('/:id/cancel', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user.userId,
      status: 'pending'
    });
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found or cannot be cancelled' });
    }
    
    // For withdrawals, return funds to user balance
    if (transaction.type === 'withdrawal') {
      await User.findByIdAndUpdate(
        req.user.userId,
        { $inc: { balance: transaction.amount } },
        { session }
      );
    }
    
    transaction.status = 'cancelled';
    await transaction.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      message: 'Transaction cancelled successfully',
      transaction
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error cancelling transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
